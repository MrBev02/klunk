/**
 * Turning a NESA syllabus document into a model, in the app.
 *
 * The instruction this replaces was a command line with three flags, preceded
 * by "have Python 3.11 installed". It was the last place Klunk asked a teacher
 * to leave the app to do something the app is for.
 *
 * Klunk still ships no syllabus model, and this does not change that. The
 * document is the teacher's own copy, the model is written into the teacher's
 * own folder, and nothing is bundled or transmitted — `connect-src 'none'` is
 * untouched, because the file is one they already have rather than one fetched
 * from NESA.
 *
 * Nothing is written until the teacher has seen what was found, and since #42
 * that means the topics themselves rather than a count of them. The counts stay,
 * because both #14 and #26 first showed as a count that was wrong, and the groups
 * are listed rather than counted because they were wrong for a long time without
 * changing any count. But #26 is the case that decided the shape of this screen:
 * the count was right while the content was wrong, so the content is on screen
 * and can be corrected before anything is written.
 *
 * The document comes from the folder or from anywhere on the computer (#57). It
 * used to come only from the folder, and a folder holding none was told to go and
 * put one there, which is an instruction rather than a control: a syllabus is
 * downloaded to Downloads, and nothing about building a model requires it to be
 * moved first. So a picked document is read where it lies and is not copied in.
 * The model is the artefact this screen exists to write, it records the
 * document's filename as its source, and it goes into the folder either way.
 */

import { useEffect, useMemo, useState } from 'preact/hooks'
import { readDocxXml, NotADocxError } from './docx'
import { DocumentOptions, Field } from './fields'
import { historyOf, type DocumentNote } from './manifest'
import {
  FORMAT_DESCRIPTIONS,
  readSyllabusPdf,
  readSyllabusWorkbook,
  readSyllabusXml,
  type SyllabusFormat,
} from './formats'
import { readPdf } from './pdftext'
import { NotASyllabusError, suggestSyllabusId, summarise, toSyllabus } from './syllabus'
import { costOfReplacing, problemsWith, tidyCourses } from './syllabusedit'
import { SyllabusReview } from './syllabusreview'
import { allQuestions, rememberDocument, writeJson, type ContentIndex } from './storage'
import type { Syllabus, SyllabusCourse } from './types'
import { readWorkbook } from './xlsx'

/**
 * Who publishes what Klunk just read, so the model says so.
 *
 * Only the two IB readers settle it, because each is one document rather than a
 * shape: the three Word readers each cover several NESA syllabuses and none of
 * them covers anything else. `toSyllabus` defaults to NESA, which is right for
 * all three of those and wrong for either reading of the IB syllabus.
 */
const IB: { framework: string; authority: string; licence: string } = {
  framework: 'IB',
  authority: 'International Baccalaureate Organization',
  licence: 'International Baccalaureate Organization. Not redistributable.',
}

/**
 * Two documents of one syllabus: the subject guide and the old-to-new map.
 *
 * They are the same course and must produce the same model, so everything the
 * shape of the document settles — the id, the name, the publisher, the edition —
 * is settled the same way whichever of the two a teacher brought (#58).
 */
function isIbDesignTechnology(format: SyllabusFormat): boolean {
  return format === 'guide' || format === 'workbook'
}

/** Prefilled only where the shape of the document settles which edition it is. */
const EDITIONS: Partial<Record<SyllabusFormat, string>> = {
  tables: 'Stage 6 (2013)',
  workbook: 'First assessment 2027',
  guide: 'First assessment 2027',
}

function isWorkbook(path: string): boolean {
  return path.toLowerCase().endsWith('.xlsx')
}

function isPdf(path: string): boolean {
  return path.toLowerCase().endsWith('.pdf')
}

/** The three extensions Klunk has a reader for, which is what a drop is checked against. */
const READABLE = /\.(docx|xlsx|pdf)$/i

/**
 * The document to read.
 *
 * `file` is null when it is one of the folder's own, in which case `path` is
 * folder-relative and the bytes are fetched when Read it is pressed. A file
 * picked or dropped brings its bytes with it and has only a filename, because
 * that is all the browser will say about where it came from.
 */
type Chosen = { path: string; file: File | null }

export function SyllabusReader({
  index,
  folder,
  today,
  onSaved,
}: {
  index: ContentIndex
  folder: FileSystemDirectoryHandle
  /** ISO date, passed in so a model is reproducible and the clock is not reached for here. */
  today: string
  onSaved: (message: string) => void
}) {
  const [chosen, setChosen] = useState<Chosen | null>(null)
  // Bumped when a note lands, so the list regroups without waiting for a rescan.
  // Only saving reloads the folder, and the interesting case here is a refusal,
  // which never does: three past papers refused in a row should sink to the
  // bottom of the list as it happens rather than at the next reload.
  const [, noted] = useState(0)
  const remember = (entry: DocumentNote) => {
    void rememberDocument(folder, index, entry).then(() => noted((n) => n + 1))
  }
  const [dragging, setDragging] = useState(false)
  const [reading, setReading] = useState(false)
  const [failed, setFailed] = useState('')
  const [found, setFound] = useState<{
    courses: SyllabusCourse[]
    /** The parse as it came out, so undoing every correction is going back to it. */
    original: SyllabusCourse[]
    format: SyllabusFormat
    /** Topic ids the reader is unsure about, which the review panel points at. */
    suspects: string[]
    /** The filename as read, which the model records. Held here rather than read
     * back off the selection, because it belongs to what was parsed. */
    source: string
  } | null>(null)
  const [edits, setEdits] = useState<string[]>([])

  const [id, setId] = useState('')
  const [name, setName] = useState('')
  const [edition, setEdition] = useState('')
  const [saving, setSaving] = useState(false)

  // Both kinds in one list, sorted together, because a teacher picks the
  // document they downloaded and should not first have to know which reader
  // Klunk will use on it.
  // Every PDF too, since #58, and that changes the character of this list: a
  // teacher's folder holds past papers, so most of what is offered here is now
  // something the syllabus readers will refuse. That is the right way round —
  // refusing by name is a sentence on screen, and not offering the guide at all
  // was the whole fault.
  const documents = useMemo(
    () => [...index.docx, ...index.workbooks, ...index.pdfs].sort((a, b) => a.localeCompare(b)),
    [index.docx, index.workbooks, index.pdfs],
  )

  // A rescan can take away the document chosen out of the folder: it can be
  // renamed, moved, or tidied away once its model is saved. The selection has to
  // go with it, or Read it points at a file that is not there. What was already
  // parsed stays, because a correction half made is worth more than a selection,
  // and `found` carries the filename the model records for exactly this reason.
  useEffect(() => {
    setChosen((was) =>
      was === null || was.file !== null || documents.includes(was.path) ? was : null,
    )
  }, [documents])

  const taken = useMemo(() => new Set(index.syllabuses.map((s) => s.data.id)), [index.syllabuses])
  const outPath = `syllabus/${id || '…'}.json`
  const clash = id !== '' && taken.has(id)

  // Recomputed from the courses rather than kept beside them, so a correction
  // moves the counts on screen. A count that went stale the moment a topic was
  // merged would be worse than no count at all.
  // What came of this document last time, for the teacher about to read it
  // again. Only ever about one of the folder's own: a picked file has a filename
  // and nothing else, so a match on it would be a coincidence.
  const history =
    chosen && chosen.file === null ? historyOf(index.manifest, chosen.path) : ''

  const summary = useMemo(() => (found ? summarise(found.courses) : []), [found])
  const problems = useMemo(() => (found ? problemsWith(found.courses) : []), [found])

  // What replacing the model already in the folder would take away from the
  // questions tagged against it. Counted rather than promised: this screen used
  // to tell a teacher those questions keep working, which stopped being true the
  // moment a model could be corrected by hand (#44).
  const replacing = useMemo(() => {
    if (!found || !clash) return null
    const onDisk = index.syllabuses.find((s) => s.data.id === id)
    if (!onDisk) return null
    return costOfReplacing(onDisk.data.courses, found.courses, allQuestions(index), id)
  }, [found, clash, id, index])

  const change = (courses: SyllabusCourse[], what: string) => {
    setFound((was) => (was === null ? was : { ...was, courses }))
    // Typing in a field reports the same change on every keystroke, so only a
    // change different from the last one is worth a line.
    setEdits((was) => (was[was.length - 1] === what ? was : [...was, what]))
  }

  /** A document from anywhere: the picker and a drop both land here. */
  const take = (file: File) => {
    setChosen({ path: file.name, file })
    setFound(null)
    setFailed('')
  }

  const pick = async () => {
    setFailed('')
    try {
      const handles = await window.showOpenFilePicker({
        id: 'klunk-syllabus',
        multiple: false,
        types: [
          {
            description: 'Syllabus documents',
            accept: {
              'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx'],
              'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'],
              'application/pdf': ['.pdf'],
            },
          },
        ],
      })
      const handle = handles[0]
      if (!handle) return
      take(await handle.getFile())
    } catch (err) {
      // Closing the dialog is not a fault.
      if (err instanceof DOMException && err.name === 'AbortError') return
      setFailed((err as Error).message)
    }
  }

  const drop = (e: DragEvent) => {
    e.preventDefault()
    setDragging(false)
    const dropped = [...(e.dataTransfer?.files ?? [])]
    const file = dropped.find((f) => READABLE.test(f.name))
    if (file) {
      take(file)
      return
    }
    const first = dropped[0]
    setFailed(
      first
        ? `Klunk reads a syllabus as a .docx, a .xlsx or a .pdf, and ${first.name} is none of those.`
        : 'That was not a file Klunk could take. Drop the syllabus document itself, not a link to it.',
    )
  }

  const read = async () => {
    if (!chosen) return
    setReading(true)
    setFailed('')
    setFound(null)
    setEdits([])
    try {
      const file = chosen.file ?? (await fileFrom(folder, chosen.path))
      // Three kinds of document, told apart by extension long before any reader
      // sees them, because the three take different things: markup, rows and
      // pages of positioned text.
      const { format, courses, suspects } = isPdf(chosen.path)
        ? readSyllabusPdf(await readPdf(new Uint8Array(await file.arrayBuffer())))
        : isWorkbook(chosen.path)
          ? readSyllabusWorkbook(await readWorkbook(file))
          : readSyllabusXml(await readDocxXml(file))
      const base = chosen.path.split('/').pop() ?? chosen.path
      // Only the folder's own documents (#74). A file picked from Downloads is
      // read where it lies and is never copied in, so all Klunk has is its
      // filename, and an entry keyed on that would claim something about a path
      // in the folder that may hold a different document or none at all.
      if (chosen.file === null) {
        remember({ path: chosen.path, read: 'syllabus', when: today })
      }
      setFound({ courses, original: courses, format, suspects, source: base })
      setId(isIbDesignTechnology(format) ? 'ib-dp-design-technology' : suggestSyllabusId(base))
      setName(isIbDesignTechnology(format) ? 'Design Technology' : prettyName(base))
      // Filled in only where the format settles it: the content-table layout is
      // the 2013 one and nothing else uses it, and both IB readers are the one
      // course whose first assessment year is the whole reason it exists. Every
      // other shape covers more than one edition, so the teacher says which.
      setEdition(EDITIONS[format] ?? '')
    } catch (err) {
      // A refusal is a fact about the document worth keeping: it is what stops
      // the same past paper being offered at the top of this list tomorrow, and
      // it costs nothing to establish twice only because nobody wrote it down.
      // Only a refusal, though. A document that broke on the way to a reader
      // says nothing about what it is.
      const refused = err instanceof NotADocxError || err instanceof NotASyllabusError
      if (refused && chosen.file === null) {
        remember({ path: chosen.path, refused: 'syllabus', when: today })
      }
      setFailed(
        refused
          ? (err as Error).message
          : `Could not read ${chosen.path}: ${(err as Error).message}`,
      )
    } finally {
      setReading(false)
    }
  }

  const save = async () => {
    if (!found) return
    setSaving(true)
    setFailed('')
    try {
      const model: Syllabus = toSyllabus(tidyCourses(found.courses), {
        id,
        name: name.trim() || id,
        syllabusVersion: edition,
        sourceTitle: found.source,
        retrieved: today,
        ...(isIbDesignTechnology(found.format) ? IB : {}),
      })
      await writeJson(folder, outPath, model)
      if (chosen?.file === null) {
        remember({ path: chosen.path, read: 'syllabus', into: outPath, when: today })
      }
      onSaved(`Saved ${outPath}. Its topics are now offered wherever a question is tagged.`)
    } catch (err) {
      setFailed((err as Error).message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div class="factory">
      <section class="panel">
        <p class="panel__title">
          <span class="step">1</span> Pick the syllabus document
        </p>
        <p class="hint">
          Klunk reads a NESA syllabus as a Word document, and the IB Design Technology
             subject guide as a PDF or its old-to-new syllabus map as a spreadsheet. It works
             out which kind you have given it.
        </p>

        {documents.length > 0 && (
          <Field label="In this folder" for="sr-docx">
            <select
              id="sr-docx"
              class="input"
              value={chosen && chosen.file === null ? chosen.path : ''}
              onChange={(e) => {
                const picked = (e.target as HTMLSelectElement).value
                setChosen(picked ? { path: picked, file: null } : null)
                setFound(null)
                setFailed('')
              }}
            >
              <option value="">Choose a file…</option>
              <DocumentOptions paths={documents} manifest={index.manifest} want="syllabus" />
            </select>
          </Field>
        )}

        <div
          class={`pickfile${dragging ? ' pickfile--over' : ''}`}
          onDragOver={(e) => {
            e.preventDefault()
            if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy'
            if (!dragging) setDragging(true)
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={drop}
        >
          <button class="btn" onClick={() => void pick()}>
            {documents.length > 0 ? 'Or choose a file on this computer' : 'Choose a file on this computer'}
          </button>
          <p class="hint">Or drag a syllabus onto this box.</p>
        </div>

        {documents.length === 0 && (
          <>
            <p class="hint">
              This folder has no syllabus document in it. Choose one from this computer with
                 the button above.
            </p>
            <p class="hint">
              When NESA offers you Word or PDF, choose Word. Klunk reads a NESA syllabus only
                 as a Word document.
            </p>
          </>
        )}

        {chosen && (
          <div class="chosen">
            <p class="chosen__file">{chosen.path}</p>
            <p class="chosen__where">
              {chosen.file
                ? 'From this computer. Klunk reads it where it is and does not copy it into your folder.'
                : 'From this folder.'}
            </p>
            {history && <p class="chosen__where">{history}</p>}
          </div>
        )}

        <div class="rowbtns">
          <button
            class="btn btn--primary"
            disabled={!chosen || reading}
            onClick={() => void read()}
          >
            {reading ? 'Reading…' : 'Read it'}
          </button>
        </div>
      </section>

      {failed && (
        <section class="panel panel--alert">
          <p class="panel__title">Klunk could not read that</p>
          <p>{failed}</p>
        </section>
      )}

      {found && (
        <>
          <section class="panel">
            <p class="panel__title">
              <span class="step">2</span> Check what was found
            </p>
            <p class="hint">
              Check the topics below against the document itself. Anything wrong here will be
                 wrong in every question you tag against it. Klunk read this as{' '}
              {FORMAT_DESCRIPTIONS[found.format]}.
            </p>

            <ul class="plain setup__list">
              {summary.map((c) => (
                <li key={c.courseId} class="setup__row">
                  <div>
                    <strong>{c.courseName}</strong>
                    <br />
                    <span class="muted mono setup__meta">
                      {c.topics} topics · {c.points} content points · {c.outcomes} outcomes
                    </span>
                    <br />
                    <span class="muted setup__meta">
                      {c.groups.length === 0
                        ? 'No focus areas, so every topic sits directly under the course.'
                        : `Focus areas: ${c.groups.join(' · ')}`}
                    </span>
                  </div>
                </li>
              ))}
            </ul>

            {found.courses.every((c) => c.topics.every((t) => (t.outcomes ?? []).length === 0)) && (
              <p class="hint">
                This syllabus sets its outcomes against the course rather than against each
                   topic, so no topic below lists any. When you write a question, Klunk offers
                   you every outcome in the course.
              </p>
            )}

            <p class="hint">
              Open a topic to see its content points, and use Fix this topic to change
                 anything that came out wrong. Nothing is written into your folder until you
                 save at the bottom of this page.
            </p>
          </section>

          <SyllabusReview courses={found.courses} suspects={found.suspects} onChange={change} />

          {edits.length > 0 && (
            <section class="panel panel--note">
              <p class="panel__title">
                You have changed {edits.length} thing{edits.length === 1 ? '' : 's'}
              </p>
              <ul class="plain review__log">
                {edits.map((what, i) => (
                  <li key={i}>{what}</li>
                ))}
              </ul>
              <div class="rowbtns">
                <button
                  class="btn btn--small"
                  onClick={() => {
                    setFound((was) => (was === null ? was : { ...was, courses: was.original }))
                    setEdits([])
                  }}
                >
                  Undo every change
                </button>
              </div>
            </section>
          )}
        </>
      )}

      {found && (
        <section class="panel">
          <p class="panel__title">
            <span class="step">3</span> Name it and save
          </p>

          <div class="fieldrow">
            <Field label="Subject" for="sr-name" hint="As it appears in the topic lists">
              <input
                id="sr-name"
                class="input"
                value={name}
                placeholder="Design and Technology"
                onInput={(e) => setName((e.target as HTMLInputElement).value)}
              />
            </Field>

            <Field label="Id" for="sr-id" hint={`Saved as ${outPath}`}>
              <input
                id="sr-id"
                class="input mono"
                value={id}
                placeholder="nsw-hsc-design-technology"
                onInput={(e) => setId((e.target as HTMLInputElement).value)}
              />
            </Field>
          </div>

          <Field
            label="Edition"
            for="sr-edition"
            hint="As the document names it. Leave it blank if you are not sure."
          >
            <input
              id="sr-edition"
              class="input"
              value={edition}
              placeholder="Stage 6 (2013)"
              onInput={(e) => setEdition((e.target as HTMLInputElement).value)}
            />
          </Field>

          {edition.trim() === '' && (
            <p class="hint">
              Two editions of a subject can run at once, with Year 11 on the new syllabus
                 while Year 12 finishes the old one. Filling this in is what tells your two
                 models apart later.
            </p>
          )}

          {clash && replacing !== null && replacing.questions > 0 && (
            <p class="setup__problem">
              {replacing.questions} question{replacing.questions === 1 ? '' : 's'} in this folder
                 {replacing.questions === 1 ? ' is' : ' are'} tagged against something this model
                 does not have. Saving replaces <code>{outPath}</code>, and those tags stop
                 matching anything: {nameSome(replacing.inUse)}. Klunk does not retag the
                 questions for you, so open them afterwards and tag them again.
            </p>
          )}

          {clash && replacing !== null && replacing.questions === 0 && (
            <p class="hint">
              Saving replaces <code>{outPath}</code>.{' '}
              {replacing.lost.length === 0
                ? 'Everything that file has is in this model too, so the questions tagged against it are unaffected.'
                : `${replacing.lost.length} topics, content points and outcomes in that file are not in this model, and no question in this folder is tagged against any of them.`}{' '}
              For a different subject, change the id above.
            </p>
          )}

          {clash && replacing === null && (
            <p class="setup__problem">
              This folder already has a syllabus with the id <code>{id}</code>, and saving
                 replaces it. Klunk could not read the one already there, so it cannot tell you
                 what the questions tagged against it lose. For a different subject, change the
                 id above.
            </p>
          )}

          {problems.length > 0 && (
            <div class="panel panel--alert">
              <p class="panel__title">
                {problems.length} thing{problems.length === 1 ? '' : 's'} to fix before this can
                be saved
              </p>
              <ul class="plain">
                {problems.map((p, i) => (
                  <li key={i}>{p}</li>
                ))}
              </ul>
            </div>
          )}

          <div class="rowbtns">
            <button
              class="btn btn--primary"
              disabled={!id || saving || problems.length > 0}
              onClick={() => void save()}
            >
              {saving ? 'Saving…' : clash ? 'Replace it' : 'Save the model'}
            </button>
          </div>
        </section>
      )}
    </div>
  )
}

/**
 * A few of the ids, named rather than counted.
 *
 * All of them would be a wall of codes on a warning a teacher reads in passing,
 * and none of them would leave nothing to go and look for.
 */
function nameSome(ids: string[]): string {
  const shown = ids.slice(0, 6).join(', ')
  const rest = ids.length - 6
  return rest > 0 ? `${shown} and ${rest} more` : shown
}

/** A filename to something worth putting in front of a teacher. */
function prettyName(filename: string): string {
  return filename
    .replace(/\.[^.]+$/, '')
    .replace(/[-_]+/g, ' ')
    .replace(/\b(st6|syl|syllabus)\b/gi, '')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^\w/, (c) => c.toUpperCase())
}

async function fileFrom(dir: FileSystemDirectoryHandle, path: string): Promise<File> {
  const parts = path.split('/').filter(Boolean)
  const name = parts.pop()
  if (!name) throw new Error(`There is no file at ${path}.`)
  let here = dir
  for (const part of parts) here = await here.getDirectoryHandle(part)
  return (await here.getFileHandle(name)).getFile()
}
