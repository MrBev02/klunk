/**
 * Filling a bank from a past paper, one review at a time.
 *
 * The reading is done by `extract.ts` and `guide.ts` and the mapping by
 * `adopt.ts`. What this adds is the part the issue insisted on: **nothing is
 * saved until a teacher has looked at it.** A mis-parsed question that reaches a
 * bank quietly is found in the exam room, so every question is on screen with
 * what the readers noticed about it, and a question with an error cannot be
 * saved from here at all — it goes to the question editor, exactly as a bad AI
 * draft does.
 *
 * The papers are offered from the teacher's own folder rather than through a
 * file dialog. Past papers are downloaded into the content folder alongside the
 * banks they will fill, so the ones already there are the ones wanted, and it
 * saves a trip through a native picker for a file the app can already see.
 */

import { useMemo, useState } from 'preact/hooks'
import { adoptPaper, type Adopted } from './adopt'
import type { Editing } from './editor'
import { extractPaper, stampSource, type ExtractedQuestion } from './extract'
import { courseChoices } from './factory'
import { CheckList, Field } from './fields'
import { applyGuide, extractGuide } from './guide'
import { cutOut, picturesFor, type Cutout } from './pdfimage'
import { openPdf, pagesFromDocument, readPdf } from './pdftext'
import { QuestionDetail } from './question'
import {
  copyFileInto,
  joinPath,
  questionIds,
  readBytes,
  saveQuestion,
  type ContentIndex,
} from './storage'
import { QUESTION_TYPE_LABELS, questionLabel } from './types'
import { cleanQuestion } from './validate'

/**
 * NESA was BOSTES until the end of 2016, and a copyright line naming the wrong
 * body is worse than useless: this is the field that decides where a paper
 * holding the question may go.
 */
function copyrightFor(year: number | undefined): string {
  if (year !== undefined && year <= 2016) {
    return 'Board of Studies, Teaching and Educational Standards NSW'
  }
  return 'NSW Education Standards Authority'
}

export function Extractor({
  index,
  folder,
  onEdit,
  onSaved,
}: {
  index: ContentIndex
  folder: FileSystemDirectoryHandle
  onEdit: (editing: Editing) => void
  onSaved: () => void
}) {
  const courses = useMemo(() => courseChoices(index), [index])
  const banks = index.banks

  const [paperPath, setPaperPath] = useState('')
  const [guidePath, setGuidePath] = useState('')
  const [courseKey, setCourseKey] = useState(courses[0]?.key ?? '')
  const [bankPath, setBankPath] = useState(banks[0]?.path ?? '')
  const [paperName, setPaperName] = useState('NSW HSC Design and Technology')

  const [reading, setReading] = useState(false)
  const [failed, setFailed] = useState('')
  const [read, setRead] = useState<{ adopted: Adopted[]; notes: string[]; year?: number } | null>(
    null,
  )
  const [discarded, setDiscarded] = useState<string[]>([])
  const [renamed, setRenamed] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)

  const chosen = courses.find((c) => c.key === courseKey)

  const readPaper = async () => {
    if (!paperPath) return
    setReading(true)
    setFailed('')
    setDiscarded([])
    setRenamed({})
    setRead(null)
    try {
      // One open document for both the text and the pictures: `getDocument`
      // detaches the bytes it is given, so opening the same file twice throws.
      const doc = await openPdf(await readBytes(folder, paperPath))
      const pages = await pagesFromDocument(doc)
      let paper = extractPaper(pages)
      if (guidePath) {
        paper = applyGuide(paper, extractGuide(await readPdf(await readBytes(folder, guidePath))))
      }
      const year = paper.year
      if (year !== undefined) {
        paper = stampSource(paper, {
          paper: paperName.trim() || 'Past paper',
          year,
          copyright: copyrightFor(year),
        })
      }

      // Where the text is not, on the pages a question covers.
      const wanted = new Map<ExtractedQuestion, ReturnType<typeof picturesFor>>()
      for (const question of paper.questions) {
        const regions = picturesFor(question, pages)
        if (regions.length > 0) wanted.set(question, regions)
      }
      const cut = await cutOut(doc, [...wanted.values()].flat())
      const cutouts = new Map<ExtractedQuestion, Cutout[]>()
      for (const [question, regions] of wanted) {
        const mine = cut.filter((c) => regions.includes(c.region))
        if (mine.length > 0) cutouts.set(question, mine)
      }

      const adopted = adoptPaper(paper, {
        bankPath,
        inFolder: questionIds(index),
        inBank: new Set(
          (banks.find((b) => b.path === bankPath)?.data.questions ?? []).map((q) => q.id),
        ),
        syllabusId: chosen?.syllabus.id,
        courseId: chosen?.course.id,
      }, cutouts)

      const notes = [...paper.notes]
      if (year === undefined) {
        notes.push(
          'No year was found on the front of this paper, so nothing has been stamped with where it came from. Add it in the editor before saving, or these questions cannot be traced back.',
        )
      }
      setRead({ adopted, notes, ...(year === undefined ? {} : { year }) })
    } catch (err) {
      setFailed((err as Error).message)
    } finally {
      setReading(false)
    }
  }

  // Worked out from the folder rather than remembered, so a question sent to the
  // editor and saved there comes back marked saved too.
  const alreadySaved = useMemo(() => questionIds(index), [index])
  const savedAs = (a: Adopted) => renamed[a.question.id] ?? a.question.id
  const live = (read?.adopted ?? []).filter((a) => !discarded.includes(a.question.id))
  const unsaved = live.filter((a) => !alreadySaved.has(savedAs(a)))
  const ready = unsaved.filter((a) => !a.faults.some((f) => f.severity === 'error'))
  const stuck = unsaved.length - ready.length

  const togglePicture = (id: string, at: number) => {
    setRead((r) =>
      r === null
        ? r
        : {
            ...r,
            adopted: r.adopted.map((a) =>
              a.question.id !== id
                ? a
                : {
                    ...a,
                    pictures: a.pictures.map((p, i) => (i === at ? { ...p, keep: !p.keep } : p)),
                  },
            ),
          },
    )
  }

  const saveReady = async () => {
    setSaving(true)
    setFailed('')
    try {
      const moved: Record<string, string> = {}
      for (const item of ready) {
        // The pictures go in first, because the question has to point at them and
        // a question pointing at a file that was never written prints a
        // placeholder naming a file nobody has.
        const kept = item.pictures.filter((p) => p.keep)
        const stimulus = []
        for (const [at, picture] of kept.entries()) {
          const name = `${item.question.id}${kept.length > 1 ? `-${at + 1}` : ''}.png`
          const written = await copyFileInto(folder, imageDirectory(bankPath), name, picture.cutout.blob)
          stimulus.push({
            kind: 'image' as const,
            // Stored relative to the bank, which is how every other stimulus is
            // stored and what lets the whole folder be moved.
            file: relativeToBank(bankPath, imageDirectory(bankPath), written),
            alt: `Picture from question ${item.question.source?.questionNumber ?? item.question.id} of the ${item.question.source?.year ?? ''} paper`.trim(),
          })
        }

        const question = stimulus.length > 0
          ? { ...item.question, stimulus }
          : item.question
        const written = await saveQuestion(folder, bankPath, cleanQuestion(question), {
          syllabusId: chosen?.syllabus.id,
        })
        if (written.reassignedFrom !== undefined) moved[written.reassignedFrom] = written.id
      }
      setRenamed((r) => ({ ...r, ...moved }))
      onSaved()
    } catch (err) {
      setFailed((err as Error).message)
    } finally {
      setSaving(false)
    }
  }

  if (index.pdfs.length === 0) {
    return (
      <section class="panel">
        <p class="panel__title">No PDFs in this folder</p>
        <p>
          Klunk fills a bank from the past papers already in your content folder. Put the
          paper, and its marking guide if you have one, somewhere under the folder you
          opened — <span class="mono">source/</span> is the usual place — and they appear
          here.
        </p>
      </section>
    )
  }

  return (
    <div class="factory">
      <section class="panel">
        <p class="panel__title">
          <span class="step">1</span> Choose the paper
        </p>
        <p class="hint">
          Both files stay on this machine. Klunk reads them in the browser and sends
          nothing anywhere.
        </p>

        <div class="grid2">
          <Field label="Past paper" for="ex-paper">
            <select
              id="ex-paper"
              value={paperPath}
              onChange={(e) => setPaperPath((e.target as HTMLSelectElement).value)}
            >
              <option value="">Choose a PDF…</option>
              {index.pdfs.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </Field>

          <Field
            label="Marking guide (optional)"
            for="ex-guide"
            hint="Brings the answers, the criteria and the syllabus outcomes with it."
          >
            <select
              id="ex-guide"
              value={guidePath}
              onChange={(e) => setGuidePath((e.target as HTMLSelectElement).value)}
            >
              <option value="">None</option>
              {index.pdfs
                .filter((p) => p !== paperPath)
                .map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
            </select>
          </Field>

          <Field label="Tag against" for="ex-course">
            <select
              id="ex-course"
              value={courseKey}
              onChange={(e) => setCourseKey((e.target as HTMLSelectElement).value)}
            >
              {courses.length === 0 && <option value="">No syllabus in this folder</option>}
              {courses.map((c) => (
                <option key={c.key} value={c.key}>
                  {c.label}
                </option>
              ))}
            </select>
          </Field>

          <Field
            label="Examination"
            for="ex-name"
            hint="Recorded on every question, with the year read off the paper itself."
          >
            <input
              id="ex-name"
              type="text"
              value={paperName}
              onInput={(e) => setPaperName((e.target as HTMLInputElement).value)}
            />
          </Field>
        </div>

        <div class="rowbtns">
          <button
            class="btn btn--primary"
            disabled={!paperPath || reading}
            onClick={() => void readPaper()}
          >
            {reading ? 'Reading…' : 'Read the paper'}
          </button>
        </div>

        {failed && (
          <div class="panel panel--bad" style={{ marginTop: '0.8rem' }}>
            <p>{failed}</p>
          </div>
        )}
      </section>

      {read && (
        <section class="panel">
          <p class="panel__title">
            <span class="step">2</span> Check every question before it is kept
          </p>
          <p class="hint">
            A question read wrongly and saved quietly is found in the exam room. Klunk has
            said what it is unsure about; the reading of it is yours.
          </p>

          {read.notes.length > 0 && (
            <div class="draft__note">
              <p class="det__label">About the paper as a whole</p>
              <ul class="plain">
                {read.notes.map((n, i) => (
                  <li key={i}>{n}</li>
                ))}
              </ul>
            </div>
          )}

          <div class="grid2">
            <Field label="Bank to save into" for="ex-bank">
              <select
                id="ex-bank"
                value={bankPath}
                onChange={(e) => setBankPath((e.target as HTMLSelectElement).value)}
              >
                {banks.length === 0 && <option value="">No bank in this folder</option>}
                {banks.map((b) => (
                  <option key={b.path} value={b.path}>
                    {b.path}
                  </option>
                ))}
              </select>
            </Field>
          </div>

          <p class="det__label" style={{ marginTop: '0.6rem' }}>
            {read.adopted.length} question{read.adopted.length === 1 ? '' : 's'} read
            {read.year !== undefined && ` from the ${read.year} paper`} ·{' '}
            {read.adopted.reduce((sum, a) => sum + a.question.marks, 0)} marks
          </p>

          <ol class="drafts">
            {live.map((item, i) => (
              <ExtractedCard
                key={item.question.id}
                item={item}
                at={i}
                bankPath={bankPath}
                onTogglePicture={(n) => togglePicture(item.question.id, n)}
                saved={alreadySaved.has(savedAs(item))}
                savedAs={renamed[item.question.id]}
                onEdit={() =>
                  onEdit({ question: item.question, file: bankPath, fresh: true })
                }
                onDiscard={() => setDiscarded((d) => [...d, item.question.id])}
              />
            ))}
          </ol>

          {unsaved.length === 0 ? (
            <p class="hint">Everything here has been saved or discarded.</p>
          ) : (
            <div class="rowbtns">
              <button
                class="btn btn--primary"
                disabled={ready.length === 0 || saving || !bankPath}
                onClick={() => void saveReady()}
              >
                {saving
                  ? 'Saving…'
                  : `Save ${ready.length} question${ready.length === 1 ? '' : 's'} into this bank`}
              </button>
              {stuck > 0 && (
                <p class="hint">
                  {stuck} of these cannot be saved from here. Open one in the editor to
                  finish it.
                </p>
              )}
            </div>
          )}
        </section>
      )}
    </div>
  )
}

/** Where a bank's pictures live, beside the bank rather than mixed in with it. */
function imageDirectory(bankPath: string): string {
  const slash = bankPath.lastIndexOf('/')
  return slash < 0 ? 'stimulus' : `${bankPath.slice(0, slash)}/stimulus`
}

/** `copyFileInto` returns a filename; a stimulus wants it relative to the bank. */
function relativeToBank(bankPath: string, directory: string, name: string): string {
  const full = directory ? `${directory}/${name}` : name
  const bankDir = bankPath.slice(0, Math.max(0, bankPath.lastIndexOf('/')))
  return bankDir && full.startsWith(`${bankDir}/`) ? full.slice(bankDir.length + 1) : full
}

function ExtractedCard({
  item,
  at,
  saved,
  savedAs,
  bankPath,
  onEdit,
  onDiscard,
  onTogglePicture,
}: {
  item: Adopted
  at: number
  saved: boolean
  savedAs?: string | undefined
  bankPath: string
  onEdit: () => void
  onDiscard: () => void
  onTogglePicture: (at: number) => void
}) {
  const [open, setOpen] = useState(false)
  const q = item.question
  const errors = item.faults.filter((f) => f.severity === 'error')
  const state = saved ? 'saved' : errors.length > 0 ? 'bad' : 'ready'

  return (
    <li class={`draft draft--${state}`}>
      <div class="draft__head">
        <span class="draft__n">{at + 1}</span>
        <span class="draft__stem">{questionLabel(q)}</span>
        <span class="draft__state">
          {saved ? 'Saved' : errors.length > 0 ? `${errors.length} to fix` : 'Ready'}
        </span>
      </div>

      <p class="det__label">
        <span class="mono">{savedAs ?? q.id}</span> · {QUESTION_TYPE_LABELS[q.questionType]} ·{' '}
        {q.marks} mark{q.marks === 1 ? '' : 's'} ·{' '}
        {/* The page is what a doubtful question gets checked against, so it is on
            the card rather than hidden behind the detail. */}
        page{item.pages.length === 1 ? '' : 's'} {item.pages.join(', ')}
        {q.source?.year !== undefined && ` · ${q.source.year} Q${q.source.questionNumber}`}
      </p>

      {savedAs && (
        <div class="draft__note">
          <p>
            <span class="mono">{q.id}</span> had been taken since you opened this folder,
            so this went in as <span class="mono">{savedAs}</span> rather than replacing
            theirs.
          </p>
        </div>
      )}

      {item.pictures.length > 0 && (
        <div class="draft__note">
          <p class="det__label">
            {item.pictures.filter((p) => p.keep).length} of {item.pictures.length} picture
            {item.pictures.length === 1 ? '' : 's'} will be saved with this question
          </p>
          <p class="hint">
            Cut from where the page has no text on it, which is a good guess and not a
            fact. Drop anything that is not part of the question.
          </p>
          <ul class="cutouts">
            {item.pictures.map((picture, n) => (
              <li key={n} class={picture.keep ? '' : 'cutouts--dropped'}>
                <img src={picture.cutout.url} alt={`Picture ${n + 1} from page ${picture.cutout.region.page}`} />
                <button class="btn btn--small" onClick={() => onTogglePicture(n)} disabled={saved}>
                  {picture.keep ? 'Drop this one' : 'Keep it after all'}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {item.notes.length > 0 && (
        <div class="draft__note">
          <p class="det__label">Worth checking against the paper</p>
          <ul class="plain">
            {item.notes.map((n, i) => (
              <li key={i}>{n}</li>
            ))}
          </ul>
        </div>
      )}

      {item.faults.length > 0 && (
        <div class={`draft__note ${errors.length > 0 ? 'draft__note--bad' : ''}`}>
          <p class="det__label">
            {errors.length > 0 ? 'Cannot be saved until this is fixed' : 'Worth knowing'}
          </p>
          <CheckList checks={item.faults} />
        </div>
      )}

      <div class="rowbtns">
        <button class="btn btn--small" onClick={() => setOpen(!open)}>
          {open ? 'Hide the question' : 'Show the whole question'}
        </button>
        {!saved && (
          <>
            <button class="btn btn--small" onClick={onEdit}>
              {errors.length > 0 ? 'Fix it in the editor' : 'Open in the editor'}
            </button>
            <button class="btn btn--small" onClick={onDiscard}>
              Discard
            </button>
          </>
        )}
      </div>

      {open && (
        <div class="qrow__detail">
          <QuestionDetail question={q} showStem={false} />
          <p class="det__label" style={{ marginTop: '0.6rem' }}>
            Will be saved into <span class="mono">{bankPath}</span>
          </p>
        </div>
      )}
    </li>
  )
}
