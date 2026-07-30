import { useCallback, useEffect, useMemo, useRef, useState } from 'preact/hooks'
import { Builder } from './builder'
import { detectCapabilities, insecureContextWarning } from './capabilities'
import { QuestionEditor, type Editing } from './editor'
import { QuestionRow } from './question'
import {
  allQuestions,
  emptyIndex,
  forgetFolder,
  pickFolder,
  regrant,
  releaseImages,
  restoreFolder,
  scanFolder,
  type ContentIndex,
} from './storage'
import { QUESTION_TYPE_LABELS, type Paper, type QuestionRef, type Syllabus } from './types'

type Phase = 'starting' | 'empty' | 'scanning' | 'ready' | 'error'
type View = 'library' | 'build'

export function App() {
  const caps = useMemo(detectCapabilities, [])
  const insecure = useMemo(() => insecureContextWarning(caps), [caps])

  const [phase, setPhase] = useState<Phase>('starting')
  const [folder, setFolder] = useState<FileSystemDirectoryHandle | null>(null)
  const [index, setIndex] = useState<ContentIndex>(emptyIndex)
  const [error, setError] = useState<string>('')
  const [view, setView] = useState<View>('library')
  const [paper, setPaper] = useState<Paper | null>(null)
  /** 'new' to write one, an Editing to change one, null when the editor is shut. */
  const [editor, setEditor] = useState<'new' | Editing | null>(null)
  const [notice, setNotice] = useState('')

  // The live index is mirrored in a ref so a rescan can hand the one it replaces
  // to scanFolder for its image URLs to be released. A ref, not the state value:
  // load must not change identity every scan, or the Builder's onSaved would
  // rescan against a stale index.
  const indexRef = useRef<ContentIndex>(index)
  const replaceIndex = useCallback((next: ContentIndex) => {
    indexRef.current = next
    setIndex(next)
  }, [])

  const load = useCallback(
    async (handle: FileSystemDirectoryHandle) => {
      setPhase('scanning')
      try {
        replaceIndex(await scanFolder(handle, indexRef.current))
        setFolder(handle)
        setPhase('ready')
      } catch (err) {
        setError((err as Error).message)
        setPhase('error')
      }
    },
    [replaceIndex],
  )

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
      const stored = await restoreFolder().catch(() => null)
      if (stored && (await regrant(stored))) return load(stored)
      setError((err as Error).message)
      setPhase('error')
    }
  }, [load])

  const close = useCallback(async () => {
    await forgetFolder()
    setFolder(null)
    // Discarded with no replacement scan, so the release has to happen here.
    releaseImages(indexRef.current)
    replaceIndex(emptyIndex())
    setPaper(null)
    setEditor(null)
    setPhase('empty')
  }, [replaceIndex])

  // Opening and closing the editor swaps the whole page for a taller or
  // shorter one. Without this a teacher who saves from the bottom of a long
  // form lands below the end of the library and sees a blank screen.
  const showEditor = useCallback((next: 'new' | Editing | null) => {
    setEditor(next)
    window.scrollTo({ top: 0 })
  }, [])

  const openEditor = useCallback(
    (next: 'new' | Editing) => {
      setNotice('')
      showEditor(next)
    },
    [showEditor],
  )

  const questionCount = useMemo(() => allQuestions(index).length, [index])

  return (
    <div class="shell">
      <header class="masthead">
        <div class="masthead__mark">
          <h1 class="masthead__title">Klunk</h1>
          <span class="masthead__rule">exam papers, from questions you have</span>
        </div>
        {folder && (
          <div class="masthead__folder">
            <span class="folder-name" title="Everything is read and written here">
              {folder.name}
            </span>
            <button class="btn btn--small" onClick={() => void load(folder)}>
              Reload
            </button>
            <button class="btn btn--small" onClick={() => void close()}>
              Change
            </button>
          </div>
        )}
      </header>

      {phase === 'starting' && <p class="muted">Looking for the folder you used last time…</p>}
      {phase === 'scanning' && <p class="muted">Reading your folder…</p>}

      {phase === 'error' && (
        <section class="panel panel--alert">
          <p class="panel__title">Something went wrong</p>
          <p>{error}</p>
          <div class="rowbtns">
            <button class="btn" onClick={() => void choose()}>
              Choose a folder
            </button>
          </div>
        </section>
      )}

      {phase === 'empty' && (
        <Welcome caps={caps} insecure={insecure} onChoose={() => void choose()} />
      )}

      {/* The editor takes the whole screen, tabs included. A half-written
          question is easy to lose to a stray click on another tab, and there is
          nothing to come back to once it is gone. */}
      {phase === 'ready' && folder && editor !== null && (
        <QuestionEditor
          index={index}
          folder={folder}
          editing={editor === 'new' ? null : editor}
          onCancel={() => showEditor(null)}
          onSaved={(message) => {
            showEditor(null)
            setNotice(message)
            void load(folder)
          }}
        />
      )}

      {phase === 'ready' && editor === null && (
        <>
          {notice && (
            <section class="panel panel--ok">
              <p>{notice}</p>
            </section>
          )}

          <nav class="tabs">
            <button
              class={`tab ${view === 'library' ? 'tab--on' : ''}`}
              onClick={() => setView('library')}
            >
              Questions<span class="tab__n">{questionCount}</span>
            </button>
            <button
              class={`tab ${view === 'build' ? 'tab--on' : ''}`}
              onClick={() => setView('build')}
            >
              Papers<span class="tab__n">{index.papers.length}</span>
            </button>
          </nav>

          {view === 'library' && (
            <Library
              index={index}
              onNew={() => openEditor('new')}
              onEdit={(item) => openEditor({ question: item.question, file: item.file })}
            />
          )}

          {view === 'build' && folder && (
            <Builder
              index={index}
              folder={folder}
              paper={paper}
              setPaper={setPaper}
              onSaved={() => void load(folder)}
            />
          )}
        </>
      )}

      <footer class="colophon">
        Runs entirely in your browser · nothing uploaded · no network after load
      </footer>
    </div>
  )
}

function Welcome({
  caps,
  insecure,
  onChoose,
}: {
  caps: ReturnType<typeof detectCapabilities>
  insecure: string | null
  onChoose: () => void
}) {
  if (caps.storageMode !== 'folder') {
    return (
      <section class="panel panel--alert">
        <p class="panel__title">Klunk needs Chrome or Edge</p>
        <p>
          Klunk works by opening a folder on your computer and reading and writing in
          place. Only Chrome and Edge can do that, so this browser cannot run it. Open
          the same link in Chrome or Edge and carry on.
        </p>
        <p class="muted">
          Nothing is lost by switching. Your banks and papers are ordinary files in your
          own folder, so the other browser reads exactly the same content.
        </p>
        {insecure && <p class="muted">{insecure}</p>}
      </section>
    )
  }

  return (
    <section class="hero">
      <h2>Choose your folder</h2>
      <p>
        Point Klunk at the folder holding your question banks and papers, normally your
        faculty's OneDrive or Teams folder.
      </p>
      <p class="muted">
        Nothing is copied anywhere else and nothing leaves your computer. Your browser
        remembers the folder, so you do this once.
      </p>
      <div class="rowbtns" style={{ justifyContent: 'center', marginTop: '1.2rem' }}>
        <button class="btn btn--primary" onClick={onChoose}>
          Choose folder
        </button>
      </div>
    </section>
  )
}

function Library({
  index,
  onNew,
  onEdit,
}: {
  index: ContentIndex
  onNew: () => void
  onEdit: (item: QuestionRef) => void
}) {
  const questions = useMemo(() => allQuestions(index), [index])
  const syllabus = index.syllabuses[0]?.data

  const [type, setType] = useState('')
  const [topic, setTopic] = useState('')
  const [text, setText] = useState('')
  const [untaggedOnly, setUntaggedOnly] = useState(false)

  const topics = useMemo(() => topicOptions(syllabus), [syllabus])

  const shown = useMemo(() => {
    const needle = text.trim().toLowerCase()
    return questions.filter(({ question: q }) => {
      if (type && q.questionType !== type) return false
      if (topic && !(q.syllabus?.topicIds ?? []).includes(topic)) return false
      if (untaggedOnly && (q.syllabus?.topicIds?.length || q.syllabus?.pointIds?.length)) {
        return false
      }
      if (needle && !q.questionText.toLowerCase().includes(needle)) return false
      return true
    })
  }, [questions, type, topic, text, untaggedOnly])

  const shownMarks = shown.reduce((sum, r) => sum + r.question.marks, 0)

  if (index.scanned === 0) {
    return (
      <section class="panel">
        <p class="panel__title">Nothing here yet</p>
        <p>
          That folder holds no JSON files. Point Klunk at the folder with your question
          banks, or write your first question here and Klunk will make the bank.
        </p>
        <div class="rowbtns">
          <button class="btn btn--primary" onClick={onNew}>
            Write a question
          </button>
        </div>
      </section>
    )
  }

  return (
    <div class="split">
      <aside class="rail">
        <button class="btn btn--primary rail__cta" onClick={onNew}>
          Write a question
        </button>

        <div class="meter">
          <span class="meter__n">{shown.length}</span>
          <span class="meter__of"> / {questions.length}</span>
          <span class="meter__label">questions · {shownMarks} marks</span>
        </div>

        <div class="rail__group">
          <label class="rail__label" for="f-search">
            Search
          </label>
          <input
            id="f-search"
            class="input"
            type="search"
            placeholder="Words in the question…"
            value={text}
            onInput={(e) => setText((e.target as HTMLInputElement).value)}
          />
        </div>

        <div class="rail__group">
          <label class="rail__label" for="f-type">
            Type
          </label>
          <select
            id="f-type"
            class="input"
            value={type}
            onChange={(e) => setType((e.target as HTMLSelectElement).value)}
          >
            <option value="">Any type</option>
            {Object.entries(QUESTION_TYPE_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </div>

        <div class="rail__group">
          <label class="rail__label" for="f-topic">
            Syllabus topic
          </label>
          <select
            id="f-topic"
            class="input"
            value={topic}
            onChange={(e) => setTopic((e.target as HTMLSelectElement).value)}
          >
            <option value="">Any topic</option>
            {topics.map((t) => (
              <option key={t.id} value={t.id}>
                {t.label}
              </option>
            ))}
          </select>
        </div>

        <div class="rail__group">
          <label class="rail__label">
            <input
              type="checkbox"
              checked={untaggedOnly}
              onChange={(e) => setUntaggedOnly((e.target as HTMLInputElement).checked)}
            />{' '}
            Only untagged
          </label>
        </div>

        {(type || topic || text || untaggedOnly) && (
          <button
            class="btn btn--small"
            onClick={() => {
              setType('')
              setTopic('')
              setText('')
              setUntaggedOnly(false)
            }}
          >
            Clear filters
          </button>
        )}

        <div class="rail__group" style={{ marginTop: '1.5rem' }}>
          <span class="rail__label">In this folder</span>
          <p class="muted mono" style={{ fontSize: '0.78rem', lineHeight: 1.7 }}>
            {index.banks.length} bank{index.banks.length === 1 ? '' : 's'}
            <br />
            {index.syllabuses.length} syllabus model
            {index.syllabuses.length === 1 ? '' : 's'}
            <br />
            {index.profiles.length} profile{index.profiles.length === 1 ? '' : 's'}
            <br />
            {index.papers.length} paper{index.papers.length === 1 ? '' : 's'}
          </p>
        </div>
      </aside>

      <main>
        {index.problems.length > 0 && (
          <section class="panel panel--alert">
            <p class="panel__title">
              {index.problems.length} file{index.problems.length === 1 ? '' : 's'} could not
              be read
            </p>
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
          <section class="panel">
            <p class="panel__title">No questions found</p>
            <p>
              Klunk read {index.scanned} JSON file{index.scanned === 1 ? '' : 's'} but none
              were question banks. A bank needs <code>"type": "klunk_bank"</code> at the top
              level.
            </p>
            <div class="rowbtns">
              <button class="btn btn--primary" onClick={onNew}>
                Write the first question
              </button>
            </div>
          </section>
        ) : shown.length === 0 ? (
          <section class="panel">
            <p class="panel__title">Nothing matches</p>
            <p>No question in the bank matches those filters.</p>
          </section>
        ) : (
          <ul class="qlist">
            {shown.map((ref, i) => (
              <QuestionRow
                key={`${ref.file}#${ref.question.id}`}
                item={ref}
                index={i}
                action={
                  <button class="btn btn--small" onClick={() => onEdit(ref)}>
                    Edit this question
                  </button>
                }
              />
            ))}
          </ul>
        )}
      </main>
    </div>
  )
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
