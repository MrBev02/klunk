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
to do it in. They are often reading because something has not worked. Answer
them. Do not perform, and do not explain Klunk to itself.

These rules exist because the help page had to be rewritten the day it was
written: it came out in the repository's own voice, and that voice is wrong for
this reader.

---

## Rule 1 — No em dashes

Never use `—` (em dash) or `–` (en dash). Rewrite with a comma, a colon, a full
stop, or brackets.

- Before: `It runs in this browser tab — no account, no server, nothing uploaded.`
- After: `It runs in this browser tab. There is no account to make, no server, and nothing is uploaded.`

- Before: `A profile is the shape of the real exam — 40 marks, three sections.`
- After: `A profile is the shape of the real exam: 40 marks, three sections.`

Applies to headings, button labels, table cells, tooltips, and any string that
gets copied elsewhere, such as the composed AI prompt. Hyphens in compound words
(`ai-drafted`, `self-contained`) are fine.

**One exception: a range of numbers.** The real paper prints mark bands and
question ranges with an en dash, so Klunk keeps it wherever it reproduces or
quotes one. That covers the band on the printed marking guide (`13–15`), the
example section instruction in the profile editor (`Attempt Questions 11–14`),
and the message that reads a band back to a teacher. Prose never gets one.

## Rule 2 — Nothing inverted, and no "not X, but Y"

Say the thing forwards. Do not lead with the negative, and do not rearrange a
sentence for emphasis.

- Before: `Klunk ships none, on purpose.`
- After: `Klunk does not come with any, and that is on purpose.`

- Before: `Nothing is ever locked away.`
- After: `Everything Klunk writes is plain text in your own folder.`

- Before: `By reference, not by copy.`
- After: `A paper points at questions instead of copying them.`

The tell is a sentence you would never say out loud to a colleague standing at
the photocopier.

## Rule 3 — No aphorisms or sign-offs

Do not close a passage with a quotable line. State the fact and stop.

- Before: `The whole prompt is on screen before you copy it, which is what makes "you decide what leaves your machine" true rather than a promise.`
- After: `You can read the whole prompt before you copy it, so you always know exactly what you are sending.`

- Before: `A picture that prints as a grey box is not a glitch to ignore.`
- After: `If a picture prints as a grey box with a filename in it, that image is missing from your folder.`

## Rule 4 — Answer first

What happened, then what to do about it. The reason last, and only if it helps
them decide. Never open with background.

- Before: `Something went wrong.` / `A requested file or directory could not be found at the time an operation was processed.`
- After: `klunk-english is no longer on this computer. Click Forget to stop Klunk offering it. That deletes nothing.`

Never blame the reader, and never apologise. Say what happened.

## Rule 5 — Name the thing

Name the folder, the file, the tab or the question. Klunk usually knows which
one, so a message that does not say is throwing away the only useful part.

- Before: `Some files could not be read.`
- After: `bank/trials.json could not be read. It is not a question bank.`

- Before: `Nothing was written.`
- After: `profiles/nsw-hsc-design-technology.json is already there, so nothing was written.`

Quote on-screen wording exactly when help refers to it, so a teacher can match
what they are looking at.

## Rule 6 — Buttons say what they do

A button that confirms something says what it will do. Never `OK`. `Cancel` is
fine only where it means "close this and change nothing".

- Before: `OK` / `Yes`
- After: `Switch to klunk-content` / `Forget it anyway` / `Print / Save as PDF`

The same goes for the sentence above it. Name the action: "Moving to
klunk-textiles will discard everything you have changed since you last saved."

## Rule 7 — The teacher's words, not the file's or the browser's

Say what a thing is in the room, not what it is in JSON or in Chrome. Klunk has
three known places that break this rule, tracked in #13: millimetres of drawing
space, a count of ruled lines, and table alternatives separated by a slash.

- Before: `Drawing space (mm)`
- After: `How much room do students get to draw in?`

- Before: `The permission for this handle has lapsed.`
- After: `Your browser is asking you to confirm access to this folder again.`

Words to avoid on screen: handle, permission state, origin, IndexedDB, schema,
JSON (except when naming an actual filename), parse, validate, index, ingest.
Words that are fine, because a teacher already uses them: marks, outcomes,
content points, section, band, trial, faculty, Year 11, stimulus.

Australian English throughout. Write "exam" in running text, and keep
"examination" only inside the official name of a paper, such as "NSW HSC Design
and Technology written examination".

## Rule 8 — A reason only where it changes what they do

Klunk makes several decisions that look like faults: no syllabus ships, the AI
step is copy and paste, a missing picture prints a grey box, the browser asks
for the folder again. Explain those, because a teacher who does not know will
think Klunk is broken, and because the explanation tells them what to do next.

Do not explain anything else. Nobody reading a notice needs to know why the code
does it that way.

- Before: `Klunk assigns the ids itself, so the model can only choose among the ones the prompt listed.`
- After: cut it. Nothing the teacher does changes because of it.

Two sentences is the ceiling for any reason.

---

## What to keep

These rules trim performance, not substance. Preserve:

- Direct second-person instruction. "Save the syllabus .docx into your folder."
- Exact file paths, button labels and folder names.
- Numbers and specifics. "Forty marks, three sections", not "a few sections".
- The reasons that change what a teacher does, in plain form.
- Klunk as the actor where Klunk acts. "Klunk writes the paper into papers/."

Plain does not mean vague, and it does not mean shorter. A troubleshooting entry
that answers the question in four sentences beats one that half-answers it in
one.

---

## Self-check before finishing

Read the draft back and look for:

- any `—` or `–`
- a sentence that starts with the negative, or that you would not say out loud
- a closing line written to be quotable
- background before the answer
- "something", "a file", "this folder" where Klunk knows the name
- a button that says OK, or a warning that does not name its action
- file-level or browser-level words a teacher would not use
- a reason longer than two sentences, or one that changes nothing they do

Rewrite anything you find.
