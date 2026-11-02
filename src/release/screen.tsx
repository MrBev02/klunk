/**
 * The Release to students tab (#150, #219): one exam at a time, imported or
 * built here, checked question by question, written into the student folder
 * for Mimir.
 *
 * Releasing is in Klunk rather than in Mimir because it is the step that
 * protects the questions, and Mimir cannot: it is a static page reading a
 * folder, and anything in a folder a student can open, the student can read.
 */

import { useEffect, useMemo, useState } from 'preact/hooks'
import type { Editing } from '../questions/editor'
import { QuestionDetail } from '../questions/question'
import {
  openFolder,
  pickStudentFolder,
  studentFolderFor,
  writeRelease,
  type ContentIndex,
  type RememberedFolder,
} from '../folder/storage'
import { formatDate } from '../papers/cover'
import { Field } from '../shared/fields'
import { QUESTION_TYPE_LABELS, questionLabel, type Question } from '../shared/types'
import {
  builtPapers,
  embargo,
  importedExams,
  planRelease,
  printedFor,
  releaseHash,
  releaseState,
  sectionsLookLikeBands,
  studentCopy,
  lastSubject,
  yearFromName,
  type AsPrinted,
  type Exam,
  type ReleaseState,
} from './release'

/** Remembered per browser: Klunk has no accounts, so the name is only a record. */
const APPROVER_KEY = 'klunk.approvedBy'

const YEARS = [7, 8, 9, 10, 11, 12]

export function ReleaseScreen({
  index,
  folder,
  today,
  onEdit,
  onReleased,
}: {
  index: ContentIndex
  folder: FileSystemDirectoryHandle
  today: string
  onEdit: (editing: Editing) => void
  onReleased: (message: string) => void
}) {
  const papers = useMemo(() => builtPapers(index), [index])
  const imported = useMemo(() => importedExams(index), [index])
  const exams: Exam[] = useMemo(() => [...papers, ...imported], [papers, imported])
  const [key, setKey] = useState('')
  const exam = exams.find((e) => e.key === key) ?? exams[0]

  const [student, setStudent] = useState<RememberedFolder | null>(null)
  const [refused, setRefused] = useState('')
  useEffect(() => {
    void studentFolderFor(folder).then(setStudent)
  }, [folder])

  const choose = async () => {
    setRefused('')
    const got = await pickStudentFolder(folder)
    if (typeof got === 'string') setRefused(got)
    else if (got) setStudent({ handle: got, permission: 'granted' })
  }
  const allow = async () => {
    if (!student) return
    if (await openFolder(student.handle)) setStudent({ ...student, permission: 'granted' })
  }

  return (
    <div class="factory">
      <section class="panel">
        <p class="panel__title">
          <span class="step">1</span> Choose the student folder
        </p>
        <p class="hint">
          Choose the folder shared with students to view only. Klunk writes released questions there
          and nowhere else.
        </p>
        {student ? (
          <p>
            <span class="mono">{student.handle.name}</span>{' '}
            {student.permission !== 'granted' && (
              <button class="btn btn--small" onClick={() => void allow()}>
                Allow access to {student.handle.name}
              </button>
            )}{' '}
            <button class="btn btn--small" onClick={() => void choose()}>
              Choose a different folder
            </button>
          </p>
        ) : (
          <div class="rowbtns">
            <button class="btn" onClick={() => void choose()}>
              Choose the student folder
            </button>
          </div>
        )}
        {refused && (
          <div class="panel panel--alert" style={{ marginTop: '0.8rem' }}>
            <p>{refused}</p>
          </div>
        )}
      </section>

      {exam ? (
        <ExamRelease
          key={exam.key}
          exam={exam}
          exams={exams}
          onExam={setKey}
          index={index}
          folder={folder}
          student={student?.permission === 'granted' ? student.handle : null}
          today={today}
          onEdit={onEdit}
          onReleased={onReleased}
        />
      ) : (
        <section class="panel">
          <p class="panel__title">
            <span class="step">2</span> Choose the exam
          </p>
          <p class="hint">
            Build a paper on Papers, or read an exam in on From a past paper. Its questions are
            offered here once saved.
          </p>
        </section>
      )}
    </div>
  )
}

/**
 * One exam's release. Keyed on the exam, so switching exams starts its form
 * again from what the ledger recorded rather than carrying the last one's
 * date across.
 */
function ExamRelease({
  exam,
  exams,
  onExam,
  index,
  folder,
  student,
  today,
  onEdit,
  onReleased,
}: {
  exam: Exam
  exams: Exam[]
  onExam: (key: string) => void
  index: ContentIndex
  folder: FileSystemDirectoryHandle
  student: FileSystemDirectoryHandle | null
  today: string
  onEdit: (editing: Editing) => void
  onReleased: (message: string) => void
}) {
  const recorded = index.ledger.exams.find((e) => e.key === exam.key)
  const built = exam.kind === 'paper' ? exam : undefined
  // The same paper read twice, into two banks, is a mistake #74 records and
  // cannot prevent. Both copies are offered, so the teacher has to see it. A
  // built paper drawing on several banks is ordinary.
  const banks = built ? [] : [...new Set(exam.questions.map((r) => r.file))]
  const name = exam.kind === 'paper' ? exam.paper.title : exam.paper
  const [title, setTitle] = useState(recorded?.title ?? name)
  const [subject, setSubject] = useState(
    recorded?.subject ?? lastSubject(index.ledger) ?? built?.paper.school?.course ?? '',
  )
  const [year, setYear] = useState(
    recorded?.yearLevel ?? yearFromName(built?.paper.school?.yearGroup ?? '') ?? yearFromName(name),
  )
  const [dateSat, setDateSat] = useState(recorded?.dateSat ?? built?.date ?? '')
  const [asBands, setAsBands] = useState(
    recorded?.sectionsAreBands ?? (built ? sectionsLookLikeBands(built) : false),
  )
  const [approver, setApprover] = useState(() => localStorage.getItem(APPROVER_KEY) ?? '')
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState('')

  const printed = (id: string) => printedFor(exam, id, asBands)
  const held = useMemo(
    () => embargo(exam, dateSat || undefined, index, today),
    [exam, dateSat, index, today],
  )
  const states = useMemo(
    () =>
      new Map(
        exam.questions.map((r) => [
          r.question.id,
          releaseState(
            index.ledger,
            exam.key,
            r.question,
            printedFor(exam, r.question.id, asBands),
          ),
        ]),
      ),
    [exam, index.ledger, asBands],
  )

  // Ticked where already released, edited since or not, so a re-release keeps
  // what students have; a question edited since is flagged on its card.
  const [ticked, setTicked] = useState(
    () =>
      new Set(
        exam.questions.filter((r) => states.get(r.question.id) !== 'new').map((r) => r.question.id),
      ),
  )
  const releasable = exam.questions.filter(
    (r) => ticked.has(r.question.id) && !held.questions.has(r.question.id),
  )

  const missing = [
    !student && 'the student folder',
    !title.trim() && 'a title',
    !subject.trim() && 'the subject',
    year === undefined && 'the year',
    !approver.trim() && 'your name',
  ].filter((m): m is string => Boolean(m))
  const blocked = held.exam ?? (missing.length > 0 ? `Enter ${listOf(missing)} first.` : '')

  const release = async () => {
    if (!student || year === undefined || held.exam) return
    setBusy(true)
    setFailed('')
    try {
      const plan = planRelease(
        exam,
        releasable,
        {
          title: title.trim(),
          subject: subject.trim(),
          yearLevel: year,
          releasedOn: today,
          sectionsAreBands: asBands,
        },
        dateSat,
        index,
      )
      localStorage.setItem(APPROVER_KEY, approver.trim())
      await writeRelease(folder, student, {
        ...plan,
        questions: releasable.map((r) => ({
          id: r.question.id,
          exam: exam.key,
          approvedBy: approver.trim(),
          approvedOn: today,
          hash: releaseHash(r.question, printed(r.question.id)),
        })),
      })
      onReleased(
        `Released ${releasable.length} question${releasable.length === 1 ? '' : 's'} to ${student.name}/${plan.path}.`,
      )
    } catch (err) {
      setFailed((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const toggle = (id: string) =>
    setTicked((was) => {
      const next = new Set(was)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  return (
    <>
      <section class="panel">
        <p class="panel__title">
          <span class="step">2</span> Choose the exam
        </p>
        <div class="fieldrow">
          <Field label="Exam" for="rl-exam">
            <select
              id="rl-exam"
              class="input"
              value={exam.key}
              onChange={(e) => onExam((e.target as HTMLSelectElement).value)}
            >
              {(
                [
                  ['Papers built in Klunk', 'paper'],
                  ['Exams read from past papers', 'imported'],
                ] as const
              ).map(([heading, kind]) => {
                const these = exams.filter((e) => e.kind === kind)
                return these.length === 0 ? null : (
                  <optgroup key={kind} label={heading}>
                    {these.map((e) => (
                      <option key={e.key} value={e.key}>
                        {examName(e)} ({e.questions.length} question
                        {e.questions.length === 1 ? '' : 's'})
                      </option>
                    ))}
                  </optgroup>
                )
              })}
            </select>
          </Field>
          <Field
            label="Date sat"
            for="rl-date"
            hint={
              built?.date
                ? `The day the last class sat it, catch-ups included. The paper is dated ${formatDate(built.date)}.`
                : 'The day the last class sat it, catch-ups included'
            }
          >
            <input
              id="rl-date"
              class="input"
              type="date"
              value={dateSat}
              onInput={(e) => setDateSat((e.target as HTMLInputElement).value)}
            />
          </Field>
        </div>
        <div class="fieldrow">
          <Field label="Title" for="rl-title" hint="What students call it">
            <input
              id="rl-title"
              class="input"
              value={title}
              onInput={(e) => setTitle((e.target as HTMLInputElement).value)}
            />
          </Field>
          <Field label="Subject" for="rl-subject">
            <input
              id="rl-subject"
              class="input"
              value={subject}
              placeholder="Mathematics"
              onInput={(e) => setSubject((e.target as HTMLInputElement).value)}
            />
          </Field>
          <Field label="Year" for="rl-year">
            <select
              id="rl-year"
              class="input"
              value={year === undefined ? '' : String(year)}
              onChange={(e) => {
                const v = (e.target as HTMLSelectElement).value
                setYear(v ? Number(v) : undefined)
              }}
            >
              <option value="">Choose…</option>
              {YEARS.map((y) => (
                <option key={y} value={String(y)}>
                  Year {y}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Your name" for="rl-name" hint="Recorded against each question you release">
            <input
              id="rl-name"
              class="input"
              value={approver}
              onInput={(e) => setApprover((e.target as HTMLInputElement).value)}
            />
          </Field>
        </div>
        {built && built.sections.length > 0 && (
          <p>
            <label for="rl-bands">
              <input
                id="rl-bands"
                type="checkbox"
                checked={asBands}
                onChange={() => setAsBands(!asBands)}
              />{' '}
              Each section is a band students choose between ({listOf(built.sections)})
            </label>
            <span class="hint" style={{ display: 'block' }}>
              Leave this off for a paper every student sits whole. Mimir shows a student only the
              band they choose.
            </span>
          </p>
        )}
        {built && built.missing > 0 && (
          <p class="hint">
            {built.missing} question
            {built.missing === 1 ? ' on this paper is' : 's on this paper are'} in no bank in your
            folder, so cannot be released.
          </p>
        )}
        {banks.length > 1 && (
          <p class="hint">
            This exam was read into {banks.length} banks: {listOf(banks)}. Tick one copy of each
            question.
          </p>
        )}
        {recorded?.releasedOn && (
          <p class="hint">
            Last released on {formatDate(recorded.releasedOn)}
            {recorded.file ? `, to ${recorded.file}` : ''}.
          </p>
        )}
        {held.exam && (
          <div class="panel panel--alert" style={{ marginTop: '0.8rem' }}>
            <p>{held.exam}</p>
          </div>
        )}
      </section>

      <section class="panel">
        <p class="panel__title">
          <span class="step">3</span> Check each question
        </p>
        <p class="hint">
          Tick each question to release. Students see it as shown here, sample answer included.
        </p>
        <ol class="drafts">
          {exam.questions.map((ref, at) => (
            <ReleaseCard
              key={ref.question.id}
              at={at}
              printed={printed(ref.question.id)}
              question={ref.question}
              bankFile={ref.file}
              images={index.images}
              state={states.get(ref.question.id) ?? 'new'}
              hold={held.questions.get(ref.question.id)}
              ticked={ticked.has(ref.question.id)}
              onToggle={() => toggle(ref.question.id)}
              onEdit={() => onEdit({ question: ref.question, file: ref.file })}
            />
          ))}
        </ol>

        <div class="rowbtns">
          <button
            class="btn btn--primary"
            disabled={busy || Boolean(blocked) || releasable.length === 0}
            onClick={() => void release()}
          >
            {busy
              ? 'Releasing…'
              : `Release ${releasable.length} question${releasable.length === 1 ? '' : 's'} to students`}
          </button>
        </div>
        {blocked && <p class="hint">{blocked}</p>}
        {index.ledgerUnreadable && (
          <div class="panel panel--alert" style={{ marginTop: '0.8rem' }}>
            <p>
              release/ledger.json in your folder cannot be read, so nothing can be released. Open it
              and fix it, or move it aside to start a new record.
            </p>
          </div>
        )}
        {failed && (
          <div class="panel panel--alert" style={{ marginTop: '0.8rem' }}>
            <p>{failed}</p>
          </div>
        )}
      </section>
    </>
  )
}

const STATE_LABELS: Record<ReleaseState, string> = {
  new: 'Not released',
  released: 'Released',
  changed: 'Changed since release',
}

function ReleaseCard({
  at,
  printed,
  question,
  bankFile,
  images,
  state,
  hold,
  ticked,
  onToggle,
  onEdit,
}: {
  at: number
  printed: AsPrinted | undefined
  question: Question
  bankFile: string
  images: Map<string, string>
  state: ReleaseState
  hold: string | undefined
  ticked: boolean
  onToggle: () => void
  onEdit: () => void
}) {
  const id = `rl-q-${at}`
  const tone = hold
    ? 'owed'
    : state === 'changed'
      ? 'bad'
      : state === 'released'
        ? 'saved'
        : 'ready'
  // Shown in the order the release writes it, which is the order Mimir shows it
  // in: as the paper printed it, for a paper built here. Left to shuffle, the
  // preview lettered every choice differently from what a student marking their
  // own paper sees.
  const copy = useMemo((): Question => {
    const student = studentCopy(question, undefined, printed) as Question
    return student.config ? { ...student, config: { ...student.config, shuffle: false } } : student
  }, [question, printed])
  const { source } = question

  return (
    <li class={`draft draft--${tone}`}>
      <div class="draft__head">
        <span class="draft__n">{printed?.number ?? at + 1}</span>
        <span class="draft__stem">{questionLabel(question)}</span>
        <span class="draft__state">{hold ? 'Held back' : STATE_LABELS[state]}</span>
      </div>
      <p class="det__label">
        <span class="mono">{question.id}</span> · {QUESTION_TYPE_LABELS[question.questionType]} ·{' '}
        {copy.marks} mark{copy.marks === 1 ? '' : 's'}
        {printed?.band && ` · ${printed.band}`}
        {source?.questionNumber &&
          ` · ${source.section ? `${source.section} ` : ''}Q${source.questionNumber}`}
      </p>

      {hold && (
        <div class="draft__note draft__note--bad">
          <p>{hold}</p>
        </div>
      )}
      {!hold && state === 'changed' && (
        <div class="draft__note">
          <p>Edited since it was released. Check it, then release again to update students.</p>
        </div>
      )}

      <QuestionDetail question={copy} bankFile={bankFile} images={images} />

      <div class="rowbtns">
        <label for={id}>
          <input
            id={id}
            type="checkbox"
            checked={ticked && !hold}
            disabled={Boolean(hold)}
            onChange={onToggle}
          />{' '}
          Release this question
        </label>
        <button class="btn btn--small" onClick={onEdit}>
          Edit
        </button>
      </div>
    </li>
  )
}

function examName(exam: Exam): string {
  if (exam.kind === 'imported') return `${exam.paper}, ${exam.year}`
  return `${exam.paper.title}, ${exam.date ? formatDate(exam.date) : 'no date'}`
}

function listOf(items: string[]): string {
  if (items.length <= 1) return items.join('')
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`
}
