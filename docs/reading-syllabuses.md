# Reading syllabus documents

Established from real syllabuses — the 2013 NESA content tables, the prose and
headings shapes, the reform exports, the 2017 sciences, a junior 7–10 document,
and the IB DP Design Technology guide and syllabus map. **Do not re-derive any
of it, and do not contradict it without new evidence.**

Read this before touching `src/syllabus.ts`, `src/headings.ts`, `src/ibdt.ts`,
`src/ibguide.ts`, `src/formats.ts`, `src/ooxml.ts`, `src/xlsx.ts`,
`src/syllabusedit.ts` or `tools/nesa_stage6_syllabus.py`. The counts every one
of those must still produce are in [corpus-counts.md](corpus-counts.md).

---

## NESA Stage 6 (2013): the content tables

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

## Two more NESA shapes, neither using a table

**There is no third table layout. There are two more shapes, and neither uses a
table for content at all** (#34, #28). Established from Visual Arts Stage 6
(2016), Drama Stage 6 (2009), English Advanced 11–12 (2024) and Mathematics
Advanced 11–12 (2024).

- **Visual Arts's `Content | Preliminary course | HSC course` table is the
  *outcomes* table, not a content table.** Its rows are content areas
  (`practice`, `frames`, `representation`) and its cells hold `P1:…`/`H1:…`. The
  content is section 8, prose under headings.
- **That table shape is the one thing every non-2013 document shares.** Drama
  heads its `Objectives | Preliminary Course Outcomes | HSC Course Outcomes` and
  the 2024 exports head theirs `Year 11 | Year 12`. In all three the *column*
  names the course. It is not optional: Drama's H2.5 is in that table and
  attached to no topic, so a model built from the topic blocks alone is an
  outcome short.
- **Drama and the 2024 exports share a second contract: a course section holding
  a repeating `[topic heading, "Outcomes", "Content"]`.** They disagree on
  everything else. The outcome code opens the line in Drama (`P1.1 develops…`)
  and closes it in the 2024 exports (`…shapes meaning EAV-11-01`); content
  points are paragraphs in Drama and bullets in the exports; the exports carry a
  further level of sub-heading inside `Content` and Drama carries none.
- **Heading level numbers cannot be ranked.** Drama styles the first topic of
  8.1 `Head5` and the next two `Heading3`, and styles `Content` as `Heading3`
  under two topics and `Head6` under the third. What decides whether a heading
  opens a section is whether the *next* heading is `Outcomes` or `Content`.
  Levels are used for one thing only, where they do agree: a heading at or above
  the course heading's level ends the course.
- **Bold means heading in Visual Arts and means nothing in Drama.** All sixty
  Visual Arts headings are entirely bold and no body paragraph is, and the
  document carries no `w:pStyle` at all; Drama styles its headings properly and
  also bolds ordinary sentences. So the bold rule is scoped to the prose reader,
  which also requires a bold, numbered top-level section titled `Content`.
  `w:val="0"` has to be honoured or half of each document reads as bold.
- **`w:outlineLvl` is not enough even in Visual Arts**: `8.5 The Frames` carries
  none. The section number Word concatenates onto the heading text
  (`8.3Practice in…`) is the reliable depth.
- **Visual Arts content is shared between the courses**, and the syllabus says
  so. 8.1 is Preliminary, 8.2 is HSC, 8.3 to 8.5 are for both, so both courses
  carry the same 132 points. Its topics get **no outcomes**: the outcomes map to
  content areas, three of which have no section, and pairing them by name would
  be the #14 mistake again. `outcomesFor` in `src/prompt.ts` already falls back
  to the whole course.
- **Word keeps mathematics in its own namespace.** Reading `<w:t>` alone silently
  mutilates **159 of the 359** content points in Mathematics Advanced, leaving
  sentences that still parse and still count. `<m:t>` has to be read too. What
  comes back is linear and lossy, `y=ax2+bx+c`, because the structure is in the
  elements. Mathematics Advanced is the only one of the six documents with any,
  so this cannot disturb the others.

Music 1 is published only as a legacy `.doc`, which is not a zip and which
`src/docx.ts` cannot open. Drama is the Creative Arts sibling that #34 asked for.

## The NSW Curriculum Reform documents

**The NSW Curriculum Reform syllabuses are a different document, not a new
wrapper.** Established from Biology 11–12 (2025), English Advanced 11–12 (2024)
and Mathematics Advanced 11–12 (2024), all in `../klunk-content/source/`:
- **No content tables at all.** Headings and bulleted lists. `parseSyllabusXml`
  refuses all three, correctly; `parseHeadingsXml` reads them.
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

## A junior syllabus is a stage, not a year

**A junior syllabus is the reform contract again, organised by stage.**
Established from Computing Technology 7–10 (2022), the first Years 7–10 document
ever read, which settled #50:
- **A junior course is a stage, not a year.** The document heads its course
  sections `Outcomes and content for Stage 4` and `… Stage 5`, and there is
  nothing in it organised by year. So for #49 a "Year 9 mid-year exam" is a
  paper against **Stage 5**, and the year group is a label on the paper rather
  than a level in the model.
- Structurally it is the reform contract heading for heading — styled levels,
  bullets, `[topic heading, "Outcomes", "Content"]`, the code closing the line —
  so it needed no new reader. It was refused all the same, by two narrow rules,
  and **the second was the dangerous one because it survived the first**.
- **`courseNamed` did not know a stage**, which #50 predicted off the regex.
- **The outcome code carries the stage inside its prefix**, `CT4-ADJ-01`,
  `CT5-SAF-01`, which the code pattern refused: `[A-Z]{1,4}` takes `CT` and then
  neither branch can start at `4`. Silently, and **only for the stage courses** —
  `CTLS-SAF-01` matched, its prefix being all letters. Fixing only the first
  fault would have built Stage 4 and Stage 5 with **zero outcomes**: a model that
  validates, counts plausibly, and has lost what a question is tagged against.
- **`Stage 6` is never a course**, and neither is a plural. It names the syllabus
  — `Drama Stage 6`, `Visual Arts Stage 6` — while the senior courses inside it
  are Preliminary/HSC or Year 11/Year 12. Visual Arts opens with a K–12 continuum
  table headed `Stages 1–3 | Stages 4–5 | Stage 6 | Post-school`, and a stage
  rule that did not say this minted a third, empty course on that syllabus. The
  corpus test caught it; the rule is stages **1 to 5, singular**.
- **A `Related … outcomes:` line closing an `Outcomes` block is a
  cross-reference, not an outcome.** Twelve in the document. `CODE_LAST_RE`
  matches the last code on such a line, handing the topic an outcome from another
  course with the whole sentence as its text. It was invisible until the code
  pattern was fixed: the two faults hid each other.
- **Life Skills is a third course section and Klunk does not model it** (#71).
  It is a course in its own right — its own enrolment numbers, its own `CTLS-`
  codes, 24 / 201 / 10 of its own content, of which exactly **1** of 195 distinct
  point texts also appears in Stage 5. It is kept out by `COURSE_SECTION_RE`
  being anchored and by `courseNamed` refusing anything naming Life Skills. That
  is a decision, and the reform Stage 6 exports are in the same position, so
  English Advanced's and Mathematics Advanced's counts are of their Year 11 and
  Year 12 sections alone.

## The 2017 Stage 6 sciences

**The 2017 Stage 6 science syllabuses are the reform contract a third time, and
they were refused by three rules of which only the first was visible** (#77).
Established from Biology Stage 6 (2017), the live HSC syllabus — the 2025 reform
document takes Year 11 in 2027 while Year 12 stays on this one — and one of five
published together, with Chemistry, Physics, Earth and Environmental Science and
Investigating Science in the same shape:

- **The course heading puts the label last.** `Biology Year 11 Course Content`,
  where Drama writes `Content: … Preliminary Course` and every reform export
  writes `Outcomes and content for Year 11`. The subject opens the heading and
  the label closes it, so `COURSE_SECTION_RE` matched nothing and no course
  opened. That is the whole of the *visible* failure, and fixing it alone gives
  two courses with **zero outcomes**.
- **The outcome code numbers the subject instead of lettering it.** `BIO11-8`,
  `BIO12-15`, and `BIO11/12-1` for the seven Working Scientifically outcomes,
  which **both courses share**. `[A-Z]{1,4}` takes `BIO`, the plain-number branch
  takes `11` and stops short of the hyphen, and the lettered branch cannot start
  at a digit followed by another digit. Fifteen codes, none matching.
- **The order of the branches inside `CODE` is load-bearing, and the outcome
  table is what shows it.** `CODE_FIRST_RE` has nothing anchoring its end, so the
  alternation is decided rather than backtracked into. The table prints its cells
  code-first — `BIO11-8 describes single cells…` — and with the plain-number
  branch tried first that reads as the code `BIO11` carrying the text
  `-8 describes single cells…`: a code naming nothing, wearing the right wording.
  `CODE_LAST_RE` *is* anchored and backtracks its way to the right answer, which
  is why the table shows this and the topic blocks do not.
- **A heading between `Outcomes` and `Content` took the whole topic.** Every
  module prints `Content Focus` and then `Working Scientifically` between the
  two markers, so `Working Scientifically` is a heading whose next heading is
  `Content` — and the rule that opens a topic on that fired on it. The module
  kept its outcomes and lost its content, all sixteen content-bearing topics were
  grouped under `Working Scientifically` in every module alike, and **not one of
  them ended with any outcome at all**. Year 11 read as 23 topics against 19,
  which looks like a parser being generous rather than like a model that has lost
  what a question is tagged against. So an open topic that has stated its
  outcomes and is still waiting for its content is not interrupted; that is a
  no-op on every other document, none of which prints a heading between the two.
- **The three faults hid each other**, exactly as #50's two did. The document is
  refused outright by the first, so the second and third cost nothing until it is
  fixed — and both are silent when they arrive.
- A module is a **group**, not a topic: the topics are the sub-headings inside
  its `Content` block. The seven Working Scientifically skills are topics with
  **no group**, being stated once for the whole course.

## Sub-items, and the capability tags in the markup

**A science content point is an item with sub-items under it, and it carries
capability tags** (#78). This was read flat at first, and the flat reading was
wrong in a way no count could show — every point was real text and the totals
looked like a syllabus. The document prints:

```
Evolution – the Evidence                        ← the topic
Inquiry question: What is the evidence that supports the Theory of Evolution…?
Students:
 ●  investigate, using secondary sources, evidence in support of Darwin and
    Wallace's Theory of Evolution by Natural Selection, including but not
    limited to:                                            [ICT] [Literacy]
 –     biochemical evidence, comparative anatomy, comparative embryology and
       biogeography (ACSBL089)                             [ICT] [Literacy]
 ●  explain modern-day examples that demonstrate evolutionary change, for
    example:
 –     the cane toad
```

- **Both facts are in the markup and were simply discarded.** Nesting is
  `<w:ilvl w:val="0"/>` against `"1"`, which `ooxml.ts` reduced to
  `listed: boolean`; the capability is the **alt text of a picture**,
  `descr=" Information and communication technology capability icon"`, and
  `ooxml.ts` read `<w:t>` and `<m:t>` only. Neither needs an image decoded.
- **`point.parent`, rather than nested arrays.** Points stay one flat array, so
  every existing consumer is untouched and an id never moves because it gained a
  parent. 137 of Biology's 271 points have one. **Two levels only** — there is no
  third, checked rather than assumed.
- **The vocabulary is read from the document, not hardcoded.** The thirteen
  capabilities are the sub-headings of `Learning Across the Curriculum`, and they
  match the thirteen distinct icon descriptions exactly. A document with no such
  section has an empty vocabulary, which matches no picture — which is what makes
  this a no-op everywhere else.
- **The alt text is not consistent, and the vocabulary is what fixes it.**
  `Work and enterprise icon` appears four times and `Work and enterprise` four
  times for the same capability, so both sides are reduced — lowercased, curly
  apostrophes straightened, a trailing ` icon` removed — and what is stored is
  the document's own heading. Not every drawing is a capability: the NESA logo
  and five described diagrams are drawings too, and are told apart by not being
  in the vocabulary rather than by their text ending in `icon`, which
  `Work and enterprise` does not.
- **`Inquiry question:` moves onto the topic** as `topic.inquiryQuestion`. There
  are 29 of them and 29 module topics, so it is one per topic and never a content
  point — a question cannot be tagged against. **One of the 29 carries a
  capability icon of its own**, so `topic.capabilities` exists purely to stop that
  tag being lost in the lift. Found by counting 139 tagged paragraphs against 138
  tagged points, which is the only reason it was noticed at all.
- **`Students:` is dropped**, being the list's own lead-in and the counterpart of
  `A student:` above an `Outcomes` block. Exactly one per topic, 43 in the
  content, which is what shows it is structural rather than written.
- **Anything that mints point ids has to carry `parent` with them.**
  `deletePoint` promotes what hung off the deleted point, `splitTopic` remaps
  across the cut and promotes what was left behind, and `mergeTopicUp` rebuilt
  every moved point from its text alone and so dropped `parent` and
  `capabilities` silently. A dangling parent still validates, because the schema
  checks the shape of an id and not that anything answers to it.
- **The prompt factory sends the item above a chosen sub-item as context**, and
  without an id. `the cane toad` on its own is not something a question can be
  written from, and printing the parent's id would let the reply tag itself
  against a point the teacher never chose.

## A content point stated inside a box

**A content point can be stated inside a box, and skipping every table threw
away two thirds of a syllabus without a word** (#93). Established from Enterprise
Computing 11–12 (2022), which is structurally the reform contract and needed no
new reader. It prints:

```
§  Research the evolution of interactive media
   ┌──────────────────────────────────────────────────────────────┐
   │ Including:                                                   │
   │  §  prevalence of blogs, online video and digital radio      │
   │  §  privacy issues and the use of intellectual property,     │
   │     including Indigenous Cultural and Intellectual Property  │
   └──────────────────────────────────────────────────────────────┘
```

The box is a one-row, one-cell shaded table. `parseHeadingsXml` read content from
`block.kind === 'para'` alone, so all 73 of them went. **Year 11 came out 10 / 58
and Year 12 14 / 82** — 140 points of real syllabus, every count plausible, and
nothing anywhere to say the document held 437. #26, #43 and #78 a fourth time.

- **The box is the nesting, and `w:ilvl` says the opposite.** Biology marks a
  sub-item `ilvl` 1 under an `ilvl` 0 item; here the bullets inside the box are
  at `ilvl` 0, the same depth as the point above, and Word expresses the
  relationship by drawing a box and starting a fresh `w:numId`. A reader trusting
  the level alone gets 437 points as one flat list, which is the reading that
  loses what the box is for: on its own, `sandbox gaming` is not something a
  question can be written from.
- **The rule names the document's own word, not the shape.** There are 74
  one-cell tables and 73 are these; **the 74th is the `Special arrangements
  applying to the NSW Curriculum Reform` licence notice**, which holds bullets of
  its own and would arrive as content. Every other document in the corpus has
  exactly one one-cell table and it is that same notice — Computing Technology,
  English Advanced and Mathematics Advanced one each, Biology, Drama and Visual
  Arts none — so reading the boxes is a **no-op on every existing count**.
- **All 73 follow a `ListParagraph` at `ilvl` 0**, the point they belong to. Not
  one follows a heading, a table or another box, and no box holds a box, so this
  is #78's two levels again and not a third.
- **`Including:` is dropped**, being the box's own lead-in and the counterpart of
  `Students:`. A question cannot be tagged against the word.
- The counts were read off the document by hand before the reader was pointed at
  it: 10 / 180 / 11 and 14 / 257 / 11, the topics being the sub-headings inside
  each focus area's `Content` block.

## A sub-item’s id carries its depth

**A sub-item's id now carries its depth**: `Y11-01.03.01` under `Y11-01.03`,
where it used to be a flat `Y11-01.04` that read as the next sibling. An id is
what a teacher tags a question with and what a chip prints, and #75's lesson is
that a name or an id shown without what it hangs off is ambiguous on screen.

- **`parent` stays the source of truth** and nothing derives one from an id. The
  schema says the arrangement out loud by giving `id` the optional third group
  and `parent` only two: **two levels and no third**, checked rather than assumed
  on both documents.
- **`renumbered` in `syllabusedit.ts` had to learn it too**, or a split or a
  merge quietly flattened every sub-item into a sibling of its parent — and the
  result would still have validated, `parent` still agreeing with the ids, so
  nothing would have said so. A point whose parent did not survive a cut is
  promoted *and* renumbered in the same pass, so an id never describes a nesting
  the point has lost.
- **`kept.length` was the same mistake in `mergeTopicUp`.** Counting every point
  rather than the top-level ones leaves a widening gap in a syllabus that nests.
  `lastPointOrdinal` is what both that and `nextPointId` ask now.
- It renumbers Biology's model on a re-read — 137 of its 271 points have a parent
  — and that cost was checked rather than waved at: **no question in any bank
  tags a Biology point id**, and the only point-id tags anywhere are IB's and
  D&T's, neither of which has a sub-item. #44's replace-cost panel prices it
  either way.

## Two editions of one subject at once

**Two editions of one subject are live at the same time.** The Biology document
states it: 2027 Term 1 starts the new syllabus for Year 11 *while Year 12
continues on the 2017 one*, and the first HSC examination for the new course is
2028. So a folder holding two models for one subject is the normal state for a
year, not an accident. See #29.

## IB DP Design Technology

**IB DP Design Technology changed:** first teaching August 2025, first assessment May
2027. Six core topics plus four HL options became three themes; Paper 3 abolished. **No
past paper exists for the new course**, so its bank must be authored from the subject
guide, not extracted. Do not promise IB extraction.

**The IB structure is established from the guide itself** (`Design technology guide`,
published February 2025, first assessment 2027, in `../klunk-content/source/ib-dt/`),
not inferred:
- **Three themes by four levels of organization**, and the guide's Overview table
  is the authority: `A. Design in theory`, `B. Design in practice`,
  `C. Design in context` across `1. People`, `2. Process`, `3. Product`,
  `4. Production`. Twenty-four topics, numbered `A1.1` … `C4.1`, of which
  **eleven are marked `(HL only)`**, so SL is the other thirteen.
- **A topic is never half HL.** The guide says so per topic, in the heading and
  again in the hours line under it; the syllabus map says it per understanding
  and every understanding of a topic agrees. Either way it is what makes
  splitting SL from HL a whole topic at a time safe, and both readers check it
  rather than assuming it.
- **Each topic is a run of numbered understandings**, and each understanding is
  two things: the statement (`1.1.5 In design, consideration must be given to
  work envelopes…`) and, under it, `Students must be able to …`. The second is
  where the command term lives, so both belong in the content point.
  **Nineteen of the 161 statements are published with no full stop**, which is
  why the two are joined with one added rather than a bare space.
- **The guide is a PDF and the IB publishes no Word export of it**, unlike
  `curriculum.nsw.edu.au`. It is read anyway (`ibguide.ts`, #58), because it is
  the IB's own document. The ManageBac old-to-new **syllabus map `.xlsx`** is
  read too (`ibdt.ts`, #4) and is a near-faithful transcription, but it is a
  third party's and a teacher may not have it, so **the guide is the source of
  truth and the map is the second opinion**, not the other way round.
- **The two readings agree on all 24 topics and all 161 point ids, and differ in
  26 of the 161 texts.** Every difference is the map's: 23 cells drop the
  closing full stop, two join a word broken at a line-end hyphen by deleting the
  hyphen (`multimeters`, `decisionmaking`), and **C4.1's 4.1.5 carries 4.1.4's
  paragraph instead of its own** — the wrong command term and the wrong content
  for that understanding entirely. That single cell is the case for #58 in one
  place. `ibguide.corpus.test.ts` pins the count at 23 and the list at those
  three, so a fourth difference is a finding rather than a surprise.
- **The map sets the new syllabus beside the 2020 one it replaces**, and four of
  its six column headings repeat on the old side. `SL and HL or HL only` heads
  two columns. The new course is the left-hand set throughout.

**How the guide prints its syllabus**, established by running it through Klunk's
own pdf.js path — `pagesFromDocument` then `toLines` — rather than `pdftotext`,
so nothing here depends on a tool the app does not have. 85 pages, 3061 lines:

- **A topic heading is one that is followed by `Guiding question`.** The pattern
  `^[A-C][1-4]\.\d+ ` matches **36** lines and exactly **24** are the syllabus;
  the other twelve are the Overview table, whose three columns interleave into
  lines like `B2.2 Modelling and C2.2 Design for a circular`, and three
  sentences of planning prose. `Guiding question` appears 24 times in the whole
  document and under nothing else, so the contract holds in both directions.
  This is the NESA lesson again: a heading is known by what closes and opens
  around it, not by looking like one — and it needs no font metric, which
  matters because pdf.js discards them.
- **HL status is printed twice and the two agree.** Each topic carries an hours
  line, `Standard level (SL) and higher level (HL): 10 hours` or
  `Higher level (HL): 6 hours`, and eleven say the second — the same eleven
  whose headings carry `(HL only)`. Checked rather than assumed.
- **Understanding numbers drop the theme letter**, so `1.1.1` opens A1.1, B1.1
  and C1.1 alike and numbering has to be scoped to the open topic.
- **The delimiter is `Students must`, not `Students must be able to`.** There are
  161 understandings and 160 of the longer phrase: C1.1's 1.1.1 reads
  `Students must outline how…` and A4.1's 4.1.2 `Students must be aware of…`.
- **A page break reprints the open statement**, and continues the paragraph under
  it mid-sentence. B1.1's 1.1.2 is the one case. Deduplicating by number gives
  the right total of 161 and a content point that stops at "…to establish
  users'", so the repeat is **merged**: the reprint is dropped and what follows
  appended. #26 and #43 in a third document — the count was right while the
  content was wrong.
- **The running head and foot land inside a content point** that spans a break,
  so `Syllabus content` and `Design technology guide` are dropped before
  anything is read, as `extract.ts` drops the papers' furniture.
- **A line ending in a hyphen joins the next with no space.** Five lines in the
  syllabus section end that way and all five are hyphens inside a word; without
  the rule two points read `multi- meters` and `decision- making`. A suspended
  compound (`compare open- and closed-loop`) would be welded wrongly, and none
  falls at a line end in this document.
- **The four levels of organization are read from the Overview table**, whose
  rows print `1. People A1.1 Ergonomics B1.1 …`. The conjunction with a topic
  code is what makes it safe: the guide has five other runs of `1.` to `4.` and
  none is followed by one.

**The IB assessment model, from the guide's own outline** (pages 60 to 62). Nothing
here is in the syllabus map, which gets two of these numbers wrong:

| | SL | HL |
|---|---|---|
| Paper 1 | 1 hour, 30 marks, **20%** | 1 h 30 min, 40 marks, 25% |
| Paper 2 | 1 h 30 min, 50 marks, 40% | 2 h 30 min, 80 marks, 45% |
| Internal assessment | 50 hours, 33 marks, **40%** | 50 hours, 33 marks, 30% |

Paper 1 is multiple choice, Paper 2 is short-answer and extended-response "based
on the analysis of a product". Both papers draw on all three themes and test
AO1–AO3 at roughly 50% AO1+AO2 and 50% AO3. **Recommended teaching hours are 150
(SL) and 240 (HL)**, of which content is 90 and 180.

**No IB specimen paper is in the content folder.** The Paper 1 that is there is a
**RevisionDojo practice paper**, not the IB's own, so its thirty questions
corroborate the guide's 30-mark SL Paper 1 without being evidence of anything
else. See #45 before writing an IB profile.

## Dropped from scope

**Dropped from scope:** Industrial Technology and Food Technology. Their `.docx` files
are kept in `../klunk-content/fixtures/` purely as parser regression tests.
