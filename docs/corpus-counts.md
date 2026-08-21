# Corpus counts, and what a rewrite would get wrong

Every number here was established by hand off the document, not inherited from
a parser's output. They are enforced by `src/*.corpus.test.ts`, which skip when
`../klunk-content` is absent — so **run `npm run test:corpus` before pushing a
parser change**, where a missing document fails rather than skips.

Read this beside [reading-syllabuses.md](reading-syllabuses.md): that file says
what the documents do, this one says what the model must come out as.

---

## The 2013 content tables

Regression check for the generator: Design and Technology must stay at
**20 topics / 78 points / 12 outcomes** (Preliminary) and **20 / 61 / 13** (HSC).
Textiles and Design at **18 / 104 / 11** and **15 / 80 / 13**.

## The heading and prose shapes

The counts for the other two shapes, in `src/headings.corpus.test.ts`, established
by hand off the documents rather than inherited:

| | first course | second course |
|---|---|---|
| Drama Stage 6 (2009) | pre **3 / 15 / 18** | hsc **3 / 20 / 19** |
| English Advanced 11–12 (2024) | y11 **9 / 30 / 6** | y12 **12 / 43 / 6** |
| Mathematics Advanced 11–12 (2024) | y11 **27 / 201 / 11** | y12 **25 / 158 / 9** |
| Visual Arts Stage 6 (2016) | pre **17 / 132 / 10** | hsc **17 / 132 / 10** |
| Computing Technology 7–10 (2022) | s4 **24 / 246 / 1** | s5 **24 / 246 / 10** |
| Biology Stage 6 (2017) | y11 **19 / 122 / 11** | y12 **24 / 149 / 11** |
| Enterprise Computing 11–12 (2022) | y11 **10 / 180 / 11** | y12 **14 / 257 / 11** |

Six groups per course in Computing Technology, the focus areas, and each holds
the same four topics — `Identifying and defining`, `Researching and planning`,
`Producing and implementing`, `Testing and evaluating`. No lead topic anywhere,
unlike English Advanced: every `Content` block opens straight onto a
sub-heading, so there is no third topic per focus area.

## Where these counts are easy to get wrong

Two of those numbers are the ones a rewrite would get wrong. **Stage 4's single
outcome is not an outcome**: `CT4-ADJ-01` reads "in Stage 4 teachers may adjust
the Stage 5 outcomes as appropriate to the needs of students in Years 7 and 8".
NESA has given an instruction a code and put it in the outcome column, and it is
the whole of Stage 4's outcome set; filtering it out would be deciding something
the document does not. And **the two stages hold the same 246 points**, which
the syllabus states — "The content available for Stage 4 is identical to Stage
5" — and which was checked rather than taken on trust: identical strings in
identical order under identical headings. That is the Visual Arts arrangement
arriving from a second direction, and the ids stay distinct because `prefixOf`
mints them per course, `S4-01` against `S5-01`.

Biology's eleven outcomes per course are **seven plus four**, and the seven are
the same seven in both: `BIO11/12-1` to `BIO11/12-7` are stated once each in a
topic block and belong to Year 11 and Year 12 alike, while the outcome table
gives each course its own four. A course coming out with four is the code
pattern refusing the shared shape; a topic coming out with none is the
`Working Scientifically` heading having taken its module again. Its nineteen and
twenty-four topics are the seven Working Scientifically skills, which carry no
group, plus the sub-headings inside the four modules — so **a module appearing
as a topic is the fault, not the arrangement**. Its point counts sit 31 and 41
below the paragraph counts, being one `Students:` per topic and one inquiry
question per module topic, both of which are now somewhere better (#78); a
sub-item still counts as a point, having gained a parent rather than a new home.

Enterprise Computing's is the number a rewrite would get most wrong, because the
wrong one is the one that looks right. **297 of its 437 points are inside a
box**, and a reader that skips tables gives 58 and 82 — a syllabus by every
appearance, with two thirds of the content gone. Its ten and fourteen topics are
the sub-headings inside each focus area's `Content` block; three focus areas in
Year 11 and four in Year 12, and no lead topic in either, as in Computing
Technology. The corpus test also pins the 297 sub-items, that every one is
numbered under its own parent, that no parent is itself a sub-item, and that
neither `Including:` nor NESA's licence terms reached the model.

## The IB syllabus

The IB syllabus, counted off the guide's Overview table and its numbered
understandings rather than off either parser. **Both documents must give these**,
the guide in `src/ibguide.corpus.test.ts` and the map in
`src/ibdt.corpus.test.ts`:

| | first course | second course |
|---|---|---|
| IB DP Design Technology (2027) | sl **13 / 79 / 0** | hl **24 / 161 / 0** |

Zero outcomes in both, because the IB has assessment objectives against the whole
course and nothing that maps to a topic. HL is the **whole** syllabus and not the
eleven extra topics, so every SL topic appears in both courses under the same id,
which is the Visual Arts arrangement with the sharing one-way. Three groups per
course, the themes. The level of organization is folded into the topic name
(`A1.1 People: Ergonomics`) because the schema has one grouping level and the
theme is the one worth having there.

## Four more a rewrite would get wrong

Four of those numbers are the ones a rewrite would get wrong. Drama's HSC has
**one more outcome than its Preliminary** because H2.5 comes from the outcome
table and no topic. Mathematics has **eleven outcomes against the table's ten**
because `MAO-WM-01 Working mathematically` is stated above that table and reaches
the model through the focus areas citing it. English has **three topics per focus
area rather than two**, the third being the paragraph describing it, because
nothing under a `Content` heading is dropped. Visual Arts's two courses hold the
**same 132 points** on purpose.

## Groups are part of the check

Groups are part of this check too. Drama has none: three topics per course with
nothing dividing them. Mathematics Year 11 has five and not seven, because
`Trigonometric identities and equations` and `Graph transformations` set out
their content with no sub-headings and are therefore topics rather than groups.

## A content point read as a topic (#26, #43)

Textiles HSC was 16 / 79 until #26, and the change is a fix rather than drift: one
topic runs past the bottom of a page and continues in a fresh table row opening
`iv)`, which was read as a sixteenth topic named after a content point. Merging it
into its parent moves that line from a heading to a point. **The count was right
while the content was wrong**, which is the whole lesson of this section — so the
corpus test now also asserts that no topic name opens with a list marker and that
none carries a non-breaking space.

**Textiles Preliminary has the same fault and its 18 / 104 / 11 encodes it**
(#43), found by driving the review panel over it. `PRE-05 verbal` is a content
point of `PRE-04 Communication techniques`, sitting alongside `graphical` and
`written`, which continues in a fresh table row after a page break. It opens
`verbal` rather than `iv)`, so `CONTINUATION_RE` does not catch it. Corrected it
is 17 / 105 / 11.

**#43 is settled: the counts stay as the parser's output, and the reader points
at the row instead of merging it.** That is a decision with evidence behind it,
so do not reopen it without new documents.

The markup does carry a signal. In Textiles every real topic heading is styled as
a heading (`Heading5`, `hd3`, `Header`) or is bold, while content points carry
`LISTbull1TAB12pt`, and both continuation rows carry the content-point style at
the top of a fresh page. Conjoining those two facts, a **list-styled first
paragraph carrying `w:lastRenderedPageBreak`**, picks out exactly the two known
faults in Textiles and nothing else in it.

It does not generalise, and the counter-example is decisive:

| document | rows | list-styled headings | flagged by list style alone |
|---|---|---|---|
| Design and Technology | 40 | **40** | 40 |
| Textiles and Design | 34 | 2 | 2 |
| Food Technology | 26 | 6 | 6 |
| Industrial Technology | 163 | 48 | 48 |

**All forty of Design and Technology's topic headings are list items**, so acting
on the style alone collapses each course to a single topic. Adding the page break
saves D&T and Food Technology, both of which drop to zero, but Industrial
Technology still flags eight, and there it is plainly wrong: `framing joints` and
`carcase joints` are the same kind of thing in the same list, and the rule keeps
one and swallows the other purely because of where the page happened to break.
Restricting further, to documents that do not otherwise use list-styled headings,
gets all four right and is three conditions fitted to two positive examples in one
document. That is not a rule, it is the shape of one document.

So `parseSyllabusTables` returns `suspects` beside the courses and the review
panel marks them **check this one**. `lastRenderedPageBreak` is a cache of Word's
last layout rather than a declaration, and a document Word has never rendered
carries none: a missing break costs a warning nobody sees, a wrong merge would
cost a topic silently. That asymmetry is the whole argument for reporting.
`parseSyllabusXml` still returns the courses alone, so the corpus comparison
against the Python tool is untouched.

Groups are part of that check, because they were wrong for a long time without
changing any count. Design and Technology must have **no group on any topic**: it
is one content table per course, so there is nothing to divide. Textiles must have
exactly three, *Design*, *Properties and Performance of Textiles* and *Australian
Textile, Clothing, Footwear and Allied Industries*, with no label prefix and no
non-breaking spaces. A group is only ever taken from a heading that says it is one
(`Area of Study:`, `Focus Area:`); anything else is document furniture.
