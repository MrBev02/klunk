# CLAUDE.md

Guidance for Claude Code working in this repository.

## What Klunk is

A point-and-click exam paper builder for teachers who should not have to touch a
terminal. It runs entirely in the browser: no server, no account, no database, no
API key, and **no network requests after the page loads**.

Built for the all faculties at the user's school. PoC courses are **NSW HSC
Design and Technology** and **IB DP Design Technology**. Textiles and Design is also
supported by the syllabus generator.

No sycophancy, no flattery, challenge weak reasoning, plan before producing.

## Non-negotiable constraints

These are decisions with reasons, not preferences. Do not quietly reverse them.

**1. No exam content in this repository. It is public.**
Question banks, papers, templates and syllabus models live in a folder the teacher
chooses at runtime, normally a school OneDrive or Teams folder. `.gitignore` enforces
this. Before any commit, check nothing under `bank/`, `papers/`, `templates/`,
`syllabus/*.json`, or any `.docx`/`.pdf` has been staged.

**2. Klunk ships no syllabus models, only generators.**
A syllabus is copyright. The NESA Stage 6 (2013) notice permits a NSW teacher to copy
*reasonable portions* for bona fide study, and forbids reproducing a major extract,
modifying the material, or commercial use. IB subject-guide content is licensed
through the Programme Resource Centre. A generated model is the entire content
inventory, restructured, published worldwide: not a reasonable portion under anyone's
reading. Each teacher generates from their own copy into their own folder.

*Profiles are different and DO ship.* A profile records the shape of a public
examination (40 marks, three sections at 10/15/15), which is fact, not NESA's
expression of its syllabus.

**3. No AI inside the app.**
The app talks to no AI service and holds no API key. Where an AI genuinely helps, the
app composes a prompt with the syllabus context filled in; the teacher pastes it into
whatever their school licenses (ChatGPT, Copilot, Gemini, Claude) and pastes the
structured result back for validation. This means no vendor dependency, and the
teacher decides exactly what text leaves their machine.

**4. The no-network claim is enforced, not promised.**
The CSP in `index.html` sets `connect-src 'none'`. If a change needs the network, that
has to be a deliberate decision that revisits the privacy claim at the same time.

## Layout

```
klunk/                     this repo - app and tools only, public
  schemas/                 the four JSON formats
  profiles/                paper rules per course (these DO ship)
  tools/                   syllabus generators (Python, stdlib only)
  src/                     the app (Vite + TypeScript + Preact)
    fixtures/              fictional sample data for development
../klunk-content/          NOT in git - the teacher's content folder equivalent
  source/                  downloaded syllabus docs and past papers
  syllabus/                generated models
  fixtures/                docx kept purely as parser regression tests
  tools/docx_text.py       authoring aid for reading .docx
```

`../klunk-content` is a sibling of this repo and is where all real content lives
during development. It is deliberately outside the repo so it cannot be committed.

**It is a test setup, and two kinds of mess are not the same thing.**

*Mess from competing workflows is the point, so let it happen.* Save into it freely
through the app, the way a teacher would, while the user is working in it in their
own browser. Do not back it up first, do not tidy up afterwards, and do not stop to
ask before writing a test question into a bank. Two people saving to one folder is
exactly what a bank on a shared OneDrive looks like, and treating that as a hazard
to avoid throws the scenario away. It found #16 within minutes.

*Mess from development breaking it is a different thing, and is not acceptable,
because it cannot be undone.* Nothing in that folder is in git. A half-finished
write path, a script that rewrites a bank, or a migration can destroy questions
that no history holds. So before running anything that writes by a route the app
does not already use, or that rewrites a file wholesale, copy what it will touch.
The question is never "is this folder precious" — it is "if this code is wrong, is
the content still recoverable".

## The four formats

All defined in `schemas/`, all validated with real data.

| Schema | Holds | Key decision |
|---|---|---|
| `syllabus.schema.json` | Courses, outcomes, topics, content points | Stable local ids (`HSC-01.07`); topics carry `group` for focus areas |
| `profile.schema.json` | Paper structure and rules per course | Everything the old toolchain hardcoded lives here as data |
| `bank.schema.json` | Questions | References syllabus by **stable id**, not a `A > B > C` path string; carries provenance |
| `paper.schema.json` | An exam as a selection of questions | By reference, never by copy |

Question types are D&T-relevant only: `multiple_choice`, `true_false`, `short_answer`,
`extended_response`, `table`, `drawing`. No `sql`, `spreadsheet` or `python`.

Two deliberate divergences worth preserving:
- **Stable ids over path strings.** A path breaks the moment a topic is renamed.
- **Provenance on every question.** Reusing a recent HSC question in a school trial is
  a mistake that actually happens; Klunk can only warn if the source year and number
  were recorded.

## Verified facts, established from real sources

Do not re-derive these, and do not contradict them without new evidence.

**HSC D&T written paper, from 11 years of papers (2015-2025):**
- Fixed: 40 marks; Sections I/II/III at 10/15/15; exactly ten 1-mark objective
  questions; Section III is one extended response; `Question N (M marks)` headings.
- Varies: MC option labels changed from `(A)` to `A.` in **2017**; Section II ran 2, 3
  and 4 questions in different years; `Question N (continued)` blocks appear from 2018
  (1-4 per paper) and must merge into the parent, not register as new questions; two
  different front-matter layouts.
- **Every paper has a text layer**, so deterministic parsing works and no OCR or
  vision is needed.
- **From 2019 the answer booklet is bound into the same PDF**, its cover falling
  straight after Question 10. The course title printed on it is not furniture by
  any general rule, so dropping lines one at a time is not enough: `Centre
  Number`, `Student Number`, `Answer Booklet` and the examination line have to
  *close* the open question.
- **"Do NOT write in this area." runs up the margin of 59 pages, rotated**, one
  word per baseline, and those baselines are the ruled answer lines' baselines.
  Rotated runs are dropped at the pdf.js boundary. The whole corpus holds three
  distinct rotated strings: that notice and two axis labels inside figures.
- **A mark is centred against what it governs, never attached to a line.** A
  Section III band covers three or four bullets with its mark at the centre of
  the group, so it lands inside whichever bullet is in the middle. Each bullet
  belongs to the mark nearest its own vertical centre.
- **Marking guides carry a mapping grid** giving marks, a plain-English topic and
  the **syllabus outcome codes** for every question, the ten objective ones
  included — the only place a multiple-choice question's outcomes are written.
  2016 leaves the marks cell of its Section III row blank.
- **Banding is not peculiar to Section III**: from 2018 a six-mark Section II
  question carries a `2–3` band.
- **2016, 2018 and 2019 each print a Section II question with no stem**, the
  heading followed straight by `(a)`.
- **Almost no question says "Figure N".** One does, in eleven years. Twelve refer
  to a picture as "the images show two chairs" or "as shown in the graph", so a
  rule keyed on the word *Figure* finds nothing.
- **Rendering stays inside the CSP.** All 128 pages of the eleven papers render
  with zero `securitypolicyviolation`, so pictures cost nothing of the
  no-network claim. `getDocument` detaches the bytes it is given, so the text and
  the pictures must share one open document.

**NESA Stage 6 (2013) syllabuses use two content layouts:**
- *Wide*: one 3-column table per course, `Outcomes | Students learn about | Students
  learn to`, outcome cell blank on continuation rows. Design and Technology.
- *Narrow*: many 2-column tables, no outcome column; each row is a topic and outcomes
  appear as paragraphs above. Textiles and Design.
- Course membership comes from the outcome code prefix (P/H), or a `(Preliminary)` /
  `(HSC)` marker. Relying only on `Content: ... HSC` headings silently misfiles whole
  courses. **In the wide layout the prefix is no help**, because the outcomes sit
  inside the table and are not in scope when the course is decided — there the
  heading is the only signal, and a wide table with no heading above it is filed
  under `course`, deliberately, rather than guessed at.

**There is a third old layout, and it is not read.** Visual Arts Stage 6 (2016)
heads its content table `Content | Preliminary course | HSC course` — three
columns, but the course is a *column* rather than a heading, so both the layout
test and the course rule miss and the parser refuses the document. Probably the
whole 2016 Creative Arts family. See #34.

**The NSW Curriculum Reform syllabuses are a different document, not a new
wrapper.** Established from Biology 11–12 (2025), English Advanced 11–12 (2024)
and Mathematics Advanced 11–12 (2024), all in `../klunk-content/source/`:
- **No content tables at all.** Headings and bulleted lists. `parseSyllabusXml`
  refuses all three, correctly.
- Outcome codes are `BI-11-01`, `BI-11WS-01` — not `P1.1`/`H1.1`.
- Courses are **Year 11 / Year 12**, not Preliminary / HSC.
- Nesting is a level deeper: focus area → sub-heading → bullets, which maps onto
  group → topic → points without changing the schema.
- **`curriculum.nsw.edu.au` exports Word as well as PDF**, with checkboxes for
  which elements to include. The Word export is much the better input — heading
  level from `w:pStyle` and nesting from `w:numPr`, rather than inferred from
  coordinates. In the PDF the two-column outcomes table interleaves
  (`BI-11WS-01 WorkingBI-12WS-01 Working`) and formulae scatter into fragments.
- Every page of the Biology PDF has a text layer and **zero rotated runs**,
  unlike the past papers.

**Two editions of one subject are live at the same time.** The Biology document
states it: 2027 Term 1 starts the new syllabus for Year 11 *while Year 12
continues on the 2017 one*, and the first HSC examination for the new course is
2028. So a folder holding two models for one subject is the normal state for a
year, not an accident. See #29.

**IB DP Design Technology changed:** first teaching August 2025, first assessment May
2027. Six core topics plus four HL options became three themes; Paper 3 abolished. **No
past paper exists for the new course**, so its bank must be authored from the subject
guide, not extracted. Do not promise IB extraction.

**Dropped from scope:** Industrial Technology and Food Technology. Their `.docx` files
are kept in `../klunk-content/fixtures/` purely as parser regression tests.

## Conventions

- **Australian English** throughout (visualisation, analyse, behaviour, customise),
  AUD for currency, metric, A4.
- **Python**: stdlib only, 3.11+, `#!/usr/bin/env python3` and no PEP 723 block since
  there are no dependencies. Native generics, `from __future__ import annotations`,
  frozen dataclasses, Google-style docstrings. Catch exceptions only where there is a
  specific recovery.
- **Commit messages**: descriptive sentences, not Conventional Commits. Say what
  changed and why it mattered. Record corrections honestly rather than quietly fixing.
- Comments explain **why**, not what.

## Running things

```
npm install
npm run dev            # dev server
npm test               # vitest, the paper checker and shuffle logic
npm run build          # typecheck, then tests, then dist/ for GitHub Pages
npm run build:single   # dist-single/ one self-contained HTML for a shared drive
npm run typecheck

# The reference implementation of the syllabus generator. NOT the route a
# teacher takes any more — that is the "From a syllabus" tab, which reads the
# .docx in the browser (src/docx.ts + src/syllabus.ts). This is kept because
# src/syllabus.corpus.test.ts checks the port against it, and they must agree
# exactly on all four documents.
python3 tools/nesa_stage6_syllabus.py <syllabus.docx> \
    --id nsw-hsc-design-technology --name "Design and Technology" \
    --out ../klunk-content/syllabus/nsw-hsc-design-technology.json

# Validate schemas and data (uv, because this Python's ensurepip is broken)
uv run --with jsonschema python <validation script>
```

Regression check for the generator: Design and Technology must stay at
**20 topics / 78 points / 12 outcomes** (Preliminary) and **20 / 61 / 13** (HSC).
Textiles and Design at **18 / 104 / 11** and **15 / 80 / 13**.

Textiles HSC was 16 / 79 until #26, and the change is a fix rather than drift: one
topic runs past the bottom of a page and continues in a fresh table row opening
`iv)`, which was read as a sixteenth topic named after a content point. Merging it
into its parent moves that line from a heading to a point. **The count was right
while the content was wrong**, which is the whole lesson of this section — so the
corpus test now also asserts that no topic name opens with a list marker and that
none carries a non-breaking space.

Groups are part of that check, because they were wrong for a long time without
changing any count. Design and Technology must have **no group on any topic**: it
is one content table per course, so there is nothing to divide. Textiles must have
exactly three, *Design*, *Properties and Performance of Textiles* and *Australian
Textile, Clothing, Footwear and Allied Industries*, with no label prefix and no
non-breaking spaces. A group is only ever taken from a heading that says it is one
(`Area of Study:`, `Focus Area:`); anything else is document furniture.

## Environment gotchas

- **Git pushes hang.** Two credential helpers are configured and Git Credential Manager
  blocks forever on a GUI prompt in a non-interactive shell. This repo is pinned to
  `gh auth git-credential` locally, so pushes work here. Other repos on this machine
  are not.
- **Git identity is set locally** to MrBev02, because the machine's global identity is
  a different account.
- `python3 -m venv` fails (`ensurepip` broken). Use `uv`.
- **Two Chrome browsers are connected to this account, and the wrong one is the
  default.** `list_connected_browsers` returns a macOS one (`isLocal: true`) and a
  Windows one on another machine. Only the macOS one can reach `localhost:5173` or
  the `klunk-content` folder handle. Landing on the Windows one has wasted a session
  more than once: tabs report `visibilityState: hidden`, saves hang with no error,
  and the tab group disappears from under you.
  **Check `list_connected_browsers` before driving anything, and select by
  `deviceId`.** The macOS one is `5789f377-f76f-453b-84a8-c43b896b8880`.
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

## Work is tracked in GitHub issues

**All work lands in an issue and is worked from there, unless the user says
otherwise.** `gh` is authenticated as MrBev02 and this repo is `MrBev02/klunk`.

Before starting anything:

```
gh issue list                 # what is open
gh issue view <n>             # the full context, which is usually already written
```

The rules:

- **Find or file the issue first.** If the user asks for something with no issue,
  create one before writing code, so the reasoning survives the session. A one-line
  issue is fine; the point is that it exists.
- **Put the reasoning in the issue, not just the title.** What is broken or missing,
  what it depends on, what "done" means. Several existing issues carry findings that
  cost real effort to establish, such as how NESA paper formats vary by year. Read
  them rather than re-deriving.
- **Reference the issue in the commit** (`Closes #5`, or `Refs #3` for partial work),
  so history explains itself.
- **Do not close an issue you have not verified.** This project has a habit of
  reasoning from the source rather than checking in a browser, and the later has
  caught several faults that reading the code did not.
- **File what you find.** Noticing a defect while doing something else is normal;
  filing it and carrying on is better than either fixing it silently or forgetting.

Labels: `feature`, `bug`, `gap` (promised but not built), `content` (syllabus or
bank authoring), `deferred` (waiting on evidence or input).

## Status and what is next

Done: repo and CI (Pages deploys green), capability detection, syllabus generator for
both NESA layouts, all four schemas validated with positive and negative tests, HSC D&T
profile, development fixtures covering all five question types. The deployed page has
been opened on the user's machine: it renders, and **the File System Access API is
supported there**, so the folder-based storage model is confirmed rather than assumed.

The app opens a folder, reads it, browses questions with full detail, builds a paper
against a profile, checks it, prints the student paper and marking guide to PDF, and
saves papers back to the folder. `npm run build` gates on the tests, so a broken
checker fails the Pages deploy rather than shipping.

Verified end to end in a browser, not just reasoned about: a complete 40-mark paper
assembles, the checker goes green, it saves to `papers/`, survives a hard reload and
reopens with every reference resolving. Stimulus images load from the content folder
and print. A missing image still prints a placeholder naming the file, deliberately,
so it is caught on the proof rather than in the exam room.

Paper references survive a moved or renamed bank: exact path, then same filename,
then a globally unique question id, with ambiguity reported rather than guessed.

**A teacher can write a question in the app** (#1). The form is field-for-field with
`bank.schema.json`, previews the whole question beside itself as it is typed, and
validates against the schema's rules restated in `src/validate.ts`, because a JSON
Schema validator would be a second dependency. Saving re-reads the bank from disk
rather than trusting the index, refuses to write over a file that is not a bank, and
never copies an image over one already there.

Verified in the browser: a short answer and a multiple choice question written in the
app, saved into an existing bank without disturbing the fourteen already in it, the
multiple choice one printed as question 11 of the trial paper with the marking guide
naming the same option letter the editor previewed.

**The prompt factory is built** (#2), on the "Draft with AI" tab. `src/prompt.ts`
composes a prompt from the chosen course, topics and content points, with their exact
ids, what a mark is worth in this subject, where the type sits on the real paper, and
the JSON to answer with. `src/ingest.ts` reads back whatever comes out, fenced or
prefaced or wrapped, and either repairs something unambiguous and says so, drops
something it cannot trust and says so, or refuses.

The decisions worth not reversing: Klunk assigns question ids and stamps
`syllabusId`/`courseId` itself, so the model can only *choose among* the ids the
prompt listed; every ingested question is tagged `ai-drafted`; a question with an
error cannot be saved from the paste panel and goes to the question editor instead
(`Editing.fresh` only changes what that form says); the whole prompt is on screen
before it is copied, which is what makes "you decide what leaves your machine" true;
and sending the stems already written on those topics is opt-in.

The tabs are now kept mounted behind `hidden` while the editor is open rather than
unmounted, so sending one draft of five to the editor does not throw away the other
four. They stay mounted through a rescan for the same reason: saving reloads the
folder, which runs phase through ready → scanning → ready, and unmounting on the way
past discarded the whole batch the moment the first questions in it were saved. That
was found by driving it, not by reading it.

Verified in the browser: a prompt built from HSC-01 with two content points, then a
deliberately messy reply pasted back — prose either side, fenced, wrapped in
`{"questions": […]}`, a string for marks, an invented point id and outcome, a claimed
provenance, an image stimulus, an unknown field, one entry with no question text and
one that was a bare string. Both non-questions were rejected by number, every repair
was listed against the question it belonged to, one draft went to the editor and back
without losing the other, and the two clean ones were written into an existing bank
without disturbing the sixteen already in it.

**The prompt was built but unreachable, and that is worth remembering.** It rendered
at the foot of the first panel, below the free-text box and the checkbox, and only
once a content point was ticked; until then the sole trace of it was a grey hint that
read as the caption of the checkbox above. The screen therefore looked like it only
did the paste-back half, which is exactly how it was reported. Two fixes, both to
keep: **adding a topic ticks all of its content points**, so a prompt exists the
moment a topic is chosen and narrowing is unticking rather than a gate; and **the
prompt is its own numbered step** with the copy button in its heading, so the tab
reads 1 choose, 2 copy, 3 paste back and step 2 is on screen before any scrolling.
The waiting state keeps the box and says what it is waiting for, so the shape of the
screen does not change when the prompt arrives. The general lesson: a feature that
works and cannot be found has not been delivered, and only driving the page catches
that — the code read as complete.

**A past paper fills a bank** (#3), on the "From a past paper" tab. `src/extract.ts`
and `src/guide.ts` take positioned text and no PDF, so every rule in them is
testable without one; `src/pdftext.ts` is the only place pdf.js is named;
`src/adopt.ts` is the one place the readers meet `bank.schema.json`. The papers
are offered from the teacher's own folder, because that is where they are
downloaded, so no file dialog is needed. Nothing is written until every question
has been seen, and one with an error goes to the editor rather than into a bank.

Verified in the browser: the 2019 paper and guide read into fourteen questions and
forty marks, provenance on each, outcomes from the mapping grid, the extended
response showing all five bands, and all fourteen saved into a bank that still
validates. `src/extract.corpus.test.ts` runs all eleven years and skips itself
when the content folder is absent, so CI never sees a NESA paper.

**Pictures come too** (#24). The page is rendered and the picture cut out of the
band where the text is not, as a proposal the teacher keeps or drops before
anything is written; kept ones are written beside the bank and referenced as
`stimulus`. Rendering rather than lifting image objects out, because the papers
mix photographs with vector diagrams and only rendering handles both.

The cost is real: pdf.js takes `dist-single` from 166 kB to **1.8 MB**. It
lazy-loads in the hosted build, which only went 140 kB to 163 kB.

**#23 settled three things `bank.schema.json` could not say**: a criterion may
carry `marksTo` so a band stays a band, a part may carry its own criteria, and a
question may have no text when its parts do the asking. All three are what the
examinations actually print.

**A teacher of any subject can describe their own examination** (#27), on the
Papers tab and the first-run screen. `src/profile.tsx` is a form over
`profile.schema.json`, `validateProfile` restates its rules, and four of those
rules go beyond the schema because each produces a profile that looks fine and
then rejects every paper built against it. Klunk shipping one profile and telling
everyone else to copy a JSON file was the same failure `src/shipped.ts` was
written to fix, left in place for every subject but D&T. **#8 is now a teacher's
afternoon rather than a code change.**

**A syllabus model is built from the `.docx` in the app** (#28, the 2013 half).
`src/docx.ts` reads one zip member with `DecompressionStream`; `src/syllabus.ts`
is the parser and takes XML and no file. `src/syllabus.corpus.test.ts` checks it
against the Python tool on all four documents and they agree exactly, which is
what makes the port trustworthy rather than merely plausible. The new-format half
is not built.

**A paper says when it has unsaved changes, and everything that would discard
them asks first** (#11, #21). `paperIsDirty` compares against the folder with
object keys sorted, so a hand-edited file does not read as permanently dirty.
The guard covers all four paths that clear a paper, not the one that had a
confirm bolted to it.

**Both folder-switching branches have now been driven, not merely covered** (#22).
With every grant reset in Chrome, the welcome screen listed all three remembered
folders rather than hiding the lapsed ones, and one click on a folder renewed its
permission and loaded it — the other two stayed lapsed, which is the design, one
click each. With a file that is not a profile sitting at
`profiles/nsw-hsc-design-technology.json`, the offer stayed on screen, and "Add to
this folder" reported `… is already there, so nothing was written.` and left the
file on disk untouched.

**A folder that has gone says so, and can be forgotten from where it fails**
(#37), which is what that session turned up on the way. A remembered handle
pointed at a folder that no longer existed: it was listed like any other, opening
it said only "Something went wrong", and nothing could remove it, because Forget
in the header only ever forgets the folder that is *open*. It also held one of
the eight remembered places for good. Now `folderIsMissing` tells a
`NotFoundError` from a genuine failure, the panel names the folder, and forgetting
it returns the teacher to the folder they were in rather than to the welcome
screen. The check cannot come earlier: reading a folder needs the grant, so the
permission click is always spent before the folder can be found to be gone.

Note on history: the commit "Papers survive a moved or renamed bank" also contains
the stimulus-image loading, which its message does not mention.

Next is in the issue tracker. `gh issue list` is the authoritative backlog; this
section only says where to start.

Three follow-ups came out of building the editor and the factory. Two are fixed:
**#14**, where every topic in the D&T model was grouped under `7.2Key Competencies`
because a heading that does not say it is a focus area was taken as one, and
**#12**, where a table question with three or more columns printed the same expected
answers in every column because a row held one flat list rather than one per column.
**#13** is still open: the three places the form makes a teacher think in the file's
terms, being millimetres for drawing space, a count of ruled lines, and table
alternatives separated by a slash.

Much of the open backlog is what driving the app turned up rather than what building
it did. **#18** and **#19** are both cases where a folder holding two syllabus models
is handled as though it held one, which `../klunk-content` does hold. **#21** and
**#22** were both paths that shipped without ever being driven, and both are now
closed: #21 by a fix, #22 by driving it and finding the code right.

**Word export is deliberately not built.** It only earns its complexity if teachers
actually want to hand-edit papers, and the user wants to gauge demand first. If it
comes back: merge into the school's own `.docx` template so cover page, headers and
styles survive, rather than generating a document from scratch.

**Waiting on the user:** the school's exam template `.docx` (only needed if Word
returns), and the IB subject guide plus the official old-to-new topic mapping
spreadsheet.
