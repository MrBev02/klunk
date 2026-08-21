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

## Where the detail lives

This file holds the rules. The verified facts behind them are in `docs/`: what
real documents and a driven browser turned out to do, established at real cost.
**Do not re-derive any of it, and do not contradict it without new evidence.**
Read the file named here before working in the area, not after. Each is a run
of findings under `##` headings, so `grep -n '^## ' docs/*.md` is the whole
outline of what has been established.

| Working on | Read first |
|---|---|
| Reading a past paper or marking guide — `extract.ts`, `objective.ts`, `guide.ts`, `answerkey.ts`, the two format pickers, `pdftext.ts`, `pdfimage.ts`, `adopt.ts` | [docs/reading-papers.md](docs/reading-papers.md) |
| Reading a syllabus — `syllabus.ts`, `headings.ts`, `ibdt.ts`, `ibguide.ts`, `formats.ts`, `ooxml.ts`, `xlsx.ts`, `syllabusedit.ts`, the Python generator | [docs/reading-syllabuses.md](docs/reading-syllabuses.md) |
| What a question, a paper or a profile may say — the schemas, `richtext.tsx`, `render.tsx`, `question.tsx`, `editor.tsx`, `validate.ts`, `cover.ts`, the three prompts, printing to PDF | [docs/question-and-paper-model.md](docs/question-and-paper-model.md) |
| Any parser change at all | [docs/corpus-counts.md](docs/corpus-counts.md), then `npm run test:corpus` |
| A failure the code cannot explain — a push refused, a save that hangs, a browser driving the wrong machine, a diff of two identical-looking strings | [docs/environment.md](docs/environment.md) |
| Whether something already exists, and why a screen is the shape it is | [docs/delivered.md](docs/delivered.md) |

## How to work here

Four lessons this repository has paid for more than once, each with its evidence
in the file beside it.

- **The count was right while the content was wrong.** A reader that produces
  plausible totals may have thrown away a third of a document. Check what the
  model *says*, topic by topic, against the page — not what it counts.
  (#26, #43, #78, #93, in [reading-syllabuses.md](docs/reading-syllabuses.md))
- **Drive it in a browser rather than reasoning from the source.** A feature
  that works and cannot be found has not been delivered, and most of the faults
  recorded in [delivered.md](docs/delivered.md) were invisible in the code:
  a `//` comment printing on a card, a blank page from a reserved prop name, a
  confident wrong letter on a marking guide.
- **Faults hide each other.** A document refused outright by one rule costs
  nothing until that rule is fixed, and the rules behind it are usually silent
  when they arrive. Fixing the visible one is the start of the work, not the end.
  (#50, #77, #81 to #84, in [reading-syllabuses.md](docs/reading-syllabuses.md)
  and [reading-papers.md](docs/reading-papers.md))
- **A test covering only the path where a value arrives cannot see the path
  where it is invented.** Three separate faults shipped green this way.
  (#64, #105, #106, in
  [question-and-paper-model.md](docs/question-and-paper-model.md))

## Layout

```
klunk/                     this repo - app and tools only, public
  schemas/                 the six JSON formats
  profiles/                paper rules per course (these DO ship)
  tools/                   syllabus generators (Python, stdlib only)
  src/                     the app (Vite + TypeScript + Preact)
    ooxml.ts               Word markup to paragraphs and tables, deciding nothing
    xlsx.ts                spreadsheet to rows of text, deciding nothing
    syllabus.ts            the 2013 content-table reader, and the model
    headings.ts            the Outcomes/Content reader and the prose reader
    ibdt.ts                the IB DP Design Technology syllabus map reader, and
                           the SL/HL split both IB readers share
    ibguide.ts             the IB DP Design Technology subject guide reader
    formats.ts             picks the syllabus reader that fits the document
    extract.ts             the NESA past paper reader
    objective.ts           the numbered multiple-choice paper reader
    paperformats.ts        picks the paper reader that fits the document
    guide.ts               the NESA marking guide reader
    answerkey.ts           the grid-of-answers markscheme reader
    guideformats.ts        picks the guide reader that fits the document
    paperprompt.ts         the prompt for a paper no reader would take
    marking.ts             what a marking guide says, and the skeleton of the
                           questions a prompt for one is built from
    guideprompt.ts         the prompt for a marking guide no reader would take
    guideingest.ts         reading that reply back, repairing or refusing
    richtext.tsx           the paragraphs, pipe tables and three inline marks a
                           question's prose may carry, and taking them back out
                           again
    syllabusedit.ts        correcting a parsed model, pure and testable
    syllabusreview.tsx     every topic on screen, to correct or only to read
    syllabusmodels.tsx     the models already in the folder, read-only
    manifest.ts            what each document in the folder turned out to be, pure
    modelcheck.ts          tags that name nothing, and two models of one document
    cover.ts               the cover sheet's three layers resolved, no JSX
    coversheet.tsx         the form over school.json (named apart from cover.ts
                           so `import './cover'` cannot mean either one)
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

## The six formats

All defined in `schemas/`, all validated with real data.

| Schema | Holds | Key decision |
|---|---|---|
| `syllabus.schema.json` | Courses, outcomes, topics, content points | Stable local ids (`HSC-01.07`); topics carry `group` for focus areas; a point may carry `parent`, so a flat array can hold a two-level list |
| `profile.schema.json` | Paper structure and rules per course | Everything the old toolchain hardcoded lives here as data |
| `bank.schema.json` | Questions | References syllabus by **stable id**, not a `A > B > C` path string; carries provenance |
| `paper.schema.json` | An exam as a selection of questions | By reference, never by copy |
| `school.schema.json` | Cover branding: name, logo, what a student fills in | One per folder, because a logo is one file and a school is one school |
| `manifest.schema.json` | What each document in the folder turned out to be | A cache, not a record: delete it and Klunk refills it as it reads |

Question types are a **closed enum that grows by evidence** (#32):
`multiple_choice`, `multiple_response`, `matching`, `true_false`, `short_answer`,
`extended_response`, `table`, `drawing`. No `sql`, `spreadsheet` or `python`.

Two deliberate divergences worth preserving:
- **Stable ids over path strings.** A path breaks the moment a topic is renamed.
- **Provenance on every question.** Reusing a recent HSC question in a school trial is
  a mistake that actually happens; Klunk can only warn if the source year and number
  were recorded.

## Conventions

- **Australian English** throughout (visualisation, analyse, behaviour, customise),
  AUD for currency, metric, A4.
- **Python**: stdlib only, 3.11+, `#!/usr/bin/env python3` and no PEP 723 block since
  there are no dependencies. Native generics, `from __future__ import annotations`,
  frozen dataclasses, Google-style docstrings. Catch exceptions only where there is a
  specific recovery.
- **Commit messages**: descriptive sentences, not Conventional Commits. Say what
  changed and why it mattered. Record corrections honestly rather than quietly fixing.
  **No trailers**: no `Co-Authored-By`, no `Claude-Session`, no attribution footer,
  in commits or in PR bodies. The history is prose about the work; tooling trailers
  are noise in it. This is written here rather than left to a tool's memory because
  memory is per-machine and the default is to add them.
- **Layout is Prettier's, not yours** (#103). `npm run format` before committing,
  or let an editor do it on save. The settings in `prettier.config.js` were
  measured off the code rather than chosen — no semicolons, single quotes,
  `printWidth: 100` — so it agrees with what is already there and reformatting a
  file you touched should move only the lines you touched. **Markdown is ignored
  outright**, so this file's hand-wrapped prose and aligned tables are yours to
  keep at 80 columns. Prettier never reflows a comment either, so prose inside a
  `.ts` file stays where it is put.
- Comments explain **why**, not what.
- **Git identity and credentials are set per-clone**, in `.git/config`, so they do
  not survive a fresh clone. Without them commits land under a different account
  and pushes are refused outright. The five `git config --local` lines are the
  first item in [docs/environment.md](docs/environment.md); set them before the
  first commit on a new machine.

## Running things

```
npm install
npm run dev            # dev server
npm test               # vitest, the paper checker and shuffle logic
npm run test:corpus    # the same, but a missing corpus document fails rather
                       # than skipping. Run it before pushing a parser change.
npm run build          # typecheck, then tests, then dist/ for GitHub Pages
npm run build:single   # dist-single/ one self-contained HTML for a shared drive
npm run typecheck
npm run format         # Prettier over the repo, in place
npm run format:check   # what CI's `format` job runs; does not gate the deploy

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

Two toolchain notes that occasionally bite — `tsc` being a native binary since
#104, and Python's stdout encoding on the Windows machine — are in
[docs/environment.md](docs/environment.md), with everything else that is true of
one machine rather than of the project.

**Regression counts for every reader are in
[docs/corpus-counts.md](docs/corpus-counts.md)**, along with the four numbers a
rewrite would get wrong. They are enforced by the corpus tests, which *skip*
when `../klunk-content` is absent — so `npm test` can go green while testing far
less. `npm run test:corpus` is the pass that fails instead, and is the one to
run before pushing a parser change.

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

The app opens a folder, reads it, browses questions with full detail, builds a
paper against a profile, checks it, prints the student paper and marking guide
to PDF, and saves papers back to the folder. Questions get in three ways: a
teacher writes one in the app, an AI drafts or transcribes one through
copy-and-paste, or a past paper and its marking guide are read straight into a
bank. A syllabus model is built in the app from the teacher's own document —
all three NESA shapes, junior and senior, and the IB guide and syllabus map —
and can be corrected topic by topic before it is written. A teacher of any
subject can describe their own examination as a profile. `npm run build` gates
the Pages deploy on the tests.

**The whole of that is recorded feature by feature, with what was verified in a
browser for each, in [docs/delivered.md](docs/delivered.md).** Read it before
building something that may already be there.

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

**Waiting on the user:** the school's exam template `.docx`, and only if Word
export returns. The IB subject guide and the old-to-new mapping spreadsheet were
also waited on here for a long time; both arrived and both now read (#4, #58).
