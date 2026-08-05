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
 */

import { useMemo, useState } from 'preact/hooks'
import { readDocxXml, NotADocxError } from './docx'
import { Field } from './fields'
import { FORMAT_DESCRIPTIONS, readSyllabusXml, type SyllabusFormat } from './formats'
import { NotASyllabusError, suggestSyllabusId, summarise, toSyllabus } from './syllabus'
import { problemsWith, tidyCourses } from './syllabusedit'
import { SyllabusReview } from './syllabusreview'
import { writeJson, type ContentIndex } from './storage'
import type { Syllabus, SyllabusCourse } from './types'

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
  const [path, setPath] = useState('')
  const [reading, setReading] = useState(false)
  const [failed, setFailed] = useState('')
  const [found, setFound] = useState<{
    courses: SyllabusCourse[]
    /** The parse as it came out, so undoing every correction is going back to it. */
    original: SyllabusCourse[]
    format: SyllabusFormat
  } | null>(null)
  const [edits, setEdits] = useState<string[]>([])

  const [id, setId] = useState('')
  const [name, setName] = useState('')
  const [edition, setEdition] = useState('')
  const [saving, setSaving] = useState(false)

  const taken = useMemo(() => new Set(index.syllabuses.map((s) => s.data.id)), [index.syllabuses])
  const outPath = `syllabus/${id || '…'}.json`
  const clash = id !== '' && taken.has(id)

  // Recomputed from the courses rather than kept beside them, so a correction
  // moves the counts on screen. A count that went stale the moment a topic was
  // merged would be worse than no count at all.
  const summary = useMemo(() => (found ? summarise(found.courses) : []), [found])
  const problems = useMemo(() => (found ? problemsWith(found.courses) : []), [found])

  const change = (courses: SyllabusCourse[], what: string) => {
    setFound((was) => (was === null ? was : { ...was, courses }))
    // Typing in a field reports the same change on every keystroke, so only a
    // change different from the last one is worth a line.
    setEdits((was) => (was[was.length - 1] === what ? was : [...was, what]))
  }

  const read = async () => {
    if (!path) return
    setReading(true)
    setFailed('')
    setFound(null)
    setEdits([])
    try {
      const file = await fileFrom(folder, path)
      const { format, courses } = readSyllabusXml(await readDocxXml(file))
      setFound({ courses, original: courses, format })
      const base = path.split('/').pop() ?? path
      setId(suggestSyllabusId(base))
      setName(prettyName(base))
      // Filled in only where the format settles it: the content-table layout is
      // the 2013 one and nothing else uses it. Every other shape covers more
      // than one edition, so the teacher says which.
      setEdition(format === 'tables' ? 'Stage 6 (2013)' : '')
    } catch (err) {
      setFailed(
        err instanceof NotADocxError || err instanceof NotASyllabusError
          ? err.message
          : `Could not read ${path}: ${(err as Error).message}`,
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
        sourceTitle: path.split('/').pop() ?? path,
        retrieved: today,
      })
      await writeJson(folder, outPath, model)
      onSaved(`Saved ${outPath}. Its topics are now offered wherever a question is tagged.`)
    } catch (err) {
      setFailed((err as Error).message)
    } finally {
      setSaving(false)
    }
  }

  if (index.docx.length === 0) {
    return (
      <section class="panel">
        <p class="panel__title">No syllabus document in this folder</p>
        <p>
          Download the syllabus from NESA as a <code>.docx</code> and save it anywhere in
             this folder, then reload. Klunk reads it here, and the model it writes stays in
             your folder.
        </p>
        <p>
          On <code>curriculum.nsw.edu.au</code> the Download button offers Word and PDF.
             Choose Word. Klunk cannot read the PDF.
        </p>
        <p class="hint">
          Klunk does not come with any syllabus model, and that is on purpose. A syllabus is
             copyright, so you build your own from your own copy.
        </p>
      </section>
    )
  }

  return (
    <div class="factory">
      <section class="panel">
        <p class="panel__title">
          <span class="step">1</span> Pick the syllabus document
        </p>
        <p class="hint">
          A NESA syllabus as you downloaded it, in Word format. Klunk reads the Stage 6
             syllabuses and the newer Year 11 and 12 ones, and it works out which kind you
             have given it. It reads the document here in the browser, and nothing leaves
             your computer.
        </p>

        <Field label="Document" for="sr-docx">
          <select
            id="sr-docx"
            class="input"
            value={path}
            onChange={(e) => {
              setPath((e.target as HTMLSelectElement).value)
              setFound(null)
              setFailed('')
            }}
          >
            <option value="">Choose a file…</option>
            {index.docx.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </Field>

        <div class="rowbtns">
          <button class="btn btn--primary" disabled={!path || reading} onClick={() => void read()}>
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
              Klunk read this as {FORMAT_DESCRIPTIONS[found.format]}. Read the topics below
                 against the document itself. Whatever is wrong here is wrong in every question
                 you tag against it, so it is worth ten minutes now.
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

          <SyllabusReview courses={found.courses} onChange={change} />

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

          {clash && (
            <p class="setup__problem">
              This folder already has a syllabus with the id <code>{id}</code>. Saving replaces
                 it, and questions tagged against it keep working. That is what you want when you
                 are re-reading the same syllabus. For a different subject, change the id above.
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
