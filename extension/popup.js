const $ = (id) => document.getElementById(id);

// subjects: [{ subject, present, absent, unmarked, unknown }]
let state = { min: 75, subjects: [], source: "", summary: null, dashAbsent: true, mergeLabs: false };

const save = () => chrome.storage.local.set({ state });
const plural = (n, w) => `${n} ${w}${n === 1 ? "" : "es"}`;
const sum = (key) => state.subjects.reduce((s, x) => s + (x[key] || 0), 0);
const totalOf = (x) => x.present + x.absent + (state.dashAbsent ? x.unmarked : 0);

function verdict(s) {
  if (s.safe) {
    return s.canSkip === 0
      ? { cls: "ok", text: "At the limit, don't skip" }
      : { cls: "ok", text: `Can skip ${plural(s.canSkip, "class")}` };
  }
  return { cls: "bad", text: `Attend next ${plural(s.mustAttend, "class")}` };
}

function groups() {
  if (!state.mergeLabs) return state.subjects.map((x, i) => ({ ...x, idx: [i] }));
  const m = new Map();
  state.subjects.forEach((x, i) => {
    const key = x.subject.replace(/\s+lab(\s*\d+)?$/i, "").trim();
    if (!m.has(key)) m.set(key, { subject: key, present: 0, absent: 0, unmarked: 0, unknown: 0, idx: [] });
    const g = m.get(key);
    ["present", "absent", "unmarked", "unknown"].forEach((k) => (g[k] += x[k] || 0));
    g.idx.push(i);
  });
  return [...m.values()];
}

function renderCheck() {
  const el = $("check");
  const s = state.summary;
  const P = sum("present"), U = sum("unmarked"), K = sum("unknown");
  const T = state.subjects.reduce((a, x) => a + totalOf(x), 0);
  const parts = [];
  if (s && s.attended != null) {
    if (s.attended === P && s.counted === T) {
      parts.push(`Matches the portal's ${s.attended}/${s.counted} ✓`);
    } else {
      parts.push(
        `Portal's overall figure is ${s.attended}/${s.counted}; counting every lecture on the list gives ${P}/${T}.` +
        (T > s.counted ? ` The portal leaves ${T - s.counted} lecture(s) out of its total, so its overall % may differ slightly.` : "")
      );
    }
  }
  if (U) parts.push(`${U} lecture(s) missed (“–” or only watched the recording).`);
  if (K) parts.push(`${K} lecture(s) had an icon I couldn't read and are left out.`);
  el.textContent = parts.join(" ");
}

function render() {
  $("min").value = state.min;
  $("dashAbsent").checked = state.dashAbsent;
  $("mergeLabs").checked = state.mergeLabs;
  $("options").hidden = !state.subjects.length;
  const list = $("list");
  list.innerHTML = "";
  renderCheck();

  if (!state.subjects.length) { $("overall").hidden = true; return; }

  let A = 0, T = 0;
  for (const g of groups()) {
    const total = totalOf(g);
    if (total === 0) continue;
    A += g.present; T += total;
    const s = attendanceStats(g.present, total, state.min);
    const v = verdict(s);
    const merged = g.idx.length > 1;

    const li = document.createElement("li");
    li.className = "item";
    li.innerHTML = `
      <span class="name"></span>
      <span class="pct ${v.cls}">${s.percent.toFixed(1)}%</span>
      <span class="counts">
        <input type="number" min="0" data-k="attended" value="${g.present}" ${merged ? "disabled" : ""}> /
        <input type="number" min="1" data-k="total" value="${total}" ${merged ? "disabled" : ""}>
        <button class="remove" title="Remove">✕</button>
      </span>
      <span class="badge ${v.cls}">${v.text}</span>`;
    li.querySelector(".name").textContent = g.subject; // textContent: page text is untrusted
    li.querySelector(".name").title = g.subject;

    if (!merged) {
      const sub = state.subjects[g.idx[0]];
      li.querySelectorAll("input").forEach((inp) =>
        inp.addEventListener("change", () => {
          const [a, t] = [...li.querySelectorAll("input")].map((x) => Math.max(0, parseInt(x.value, 10) || 0));
          const tot = Math.max(1, t);
          Object.assign(sub, { present: Math.min(a, tot), absent: tot - Math.min(a, tot), unmarked: 0, unknown: 0 });
          save(); render();
        })
      );
    }
    li.querySelector(".remove").addEventListener("click", () => {
      state.subjects = state.subjects.filter((_, i) => !g.idx.includes(i));
      save(); render();
    });
    list.appendChild(li);
  }

  const o = attendanceStats(A, T, state.min);
  const v = verdict(o);
  const ov = $("overall");
  ov.hidden = false;
  ov.innerHTML = `
    <div>Overall</div>
    <div class="big ${v.cls}">${o.percent.toFixed(2)}%</div>
    <div>${A} of ${T} classes attended</div>
    <div class="${v.cls}"><strong>${
      o.safe
        ? `You can skip ${plural(o.canSkip, "class")} and stay at or above ${state.min}%`
        : `You need to attend the next ${plural(o.mustAttend, "class")} to reach ${state.min}%`
    }</strong></div>`;
}

// Decide whether "–" lectures count as absent by matching the portal's own "X/Y Attended" total.
function autoDash(res) {
  const s = res.summary;
  if (!s || s.counted == null) return true;
  const total = (k) => res.subjects.reduce((a, x) => a + x[k], 0);
  const PA = total("present") + total("absent");
  if (PA === s.counted) return false;
  if (PA + total("unmarked") === s.counted) return true;
  return true; // can't tell: assume the worst so you never skip a class you can't afford to
}

async function scan() {
  const status = $("status");
  status.textContent = "Scanning… (scrolling through the list to load every lecture, this can take a few seconds)";
  $("scan").disabled = true;
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    const target = { tabId: tab.id, allFrames: true }; // portals often put content in iframes
    await chrome.scripting.executeScript({ target, files: ["scraper.js"] });
    const results = await chrome.scripting.executeScript({ target, func: () => window.__attScan() });
    const found = results
      .map((r) => r.result)
      .filter((r) => r && r.subjects && r.subjects.length)
      .sort((a, b) => b.subjects.length - a.subjects.length)[0];

    if (!found) {
      status.textContent = "No attendance found on this page. Open the page that lists your lectures or attendance, or add subjects by hand below.";
      return;
    }
    state.subjects = found.subjects;
    state.summary = found.summary || null;
    state.source = found.title || found.url;
    if (found.mode === "lectures") state.dashAbsent = autoDash(found);
    status.textContent =
      found.mode === "lectures"
        ? `Read ${found.rows} lectures across ${found.subjects.length} subjects.`
        : `Found ${found.subjects.length} subject(s). Edit any number if it was read wrong.`;
    save(); render();
  } catch (e) {
    status.textContent = "Couldn't read this page (" + e.message + "). Chrome blocks extensions on some pages like chrome:// and the Web Store.";
  } finally {
    $("scan").disabled = false;
  }
}

$("scan").addEventListener("click", scan);
$("min").addEventListener("change", () => {
  const v = parseInt($("min").value, 10);
  state.min = v >= 1 && v <= 99 ? v : 75;
  save(); render();
});
$("dashAbsent").addEventListener("change", (e) => { state.dashAbsent = e.target.checked; save(); render(); });
$("mergeLabs").addEventListener("change", (e) => { state.mergeLabs = e.target.checked; save(); render(); });
$("addForm").addEventListener("submit", (e) => {
  e.preventDefault();
  const total = Math.max(1, parseInt($("mTotal").value, 10) || 1);
  const present = Math.min(total, Math.max(0, parseInt($("mAttended").value, 10) || 0));
  state.subjects.push({ subject: $("mSubject").value.trim() || "Subject", present, absent: total - present, unmarked: 0, unknown: 0 });
  e.target.reset(); save(); render();
});
$("clear").addEventListener("click", () => {
  state = { ...state, subjects: [], source: "", summary: null };
  save(); render();
  $("status").textContent = "Cleared.";
});

chrome.storage.local.get("state", (d) => {
  if (d.state) {
    state = { ...state, ...d.state };
    // data saved by v1 used { attended, total }
    state.subjects = state.subjects.map((x) =>
      x.present === undefined
        ? { subject: x.subject, present: x.attended, absent: x.total - x.attended, unmarked: 0, unknown: 0 }
        : x
    );
  }
  if (state.subjects.length) $("status").textContent = `Last scan: ${state.source || "saved data"}. Click Scan to refresh.`;
  render();
});
