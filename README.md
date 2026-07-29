# Klunk

A point-and-click tool for building exam papers from a question bank, for teachers
who should not have to touch a terminal to do it.

Runs entirely in the browser. There is no server, no account, no database and no API
key. **It makes no network requests after the page loads.**

> Klunk is the mechanic of Vulture Squadron in *Catch the Pigeon*, who builds the
> contraptions out of whatever is lying around. This one assembles exam papers out of
> questions you already have.

## Where your content lives

**Not here.** This repository holds the application and the tools, and nothing else.
No question banks, no papers, no syllabus models, no exam content of any kind. The
`.gitignore` is written to keep it that way.

Klunk deliberately ships **no syllabus models**. A syllabus is copyright: the NESA
Stage 6 (2013) notice lets a NSW teacher copy reasonable portions for bona fide
study, while forbidding reproduction of a major extract, modification, and
commercial use. A complete content inventory republished on the public web is none
of those. So you generate a model from your own copy of the syllabus, into your own
folder, using the tools in `tools/`.

That constraint made the tool better than bundling would have. NESA Stage 6 (2013)
syllabuses use two different content layouts and the generator reads both:

| Course | Topics | Points | Layout |
|---|---|---|---|
| Design and Technology | 40 | 139 | One 3-column table per course |
| Textiles and Design | 34 | 183 | Many 2-column tables |

Both layouts are supported because the two courses need different ones, not for
the sake of generality.

```
python3 tools/nesa_stage6_syllabus.py <syllabus.docx> \
    --id nsw-hsc-design-technology --name "Design and Technology" \
    --out <your-folder>/syllabus/nsw-hsc-design-technology.json
```

Your content lives in a folder you choose the first time you open the app, normally
your faculty's OneDrive or Teams folder. The app reads and writes that folder
directly. Nothing is uploaded anywhere.

```
your-shared-folder/
  bank/        question banks, one JSON file per topic
  papers/      exam manifests, which reference bank questions rather than copying them
  templates/   your school's Word template
  syllabus/    any syllabus model not shipped with the app
```

## What it does

1. **Model a syllabus.** NSW HSC models ship with the app. Others load from your folder.
2. **Extract past papers and marking guides.** Drop in a PDF; the app segments it into
   questions for you to review and correct before anything is saved.
3. **Build papers** by topic or syllabus structure, with live mark totals and coverage.
4. **Build question banks**, either by typing them in or by generating a prompt to paste
   into whatever AI your school licenses and pasting the structured result back.
5. **Produce the paper** as a PDF, printed straight from the browser.

**Word export is deliberately not built yet.** It only earns its complexity if
teachers actually want to hand-edit the paper afterwards, and that is worth finding
out before committing to it rather than assuming. The plan if it is wanted: merge
into the school's own `.docx` template so the cover page, headers and styles survive
intact, rather than generating a document from scratch.

## About the AI parts

The app contains no AI and talks to no AI service. For the parts where an AI genuinely
helps, it writes you a prompt with the syllabus context already filled in. You paste
that into ChatGPT, Copilot, Gemini, Claude or whatever else your school provides, then
paste the result back and the app checks and files it.

This is deliberate. It means no API keys, no subscription tied to this tool, no vendor
to depend on, and above all it means **you** decide exactly what text leaves your
machine and when.

## Browser support

Chrome and Edge are fully supported: the app opens your folder directly and saves in
place. Safari and Firefox lack the File System Access API, so they fall back to manual
file open and download.

## Status

Early development. Not yet usable.

## Licence

MIT. See `LICENSE`.

Syllabus models in `syllabus/` are derived from publicly available NSW Education
Standards Authority materials. They are not NESA publications and carry no
endorsement.
