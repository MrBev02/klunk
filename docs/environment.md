# Environment gotchas

Machine-specific facts, and the toolchain notes that only bite occasionally.
Read this when something fails in a way the code cannot explain: a push
refused, a test comparing two identical-looking strings, a save that hangs, a
browser driving the wrong machine.

---

## The toolchain

**`tsc` is a native binary now** (#104). TypeScript 7 is the Go port, so the
`typescript` package is a shim that runs
`@typescript/typescript-<platform>/lib/tsc`, one of twenty optional dependencies
picked by `os` and `cpu`, and the `lib.*.d.ts` files moved there with it.
Installing from the lockfile under `--os=linux` and `--os=win32` was checked
rather than assumed: each resolves exactly one binary, so CI and the Windows
machine both get theirs. The whole check takes 0.3 s where 5.9.3 took 3.0 s.

Two things follow from the new layout. **`node_modules/typescript/lib` is no
longer a TypeScript install** — it holds the shim and nothing else — so
pointing an editor's `typescript.tsdk` at it buys a broken language service
rather than a version mismatch. And **nothing else in the toolchain loads the
`typescript` package at all**: not vite, not vitest, not `@preact/preset-vite`,
not prettier, each of which carries its own TypeScript handling. So the compiler
API moving to `typescript/unstable/*` costs this repository nothing, which is
why `dist/` and `dist-single/` came out byte-identical either side of the
upgrade.

## The machine

**This section describes one machine: the user's Mac, where all of it was
established.** Development has moved between machines, so read every item below as
"true here, unverified elsewhere": a note naming a specific path, OS setting or
piece of hardware is evidence from one place, not a fact about the project.
Re-establish before relying on it, and correct the note when you do rather than
adding a second one beside it. Anything that identifies a particular machine or
installation stays out of this file entirely — the repo is public.

**Three of these live in `.git/config` and therefore do not survive a fresh
clone.** The first two bite immediately and neither announces itself, so set
them first on a new machine:

```
git config --local user.name MrBev02
git config --local user.email 261693983+MrBev02@users.noreply.github.com
git config --local credential.helper ""
git config --local credential.https://github.com.helper '!gh auth git-credential'
git config --local blame.ignoreRevsFile .git-blame-ignore-revs
```

The third does not bite, which is why it is the one that gets forgotten. Without
it `git blame` credits the Prettier reformat (#103) with **1,544 lines** of
`src/` instead of the 37 it actually wrote, and says so with a straight face —
there is no warning, just the wrong name against most of the file. GitHub's web
blame reads `.git-blame-ignore-revs` on its own and needs no setting up; only
local git has to be told.

Without the first two, commits land under the machine's global identity, which is
a different account. Without the last two, see the first item below.

**The empty `credential.helper` is load-bearing and was missing from this list
until a push failed on it.** A url-scoped helper *adds* to the helper list rather
than replacing it, so Git Credential Manager, configured in the system gitconfig,
still ran first and answered. The empty value resets the list, and it has to be
set before the scoped one or it wipes that too. Order in `.git/config` matters.

The symptom is not a hang and not a prompt: the push is refused outright with
`Permission to MrBev02/klunk.git denied to <other account>`. Check with

```
printf 'protocol=https\nhost=github.com\n\n' | git credential fill
```

which prints the username Git would actually send. `gh auth status` is not enough
on its own: it can show MrBev02 as the active account while Git sends the other,
because Git never asks `gh`.

- **Git pushes hang, or are refused.** Two credential helpers are configured. On the
  Mac, Git Credential Manager blocked forever on a GUI prompt in a non-interactive
  shell. On the Windows machine it does not hang: it answers, with the wrong
  account, and the push is refused with a 403. Both are the same cause and both
  are fixed by the reset plus the pin above. GCM lives in the system gitconfig
  (`C:/Program Files/Git/etc/gitconfig` on Windows), so every fresh clone starts
  with it and only this repo is pinned.
- **Git identity is set locally** to MrBev02, because the machine's global identity is
  a different account.
- **`../klunk-content` is not in git and does not come with the repo, deliberately.**
  Without it, `extract.corpus`, `objective.corpus`, `syllabus.corpus`,
  `headings.corpus`, `ibdt.corpus` and `ibguide.corpus` skip, and the port
  comparison against the Python generator needs `python3` besides. **`npm test`
  therefore goes green while testing far less, and `npm run build` gates the
  Pages deploy on that same green.** That is unavoidable — the documents are
  NESA's and the IB's — but it was also *silent*, which was not (#65), and it
  bit: the heading reader was changed across three commits with its whole corpus
  skipping, because one absent document took the other five with it.

  Three things now hold.

  **Every document is named once, in `src/corpus.ts`.** Six suites each kept
  their own path string, so a typo in one was indistinguishable from a document
  nobody had, and both read as an ordinary skip.

  **Every run says what it did not test.** `src/corpus.test.ts` writes a summary
  naming each suite that did not run in full and the documents it wanted — and
  says so in the good case too, `all 6 suites ran against 36 real documents`,
  because a warning that only appears when something is wrong teaches nobody what
  right looks like. It writes to `process.stderr` and **not** through `console`,
  which vitest captures here and prints neither. Checked, not assumed.

  **`npm run test:corpus` fails where `npm test` skips.** That is the pass that
  catches a mistyped path, run when it matters rather than nagging every time: a
  missing document and a typo look identical from the outside, and a machine
  legitimately holding only some of these is normal. It selects strict through
  `--mode corpus` rather than an environment variable, because the Windows
  machine runs these too and a `VAR=x` prefix is not portable.

  Each document gates itself, so one absent file no longer takes a suite with it.
  `extract.corpus` gated on the 2015 paper alone and then read twenty-two, so a
  folder holding some years threw ENOENT part-way rather than skipping the rest.

  What CI still cannot do is check a count against a real document. What it
  **does** do, and this is worth knowing before reaching for a second corpus, is
  run a committed synthetic suite for every reader — `extract.test.ts`,
  `objective.test.ts`, `syllabus.test.ts`, `headings.test.ts`, `ibdt.test.ts`,
  `ibguide.test.ts`. A reader that stops reading altogether fails in CI. Only the
  real-document counts go unseen there.
- `python3 -m venv` fails (`ensurepip` broken). Use `uv`.
- **Python's stdout is not UTF-8 on the Windows machine, and that broke the port
  comparison for weeks** (#72). `sys.stdout.encoding` is `cp1252` there, the
  console codepage, and it stays `cp1252` when stdout is a pipe. So a tool that
  writes a model to stdout writes it in cp1252, and `src/syllabus.corpus.test.ts`
  reads that back with `encoding: 'utf8'`. A non-breaking space is one byte
  `0xA0` in cp1252 and not valid UTF-8 at all, so it arrived as U+FFFD and both
  documents failed on a diff of one space against another. The port was right the
  whole time. `tools/nesa_stage6_syllabus.py` writes UTF-8 on `sys.stdout.buffer`
  now, matching what `--out` always did; **any Python tool added here has to do
  the same**, and this would not have shown up on the Mac.
- **VS Code does not use this repository's TypeScript, and did not before #104
  either.** 1.131.0 bundles its own — 6.0.3 here — and
  `typescript.enablePromptUseWorkspaceTsdk` is off by default, so IntelliSense
  never went near 5.9.3 and does not go near 7.0.2. The editor and `tsc` have
  therefore always been two implementations of the same rules, and moving to 7
  narrows that gap rather than opening it. The route to the workspace compiler
  is the **TypeScript (Native Preview)** extension plus
  `typescript.experimental.useTsgo`, pointed at the binary under
  `node_modules/@typescript/`; it is not installed here, and `typescript.tsdk`
  is not the route because of the layout change above. The language server does
  work: `tsc --lsp --stdio` driven over this project answered hover,
  go-to-definition across modules, completion and live diagnostics correctly.
- **Two Chrome browsers are connected to this account, and the wrong one is the
  default.** `list_connected_browsers` returns a macOS one and a Windows one, and
  **which is local depends on which machine you are on** — this was first written
  on the Mac, where the macOS one was `isLocal: true`; on the Windows machine it
  is the Windows one. Only the local one can reach `localhost:5173` or the
  `klunk-content` folder handle. Landing on the remote one has wasted a session
  more than once: tabs report `visibilityState: hidden`, saves hang with no error,
  and the tab group disappears from under you. So read `isLocal` each session
  rather than remembering an answer.
  **Check `list_connected_browsers` before driving anything, and select by
  `deviceId`.** Which deviceId is right is a per-machine fact and is deliberately
  not written down here: this repo is public and an installation id is not
  something to publish. Identify the right browser by `osPlatform` and `isLocal`
  each session, then select by its deviceId.
  The display names are worthless: "Browser 1" and "Browser 2" swapped between two
  consecutive calls in one session, and `select_browser` confirmed the macOS
  deviceId with the words "Connected to browser Browser 2". Trust `osPlatform` and
  `isLocal`, never the name. Confirm with `navigator.userAgentData.platform` in the
  page before believing you are in the right place.
- **A save that hangs with no error is the browser, not the code.** No notice, no
  console error, the button still enabled: check the connected browser first. A
  hidden tab was blamed for this once and then a save went through from a hidden tab
  perfectly well, so `visibilityState` is not the reliable explanation — the wrong
  machine is. Bringing the tab to the front is still worth trying second, since a
  handle being re-permissioned may need it.
  **One thing genuinely does hang in a hidden tab, and it is not a save.**
  `requestAnimationFrame` never fires in a background tab, so anything waiting on
  one waits for ever with no error and no CSP violation. pdf.js renders that way
  unless the intent is `print`, which is why `src/pdfimage.ts` sets it. If
  something hangs, check whether it is waiting on a frame before blaming the
  machine.
- **The Chrome browser tools work on this machine. Use them.** They drive the real
  browser here, so `npm run dev` and check the change rather than reasoning about it
  from the source. Driving the question editor this way found four faults that
  reading the code did not, including one that silently dropped the syllabus a
  question was tagged against.
  Two things need the user, because a native OS dialog is outside the page: granting
  the content folder the first time on a given origin, and choosing a stimulus image.
  Ask for that one click and carry on.
  *Already confirmed:* folder access reports **Supported**, and the deployed page
  renders. Do not ask again unless something changes.
  **Loopback works again as of 2026-07-31.** Chrome could not reach any loopback
  server on 2026-07-30 (a plain page on two ports and both loopback addresses never
  received Chrome's request, while `curl` got 200 from the same URLs), but
  `http://localhost:5173/klunk/` drove fine the next day against the dev server the
  user already had running. So try it before assuming it is broken; if it fails again
  it is Chrome or macOS blocking localhost rather than Vite, so check System Settings →
  Privacy & Security → Local Network and `chrome://policy` instead of re-diagnosing
  Vite.
  Never use a broad `pkill -f vite`: it took out the user's open browsers.
  **Clicking by coordinate is unreliable here**: the screenshot is scaled relative to
  CSS pixels, and a click computed from `getBoundingClientRect` silently missed a
  button twice. Use `find` to get a ref and click the ref.
  **A ref click misses too, and more often than the note above implies.** "Create
  paper" was clicked twice by ref with nothing happening, and a plain
  `element.click()` in `javascript_tool` worked first time on the same button. So
  when a ref click appears to do nothing, do not conclude the handler is broken —
  try the JS click before reading any code. Note the trade: a JS click is a real
  event to the page but skips whatever the browser does about user gestures, which
  is why it is not the default.
  **Chrome allows one download per site and then blocks silently.** Fetching four
  NESA syllabuses, the first landed and every later one did nothing at all: no
  error, no console message, the button still there. It is Chrome's
  "allow multiple downloads" permission, which is browser UI and therefore
  invisible to a page screenshot. Ask the user for the click rather than retrying.
  **NESA's download links are served from another host.** A link on
  `educationstandards.nsw.edu.au` resolves to `www.nsw.gov.au/sites/default/files/…`,
  and `curl` against the first host returns an HTML page with a 200 regardless of
  headers. Read the real `href` out of the page before fetching.
  **Never call `navigator.clipboard.readText()`** to check a copy button. It raises a
  permission prompt that froze the renderer and timed out CDP. Assert on what the app
  says it did instead.
  **A tab the extension is driving is usually hidden, and focus does not work in one.**
  `document.hidden` is true and `document.hasFocus()` false, so `el.blur()` fires no
  blur event at all (a native listener added beside it heard nothing), and `useEffect`
  falls back off `requestAnimationFrame` onto a throttled timer, which took over 500 ms
  to run. Both read as a broken handler. Anything about focus, blur or effect timing has
  to be driven with real clicks and real typing rather than from `javascript_tool`.
- **Match a button by its whole label, never a substring.** Driving the question
  editor with `javascript_tool`, a regex of `/cancel|discard|close/i` looking for
  **Cancel** hit **Save and close** first, and a placeholder question went into
  `bank/example-bank.json`. It was removed and the bank verified back to
  question-for-question identical, but a click with a side effect deserves
  `b.textContent.trim() === 'Cancel'` and nothing looser.
- **The folder grant does not lapse by closing the tab.** Closing every Klunk tab
  and opening a fresh one left `queryPermission` at `granted` for both remembered
  folders, so waiting for a cold start is not how the lapsed-grant path gets
  driven. The only deliberate route is Chrome's own site controls — the sliders
  icon left of the address bar → **File editing** → off, or
  `chrome://settings/content/filesystem` — and the extension cannot open a
  `chrome://` page, so it is a click to ask the user for. Afterwards every handle
  reads `prompt`, which is the state the welcome screen is written for. Renewing
  costs the user one more click, on Chrome's permission bubble, and that bubble
  does not appear while the tab is in a background window: the request simply
  hangs until the tab is brought to the front. The folder picker behaves the same
  way, so bring the window forward *before* triggering either.
