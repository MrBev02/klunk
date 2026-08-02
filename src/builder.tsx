import { useMemo, useState } from 'preact/hooks'
import {
  addRef,
  checkPaper,
  moveRef,
  newPaper,
  paperIsDirty,
  pickableQuestions,
  removeRef,
  resolvePaper,
  type Check,
  type ResolvedPaper,
} from './paper'
import { QuestionDetail, shortType } from './question'
import { PrintablePaper, type PrintMode } from './render'
import { ProfileInstaller } from './setup'
import { allQuestions, savePaper, type ContentIndex } from './storage'
import {
  QUESTION_TYPE_LABELS,
  questionHaystack,
  questionLabel,
  refKey,
  type Paper,
  type Profile,
} from './types'

/**
 * The three states a paper can be in, worded for a teacher rather than for the
 * schema. Typed against `Paper` so the options cannot drift from the enum the
 * schema validates, and so a value added there shows up here as a type error.
 */
type PaperStatus = NonNullable<Paper['status']>

const PAPER_STATUS: { value: PaperStatus; label: string }[] = [
  { value: 'draft', label: 'Draft, still being built' },
  { value: 'final', label: 'Final, not yet sat' },
  { value: 'used', label: 'Already sat by students' },
]

export function Builder({
  index,
  folder,
  paper,
  setPaper,
  onBuildProfile,
  onEditProfile,
  dirty,
  onClose,
  onSaved,
}: {
  index: ContentIndex
  folder: FileSystemDirectoryHandle
  paper: Paper | null
  setPaper: (p: Paper | null) => void
  /** Open the profile editor on a new profile, or on one already in the folder. */
  onBuildProfile: () => void
  onEditProfile: (profile: Profile, path: string) => void
  /** Whether the paper on screen differs from the one in the folder. */
  dirty: boolean
  /** Routed through the app's guard, because Close discards as much as Forget does. */
  onClose: () => void
  onSaved: () => void
}) {
  const profiles = index.profiles.map((p) => p.data)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState('')
  const [failed, setFailed] = useState('')
  const [preview, setPreview] = useState<PrintMode | null>(null)
  const [aimedAt, setTarget] = useState(0)

  // Whether this paper is the one already in `papers/<id>.json`, rather than a
  // new one that happens to want the same file. Decided once, at mount, because
  // that is the only moment the two can be told apart: a paper opened from the
  // folder starts identical to its file and a new one does not. The builder is
  // keyed on the paper in `app.tsx`, so mount is per paper.
  const [owns, setOwns] = useState(() => paper !== null && !paperIsDirty(index, paper))

  if (!paper) {
    return (
      <StartPaper
        index={index}
        folder={folder}
        profiles={profiles}
        papers={index.papers}
        onStart={setPaper}
        onBuildProfile={onBuildProfile}
        onEditProfile={onEditProfile}
        onInstalled={onSaved}
      />
    )
  }

  // Which section a question would be added to. Kept inside the paper's own
  // range rather than used as stored, because adding to a section that is not
  // there is silent: `addRef` rewrites the section whose index matches and there
  // is none, so the paper comes back unchanged, nothing is said, and it does not
  // even read as unsaved. The state is reset per paper in `app.tsx`; this is the
  // guarantee that does not depend on remembering to.
  const target = Math.min(aimedAt, paper.sections.length - 1)

  const profile = profiles.find((p) => p.id === paper.profileId)
  const resolved = resolvePaper(index, paper, profile)
  const checks = checkPaper(resolved)
  const errors = checks.filter((c) => c.severity === 'error')

  const save = async () => {
    setSaving(true)
    setSaved('')
    setFailed('')
    try {
      const { path } = await savePaper(folder, paper, { replacing: owns })
      // From here this paper is the one in that file, so the next save is an
      // edit rather than a first write and must not be refused by its own.
      setOwns(true)
      setSaved(`Saved to ${path}`)
      onSaved()
    } catch (err) {
      // Kept apart from the success message rather than sharing one line: a
      // failed save leaves the paper dirty, and the dirty notice must not be
      // what hides the reason it is still dirty.
      setFailed(`Could not save: ${(err as Error).message}`)
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
  const inFolder = allQuestions(index)
  const pickable = pickableQuestions(index, paper, targetSpec, profile?.syllabusId)

  // A profile that names no syllabus cannot tell one subject from another, so
  // the rail offers everything in the folder. That is the honest thing to do
  // and the wrong thing to leave unsaid, and it is one field on a form the
  // teacher already owns. Silent where the folder holds no model to link to.
  const profilePath = index.profiles.find((p) => p.data.id === profile?.id)?.path
  const linkSyllabus =
    profile && !profile.syllabusId && index.syllabuses.length > 0 && profilePath
      ? () => onEditProfile(profile, profilePath)
      : undefined

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

          <div class="paperstatus">
            <label class="rail__label" for="paper-status">
              Status
            </label>
            <select
              id="paper-status"
              class="input"
              value={paper.status ?? 'draft'}
              onChange={(e) =>
                setPaper({
                  ...paper,
                  status: (e.target as HTMLSelectElement).value as PaperStatus,
                })
              }
            >
              {PAPER_STATUS.map(({ value, label }) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
            <span class="muted paperstatus__note">
              {/* "Save to record the change" used to be appended here. It was
                  standing in for an unsaved-changes indicator that did not
                  exist; there is one now, so the hint can go back to saying
                  what the setting does. */}
              {paper.status === 'used'
                ? 'Its questions now raise a warning on any other paper that uses them.'
                : 'Mark a paper as sat and Klunk warns when another paper reuses its questions.'}
            </span>
          </div>

          <div class="rowbtns" style={{ marginTop: '0.8rem' }}>
            {/* The button says which of the two states the paper is in, because
                nothing else on this screen did. A teacher who has changed
                something sees "Save changes"; one who has not sees a Save that
                is plainly not waiting to be pressed. */}
            <button
              class="btn btn--primary"
              disabled={saving || !dirty}
              onClick={() => void save()}
            >
              {saving ? 'Saving…' : dirty ? 'Save changes' : 'Saved'}
            </button>
            <button class="btn" onClick={() => setPreview('paper')}>
              Preview paper
            </button>
            <button class="btn" onClick={() => setPreview('guide')}>
              Preview marking guide
            </button>
            <button class="btn btn--small" onClick={onClose}>
              Close
            </button>
          </div>
          {failed && <p class="setup__problem">{failed}</p>}
          {!failed && (
            <p class="muted" style={{ marginTop: '0.5rem', fontSize: '0.85rem' }}>
              {dirty ? (
                <>
                  Not yet in <span class="mono">papers/{paper.id}.json</span>.
                </>
              ) : (
                (saved ?? '')
              )}
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
                          {rq ? questionLabel(rq.question) : (
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
        bankEmpty={inFolder.length === 0}
        // Below the one section `paper.schema.json` requires, so only a
        // hand-edited file gets here. It still must not offer a + that quietly
        // does nothing.
        noSection={target < 0}
        targetName={resolved.sections[target]?.title ?? `Section ${target + 1}`}
        spec={targetSpec ? describeSpec(targetSpec) : ''}
        onAdd={(file, id) => setPaper(addRef(paper, target, `${file}#${id}`))}
        onLinkSyllabus={linkSyllabus}
      />
    </div>
  )
}

function BankRail({
  options,
  bankEmpty,
  noSection,
  targetName,
  spec,
  onAdd,
  onLinkSyllabus,
}: {
  options: ReturnType<typeof allQuestions>
  /** No questions in the folder at all, as against none left for this section. */
  bankEmpty: boolean
  /** The paper has no section to add to, so there is nothing this rail can do. */
  noSection: boolean
  targetName: string
  spec: string
  onAdd: (file: string, id: string) => void
  /** Given only when the profile names no syllabus, so nothing can be filtered. */
  onLinkSyllabus?: (() => void) | undefined
}) {
  const [text, setText] = useState('')
  const [open, setOpen] = useState<string | null>(null)

  const shown = useMemo(() => {
    const needle = text.trim().toLowerCase()
    if (!needle) return options
    return options.filter((o) => questionHaystack(o.question).includes(needle))
  }, [options, text])

  if (noSection) {
    return (
      <aside class="bank">
        <div class="bank__head">
          <span class="rail__label">Adding to</span>
          <p style={{ margin: '0 0 0.5rem', fontWeight: 600 }}>Nowhere yet</p>
        </div>
        <p class="bank__empty">
          This paper has no sections, so there is nowhere to put a question. Its profile
          decides them, so start the paper again from a profile that has some.
        </p>
      </aside>
    )
  }

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
        {onLinkSyllabus && (
          <p class="bank__unlinked">
            This paper's structure names no syllabus, so every question in the folder is
            offered here, including any belonging to another subject.{' '}
            <button class="btn btn--small" onClick={onLinkSyllabus}>
              Link a syllabus
            </button>
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
          {/* An empty folder used to be told its questions were all already on the
              paper, which is a confusing thing to read when you have written none.
              Reachable in earnest now that a new folder can be set up in the app. */}
          {/* "Every question of the right type is already on this paper" used
              to stand here, and it stopped being true once the rail filtered by
              syllabus: the rest may be another subject's, and saying so is what
              tempts a teacher into printing one. This claims only what is
              known. */}
          {bankEmpty
            ? 'No questions in this folder yet. Write one on the Questions tab and it will appear here.'
            : options.length === 0
              ? 'Nothing in this folder fits this section.'
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
                  {questionLabel(o.question)}
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
  index,
  folder,
  profiles,
  papers,
  onStart,
  onBuildProfile,
  onEditProfile,
  onInstalled,
}: {
  index: ContentIndex
  folder: FileSystemDirectoryHandle
  profiles: Profile[]
  papers: ContentIndex['papers']
  onStart: (p: Paper) => void
  onBuildProfile: () => void
  onEditProfile: (profile: Profile, path: string) => void
  onInstalled: () => void
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

  /** The paper this title would write over, if the folder already holds one. */
  const taken = papers.find((p) => p.data.id === slug)

  if (profiles.length === 0) {
    return (
      <section class="panel setup">
        <p class="panel__title">No profile in this folder yet</p>
        <p>
          A profile says how a paper is built: how many sections, what each is worth, which
          question types belong where. Klunk ships the ones it knows, so pick the paper you
          are building towards and it goes into <code>profiles/</code> here.
        </p>
        {/* This used to end by telling a teacher to copy `schemas/profile.schema.json`
            and change the sections to match, which is the app giving up on its own
            premise for every subject it does not ship a profile for. */}
        <ProfileInstaller
          index={index}
          folder={folder}
          onBuild={onBuildProfile}
          onInstalled={onInstalled}
        />
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
            disabled={taken !== undefined}
            onClick={() => {
              const profile = profiles.find((p) => p.id === profileId)
              if (profile) onStart(newPaper(profile, slug, title))
            }}
          >
            Create paper
          </button>
          {/* The file is named from the title, and every new paper starts with
              the same title, so the second one asks for the first one's file.
              Caught here rather than at the save, because a teacher who wanted
              that paper wanted to open it, and one who wanted a new paper only
              has to say which. */}
          {taken ? (
            <div class="setup__problem" style={{ fontSize: '0.8rem' }}>
              <span class="mono">papers/{slug}.json</span> already holds "{taken.data.title}".
              Retitle this one, or:
              <div class="rowbtns" style={{ marginTop: '0.5rem' }}>
                <button class="btn btn--small" onClick={() => onStart(taken.data)}>
                  Open "{taken.data.title}"
                </button>
              </div>
            </div>
          ) : (
            <p class="muted mono" style={{ fontSize: '0.75rem', marginTop: '0.6rem' }}>
              papers/{slug}.json
            </p>
          )}
        </section>

        {/* A profile is not something a teacher sets up once and never looks at
            again: a school's trial has different working time from the real
            paper, and until now changing that meant editing the file by hand. */}
        <section class="panel">
          <p class="panel__title">Paper structures</p>
          <ul class="plain setup__list">
            {index.profiles.map(({ data, path }) => (
              <li key={path} class="setup__row">
                <div>
                  <strong>{data.name}</strong>
                  <br />
                  <span class="muted mono setup__meta">
                    {data.paper.totalMarks} marks · {data.paper.sections.length} section
                    {data.paper.sections.length === 1 ? '' : 's'}
                  </span>
                </div>
                <button class="btn btn--small" onClick={() => onEditProfile(data, path)}>
                  Edit
                </button>
              </li>
            ))}
          </ul>
          <ProfileInstaller
            index={index}
            folder={folder}
            onBuild={onBuildProfile}
            onInstalled={onInstalled}
          />
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
                  style={{ animationDelay: `${Math.min(i, 6) * 10}ms` }}
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
