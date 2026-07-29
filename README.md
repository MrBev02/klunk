# Klunk

A point-and-click tool for building exam papers from a question bank, for teachers
who should not have to touch a terminal to do it.

Runs entirely in the browser. There is no server, no account, no database and no API
key. **It makes no network requests after the page loads.**

> Klunk is the mechanic of Vulture Squadron in *Catch the Pigeon*, who builds the
> contraptions out of whatever is lying around. This one assembles exam papers out of
> questions you already have.

## Where your content lives

**Not here.** This repository holds the application and the publicly available NSW
syllabus models. It holds no question banks, no papers and no exam content of any
kind, and the `.gitignore` is written to keep it that way.

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
5. **Produce the paper** as a PDF, or as a Word document that keeps your school's
   template intact.

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
