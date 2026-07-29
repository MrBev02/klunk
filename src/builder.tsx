import { useMemo, useState } from 'preact/hooks'
import {
  addRef,
  checkPaper,
  isTypeAllowed,
  moveRef,
  newPaper,
  removeRef,
  resolvePaper,
  type Check,
} from './paper'
import { PrintablePaper, type PrintMode } from './render'
import { allQuestions, writeJson, type ContentIndex } from './storage'
import { QUESTION_TYPE_LABELS, refKey, type Paper, type Profile } from './types'

export function Builder({
  index,
  folder,
  paper,
  setPaper,
  onSaved,
}: {
  index: ContentIndex
  folder: FileSystemDirectoryHandle
  paper: Paper | null
  setPaper: (p: Paper | null) => void
  onSaved: () => void
}) {
  const profiles = index.profiles.map((p) => p.data)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState('')
  const [preview, setPreview] = useState<PrintMode | null>(null)

  if (!paper) {
    return <StartPaper profiles={profiles} papers={index.papers} onStart={setPaper} />
  }

  const profile = profiles.find((p) => p.id === paper.profileId)
  const resolved = resolvePaper(index, paper, profile)
  const checks = checkPaper(resolved)
  const errors = checks.filter((c) => c.severity === 'error')

  const save = async () => {
    setSaving(true)
    setSaved('')
    try {
      const path = `papers/${paper.id}.json`
      await writeJson(folder, path, paper)
      setSaved(`Saved to ${path}`)
      onSaved()
    } catch (err) {
      setSaved(`Could not save: ${(err as Error).message}`)
    } finally {
      setSaving(false)
    }
  }

  if (preview) {
    return (
      <div class="preview">
        <div class="preview__bar">
          <button class="btn" onClick={() => setPreview(null)}>
            Back to building
          </button>
          <span class="muted">
            {preview === 'paper' ? 'Student paper' : 'Marking guide'}
            {errors.length > 0 && ` · ${errors.length} problem(s) unresolved`}
          </span>
          <div class="preview__actions">
            <button
              class="btn"
              onClick={() => setPreview(preview === 'paper' ? 'guide' : 'paper')}
            >
              Show {preview === 'paper' ? 'marking guide' : 'student paper'}
            </button>
            <button class="btn btn--primary" onClick={() => window.print()}>
              Print / Save as PDF
            </button>
          </div>
        </div>
        <PrintablePaper resolved={resolved} mode={preview} />
      </div>
    )
  }

  const available = allQuestions(index)

  return (
    <>
      <section class="card">
        <h2>Paper</h2>
        <div class="paperhead">
          <input
            class="input input--title"
            value={paper.title}
            onInput={(e) =>
              setPaper({ ...paper, title: (e.target as HTMLInputElement).value })
            }
          />
          <span class={`chip ${errors.length ? 'chip--warn' : 'chip--marks'}`}>
            {resolved.totalMarks}
            {profile ? ` / ${profile.paper.totalMarks}` : ''} marks
          </span>
        </div>
        <p class="muted">
          {profile ? profile.name : 'No profile: structure cannot be checked'}
        </p>
        <div class="rowbtns">
          <button class="btn" disabled={saving} onClick={() => void save()}>
            {saving ? 'Saving…' : 'Save'}
          </button>
          <button class="btn" onClick={() => setPreview('paper')}>
            Preview paper
          </button>
          <button class="btn" onClick={() => setPreview('guide')}>
            Preview marking guide
          </button>
          <button class="btn btn--quiet" onClick={() => setPaper(null)}>
            Close
          </button>
        </div>
        {saved && <p class="muted">{saved}</p>}
      </section>

      <Checks checks={checks} />

      {paper.sections.map((section, si) => {
        const spec = profile?.paper.sections.find((s) => s.id === section.profileSectionId)
        const resolvedSection = resolved.sections[si]
        const pickable = available.filter(
          (a) =>
            isTypeAllowed(a.question.questionType, spec) &&
            !section.refs.some((r) => refKey(r) === `${a.file}#${a.question.id}`),
        )

        return (
          <section class="card" key={si}>
            <h2>
              {resolvedSection?.title ?? `Section ${si + 1}`}
              {' · '}
              {resolvedSection?.marks ?? 0}
              {spec ? ` / ${spec.marks}` : ''} marks
            </h2>

            {spec && (
              <p class="muted">
                {spec.questionCount !== undefined
                  ? `Exactly ${spec.questionCount} questions`
                  : `${spec.minQuestions ?? 0}-${spec.maxQuestions ?? '?'} questions`}
                {spec.questionTypes?.length
                  ? ` · ${spec.questionTypes.map((t) => QUESTION_TYPE_LABELS[t]).join(', ')}`
                  : ''}
              </p>
            )}

            {section.refs.length === 0 ? (
              <p class="muted">Nothing here yet.</p>
            ) : (
              <ol class="picked">
                {section.refs.map((ref, ri) => {
                  const rq = resolvedSection?.questions.find(
                    (q) => `${q.file}#${q.question.id}` === refKey(ref),
                  )
                  return (
                    <li key={refKey(ref)}>
                      <span class="picked__marks">{rq ? `${rq.marks}m` : '?'}</span>
                      <span class="picked__text">
                        {rq?.question.questionText ?? (
                          <em class="missing">missing: {refKey(ref)}</em>
                        )}
                      </span>
                      <span class="picked__btns">
                        <button
                          class="btn btn--quiet"
                          title="Move up"
                          onClick={() => setPaper(moveRef(paper, si, ri, -1))}
                        >
                          ↑
                        </button>
                        <button
                          class="btn btn--quiet"
                          title="Move down"
                          onClick={() => setPaper(moveRef(paper, si, ri, 1))}
                        >
                          ↓
                        </button>
                        <button
                          class="btn btn--quiet"
                          title="Remove"
                          onClick={() => setPaper(removeRef(paper, si, ri))}
                        >
                          ✕
                        </button>
                      </span>
                    </li>
                  )
                })}
              </ol>
            )}

            <AddQuestion
              options={pickable}
              onAdd={(file, id) => setPaper(addRef(paper, si, `${file}#${id}`))}
            />
          </section>
        )
      })}
    </>
  )
}

function AddQuestion({
  options,
  onAdd,
}: {
  options: ReturnType<typeof allQuestions>
  onAdd: (file: string, id: string) => void
}) {
  const [value, setValue] = useState('')

  if (options.length === 0) {
    return <p class="muted">No more questions of the right type are available.</p>
  }

  return (
    <div class="addrow">
      <select
        class="input"
        value={value}
        onChange={(e) => setValue((e.target as HTMLSelectElement).value)}
      >
        <option value="">Add a question…</option>
        {options.map((o) => (
          <option key={`${o.file}#${o.question.id}`} value={`${o.file}#${o.question.id}`}>
            [{o.question.marks}m] {o.question.questionText.slice(0, 70)}
          </option>
        ))}
      </select>
      <button
        class="btn"
        disabled={!value}
        onClick={() => {
          const hash = value.lastIndexOf('#')
          if (hash > 0) onAdd(value.slice(0, hash), value.slice(hash + 1))
          setValue('')
        }}
      >
        Add
      </button>
    </div>
  )
}

function Checks({ checks }: { checks: Check[] }) {
  if (checks.length === 0) {
    return (
      <section class="card card--ok">
        <h2>Checks</h2>
        <p>Everything matches the profile.</p>
      </section>
    )
  }

  const errors = checks.filter((c) => c.severity === 'error')
  return (
    <section class={`card ${errors.length ? 'card--warn' : 'card--note'}`}>
      <h2>
        {errors.length} problem{errors.length === 1 ? '' : 's'}
        {checks.length - errors.length > 0 && `, ${checks.length - errors.length} to note`}
      </h2>
      <ul class="plain">
        {checks.map((c, i) => (
          <li key={i}>
            <strong>{c.severity === 'error' ? '✕' : '!'}</strong>{' '}
            {c.where && <span class="muted">{c.where}: </span>}
            {c.message}
          </li>
        ))}
      </ul>
    </section>
  )
}

function StartPaper({
  profiles,
  papers,
  onStart,
}: {
  profiles: Profile[]
  papers: ContentIndex['papers']
  onStart: (p: Paper) => void
}) {
  const [profileId, setProfileId] = useState(profiles[0]?.id ?? '')
  const [title, setTitle] = useState('Trial HSC Examination')
  const suggestedId = useMemo(
    () =>
      title
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '') || 'paper',
    [title],
  )

  if (profiles.length === 0) {
    return (
      <section class="card card--warn">
        <h2>No profile in this folder</h2>
        <p>
          A profile says how a paper is structured: how many sections, what each is worth.
          Copy one into your folder, for example <code>profiles/</code> from the Klunk
          repository, then reload.
        </p>
      </section>
    )
  }

  return (
    <>
      {papers.length > 0 && (
        <section class="card">
          <h2>Open an existing paper</h2>
          <ul class="plain">
            {papers.map((p) => (
              <li key={p.path}>
                <button class="btn btn--quiet" onClick={() => onStart(p.data)}>
                  {p.data.title}
                </button>{' '}
                <span class="muted">
                  <code>{p.path}</code>
                  {p.data.status === 'used' && ' · already sat'}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section class="card">
        <h2>Start a new paper</h2>
        <div class="addrow">
          <input
            class="input"
            value={title}
            onInput={(e) => setTitle((e.target as HTMLInputElement).value)}
            placeholder="Paper title"
          />
          <select
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
          <button
            class="btn btn--primary"
            onClick={() => {
              const profile = profiles.find((p) => p.id === profileId)
              if (profile) onStart(newPaper(profile, suggestedId, title))
            }}
          >
            Create
          </button>
        </div>
        <p class="muted">
          Will be saved as <code>papers/{suggestedId}.json</code>
        </p>
      </section>
    </>
  )
}
