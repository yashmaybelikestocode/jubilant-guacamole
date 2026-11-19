// Injected into the portal page (every frame). Defines window.__attScan(), which the popup calls.
// Two strategies:
//   1. Lecture list (e.g. NST portal): one row per lecture with a "Subject - Section • Date • Duration"
//      line and an icon in the ATTENDANCE column. Rows are grouped by subject and counted.
//   2. Summary table: a <table> with attended / total columns per subject.
// Returns { mode, subjects: [{ subject, present, absent, unmarked, unknown }], summary, notes }.
(() => {
  if (window.__attScan) return;

  const clean = (s) => (s || "").replace(/\s+/g, " ").trim();
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const visible = (el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; };

  // ---------------------------------------------------------------- lecture list
  // Each lecture has a line "PSP - A • Nov 18, 2026 • 1:30:00". On the NST portal the three parts are
  // separate <div>s and the dots are empty styled divs, so we find the date and take the text before it.
  const DATE_RE = /[A-Z][a-z]{2,8}\.? \d{1,2},? \d{4}/;

  function findHeader(re) {
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    let n;
    while ((n = walker.nextNode())) {
      if (re.test(clean(n.nodeValue)) && n.parentElement && visible(n.parentElement)) return n.parentElement;
    }
    return null;
  }

  function attendanceColumn() {
    const att = findHeader(/^attendance$/i);
    if (!att) return null;
    const a = att.getBoundingClientRect();
    const xp = findHeader(/^xp\s*earned$/i);
    // Keep the column tight: on rows without "2x" the XP coin slides left toward this column.
    const right = Math.min(xp ? xp.getBoundingClientRect().left - 4 : Infinity, a.right + 40);
    return { left: a.left - 60, right: Math.max(right, a.right) };
  }

  function textParts(el) {
    const parts = [];
    const w = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    let n;
    while ((n = w.nextNode())) {
      const t = clean(n.nodeValue);
      if (t && !/^[•·|]+$/.test(t)) parts.push(t);
    }
    return parts;
  }

  // Returns [{ el, subject }] for every lecture's subject/date line.
  function metaElements() {
    const found = new Map();
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    let n;
    while ((n = walker.nextNode())) {
      if (!DATE_RE.test(n.nodeValue)) continue;
      let el = n.parentElement;
      for (let i = 0; el && i < 3; i++, el = el.parentElement) {
        if (clean(el.textContent).length > 250) break;
        const parts = textParts(el);
        const di = parts.findIndex((p) => DATE_RE.test(p));
        if (di < 0) break;
        const before = clean(parts[di].split(DATE_RE)[0].replace(/[•·|]\s*$/, ""));
        const subject = before || (di > 0 ? parts[di - 1].replace(/[•·|]\s*$/, "") : "");
        // must also have a duration after the date, so random dates elsewhere on the page are ignored
        const rest = parts.slice(di).join(" ").replace(DATE_RE, "");
        if (subject && /\d{1,2}:\d{2}/.test(rest)) { found.set(el, clean(subject)); break; }
      }
    }
    const els = [...found.keys()];
    return els
      .filter((el) => !els.some((o) => o !== el && el.contains(o))) // innermost only
      .map((el) => ({ el, subject: found.get(el) }));
  }

  function rowOf(metaEl, col, allMeta) {
    let el = metaEl, best = metaEl;
    while (el.parentElement && el.parentElement !== document.body) {
      const p = el.parentElement;
      if (allMeta.some((m) => m.el !== metaEl && p.contains(m.el))) break; // went past this row
      best = p;
      const r = p.getBoundingClientRect();
      if (col ? r.right >= col.right && r.left <= col.left : r.width > window.innerWidth * 0.6) break;
      el = p;
    }
    return best;
  }

  function colorVerdict(el) {
    const els = [el, ...el.querySelectorAll("*")].slice(0, 20);
    for (const e of els) {
      const cs = getComputedStyle(e);
      for (const v of [cs.stroke, cs.fill, cs.color]) {
        const m = v && v.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?/);
        if (!m || (m[4] !== undefined && +m[4] === 0)) continue;
        const [r, g, b] = [+m[1], +m[2], +m[3]];
        if (g > r + 30 && g >= b) return "present";
        if (r > g + 50 && r > b + 30) return "absent";
      }
    }
    return null;
  }

  function keywordVerdict(el) {
    const bits = [el.getAttribute("aria-label"), el.getAttribute("title"), el.getAttribute("alt"),
      el.getAttribute("class"), el.getAttribute("src"), el.getAttribute("data-testid"),
      el.querySelector("title")?.textContent, el.querySelector("use")?.getAttribute("href"),
      el.closest("[title]")?.getAttribute("title"), el.closest("[aria-label]")?.getAttribute("aria-label")];
    const s = bits.filter(Boolean).join(" ").toLowerCase();
    if (/absent|cross|close|x-?circle|xmark|wrong|cancel|missed|not.?attended/.test(s)) return "absent";
    // NST shows "Watched" when you only watched the recording: you weren't marked present.
    if (/watched|recording/.test(s)) return "unmarked";
    if (/present|check|tick|attended|success|verified|done/.test(s)) return "present";
    return null;
  }

  function verdictForRow(row, col) {
    const inCol = (el) => {
      if (!col) return true;
      const r = el.getBoundingClientRect();
      const cx = (r.left + r.right) / 2;
      return r.width > 0 && cx >= col.left && cx <= col.right;
    };
    // icons (NST: <div role="img" aria-label="Attended"><i class="...check-badge"></i></div>)
    let sawIcon = false;
    for (const icon of row.querySelectorAll("svg, img, i, [role=img], [aria-label]")) {
      if (icon.parentElement?.closest("svg") || !inCol(icon)) continue;
      if (/xp|coin/i.test(icon.getAttribute("alt") || icon.getAttribute("aria-label") || "")) continue;
      const v = keywordVerdict(icon) || colorVerdict(icon);
      if (v) return v;
      sawIcon = true;
    }
    // text markers
    for (const el of row.querySelectorAll("*")) {
      if (el.childElementCount || !inCol(el)) continue;
      const t = clean(el.textContent);
      if (/^[-–—]$/.test(t)) return "unmarked";
      if (/^(p|present|attended|yes)$/i.test(t)) return "present";
      if (/^(a|absent|no)$/i.test(t)) return "absent";
    }
    if (sawIcon) return "unknown";
    // NST draws the "–" for a missed lecture with CSS, so the cell is simply empty.
    return col ? "unmarked" : null;
  }

  function harvest(into) {
    const col = attendanceColumn();
    const metas = metaElements();
    // Keyed by the row element: the list appends rows as you scroll, so each lecture is counted once.
    for (const m of metas) {
      const row = rowOf(m.el, col, metas);
      if (into.has(row)) continue;
      const v = verdictForRow(row, col);
      if (!v) continue;
      const subject = m.subject.replace(/\s+-\s+[A-Za-z0-9]{1,3}$/, "");
      into.set(row, { subject, v });
    }
    return metas.length;
  }

  function scrollTargets() {
    const out = [document.scrollingElement || document.documentElement];
    for (const el of document.querySelectorAll("div, main, section, ul")) {
      const cs = getComputedStyle(el);
      if (/(auto|scroll)/.test(cs.overflowY) && el.scrollHeight > el.clientHeight + 50) out.push(el);
    }
    return out;
  }

  async function scanLectures() {
    const rows = new Map();
    if (harvest(rows) === 0) return null;

    const text = document.body.innerText;
    const lectures = +(text.match(/(\d+)\s+lectures?\b/i) || [])[1] || null;
    const sm = text.match(/(\d+)\s*\/\s*(\d+)\s*attended/i);
    const summary = { lectures, attended: sm ? +sm[1] : null, counted: sm ? +sm[2] : null };

    // The list loads more rows as you scroll: keep scrolling until nothing new appears.
    const targets = scrollTargets();
    const saved = targets.map((t) => t.scrollTop);
    let stable = 0;
    for (let i = 0; i < 80 && stable < 3; i++) {
      if (lectures && rows.size >= lectures) break;
      const before = rows.size;
      targets.forEach((t) => (t.scrollTop = t.scrollHeight));
      window.scrollTo(0, document.body.scrollHeight);
      for (const b of document.querySelectorAll("button, a, [role=button]")) {
        if (/^(load|show|view) more/i.test(clean(b.textContent)) && visible(b)) b.click();
      }
      await sleep(700);
      harvest(rows);
      stable = rows.size === before ? stable + 1 : 0;
    }
    targets.forEach((t, i) => (t.scrollTop = saved[i]));

    const bySubject = new Map();
    for (const { subject, v } of rows.values()) {
      if (!bySubject.has(subject)) bySubject.set(subject, { subject, present: 0, absent: 0, unmarked: 0, unknown: 0 });
      bySubject.get(subject)[v]++;
    }
    return { mode: "lectures", rows: rows.size, summary, subjects: [...bySubject.values()] };
  }

  // ---------------------------------------------------------------- summary table
  const num = (s) => { const m = clean(s).replace(/,/g, "").match(/-?\d+(\.\d+)?/); return m ? parseFloat(m[0]) : NaN; };
  const fraction = (s) => { const m = clean(s).match(/(\d+)\s*(?:\/|out of|of)\s*(\d+)/i); return m ? { a: +m[1], t: +m[2] } : null; };

  function classify(header) {
    const h = header.toLowerCase();
    if (!h) return null;
    if (/%|percent|percentage/.test(h)) return "percent";
    if (/absent|missed|bunk/.test(h)) return "absent";
    if (/attend|present|presence/.test(h) && !/total\s*(classes|lectures|sessions|periods)/.test(h)) return "attended";
    if (/total|delivered|conducted|held|lectures|classes|sessions|periods|count/.test(h)) return "total";
    if (/code/.test(h) && !/name|title/.test(h)) return "code";
    if (/subject|course|paper|module|name|title/.test(h)) return "subject";
    return null;
  }

  function cellsOf(row) {
    const out = [];
    for (const c of row.cells) {
      const span = Math.max(1, Math.min(c.colSpan || 1, 10));
      for (let i = 0; i < span; i++) out.push(clean(c.innerText || c.textContent));
    }
    return out;
  }

  function parseTable(table) {
    const rows = Array.from(table.rows);
    if (rows.length < 2) return [];
    let headerIdx = -1, cols = null;
    for (let i = 0; i < Math.min(rows.length, 5); i++) {
      const map = {};
      cellsOf(rows[i]).forEach((text, idx) => {
        const kind = classify(text);
        if (kind && map[kind] === undefined) map[kind] = idx;
      });
      if (map.attended !== undefined || map.total !== undefined) { headerIdx = i; cols = map; break; }
    }
    if (!cols) return [];

    const results = [];
    for (const row of rows.slice(headerIdx + 1)) {
      const cells = cellsOf(row);
      if (cells.length < 2) continue;
      const get = (k) => (cols[k] !== undefined ? cells[cols[k]] : undefined);
      let attended, total;
      const packed = fraction(get("attended") || "") || fraction(get("total") || "");
      if (packed) { attended = packed.a; total = packed.t; }
      else {
        attended = num(get("attended")); total = num(get("total"));
        const absent = num(get("absent"));
        if (isNaN(total) && !isNaN(attended) && !isNaN(absent)) total = attended + absent;
        if (isNaN(attended) && !isNaN(total) && !isNaN(absent)) attended = total - absent;
        if (isNaN(attended) && !isNaN(total)) { const pct = num(get("percent")); if (!isNaN(pct)) attended = Math.round((pct / 100) * total); }
      }
      if (isNaN(attended) || isNaN(total) || total <= 0 || attended < 0 || attended > total) continue;
      let subject = get("subject") || get("code");
      if (!subject || /^\d+$/.test(subject)) subject = cells.find((c) => c && !/^[\d.\s%/]+$/.test(c));
      subject = clean(subject) || `Row ${results.length + 1}`;
      if (/^(grand\s*)?total|overall|aggregate/i.test(subject)) continue;
      results.push({ subject: subject.slice(0, 80), present: attended, absent: total - attended, unmarked: 0, unknown: 0 });
    }
    return results;
  }

  function scanTables() {
    let best = [];
    for (const t of document.querySelectorAll("table")) {
      const r = parseTable(t);
      if (r.length > best.length) best = r;
    }
    return best.length ? { mode: "table", subjects: best } : null;
  }

  window.__attScan = async () => {
    const res = (await scanLectures()) || scanTables() || { mode: "none", subjects: [] };
    return { ...res, url: location.href, title: document.title };
  };
})();
