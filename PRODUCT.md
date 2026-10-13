# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Classroom teachers of any faculty, building trial examinations and topic tests
on school-issued laptops, mostly Macs, in Chrome or Edge. Heads of faculty use
it the same way; there is no separate admin role. They are not expected to
touch a terminal, and they usually have limited time: a class set of papers to
build in a free period.

Students never use Klunk. They see only the printed paper.

## Product Purpose

Klunk builds exam papers from questions a faculty already has. A teacher opens
their faculty's folder, browses the question bank, builds a paper against the
shape of the real examination, checks it, and prints the student paper and its
marking guide to PDF.

Questions reach the bank three ways: written in the app, drafted or transcribed
by an AI the school already licenses through copy and paste, or read straight
out of a past paper and its marking guide. A syllabus model is built in the app
from the teacher's own copy of the syllabus.

Success is a paper a teacher would hand out unchanged, built faster than by
copying and pasting in Word, with every question traceable to where it came
from.

## Positioning

Everything runs in the browser, against a folder the teacher chooses, normally a
school OneDrive or Teams folder. There is no server, no account, no database and
no API key, and the page makes no network requests after it loads. A
content-security policy of `connect-src 'none'` enforces that rather than
promising it.

There is no AI inside the app. Where an AI helps, Klunk writes the prompt, the
teacher pastes it into whatever their school licenses, and pastes the reply back
for Klunk to check. The teacher sees exactly what text leaves their machine.

## Operating Context

- A shared faculty folder that several teachers save into at once. Two people
  writing to one bank is the normal case, not an edge case.
- NESA and IB documents: past papers, marking guides, syllabuses and subject
  guides, as PDF, Word and spreadsheet files the teacher already has.
- Printing to PDF from Chrome or Edge, on A4.
- The NSW HSC and IB DP examinations as the model of what a paper looks like.
  Proof-of-concept courses are NSW HSC Design and Technology and IB DP Design
  Technology. Textiles and Design is also supported.

## Capabilities and Constraints

- Chrome and Edge only, because the app needs the File System Access API. On a
  Mac that means a teacher cannot use Safari.
- Ships as a GitHub Pages site and as one self-contained HTML file for a shared
  drive.
- The repository is public and holds no exam content. Question banks, papers,
  templates and syllabus models live only in the teacher's folder.
- Klunk ships syllabus generators, never syllabus models, because a syllabus is
  copyright. Paper profiles (the shape of an examination) do ship.
- Question types are a closed list that grows only on evidence: multiple choice,
  multiple response, matching, true or false, short answer, extended response,
  table, drawing.
- Every question carries its provenance, so Klunk can warn when a paper reuses a
  recent public examination question.
- Australian English, AUD, metric, A4.
- Undecided: Word export. It is deliberately not built until teachers show they
  want to hand-edit papers.

## Brand Commitments

- The name Klunk.
- The teacher voice, as set out in the `teacher-material-voice` skill: the action
  first, no reassurance, no argument for an instruction, Australian English, no
  em dashes.
- A school's name and logo appear only on the printed cover sheet. The app itself
  carries no school's branding.

## Evidence on Hand

- `docs/delivered.md` records every feature and what was verified in a browser
  for each.
- `../klunk-content` holds real past papers, marking guides and syllabuses used
  for development. It is outside the repository and must never be committed or
  quoted into it.
- There are no testimonials, usage figures or adoption claims. None may be
  invented.

## Product Principles

1. A teacher should never have to think in the file's terms. Fields name what a
   thing is in the room, not what it is in JSON.
2. Nothing leaves the teacher's machine without them seeing it first.
3. A printed paper must match what the screen previewed. A fault caught on the
   proof is better than one found in the exam room, so missing material shows
   rather than vanishing.
4. Klunk reports what it is unsure of instead of guessing, and says what to check.
5. Mess from several teachers working in one folder is normal and must be
   handled, not prevented.

## Accessibility & Inclusion

WCAG 2.2 AA is the floor for the app's own screens: contrast, keyboard use,
visible focus, and colour never the only signal. Printed papers follow
examination conventions instead.
