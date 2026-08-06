/**
 * Describing an examination, for a subject Klunk has never heard of.
 *
 * Klunk shipped one profile, for HSC Design and Technology, and told everybody
 * else to copy a JSON file and change the sections to match. That is the same
 * thing the Papers tab used to say about installing a profile at all, in an app
 * whose whole premise is that a teacher never touches a file — left in place
 * for every subject that is not D&T.
 *
 * Nothing here is constrained by the copyright rule. A profile records the
 * shape of a public examination, which is fact rather than anyone's expression
 * of a syllabus, which is why profiles are the one kind of content Klunk ships
 * at all.
 *
 * The form is field-for-field with `schemas/profile.schema.json`, the way the
 * question editor is with `bank.schema.json`, so what a teacher types is what
 * the file holds and a profile that behaves oddly traces back to a box. The one
 * place it does more than the schema is the running total, because a profile
 * whose sections do not add up rejects every paper built against it, and
 * finding that out from the far end is miserable.
 */

import { useMemo, useState } from 'preact/hooks'
import { IdentificationFields } from './coversheet'
import { Field, NumField, patched, type Patch } from './fields'
import { saveProfile, type ContentIndex } from './storage'
import {
  QUESTION_TYPE_LABELS,
  QUESTION_TYPES,
  type Profile,
  type ProfileSection,
  type QuestionType,
} from './types'
import { cleanProfile, validateProfile } from './validate'

/** A profile being edited, or null for one being written from scratch. */
export type EditingProfile = { profile: Profile; path: string } | null

export function ProfileEditor({
  index,
  folder,
  editing,
  onCancel,
  onSaved,
}: {
  index: ContentIndex
  folder: FileSystemDirectoryHandle
  editing: EditingProfile
  onCancel: () => void
  onSaved: (message: string) => void
}) {
  const [draft, setDraft] = useState<Profile>(() => editing?.profile ?? blankProfile())
  const [saving, setSaving] = useState(false)
  const [failed, setFailed] = useState('')
  /** Whether the teacher has taken the id over, after which it stops following the name. */
  const [idPinned, setIdPinned] = useState(editing !== null)

  const originalId = editing?.profile.id

  // Every other profile's id. The one being edited is allowed to keep its own.
  const takenIds = useMemo(
    () => new Set(index.profiles.map((p) => p.data.id).filter((id) => id !== originalId)),
    [index.profiles, originalId],
  )

  const models = useMemo(() => index.syllabuses.map((s) => s.data), [index.syllabuses])
  /** The courses of the syllabus chosen above, which is all a course can be picked from. */
  const courses = models.find((m) => m.id === draft.syllabusId)?.courses ?? []

  const cleaned = useMemo(() => cleanProfile(draft), [draft])
  const faults = useMemo(
    () => validateProfile(cleaned, takenIds, models),
    [cleaned, takenIds, models],
  )
  const errors = faults.filter((f) => f.severity === 'error')

  const set = (patch: Patch<Profile>) => setDraft((d) => patched(d, patch))
  const setPaper = (patch: Patch<Profile['paper']>) =>
    setDraft((d) => ({ ...d, paper: patched(d.paper, patch) }))
  const setCover = (patch: Patch<NonNullable<Profile['paper']['cover']>>) =>
    setDraft((d) => {
      const cover = patched(d.paper.cover ?? {}, patch)
      // Dropped once nothing is left in it, so a profile that overrides nothing
      // does not carry an empty `cover: {}` saying so.
      return { ...d, paper: patched(d.paper, { cover: Object.keys(cover).length ? cover : undefined }) }
    })
  /** Whether this profile says anything about identification, rather than deferring. */
  const overriding = draft.paper.cover?.identification !== undefined
  const setSection = (i: number, patch: Patch<ProfileSection>) =>
    setPaperSections((sections) => sections.map((s, j) => (i === j ? patched(s, patch) : s)))
  const setPaperSections = (fn: (s: ProfileSection[]) => ProfileSection[]) =>
    setDraft((d) => ({ ...d, paper: { ...d.paper, sections: fn(d.paper.sections) } }))

  const rename = (name: string) => {
    // The id follows the name until a teacher touches it, because an id is a
    // filename and nobody wants to invent one. Once they have chosen, it is
    // theirs: renaming the paper afterwards must not silently move the file.
    if (idPinned) set({ name })
    else set({ name, id: slugify(name) })
  }

  const sectionTotal = draft.paper.sections.reduce((t, s) => t + (s.marks || 0), 0)

  const save = async () => {
    setSaving(true)
    setFailed('')
    try {
      const { path } = await saveProfile(folder, cleaned, { replacingId: originalId })
      const moved =
        originalId !== undefined && originalId !== cleaned.id
          ? ` The old profiles/${originalId}.json is still there; delete it when nothing points at it.`
          : ''
      onSaved(`Saved ${path}.${moved}`)
    } catch (err) {
      setFailed((err as Error).message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div class="editor">
      <div class="editor__head">
        <p class="panel__title">
          {editing ? `Editing ${editing.profile.name}` : 'A new paper structure'}
        </p>
        <div class="rowbtns">
          <button class="btn" onClick={onCancel}>
            Cancel
          </button>
          <button
            class="btn btn--primary"
            disabled={saving || errors.length > 0}
            onClick={() => void save()}
          >
            {saving ? 'Saving…' : editing ? 'Save changes' : 'Create profile'}
          </button>
        </div>
      </div>

      {!editing && (
        <p class="hint">
          A profile is the shape of the exam you are building towards: how many sections,
             what each is worth, which kinds of question belong where. Klunk checks every paper
             against it, and it tells the AI prompt where a question sits on the real paper.
        </p>
      )}

      <section class="panel">
        <p class="panel__title">The paper</p>

        <div class="fieldrow">
          <Field label="Name" for="pe-name" hint="As you would say it out loud">
            <input
              id="pe-name"
              class="input"
              value={draft.name}
              placeholder="NSW HSC English Advanced Paper 1"
              onInput={(e) => rename((e.target as HTMLInputElement).value)}
            />
          </Field>

          <Field label="Id" for="pe-id" hint={`Saved as profiles/${draft.id || '…'}.json`}>
            <input
              id="pe-id"
              class="input mono"
              value={draft.id}
              placeholder="nsw-hsc-english-advanced-1"
              onInput={(e) => {
                setIdPinned(true)
                set({ id: (e.target as HTMLInputElement).value })
              }}
            />
          </Field>

          <Field
            label="Syllabus"
            for="pe-syllabus"
            hint="Which model this paper assesses, if one is in the folder"
          >
            <select
              id="pe-syllabus"
              class="input"
              value={draft.syllabusId ?? ''}
              onChange={(e) =>
                // The course goes with it. A course id belongs to one model, so
                // one left over from the previous choice would name nothing in
                // the new one, and the form would carry an error the teacher
                // never typed.
                set({ syllabusId: (e.target as HTMLSelectElement).value, courseId: '' })
              }
            >
              <option value="">Not linked to one</option>
              {models.map((data) => (
                <option key={data.id} value={data.id}>
                  {data.name}
                </option>
              ))}
            </select>
          </Field>

          {/* Only where there is a choice to make. A syllabus with one course is
              fully named by naming the subject, and a folder with no model at
              all has nothing to offer, so in both cases the control would be a
              question with one answer. */}
          {courses.length > 1 && (
            <Field
              label="Course"
              for="pe-course"
              hint="Which year or level this paper is for"
            >
              <select
                id="pe-course"
                class="input"
                value={draft.courseId ?? ''}
                onChange={(e) => set({ courseId: (e.target as HTMLSelectElement).value })}
              >
                <option value="">Every course in it</option>
                {courses.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </Field>
          )}
        </div>

        <div class="fieldrow">
          <Field label="Total marks" for="pe-marks">
            <NumField
              id="pe-marks"
              value={draft.paper.totalMarks}
              min={1}
              onChange={(n) => setPaper({ totalMarks: n ?? 0 })}
            />
          </Field>

          <Field label="Reading time" for="pe-reading" hint="Minutes">
            <NumField
              id="pe-reading"
              value={draft.paper.readingMinutes}
              min={0}
              onChange={(n) => setPaper({ readingMinutes: n })}
            />
          </Field>

          <Field label="Working time" for="pe-working" hint="Minutes">
            <NumField
              id="pe-working"
              value={draft.paper.workingMinutes}
              min={0}
              onChange={(n) => setPaper({ workingMinutes: n })}
            />
          </Field>

          <Field
            label="Ruled lines per mark"
            for="pe-lines"
            hint="How much room an answer gets when the question does not say"
          >
            <NumField
              id="pe-lines"
              value={draft.print?.linesPerMark}
              min={0}
              step={0.5}
              placeholder="2"
              onChange={(n) => set({ print: patched(draft.print ?? {}, { linesPerMark: n }) })}
            />
          </Field>
        </div>

        <Field
          label="Instructions on the cover"
          for="pe-instructions"
          hint="One per line. Reading and working time print on their own, so they do not need a line here."
        >
          <textarea
            id="pe-instructions"
            class="input"
            rows={3}
            value={(draft.paper.instructions ?? []).join('\n')}
            placeholder={'Write using black pen\nDraw diagrams using pencil'}
            onInput={(e) =>
              setPaper({
                instructions: (e.target as HTMLTextAreaElement).value.split('\n'),
              })
            }
          />
        </Field>

        <label class="checkline">
          <input
            type="checkbox"
            checked={draft.paper.cover?.marksAwardedColumn ?? false}
            onChange={(e) =>
              setCover({
                marksAwardedColumn: (e.target as HTMLInputElement).checked || undefined,
              })
            }
          />
          <span>
            Give the marks breakdown a Marks awarded column for the marker to fill in
          </span>
        </label>
      </section>

      {/* The one thing an external-style trial and an internal exam genuinely
          differ on beyond the checkbox above. Left alone, the folder's cover
          sheet decides for every paper, which is right until one of them is a
          trial that has to look like the real thing. */}
      {overriding ? (
        <>
          <IdentificationFields
            fields={draft.paper.cover?.identification ?? []}
            setFields={(fn) => setCover({ identification: fn(draft.paper.cover?.identification ?? []) })}
            hint="This replaces what your cover sheet asks for, on papers built to this structure only."
          />
          <button
            class="btn btn--small"
            onClick={() => setCover({ identification: undefined })}
          >
            Go back to the folder's cover sheet
          </button>
        </>
      ) : (
        <section class="panel">
          <p class="panel__title">What a student fills in</p>
          <p class="hint">
            Papers built to this structure ask for whatever your cover sheet asks for. Change that
            here if this kind of paper is different, such as a trial that prints a student number
            grid where your other exams print a name and a class.
          </p>
          <button
            class="btn"
            onClick={() => setCover({ identification: [{ label: '', kind: 'write' }] })}
          >
            Ask for something different on this paper
          </button>
        </section>
      )}

      <section class="panel">
        <div class="panel__head">
          <p class="panel__title">Sections</p>
          {/* The running total is the one thing here the schema cannot say, and
              the one most likely to be wrong. A profile whose sections do not
              add up rejects every paper built against it. */}
          <span class={sectionTotal === draft.paper.totalMarks ? 'muted' : 'setup__problem'}>
            {sectionTotal} of {draft.paper.totalMarks} marks
          </span>
        </div>

        {draft.paper.sections.length === 0 && (
          <p class="hint">A paper needs at least one section. Most have two or three.</p>
        )}

        {draft.paper.sections.map((section, i) => (
          <SectionFields
            key={i}
            section={section}
            index={i}
            count={draft.paper.sections.length}
            onChange={(patch) => setSection(i, patch)}
            onRemove={() => setPaperSections((s) => s.filter((_, j) => j !== i))}
            onMove={(by) => setPaperSections((s) => moved(s, i, by))}
          />
        ))}

        <button
          class="btn"
          onClick={() =>
            setPaperSections((s) => [...s, blankSection(s.length)])
          }
        >
          Add a section
        </button>
      </section>

      {failed && (
        <section class="panel panel--alert">
          <p class="panel__title">Could not save</p>
          <p>{failed}</p>
        </section>
      )}

      {faults.length > 0 && (
        <section class={`panel ${errors.length > 0 ? 'panel--alert' : 'panel--note'}`}>
          <p class="panel__title">
            {errors.length > 0
              ? `${errors.length} thing${errors.length === 1 ? '' : 's'} to fix`
              : 'Worth a look'}
          </p>
          <ul class="plain">
            {faults.map((f, i) => (
              <li key={i}>
                {f.where && <strong>{f.where}: </strong>}
                {f.message}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}

function SectionFields({
  section,
  index,
  count,
  onChange,
  onRemove,
  onMove,
}: {
  section: ProfileSection
  index: number
  count: number
  onChange: (patch: Patch<ProfileSection>) => void
  onRemove: () => void
  onMove: (by: number) => void
}) {
  // Which of the two ways of saying how many questions this section takes. The
  // schema permits both at once and they contradict each other, so the form
  // offers a choice rather than two boxes that can disagree.
  const ranged = section.minQuestions !== undefined || section.maxQuestions !== undefined

  return (
    <div class="editor__sub">
      <div class="panel__head">
        <strong>{section.name || `Section ${index + 1}`}</strong>
        <div class="rowbtns">
          <button
            class="btn btn--small"
            disabled={index === 0}
            title="Move up"
            onClick={() => onMove(-1)}
          >
            ↑
          </button>
          <button
            class="btn btn--small"
            disabled={index === count - 1}
            title="Move down"
            onClick={() => onMove(1)}
          >
            ↓
          </button>
          <button class="btn btn--small" onClick={onRemove}>
            Remove
          </button>
        </div>
      </div>

      <div class="fieldrow">
        <Field label="Name">
          <input
            class="input"
            value={section.name}
            placeholder="Section I"
            onInput={(e) => onChange({ name: (e.target as HTMLInputElement).value })}
          />
        </Field>

        <Field label="Id" hint="Papers record which section a question filled">
          <input
            class="input mono"
            value={section.id}
            placeholder="I"
            onInput={(e) => onChange({ id: (e.target as HTMLInputElement).value })}
          />
        </Field>

        <Field label="Marks">
          <NumField
            value={section.marks}
            min={1}
            onChange={(n) => onChange({ marks: n ?? 0 })}
          />
        </Field>

        <Field label="Suggested time" hint="Minutes, optional">
          <NumField
            value={section.suggestedMinutes}
            min={0}
            onChange={(n) => onChange({ suggestedMinutes: n })}
          />
        </Field>
      </div>

      <Field label="How many questions">
        <div class="rowbtns">
          <label class="checkline">
            <input
              type="radio"
              checked={!ranged}
              onChange={() => onChange({ minQuestions: undefined, maxQuestions: undefined })}
            />
            <span>Always the same number</span>
          </label>
          <label class="checkline">
            <input
              type="radio"
              checked={ranged}
              onChange={() =>
                onChange({
                  questionCount: undefined,
                  minQuestions: section.questionCount ?? 1,
                  maxQuestions: section.questionCount ?? 1,
                })
              }
            />
            <span>It varies</span>
          </label>
        </div>
      </Field>

      <div class="fieldrow">
        {ranged ? (
          <>
            <Field label="Fewest">
              <NumField
                value={section.minQuestions}
                min={1}
                onChange={(n) => onChange({ minQuestions: n })}
              />
            </Field>
            <Field label="Most">
              <NumField
                value={section.maxQuestions}
                min={1}
                onChange={(n) => onChange({ maxQuestions: n })}
              />
            </Field>
          </>
        ) : (
          <Field label="Questions">
            <NumField
              value={section.questionCount}
              min={1}
              onChange={(n) => onChange({ questionCount: n })}
            />
          </Field>
        )}

        <Field
          label="Marks each"
          hint="Only where every question is worth the same"
        >
          <NumField
            value={section.marksPerQuestion}
            min={0}
            step={0.5}
            onChange={(n) => onChange({ marksPerQuestion: n })}
          />
        </Field>
      </div>

      {/* A section of alternatives. Ordinary in most subjects and absent from
          Design and Technology, which is why it took until a Visual Arts trial
          to come up. */}
      <Field label="Do students answer all of these?">
        <div class="rowbtns">
          <label class="checkline">
            <input
              type="radio"
              checked={section.chooseCount === undefined}
              onChange={() => onChange({ chooseCount: undefined })}
            />
            <span>Yes, every question</span>
          </label>
          <label class="checkline">
            <input
              type="radio"
              checked={section.chooseCount !== undefined}
              onChange={() => onChange({ chooseCount: 1 })}
            />
            <span>No, they choose from them</span>
          </label>
        </div>
      </Field>

      {section.chooseCount !== undefined && (
        <Field
          label="How many they answer"
          hint="Every question here has to be worth the same, because a student picks one and the marks cannot depend on which."
        >
          <NumField
            value={section.chooseCount}
            min={1}
            onChange={(n) => onChange({ chooseCount: n })}
          />
        </Field>
      )}

      <Field label="Kinds of question that belong here">
        <div class="tagrow">
          {QUESTION_TYPES.map((type) => {
            const on = (section.questionTypes ?? []).includes(type)
            return (
              <label key={type} class="checkline">
                <input
                  type="checkbox"
                  checked={on}
                  onChange={() => onChange({ questionTypes: toggled(section.questionTypes, type) })}
                />
                <span>{QUESTION_TYPE_LABELS[type]}</span>
              </label>
            )
          })}
        </div>
      </Field>

      <Field label="Instructions for this section" hint="Optional, printed under the heading">
        <input
          class="input"
          value={section.instructions ?? ''}
          placeholder="Attempt Questions 11–14. Allow about 1 hour for this section."
          onInput={(e) => onChange({ instructions: (e.target as HTMLInputElement).value })}
        />
      </Field>
    </div>
  )
}

/* ------------------------------------------------------------------- helpers */

function blankProfile(): Profile {
  return {
    formatVersion: '1',
    type: 'klunk_profile',
    id: '',
    name: '',
    paper: { totalMarks: 100, sections: [blankSection(0)] },
  }
}

/** Roman numerals because that is what examinations print, for the first few at least. */
const SECTION_NAMES = ['Section I', 'Section II', 'Section III', 'Section IV', 'Section V']
const SECTION_IDS = ['I', 'II', 'III', 'IV', 'V']

function blankSection(i: number): ProfileSection {
  return {
    id: SECTION_IDS[i] ?? String(i + 1),
    name: SECTION_NAMES[i] ?? `Section ${i + 1}`,
    marks: 0,
  }
}

function toggled(list: QuestionType[] | undefined, type: QuestionType): QuestionType[] {
  const now = list ?? []
  return now.includes(type) ? now.filter((t) => t !== type) : [...now, type]
}

function moved<T>(list: T[], from: number, by: number): T[] {
  const to = from + by
  if (to < 0 || to >= list.length) return list
  const out = [...list]
  const [item] = out.splice(from, 1)
  if (item !== undefined) out.splice(to, 0, item)
  return out
}

/** A name to a filename, matching the id shape the schema requires. */
export function slugify(name: string): string {
  return (
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '') || ''
  )
}
