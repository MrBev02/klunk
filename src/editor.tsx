/**
 * Writing a question without writing JSON.
 *
 * This is the input path the app did not have. Everything else Klunk does
 * assumes a bank already exists, which assumes somebody hand-wrote one, which
 * is exactly the thing a teacher should not have to do.
 *
 * Two decisions shape the form. The fields follow the schema rather than a
 * tidier invention, so what a teacher fills in is what the file holds and
 * nothing is quietly translated. And the whole question is previewed beside the
 * form as it is typed, marking guide included, because a question is judged on
 * whether the distractors are plausible and the criteria add up, and neither is
 * visible from a form full of empty boxes.
 */

import { useEffect, useMemo, useRef, useState } from 'preact/hooks'
import {
  bankPathFault,
  Faults,
  Field,
  normaliseBankPath,
  NumField,
  patched,
  type Patch,
  TopicChipLabel,
  TopicOptions,
} from './fields'
import { QuestionDetail } from './question'
import {
  copyFileInto,
  joinPath,
  questionIds,
  safeFilename,
  saveQuestion,
  type SaveQuestionResult,
  type ContentIndex,
} from './storage'
import {
  QUESTION_TYPES,
  QUESTION_TYPE_LABELS,
  STIMULUS_ALIGNS,
  STIMULUS_ALIGN_LABELS,
  alignOf,
  placeStimulus,
  stimulusList,
  stimulusOwner,
  type MarkCriterion,
  type Question,
  type MatchItem,
  type QuestionConfig,
  type QuestionPart,
  type QuestionType,
  type Stimulus,
  type StimulusAlign,
  type SyllabusCourse,
  type TableCell,
  type TableRow,
} from './types'
import { cleanQuestion, suggestQuestionId, validateQuestion } from './validate'

/** Where a picked image is copied to, relative to the bank that uses it. */
const IMAGE_SUBDIR = 'stimulus'

const DRAWING_SUBTYPES = ['sketch', 'diagram', 'flowchart', 'orthographic', 'freehand'] as const

/**
 * A stimulus and, if it has just been attached, the file not yet copied in.
 *
 * Held beside the draft rather than on it: the file is not part of the question
 * and must not reach the JSON, and pairing them positionally in one list is
 * what keeps them together when a row is removed from the middle.
 */
interface StimulusDraft {
  item: Stimulus
  /**
   * Which part it prints under, by index, or null for the question itself.
   *
   * One flat list with an owner rather than a list per part: the file picker, the
   * object URLs and the copy-on-save all happen once, and a picture is moved
   * between the question and a part by changing one select rather than by
   * removing it and attaching it again.
   *
   * An index and not the part's label, because a label is a field the teacher is
   * editing at the same time. The cost is that removing a part has to remap what
   * points past it, which `removePart` does.
   */
  at: number | null
  pending?: File
  /**
   * An object URL for a file not yet copied into the folder, so the preview can
   * show the picture rather than its name.
   *
   * Made once when the file is attached rather than per render, and given back
   * when the row is removed or the editor closes. The folder's own images come
   * from `index.images`, which `scanFolder` owns.
   */
  previewUrl?: string
}

export interface Editing {
  question: Question
  file: string
  /**
   * True when the question came from the prompt factory and is not in the bank
   * yet, which changes only what the form says: saving adds it rather than
   * replacing anything.
   */
  fresh?: boolean
}

export function QuestionEditor({
  index,
  folder,
  editing,
  onCancel,
  onSaved,
}: {
  index: ContentIndex
  folder: FileSystemDirectoryHandle
  /** The question being changed, or null to write a new one. */
  editing: Editing | null
  onCancel: () => void
  onSaved: (message: string) => void
}) {
  const [draft, setDraft] = useState<Question>(
    () => editing?.question ?? blankQuestion('short_answer'),
  )
  const [stimuli, setStimuli] = useState<StimulusDraft[]>(() =>
    editing ? stimulusList(editing.question) : [],
  )
  /** The bank to write to, or null for one that does not exist yet. */
  const [bank, setBank] = useState<string | null>(
    () => editing?.file ?? index.banks[0]?.path ?? null,
  )
  const [newBankPath, setNewBankPath] = useState('bank/questions.json')
  const [newBankName, setNewBankName] = useState('')
  const [idTouched, setIdTouched] = useState(editing !== null)
  const [marksTouched, setMarksTouched] = useState(editing !== null)
  const [saving, setSaving] = useState(false)
  const [failed, setFailed] = useState('')
  /**
   * Questions written during this sitting, which the index does not know about.
   *
   * The folder is only rescanned when the editor closes, so writing several
   * questions in a row would otherwise keep proposing the id of the one just
   * written, and saving under an existing id replaces it. That is silent data
   * loss, so the ids are remembered here until the rescan catches up.
   */
  const [alsoSaved, setAlsoSaved] = useState<{ id: string; bank: string }[]>([])

  const bankPath = bank === null ? normaliseBankPath(newBankPath) : bank
  const folderIds = useMemo(() => {
    const ids = questionIds(index)
    for (const saved of alsoSaved) ids.add(saved.id)
    return ids
  }, [index, alsoSaved])

  // The id follows the bank and the type until the teacher edits it, at which
  // point it is theirs and Klunk stops moving it under them.
  useEffect(() => {
    if (idTouched) return
    setDraft((d) => ({ ...d, id: suggestQuestionId(bankPath, d.questionType, folderIds) }))
  }, [idTouched, bankPath, draft.questionType, folderIds])

  const question = useMemo(() => placeStimulus(draft, stimuli), [draft, stimuli])

  // The preview showed `Image: stimulus/handle.png` where the picture belongs,
  // because it was given no images to look in. That was tolerable while nothing
  // about an image could be changed here; it is not now that its alignment can,
  // since the control would move something the teacher cannot see.
  const previewImages = useMemo(() => {
    const map = new Map(index.images)
    for (const s of stimuli) {
      if (s.previewUrl && s.item.file) map.set(joinPath(bankPath, s.item.file), s.previewUrl)
    }
    return map
  }, [index.images, stimuli, bankPath])

  // Held in a ref because the cleanup runs at unmount, when the state it has to
  // release is whatever the list ended up as. Removing one row releases its own.
  const stimuliRef = useRef(stimuli)
  stimuliRef.current = stimuli
  useEffect(
    () => () => {
      for (const s of stimuliRef.current) if (s.previewUrl) URL.revokeObjectURL(s.previewUrl)
    },
    [],
  )

  const faults = useMemo(() => {
    const inBank = new Set(
      (index.banks.find((b) => b.path === bankPath)?.data.questions ?? []).map((q) => q.id),
    )
    for (const saved of alsoSaved) if (saved.bank === bankPath) inBank.add(saved.id)
    return validateQuestion(question, {
      inBank,
      inFolder: folderIds,
      originalId: editing?.question.id,
    })
  }, [question, index, bankPath, folderIds, alsoSaved, editing])

  const pathFault = bankPathFault(bank ?? newBankPath)
  const errors = faults.filter((f) => f.severity === 'error')
  const blocked = errors.length > 0 || pathFault !== null

  const set = (patch: Patch<Question>) => setDraft((d) => patched(d, patch))
  const setConfig = (patch: Patch<QuestionConfig>) =>
    setDraft((d) => ({ ...d, config: patched(d.config ?? {}, patch) }))

  const changeType = (type: QuestionType) => {
    setDraft((d) => retype(d, type, marksTouched))
    // `retype` drops the parts where the new type has none, so their pictures
    // come back to the question rather than pointing at a part that has gone.
    if (!holdsParts(type)) {
      setStimuli((list) => list.map((s) => (s.at === null ? s : { ...s, at: null })))
    }
  }

  /**
   * Remove a part, and move the pictures that pointed at it.
   *
   * An owner is an index, so everything pointing past this part has to come down
   * one with it; without that a picture attached to (c) would print under what
   * used to be (d), which reads plausibly and is wrong. The removed part's own
   * pictures go back to the question, where they are on screen and can be dropped
   * deliberately, rather than being deleted by a click on the part's ✕.
   */
  const removePart = (at: number) => {
    setConfig({ parts: (draft.config?.parts ?? []).filter((_, j) => j !== at) })
    setStimuli((list) =>
      list.map((s) =>
        s.at === null || s.at < at ? s : s.at === at ? { ...s, at: null } : { ...s, at: s.at - 1 },
      ),
    )
  }

  /** Save, then either close or clear the form for the next question. */
  const save = async (andAnother: boolean) => {
    setSaving(true)
    setFailed('')
    try {
      // Images first: the bank has to name the file it points at, so a failed
      // copy must stop the save rather than leave a question pointing at
      // nothing. Written after the bank, a bank write that failed would leave
      // an orphan image behind instead, which is the lesser of the two but
      // still litter.
      const directory = imageDirectoryFor(bankPath)
      const copied: StimulusDraft[] = []
      for (const s of stimuli) {
        if (!s.pending) {
          copied.push(s)
          continue
        }
        const name = await copyFileInto(folder, directory, s.pending.name, s.pending)
        copied.push({ ...s, item: { ...s.item, file: `${IMAGE_SUBDIR}/${name}` } })
      }

      // The same routing the preview used, so what is written is what was on
      // screen rather than a second arrangement of it.
      const finished = cleanQuestion(placeStimulus(draft, copied))
      // A question sent here from the prompt factory is `fresh`: it is not in
      // the bank yet, so saving adds it rather than replacing anything, and it
      // must not claim the id of whatever happens to hold it now.
      const isEdit = editing !== null && !editing.fresh
      const written = await saveQuestion(folder, bankPath, finished, {
        ...(bank === null
          ? { name: newBankName.trim() || undefined, syllabusId: draft.syllabus?.syllabusId }
          : {}),
        ...(isEdit && editing
          ? { replacing: { id: editing.question.id, asLoaded: editing.question } }
          : {}),
      })

      if (!andAnother) {
        onSaved(savedMessage(written, bankPath))
        return
      }

      setAlsoSaved((list) => [...list, { id: written.id, bank: bankPath }])
      setStimuli([])
      setIdTouched(false)
      // What carries over is what a teacher writing ten questions for one topic
      // would otherwise retype: the type, the marks, the tagging and the
      // provenance. The question itself starts empty.
      setDraft((d) => ({
        ...blankQuestion(d.questionType),
        marks: d.marks,
        ...(d.syllabus ? { syllabus: d.syllabus } : {}),
        ...(d.outcomes ? { outcomes: d.outcomes } : {}),
        ...(d.source ? { source: d.source } : {}),
      }))
    } catch (err) {
      setFailed((err as Error).message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div class="split split--build">
      <main class="form">
        <section class="panel">
          <p class="panel__title">
            {editing?.fresh ? 'Check this question' : editing ? 'Edit question' : 'New question'}
          </p>

          <div class="fieldrow">
            <Field label="Type" for="q-type">
              <select
                id="q-type"
                class="input"
                value={draft.questionType}
                onChange={(e) => changeType((e.target as HTMLSelectElement).value as QuestionType)}
              >
                {QUESTION_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {QUESTION_TYPE_LABELS[t]}
                  </option>
                ))}
              </select>
            </Field>

            <Field label="Marks" for="q-marks">
              <NumField
                id="q-marks"
                value={Number.isFinite(draft.marks) ? draft.marks : undefined}
                min={0}
                onChange={(n) => {
                  setMarksTouched(true)
                  set({ marks: n ?? Number.NaN })
                }}
              />
            </Field>

            <Field label="Difficulty" for="q-diff" hint="1 easiest, 5 hardest">
              <select
                id="q-diff"
                class="input"
                value={draft.difficulty === undefined ? '' : String(draft.difficulty)}
                onChange={(e) => {
                  const v = (e.target as HTMLSelectElement).value
                  set({ difficulty: v ? Number(v) : undefined })
                }}
              >
                <option value="">Not set</option>
                {[1, 2, 3, 4, 5].map((n) => (
                  <option key={n} value={String(n)}>
                    {n}
                  </option>
                ))}
              </select>
            </Field>
          </div>

          <Field
            label="What the question asks"
            for="q-text"
            hint="**bold**, *italic*, <u>underline</u>. A blank line starts a paragraph, and a table goes in as | pipe | rows |."
          >
            <textarea
              id="q-text"
              class="input"
              rows={3}
              value={draft.questionText}
              placeholder="Explain how a designer establishes the needs of a client."
              onInput={(e) => set({ questionText: (e.target as HTMLTextAreaElement).value })}
            />
          </Field>
        </section>

        <TypeFields
          question={draft}
          setConfig={setConfig}
          setDraft={setDraft}
          removePart={removePart}
        />

        <StimulusFields
          stimuli={stimuli}
          setStimuli={setStimuli}
          directory={imageDirectoryFor(bankPath)}
          parts={draft.config?.parts ?? []}
        />

        <GuideFields question={draft} setDraft={setDraft} />

        <TaggingFields index={index} question={draft} setDraft={setDraft} />

        <SourceFields question={draft} setDraft={setDraft} />

        <DestinationFields
          index={index}
          editing={editing}
          bank={bank}
          setBank={setBank}
          newBankPath={newBankPath}
          setNewBankPath={setNewBankPath}
          newBankName={newBankName}
          setNewBankName={setNewBankName}
          bankPath={bankPath}
          pathFault={pathFault}
          id={draft.id}
          setId={(id) => {
            setIdTouched(true)
            set({ id })
          }}
        />
      </main>

      <aside class="rail">
        <div class="panel">
          <div class="rowbtns">
            <button
              class="btn btn--primary"
              disabled={blocked || saving}
              onClick={() => void save(false)}
            >
              {saving
                ? 'Saving…'
                : editing?.fresh
                  ? 'Save into the bank'
                  : editing
                    ? 'Save changes'
                    : 'Save and close'}
            </button>
            {!editing && (
              <button class="btn" disabled={blocked || saving} onClick={() => void save(true)}>
                Save and write another
              </button>
            )}
            <button
              class="btn"
              onClick={() =>
                alsoSaved.length > 0
                  ? onSaved(
                      `Saved ${alsoSaved.length} question${alsoSaved.length === 1 ? '' : 's'} to ${bankPath}`,
                    )
                  : onCancel()
              }
            >
              {alsoSaved.length > 0 ? 'Done' : 'Cancel'}
            </button>
          </div>
          <p class="muted mono editor__where">{bankPath}</p>
          {alsoSaved.length > 0 && (
            <p class="hint">Written so far: {alsoSaved.map((saved) => saved.id).join(', ')}</p>
          )}
          {failed && <p class="missing">{failed}</p>}
        </div>

        <Faults faults={faults} pathFault={pathFault} />

        <div class="panel editor__preview">
          <p class="panel__title">As it will read</p>
          {draft.questionText.trim() ? (
            <QuestionDetail question={question} bankFile={bankPath} images={previewImages} />
          ) : (
            <p class="muted">The preview appears once the question has some text in it.</p>
          )}
        </div>
      </aside>
    </div>
  )
}

/* ------------------------------------------------------------- per-type fields */

function TypeFields({
  question,
  setConfig,
  setDraft,
  removePart,
}: {
  question: Question
  setConfig: (patch: Patch<QuestionConfig>) => void
  setDraft: (fn: (d: Question) => Question) => void
  /** Held by the editor, since removing a part also moves its pictures. */
  removePart: (at: number) => void
}) {
  const cfg = question.config ?? {}

  switch (question.questionType) {
    case 'multiple_choice':
      return <ChoiceFields cfg={cfg} setConfig={setConfig} />

    case 'multiple_response':
      return <ResponseFields cfg={cfg} setConfig={setConfig} />

    case 'matching':
      return <MatchingFields cfg={cfg} setConfig={setConfig} />

    case 'true_false':
      return (
        <section class="panel">
          <p class="panel__title">Answer</p>
          <div class="fieldrow">
            <Field label="Correct answer" for="tf-answer">
              <select
                id="tf-answer"
                class="input"
                value={cfg.correctAnswer === false ? 'false' : 'true'}
                onChange={(e) =>
                  setConfig({ correctAnswer: (e.target as HTMLSelectElement).value === 'true' })
                }
              >
                <option value="true">True</option>
                <option value="false">False</option>
              </select>
            </Field>
          </div>
          <Field label="Why true" hint="Shown on the marking guide when true is the answer">
            <textarea
              class="input"
              rows={2}
              value={cfg.feedbackTrue ?? ''}
              onInput={(e) => setConfig({ feedbackTrue: (e.target as HTMLTextAreaElement).value })}
            />
          </Field>
          <Field label="Why false">
            <textarea
              class="input"
              rows={2}
              value={cfg.feedbackFalse ?? ''}
              onInput={(e) => setConfig({ feedbackFalse: (e.target as HTMLTextAreaElement).value })}
            />
          </Field>
        </section>
      )

    case 'table':
      return <TableFields cfg={cfg} setConfig={setConfig} />

    case 'drawing':
      return (
        <section class="panel">
          <p class="panel__title">Drawing</p>
          <div class="fieldrow">
            <Field label="Kind" for="dr-subtype">
              <select
                id="dr-subtype"
                class="input"
                value={cfg.subtype ?? 'sketch'}
                onChange={(e) => setConfig({ subtype: (e.target as HTMLSelectElement).value })}
              >
                {DRAWING_SUBTYPES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Width (mm)" for="dr-w">
              <NumField
                id="dr-w"
                value={cfg.spaceMm?.[0]}
                min={0}
                onChange={(n) => setConfig({ spaceMm: [n ?? 0, cfg.spaceMm?.[1] ?? 90] })}
              />
            </Field>
            <Field label="Height (mm)" for="dr-h">
              <NumField
                id="dr-h"
                value={cfg.spaceMm?.[1]}
                min={0}
                onChange={(n) => setConfig({ spaceMm: [cfg.spaceMm?.[0] ?? 160, n ?? 0] })}
              />
            </Field>
          </div>
          <label class="checkline">
            <input
              type="checkbox"
              checked={cfg.grid === true}
              onChange={(e) => setConfig({ grid: (e.target as HTMLInputElement).checked })}
            />
            Print a faint grid in the drawing space
          </label>
          <Field
            label="Instructions"
            hint="Printed above the space, and used as the expected response on the guide"
          >
            <textarea
              class="input"
              rows={3}
              value={cfg.instructions ?? ''}
              onInput={(e) => setConfig({ instructions: (e.target as HTMLTextAreaElement).value })}
            />
          </Field>
        </section>
      )

    default:
      return (
        <WrittenFields
          question={question}
          cfg={cfg}
          setConfig={setConfig}
          setDraft={setDraft}
          removePart={removePart}
        />
      )
  }
}

function ChoiceFields({
  cfg,
  setConfig,
}: {
  cfg: QuestionConfig
  setConfig: (patch: Patch<QuestionConfig>) => void
}) {
  const choices = cfg.choices ?? []
  const correct = typeof cfg.correctAnswer === 'number' ? cfg.correctAnswer : 0

  const change = (i: number, patch: Patch<{ text: string; feedback?: string }>) =>
    setConfig({ choices: choices.map((c, j) => (i === j ? patched(c, patch) : c)) })

  return (
    <section class="panel">
      <p class="panel__title">Options</p>
      <p class="hint">
        Options print in a shuffled but fixed order, so the letter that is correct is the same on
        the student paper and the marking guide.
      </p>

      <ol class="editrows">
        {choices.map((c, i) => (
          <li key={i} class="editrow">
            <label class="editrow__pick" title="Mark this option as the correct answer">
              <input
                type="radio"
                name="mc-correct"
                checked={i === correct}
                onChange={() => setConfig({ correctAnswer: i })}
              />
              <span class="editrow__letter">{String.fromCharCode(65 + i)}</span>
            </label>
            <div class="editrow__body">
              <input
                class="input"
                value={c.text}
                placeholder="The option as the student reads it"
                onInput={(e) => change(i, { text: (e.target as HTMLInputElement).value })}
              />
              <input
                class="input input--sub"
                value={c.feedback ?? ''}
                placeholder={
                  i === correct
                    ? 'Why this is the answer'
                    : 'Which misconception makes this tempting'
                }
                onInput={(e) => change(i, { feedback: (e.target as HTMLInputElement).value })}
              />
            </div>
            <button
              class="btn btn--icon"
              title="Remove this option"
              disabled={choices.length <= 2}
              onClick={() =>
                setConfig({
                  choices: choices.filter((_, j) => j !== i),
                  // The answer moves with the options it points into.
                  correctAnswer: correct > i ? correct - 1 : correct === i ? 0 : correct,
                })
              }
            >
              ✕
            </button>
          </li>
        ))}
      </ol>

      <button
        class="btn btn--small"
        disabled={choices.length >= 8}
        onClick={() => setConfig({ choices: [...choices, { text: '' }] })}
      >
        Add an option
      </button>

      <label class="checkline">
        <input
          type="checkbox"
          checked={cfg.shuffle !== false}
          onChange={(e) => setConfig({ shuffle: (e.target as HTMLInputElement).checked })}
        />
        Shuffle the options
      </label>
    </section>
  )
}

/**
 * Multiple choice with tickboxes instead of a radio, and one real difference.
 *
 * Unticking the last answer clears `correctAnswers` rather than leaving `[]`,
 * so the form can say "not recorded" at all. That is the state a paper
 * transcribed without its markscheme arrives in, and the alternative is
 * asserting that no option is an answer.
 */
function ResponseFields({
  cfg,
  setConfig,
}: {
  cfg: QuestionConfig
  setConfig: (patch: Patch<QuestionConfig>) => void
}) {
  const choices = cfg.choices ?? []
  const correct = cfg.correctAnswers ?? []
  const isAnswer = new Set(correct)

  const change = (i: number, patch: Patch<{ text: string; feedback?: string }>) =>
    setConfig({ choices: choices.map((c, j) => (i === j ? patched(c, patch) : c)) })

  const toggle = (i: number) => {
    const next = isAnswer.has(i)
      ? correct.filter((n) => n !== i)
      : [...correct, i].sort((a, b) => a - b)
    setConfig({ correctAnswers: next.length ? next : undefined })
  }

  return (
    <section class="panel">
      <p class="panel__title">Options</p>
      <p class="hint">
        Tick every option that is an answer. The paper tells the student more than one may be
        correct, without saying how many.
      </p>

      <ol class="editrows">
        {choices.map((c, i) => (
          <li key={i} class="editrow">
            <label class="editrow__pick" title="This option is one of the answers">
              <input type="checkbox" checked={isAnswer.has(i)} onChange={() => toggle(i)} />
              <span class="editrow__letter">{String.fromCharCode(65 + i)}</span>
            </label>
            <div class="editrow__body">
              <input
                class="input"
                value={c.text}
                placeholder="The option as the student reads it"
                onInput={(e) => change(i, { text: (e.target as HTMLInputElement).value })}
              />
              <input
                class="input input--sub"
                value={c.feedback ?? ''}
                placeholder={isAnswer.has(i) ? 'Why this is an answer' : 'Why this one is not'}
                onInput={(e) => change(i, { feedback: (e.target as HTMLInputElement).value })}
              />
            </div>
            <button
              class="btn btn--icon"
              title="Remove this option"
              disabled={choices.length <= 3}
              onClick={() =>
                setConfig({
                  choices: choices.filter((_, j) => j !== i),
                  // The answers move with the options they point into.
                  correctAnswers: nonEmptyIndexes(
                    correct.filter((n) => n !== i).map((n) => (n > i ? n - 1 : n)),
                  ),
                })
              }
            >
              ✕
            </button>
          </li>
        ))}
      </ol>

      <button
        class="btn btn--small"
        disabled={choices.length >= 8}
        onClick={() => setConfig({ choices: [...choices, { text: '' }] })}
      >
        Add an option
      </button>

      {correct.length === 0 && (
        <p class="hint">
          No answers ticked. The marking guide will say so instead of printing them.
        </p>
      )}

      <label class="checkline">
        <input
          type="checkbox"
          checked={cfg.shuffle !== false}
          onChange={(e) => setConfig({ shuffle: (e.target as HTMLInputElement).checked })}
        />
        Shuffle the options
      </label>
    </section>
  )
}

/** `[]` means "none are answers" everywhere else, so it never gets written. */
function nonEmptyIndexes(indexes: number[]): number[] | undefined {
  return indexes.length ? indexes : undefined
}

function MatchingFields({
  cfg,
  setConfig,
}: {
  cfg: QuestionConfig
  setConfig: (patch: Patch<QuestionConfig>) => void
}) {
  const items = cfg.items ?? []
  const options = cfg.options ?? []

  const setItem = (i: number, patch: Patch<MatchItem>) =>
    setConfig({ items: items.map((item, j) => (i === j ? patched(item, patch) : item)) })

  const link = (i: number, at: number) => {
    const now = items[i]?.matches ?? []
    const next = now.includes(at) ? now.filter((n) => n !== at) : [...now, at].sort((a, b) => a - b)
    setItem(i, { matches: nonEmptyIndexes(next) })
  }

  return (
    <section class="panel">
      <p class="panel__title">The two columns</p>
      <p class="hint">
        Write both columns, then click a letter to link it to that item. The lettered column prints
        in a shuffled but fixed order.
      </p>

      <ol class="editrows">
        {items.map((item, i) => (
          <li key={i} class="editrow">
            <span class="editrow__letter">{i + 1}</span>
            <div class="editrow__body">
              <input
                class="input"
                value={item.text}
                placeholder="The item as the student reads it"
                onInput={(e) => setItem(i, { text: (e.target as HTMLInputElement).value })}
              />
              <div class="matchpick">
                {options.map((_, at) => (
                  <button
                    key={at}
                    type="button"
                    class={`btn btn--letter ${item.matches?.includes(at) ? 'is-on' : ''}`}
                    aria-pressed={item.matches?.includes(at) ? 'true' : 'false'}
                    title={`Link item ${i + 1} to option ${String.fromCharCode(65 + at)}`}
                    onClick={() => link(i, at)}
                  >
                    {String.fromCharCode(65 + at)}
                  </button>
                ))}
              </div>
            </div>
            <button
              class="btn btn--icon"
              title="Remove this item"
              disabled={items.length <= 2}
              onClick={() => setConfig({ items: items.filter((_, j) => j !== i) })}
            >
              ✕
            </button>
          </li>
        ))}
      </ol>

      <button class="btn btn--small" onClick={() => setConfig({ items: [...items, { text: '' }] })}>
        Add an item
      </button>

      <p class="panel__title">The lettered column</p>
      <ol class="editrows">
        {options.map((o, i) => (
          <li key={i} class="editrow">
            <span class="editrow__letter">{String.fromCharCode(65 + i)}</span>
            <div class="editrow__body">
              <input
                class="input"
                value={o.text}
                placeholder="The option as the student reads it"
                onInput={(e) =>
                  setConfig({
                    options: options.map((x, j) =>
                      i === j ? { text: (e.target as HTMLInputElement).value } : x,
                    ),
                  })
                }
              />
            </div>
            <button
              class="btn btn--icon"
              title="Remove this option"
              disabled={options.length <= 2}
              onClick={() =>
                setConfig({
                  options: options.filter((_, j) => j !== i),
                  // Every link past the removed option shifts down with it, and
                  // links to the option itself go. Leaving them would point at
                  // whatever moved up into the gap.
                  items: items.map((item) =>
                    item.matches === undefined
                      ? item
                      : patched(item, {
                          matches: nonEmptyIndexes(
                            item.matches.filter((n) => n !== i).map((n) => (n > i ? n - 1 : n)),
                          ),
                        }),
                  ),
                })
              }
            >
              ✕
            </button>
          </li>
        ))}
      </ol>

      <button
        class="btn btn--small"
        onClick={() => setConfig({ options: [...options, { text: '' }] })}
      >
        Add an option
      </button>

      <label class="checkline">
        <input
          type="checkbox"
          checked={cfg.shuffle !== false}
          onChange={(e) => setConfig({ shuffle: (e.target as HTMLInputElement).checked })}
        />
        Shuffle the lettered column
      </label>
    </section>
  )
}

function TableFields({
  cfg,
  setConfig,
}: {
  cfg: QuestionConfig
  setConfig: (patch: Patch<QuestionConfig>) => void
}) {
  const columns = cfg.columns ?? []
  const rows = cfg.rows ?? []

  const changeRow = (i: number, patch: Patch<TableRow>) =>
    setConfig({ rows: rows.map((r, j) => (i === j ? patched(r, patch) : r)) })

  /**
   * The row's cells with one column's answers replaced.
   *
   * Padded to the column count first, because a teacher who fills in the third
   * column before the second must not have the third silently become the
   * second: cells are positional and the gap has to be a real empty cell.
   */
  const cellsWith = (r: TableRow, at: number, answers: string[], count: number): TableCell[] => {
    const next = Array.from({ length: count }, (_, k) => r.cells?.[k] ?? {})
    next[at] = answers.length > 0 ? { answers } : {}
    return next
  }

  return (
    <section class="panel">
      <p class="panel__title">Table</p>
      <p class="hint">
        The first column holds what the student is given. The rest print blank for them to complete.
      </p>

      <div class="fieldrow">
        {columns.map((c, i) => (
          <Field key={i} for={`tbl-col-${i}`} label={i === 0 ? 'First column' : `Column ${i + 1}`}>
            <div class="withbtn">
              <input
                id={`tbl-col-${i}`}
                class="input"
                value={c}
                placeholder={i === 0 ? 'Purpose' : 'Research method'}
                onInput={(e) =>
                  setConfig({
                    columns: columns.map((x, j) =>
                      i === j ? (e.target as HTMLInputElement).value : x,
                    ),
                  })
                }
              />
              <button
                class="btn btn--icon"
                title="Remove this column"
                disabled={columns.length <= 1}
                onClick={() => setConfig({ columns: columns.filter((_, j) => j !== i) })}
              >
                ✕
              </button>
            </div>
          </Field>
        ))}
      </div>
      <button class="btn btn--small" onClick={() => setConfig({ columns: [...columns, ''] })}>
        Add a column
      </button>

      <p class="rail__label editor__sub">Rows</p>
      <ol class="editrows">
        {rows.map((r, i) => (
          <li key={i} class="editrow">
            <span class="editrow__letter">{i + 1}</span>
            <div class="editrow__body">
              <input
                class="input"
                value={r.label}
                placeholder="What the student is given"
                onInput={(e) => changeRow(i, { label: (e.target as HTMLInputElement).value })}
              />
              {/* One box per answer column, because a row used to carry one
                  list for the whole row and printed it into every column. */}
              <div class="withbtn">
                {columns.slice(1).map((col, j) => (
                  <input
                    key={j}
                    class="input input--sub"
                    value={(r.cells?.[j]?.answers ?? []).join(' / ')}
                    placeholder={
                      columns.length > 2
                        ? `${col.trim() || `Column ${j + 2}`}. Put a slash between alternatives.`
                        : 'Accepted answers. Put a slash between alternatives.'
                    }
                    onInput={(e) =>
                      changeRow(i, {
                        cells: cellsWith(
                          r,
                          j,
                          splitAlternatives((e.target as HTMLInputElement).value),
                          columns.length - 1,
                        ),
                      })
                    }
                  />
                ))}
                <NumField
                  class="input input--narrow"
                  value={r.marks}
                  min={0}
                  placeholder="m"
                  onChange={(n) => changeRow(i, { marks: n })}
                />
              </div>
            </div>
            <button
              class="btn btn--icon"
              title="Remove this row"
              disabled={rows.length <= 1}
              onClick={() => setConfig({ rows: rows.filter((_, j) => j !== i) })}
            >
              ✕
            </button>
          </li>
        ))}
      </ol>
      <button
        class="btn btn--small"
        onClick={() => setConfig({ rows: [...rows, { label: '', cells: [], marks: 1 }] })}
      >
        Add a row
      </button>
    </section>
  )
}

function WrittenFields({
  question,
  cfg,
  setConfig,
  setDraft,
  removePart,
}: {
  question: Question
  cfg: QuestionConfig
  setConfig: (patch: Patch<QuestionConfig>) => void
  setDraft: (fn: (d: Question) => Question) => void
  removePart: (at: number) => void
}) {
  const parts = cfg.parts ?? []

  const changePart = (i: number, patch: Patch<QuestionPart>) =>
    setConfig({ parts: parts.map((p, j) => (i === j ? patched(p, patch) : p)) })

  const used = parts.reduce((t, p) => t + (Number.isFinite(p.marks) ? p.marks : 0), 0)

  return (
    <section class="panel">
      <p class="panel__title">Answer space</p>

      {parts.length === 0 && (
        <Field label="Ruled lines" for="w-lines" hint="Leave blank to work it out from the marks">
          <NumField
            id="w-lines"
            class="input input--narrow"
            value={cfg.answerLines}
            min={0}
            onChange={(n) => setConfig({ answerLines: n })}
          />
        </Field>
      )}

      {parts.length > 0 && (
        <>
          <p class="hint">
            Parts print with their own marks and lines.{' '}
            <strong class={used === question.marks ? '' : 'missing'}>
              {used} of {question.marks} marks allocated
            </strong>
            .
          </p>
          <ol class="editrows">
            {parts.map((p, i) => (
              <li key={i} class="editrow">
                <input
                  class="input input--label"
                  value={p.label}
                  title="Part label"
                  onInput={(e) => changePart(i, { label: (e.target as HTMLInputElement).value })}
                />
                <div class="editrow__body">
                  <div class="withbtn">
                    <input
                      class="input"
                      value={p.text}
                      placeholder="What this part asks"
                      onInput={(e) => changePart(i, { text: (e.target as HTMLInputElement).value })}
                    />
                    <NumField
                      class="input input--narrow"
                      value={Number.isFinite(p.marks) ? p.marks : undefined}
                      min={0}
                      placeholder="m"
                      onChange={(n) => changePart(i, { marks: n ?? Number.NaN })}
                    />
                    <NumField
                      class="input input--narrow"
                      value={p.answerLines}
                      min={0}
                      placeholder="lines"
                      onChange={(n) => changePart(i, { answerLines: n })}
                    />
                  </div>
                  <textarea
                    class="input input--sub"
                    rows={2}
                    value={p.sampleAnswer ?? ''}
                    placeholder="Sample answer for this part"
                    onInput={(e) =>
                      changePart(i, { sampleAnswer: (e.target as HTMLTextAreaElement).value })
                    }
                  />
                </div>
                <button
                  class="btn btn--icon"
                  title="Remove this part"
                  onClick={() => removePart(i)}
                >
                  ✕
                </button>
              </li>
            ))}
          </ol>
        </>
      )}

      <button
        class="btn btn--small"
        onClick={() => {
          const label = `(${String.fromCharCode(97 + parts.length)})`
          const left = Math.max(1, question.marks - used)
          setDraft((d) => ({
            ...d,
            config: patched(d.config ?? {}, {
              // Ruled lines belong to the parts once there are parts, so the
              // whole-question count would print an unused block underneath.
              answerLines: undefined,
              parts: [...parts, { label, text: '', marks: parts.length === 0 ? d.marks : left }],
            }),
          }))
        }}
      >
        {parts.length === 0 ? 'Split into parts' : 'Add a part'}
      </button>
    </section>
  )
}

/* ------------------------------------------------------------------- stimulus */

function StimulusFields({
  stimuli,
  setStimuli,
  directory,
  parts,
}: {
  stimuli: StimulusDraft[]
  setStimuli: (fn: (s: StimulusDraft[]) => StimulusDraft[]) => void
  directory: string
  /** What a picture can belong to besides the question. Empty on most types. */
  parts: QuestionPart[]
}) {
  const [picking, setPicking] = useState('')

  const change = (i: number, patch: Patch<Stimulus>) =>
    setStimuli((list) => list.map((s, j) => (i === j ? { ...s, item: patched(s.item, patch) } : s)))

  const rehome = (i: number, at: number | null) =>
    setStimuli((list) => list.map((s, j) => (i === j ? { ...s, at } : s)))

  const attach = async () => {
    setPicking('')
    try {
      const handles = await window.showOpenFilePicker({
        id: 'klunk-stimulus',
        multiple: false,
        types: [
          {
            description: 'Images',
            accept: { 'image/*': ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg'] },
          },
        ],
      })
      const handle = handles[0]
      if (!handle) return
      const file = await handle.getFile()
      setStimuli((list) => [
        ...list,
        // The name shown is the one that will be used, bar a collision, which
        // is only discovered when the copy happens.
        {
          item: { kind: 'image', file: `${IMAGE_SUBDIR}/${safeFilename(file.name)}` },
          at: null,
          pending: file,
          previewUrl: URL.createObjectURL(file),
        },
      ])
    } catch (err) {
      // Closing the dialog is not a fault.
      if (err instanceof DOMException && err.name === 'AbortError') return
      setPicking((err as Error).message)
    }
  }

  return (
    <section class="panel">
      <p class="panel__title">Stimulus</p>
      <p class="hint">
        Images are copied into <span class="mono">{directory}</span> when the question is saved.
      </p>
      {parts.length > 0 && (
        <p class="hint">
          Choose the part a picture belongs to. A part's picture prints between what that part asks
          and its answer space.
        </p>
      )}

      {stimuli.length > 0 && (
        <ol class="editrows">
          {stimuli.map((s, i) => (
            <li key={i} class="editrow">
              <span class="editrow__letter">{s.item.kind === 'image' ? '▣' : '¶'}</span>
              <div class="editrow__body">
                {parts.length > 0 && (
                  <Field label="Belongs to">
                    <select
                      class="input input--sub"
                      value={stimulusOwner(s.at, parts.length) === null ? '' : String(s.at)}
                      onChange={(e) => {
                        const value = (e.target as HTMLSelectElement).value
                        rehome(i, value === '' ? null : Number(value))
                      }}
                    >
                      <option value="">The whole question</option>
                      {parts.map((p, j) => (
                        <option key={j} value={String(j)}>
                          Part {p.label.trim() || `(${j + 1})`}
                        </option>
                      ))}
                    </select>
                  </Field>
                )}
                {s.item.kind === 'image' ? (
                  <p class="mono editor__file">
                    {s.item.file}
                    {s.pending && (
                      <span class="muted">
                        {' '}
                        · {Math.round(s.pending.size / 1024)} kB, not yet copied
                      </span>
                    )}
                  </p>
                ) : (
                  <textarea
                    class="input"
                    rows={3}
                    value={s.item.text ?? ''}
                    placeholder="The passage or data the question refers to"
                    onInput={(e) => change(i, { text: (e.target as HTMLTextAreaElement).value })}
                  />
                )}
                {s.item.kind === 'image' && (
                  <input
                    class="input input--sub"
                    value={s.item.alt ?? ''}
                    placeholder="Describe the image for a screen reader"
                    onInput={(e) => change(i, { alt: (e.target as HTMLInputElement).value })}
                  />
                )}
                <div class="withbtn">
                  <input
                    class="input input--sub"
                    value={s.item.caption ?? ''}
                    placeholder="Caption printed underneath"
                    onInput={(e) => change(i, { caption: (e.target as HTMLInputElement).value })}
                  />
                  {s.item.kind === 'image' && (
                    <>
                      <select
                        class="input input--align"
                        title="Where it sits across the page"
                        value={alignOf(s.item)}
                        onChange={(e) =>
                          change(i, {
                            align: (e.target as HTMLSelectElement).value as StimulusAlign,
                          })
                        }
                      >
                        {STIMULUS_ALIGNS.map((a) => (
                          <option key={a} value={a}>
                            {STIMULUS_ALIGN_LABELS[a]}
                          </option>
                        ))}
                      </select>
                      <NumField
                        class="input input--narrow"
                        value={s.item.maxHeightMm}
                        min={0}
                        placeholder="mm"
                        title="Tallest it may print"
                        onChange={(n) => change(i, { maxHeightMm: n })}
                      />
                    </>
                  )}
                </div>
              </div>
              <button
                class="btn btn--icon"
                title="Remove this stimulus"
                onClick={() =>
                  setStimuli((list) => {
                    const going = list[i]
                    if (going?.previewUrl) URL.revokeObjectURL(going.previewUrl)
                    return list.filter((_, j) => j !== i)
                  })
                }
              >
                ✕
              </button>
            </li>
          ))}
        </ol>
      )}

      <div class="rowbtns">
        <button class="btn btn--small" onClick={() => void attach()}>
          Attach an image
        </button>
        <button
          class="btn btn--small"
          onClick={() =>
            setStimuli((list) => [...list, { item: { kind: 'text', text: '' }, at: null }])
          }
        >
          Add a text stimulus
        </button>
      </div>
      {picking && <p class="missing">{picking}</p>}
    </section>
  )
}

/* -------------------------------------------------------------- marking guide */

function GuideFields({
  question,
  setDraft,
}: {
  question: Question
  setDraft: (fn: (d: Question) => Question) => void
}) {
  const guide = question.markingGuide ?? {}
  const criteria = guide.criteria ?? []

  const setGuide = (patch: Patch<NonNullable<Question['markingGuide']>>) =>
    setDraft((d) => ({ ...d, markingGuide: patched(d.markingGuide ?? {}, patch) }))

  const change = (i: number, patch: Patch<MarkCriterion>) =>
    setGuide({ criteria: criteria.map((c, j) => (i === j ? patched(c, patch) : c)) })

  return (
    <section class="panel">
      <p class="panel__title">Marking guide</p>

      {/* Sample answer first, matching the printed guide: a table of marks says
          how to score a response, not what one worth the marks looks like. */}
      <Field label="Sample answer" hint="What a response worth full marks actually says">
        <textarea
          class="input"
          rows={4}
          value={guide.sampleAnswer ?? ''}
          onInput={(e) => setGuide({ sampleAnswer: (e.target as HTMLTextAreaElement).value })}
        />
      </Field>

      {criteria.length > 0 && (
        <ol class="editrows">
          {criteria.map((c, i) => (
            <li key={i} class="editrow">
              <span class="editrow__letter">{i + 1}</span>
              <div class="editrow__body withbtn">
                <input
                  class="input"
                  value={c.description}
                  placeholder="What a response has to do to earn these marks"
                  onInput={(e) => change(i, { description: (e.target as HTMLInputElement).value })}
                />
                <NumField
                  class="input input--narrow"
                  value={Number.isFinite(c.marks) ? c.marks : undefined}
                  min={0}
                  placeholder="m"
                  onChange={(n) => change(i, { marks: n ?? Number.NaN })}
                />
              </div>
              <button
                class="btn btn--icon"
                title="Remove this criterion"
                onClick={() => setGuide({ criteria: criteria.filter((_, j) => j !== i) })}
              >
                ✕
              </button>
            </li>
          ))}
        </ol>
      )}

      <button
        class="btn btn--small"
        onClick={() => setGuide({ criteria: [...criteria, { marks: 1, description: '' }] })}
      >
        Add a criterion
      </button>

      <Field label="Notes to the marker" hint="Never printed on the student paper">
        <textarea
          class="input"
          rows={2}
          value={guide.notes ?? ''}
          onInput={(e) => setGuide({ notes: (e.target as HTMLTextAreaElement).value })}
        />
      </Field>
    </section>
  )
}

/* -------------------------------------------------------------------- tagging */

interface CourseOption {
  key: string
  syllabusId: string
  courseId: string
  label: string
  course: SyllabusCourse
}

function TaggingFields({
  index,
  question,
  setDraft,
}: {
  index: ContentIndex
  question: Question
  setDraft: (fn: (d: Question) => Question) => void
}) {
  const courses = useMemo((): CourseOption[] => {
    const out: CourseOption[] = []
    for (const { data } of index.syllabuses) {
      for (const course of data.courses) {
        out.push({
          key: `${data.id}::${course.id}`,
          syllabusId: data.id,
          courseId: course.id,
          label: `${data.name} · ${course.name}`,
          course,
        })
      }
    }
    return out
  }, [index])

  const chosenKey = `${question.syllabus?.syllabusId ?? ''}::${question.syllabus?.courseId ?? ''}`
  const chosen = courses.find((c) => c.key === chosenKey) ?? courses[0]

  const topicIds = question.syllabus?.topicIds ?? []
  const pointIds = question.syllabus?.pointIds ?? []
  const outcomes = question.outcomes ?? []

  /**
   * The course being tagged against, stamped on whatever tag is being added.
   *
   * The select shows a course from the moment the panel renders, whether the
   * teacher chose it or accepted the default, and only its onChange recorded
   * it. Accepting the default and picking a topic therefore wrote topic ids
   * with no syllabus or course beside them. Two syllabus models in one folder
   * can both claim a bare topic id, and coverage cannot report against one it
   * cannot name.
   */
  const withCourse = (d: Question): NonNullable<Question['syllabus']> => ({
    ...(chosen ? { syllabusId: chosen.syllabusId, courseId: chosen.courseId } : {}),
    ...(d.syllabus ?? {}),
  })

  const setSyllabus = (patch: Patch<NonNullable<Question['syllabus']>>) =>
    setDraft((d) => ({ ...d, syllabus: patched(withCourse(d), patch) }))

  // Only the points under a chosen topic are offered. A syllabus runs to
  // seventy-odd points, and a list that long is not a choice, it is a search.
  const points = (chosen?.course.topics ?? [])
    .filter((t) => topicIds.includes(t.id))
    .flatMap((t) => t.points ?? [])

  return (
    <section class="panel">
      <p class="panel__title">What it assesses</p>

      {courses.length === 0 ? (
        <p class="hint">
          Build a model from the syllabus <span class="mono">.docx</span> on the{' '}
          <strong>Syllabus</strong> tab. Its topics appear here once you have one.
        </p>
      ) : (
        <>
          <Field label="Course" for="tg-course">
            <select
              id="tg-course"
              class="input"
              value={chosen?.key ?? ''}
              onChange={(e) => {
                const next = courses.find((c) => c.key === (e.target as HTMLSelectElement).value)
                if (!next) return
                // Topic and point ids belong to the course they came from, so
                // changing course cannot keep them.
                setDraft((d) => ({
                  ...d,
                  syllabus: { syllabusId: next.syllabusId, courseId: next.courseId },
                  outcomes: [],
                }))
              }}
            >
              {courses.map((c) => (
                <option key={c.key} value={c.key}>
                  {c.label}
                </option>
              ))}
            </select>
          </Field>

          <Field label="Topics" for="tg-topic">
            <select
              id="tg-topic"
              class="input"
              value=""
              onChange={(e) => {
                const id = (e.target as HTMLSelectElement).value
                if (id && !topicIds.includes(id)) setSyllabus({ topicIds: [...topicIds, id] })
              }}
            >
              <option value="">Add a topic…</option>
              <TopicOptions topics={chosen?.course.topics ?? []} omit={topicIds} />
            </select>
          </Field>

          {topicIds.length > 0 && (
            <div class="tagrow">
              {topicIds.map((id) => {
                const topic = chosen?.course.topics.find((t) => t.id === id)
                return (
                  <button
                    key={id}
                    class="chip chip--drop chip--topic"
                    title="Remove this topic"
                    onClick={() =>
                      setSyllabus({
                        topicIds: topicIds.filter((t) => t !== id),
                        // A point without its topic is an orphan tag.
                        pointIds: pointIds.filter(
                          (p) => !(topic?.points ?? []).some((tp) => tp.id === p),
                        ),
                      })
                    }
                  >
                    {topic ? <TopicChipLabel topic={topic} /> : id} ✕
                  </button>
                )
              })}
            </div>
          )}

          {points.length > 0 && (
            <>
              <p class="rail__label editor__sub">Content points</p>
              <ul class="plain checklist">
                {points.map((p) => (
                  <li key={p.id}>
                    <label class="checkline">
                      <input
                        type="checkbox"
                        checked={pointIds.includes(p.id)}
                        onChange={(e) =>
                          setSyllabus({
                            pointIds: (e.target as HTMLInputElement).checked
                              ? [...pointIds, p.id]
                              : pointIds.filter((x) => x !== p.id),
                          })
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

          {(chosen?.course.outcomes ?? []).length > 0 && (
            <>
              <p class="rail__label editor__sub">Outcomes</p>
              <div class="tagrow">
                {(chosen?.course.outcomes ?? []).map((o) => (
                  <button
                    key={o.code}
                    class={`chip ${outcomes.includes(o.code) ? 'chip--type' : ''}`}
                    title={o.text}
                    onClick={() =>
                      setDraft((d) => ({
                        ...d,
                        // An outcome code belongs to a course too, so tagging
                        // one records which course it came from.
                        syllabus: withCourse(d),
                        outcomes: outcomes.includes(o.code)
                          ? outcomes.filter((x) => x !== o.code)
                          : [...outcomes, o.code],
                      }))
                    }
                  >
                    {o.code}
                  </button>
                ))}
              </div>
            </>
          )}
        </>
      )}

      <Field label="Your own tags" hint="Separated by commas" for="tg-tags">
        <input
          id="tg-tags"
          class="input"
          value={(question.tags ?? []).join(', ')}
          placeholder="ergonomics, sustainability"
          onInput={(e) =>
            setDraft((d) => ({
              ...d,
              tags: splitList((e.target as HTMLInputElement).value),
            }))
          }
        />
      </Field>
    </section>
  )
}

/* ----------------------------------------------------------------- provenance */

function SourceFields({
  question,
  setDraft,
}: {
  question: Question
  setDraft: (fn: (d: Question) => Question) => void
}) {
  const source = question.source ?? {}
  const setSource = (patch: Patch<NonNullable<Question['source']>>) =>
    setDraft((d) => ({ ...d, source: patched(d.source ?? {}, patch) }))

  const origin = source.origin ?? 'authored'

  return (
    <section class="panel">
      <p class="panel__title">Where it came from</p>
      <p class="hint">
        Klunk can only warn that students may have seen a question if the paper and year are
        recorded.
      </p>

      <div class="fieldrow">
        <Field label="Origin" for="sr-origin">
          <select
            id="sr-origin"
            class="input"
            value={origin}
            onChange={(e) =>
              setSource({
                origin: (e.target as HTMLSelectElement).value as
                  'authored' | 'extracted' | 'adapted',
              })
            }
          >
            <option value="authored">Written by me</option>
            <option value="extracted">Taken from a past paper</option>
            <option value="adapted">Adapted from a past paper</option>
          </select>
        </Field>

        {origin !== 'authored' && (
          <>
            <Field label="Paper" for="sr-paper">
              <input
                id="sr-paper"
                class="input"
                value={source.paper ?? ''}
                placeholder="NSW HSC Design and Technology"
                onInput={(e) => setSource({ paper: (e.target as HTMLInputElement).value })}
              />
            </Field>
            <Field label="Year" for="sr-year">
              <NumField id="sr-year" value={source.year} onChange={(n) => setSource({ year: n })} />
            </Field>
            <Field label="Question" for="sr-number">
              <input
                id="sr-number"
                class="input"
                value={source.questionNumber ?? ''}
                placeholder="24(b)"
                onInput={(e) => setSource({ questionNumber: (e.target as HTMLInputElement).value })}
              />
            </Field>
          </>
        )}
      </div>

      {origin !== 'authored' && (
        <Field label="Copyright" hint="An extracted NESA question stays NESA's">
          <input
            class="input"
            value={source.copyright ?? ''}
            placeholder="NESA"
            onInput={(e) => setSource({ copyright: (e.target as HTMLInputElement).value })}
          />
        </Field>
      )}
    </section>
  )
}

/* ---------------------------------------------------------------- destination */

function DestinationFields({
  index,
  editing,
  bank,
  setBank,
  newBankPath,
  setNewBankPath,
  newBankName,
  setNewBankName,
  bankPath,
  pathFault,
  id,
  setId,
}: {
  index: ContentIndex
  editing: Editing | null
  bank: string | null
  setBank: (b: string | null) => void
  newBankPath: string
  setNewBankPath: (p: string) => void
  newBankName: string
  setNewBankName: (n: string) => void
  bankPath: string
  pathFault: string | null
  id: string
  setId: (id: string) => void
}) {
  return (
    <section class="panel">
      <p class="panel__title">Where it is kept</p>

      {/* Only where the question lands: the id field below already says why it
          is fixed, and saying it twice is what made this panel a paragraph. */}
      {editing?.fresh ? (
        <p class="hint">
          Saving writes this question into <span class="mono">{editing.file}</span>.
        </p>
      ) : editing ? (
        <p class="hint">
          Saving replaces this question in <span class="mono">{editing.file}</span>.
        </p>
      ) : (
        <>
          <Field label="Bank" for="dst-bank">
            <select
              id="dst-bank"
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
            <div class="fieldrow">
              <Field label="File" for="dst-path">
                <input
                  id="dst-path"
                  class="input mono"
                  value={newBankPath}
                  onInput={(e) => setNewBankPath((e.target as HTMLInputElement).value)}
                />
              </Field>
              <Field label="Bank name" for="dst-name" hint="Shown in Klunk, optional">
                <input
                  id="dst-name"
                  class="input"
                  value={newBankName}
                  placeholder="HSC core questions"
                  onInput={(e) => setNewBankName((e.target as HTMLInputElement).value)}
                />
              </Field>
            </div>
          )}
          {pathFault && <p class="missing">{pathFault}</p>}
        </>
      )}

      <Field
        label="Question id"
        for="dst-id"
        hint={
          editing
            ? 'Fixed, because papers point at it'
            : `Papers will refer to this as ${bankPath}#${id}`
        }
      >
        <input
          id="dst-id"
          class="input mono"
          value={id}
          disabled={editing !== null}
          onInput={(e) => setId((e.target as HTMLInputElement).value)}
        />
      </Field>
    </section>
  )
}

/* ----------------------------------------------------------------------- utils */

/**
 * What to tell the teacher a save actually did.
 *
 * Both of the unusual outcomes mean somebody else was in the same bank, and
 * both used to be silent: one of them by destroying their question.
 */
function savedMessage(written: SaveQuestionResult, bankPath: string): string {
  if (written.reassignedFrom !== undefined) {
    return (
      `Saved to ${bankPath} as ${written.id}. ${written.reassignedFrom} had been taken ` +
      'by somebody else since you opened this folder, so this one was given the next ' +
      'free id rather than replacing theirs.'
    )
  }
  if (written.overwroteChanges) {
    return (
      `Saved ${written.id} to ${bankPath}. Somebody else had changed this question ` +
      'since you opened it, and your version is the one now in the bank.'
    )
  }
  return `Saved ${written.id} to ${bankPath}`
}

function blankQuestion(type: QuestionType): Question {
  return {
    id: '',
    questionType: type,
    questionText: '',
    marks: defaultMarks(type),
    config: defaultConfig(type),
    source: { origin: 'authored' },
  }
}

function defaultMarks(type: QuestionType): number {
  switch (type) {
    case 'multiple_choice':
    case 'multiple_response':
    case 'matching':
    case 'true_false':
      return 1
    case 'extended_response':
      return 15
    case 'drawing':
      return 6
    default:
      return 4
  }
}

function defaultConfig(type: QuestionType): QuestionConfig {
  switch (type) {
    case 'multiple_choice':
      return {
        choices: [{ text: '' }, { text: '' }, { text: '' }, { text: '' }],
        correctAnswer: 0,
        shuffle: true,
      }
    case 'multiple_response':
      // Six, which is what both Enterprise Computing papers print, and no
      // `correctAnswers`: nothing has been ticked yet, and that is a state the
      // form can say rather than a gap it has to fill.
      return {
        choices: [
          { text: '' },
          { text: '' },
          { text: '' },
          { text: '' },
          { text: '' },
          { text: '' },
        ],
        shuffle: true,
      }
    case 'matching':
      return {
        items: [{ text: '' }, { text: '' }, { text: '' }, { text: '' }],
        options: [{ text: '' }, { text: '' }, { text: '' }, { text: '' }],
        shuffle: true,
      }
    case 'true_false':
      return { correctAnswer: true }
    case 'table':
      return { columns: ['', ''], rows: [{ label: '', cells: [], marks: 1 }] }
    case 'drawing':
      return { subtype: 'sketch', spaceMm: [160, 90] }
    default:
      return {}
  }
}

/**
 * Change type, keeping only what the new type can hold.
 *
 * Short answer and extended response are the same shape, so parts and lines
 * survive between them. Everything else starts again, because leaving four
 * multiple choice options on a table question would write config the schema
 * rejects and show a preview of a question nobody is writing.
 *
 * Marks follow the same rule as the id: a number the teacher typed is theirs
 * and survives, but the default of the type they just left is not an opinion
 * worth carrying. Otherwise every new multiple choice question starts life
 * worth four marks, because short answer is the type the form opens on.
 */
function retype(draft: Question, type: QuestionType, marksTouched: boolean): Question {
  const written = holdsParts
  const marks = marksTouched ? draft.marks : defaultMarks(type)
  if (written(draft.questionType) && written(type)) {
    return { ...draft, questionType: type, marks }
  }
  return { ...draft, questionType: type, marks, config: defaultConfig(type) }
}

/** Only these two types have parts, which is what `retype` keeps config for. */
function holdsParts(type: QuestionType): boolean {
  return type === 'short_answer' || type === 'extended_response'
}

/** The folder images go in, beside the bank that references them. */
function imageDirectoryFor(bankPath: string): string {
  const parts = bankPath.split('/').slice(0, -1)
  return [...parts, IMAGE_SUBDIR].join('/')
}

function splitList(value: string): string[] {
  return value
    .split(',')
    .map((v) => v.trim())
    .filter(Boolean)
}

function splitAlternatives(value: string): string[] {
  return value
    .split('/')
    .map((v) => v.trim())
    .filter(Boolean)
}
