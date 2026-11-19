# Attendance Calculator — Chrome extension

See your attendance **for every subject**, and know exactly how many classes you can skip
(or must attend) to stay above **75%**.

Built for the Newton School of Technology (NST) portal's **Lectures** page, which only shows one overall
number. It also works on portals that show a normal attendance table.

| Subject | Attended | % | |
|---|---|---|---|
| Maths I | 20/22 | 90.9% | ✅ Can skip 4 classes |
| PSP | 18/25 | 72.0% | 🔴 Attend next 3 classes |

## Install (2 minutes)

Chrome only installs extensions with one click from the Chrome Web Store, so this one is added manually:

1. **[Download attendance-calculator.zip](https://github.com/yashmaybelikestocode/jubilant-guacamole/releases/latest/download/attendance-calculator.zip)**
2. **Unzip it.** You'll get a folder called `attendance-calculator`. Keep it somewhere it won't get
   deleted (not in Downloads if you clean that out), since Chrome loads the extension from this folder.
3. Open **`chrome://extensions`** in Chrome.
4. Turn on **Developer mode** (top-right switch).
5. Click **Load unpacked** and select the `attendance-calculator` folder.
6. Click the puzzle-piece icon in the toolbar and **pin** Attendance Calculator.

Works in Chrome, Edge, Brave, and other Chromium browsers (in Edge the page is `edge://extensions`).

**To update:** download the new zip, replace the folder's contents, then click ⟳ on the extension in
`chrome://extensions`.

## Use

1. Log in to your portal and open the **Lectures** page (the one showing "83% · 100/121 Attended").
2. Click the extension icon, then **Scan this page**. It scrolls through the whole list by itself; this takes a few seconds.
3. For each subject you'll see your % and either **Can skip N classes** or **Attend next N classes**.

Options in the popup:

- **Min %:** change it if your cutoff isn't 75%.
- **Count "–" lectures as absent:** on by default.
- **Combine labs with their subject:** merges `PSP Lab 2` into `PSP`, if your college counts them together.
- Edit any number by hand, or **add a subject manually**.

## Privacy

Everything runs in your browser. The extension reads the page only when you click **Scan**,
stores results in Chrome's local storage, and sends nothing anywhere. It asks for no
site permissions beyond the tab you're on (`activeTab`).

## How it counts (NST portal)

- **✓ Attended** → attended
- **–** (empty) → missed
- **Watched** (you only watched the recording) → missed

The portal's own "100/121 Attended" figure leaves a few lectures on the list out of its total, without
saying which ones. The extension counts every lecture on the list and shows the portal's figure next to
its own, so you can see any difference.

The math, with `a` attended, `t` total and cutoff `P%`:

- can skip = `floor((100a − P·t) / P)`
- must attend = `ceil((P·t − 100a) / (100 − P))`

## Development

```
extension/   the extension itself (load this folder unpacked)
test/        math test, a mock NST lecture page, and a harness that runs the popup against it
build.sh     makes dist/attendance-calculator.zip for a release
```

- `node test/calc.test.js` checks the math against brute force.
- `python3 -m http.server 8765`, then open `http://localhost:8765/test/harness.html` to run the popup against the mock page.

Portal not detected? Open an issue with the text of your attendance table's header row.
