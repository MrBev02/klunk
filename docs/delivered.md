# What is built, and what driving it established

A log of delivered work, newest reasoning kept with the feature it belongs to.
Most entries end with what was verified **in a browser**, because this project
has a habit of reasoning from the source, and driving the app has caught faults
reading it did not.

Read this before rebuilding something that may already exist, before changing a
screen whose current shape was argued for here, or when a decision looks
arbitrary and you want the reason. The authoritative backlog is `gh issue
list`, not this file.

---

## Where it stands

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

---

## Writing a question in the app

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

## Drafting with AI

**The prompt factory is built** (#2), on the "Draft with AI" tab. `src/prompt.ts`
composes a prompt from the chosen course, topics and content points, with their exact
ids, what a mark is worth in this subject, where the type sits on the real paper, and
the JSON to answer with. `src/ingest.ts` reads back whatever comes out, fenced or
prefaced or wrapped, and either repairs something unambiguous and says so, drops
something it cannot trust and says so, or refuses.

The decisions worth not reversing: Klunk assigns question ids and stamps
`syllabusId`/`courseId` itself, so the model can only *choose among* the ids the
prompt listed; every ingested question is tagged by what the model actually did,
`ai-drafted` where it wrote the question and `ai-transcribed` where it copied one
off a document Klunk could not read; a question with an
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

## Reading a past paper into a bank

**A past paper fills a bank** (#3), on the "From a past paper" tab. `src/extract.ts`
and `src/guide.ts` take positioned text and no PDF, so every rule in them is
testable without one; `src/pdftext.ts` is the only place pdf.js is named;
`src/adopt.ts` is the one place the readers meet `bank.schema.json`. The papers
are offered from the teacher's own folder, because that is where they are
downloaded, so no file dialog is needed. Nothing is written until every question
has been seen, and one a bank file could not hold goes to the editor rather than
into a bank. Since #105 that is narrower than every error: a question Klunk read
only half of saves, marked `needs-finishing`.

Verified in the browser: the 2019 paper and guide read into fourteen questions and
forty marks, provenance on each, outcomes from the mapping grid, the extended
response showing all five bands, and all fourteen saved into a bank that still
validates. `src/extract.corpus.test.ts` runs all eleven years and skips itself
when the content folder is absent, so CI never sees a NESA paper.

**There are two paper readers now, and a paper that fits neither says so**
(#64). `extract.ts` is NESA's and every rule in it is: a `Section I` heading has
to have been seen before a numbered question counts, and anything outside
Section I needs a `Question 11 (5 marks)` heading. Handed the RevisionDojo
practice paper it returned `{ questions: [], notes: [] }` — **zero questions and
zero explanation**, because every `notes.push` in it sits inside a branch that
first requires a question to have been recognised. The panel then rendered
"0 questions read · 0 marks" over the line *Everything here has been saved or
discarded*, which told the teacher the run had succeeded.

- **`src/objective.ts`** reads a paper that is numbered questions and nothing
  else, and **`src/paperformats.ts`** is `formats.ts` applied to papers: try each
  reader in order, each refuses what it does not recognise, report on screen
  which one claimed the document. NESA runs first, because its Section I is ten
  numbered questions with four options each and the second reader would
  otherwise claim ten questions of a fourteen-question paper.
- **The refusal condition is silence, not emptiness.** `extractPaper` throws when
  it read no questions *and* had nothing to say. A single page carrying
  `Question 11 (continued)` yields no question and a note naming the parent it
  never saw: the reader has recognised the document and the note is its output.
  A test caught this, which is why the condition is not the obvious one.
- **Repetition alone does not make a line furniture.** The objective reader
  cannot name its running heads the way `extract.ts` and `ibguide.ts` name
  theirs, because it serves any paper of the shape rather than one publisher, so
  it drops what repeats on most pages. That alone would strip `A. Increase` off
  every question of a paper whose options repeat, leaving the count intact —
  this repository's oldest fault in a new reader. The rule is the conjunction: a
  line repeated on most pages that is **neither a numbered stem nor an option**.
  Found by a test failing, not by reading it.
- **A multiple-choice question with no answer key silently marked option A
  correct.** `adopt.ts` has to put something in `correctAnswer` and put the first
  option there; nothing said so, and a thirty-question paper read without its
  markscheme is thirty wrong answers on a marking guide. It is a note now, on
  every reader's questions.

Verified by driving it on `../klunk-content`: the RevisionDojo paper read to 30
questions and 30 marks with the line *Klunk read this as a paper of numbered
multiple-choice questions*, every question READY and so valid against
`bank.schema.json`, pictures cut out, and the missing-answer note on each. The
85-page IB subject guide fed to the same tab was refused by name. The 2019 NESA
paper still reads to fourteen questions and forty marks and reports itself as a
NSW HSC examination.

**This is not IB extraction and must not be described as one.** The document is
RevisionDojo's practice paper, not the IB's; no IB specimen is in the folder
(#45). What it demonstrates is that a plainly-numbered multiple-choice paper
reads, whoever set it.

## Reading a marking guide

**The marking guide side is the same arrangement, and its silent failure was the
worse one** (#66). `guide.ts` is NESA's, `answerkey.ts` reads a markscheme that
is a grid of `1. D` pairs, and `guideformats.ts` picks between them. The
RevisionDojo markscheme is one page of three interleaved columns and
`extractGuide` returned `{ answerKey: {}, entries: [], mapping: [], notes: [] }`
for it.

**An empty guide is worse than no guide.** `adopt.ts` has to put something in
`correctAnswer` and puts the first option there, so a paper read *with* its
markscheme came out identical to one read without: thirty questions all answered
**A**, ready to print on a marking guide. The teacher had supplied the answers
and Klunk discarded them without a word. #64 lost nothing; this was ready to
publish something false.

- **The contract is contiguity.** Pairs are read wherever they fall on a line, so
  one column or six reads the same, and the numbers must run from 1 with none
  missing and none given two different answers. That is what stops a stray
  `3. B` in prose claiming a document: the 85-page subject guide yields **zero**
  matches and is refused.
- **A year counts as recognition on the guide side too.** `extractGuide` throws
  only when it found no key, no criteria, no mapping, nothing to say *and* no
  year — a guide holding only `2021 HSC Design and Technology` is what
  `applyGuide` uses to warn that paper and guide are from different years. A test
  caught this being left out, the same way the paper side's did.
- **A guide that cannot be read does not take the paper down with it.** It is
  reported against the paper as a whole and named, because losing thirty read
  questions because the second file was the wrong one is the worse trade.

Verified by driving it: paper and markscheme together give all thirty questions
an answer, checked against the markscheme by hand for the first four
(D, B, B, A), with the option text agreeing (`5th percentile`, `Comfort and
fatigue`, `Shell structure`, `withstand squeezing forces`). Pointing the guide
slot at the subject guide instead left all thirty questions on screen with the
failure named against the file.

**One method note from that session.** The first browser check appeared to show
the subject guide being *claimed* as a markscheme, which would have been a bad
false positive. It was stale DOM: `setRead(null)` had not flushed when the wait
loop first looked, so it read the previous run's cards and format line. A probe
straight at `readAnswerKey` showed zero matches and a refusal. **Wait for the
old result to clear before waiting for the new one**, or the check confirms the
run before it.

## A marking guide no reader knows, through an AI

**A marking guide no reader knows goes to an AI too, and it can be measured
against a reader in a way the paper side never could** (#94). The other half of
#89: `guideformats.ts` already asked `hasNoText` after both readers refused, and
the refusal opened onto nothing. Three things were established building it.

- **The gate is now any refusal, on both sides.** #89 opened the paper route only
  for a document holding no text, so that a shape worth a reader was never sent
  to an AI instead. That holds for NESA and the IB and for nobody else: outside
  them there is no publisher standard to write a reader against, and a reader has
  already refused by the time the route is offered. `scanned` therefore only
  changes the opening line of the prompt, and telling a teacher their
  text-bearing paper is a scan is what would make a refusal read as a fault.
- **A scanned pair lost its marking guide in silence.** `readPaper` reads the
  paper first and the guide inside the same `try`, so a refused paper threw
  before `guidePath` was touched: the file sat in its box and nothing said it had
  been ignored. `readReply` reads it now, and `markingFromGuide` puts a guide
  Klunk *can* read onto questions an AI transcribed, which is the pairing that
  had no route at all.
- **The prompt carries no question text, and that is what keeps the privacy
  claim where #89 left it.** Klunk holds the questions, so the skeleton is
  number, marks, type, part labels and how many options there are to choose
  between. The guide prints the same numbers on its own pages. The teacher
  attaches the guide and nothing else leaves the machine.

**Measured against `guide.ts` on the 2019 D&T guide**, which is the check #89
could not have: an AI transcription of that document put **the same ten answers,
the same outcomes on all fourteen questions, and the same criteria including
every band** (Q13's `2–3` and Q14's five) onto the paper as the deterministic
reader. Both paths ended with zero questions in error, and the reader's own
output through the new path is identical to `applyGuide`'s. The two differences
were the AI being the more faithful of the two: a line break `guide.ts` flattens,
and `Answers could include:` arriving as its ten entries rather than as one
paragraph in `sampleAnswer`.

Three decisions worth not reversing.

- **`Marking` is not `ExtractedGuide`.** Reusing it was the first design and it
  is a NESA Section I: `answerKey` is one letter per question, and the two
  scanned Enterprise Computing papers set six of their fifteen objective
  questions as multiple response or matching. It would have thrown away the
  answers to 40% of Section I on the documents this was built for.
- **`applyMarking` works after adoption, not before.** That is the one point both
  routes into the screen have in common, and it is `applyYear`'s reason: re-reading
  would throw away every picture already dropped and every question already
  discarded. `applyGuide` is untouched and still runs before adoption for a paper
  and guide Klunk both read.
- **Nothing invents an answer, and every answer that lands says a model read it.**
  Absent stays absent, an empty list is nothing stated rather than "none of
  these", a letter naming an option the paper never printed is reported instead
  of resolved, and two answers on a one-answer question are refused rather than
  chosen between. #66 published something false quietly from an empty file; a
  model is a more confident source than that.

Two faults were found by driving it and neither is visible in the source. **A
reply that marks one question twice** had its second entry dropped by a `find`,
which is where a contradiction between two readings would hide. And
**`answersCouldInclude` printed on the marking guide and appeared nowhere on
screen**, so the longest part of a NESA guide could not be read before saving,
which is this screen's one rule. Nothing had ever populated the field before
this, which is why it had gone unnoticed.

**A tag says what a model did, not that one was involved.** #89 raised this and
#94 made it sharper by adding a third case. There are now three claims and they
are three tags: `ai-drafted` where the model wrote the question, `ai-transcribed`
where it copied one off a document Klunk could not read, and `ai-marked` where it
supplied the answers or the criteria.

- **The signal is `ctx.paper`, which is already what turns a question number into
  provenance**, so nothing new had to be passed in. An AI tag the model wrote
  itself is dropped before Klunk's own is added: a transcription arriving claiming
  to be drafted is claiming something Klunk is in a position to know is false.
- **`ai-marked` exists because a note does not survive saving.** `CHECK_THE_ANSWER`
  is on screen for as long as the review panel is; the answers and criteria print
  on a marking guide months later, and a teacher asking where a criterion came
  from has nothing else to read. It is stamped only where the marking actually
  changed the question, since an entry that answers nothing supplied nothing.
- **`Marking.byAi` had to exist for any of it to be true.** `applyMarking` serves
  both an AI's reading and `markingFromGuide`, which is Klunk's own, and the
  entries are identical by design. Without it a guide `guide.ts` read perfectly
  well was stamped *This answer was transcribed by an AI* — Klunk making a false
  statement about its own work, in the one direction nobody would think to check.
- Banks written before this keep the tag they were written with. Klunk does not
  rewrite a bank, and a tag records what was believed when the question was saved.

One fix came out of it that has nothing to do with marking guides: **`ingest.ts`
dropped `marksTo`**, so a drafted extended response arrived with its bands
collapsed to their bottom marks. `looksBanded` then saw marks descending and
validation passed, and the printed guide said `13` where the examination prints
`13–15`. `prompt.ts` never asked for the field either, and its worked example
taught the collapse.

Verified by driving it on `../klunk-content`: the 2019 paper read with the IB
subject guide in the marking guide slot, which every reader refuses; the panel
offered the prompt built from the real fourteen questions with the outcome codes
of the HSC course; a reply pasted back put B on Question 1 as
`Water-saving capabilities (correct)`, the part criteria on Question 11, the
bands on 13 and 14, and `ANSWERS COULD INCLUDE` on the review card; a `Z` answer
on a short-answer question was refused by name, a second entry for Question 1 was
reported rather than dropped, and an entry for a Question 15 that does not exist
was named. Fourteen questions and forty marks saved to
`bank/issue-94-guide-check.json`, which validates against `bank.schema.json` with
the ten answers matching the printed key and both bands intact. The subject guide
fed to the *paper* slot now opens the transcription route as well, with a prompt
that does not call it a scan.

## Pictures out of a paper

**Pictures come too** (#24). The page is rendered and the picture cut out of the
band where the text is not, as a proposal the teacher keeps or drops before
anything is written; kept ones are written beside the bank and referenced as
`stimulus`. Rendering rather than lifting image objects out, because the papers
mix photographs with vector diagrams and only rendering handles both.

The cost is real: pdf.js takes `dist-single` from 166 kB to **1.8 MB**. It
lazy-loads in the hosted build, which only went 140 kB to 163 kB.

## What a question may say

**#23 settled three things `bank.schema.json` could not say**: a criterion may
carry `marksTo` so a band stays a band, a part may carry its own criteria, and a
question may have no text when its parts do the asking. All three are what the
examinations actually print.

## Describing your own examination

**A teacher of any subject can describe their own examination** (#27), on the
Papers tab and the first-run screen. `src/profile.tsx` is a form over
`profile.schema.json`, `validateProfile` restates its rules, and four of those
rules go beyond the schema because each produces a profile that looks fine and
then rejects every paper built against it. Klunk shipping one profile and telling
everyone else to copy a JSON file was the same failure `src/shipped.ts` was
written to fix, left in place for every subject but D&T. **#8 is now a teacher's
afternoon rather than a code change.**

## Building a syllabus model in the app

**A syllabus model is built from the `.docx` in the app** (#28, the 2013 half).
`src/docx.ts` reads one zip member with `DecompressionStream`; `src/syllabus.ts`
is the parser and takes XML and no file. `src/syllabus.corpus.test.ts` checks it
against the Python tool on all four documents and they agree exactly, which is
what makes the port trustworthy rather than merely plausible.

**The document does not have to be in the folder** (#57). It was offered only
from a scan of the folder, and a folder holding none got a panel saying to go
and put one there, which is an instruction where a control belongs: a syllabus
is downloaded to Downloads, and nothing about building a model requires it to be
moved first. So `syllabusreader.tsx` takes one from anywhere, by picker or by
drop, and reads it where it lies **without copying it in**. The model is the
artefact this screen writes, it records the filename as its source, and it goes
into the folder either way. Driven on a brand new empty folder: Drama read from
`~/Downloads` to 3 / 15 / 18 and 3 / 20 / 19, saved and validating, and the same
file read through the folder select afterwards gave the identical parse.

**All three shapes of NESA syllabus now read** (#28, #34). `src/ooxml.ts` reports
what the markup says about each paragraph — text, heading level, bold, list — and
decides nothing; `src/headings.ts` holds the two new readers; `src/formats.ts`
picks between all three and reports which one claimed the document, on screen,
because if Klunk has taken a document for the wrong shape the counts underneath
are what shows it. Each reader refuses what it does not recognise rather than
producing half a model, which is what makes trying them in order safe. The 2013
reader goes first: Design and Technology has headings too and would be read badly
by the others.

Verified in the browser against `../klunk-content`, not just reasoned about:
Drama, English Advanced and Visual Arts each read to the counts above, Visual Arts
written to `syllabus/nsw-hsc-visual-arts.json` and validating, and its seventeen
HSC topics then offered by name on the Draft with AI tab.

**And a junior syllabus reads, which no document had ever tested** (#50). A 7–10
syllabus is the same shape and needed no fourth reader; it was refused by
`courseNamed` not knowing a stage and by the code pattern not admitting the digit
in `CT4-`/`CT5-`. Both are fixed, along with the cross-reference line the second
fix would have switched on. The findings are in
[reading-syllabuses.md](reading-syllabuses.md); the decision
that matters downstream is that **a junior course is a stage**, which #49 branches
on.

Verified in the browser against `../klunk-content`, not just by the corpus test:
Computing Technology 7–10 read to 24 / 246 / 1 (Stage 4) and 24 / 246 / 10
(Stage 5) with the line *Klunk read this as a syllabus that sets out each topic
under Outcomes and Content headings*, the six focus areas as groups, all ten
Stage 5 outcomes `CT5-` with their wording and no `CTLS-` anywhere, `S5-24` tagged
with eight of them, 246 point ids running `S5-01.01` to `S5-24.06`, written to
`syllabus/nsw-computing-technology-7-10.json` and validating against
`syllabus.schema.json`, and both courses then offered by name on the Draft with AI
tab.

**And the 2017 sciences read, structure and all** (#77, #78). Biology Stage 6
(2017) is the live HSC syllabus and was refused outright by three separate rules;
once it read, the reading was flat, which lost the sub-items and the capability
tags — about 40% of what the content means, with every count still looking
right. Both are fixed and checked in the browser by the user.

The regression numbers are 19 / 122 / 11 and 24 / 149 / 11 with the modules as
groups, and `src/headings.corpus.test.ts` now gates each document separately, so
one absent file no longer skips the whole corpus in silence (#65 in the middle of
a fix rather than in theory).

## The IB model, out of two unrelated documents

**IB DP Design Technology reads too, from a spreadsheet** (#4). `src/xlsx.ts` is
the workbook half of what `ooxml.ts` does for Word: shared strings, merged cells
carried down, rows out, deciding nothing. `src/ibdt.ts` is the reader and takes
rows and no file. It finds the sheet by its six column headings rather than by
coordinates, so it refuses the other seven sheets of the workbook instead of
reading assessment comparisons as content.

Klunk still ships no model. The document is the teacher's own copy of the
old-to-new syllabus map, and the model goes into their folder as
`syllabus/ib-dp-design-technology.json` with `framework: IB` and the IB's licence
on it.

Verified in the browser against `../klunk-content`, and then against the guide
itself: the map read to 13 / 79 (SL) and 24 / 161 (HL), the model saved and
validates against `syllabus.schema.json`, both courses are offered on the Draft
with AI tab, and all eleven HL-only topics appear under Higher level and none
under Standard level. The guide's Overview table names the same twenty-four
topics with the same eleven HL markers, and A1.1 and A2.1 hold exactly the seven
and five understandings the model gives them.

**And now from the guide itself, which is what should have been read first**
(#58). The spreadsheet is not the IB's: it is a third party's transcription, a
teacher may not have it, and nothing obliges one to exist for the next revision.
`src/ibguide.ts` takes positioned text and no PDF, the way `src/extract.ts`
does, so every rule in it is testable without one and `src/pdftext.ts` stays the
only place pdf.js is named. `src/ibdt.ts` now also holds the SL/HL split both
readers use, because two copies of it would drift and the agreement between the
two models is the whole point.

The guide reader carries no more than the map does — not the guiding question,
the teaching hours or the linking questions, all of which the guide prints. That
is deliberate and is a schema question rather than a parsing one: one identical
model out of two unrelated documents is what makes either trustworthy, and a
field on one side only spends that check.

Verified by driving it on `../klunk-content`: the guide read to 13 / 79 and
24 / 161 with the three themes as focus areas and `A1.1 People: Ergonomics` as
the first topic name, the replace-cost panel said no question loses a tag
because every id matches, the model saved over the map-derived one and validates,
and B1.1's 1.1.2 is whole, C4.1's 4.1.5 carries its own paragraph, `multi-meters`
is one word and no content point holds a running head. A past paper and the
Biology PDF were both offered in the same list and both refused by name, the
second being told to use the Word download.

**The cost is that the syllabus tab now offers every PDF in the folder**, which
is 36 documents where it was 9, most of them past papers already counted on the
tab beside it. Klunk cannot tell which PDF is a syllabus without opening it, and
a badge reading 9 over a list of 36 is the worse fault, so the badge counts what
the list holds.

## A tag belongs to a course

**A tag is resolved against its course, not against the whole model** (#47). An
id is only unique within a course, and the app had assumed it was unique within a
syllabus. Every NESA model mints topic ids from the course id, so `PRE-01` and
`HSC-01` cannot collide however much content two courses share, which is why
Visual Arts holding the same 132 points in both courses never showed it. The IB
model uses the code its guide prints, so Standard level and Higher level both
hold `A1-1`, and three things broke at once: the topic filter offered every SL
topic twice under one value, so a `<select>` snapped to the first and choosing
Higher level left the box reading Standard level; Preact reported the duplicate
key; and `costOfReplacing` said a point deleted from Standard level cost nothing,
because Higher level still had it. That last one is #44's own failure mode coming
back through a door #44 could not see.

`taggedIds` now returns `{ all, byCourse }` and `idsFor` picks between them. The
rule everywhere is the one `inSyllabus` already took a level up: **a question
naming a course is held to that course, and one naming none is held to the whole
model**, because all that is known then is a bare id that could belong to any
course in it. A course the model does not have falls back to the whole model too,
for the same reason: it is a fault, but marking every one of that question's tags
dead would say something false and loud about ids that are perfectly real.

## Correcting a model before it is written

**A syllabus can be read topic by topic and corrected before it is written**
(#42). "Check what was found" was four numbers and a list of focus areas, which is
everything #26 says is not enough: the count was right while the content was
wrong. So `src/syllabusreview.tsx` puts every topic on screen with its group, its
outcomes, its content points and their ids, and the published heading where the
tidied name has moved away from it, because that is the line a teacher compares
against the page. `src/syllabusedit.ts` holds the corrections as pure functions
over `SyllabusCourse[]`, so all of it is testable without a `.docx`: merge a topic
into the one above (#26 by hand), split one at a content point (the same rule
firing wrongly), clear the group across a whole course (#14 by hand), edit or
delete any name, point, outcome or skill, add a point the reader dropped.

Three decisions worth not reversing. **Ids never renumber**: deleting `HSC-02`
leaves `HSC-03` alone and a new topic takes an id past the end, never a vacated
one, because a question tags itself with a topic id and the screen offers to
replace a model that questions already point at. **Nothing is dropped for being
empty** except a skill, which nothing references; an empty point or outcome is
reported by `problemsWith` and disables Save, so a line cleared by accident is
said out loud rather than quietly lost. And **reading is a separate mode from
editing**, because the collapsed list of topic names is where a content point
masquerading as a heading is obvious, and a page of textareas is a worse thing to
read than a page of text.

Verified by driving it, which is also how #43 was found: Textiles read to
18 / 104 / 11 and 15 / 80 / 13, the bad topic merged with one click, the counts
moved to 17 / 105 with the summary above following, the split put it back and took
`PRE-19` rather than the vacated `PRE-05`, Undo every change returned the parse,
an emptied heading blocked the save by name, and the corrected model was written
and validates against `syllabus.schema.json`. Mathematics renders all 201 Year 11
points in about half a second. Drama and the outcome list both needed boxes that
grow to their content: those documents write content and outcomes as whole
paragraphs, and a two-row box clips them mid-sentence, which is useless for the
one job the panel has.

## A profile names a course

**A profile names a course, not just a subject** (#49). A subject runs across
several years and every year sets its own papers, so `Year 9 Science mid-year`
and `Year 9 Science end-of-year` are the ordinary case rather than the exotic
one. Three of the four levels were already there: `courses[]` is the year and is
already plural, `courseNamed` mints `y9` from `Year N` with no new code, topic
ids are prefixed per course so two years cannot collide, and several profiles in
one folder was never counted. The missing edge was on the profile, which named a
syllabus and could not name a course, while a question has carried
`syllabus.courseId` since the beginning.

`inCourse` in `src/storage.ts` is the sibling of `inSyllabus` and takes
**deliberately the same rule rather than a stricter one**: a question naming a
course is held to it, one naming none is offered, because all that is known then
is a bare topic id that could belong to any course in the model. That is #47's
reading and it matters more here, since every question written before this field
existed names no course and holding them out would empty the rail. It reads off
the question and not off `QuestionRef`, because unlike a syllabus a course has no
bank-level default to fall back to: `bank.schema.json` carries `syllabusId` and
no `courseId`.

Two things beyond the filter. `validateProfile` now takes the folder's models and
rejects a course the named one does not have, because a course id that names
nothing filters every question away and the builder shows an empty rail with the
*profile* being what is wrong, which is the same argument as the sections adding
up. A model that is not in the folder is left alone, as in `modelcheck.ts`. And
`newPaper` fills `school.course` and `school.yearGroup` from the syllabus and
course names, which the cover has always printed and **nothing in the app has
ever written**: until now only a hand-edited file filled them.

Verified by driving it on `../klunk-content`, which holds the IB model with
Standard and Higher level sharing topic ids. The course select offered both, SL
was saved to the profile file, an HL question written through the editor onto an
HL-only topic (11 of them, matching the guide) was **not** offered into the SL
paper while the SL one was, the cover printed `Design Technology · Standard
level`, and with the course cleared the rail said so by name and offered both.
Adding the HL question that way and then setting the course back produced
`Question 2 is for Higher level, and this paper is for Standard level`, by name
rather than by id, as a warning rather than an error so the paper still prints.

One test bug worth not repeating, and it is the same one #44 turned up, made
again in the test written to avoid it: a helper with `syllabusId: string |
undefined = 'nsw-science-7-10'` swallows an explicit `undefined` and checks the
default, so a case named "names no syllabus" passed while checking something
else. It failed for the right reason only because the rule it was testing works.
`null` is what that parameter has to take.

## Tags that name nothing, and two models of one document

**A syllabus tag that names nothing is now reported, and so are two models of one
document** (#44). Both were silent, and both are what a re-read over a corrected
model produces. `src/modelcheck.ts` holds all of it, taking loaded models rather
than a folder so it tests without one.

Three things it will not do, and each is a case where firing would make the
warning noise a teacher learns to ignore. **A question naming no syllabus is left
alone**, because all that is known is the bare id and it could belong to any model
in the folder, which is the reading `inSyllabus` already takes. **A model that is
not in the folder is left alone**, because Klunk ships none and a bank naming one
the teacher has not generated is ordinary. And **two editions of one subject are
left alone**, which is #29 and is normal: two editions are two different
documents, so they do not share a `source.title`, and `source.title` is the key.

Before saving, the reader says what replacing would cost, counted rather than
promised: which ids the model in the folder has that the one on screen lacks, and
how many questions cite them. Only an id the folder's model has and the new one
lacks counts, since an id neither has changes nothing by being replaced. **Replace
it stays enabled**, because a teacher re-reading an amended syllabus may accept
losing tags and retag afterwards, and the count is what lets them choose.

Driven end to end on `../klunk-content`, including the destructive half with the
model backed up first and restored after: deleting HSC-01 from D&T predicted five
questions and named five ids, saving it struck those chips through in the question
detail and left `H1.1` live, and the paper checker flagged all five on the trial
paper in both sections. The duplicate notice caught a real one already in the
folder without being told to look.

One test bug worth not repeating, found because a case failed for the right
reason: a helper with `syllabusId: string | undefined = 'dt'` swallows an explicit
`undefined` argument and falls back to the default, so a test named "names no
syllabus" was quietly checking the default instead. Both helpers now take `null`
for that.

**`syllabusVersion` no longer defaults to `Stage 6 (2013)`.** That was true of the
only two documents Klunk could read when it was written and is false of the four
added since. It is a field a teacher reads to tell which edition their questions
are tagged against, and two editions of a subject run at once (#29), so the reader
asks for it and prefills only where the format settles it, which is the
content-table layout.

## Unsaved changes

**A paper says when it has unsaved changes, and everything that would discard
them asks first** (#11, #21). `paperIsDirty` compares against the folder with
object keys sorted, so a hand-edited file does not read as permanently dirty.
The guard covers all four paths that clear a paper, not the one that had a
confirm bolted to it.

## The help screen

**A teacher can read how Klunk works** (#38). `src/help.tsx` is the one screen
that is prose rather than a form: the shape of the work, what lands in the
folder, the three ways questions get in, and troubleshooting keyed to the exact
words on screen so it can be scanned for what a teacher is looking at. Most of it
is not a description of buttons but the *reasons* behind the decisions that read
as faults from outside — no syllabus ships, the AI step is copy-and-paste, a
missing picture prints a grey box, the browser asks for the folder again.

**The help page carries the one address in Klunk that points off this computer**
(#40), the issue tracker, for the teacher who has nobody local to ask or whose
problem is a fault rather than a mistake. It does not touch the no-network claim
and the CSP is unchanged: `connect-src 'none'` and `form-action 'none'` govern
requests the page makes, and a link is navigation that happens only on a click.
The copy says so, and says in the same breath that anything posted there is
public, because a teacher reporting "this question prints wrongly" would
otherwise paste an unreleased trial into a public issue.

Two decisions there are structural. It is a screen and not a link, because
`connect-src 'none'` forbids fetching a documentation site and `build:single` is
one HTML file on a shared drive with nothing beside it. And it hangs off the
masthead rather than being a sixth tab, because a tab only exists once a folder
is open and the teacher most in need of help is the one still looking at "Choose
your folder" — driven on a fresh origin to prove it. Everything else is hidden
rather than unmounted while it is open, for the reason the tabs are hidden while
the editor is: a half-written question survived a trip to help and back.

## Folders: switching, lapsed grants, a folder that has gone

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

## The manifest: what each document turned out to be

**The folder remembers what each document turned out to be** (#74), which is what
#73 wanted: "From a syllabus" was offering 37 documents of which 24 were past
papers and marking guides. `src/manifest.ts` is pure over plain values,
`manifest.json` is the one file Klunk owns that is found by **path rather than by
`type`**, and `DocumentOptions` in `fields.tsx` sorts every list of documents into
what this slot wants, what nobody has opened, and what is known to be something
else.

Four decisions worth not reversing:

- **It is a cache and is treated as one everywhere.** It holds no content and
  decides nothing: a reader still refuses what it does not recognise, and an
  entry only orders a list or adds a line. A manifest that will not parse is
  **ignored in silence rather than reported**, because a derived file the teacher
  never wrote has no business putting a fault on their screen. Driven with
  `{ this is not json at all ]]` in it: the app was unaffected, said nothing, and
  the next refusal rebuilt the file.
- **A refusal is recorded, and it is the half that fills fastest.** A successful
  read needs a teacher to get all the way through; a refusal costs seconds and
  answers exactly the question the list is asking. It is also the only knowledge
  the folder had been throwing away entirely: a bank records the examination and
  the year and **never the filename**, so nothing linked fourteen questions to
  `dt-2019-paper.pdf` until now.
- **Nothing is ever dropped from a list.** Before the subject guide was offered
  on the syllabus tab at all it could not be read at all (#58), and a confident
  filter puts Klunk straight back there. `groupFor` reorders and a test asserts
  every path comes out the other side.
- **Reading a slot successfully clears that slot's refusal**, because a file
  replaced under the same name is the case that matters. Refusals otherwise
  accumulate: the subject guide reads as a syllabus and is refused as a
  markscheme, and both are true at once.

**The write path had a lost update, and only driving it showed the fault.**
Reading a paper with its marking guide files two notes in the same tick.
Re-reading the manifest from disk before merging is what makes two teachers on
one OneDrive folder safe, and it does nothing at all for one tab racing itself:
both notes read the file before either wrote, so the guide was recorded and **the
paper silently was not**. Manifest writes are serialised through one promise
chain in `storage.ts` now. The test suite was green throughout, and the manifest
on disk looked entirely reasonable — it was simply missing a row.

Verified by driving it on `../klunk-content`: a past paper refused on the syllabus
tab sank to *Not a syllabus* without a reload, Drama read to *Syllabus documents*,
the 2019 paper and its guide read to *Past papers* and *Not a past paper*, saving
fourteen questions recorded `into` and put `Already read into
bank/manifest-check.json on 2026-08-08.` under the paper slot on the next visit,
and the schema validates the real file and rejects an unknown purpose, a missing
path, a wrong `formatVersion` and a repeated refusal.

**The cold start is a corner case, and the first reading of this overstated it.**
A manifest knows only what has been touched, which sounds like it leaves a fresh
folder unlabelled on the day the list is longest. It does not, because of how
documents get into a folder in the first place: a past paper picked from the
computer is **copied into `source/` by Klunk** and read on the same screen, so
entering the folder and being labelled happen in one visit, and a syllabus
document is read where it lies and **never copied in at all** (#57). So the
folder's PDFs are, in normal use, exactly the set the paper tab put there and
read, and the manifest fills in step with them.

Two things narrow it further. A shared or inherited folder **arrives with its
manifest**, since the file lives in the folder rather than in one teacher's
browser, which is what that decision buys. And an unlabelled document only stays
unlabelled until somebody opens it once.

What is left is a teacher who copies documents in by hand through Explorer or
OneDrive rather than through Klunk. That is real and it is narrow.
`../klunk-content` is exactly that case — assembled by hand, and therefore the
worst folder in existence for judging this, which is how the first reading went
wrong. It makes #68's detection a convenience rather than the thing #73 depends
on.

## A topic name and the area it sits in

**A topic name is unique inside a focus area, not inside a course** (#75), which
Computing Technology 7–10 is the first document to show. Its six focus areas each
hold the same four topics — `Identifying and defining`, `Researching and
planning`, `Producing and implementing`, `Testing and evaluating` — so Stage 5 is
24 topics with four names between them. The model was right and carried the group
throughout; three of the five places a topic is offered or shown printed the name
alone.

- The area is an **`optgroup` in a select scoped to one course** (the question
  editor's and the prompt factory's, through `TopicOptions` in `fields.tsx`) and
  a **heading over its topics** in the review panel. A prefix says the same thing
  and costs seventy characters on every row: this syllabus writes the strand into
  the area, `Enterprise information systems: Modelling networks and social
  connections`. The library's filter keeps the prefix, because it spans every
  model in the folder and spends its one level of grouping on saying which — HTML
  has no nested `optgroup`.
- A chip has nowhere to put a heading, so there the area is a second line above
  the name, smaller and lighter.

**The word for that division is the document's, and is recorded rather than
inferred.** `group` stays the field name. `unit` was considered and rejected: no
document Klunk reads calls it one, NSW already uses "unit" for credit weighting
and again for a teacher's unit of work, and the rename would reject every model
already in a folder under `additionalProperties: false`. What was actually wrong
was the word on screen, which was hardcoded `Focus area` for all four vocabularies.

- `Syllabus.groupLabel` is optional and set by the reader that read the document:
  the 2013 reader captures the literal word its heading used, so Textiles says
  `Area of study` and Industrial Technology `Focus area`; the reform reader says
  `Focus area`, the prose reader `Content area`, and both IB readers `Theme`.
- **Written only where a course actually has a group**, so Design and Technology
  and Drama carry no word for a division they do not have.
- The Python generator is untouched, and so is the comparison against it: the
  field is on the syllabus rather than on a course, and that test compares
  `courses` alone.
- A model saved before the field existed falls back to `Focus area`, or to
  `Theme` when its framework is `IB` — the only evidence such a model carries.
- **Pluralising it is not `+ 's'`.** Driving the panel over the real Textiles
  document printed "Area of studys" over the three areas it had just found
  correctly. English pluralises the head noun of a noun phrase, which is the word
  before `of`. `pluralLabel` in `syllabusreview.tsx`, with a test, because the
  fault is invisible in the code and unmissable on screen.

## Reading a saved model

**A syllabus model was write-only, and now it can be read** (#76). `SyllabusReview`
put every topic on screen with its area, outcomes, content points and ids, and was
reachable only between reading a document and saving the model. After Save, all a
teacher could see of their own syllabus was topic *names* in two dropdowns — and
tagging a question means choosing an id.

- **The same panel, not a second read-only rendering of it.** `onChange` is
  optional: given, the panel corrects; omitted, it reads. Two components over the
  same topics is how they stop agreeing about what a topic looks like.
- Correcting a *saved* model is deliberately not built. It needs the replace-cost
  count (#44) and a write path, and the reading half is what was blocking a
  teacher.
- The tab is **`Syllabus`**, not `From a syllabus`, and its badge counts the
  models rather than the documents on offer. #74 put the document count there on
  the principle that a badge counts what the list holds, and the list that tab
  opened on was the documents; it opens on the models now, and 36 over a folder
  holding two syllabuses would be that fault the other way up.

Verified by driving it on `../klunk-content`: all five models listed with their
courses and counts, the IB one reading `Themes:` off the framework fallback;
Computing Technology opening to 12 area headings over 48 topic rows across its two
stages, `S4-05` showing its area and its twelve content points with ids, and no
input or Fix button anywhere in it; the editor and the factory both offering Stage
5 as six `optgroup`s of four, three same-named topics chosen and told apart on
their chips; Design and Technology getting a plain list, having no areas; and
Textiles re-read through the reader to `Areas of study: Design · …`, an
`AREA OF STUDY` heading over each, and `Clear the area of study on all 18 topics`.

Note on history: the commit "Papers survive a moved or renamed bank" also contains
the stimulus-image loading, which its message does not mention.
