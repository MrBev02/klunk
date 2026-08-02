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
 * Nothing is written until the teacher has seen what was found. The counts are
 * the thing they can actually check against the document in front of them, and
 * the groups are listed rather than counted because they were wrong for a long
 * time without changing any count (#14).
 */

import { useMemo, useState } from 'preact/hooks'
import { readDocxXml, NotADocxError } from './docx'
import { Field } from './fields'
import {
  NotASyllabusError,
  parseSyllabusXml,
  suggestSyllabusId,
  summarise,
  toSyllabus,
  type SyllabusSummary,
} from './syllabus'
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
  const [found, setFound] = useState<{ courses: SyllabusCourse[]; summary: SyllabusSummary[] } | null>(
    null,
  )

  const [id, setId] = useState('')
  const [name, setName] = useState('')
  const [saving, setSaving] = useState(false)

  const taken = useMemo(() => new Set(index.syllabuses.map((s) => s.data.id)), [index.syllabuses])
  const outPath = `syllabus/${id || '…'}.json`
  const clash = id !== '' && taken.has(id)

  const read = async () => {
    if (!path) return
    setReading(true)
    setFailed('')
    setFound(null)
    try {
      const file = await fileFrom(folder, path)
      const courses = parseSyllabusXml(await readDocxXml(file))
      setFound({ courses, summary: summarise(courses) })
      const base = path.split('/').pop() ?? path
      setId(suggestSyllabusId(base))
      setName(prettyName(base))
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
      const model: Syllabus = toSyllabus(found.courses, {
        id,
        name: name.trim() || id,
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
          A NESA Stage 6 syllabus as you downloaded it, in Word format. Klunk reads it here
             in the browser, and nothing leaves your computer.
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
        <section class="panel">
          <p class="panel__title">
            <span class="step">2</span> Check what was found
          </p>
          <p class="hint">
            Check these counts against the document itself. If a course is missing or a number
               looks wrong, the model is wrong, and so is every question you tag with it.
          </p>

          <ul class="plain setup__list">
            {found.summary.map((c) => (
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
        </section>
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

          {clash && (
            <p class="setup__problem">
              This folder already has a syllabus with the id <code>{id}</code>. Saving replaces
                 it, and questions tagged against it keep working. That is what you want when you
                 are re-reading the same syllabus. For a different subject, change the id above.
            </p>
          )}

          <div class="rowbtns">
            <button class="btn btn--primary" disabled={!id || saving} onClick={() => void save()}>
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
