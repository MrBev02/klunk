---
name: "teacher-material-voice"
description: "Apply when writing or editing any text a teacher reads inside Klunk: help pages, panel copy, notices, checker warnings, error messages, button labels, tooltips, empty states, and the prompt text Klunk composes for a teacher to paste elsewhere. Governs voice and tone only. Does not apply to code comments, commit messages, CLAUDE.md, GitHub issues or schema descriptions."
---

# Teacher-material voice

Voice and tone rules for anything a teacher reads on screen in Klunk: the help
page, panel copy, notices, checker warnings, error messages, button labels,
tooltips, empty states, and the prompt Klunk writes for a teacher to paste into
their school's AI.

Do **not** apply these to material written for whoever maintains Klunk next:
code comments, commit messages, CLAUDE.md, GitHub issues, schema descriptions.
Those keep the argumentative shorthand they have, where the reasoning matters
more than the reading.

The reader is a teacher with a class set of trials to build and twenty minutes
to do it in. They want to know what to do. Tell them. Do not perform, do not
persuade, do not reassure, and do not explain Klunk to itself.

---

## The one principle

**Tell teachers what to do first. Explain why only when the explanation helps
them do it correctly.**

Every rule below is a consequence of that sentence. When two rules seem to
disagree, this is what settles it.

The failure it names is *narrative style where procedural style belongs*: copy
that talks a teacher through how Klunk behaves when it should be telling them
what to check and what to do. It reads as considered and is harder to act on.

---

## The register

Every example below is written twice. The second version is the target, and it
is terser than most people's instinct.

| Instead of | Write |
|---|---|
| `Klunk has flagged what it is unsure about. Read each question against the paper before you save it, because a question read wrongly is found in the exam room.` | `Check each question against the paper. Anything Klunk was unsure about is flagged below.` |
| `klunk-english is no longer on this computer. Click Forget to stop Klunk offering it. That deletes nothing.` | `klunk-english is no longer on this computer. Click Forget to stop offering it.` |
| `A profile is the shape of the real exam: 40 marks, three sections.` | `A profile is the exam structure: 40 marks, three sections.` |
| `It runs in this browser tab. There is no account to make, no server, and nothing is uploaded.` | `Everything runs locally. No server, nothing uploaded, no account required.` |
| `Klunk cuts these from the parts of the page with no text on them, so it gets one wrong from time to time. Drop anything that is not part of the question.` | `Drop any picture that is not part of the question. Klunk cuts these from the page, so some will be wrong.` |

What went in each case: the justification, the reassurance nobody asked for, the
subject that was obvious, and the connective tissue holding a list into a
sentence. When a draft feels considered, weighty or memorable, that is the
fault, not the polish.

**The last one is different, and it is the one worth studying.** Nothing was cut:
both sentences survive and the reason was already doing real work. The order was
the fault. It described the system's behaviour and left the teacher to reach the
instruction second, which is narrative where procedural belongs.

It is here because it was a **"keep" example in an earlier version of this
skill**, held up to show a reason earning its place — and it broke the first rule
while doing so. A worked example that satisfies one rule and quietly breaks
another teaches the break. Check new examples against every rule, not the one
they were written for.

---

## Rule 1 — The action first

The first few words say what to do. Nothing goes in front of the verb: no
status, no context, no report of what Klunk has just done.

- Before: `Klunk has flagged what it is unsure about. Read each question against the paper before you save it.`
- After: `Check each question against the paper. Anything Klunk was unsure about is flagged below.`

For something that has gone wrong: what happened, then what to do.

- Before: `Something went wrong.` / `A requested file or directory could not be found at the time an operation was processed.`
- After: `klunk-english is no longer on this computer. Click Forget to stop offering it.`

Never blame the reader, and never apologise.

**The check:** read the first four words alone. If they do not say what happened
or what to do, the sentence starts in the wrong place.

## Rule 2 — Do not argue for the instruction

A teacher told to check something does not need telling that checking matters.
Cut every clause whose job is to make an instruction land harder: consequences,
stakes, what happens if they skip it.

- Before: `Read each question against the paper before you save it, because a question read wrongly is found in the exam room.`
- After: `Check each question against the paper before saving.`

- Before: `Papers refer to a question by its id, so the id cannot be changed here. Changing it would break every paper already using it.`
- After: `Papers refer to a question by its id, so it cannot be changed here.`

**The test:** does the clause tell them something they could not see, which
changes what they do next? If it only says the instruction is worth following,
cut it.

A reason that does change what they do stays, compressed **and second**:

- Keep: `Drop any picture that is not part of the question. Klunk cuts these from the page, so some will be wrong.`

That reason earns its place, because it says the cutouts are guesses and that is
why the teacher is being asked to look. It still goes behind the instruction.
Surviving this rule is not permission to lead with it: Rule 1 applies to a reason
that stays, exactly as it does to one that goes.

## Rule 3 — Do not reassure

Cut anything answering a worry the teacher has not raised. No "that deletes
nothing", no "this is safe", no "don't worry".

- Before: `Click Forget to stop offering it. That deletes nothing.`
- After: `Click Forget to stop offering it.`

Where a button really does destroy something, Rule 8 covers it: the button says
so, and the sentence above names what goes.

## Rule 4 — Compress

Panel copy, hints, notices and warnings get one sentence. Two is the ceiling,
and the second has to carry a fact the first does not.

**Fragments are fine.** A comma list beats a sentence built to contain one.

- Before: `There is no account to make, no server, and nothing is uploaded.`
- After: `No server, nothing uploaded, no account required.`

Drop the subject where it is obvious. Name Klunk only where it settles who
acted, Klunk or the teacher or the browser.

- Before: `Click Forget to stop Klunk offering it.`
- After: `Click Forget to stop offering it.`

The help page is the exception, and only its troubleshooting entries: those
answer a whole question, so four sentences that answer it beat one that
half-answers it.

## Rule 5 — No aphorisms, and nothing figurative

Never write a line to be memorable, in any position: closing lines, subordinate
clauses, anything reaching for a picture instead of a fact.

- Before: `a question read wrongly is found in the exam room`
- After: cut it.

- Before: `The whole prompt is on screen before you copy it, which is what makes "you decide what leaves your machine" true rather than a promise.`
- After: `Read the whole prompt before you copy it. Nothing else is sent.`

- Before: `A picture that prints as a grey box is not a glitch to ignore.`
- After: `A grey box with a filename means that image is missing from your folder.`

Metaphor is the tell: files do not travel, folders are not homes, a paper is not
a journey.

## Rule 6 — Nothing inverted, and no "not X, but Y"

Say it forwards. Do not lead with the negative, and do not rearrange for
emphasis.

- Before: `Klunk ships none, on purpose.`
- After: `Klunk includes no syllabus. Generate one from your own copy.`

- Before: `Nothing is ever locked away.`
- After: `Everything Klunk writes is plain text in your folder.`

- Before: `By reference, not by copy.`
- After: `A paper points at questions instead of copying them.`

The tell is a sentence you would never say out loud to a colleague at the
photocopier.

## Rule 7 — Name the thing

Name the folder, file, tab or question. Klunk usually knows which one, so a
message that does not say is throwing away the only useful part.

- Before: `Some files could not be read.`
- After: `bank/trials.json is not a question bank.`

- Before: `Nothing was written.`
- After: `profiles/nsw-hsc-design-technology.json is already there, so nothing was written.`

Quote on-screen wording exactly when copy refers to it, so a teacher can match
what they are looking at.

## Rule 8 — Buttons say what they do

A button that confirms says what it will do. Never `OK`. `Cancel` is fine only
where it means "close this and change nothing".

- Before: `OK` / `Yes`
- After: `Switch to klunk-content` / `Forget it anyway` / `Print / Save as PDF`

The sentence above it names the action too: "Moving to klunk-textiles discards
everything changed since your last save."

## Rule 9 — No em dashes

Never use `—` (em dash) or `–` (en dash). Rewrite with a comma, a colon, a full
stop, or brackets.

- Before: `It runs in this browser tab — no account, no server, nothing uploaded.`
- After: `Everything runs locally. No server, nothing uploaded, no account required.`

- Before: `A profile is the shape of the real exam — 40 marks, three sections.`
- After: `A profile is the exam structure: 40 marks, three sections.`

Applies to headings, button labels, table cells, tooltips, and any string copied
elsewhere, such as the composed AI prompt. Hyphens in compound words
(`ai-drafted`, `self-contained`) are fine.

**One exception: a range of numbers.** The real paper prints mark bands and
question ranges with an en dash, so Klunk keeps it wherever it reproduces or
quotes one: the band on the printed marking guide (`13–15`), the example section
instruction in the profile editor (`Attempt Questions 11–14`), and the message
reading a band back to a teacher. Prose never gets one.

## Rule 10 — The teacher's words, not the file's or the browser's

Say what a thing is in the room, not what it is in JSON or in Chrome. Three
known breaches are tracked in #13: millimetres of drawing space, a count of
ruled lines, and table alternatives separated by a slash.

- Before: `Drawing space (mm)`
- After: `How much room to draw in?`

- Before: `The permission for this handle has lapsed.`
- After: `Your browser needs you to confirm access to this folder again.`

Words to avoid on screen: handle, permission state, origin, IndexedDB, schema,
JSON (except when naming an actual filename), parse, validate, index, ingest.
Words that are fine, because a teacher already uses them: marks, outcomes,
content points, section, band, trial, faculty, Year 11, stimulus.

Australian English throughout. Write "exam" in running text, and keep
"examination" only inside the official name of a paper, such as "NSW HSC Design
and Technology written examination".

## Rule 11 — Explain only the decisions that read as faults

Four decisions look broken from outside: no syllabus ships, the AI step is copy
and paste, a missing picture prints a grey box, the browser asks for the folder
again. Explain those, because a teacher who does not know will think Klunk is
broken, and the explanation says what to do next.

Explain nothing else. Nobody reading a notice needs to know why the code does it
that way.

- Before: `Klunk assigns the ids itself, so the model can only choose among the ones the prompt listed.`
- After: cut it. Nothing the teacher does changes because of it.

Two sentences is the ceiling, and it belongs on the help page rather than in a
panel wherever there is a choice.

---

## What to keep

These rules cut performance, not substance. Preserve:

- Direct second-person instruction. "Save the syllabus .docx into your folder."
- Exact file paths, button labels and folder names.
- Numbers and specifics. "Forty marks, three sections", not "a few sections".
- The reasons that change what a teacher does, compressed.
- Klunk as the actor where it settles who acted.

Every word left does one of two jobs: telling the teacher what is true, or
telling them what to do. A word doing neither goes, however short the sentence.

---

## Self-check before finishing

Read the draft back and look for:

- a first sentence that is not the instruction or what happened
- an explanation of how Klunk behaves standing in front of the instruction
- a kept reason that has drifted in front of the instruction it supports
- a `because`, `so that` or `which means` clause that argues rather than informs
- a consequence of not following the instruction
- reassurance about something the teacher has not asked about
- a figure of speech, or a line written to be remembered
- more than two sentences anywhere outside help troubleshooting
- a second sentence restating the first in different words
- `Klunk` as a subject the sentence works without
- a list padded into a sentence
- any `—` or `–`
- a sentence starting with the negative, or one you would not say out loud
- "something", "a file", "this folder" where Klunk knows the name
- a button saying OK, or a warning that does not name its action
- file-level or browser-level words a teacher would not use

Rewrite anything you find. Then read the first four words of each block alone
and check they say what to do.
