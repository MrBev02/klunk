/**
 * Drafting a whole paper with an AI, and reading one back.
 *
 * The same arrangement as `factory.tsx` one level up: Klunk writes the prompt,
 * the teacher takes it to whatever their school licenses, and Klunk reads back
 * what that returned. What differs is the unit. There the unit is a question and
 * the answer goes into a bank; here it is an examination, and the answer becomes
 * new questions in a bank *and* a paper of references to them.
 *
 * Two things are worth not reversing.
 *
 * **Nothing here changes a question that already exists.** Every question read
 * back is new, with an id Klunk assigns, and the paper the teacher sent as an
 * example is untouched. An exported exam is a sample to write from, not a
 * document to edit and put back.
 *
 * **The sample is a positive choice.** It is the teacher's own paper going to
 * somebody else's service, so there is no default and no checkbox — the select
 * starts at "nothing", and whatever is chosen is in the prompt on screen before
 * the copy button is pressed.
 */

import { useMemo, useState } from 'preact/hooks'
import { readExam, examPaper, type ExamContext, type ExamRead } from './exam'
import { buildExamPrompt } from './examprompt'
import { courseChoices } from './factory'
import { bankPathFault, CheckList, CopyButton, Field, normaliseBankPath } from './fields'
import { AI_TAG, type Draft } from './ingest'
import { resolvePaper } from './paper'
import { outcomesFor } from './prompt'
import { QuestionDetail } from './question'
import { questionIds, savePaper, saveQuestion, type ContentIndex } from './storage'
import type { Paper, Profile } from './types'
import { blocksSaving, cleanPaper, cleanQuestion } from './validate'

export function ExamFactory({
  index,
  folder,
  profiles,
  papers,
  onStart,
  onSaved,
}: {
  index: ContentIndex
  folder: FileSystemDirectoryHandle
  profiles: Profile[]
  papers: ContentIndex['papers']
  /** Open the paper that was just written, which is where it gets finished. */
  onStart: (paper: Paper) => void
  /** Something was written to the folder, so it needs rescanning. */
  onSaved: () => void
}) {
  const courses = useMemo(() => courseChoices(index), [index])

  const [profileId, setProfileId] = useState(profiles[0]?.id ?? '')
  const profile = profiles.find((p) => p.id === profileId)

  // Defaulted from the profile, because a profile names the examination and the
  // examination names the course. Changeable, because a profile need not name a
  // syllabus at all (#96) and one that does not would otherwise leave this
  // screen with no ids to offer.
  const fromProfile = profile
    ? courses.find(
        (c) =>
          c.syllabus.id === profile.syllabusId &&
          (profile.courseId === undefined || c.course.id === profile.courseId),
      )
    : undefined
  const [courseKey, setCourseKey] = useState('')
  const chosen = courses.find((c) => c.key === courseKey) ?? fromProfile ?? courses[0]

  const [title, setTitle] = useState('Trial Examination')
  const [samplePath, setSamplePath] = useState('')
  const [extra, setExtra] = useState('')
  const [omitted, setOmitted] = useState<string[]>([])

  const [bank, setBank] = useState<string | null>(() => index.banks[0]?.path ?? null)
  const [newBankPath, setNewBankPath] = useState('bank/questions.json')
  const [pasted, setPasted] = useState('')
  const [read, setRead] = useState<ExamRead | null>(null)
  const [saving, setSaving] = useState(false)
  const [failed, setFailed] = useState('')
  const [open, setOpen] = useState(false)

  const bankPath = bank === null ? normaliseBankPath(newBankPath) : bank
  const pathFault = bank === null ? bankPathFault(newBankPath) : null

  const allTopics = chosen?.course.topics ?? []
  const topics = allTopics.filter((t) => !omitted.includes(t.id))
  const pointIds = topics.flatMap((t) => (t.points ?? []).map((p) => p.id))

  const sample = useMemo(() => {
    const found = papers.find((p) => p.path === samplePath)
    if (!found) return undefined
    const its = index.profiles.find((p) => p.data.id === found.data.profileId)?.data
    return resolvePaper(index, found.data, its)
  }, [index, papers, samplePath])

  const prompt = useMemo(() => {
    if (!chosen) return ''
    return buildExamPrompt({
      syllabus: chosen.syllabus,
      course: chosen.course,
      topics,
      pointIds,
      profile,
      title,
      sample,
      extra,
    })
    // `topics` and `pointIds` are derived from these on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chosen, omitted, profile, title, sample, extra])

  const slug = useMemo(
    () =>
      title
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '') || 'paper',
    [title],
  )
  const taken = papers.find((p) => p.data.id === slug)

  const ingest = () => {
    if (!chosen) return
    const context: ExamContext = {
      bankPath,
      inFolder: questionIds(index),
      inBank: new Set(
        (index.banks.find((b) => b.path === bankPath)?.data.questions ?? []).map((q) => q.id),
      ),
      syllabusId: chosen.syllabus.id,
      courseId: chosen.course.id,
      topicIds: topics.map((t) => t.id),
      points: topics.flatMap((t) => (t.points ?? []).map((p) => ({ id: p.id, topicId: t.id }))),
      outcomes: outcomesFor({ course: chosen.course, topics }).map((o) => o.code),
      profile,
    }
    setFailed('')
    setRead(readExam(pasted, context))
  }

  const all = (read?.sections ?? []).flatMap((s) => s.drafts)
  // Only what a bank file could not hold is held back, exactly as on the
  // question factory (#105): a draft that is merely unfinished is written and
  // says so on the paper.
  const ready = all.filter((d) => !blocksSaving(d.faults))
  const stuck = all.length - ready.length

  const create = async () => {
    if (!read) return
    setSaving(true)
    setFailed('')
    try {
      // The id a draft was actually written under. `saveQuestion` reassigns one
      // that somebody else took while this reply was being read, and a paper
      // built on the id Klunk first chose would point at their question.
      const written = new Map<string, string>()
      for (const draft of ready) {
        const done = await saveQuestion(folder, bankPath, cleanQuestion(draft.question), {
          syllabusId: chosen?.syllabus.id,
        })
        written.set(draft.question.id, done.id)
      }

      const paper = examPaper(read, {
        id: slug,
        title,
        profileId: profile?.id,
        bankPath,
        writtenAs: (q) => written.get(q.id),
      })
      await savePaper(folder, cleanPaper(paper, profile))
      onSaved()
      onStart(paper)
    } catch (err) {
      // Left on screen with the drafts still read. Questions already written are
      // in the bank and stay there; pressing it again writes the rest, since a
      // question already saved under a taken id simply gets another.
      setFailed((err as Error).message)
    } finally {
      setSaving(false)
    }
  }

  if (profiles.length === 0 || courses.length === 0) return null

  return (
    <section class="panel">
      {/* Closed until asked for (#118). This is the occasional route and the
          papers above it are the daily one, and a form for a paper that does
          not exist yet was the first thing on the tab a teacher opens to find
          the paper they were already writing. */}
      <button class="btn btn--quiet" aria-expanded={open} onClick={() => setOpen(!open)}>
        {open ? 'Hide AI drafting' : 'Draft a whole paper with AI'}
      </button>

      {/* Only what closing it would otherwise hide. A reply that has been read
          is unsaved work: the drafts are held in this component and nothing is
          in a bank until step 4. */}
      {!open && read !== null && all.length > 0 && (
        <p class="hint" style={{ marginTop: '0.6rem' }}>
          {all.length} question{all.length === 1 ? '' : 's'} read, not yet written to a bank.
        </p>
      )}

      {/* Hidden rather than unmounted, so opening it again shows what was
          typed, pasted and read. */}
      <div hidden={!open} style={{ marginTop: '0.9rem' }}>
        <p class="panel__title">
          <span class="step">1</span> What to draft
        </p>
        <p class="hint">
          Copy the prompt below into your school's AI, then paste its reply back here. The prompt
          holds your paper structure, your syllabus, and one of your own papers if you send it.
        </p>

        <div class="fieldrow">
          <Field label="Title" for="xf-title">
            <input
              id="xf-title"
              class="input"
              value={title}
              onInput={(e) => setTitle((e.target as HTMLInputElement).value)}
            />
          </Field>

          <Field label="Structure" for="xf-profile">
            <select
              id="xf-profile"
              class="input"
              value={profileId}
              onChange={(e) => setProfileId((e.target as HTMLSelectElement).value)}
            >
              {profiles.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </Field>

          <Field label="Course" for="xf-course">
            <select
              id="xf-course"
              class="input"
              value={chosen?.key ?? ''}
              onChange={(e) => {
                setCourseKey((e.target as HTMLSelectElement).value)
                setOmitted([])
              }}
            >
              {courses.map((c) => (
                <option key={c.key} value={c.key}>
                  {c.label}
                </option>
              ))}
            </select>
          </Field>
        </div>

        <Field
          label="Write it like"
          for="xf-sample"
          hint="A paper of yours, sent whole so the drafts match its pitch and house style"
        >
          <select
            id="xf-sample"
            class="input"
            value={samplePath}
            onChange={(e) => setSamplePath((e.target as HTMLSelectElement).value)}
          >
            <option value="">Send none of my papers</option>
            {papers.map((p) => (
              <option key={p.path} value={p.path}>
                {p.data.title}
              </option>
            ))}
          </select>
        </Field>

        {topics.length !== allTopics.length && (
          <p class="hint">
            {allTopics.length - topics.length} of {allTopics.length} topics left out of the prompt.
          </p>
        )}
        {allTopics.length > 0 && (
          <div class="tagrow">
            {allTopics.map((t) => (
              <button
                key={t.id}
                class={`chip chip--topic ${omitted.includes(t.id) ? 'chip--out' : ''}`}
                title={omitted.includes(t.id) ? 'Put this topic back' : 'Leave this topic out'}
                onClick={() =>
                  setOmitted(
                    omitted.includes(t.id)
                      ? omitted.filter((id) => id !== t.id)
                      : [...omitted, t.id],
                  )
                }
              >
                {t.name}
              </button>
            ))}
          </div>
        )}

        <Field label="Anything else to tell it" for="xf-extra">
          <textarea
            id="xf-extra"
            class="input"
            rows={2}
            value={extra}
            onInput={(e) => setExtra((e.target as HTMLTextAreaElement).value)}
          />
        </Field>

        <p class="panel__title" style={{ marginTop: '1rem' }}>
          <span class="step">2</span> Copy the prompt
          <CopyButton text={prompt} />
        </p>
        <pre class="promptbox">{prompt}</pre>

        <p class="panel__title" style={{ marginTop: '1rem' }}>
          <span class="step">3</span> Paste what it answered
        </p>
        <textarea
          class="input"
          rows={5}
          value={pasted}
          placeholder="Paste the whole reply, code block and all."
          onInput={(e) => setPasted((e.target as HTMLTextAreaElement).value)}
        />
        <div class="rowbtns" style={{ marginTop: '0.5rem' }}>
          <button class="btn" disabled={!pasted.trim()} onClick={ingest}>
            Read the paper
          </button>
          {read && (
            <button
              class="btn"
              onClick={() => {
                setRead(null)
                setPasted('')
              }}
            >
              Clear
            </button>
          )}
        </div>

        {read?.failure && <p class="setup__problem">{read.failure}</p>}
        {(read?.notes ?? []).map((note, i) => (
          <p key={i} class="hint">
            {note}
          </p>
        ))}

        {read && read.sections.length > 0 && (
          <>
            {read.sections.map((section, at) => (
              <div key={at} style={{ marginTop: '1rem' }}>
                <p class="rail__label">
                  {section.name}
                  {section.profileSectionId ? '' : ' · not matched to your profile'} ·{' '}
                  {section.drafts.length} question{section.drafts.length === 1 ? '' : 's'}
                </p>
                {section.rejected.map((r) => (
                  <p key={r.at} class="setup__problem">
                    Entry {r.at + 1} was not a question: {r.why}
                  </p>
                ))}
                <ul class="qlist">
                  {section.drafts.map((d) => (
                    <DraftRow key={d.question.id} draft={d} />
                  ))}
                </ul>
              </div>
            ))}

            <p class="panel__title" style={{ marginTop: '1rem' }}>
              <span class="step">4</span> Write them into a bank
            </p>
            <Field label="Bank" for="xf-bank">
              <select
                id="xf-bank"
                class="input"
                value={bank ?? ''}
                onChange={(e) => {
                  const value = (e.target as HTMLSelectElement).value
                  setBank(value === '' ? null : value)
                }}
              >
                {index.banks.map((b) => (
                  <option key={b.path} value={b.path}>
                    {b.path}
                  </option>
                ))}
                <option value="">A new bank…</option>
              </select>
            </Field>
            {bank === null && (
              <Field label="New bank file" for="xf-newbank">
                <input
                  id="xf-newbank"
                  class="input"
                  value={newBankPath}
                  onInput={(e) => setNewBankPath((e.target as HTMLInputElement).value)}
                />
              </Field>
            )}
            {pathFault && <p class="setup__problem">{pathFault}</p>}

            {stuck > 0 && (
              <p class="setup__problem">
                {stuck} question{stuck === 1 ? '' : 's'} cannot be written to a bank and{' '}
                {stuck === 1 ? 'is' : 'are'} left off the paper. Ask for{' '}
                {stuck === 1 ? 'it' : 'them'} again, or build the paper without{' '}
                {stuck === 1 ? 'it' : 'them'} and add your own.
              </p>
            )}
            {taken && (
              <p class="setup__problem">
                <span class="mono">papers/{slug}.json</span> already holds "{taken.data.title}".
                Give this paper a different title.
              </p>
            )}
            {failed && <p class="setup__problem">{failed}</p>}

            <div class="rowbtns" style={{ marginTop: '0.5rem' }}>
              <button
                class="btn btn--primary"
                disabled={saving || ready.length === 0 || taken !== undefined || pathFault !== null}
                onClick={() => void create()}
              >
                {saving
                  ? 'Writing…'
                  : `Create the paper with ${ready.length} question${ready.length === 1 ? '' : 's'}`}
              </button>
            </div>
          </>
        )}
      </div>
    </section>
  )
}

/** One draft, with whatever Klunk changed or could not accept about it. */
function DraftRow({ draft }: { draft: Draft }) {
  const [open, setOpen] = useState(false)
  const q = draft.question
  return (
    <li class={`qrow ${open ? 'qrow--open' : ''}`}>
      <div class="qrow__line">
        <button class="qrow__head" onClick={() => setOpen(!open)}>
          <span class="qrow__marks">{q.marks}</span>
          <span class="qrow__stem">{q.questionText}</span>
          <span class="qrow__tail">
            {(q.tags ?? []).includes(AI_TAG) && <span class="chip">ai-drafted</span>}
            {draft.faults.length > 0 && <span class="chip chip--flag">{draft.faults.length}</span>}
            <span class="qrow__caret">›</span>
          </span>
        </button>
      </div>
      {open && (
        <div class="qrow__detail">
          {draft.repairs.length > 0 && (
            <ul class="plain">
              {draft.repairs.map((r, i) => (
                <li key={i}>{r}</li>
              ))}
            </ul>
          )}
          {draft.faults.length > 0 && <CheckList checks={draft.faults} />}
          <QuestionDetail question={q} />
        </div>
      )}
    </li>
  )
}
