/**
 * The prompt factory: everything either side of the AI, and none of the AI.
 *
 * Klunk holds no API key and makes no request. It writes the prompt, the
 * teacher takes it to whatever their school licenses, and it reads back what
 * that returned. Both halves are on this one screen because the teacher leaves
 * the app between them and comes back; hiding the second step behind a "next"
 * button would be friction for nothing.
 *
 * The screen is deliberately unhurried about the second half. Anything the
 * model got wrong is shown against the question it belongs to, and a question
 * with an error cannot be saved from here at all: it goes to the question
 * editor to be fixed, which is what the editor was built for.
 */

import type { ComponentChildren } from 'preact'
import { useEffect, useMemo, useState } from 'preact/hooks'
import type { Editing } from './editor'
import {
  bankPathFault,
  CheckList,
  Field,
  normaliseBankPath,
  NumField,
  TopicChipLabel,
  TopicOptions,
} from './fields'
import { ingestQuestions, AI_TAG, type Draft, type Ingest, type IngestContext } from './ingest'
import { buildPrompt, outcomesFor } from './prompt'
import { QuestionDetail } from './question'
import { hasMarkup } from './richtext'
import { ProfileInstaller } from './setup'
import {
  allQuestions,
  inSyllabus,
  questionIds,
  saveQuestion,
  type ContentIndex,
} from './storage'
import {
  QUESTION_TYPES,
  QUESTION_TYPE_LABELS,
  type Profile,
  type Question,
  type QuestionType,
  type Syllabus,
  type SyllabusCourse,
} from './types'
import { cleanQuestion } from './validate'

/** How many questions one prompt asks for, before quality starts to slide. */
const MAX_COUNT = 10

export interface CourseChoice {
  key: string
  syllabus: Syllabus
  course: SyllabusCourse
  label: string
}

export function Factory({
  index,
  folder,
  onEdit,
  onSaved,
}: {
  index: ContentIndex
  folder: FileSystemDirectoryHandle
  /** Hand a draft to the question editor, which is where errors get fixed. */
  onEdit: (editing: Editing) => void
  /** Something was written to the folder, so it needs rescanning. */
  onSaved: () => void
}) {
  const courses = useMemo(() => courseChoices(index), [index])

  const [courseKey, setCourseKey] = useState(() => courses[0]?.key ?? '')
  const chosen = courses.find((c) => c.key === courseKey) ?? courses[0]

  const [topicIds, setTopicIds] = useState<string[]>([])
  const [pointIds, setPointIds] = useState<string[]>([])
  const [questionType, setQuestionType] = useState<QuestionType>('short_answer')
  const [marks, setMarks] = useState(4)
  const [count, setCount] = useState(3)
  const [extra, setExtra] = useState('')
  const [includeExisting, setIncludeExisting] = useState(false)

  const [bank, setBank] = useState<string | null>(() => index.banks[0]?.path ?? null)
  const [newBankPath, setNewBankPath] = useState('bank/questions.json')
  const [pasted, setPasted] = useState('')
  const [read, setRead] = useState<Ingest | null>(null)
  /** Drafts thrown away by hand, by the id Klunk gave them. */
  const [discarded, setDiscarded] = useState<string[]>([])
  /** Drafts that went in under a different id, because somebody took theirs. */
  const [renamed, setRenamed] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)
  const [failed, setFailed] = useState('')

  const bankPath = bank === null ? normaliseBankPath(newBankPath) : bank
  const pathFault = bank === null ? bankPathFault(newBankPath) : null

  const profile = useMemo(() => profileFor(index, chosen?.syllabus), [index, chosen])
  const topics = (chosen?.course.topics ?? []).filter((t) => topicIds.includes(t.id))
  const points = topics.flatMap((t) => (t.points ?? []).map((p) => ({ ...p, topicId: t.id })))

  // A point belongs to a topic, so dropping the topic has to drop its points.
  const chosenPoints = points.filter((p) => pointIds.includes(p.id))

  const existing = useMemo(
    () =>
      includeExisting && chosen
        ? questionsOn(index, chosen.syllabus.id, topicIds, pointIds)
        : [],
    [index, chosen, topicIds, pointIds, includeExisting],
  )

  const prompt = useMemo(() => {
    if (!chosen || chosenPoints.length === 0) return ''
    return buildPrompt({
      syllabus: chosen.syllabus,
      course: chosen.course,
      topics,
      pointIds: chosenPoints.map((p) => p.id),
      questionType,
      marks,
      count,
      profile,
      extra,
      avoid: existing,
    })
    // `topics` and `chosenPoints` are derived from these on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chosen, topicIds, pointIds, questionType, marks, count, profile, extra, existing])

  const clearPaste = () => {
    setRead(null)
    setPasted('')
    setDiscarded([])
    setRenamed({})
  }

  const ingest = () => {
    if (!chosen) return
    const context: IngestContext = {
      bankPath,
      inFolder: questionIds(index),
      inBank: new Set(
        (index.banks.find((b) => b.path === bankPath)?.data.questions ?? []).map((q) => q.id),
      ),
      syllabusId: chosen.syllabus.id,
      courseId: chosen.course.id,
      topicIds,
      points: chosenPoints.map((p) => ({ id: p.id, topicId: p.topicId })),
      outcomes: outcomesFor({ course: chosen.course, topics }).map((o) => o.code),
      expected: { questionType, marks },
    }
    setDiscarded([])
    setRenamed({})
    setFailed('')
    setRead(ingestQuestions(pasted, context))
  }

  // What has been written is worked out from the folder rather than remembered,
  // so a draft sent to the editor and saved there comes back marked saved too.
  const alreadySaved = useMemo(() => questionIds(index), [index])
  // A draft whose id was taken by another teacher went in under a different one,
  // so it has to be looked for under that or it never shows as saved.
  const savedAs = (d: Draft) => renamed[d.question.id] ?? d.question.id
  const live = (read?.drafts ?? []).filter((d) => !discarded.includes(d.question.id))
  const unsaved = live.filter((d) => !alreadySaved.has(savedAs(d)))
  const ready = unsaved.filter((d) => !d.faults.some((f) => f.severity === 'error'))
  const stuck = unsaved.length - ready.length

  const saveReady = async () => {
    setSaving(true)
    setFailed('')
    try {
      // No `replacing`: every draft here is new, so an id that turns out to be
      // taken belongs to somebody else and the draft gets a free one instead.
      const moved: Record<string, string> = {}
      for (const draft of ready) {
        const written = await saveQuestion(folder, bankPath, cleanQuestion(draft.question), {
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

  if (courses.length === 0) {
    return (
      <section class="panel">
        <p class="panel__title">No syllabus model in this folder</p>
        <p>
          This tab writes a prompt with your syllabus already in it, so it needs a syllabus
             model first. Build one from your own copy of the syllabus{' '}
          <span class="mono">.docx</span> on the
          <strong> Syllabus</strong> tab.
        </p>
      </section>
    )
  }

  return (
    <div class="factory">
      <section class="panel">
        <p class="panel__title">
          <span class="step">1</span> Choose what to ask for
        </p>
        <p class="hint">
          Klunk has no AI in it. It writes the prompt, you take it to whatever your school
             pays for, and you bring the answer back.
        </p>

        <div class="fieldrow">
          <Field label="Course" for="pf-course">
            <select
              id="pf-course"
              class="input"
              value={chosen?.key ?? ''}
              onChange={(e) => {
                setCourseKey((e.target as HTMLSelectElement).value)
                // Topic and point ids belong to the course they came from.
                setTopicIds([])
                setPointIds([])
              }}
            >
              {courses.map((c) => (
                <option key={c.key} value={c.key}>
                  {c.label}
                </option>
              ))}
            </select>
          </Field>

          <Field label="Type" for="pf-type">
            <select
              id="pf-type"
              class="input"
              value={questionType}
              onChange={(e) => {
                const next = (e.target as HTMLSelectElement).value as QuestionType
                setQuestionType(next)
                setMarks(defaultMarks(next, profile))
              }}
            >
              {QUESTION_TYPES.map((t) => (
                <option key={t} value={t}>
                  {QUESTION_TYPE_LABELS[t]}
                </option>
              ))}
            </select>
          </Field>

          <Field label="Marks each" for="pf-marks">
            <NumField
              id="pf-marks"
              value={marks}
              min={1}
              onChange={(n) => setMarks(n ?? 1)}
            />
          </Field>

          <Field label="How many" for="pf-count" hint={`Up to ${MAX_COUNT}`}>
            <NumField
              id="pf-count"
              value={count}
              min={1}
              max={MAX_COUNT}
              onChange={(n) => setCount(Math.min(Math.max(n ?? 1, 1), MAX_COUNT))}
            />
          </Field>
        </div>

        <Field label="Topics" for="pf-topic">
          <select
            id="pf-topic"
            class="input"
            value=""
            onChange={(e) => {
              const id = (e.target as HTMLSelectElement).value
              if (!id || topicIds.includes(id)) return
              setTopicIds([...topicIds, id])
              // A topic with none of its points ticked builds no prompt at all,
              // and a teacher who adds a topic means the topic. Narrowing it is
              // then unticking, which is a visible act, rather than a gate that
              // leaves the screen looking like it does nothing.
              const theirs = (chosen?.course.topics ?? []).find((t) => t.id === id)
              setPointIds([...pointIds, ...(theirs?.points ?? []).map((p) => p.id)])
            }}
          >
            <option value="">Add a topic…</option>
            <TopicOptions topics={chosen?.course.topics ?? []} omit={topicIds} />
          </select>
        </Field>

        {topics.length > 0 && (
          <div class="tagrow">
            {topics.map((t) => (
              <button
                key={t.id}
                class="chip chip--drop chip--topic"
                title="Remove this topic"
                onClick={() => {
                  setTopicIds(topicIds.filter((x) => x !== t.id))
                  const theirs = new Set((t.points ?? []).map((p) => p.id))
                  setPointIds(pointIds.filter((p) => !theirs.has(p)))
                }}
              >
                <TopicChipLabel topic={t} /> ✕
              </button>
            ))}
          </div>
        )}

        {points.length > 0 && (
          <>
            <div class="editor__sub rowbtns">
              <span class="rail__label">Content points to draw on</span>
              <button
                class="btn btn--small"
                onClick={() =>
                  setPointIds(
                    chosenPoints.length === points.length ? [] : points.map((p) => p.id),
                  )
                }
              >
                {chosenPoints.length === points.length ? 'None' : 'All'}
              </button>
            </div>
            <ul class="plain checklist">
              {points.map((p) => (
                <li key={p.id} class={p.parent ? 'checklist__sub' : ''}>
                  <label class="checkline">
                    <input
                      type="checkbox"
                      checked={pointIds.includes(p.id)}
                      onChange={(e) =>
                        setPointIds(
                          (e.target as HTMLInputElement).checked
                            ? [...pointIds, p.id]
                            : pointIds.filter((x) => x !== p.id),
                        )
                      }
                    />
                    <span>
                      <span class="mono muted">{p.id}</span> {p.text}
                    </span>
                  </label>
                </li>
              ))}
            </ul>
          </>
        )}

        <Field
          label="Anything else you want asked for"
          for="pf-extra"
          hint="Goes into the prompt word for word"
        >
          <textarea
            id="pf-extra"
            class="input"
            rows={2}
            value={extra}
            placeholder="Set every question in a school workshop rather than industry."
            onInput={(e) => setExtra((e.target as HTMLTextAreaElement).value)}
          />
        </Field>

        <label class="checkline">
          <input
            type="checkbox"
            checked={includeExisting}
            onChange={(e) => setIncludeExisting((e.target as HTMLInputElement).checked)}
          />
          <span>
            Send the questions I already have on these topics, so it does not write them
            again{existing.length > 0 ? ` (${existing.length})` : ''}
          </span>
        </label>

      </section>

      <PromptStep
        prompt={prompt}
        points={chosenPoints.length}
        stems={existing.length}
        topics={topics.length}
        noProfile={
          chosen && !profile ? (
            <section class="panel panel--note">
              <p class="panel__title">
                No paper profile for {chosen.syllabus.name} in this folder
              </p>
              <p>
                The prompt cannot say where this kind of question sits on the real paper,
                   and it asks for a general two ruled lines a mark instead of this exam's own
                   spacing. The course, the topics and the content points all still go in.
                   Klunk leaves the rest out rather than describing another subject's exam as
                   though it were this one.
              </p>
              <ProfileInstaller
                index={index}
                folder={folder}
                syllabusId={chosen.syllabus.id}
                onInstalled={onSaved}
              />
            </section>
          ) : null
        }
      />

      <section class="panel">
        <p class="panel__title">
          <span class="step">3</span> Paste the answer back
        </p>
        <p class="hint">
          Paste the whole reply, including any chatter around it. Klunk finds the questions
             in it, checks them against the same rules the editor uses, and shows you
             everything it had to change before it writes anything.
        </p>

        <textarea
          class="input mono pastebox"
          rows={6}
          value={pasted}
          placeholder='[ { "questionType": "short_answer", … } ]'
          onInput={(e) => setPasted((e.target as HTMLTextAreaElement).value)}
        />

        <div class="rowbtns">
          <button class="btn btn--primary" disabled={!pasted.trim()} onClick={ingest}>
            Read it
          </button>
          {read && (
            <button class="btn" onClick={clearPaste}>
              Clear
            </button>
          )}
        </div>

        {read?.failure && (
          <section class="panel panel--alert">
            <p class="panel__title">Klunk could not read that</p>
            <p>{read.failure}</p>
          </section>
        )}

        {read && read.notes.length > 0 && (
          <p class="hint">{read.notes.join(' ')}</p>
        )}

        {read && read.rejected.length > 0 && (
          <section class="panel panel--alert">
            <p class="panel__title">
              {read.rejected.length} entr{read.rejected.length === 1 ? 'y was' : 'ies were'}{' '}
              not a question
            </p>
            <ul class="plain">
              {read.rejected.map((r) => (
                <li key={r.at}>
                  Number {r.at + 1}: {r.why}.
                </li>
              ))}
            </ul>
          </section>
        )}

        {live.length > 0 && (
          <>
            <div class="fieldrow">
              <Field label="Bank to save into" for="pf-bank">
                <select
                  id="pf-bank"
                  class="input"
                  value={bank ?? ''}
                  onChange={(e) => setBank((e.target as HTMLSelectElement).value || null)}
                >
                  {index.banks.map((b) => (
                    <option key={b.path} value={b.path}>
                      {b.data.name ? `${b.data.name} (${b.path})` : b.path}
                    </option>
                  ))}
                  <option value="">A new bank…</option>
                </select>
              </Field>
              {bank === null && (
                <Field label="File" for="pf-bankpath">
                  <input
                    id="pf-bankpath"
                    class="input mono"
                    value={newBankPath}
                    onInput={(e) => setNewBankPath((e.target as HTMLInputElement).value)}
                  />
                </Field>
              )}
            </div>
            {pathFault && <p class="missing">{pathFault}</p>}
            <p class="hint">
              The ids below were worked out against that bank. Every question here is tagged{' '}
                 <span class="mono">{AI_TAG}</span>.
            </p>

            <ul class="plain drafts">
              {live.map((draft, i) => (
                <DraftCard
                  key={draft.question.id}
                  draft={draft}
                  at={i}
                  saved={alreadySaved.has(savedAs(draft))}
                  savedAs={renamed[draft.question.id]}
                  bankPath={bankPath}
                  onEdit={() =>
                    onEdit({ question: draft.question, file: bankPath, fresh: true })
                  }
                  onDiscard={() => setDiscarded([...discarded, draft.question.id])}
                />
              ))}
            </ul>

            {failed && (
              <section class="panel panel--alert">
                <p class="panel__title">Nothing was saved</p>
                <p>{failed}</p>
              </section>
            )}

            {unsaved.length === 0 ? (
              // The button goes with the sentence. Naming the one at the top of
              // the panel meant hunting back past every draft card to find it.
              <div class="panel__act">
                <p class="hint">
                  All {live.length} written into <span class="mono">{bankPath}</span>.
                  They are in the Questions tab now.
                </p>
                <button class="btn" onClick={clearPaste}>
                  Clear this panel
                </button>
              </div>
            ) : (
              <>
                <div class="rowbtns">
                  <button
                    class="btn btn--primary"
                    disabled={ready.length === 0 || saving || pathFault !== null}
                    onClick={() => void saveReady()}
                  >
                    {saving
                      ? 'Saving…'
                      : `Save the ${ready.length} that ${ready.length === 1 ? 'is' : 'are'} ready`}
                  </button>
                </div>
                {stuck > 0 && (
                  <p class="hint">
                    {stuck} of these cannot be saved from here. Open one in the editor to
                    fix it, or discard it.
                  </p>
                )}
              </>
            )}
          </>
        )}
      </section>
    </div>
  )
}

/* ------------------------------------------------------------------ the prompt */

/**
 * The prompt, as a step of its own.
 *
 * It was the tail of the form above, under the free text box and the checkbox,
 * and appeared only once a content point was ticked. Both halves of that were
 * wrong: on a laptop the copy button sat below the fold, and before it appeared
 * the only sign of it was a grey line that read as the caption of the checkbox
 * above it. A teacher reported the app had no way to see the prompt at all.
 *
 * So the box is always here, saying what it is waiting for when it is waiting,
 * and the copy button is in the heading where it can be seen without reading
 * the prompt first.
 */
function PromptStep({
  prompt,
  points,
  stems,
  topics,
  noProfile,
}: {
  prompt: string
  points: number
  stems: number
  topics: number
  /** Said above the prompt, because it is about what the prompt does not contain. */
  noProfile: ComponentChildren
}) {
  const [said, setSaid] = useState('')

  // What was copied is no longer what is on screen the moment anything changes.
  useEffect(() => setSaid(''), [prompt])

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(prompt)
      setSaid('Copied. Paste it into your school’s AI.')
    } catch {
      // The recovery is the teacher's hands: the text is right there, selectable.
      setSaid('Your browser would not let Klunk copy this. Select the prompt and press Ctrl+C.')
    }
  }

  return (
    <section class="panel">
      <div class="panel__head">
        <p class="panel__title">
          <span class="step">2</span> Copy the prompt
        </p>
        {/* The confirmation belongs beside the button. Below the prompt it is
            26rem away from the thing that was just pressed, which is nowhere. */}
        <div class="panel__act">
          {said && <span class="hint">{said}</span>}
          <button
            class="btn btn--primary"
            disabled={!prompt}
            onClick={() => void copy()}
          >
            Copy to clipboard
          </button>
        </div>
      </div>

      <p class="hint">
        Read this, copy it, and paste it into whatever your school pays for. It is the whole
           of what leaves your computer.
      </p>

      {noProfile}

      {prompt ? (
        <>
          <pre class="promptbox">{prompt}</pre>
          <p class="hint">
            Includes {points} content point{points === 1 ? '' : 's'} from your syllabus
            {stems > 0
              ? ` and ${stems} of your own question stem${stems === 1 ? '' : 's'}`
              : ''}
            .
          </p>
        </>
      ) : (
        <div class="promptbox promptbox--empty">
          {topics === 0
            ? 'Add a topic above and the prompt appears here, with your syllabus in it.'
               : 'Every content point is unticked, so there is nothing to ask about. Tick at least one.'}
        </div>
      )}
    </section>
  )
}

/* ------------------------------------------------------------------- one draft */

function DraftCard({
  draft,
  at,
  saved,
  savedAs,
  bankPath,
  onEdit,
  onDiscard,
}: {
  draft: Draft
  at: number
  saved: boolean
  /** The id it actually went in under, when somebody else had taken this one. */
  savedAs?: string | undefined
  bankPath: string
  onEdit: () => void
  onDiscard: () => void
}) {
  const [open, setOpen] = useState(true)
  const q = draft.question
  const errors = draft.faults.filter((f) => f.severity === 'error')
  const state = saved ? 'saved' : errors.length > 0 ? 'bad' : 'ready'

  return (
    <li class={`draft draft--${state}`}>
      <div class="draft__head">
        <span class="draft__n">{at + 1}</span>
        <span class="draft__stem">{q.questionText}</span>
        <span class="draft__state">
          {saved ? 'Saved' : errors.length > 0 ? `${errors.length} to fix` : 'Ready'}
        </span>
      </div>

      <p class="det__label">
        <span class="mono">{bankPath}</span> ·{' '}
        <span class="mono">{savedAs ?? q.id}</span> ·{' '}
        {QUESTION_TYPE_LABELS[q.questionType]} · {q.marks} mark{q.marks === 1 ? '' : 's'}
      </p>

      {savedAs && (
        <div class="draft__note">
          <p>
            <span class="mono">{q.id}</span> had been taken by somebody else since you
            opened this folder, so this went in as{' '}
            <span class="mono">{savedAs}</span> rather than replacing theirs.
          </p>
        </div>
      )}

      {draft.repairs.length > 0 && (
        <div class="draft__note">
          <p class="det__label">What Klunk changed reading this in</p>
          <ul class="plain">
            {draft.repairs.map((r, i) => (
              <li key={i}>{r}</li>
            ))}
          </ul>
        </div>
      )}

      {draft.faults.length > 0 && (
        <div class={`draft__note ${errors.length > 0 ? 'draft__note--bad' : ''}`}>
          <p class="det__label">
            {errors.length > 0 ? 'Cannot be saved until this is fixed' : 'Worth knowing'}
          </p>
          <CheckList checks={draft.faults} />
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
          {/* As in the extractor: the heading has said the stem already, unless
              the stem holds a table it cannot show (#88). */}
          <QuestionDetail question={q} showStem={hasMarkup(q.questionText)} />
        </div>
      )}
    </li>
  )
}

/* --------------------------------------------------------------------- lookups */

export function courseChoices(index: ContentIndex): CourseChoice[] {
  const out: CourseChoice[] = []
  for (const { data } of index.syllabuses) {
    for (const course of data.courses) {
      out.push({
        key: `${data.id}::${course.id}`,
        syllabus: data,
        course,
        label: `${data.name} · ${course.name}`,
      })
    }
  }
  return out
}

/**
 * The profile for this syllabus, and no other.
 *
 * It used to fall back to `index.profiles[0]` — any profile at all rather than
 * none — which is harmless in a folder holding one subject and indefensible in
 * one holding two. The profile supplies ruled lines per mark and where this type
 * of question sits on the real paper, so borrowing Design and Technology's for a
 * Textiles draft composes a prompt that states the wrong examination as fact,
 * with nothing on screen saying it substituted. A profile is the shape of a
 * *particular* public examination; there is no reading under which another
 * subject's describes this one. The prompt now simply says less.
 */
function profileFor(index: ContentIndex, syllabus: Syllabus | undefined): Profile | undefined {
  if (!syllabus) return undefined
  return index.profiles.find((p) => p.data.syllabusId === syllabus.id)?.data
}

/**
 * What a question of this type is normally worth here.
 *
 * Taken from the profile where it says, because a section that fixes a mark per
 * question is stating a fact about the real paper.
 */
function defaultMarks(type: QuestionType, profile: Profile | undefined): number {
  const section = profile?.paper.sections.find((s) => (s.questionTypes ?? []).includes(type))
  if (section?.marksPerQuestion !== undefined) return section.marksPerQuestion

  switch (type) {
    case 'multiple_choice':
    case 'true_false':
      return 1
    case 'extended_response':
      return 15
    case 'table':
      return 4
    case 'short_answer':
    case 'drawing':
      return 4
  }
}

/**
 * Questions in this syllabus already tagged against any of these topics or points.
 *
 * The syllabus is not decoration here either. These stems go into the prompt as
 * the ones not to write again, and topic ids repeat across models, so matching
 * on the bare id sent Design and Technology's questions into a Textiles prompt —
 * the same borrowing as the profile fallback, in a different field.
 */
function questionsOn(
  index: ContentIndex,
  syllabusId: string,
  topicIds: string[],
  pointIds: string[],
): Question[] {
  const wanted = new Set([...topicIds, ...pointIds])
  return allQuestions(index)
    .filter((r) => inSyllabus(r, syllabusId))
    .map((r) => r.question)
    .filter((q) => {
      const tagged = [...(q.syllabus?.topicIds ?? []), ...(q.syllabus?.pointIds ?? [])]
      return tagged.some((id) => wanted.has(id))
    })
}
