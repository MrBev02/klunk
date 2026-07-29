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
  type ResolvedPaper,
} from './paper'
import { QuestionDetail, shortType } from './question'
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
  const [target, setTarget] = useState(0)

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
            ← Back to building
          </button>
          <span class="muted">
            {preview === 'paper' ? 'Student paper' : 'Marking guide'}
            {errors.length > 0 && ` · ${errors.length} unresolved problem${errors.length === 1 ? '' : 's'}`}
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

  const targetSpec = profile?.paper.sections.find(
    (s) => s.id === paper.sections[target]?.profileSectionId,
  )
  const alreadyUsed = new Set(paper.sections.flatMap((s) => s.refs.map(refKey)))
  const pickable = allQuestions(index).filter(
    (a) =>
      isTypeAllowed(a.question.questionType, targetSpec) &&
      !alreadyUsed.has(`${a.file}#${a.question.id}`),
  )

  return (
    <div class="split split--build">
      <main>
        <section class="panel">
          <p class="panel__title">Paper</p>
          <input
            class="input"
            style={{ fontSize: '1.05rem', fontWeight: 600, marginBottom: '0.5rem' }}
            value={paper.title}
            onInput={(e) => setPaper({ ...paper, title: (e.target as HTMLInputElement).value })}
          />
          <p class="muted" style={{ fontSize: '0.86rem' }}>
            {profile ? profile.name : 'No profile: structure cannot be checked'} ·{' '}
            <span class="mono">papers/{paper.id}.json</span>
          </p>
          <div class="rowbtns" style={{ marginTop: '0.8rem' }}>
            <button class="btn btn--primary" disabled={saving} onClick={() => void save()}>
              {saving ? 'Saving…' : 'Save'}
            </button>
            <button class="btn" onClick={() => setPreview('paper')}>
              Preview paper
            </button>
            <button class="btn" onClick={() => setPreview('guide')}>
              Preview marking guide
            </button>
            <button class="btn btn--small" onClick={() => setPaper(null)}>
              Close
            </button>
          </div>
          {saved && (
            <p class="muted" style={{ marginTop: '0.5rem', fontSize: '0.85rem' }}>
              {saved}
            </p>
          )}
        </section>

        <Checks checks={checks} />

        {paper.sections.map((section, si) => {
          const spec = profile?.paper.sections.find((s) => s.id === section.profileSectionId)
          const rs = resolved.sections[si]
          const got = rs?.marks ?? 0
          const want = spec?.marks

          return (
            <section class={`sec ${si === target ? 'sec--target' : ''}`} key={si}>
              <header class="sec__head">
                <h3 class="sec__name">{rs?.title ?? `Section ${si + 1}`}</h3>
                <span class="sec__rule">
                  {countRule(spec, section.refs.length)}
                  {' · '}
                  <strong style={{ color: want !== undefined && got !== want ? 'var(--red)' : 'inherit' }}>
                    {got}
                    {want !== undefined ? `/${want}` : ''} marks
                  </strong>
                </span>
              </header>

              {section.refs.length === 0 ? (
                <p class="sec__empty">
                  Nothing yet.{' '}
                  {si !== target && (
                    <button class="btn btn--small" onClick={() => setTarget(si)}>
                      Add to this section
                    </button>
                  )}
                </p>
              ) : (
                <ol class="picked">
                  {section.refs.map((ref, ri) => {
                    const rq = rs?.questions.find(
                      (q) => `${q.file}#${q.question.id}` === refKey(ref),
                    )
                    return (
                      <li key={refKey(ref)}>
                        <span class="picked__n">{rq?.number ?? '—'}</span>
                        <span class="picked__marks">{rq ? `${rq.marks}m` : '?'}</span>
                        <span class="picked__text">
                          {rq?.question.questionText ?? (
                            <em class="missing">missing: {refKey(ref)}</em>
                          )}
                        </span>
                        <span class="picked__btns">
                          <button
                            class="btn btn--icon"
                            title="Move up"
                            onClick={() => setPaper(moveRef(paper, si, ri, -1))}
                          >
                            ↑
                          </button>
                          <button
                            class="btn btn--icon"
                            title="Move down"
                            onClick={() => setPaper(moveRef(paper, si, ri, 1))}
                          >
                            ↓
                          </button>
                          <button
                            class="btn btn--icon"
                            title="Remove from paper"
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

              {si !== target && section.refs.length > 0 && (
                <p class="sec__empty">
                  <button class="btn btn--small" onClick={() => setTarget(si)}>
                    Add to this section
                  </button>
                </p>
              )}
            </section>
          )
        })}
      </main>

      <BankRail
        options={pickable}
        targetName={resolved.sections[target]?.title ?? `Section ${target + 1}`}
        spec={targetSpec ? describeSpec(targetSpec) : ''}
        onAdd={(file, id) => setPaper(addRef(paper, target, `${file}#${id}`))}
      />
    </div>
  )
}

function BankRail({
  options,
  targetName,
  spec,
  onAdd,
}: {
  options: ReturnType<typeof allQuestions>
  targetName: string
  spec: string
  onAdd: (file: string, id: string) => void
}) {
  const [text, setText] = useState('')
  const [open, setOpen] = useState<string | null>(null)

  const shown = useMemo(() => {
    const needle = text.trim().toLowerCase()
    if (!needle) return options
    return options.filter((o) => o.question.questionText.toLowerCase().includes(needle))
  }, [options, text])

  return (
    <aside class="bank">
      <div class="bank__head">
        <span class="rail__label">Adding to</span>
        <p style={{ margin: '0 0 0.5rem', fontWeight: 600 }}>{targetName}</p>
        {spec && (
          <p class="muted" style={{ margin: '0 0 0.5rem', fontSize: '0.78rem' }}>
            {spec}
          </p>
        )}
        <input
          class="input"
          type="search"
          placeholder="Search the bank…"
          value={text}
          onInput={(e) => setText((e.target as HTMLInputElement).value)}
        />
      </div>

      {shown.length === 0 ? (
        <p class="bank__empty">
          {options.length === 0
            ? 'Every question of the right type is already on this paper.'
            : 'Nothing matches that search.'}
        </p>
      ) : (
        <ul class="bank__list">
          {shown.map((o) => {
            const key = `${o.file}#${o.question.id}`
            return (
              <li key={key}>
                <span class="bank__marks">{o.question.marks}m</span>
                <span
                  class="bank__stem"
                  title="Click to see the whole question"
                  onClick={() => setOpen(open === key ? null : key)}
                  style={{ cursor: 'pointer' }}
                >
                  <span class="chip chip--type" style={{ marginRight: '0.3rem' }}>
                    {shortType(o.question)}
                  </span>
                  {o.question.questionText}
                </span>
                <button
                  class="btn btn--icon"
                  title={`Add to ${targetName}`}
                  onClick={() => onAdd(o.file, o.question.id)}
                >
                  +
                </button>
                {open === key && (
                  <div style={{ gridColumn: '1 / -1', padding: '0.5rem 0 0.7rem' }}>
                    <QuestionDetail question={o.question} />
                  </div>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </aside>
  )
}

function Checks({ checks }: { checks: Check[] }) {
  if (checks.length === 0) {
    return (
      <section class="panel panel--ok">
        <p class="panel__title">Checks</p>
        <p>Everything matches the profile.</p>
      </section>
    )
  }

  const errors = checks.filter((c) => c.severity === 'error')
  return (
    <section class={`panel ${errors.length ? 'panel--alert' : 'panel--note'}`}>
      <p class="panel__title">
        {errors.length > 0
          ? `${errors.length} problem${errors.length === 1 ? '' : 's'}`
          : 'Worth knowing'}
        {errors.length > 0 && checks.length - errors.length > 0
          ? `, ${checks.length - errors.length} to note`
          : ''}
      </p>
      <ul class="plain">
        {checks.map((c, i) => (
          <li key={i} style={{ marginBottom: '0.2rem' }}>
            <span class="mono" style={{ opacity: 0.7 }}>
              {c.severity === 'error' ? '✕' : '!'}
            </span>{' '}
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
  const slug = useMemo(
    () =>
      title
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '') || 'paper',
    [title],
  )

  if (profiles.length === 0) {
    return (
      <section class="panel panel--alert">
        <p class="panel__title">No profile in this folder</p>
        <p>
          A profile says how a paper is built: how many sections, what each is worth, which
          question types belong where. Copy one into <code>profiles/</code> in your folder,
          then reload.
        </p>
      </section>
    )
  }

  return (
    <div class="split">
      <aside class="rail">
        <section class="panel">
          <p class="panel__title">New paper</p>
          <label class="rail__label" for="np-title">
            Title
          </label>
          <input
            id="np-title"
            class="input"
            value={title}
            onInput={(e) => setTitle((e.target as HTMLInputElement).value)}
            style={{ marginBottom: '0.7rem' }}
          />
          <label class="rail__label" for="np-profile">
            Profile
          </label>
          <select
            id="np-profile"
            class="input"
            value={profileId}
            onChange={(e) => setProfileId((e.target as HTMLSelectElement).value)}
            style={{ marginBottom: '0.7rem' }}
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
              if (profile) onStart(newPaper(profile, slug, title))
            }}
          >
            Create paper
          </button>
          <p class="muted mono" style={{ fontSize: '0.75rem', marginTop: '0.6rem' }}>
            papers/{slug}.json
          </p>
        </section>
      </aside>

      <main>
        {papers.length === 0 ? (
          <section class="hero">
            <h2>No papers yet</h2>
            <p>
              Start one on the left. Klunk fills in the sections your profile expects, then
              you pick questions into them.
            </p>
          </section>
        ) : (
          <>
            <p class="rail__label">Papers in this folder</p>
            <ul class="qlist">
              {papers.map((p, i) => (
                <li
                  class="qrow"
                  key={p.path}
                  style={{ animationDelay: `${Math.min(i, 14) * 18}ms` }}
                >
                  <button class="qrow__head" onClick={() => onStart(p.data)}>
                    <span class="qrow__marks">{p.data.sections.length}§</span>
                    <span class="qrow__stem">
                      {p.data.title}
                      <br />
                      <span class="muted mono" style={{ fontSize: '0.75rem' }}>
                        {p.path}
                      </span>
                    </span>
                    <span class="qrow__tail">
                      {p.data.status === 'used' && <span class="chip chip--flag">already sat</span>}
                      {p.data.status === 'final' && <span class="chip">final</span>}
                      <span class="qrow__caret">›</span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </>
        )}
      </main>
    </div>
  )
}

/* --------------------------------------------------------------------- utils */

function countRule(
  spec: { questionCount?: number; minQuestions?: number; maxQuestions?: number } | undefined,
  actual: number,
): string {
  if (!spec) return `${actual} question${actual === 1 ? '' : 's'}`
  if (spec.questionCount !== undefined) return `${actual}/${spec.questionCount} questions`
  const lo = spec.minQuestions ?? 0
  const hi = spec.maxQuestions
  return `${actual} question${actual === 1 ? '' : 's'} (${lo}${hi ? `-${hi}` : '+'})`
}

function describeSpec(spec: {
  questionTypes?: string[]
  marksPerQuestion?: number
}): string {
  const bits: string[] = []
  if (spec.questionTypes?.length) {
    bits.push(
      spec.questionTypes
        .map((t) => QUESTION_TYPE_LABELS[t as keyof typeof QUESTION_TYPE_LABELS] ?? t)
        .join(', '),
    )
  }
  if (spec.marksPerQuestion !== undefined) bits.push(`${spec.marksPerQuestion} mark each`)
  return bits.join(' · ')
}
