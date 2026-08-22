# What a question, a paper and a profile may say

The decisions behind `bank.schema.json`, `paper.schema.json` and
`profile.schema.json`, and behind the markup a question's prose may carry.
Every one has evidence under it. **Do not reverse one without new evidence.**

Read this before touching `src/richtext.tsx`, `src/render.tsx`,
`src/question.tsx`, `src/editor.tsx`, `src/validate.ts`, `src/cover.ts`,
`src/paper.ts`, the three prompt files, or any of the schemas — and before
adding a question type or changing what a paper inherits from its profile.

---

## Markup in a question’s prose

**A table in a question is a pipe table in `questionText`, and the markup is
deliberately tiny** (#88, widened once by #101). Blank-line paragraphs, pipe
tables and three inline marks. No lists, no links, no headings.

- **Why markup rather than a field.** The table is printed *between* two
  paragraphs of the question, and `stimulus` renders in one fixed place, so a
  field would mean splitting the stem and deciding where the split falls.
  `ingest.ts` needs nothing either way: `asString` trims the ends and keeps
  interior newlines. The reason first written here, *it is also what an AI draft
  already comes back as*, was an assumption and was false; see #101.
- **`src/richtext.tsx` is written by hand**, about 130 lines. A markdown library
  would be a third dependency, would bring far more syntax than this wants, and
  would need a sanitiser behind it. The precedent is `CriterionPoints`.
- **A table is known by its separator row**, not by holding a pipe, so a sentence
  mentioning `A|B` is prose. A pipe inside a cell is written `\|` and survives a
  round trip through the editor.
- **`plainText` is the other half and is not optional.** Three list views clamp a
  stem to two lines, and `questionHaystack` is what search reads; both would
  otherwise show rows of pipes. A table flattens to its cells, so searching for
  `41.3` still finds the question that prints it.
- **A two-line summary is a faithful summary of prose and is not of a table.**
  The extractor and the factory both passed `showStem={false}` on the ground that
  the heading had said it already; with a table that hid the whole point. They
  ask `hasMarkup` now.
- **A `//` comment inside JSX is text on the page.** Two of them printed on the
  review card and were only found by driving it. `{/* … */}` is the only form.

Driven end to end afterwards: 34 questions and 100 marks with no question in
error, Q7's four options each carrying their own reason and nothing of a
neighbour's, its six readings a real table on screen and on the printed paper and
on the marking guide, Q27's four columns surviving their spanning header, and the
answer key still marking C. The 2019 D&T paper reads to fourteen questions and
forty marks with no table anywhere; the 2022 one to fifteen and forty with its
matrix recovered.

**Nothing had ever told a model that any of that markup exists, and a real
import lost a table because of it** (#101). Reported off a paper transcribed
through the AI route: a question carrying a table of data came back as a
paragraph of loose values. `richtext.tsx` had read and printed a pipe table
since #88, and `paperprompt.ts`, `prompt.ts` and `guideprompt.ts` all described
`questionText` as "the question exactly as a student reads it" and stopped
there. The only thing that had ever produced a pipe table was `extract.ts`'s own
table recovery, which is why it went unnoticed: every table Klunk had seen came
from a reader rather than from a reply.

- **The claim in `richtext.tsx`'s header was the fault in one line.** *It is also
  what an AI draft already comes back as, so `ingest.ts` needs nothing.* The
  second half is true and the first half was never checked. A format only one
  half of the system knows is a format the other half destroys.
- **Bold, italic and underline are what was missing next**, and they are not
  decoration: an examination prints `Outline **TWO** benefits`, a species name in
  italics, an underlined instruction, and a transcription that drops them is not
  a transcription. `**bold**` and `*italic*` are standard, so a model emits them
  untaught.
- **Underline is `<u>…</u>`, and `__x__` was refused twice over.** A model
  writing `__x__` means bold everywhere else in the world, so Klunk would print
  an underline where bold was meant; and a fill-in-the-blank line,
  `The process of ________ is used.`, parses as an underline of nothing. Both
  print wrongly and quietly on an exam paper, which is what #88 exists to avoid.
  `<u>` is matched as a token by the parser and no HTML is ever interpreted.
- **An unmatched delimiter prints literally**, which is markdown's flanking rule
  and is what keeps `Calculate 2 * 3 and then 4 * 5` out of trouble: a mark opens
  only where something closes it and neither end sits against a space. `\*`,
  `\|` and `\<` escape, as `\|` already did inside a cell. Nothing in the whole
  content folder carries an asterisk, so this cost no existing question anything;
  that was checked rather than assumed.
- **A mark is span-level, so it goes everywhere prose prints, and that breadth is
  required rather than generous.** Once a model is told the marks exist it will
  bold a word inside a part, an option or a criterion, and a call site rendering
  the raw string prints `**TWO**` on an examination paper. So `Inline` is wired
  through every such site in `render.tsx` and `question.tsx`: parts, options,
  matching cells, table headings and row labels, stimulus text, criteria, sample
  answers, `answersCouldInclude` and the guide's notes. `RichText` uses it for
  each paragraph and each table cell.
- **`hasMarkup` deliberately does not count an inline mark.** `plainText` takes
  them off, so a clamped two-line summary still reads as the sentence it
  summarises, where a flattened table is nonsense. Counting them would print the
  whole stem twice for every question carrying one bold word.
- **One copy of the rules, in `markupRules`**, which all three prompts call. Two
  copies drift, and the whole point is that the vocabulary a model is told
  matches the one `richtext.tsx` reads. The paper prompt's worked example carries
  a real table, and its test parses that example and runs it back through
  `blocksOf`: a prompt teaching a shape the reader does not read would be worse
  than one teaching nothing.
- **The prompt says a line break is `\n` inside a JSON string.** The whole table
  is one string, and a model that gets that wrong returns something that does not
  parse at all.
- **A table the student only reads is not the `table` question type**, which now
  had two plausible readings for the first time. The paper prompt says so.

Driven end to end on `../klunk-content` afterwards: a question written in the
editor with a table, `**greatest**`, `*Acacia*` and `<u>not</u>` previewed
correctly and saved to `bank/issue-101-markup.json` with the markup verbatim on
disk; the library row showed the stem flattened to its cells with `2 * 3` and the
escaped `|` intact; the printed student paper and the marking guide both carried
the table, the emphasis, an underlined `TWO` inside part (a) and a bold sample
answer; the drafting prompt and the transcription prompt both carried the markup
section on screen; and a reply pasted back holding a pipe table arrived with the
table whole and rendered as a table on the review card.

## Question types, and why the enum is closed

**Six of the fifteen objective questions on an Enterprise Computing Year 11
paper had no type, and the workaround was already written down in this
repository** (#32). Established from the 2024 and 2025 Enterprise Computing Year
11 examinations (Redlands), both scans in `../klunk-content/source/`. Section I
is fifteen one-mark questions under three rubrics, and the same three in both
years, word for word:

| | |
|---|---|
| 1–9 | *place an X next to the alternative that best answers the question* |
| 10–12 | *place an X next to **each** alternative that answers the question. (Multiple items may be selected).* |
| 13–15 | *draw lines linking items on the left with matching items on the right* — 2024 adds *(Multiple lines can start and end from any item)* |

- **The evidence was `src/paperprompt.ts`.** #89's transcription prompt told the
  model: where the paper says more than one may be selected, or asks the student
  to match two lists, "use `short_answer` and put the options or the lists in
  `questionText`". That rule was written *because* of these papers, and it costs
  the options their letters, the shuffle, the marking guide's answer, and
  `plainText` search.
- **The decision is that the enum stays closed and grows by evidence**, not that
  a profile declares its own types. An open list buys a label: `render.tsx` would
  fall to its `default` and rule blank lines under a question headed *Matching*,
  which is worse than an honest `short_answer`. The issue's own sentence settles
  it — a type that cannot print is worse than one that does not exist — and
  `profile.questionTypes` already hides what a course never sets, so a closed
  list costs a Mathematics teacher nothing. The price is a code change per type,
  and that price is the point: a type is a schema, a validation, a printing and
  a form, and a shape nobody can write all four for is not one Klunk can offer.
- **Two assumptions were wrong and only the paper corrected them.** The student
  **draws lines**, so the gap between the two columns is the answer space rather
  than decoration, and matching is **not** a bijection — the 2024 rubric says so
  outright, and `matches` is therefore an array. Every question in both years
  happens to be one-to-one, which is exactly the corpus that would have taught
  the wrong rule.
- **A matching question is one table with a blank middle column, and two tables
  side by side is the fault.** The examination aligns the two halves **row for
  row**: on 2024's Q14 the box holding `1 Enhanced data analysis` is exactly as
  tall as the three-line description beside it, most of it empty. Two
  independent tables cannot do that, and the first reading here was two — short
  terms on the left against sentences on the right put the third numbered box
  beside the middle of the third lettered one, so nothing on the page said
  which box a line runs between. A table row does it for nothing, which is
  very likely why the paper is laid out this way. Rows run to the longer
  column, and a row with nothing on one side gets **unbordered** cells, because
  an empty box is somewhere a student would draw to. The screen rendering in
  `question.tsx` is the same markup in screen units, for #76's reason.
- **The instruction has to print per question here too, and it was missed the
  first time** while the identical argument was being made for multiple
  response. Without it the two columns are a layout rather than a task: nothing
  says a line is what the student draws, and the boxes read as a table to fill
  in.
- **No count is ever printed**, so `correctAnswers.length` is not something the
  student is told. The instruction is printed once over a run of questions, which
  Klunk's sections cannot express, so it prints per question: a question moved
  onto another paper keeps it, and a student not told cannot tell this from the
  multiple choice above it.
- **The answer key is optional on both types, and that is a departure from
  `multiple_choice`.** `multipleChoiceConfig` requires `correctAnswer`, so a
  paper read without its markscheme has to have one invented and `adopt.ts` puts
  0 there — thirty questions all answered **A**, ready to print (#64). Here
  absent means unknown, the guide prints *No answer recorded* rather than a
  letter, and validation **warns** rather than erroring, because the student
  paper is correct either way. `[]` is a different claim, means "none of these",
  and is refused.
- **A `Record<string, string>` with a `?? fallback` is where a new type escapes
  the typechecker.** Every exhaustive `switch` and every `Record<QuestionType,
  …>` failed to compile and was fixed on sight; `shortType` in `question.tsx`
  compiled fine and printed `multiple_response` in the builder's rail. Found by
  driving, invisible in the source, and it is now keyed on `QuestionType`.
  `render.tsx` and `editor.tsx` have `default:` branches for the same reason and
  need the same care.

Driven end to end afterwards on `../klunk-content`: 2025's Q10 and 2024's Q13
written through the editor and saved into a bank that validates, the multiple
response marking `MOV` and `MP4` after a shuffle that moved them from B and E to
A and C, all six matching pairs surviving a shuffle of the lettered column, both
printing inline-numbered with the marks in the margin, the two matching columns
boxed with 20 mm between them, the guide reading `Answer: A, C` and
`1→A 2→D 3→E 4→C 5→B 6→F` against a lettered column that agrees with the student
paper, and a third question saved with nothing ticked printing *No answer
recorded. This question was read without a markscheme.* rather than a letter.

Not built, and deferred with its evidence in #32: `sql` and `spreadsheet`. The
Year 12 mid-year question map sets both, but they are Year 12 shapes and on a
printed page both are short answer with ruled lines, so the case is weaker than
these two and rests on no Year 11 document.

## Unfinished rather than refused

**A bank is a store and a paper is a paper, and conflating the two made an
import all-or-nothing** (#105). Reported as a teacher being unable to save a
paper imported without a marking guide. Three screens each tested
`severity === 'error'` for themselves before writing a question, so a question
Klunk had read faithfully off a real examination was refused because something
about it was not yet finished.

- **The blocker was a schema `required`, not a decision anybody made.**
  `multipleChoiceConfig` required `correctAnswer`, so a paper with no markscheme
  had to have one invented. #32 had already refused that on multiple response
  and matching and said so in `multipleResponseConfig`'s own description, which
  left multiple choice the only type where nobody having read an answer was an
  error rather than a state. Measured: `bank/ec-2024-scan-run.json` holds 21 of
  30 questions and 51 of 60 marks for this reason alone (#95).
- **#64 was living in two more places and the second one printed.**
  `adopt.ts` put the first option in `correctAnswer` and `cleanQuestion` put it
  there again on the way to disk. The note explaining it is gone the moment the
  question is saved, so what survived was a confident wrong letter on a marking
  guide. Absent now means unknown on all three types and the guide prints the
  sentence it already printed for the other two.
- **The classification is four tests in order, and the third is the one that is
  not obvious.** The schema refuses it; or the value is actively wrong; or
  **`cleanQuestion` erases it**; or it is unfinished and saves. A fault cleaning
  removes cannot be represented on the saved question, so marking it unfinished
  would leave a question flagged with no reason anybody could recover. That is
  why a fileless image stimulus and a criterion with no description still
  block, while parts that do not add up, a blank column heading, a blank row
  label and a part missing its label or its text all save.
- **`Check.unfinished` is a second axis rather than a third severity**, because
  two different things are unfinished: an error a file can hold (parts that do
  not add up) and a warning that means work is outstanding (no answer recorded,
  no marking guide). One flag across both is what stops those growing separate
  mechanisms that come to disagree.
- **`checkPaper` had never called `validateQuestion` at all.** It checked the
  paper against its profile and nothing else, so the save gates were the only
  thing between a half-read question and a printed paper. The guard had to land
  before the gate relaxed. It reads the question rather than the tag: the tag is
  what the file records, and the computation is what holds at print time.
- **The tag is stamped and cleared on every save**, inside `cleanQuestion` and
  judged on the cleaned question rather than the draft, because cleaning drops
  empty options and half-blank parts and the two can disagree. A mark that only
  ever goes on is one the library lies with.
- **The picture rule was deliberately left out of it.** `SHOWS_A_PICTURE` fires
  on 16 questions in the content folder and roughly three in five are wrong
  (*"Provide an example to illustrate your answer"*, *"A graphics design
  business"*). It is fine as a note at import time, where it fires only when a
  crop was expected, and would be wrong as a durable mark. Its `graph`
  alternative carried no closing word boundary, which is a plain bug and is
  fixed; its role is not widened.
- **It is derived, so the editor stopped offering it as a tag** (#111).
  `needs-finishing` sat inside the box labelled *Your own tags*, editable, and
  removing it there was undone by the next save. The hint tried to cover that in
  words, which is a note explaining why a control does not work. The box holds
  the teacher's tags now, the rail already says how many things are left to
  finish, and `question.tsx` was already rendering the chip from `isUnfinished`
  rather than from the tag. `ai-drafted`, `ai-transcribed` and `ai-marked` stay
  editable: those record where a question came from rather than what it holds
  now, and nothing recomputes them.
- **Measured before building rather than after**: 31 of 284 questions in the
  folder are unfinished, 21 of them one bank. `biology-2025.json` is 0 of 68 and
  `ib-dt-p1-practice.json` 0 of 30, so a properly-guided import comes out clean.

**The fix for #64 did not take, and the unit tests could not see it.** The line
putting zero in `configFor` was edited and never written, and `adopt.test.ts`
covered `applyMarking`, the path where an answer *does* land, with nothing at
all covering `adoptPaper` on a paper with no guide. The suite was green, the
schema was right, and the review card printed `(correct)` against option A the
first time the panel was opened. **A test that only covers the path where the
value arrives cannot see the path where it is invented.**

Driven end to end on `../klunk-content` afterwards: the 2019 D&T paper read with
its marking guide slot empty gives 14 questions and 40 marks, all reading *1 to
finish*, the ten objective ones showing *no answer recorded* with no option
marked; all 14 saved to `bank/issue-105-no-guide.json`, which validates against
`bank.schema.json` with ten multiple choice, none carrying an answer, and all 14
tagged; *Only unfinished* listed 45 of 298; setting the real answer on Question
1 in the editor took the tag off the file and dropped it out of the filter
without a reload; the builder rail flagged nine and still offered them; the
checker named eight by number; and the marking guide printed *No answer
recorded. This question was read without a markscheme.* eight times with no
letter anywhere. The existing Trial HSC Examination is unchanged, its letters
printing as before.

## A paper inherits from its profile

**A profile is a template and a paper is an instance of it, and `newPaper` broke
that by copying rather than pointing** (#106). Reported as a teacher editing a
paper structure and nothing reaching the papers built against it, with no way to
fix those papers by hand either.

- **`cover.ts` stated the doctrine and `newPaper` defeated it in three lines.**
  Three layers, each absence meaning "use the one above", implemented as
  `paper.x ?? profile.paper.x`. `newPaper` wrote
  `profile.paper.readingMinutes ?? 0` and `profile.paper.instructions ?? []`,
  and `0 ?? x` is `0` while `[] ?? x` is `[]`, so **that fallback had never
  fired for any paper Klunk created**. `help.tsx` had been telling teachers the
  opposite for months.
- **Two papers in the content folder printed "Reading time: 0 minutes"**, their
  profile setting none. Five of the six held an override identical to their
  profile's, which looks fine and stops being fine the moment the profile is
  edited.
- **The vocabulary is inherit and override**, in the code and on screen. "Copy"
  and "drop" were tried first and cost several rounds of explanation; the moment
  it was framed as a class and an instance it needed none.
- **An override identical to the profile's is removed by `cleanPaper` on the
  next save.** It changes nothing that prints, provably, since both sides
  resolve to the same value, and it is the one thing stopping a later profile
  edit reaching that paper. Doing it silently is safe *because* they match;
  where they differ the panel offers and the teacher decides. The one thing it
  costs is a deliberate override that happens to equal the profile's value,
  which Klunk cannot tell from a leftover.
- **A stored `0` survives cleaning and an empty instruction list does not.**
  Zero is a real answer, a paper with no reading time, and removing it would
  make that unsayable and would reinterpret a saved file. An empty list is what
  a cleared textarea leaves (`value.split('\n')` gives `['']`), and keeping it
  shadowed the profile for ever.
- **`cleanPaper` passes `sections` through by reference rather than rebuilding
  them**, unlike `cleanProfile`. A ref carries `marksOverride`, `group` and
  `note` and a section carries its own title and instructions, none of which
  that function owns; rebuilding a structure you do not own is how a field
  disappears on the next save with nothing to recover it from.
- **`checkPaper` had never called `validateQuestion` or looked at sections at
  all.** A section the profile gained showed up only as "Paper totals 25 marks,
  profile expects 40", which sends a teacher looking at questions. A section the
  profile lost showed up as nothing: `if (!spec) continue` skipped marks, count,
  types and `chooseCount` while its questions still counted towards the total,
  so a paper could add up correctly with a whole section unchecked.
- **`dirty` and `owns` must keep reading the raw paper**, never the cleaned one.
  A paper opened from disk is byte-identical to its file and must keep showing
  Saved; reading the cleaned copy would make every existing paper look changed
  at mount, `owns` would go false, and the next save would be refused as a
  duplicate filename. `resolvePaper` takes the cleaned one, so clearing a box
  previews the inherited value at once.
- **`ref` is a reserved prop name in Preact.** A component taking one receives a
  string where it expects a callback and throws before anything renders. It
  typechecks perfectly, because TypeScript knows nothing about the reservation,
  and the symptom is a blank page.

**Deleting three lines from the function every paper is made by broke no test at
all, and that is the finding.** Nineteen call sites used `newPaper` and not one
asserted what it wrote. It is #105's lesson in the same shape: *a test covering
only the path where a value arrives cannot see the path where it is invented.*
The two that would have caught it start from `newPaper` rather than from a paper
literal, and are in `cover.test.ts`.

Driven end to end on `../klunk-content`: the reported symptom named by the panel
and cleared in one press; a profile edited to 100 minutes reaching an already
open paper without touching it; a section added to a profile reported by both
the checker and the panel and inserted in the profile's order; the same section
removed again reported as an orphan where it had previously been silent; a typed
zero printing "0 minutes" against a blank box printing no line; a section
heading, a section instruction, a group heading and a marks override all
printing; a reference carrying overrides written as an object and dropping back
to a plain string when cleared; and Trial HSC Examination, untouched, printing
exactly what it printed before.

## A section can be a set of alternatives

**A section can be a set of alternatives, and until #52 Klunk could not say so.**
Established from the 2025 Visual Arts HSC Trial (Redlands), the same document
#51's cover work came from:
- Its Section II prints six questions worth 25 each and says **Attempt ONE
  question from Questions 4–9**. The section is worth 25 and the paper 50.
  Klunk read the paper as **175 marks**, because `resolvePaper` summed every
  question in a section.
- So `ProfileSection.chooseCount` is how many a student answers, and
  `ResolvedSection.marks` is what a student can *earn* while `offeredMarks` is
  what is printed. The guide needs the second; the cover, the section heading and
  the checker all need the first.
- **Every alternative has to be worth the same**, or the marks depend on which
  one a student picks. `checkPaper` enforces it rather than assuming it.
- **`OR` closes the question above and does not open the group below.** The
  examination prints `Question 5 … / OR / Conceptual Framework / Question 6`, so
  the separator comes before the heading. Printed the other way round it reads as
  an alternative to the heading.
- The three headings (`Practice`, `Conceptual Framework`, `Frames`) are the
  content areas, and they live on the **paper's ref** rather than on the
  question, because the same question sits under a different heading elsewhere.
- **The cover carries only the first line of a section's instruction.** That line
  is the `Attempt …` one; the rest is the preamble the section heading prints,
  which on this paper runs to six lines including the list a response is assessed
  against.
- Not built, and separable: the detached **Plates Booklet** (Klunk prints
  stimulus inline), per-question suggested times, and the `Question N continues
  on page X` footers. This paper also prints `(HSC 2021)` beside each Section II
  question, which is the source showing on the student's paper; Klunk keeps
  provenance to the guide deliberately.

## Printing from Chrome

**Printing from Chrome, established by measuring four printed PDFs rather than
the preview.** The preview has no page boundaries, so nothing below can be seen
in it. Positions were read back with `pagesFromDocument` on the saved PDF, which
is far more reliable than looking.

- **A `position: fixed` element repeats on every printed page**, which is the
  only way any engine gives a running header. Its containing block is the page
  *area*, inside the margins.
- **Chrome throws any negative vertical offset on such an element to the bottom
  of the page.** Measured on A4 with a 34/15/18/15 mm page: `top: 0` landed at
  37 mm and `bottom: 0` at 278 mm, both correct, while `top: 0` with
  `margin-top: -18mm` landed at 264 mm and `top: -16mm` at 267 mm. So a fixed
  element **cannot be lifted into the page margin**, and therefore cannot
  reserve the space it occupies: at `top: 0` it prints on top of the questions.
- **So a repeating header is a `<thead>`, not a fixed element.** A repeated
  `thead` is in flow, so it both repeats and pushes content down on every page.
  `render.tsx` wraps the whole paper in one cell for this and nothing else.
  Checked afterwards that it did not cost the pagination: all three section
  headings still start a fresh page and no question number appears on two pages.
- **`padding-top` does not reserve space per page.** Padding applies once at the
  start of a block, not at the top of each page it flows across, so the first
  attempt cleared page 1 and overlapped every page after it.
- **Chrome names a saved PDF after `document.title`**, so every paper arrived as
  `Klunk.pdf` and each one overwrote the last. `printPaper` in `builder.tsx`
  sets the title, prints, and restores it on `afterprint`.
- **The date, page title and URL printed on every page are Chrome's own headers
  and footers**, which no page can turn off. It is a checkbox under More
  settings in the print dialog, so the preview bar and the help page say so.
- **The preview was never the width it claimed.** `.sheet` was `width: 180mm`
  with 10 mm side padding under a global `box-sizing: border-box`, so it laid
  out at 160 mm while the print laid out at 180 mm, and the comment above it
  said it wrapped exactly as the print would. It is 200 mm now. The printed page
  never moved; only the preview did, onto what the page was always doing.


## A box that normalises what it holds cannot be bound to it

**Established in Chrome against the real Preact, by driving both shapes of the
box side by side (#110).** Both faults below were invisible in the code and in
every test: the parsing is correct, and only typing into it shows the problem.

- **Preact writes the `value` prop back over the box whenever the two differ**,
  on every render, not only when the prop changed (`preact/src/diff/index.js`,
  the `inputValue !== dom[i]` test). Nothing in a component can opt out.
- **So a box showing `list.join(', ')` and re-parsing every keystroke deletes
  the separator as it is typed.** `ergonomics, safety` typed into the tags box
  arrived as `ergonomicssafety`: one tag, and the comma and space gone. A second
  tag could only ever be pasted in. The same box with `/` held the accepted
  answers for a table cell.
- **Keeping the text in local state is not enough**, which is the part worth not
  re-deriving. A render caused by the draft above arrives with the parsed list
  already updated and the box's own text one keystroke behind, so Preact writes
  the stale text over what was typed; the effect puts it back, and at five
  milliseconds between keystrokes `ergonomics` came out as `ergonoics`. Verified
  by logging every render: `text='er' value='erg'`.
- **So `ListField` is not bound to the list at all.** It is uncontrolled, and
  focus decides: while the box has focus what is in it wins, and the list is
  written into it only when it changes while the teacher is elsewhere, or on the
  way out, where a trailing comma is tidied. Driven afterwards with real clicks
  and real keystrokes: `ergonomics, safety, ` stays as typed, reports two tags,
  and reads back `ergonomics, safety` after clicking away.
- **`NumField` had already paid for this once**, for the number that could not be
  cleared, and its comment says so. Two list boxes were written afterwards
  without it.
