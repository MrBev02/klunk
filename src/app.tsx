import { useCallback, useEffect, useMemo, useState } from 'preact/hooks'
import { detectCapabilities, insecureContextWarning } from './capabilities'
import {
  allQuestions,
  emptyIndex,
  forgetFolder,
  pickFolder,
  regrant,
  restoreFolder,
  scanFolder,
  type ContentIndex,
} from './storage'
import { QUESTION_TYPE_LABELS, type QuestionRef, type Syllabus } from './types'

type Phase = 'starting' | 'empty' | 'scanning' | 'ready' | 'error'

export function App() {
  const caps = useMemo(detectCapabilities, [])
  const insecure = useMemo(() => insecureContextWarning(caps), [caps])

  const [phase, setPhase] = useState<Phase>('starting')
  const [folder, setFolder] = useState<FileSystemDirectoryHandle | null>(null)
  const [index, setIndex] = useState<ContentIndex>(emptyIndex)
  const [error, setError] = useState<string>('')

  const load = useCallback(async (handle: FileSystemDirectoryHandle) => {
    setPhase('scanning')
    try {
      setIndex(await scanFolder(handle))
      setFolder(handle)
      setPhase('ready')
    } catch (err) {
      setError((err as Error).message)
      setPhase('error')
    }
  }, [])

  // Reopen last time's folder when the browser still holds the grant.
  useEffect(() => {
    let cancelled = false
    void (async () => {
      const handle = await restoreFolder().catch(() => null)
      if (cancelled) return
      if (handle) await load(handle)
      else setPhase('empty')
    })()
    return () => {
      cancelled = true
    }
  }, [load])

  const choose = useCallback(async () => {
    try {
      const handle = await pickFolder()
      if (handle) await load(handle)
    } catch (err) {
      // A lapsed grant on a remembered handle needs a fresh gesture, which this is.
      const stored = await restoreFolder().catch(() => null)
      if (stored && (await regrant(stored))) return load(stored)
      setError((err as Error).message)
      setPhase('error')
    }
  }, [load])

  const close = useCallback(async () => {
    await forgetFolder()
    setFolder(null)
    setIndex(emptyIndex())
    setPhase('empty')
  }, [])

  return (
    <div class="shell">
      <header class="bar">
        <div>
          <h1 class="bar__title">Klunk</h1>
          <p class="bar__tagline">Build exam papers from questions you already have.</p>
        </div>
        {folder && (
          <div class="bar__folder">
            <span class="folder-name" title="Everything is read and written here">
              {folder.name}
            </span>
            <button class="btn btn--quiet" onClick={() => void load(folder)}>
              Reload
            </button>
            <button class="btn btn--quiet" onClick={() => void close()}>
              Change
            </button>
          </div>
        )}
      </header>

      {insecure && (
        <section class="card card--warn">
          <h2>Folder access unavailable</h2>
          <p>{insecure}</p>
        </section>
      )}

      {phase === 'starting' && <p class="muted">Checking for a folder you used before…</p>}
      {phase === 'scanning' && <p class="muted">Reading your folder…</p>}

      {phase === 'error' && (
        <section class="card card--warn">
          <h2>Something went wrong</h2>
          <p>{error}</p>
          <button class="btn" onClick={() => void choose()}>
            Choose a folder
          </button>
        </section>
      )}

      {phase === 'empty' && <Welcome caps={caps} onChoose={() => void choose()} />}

      {phase === 'ready' && <Library index={index} />}

      <footer class="foot">
        Runs entirely in your browser. Nothing is uploaded, and no network request is made
        after this page loads.
      </footer>
    </div>
  )
}

function Welcome({
  caps,
  onChoose,
}: {
  caps: ReturnType<typeof detectCapabilities>
  onChoose: () => void
}) {
  if (caps.storageMode !== 'folder') {
    return (
      <section class="card card--warn">
        <h2>This browser cannot open a folder</h2>
        <p>
          Klunk works by reading and writing a folder on your computer, which Chrome and
          Edge allow and this browser does not. Open Klunk in Chrome or Edge to use it
          properly.
        </p>
      </section>
    )
  }

  return (
    <section class="card card--hero">
      <h2>Choose your folder</h2>
      <p>
        Pick the folder holding your question banks and papers, normally your faculty's
        OneDrive or Teams folder. Klunk reads and writes it directly.
      </p>
      <p class="muted">
        Nothing is copied anywhere else, and nothing leaves your computer. Your browser
        will remember the folder so you only do this once.
      </p>
      <button class="btn btn--primary" onClick={onChoose}>
        Choose folder
      </button>
    </section>
  )
}

function Library({ index }: { index: ContentIndex }) {
  const questions = useMemo(() => allQuestions(index), [index])
  const syllabus = index.syllabuses[0]?.data

  const [type, setType] = useState('')
  const [topic, setTopic] = useState('')
  const [text, setText] = useState('')

  const topics = useMemo(() => topicOptions(syllabus), [syllabus])

  const shown = useMemo(() => {
    const needle = text.trim().toLowerCase()
    return questions.filter(({ question: q }) => {
      if (type && q.questionType !== type) return false
      if (topic && !(q.syllabus?.topicIds ?? []).includes(topic)) return false
      if (needle && !q.questionText.toLowerCase().includes(needle)) return false
      return true
    })
  }, [questions, type, topic, text])

  const totalMarks = shown.reduce((sum, r) => sum + r.question.marks, 0)

  if (index.scanned === 0) {
    return (
      <section class="card">
        <h2>Nothing here yet</h2>
        <p>
          That folder has no JSON files in it. Point Klunk at the folder holding your
          question banks, or create one and come back.
        </p>
      </section>
    )
  }

  return (
    <>
      <section class="stats">
        <Stat n={index.syllabuses.length} label="syllabus models" />
        <Stat n={index.profiles.length} label="paper profiles" />
        <Stat n={index.banks.length} label="question banks" />
        <Stat n={questions.length} label="questions" />
        <Stat n={index.papers.length} label="papers" />
      </section>

      {index.problems.length > 0 && (
        <section class="card card--warn">
          <h2>{index.problems.length} file(s) could not be read</h2>
          <ul class="plain">
            {index.problems.slice(0, 8).map((p) => (
              <li key={p.path}>
                <code>{p.path}</code> {p.message}
              </li>
            ))}
          </ul>
        </section>
      )}

      {questions.length === 0 ? (
        <section class="card">
          <h2>No questions found</h2>
          <p>
            Klunk read {index.scanned} JSON file(s) but none were question banks. A bank
            file needs <code>"type": "klunk_bank"</code> at the top level.
          </p>
        </section>
      ) : (
        <>
          <section class="filters">
            <input
              class="input"
              type="search"
              placeholder="Search question text…"
              value={text}
              onInput={(e) => setText((e.target as HTMLInputElement).value)}
            />
            <select
              class="input"
              value={type}
              onChange={(e) => setType((e.target as HTMLSelectElement).value)}
            >
              <option value="">All types</option>
              {Object.entries(QUESTION_TYPE_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
            <select
              class="input"
              value={topic}
              onChange={(e) => setTopic((e.target as HTMLSelectElement).value)}
            >
              <option value="">All topics</option>
              {topics.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.label}
                </option>
              ))}
            </select>
          </section>

          <p class="muted count">
            {shown.length} of {questions.length} question{questions.length === 1 ? '' : 's'},{' '}
            {totalMarks} mark{totalMarks === 1 ? '' : 's'}
          </p>

          <ul class="plain">
            {shown.map((ref) => (
              <QuestionCard key={`${ref.file}#${ref.question.id}`} item={ref} />
            ))}
          </ul>
        </>
      )}
    </>
  )
}

function Stat({ n, label }: { n: number; label: string }) {
  return (
    <div class="stat">
      <span class="stat__n">{n}</span>
      <span class="stat__label">{label}</span>
    </div>
  )
}

function QuestionCard({ item }: { item: QuestionRef }) {
  const q = item.question
  return (
    <li class="q">
      <div class="q__head">
        <span class="chip">{QUESTION_TYPE_LABELS[q.questionType] ?? q.questionType}</span>
        <span class="chip chip--marks">
          {q.marks} mark{q.marks === 1 ? '' : 's'}
        </span>
        {q.difficulty && <span class="chip chip--quiet">difficulty {q.difficulty}</span>}
        {q.source?.origin && q.source.origin !== 'authored' && (
          <span class="chip chip--warn" title={sourceTitle(q.source)}>
            {q.source.origin}
            {q.source.year ? ` ${q.source.year}` : ''}
          </span>
        )}
      </div>
      <p class="q__text">{q.questionText}</p>
      <p class="q__meta">
        {(q.syllabus?.topicIds ?? []).concat(q.syllabus?.pointIds ?? []).join(', ') || 'untagged'}
        {q.outcomes?.length ? ` · ${q.outcomes.join(', ')}` : ''}
      </p>
    </li>
  )
}

function sourceTitle(source: NonNullable<QuestionRef['question']['source']>): string {
  const bits = [source.paper, source.year?.toString(), source.questionNumber]
    .filter(Boolean)
    .join(' ')
  return bits || 'Not originally authored here'
}

function topicOptions(syllabus: Syllabus | undefined): { id: string; label: string }[] {
  if (!syllabus) return []
  const out: { id: string; label: string }[] = []
  for (const course of syllabus.courses) {
    for (const topic of course.topics) {
      const group = topic.group ? `${topic.group} · ` : ''
      out.push({ id: topic.id, label: `${course.name}: ${group}${topic.name}` })
    }
  }
  return out
}
