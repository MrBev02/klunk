# Reading past papers and marking guides

Established from real documents — eleven years of HSC Design and Technology
papers, the 2025 HSC Biology paper and guide, and two Enterprise Computing
scans. **Do not re-derive any of it, and do not contradict it without new
evidence.**

Read this before touching `src/extract.ts`, `src/objective.ts`,
`src/paperformats.ts`, `src/guide.ts`, `src/answerkey.ts`,
`src/guideformats.ts`, `src/pdftext.ts`, `src/pdfimage.ts` or `src/adopt.ts`.

---

## The HSC Design and Technology corpus

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

## A second subject, and four faults in the paper reader

**A second subject reads, and it broke the paper reader in four places, of
which one was visible** (#81 to #84). Established from the 2025 HSC Biology
paper and its marking guide, the first document the extractor was given that
was not Design and Technology. Its shape is a NESA paper — Section headings,
`Question 21 (2 marks)`, marks in the same margin column — and it is 100 marks
as 20 objective questions and fourteen written ones, with no Section III.

- **The section heading is on the answer booklet's cover, and carries its
  name.** `Section II Answer Booklet`, on one baseline. D&T binds its booklet
  in too, from 2019, but its cover says `Answer Booklet` alone. So no Section
  II was ever matched, `section` stayed at `I` for the whole document, and all
  fourteen written questions came out as `multiple_choice` — losing every part
  and every per-part mark, and arriving with an error that stops them being
  saved. That was the whole of the *visible* failure and the other three cost
  nothing until it was fixed, which is #50 and #77 a third time.
- **A table row that begins with a number opened a question that does not
  exist.** `8 am 41.1 18.8` is the fourth row of a table of hourly readings and
  it satisfied both halves of the Section I rule — the pattern and the next
  number in sequence. Question 7 then had no options at all and the real
  Question 8 was read as the continuation of the false one, with eight. Two of
  the twenty destroyed by one row. **The discriminator is position**: a
  question number sits at the left edge of the page and a table sits inside it,
  116 points to the right here. Checked across thirteen documents rather than
  assumed — every real numbered question is at its page's leftmost column,
  every line that merely looks like one is indented past it (`4 am`,
  `19 20 21 22 X Y` across a karyotype, `10 years` on a graph axis), and
  nothing sits left of a question number.
- **A picture credit sharing a baseline with a part took the part with it.**
  `FURNITURE` dropped any line holding a `©` anywhere, which is right for the
  two shapes D&T prints and wrong for `(b) 'Genetic technologies are beneficial
  for society.' © ILSI Research Foundation` — seven marks of an eleven-mark
  question, leaving a question whose parts did not add up. All 41 lines
  carrying a `©` in the eleven papers, their guides, this paper and its guide
  were read: 33 are the credit alone, seven are the page number and the notice,
  one is this. So the credit is **cut off the line** rather than the line
  dropped.
- **The guide reads almost perfectly, and said so wrongly.** Criteria on every
  question and part, bands where the guide gives them, and all twenty answers.
  It reported `The answer key holds 20 answers rather than ten`, because ten is
  a D&T Section I and nobody else's. What `extractGuide` can say on its own is
  that a key skips a number; whether it covers the paper is `applyGuide`'s,
  which has the paper and already names the question with no answer.
- **No mapping grid.** The Biology guide does not print D&T's
  `Question | Marks | Content | Syllabus outcomes` table, so nothing is tagged
  with outcomes and every question is left for the teacher. That is the
  document, not a misread.

## Pictures

**A picture is a band no *prose* touches, and the word doing the work is
prose** (#83). The first reading took a band between any two rows of text,
which is right for a photograph and wrong for a diagram, because a diagram
carries text: `Parent amoeba`, `Nucleus divides`, `Cytoplasm divides`,
`Two daughter cells` are printed inside the picture, and each label cut the
band it sat in. One diagram was offered as **five crops**, a karyotype as four,
a cloning diagram as four, a tick bite as seven — 46 crops on one paper, none
of them a picture of anything. Eleven years of D&T never showed it because a
photograph carries no words.

- **A label is told from a line of the question by where it starts.** Measured
  over the eleven D&T papers and this one: each puts its question numbers at
  x=71 and its text at x=99, Biology adding x=101 for its ruled lines, and
  those columns carry 15% to 61% of a document's rows. The next column down is
  6% and is either front matter or a figure. So **a column carrying a tenth of
  a document's rows is prose**, taken over the whole document because a page
  holding a full-page figure has no prose on it to measure. It has to be a
  share rather than a fixed indent: a figure's own labels reach x=104 on this
  paper, five points right of the text.
- **A row at the left margin is prose whatever surrounds it.** Without that
  exception a question's own closing line was swallowed into the diagram above
  it, the band then had nothing below it to close against, and the picture was
  **lost** rather than merged — on Biology Q21 and on D&T 2016 Q14 and 2024
  Q15. Losing one is the expensive mistake and merging two is the cheap one.
- **A prose-looking row wedged between two picture rows is inside the
  picture.** A flow chart prints `Normal temperature range` over three lines
  and the third of them happens to begin in the text column. The cost of this
  rule is that a table whose option labels sit in the prose column has every
  label eaten and so gets no crop at all (#85); measured against the whole
  corpus it still merges more than it suppresses, and it loses nothing that was
  found before.
- **`pdfimage.ts` keeps a smaller furniture list than `extract.ts`, and both
  differences are cuts that halved a picture.** A bare number is not furniture
  here — `19 20 21 22 X Y` is a karyotype's chromosome numbers, not a page
  number — and neither is a copyright line, which is the credit under the
  picture it belongs to and belongs on the crop.

Driven on the real paper afterwards, not only measured: 34 questions, 100
marks, **no question with an error**, the amoeba diagram one picture with its
four labels and its credit, the karyotype one, the flow chart one and Question
24 a four-mark short answer with two parts, and Question 30 carrying both parts
at 4 and 7.

## A row of a page is a row of columns

**A row of a page is a row of columns, and throwing the columns away cost two
questions their meaning** (#85, #88). `toLines` joined a row's runs into one
string and kept only the leftmost x. `Line.cells` keeps the spans as well, and
`Line.text` is unchanged, so the four other readers that call `toLines` are
untouched.

- **An option can be a row of a table, and then the label is centred against its
  cell.** Where the cell wraps, the label lands on its own baseline *between* the
  two halves — so the first half is printed **above** the label it belongs to.
  Appending each line to the option before it, which is right for an ordinary
  wrap, gave every option the second half of its own cell and the first half of
  the next one's. Each read plausibly and each was wrong, which is the worst
  kind: a teacher scanning fifteen questions would not catch it, and it prints.
- **The discriminator is horizontal, and vertical distance alone is not enough.**
  An ordinary wrapped option continues at the option's own text column (x=127 on
  this paper); a wrapped cell is at x=235. A three-line wrapped option puts its
  last line nearer the *next* label than its own, so a pure nearest-label rule
  breaks what already works. The rule is therefore: a line at the option's text
  column continues the option above it, and a line right of it, inside the run of
  labels, goes to the label nearest its baseline — `guide.ts`'s rule for a mark
  against a band, arriving on an option label.
- **The block reaches half a label-spacing above the first label**, and no
  further. The labels are 33 points apart, the first cell line is 7 above its own
  label, and the column headings are 27.8 above it: 16.5 admits the one and
  refuses the other. The headings stay in the stem, which is why a question read
  from a table says so in a note.
- **A cell boundary is 14 points, and 6 was measured wrongly.** Every gap in the
  twelve papers with a word on each side was read: the widest inside running
  prose is **8.4**, because a line justified to both margins has wide word gaps
  and the 2017 D&T paper prints one such option. At 6 it shattered into a cell
  per word and would have come back as `Conduct – research – into – the`. The
  narrowest real column boundary is **22**, a label against its own text.
- **One row of columns is not a table, and two rows are a legend.** The gate is
  three rows sharing two columns, with a three-cell row somewhere in the run. Two
  rows takes a graph's key, which the 2025 D&T paper prints; two columns takes
  every option list and every numbered list. **Columns are matched by span
  overlap, never by left edge** — `Body temperature` starts at x=247 and the
  `41.3` under it at x=280, and left edges lose the heading row entirely.
- **What survives the gate and is not a table: two diagrams on this one paper**,
  a four-step figure whose captions wrap over three lines, and the labels around
  a cell-division diagram. Geometry over `{x, y, width, str}` cannot refuse
  either without also refusing Q7's data table: both are indented past the prose
  columns and both sit inside a band `findPictures` claims. So a recovered table
  is a **proposal**, as a crop is — the crop is still offered beside it, and
  neither case loses a word that was read before.
- **Eleven years of D&T change in exactly one place, and it is a fix.** The 2022
  paper sets an objective question on a two-by-two matrix of market demand
  against manufacturing cost, and it had been read as loose words like every
  other table. Nothing else in the corpus moves.
- **A `BLANK PAGE` notice was being read onto the option above it** (#86), on the
  last objective question of this paper. The 2015 D&T paper prints two and cost
  nothing, because neither falls while a question is open.
- **Not fixed: Question 14's options are drawings** laid out two to a row, so
  `A. B.` matches as one option whose text is `B.` (#87). It says `Read 2 options
  rather than four`, so it is loud rather than silent.

