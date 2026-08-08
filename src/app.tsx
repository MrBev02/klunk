import { useCallback, useEffect, useMemo, useRef, useState } from 'preact/hooks'
import { Builder } from './builder'
import { detectCapabilities, insecureContextWarning } from './capabilities'
import { CoverEditor } from './coversheet'
import { QuestionEditor, type Editing } from './editor'
import { Extractor } from './extractor'
import { Factory } from './factory'
import { Help } from './help'
import { duplicateModels, knownIds } from './modelcheck'
import { paperIsDirty, paperIsSaved } from './paper'
import { ProfileEditor, type EditingProfile } from './profile'
import { SyllabusReader } from './syllabusreader'
import { QuestionRow } from './question'
import { ProfileInstaller, profilesOnOffer, SyllabusNote } from './setup'
import {
  allQuestions,
  emptyIndex,
  folderIsMissing,
  folderProblem,
  forgetFolder,
  inSyllabus,
  listFolders,
  openFolder,
  pickFolder,
  releaseImages,
  rememberFolder,
  restoreFolder,
  scanFolder,
  type ContentIndex,
  type FolderProblem,
  type RememberedFolder,
} from './storage'
import {
  QUESTION_TYPE_LABELS,
  questionHaystack,
  type Paper,
  type QuestionRef,
} from './types'

type Phase = 'starting' | 'empty' | 'scanning' | 'ready' | 'error'
type View = 'library' | 'build' | 'draft' | 'paper' | 'syllabus'

/** Something that would discard unsaved work, held until a teacher confirms it. */
interface Guarded {
  /**
   * What is about to happen, as the subject of "… will discard …": "Forgetting
   * klunk-content", "Opening another folder", "Closing this paper".
   */
  what: string
  /** The confirming button, which says what it does rather than "OK". */
  confirm: string
  run: () => void | Promise<void>
}

export function App() {
  const caps = useMemo(detectCapabilities, [])
  const insecure = useMemo(() => insecureContextWarning(caps), [caps])

  const [phase, setPhase] = useState<Phase>('starting')
  const [folder, setFolder] = useState<FileSystemDirectoryHandle | null>(null)
  /** Bumped when a different folder opens, and the key the tabs hang off. */
  const [folderKey, setFolderKey] = useState(0)
  const opened = useRef<FileSystemDirectoryHandle | null>(null)
  const [index, setIndex] = useState<ContentIndex>(emptyIndex)
  const [error, setError] = useState<FolderProblem | null>(null)
  /**
   * The folder an error is about, when the folder itself has gone.
   *
   * Held rather than inferred from the message, because it is the handle that
   * has to be forgotten, and by the time the error is on screen it is no longer
   * the open folder and may never have been one.
   */
  const [gone, setGone] = useState<FileSystemDirectoryHandle | null>(null)
  const [view, setView] = useState<View>('library')
  const [paper, setPaper] = useState<Paper | null>(null)
  const dirty = paper !== null && paperIsDirty(index, paper)

  /** What the syllabus reader offers, which is every document it has a reader for. */
  const documents = index.docx.length + index.workbooks.length + index.pdfs.length
  /** 'new' to write one, an Editing to change one, null when the editor is shut. */
  const [editor, setEditor] = useState<'new' | Editing | null>(null)
  /** 'new' to describe a paper structure, an EditingProfile to change one, null when shut. */
  const [profileEditor, setProfileEditor] = useState<'new' | EditingProfile | null>(null)
  /** Whether the folder's cover sheet is being edited. One folder has one, so this is a flag. */
  const [coverEditor, setCoverEditor] = useState(false)
  const [notice, setNotice] = useState('')
  /** Every subject folder this browser remembers, most recently used first. */
  const [folders, setFolders] = useState<RememberedFolder[]>([])
  /** Which of them is open, by position, since a handle is not the same object twice. */
  const [current, setCurrent] = useState(-1)
  /** An action waiting on a second click, because it would discard unsaved work. */
  const [pending, setPending] = useState<Guarded | null>(null)
  /**
   * Whether the help page is showing.
   *
   * Not a view and not a tab. A tab only exists once a folder is open, and the
   * teacher most in need of help is the one still looking at "Choose your
   * folder", so it has to be reachable from every screen including that one.
   */
  const [help, setHelp] = useState(false)

  // The live index is mirrored in a ref so a rescan can hand the one it replaces
  // to scanFolder for its image URLs to be released. A ref, not the state value:
  // load must not change identity every scan, or the Builder's onSaved would
  // rescan against a stale index.
  const indexRef = useRef<ContentIndex>(index)
  const replaceIndex = useCallback((next: ContentIndex) => {
    indexRef.current = next
    setIndex(next)
  }, [])

  /**
   * Re-read the remembered folders and work out which one is open.
   *
   * By position rather than by reference: IndexedDB structured-clones a handle,
   * so the entry standing for the open folder is a different object every time
   * the list is read. `isSameEntry` is the only identity that holds, and it is
   * asynchronous, which is why this is not a `useMemo`.
   */
  const refreshFolders = useCallback(async (open: FileSystemDirectoryHandle | null) => {
    const list = await listFolders().catch(() => [])
    setFolders(list)

    let found = -1
    if (open) {
      for (let i = 0; i < list.length; i += 1) {
        const entry = list[i]
        if (entry && (await entry.handle.isSameEntry(open).catch(() => false))) {
          found = i
          break
        }
      }
    }
    setCurrent(found)
  }, [])

  const load = useCallback(
    async (handle: FileSystemDirectoryHandle) => {
      setPhase('scanning')
      setGone(null)
      try {
        replaceIndex(await scanFolder(handle, indexRef.current))
        // Which folder is open, for the key the tabs hang off. Held in a ref and
        // compared by identity: `folder` cannot be a dependency of `load`
        // without recreating it on every open, and two folders can be called the
        // same thing, so the name would not do.
        if (opened.current !== handle) {
          opened.current = handle
          setFolderKey((n) => n + 1)
        }
        setFolder(handle)
        setPhase('ready')
        // Opening is what makes a folder the most recent one, not adding it.
        // Without this the list only ever reordered when a folder was picked
        // from the dialog, so a teacher who added Textiles once and then taught
        // D&T for a month was returned to Textiles every morning.
        await rememberFolder(handle).catch(() => undefined)
        await refreshFolders(handle)
      } catch (err) {
        // The folder having gone is not a fault to report as one, and it is the
        // only failure with a way out of its own: say which folder, and offer to
        // stop remembering it.
        if (folderIsMissing(err)) setGone(handle)
        setError(folderProblem(err, handle.name))
        setPhase('error')
      }
    },
    [replaceIndex, refreshFolders],
  )

  useEffect(() => {
    let cancelled = false
    void (async () => {
      const handle = await restoreFolder().catch(() => null)
      if (cancelled) return
      if (handle) {
        await load(handle)
      } else {
        // Nothing can be opened without a gesture, but folders whose grant has
        // lapsed are still remembered, and the welcome screen offers them as a
        // click rather than a trip through the file dialog.
        await refreshFolders(null)
        setPhase('empty')
      }
    })()
    return () => {
      cancelled = true
    }
  }, [load, refreshFolders])

  /** Add a folder. The only path that opens the file picker. */
  const choose = useCallback(async () => {
    try {
      const handle = await pickFolder()
      if (handle) {
        setPaper(null)
        setEditor(null)
        setNotice('')
        await load(handle)
      }
    } catch (err) {
      setError(folderProblem(err))
      setPhase('error')
    }
  }, [load])

  /**
   * Move to another remembered folder.
   *
   * Never opens the file picker: these handles are already granted, and a
   * subject switch that costs a dialog is a subject switch teachers stop making.
   * A grant that lapsed between sessions is renewed on this same click, because
   * the click is the gesture the browser needs.
   */
  const switchTo = useCallback(
    async (entry: RememberedFolder) => {
      setPending(null)
      try {
        if (!(await openFolder(entry.handle))) {
          setError({
            message:
              `Klunk needs your permission to open ${entry.handle.name}. Click it again and ` +
              `confirm access when the browser asks.`,
          })
          setPhase('error')
          return
        }
      } catch (err) {
        // Asking for permission can be where a folder that has gone is first
        // noticed, before anything has been read from it.
        if (folderIsMissing(err)) setGone(entry.handle)
        setError(folderProblem(err, entry.handle.name))
        setPhase('error')
        return
      }
      // A paper is a selection of questions from the folder it was built in, so
      // it means nothing against another subject's.
      setPaper(null)
      setEditor(null)
      setNotice('')
      await load(entry.handle)
    },
    [load],
  )

  /**
   * Anything that would throw away unsaved work asks first.
   *
   * Switching folders used to be the only path that asked, and it asked because
   * somebody remembered to bolt a confirm onto that one caller. Forget, Add
   * folder and the builder's own Close discarded exactly the same work in
   * silence. One guard rather than three confirms means the next path that
   * clears a paper cannot forget to ask, which is the failure this had already
   * had three times.
   *
   * The condition is unsaved changes, not merely an open paper. Warning about a
   * paper that is already written to the folder trains teachers to click through
   * the warning, and then it is not a warning.
   */
  const guard = useCallback(
    (action: Guarded) => {
      if (dirty) setPending(action)
      else void action.run()
    },
    [dirty],
  )

  const requestSwitch = useCallback(
    (entry: RememberedFolder) =>
      guard({
        what: `Moving to ${entry.handle.name}`,
        confirm: `Switch to ${entry.handle.name}`,
        run: () => switchTo(entry),
      }),
    [guard, switchTo],
  )

  /** Stop remembering the open folder. Its contents are untouched. */
  const close = useCallback(async () => {
    if (folder) await forgetFolder(folder)
    setPending(null)
    setPaper(null)
    setEditor(null)
    setNotice('')

    // Straight on to the next subject if there is one, rather than back to the
    // welcome screen: a teacher across three subjects who drops one still has two.
    const remaining = await listFolders().catch(() => [])
    const next = remaining.find((f) => f.permission === 'granted')
    if (next) return load(next.handle)

    setFolder(null)
    // Discarded with no replacement scan, so the release has to happen here.
    releaseImages(indexRef.current)
    replaceIndex(emptyIndex())
    setFolders(remaining)
    setCurrent(-1)
    setPhase('empty')
  }, [folder, load, replaceIndex])

  const requestForget = useCallback(
    () =>
      guard({
        what: `Forgetting ${folder?.name ?? 'this folder'}`,
        confirm: 'Forget it anyway',
        run: close,
      }),
    [guard, folder, close],
  )

  /**
   * Stop remembering a folder that is no longer on this computer.
   *
   * Forget in the header can only ever drop the folder that is *open*, and this
   * one cannot be opened, so before this there was no way to be rid of it at
   * all: it sat in the list for good, offering an error to anyone who clicked
   * it and holding one of the eight remembered places against a folder that
   * still exists.
   *
   * Nothing is asked first, unlike the other three ways of forgetting a folder.
   * There is nothing to discard: a paper is cleared before a switch is even
   * attempted, and this folder has nothing in it to lose.
   */
  const forgetMissing = useCallback(
    async (handle: FileSystemDirectoryHandle) => {
      await forgetFolder(handle).catch(() => undefined)
      setGone(null)
      setError(null)

      // Back to the folder that was open, when the failure was a switch away
      // from one. Its index was never replaced, so there is nothing to re-read.
      if (folder) {
        await refreshFolders(folder)
        setPhase('ready')
        return
      }

      const remaining = await listFolders().catch(() => [])
      const next = remaining.find((f) => f.permission === 'granted')
      if (next) return load(next.handle)
      setFolders(remaining)
      setCurrent(-1)
      setPhase('empty')
    },
    [folder, load, refreshFolders],
  )

  const requestAddFolder = useCallback(
    () =>
      guard({
        what: 'Opening another folder',
        confirm: 'Open another folder',
        run: choose,
      }),
    [guard, choose],
  )

  const requestClosePaper = useCallback(
    () =>
      guard({ what: 'Closing this paper', confirm: 'Close it anyway', run: () => setPaper(null) }),
    [guard],
  )

  // Opening and closing the editor swaps the whole page for a taller or
  // shorter one. Without this a teacher who saves from the bottom of a long
  // form lands below the end of the library and sees a blank screen.
  const showEditor = useCallback((next: 'new' | Editing | null) => {
    setEditor(next)
    window.scrollTo({ top: 0 })
  }, [])

  // Opening or closing help swaps the whole page, so the scroll position that
  // belonged to the other one is never where the teacher wants to land.
  const showHelp = useCallback((next: boolean) => {
    setHelp(next)
    window.scrollTo({ top: 0 })
  }, [])

  const showProfileEditor = useCallback((next: 'new' | EditingProfile | null) => {
    setProfileEditor(next)
    setNotice('')
    window.scrollTo({ top: 0 })
  }, [])

  const showCoverEditor = useCallback((next: boolean) => {
    setCoverEditor(next)
    setNotice('')
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
  // Read once here rather than inside the reader, so the generator stays a pure
  // function of its input and a model made twice from one document is identical.
  //
  // Local date, not `toISOString`, which is UTC: a NSW teacher is ten or eleven
  // hours ahead, so half their working day would be stamped with yesterday. It
  // is a provenance field a teacher reads and checks against when they
  // downloaded the document, so being a day out is being wrong.
  const today = useMemo(() => {
    const now = new Date()
    const pad = (n: number) => String(n).padStart(2, '0')
    return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
  }, [])

  return (
    <div class="shell">
      <header class="masthead">
        <div class="masthead__mark">
          <h1 class="masthead__title">Klunk</h1>
          <span class="masthead__rule">exam papers, from questions you have</span>
        </div>
        {/* Help sits with the folder controls but outside them, because the
            teacher who has not got a folder open yet is the likeliest to want
            it. */}
        <div class="masthead__folder">
          {folder && (
            <>
              <Switcher
                folders={folders}
                current={current}
                openName={folder.name}
                onSwitch={requestSwitch}
                onAdd={requestAddFolder}
              />
              <button class="btn btn--small" onClick={() => void load(folder)}>
                Reload
              </button>
              <button
                class="btn btn--small"
                title="Klunk stops remembering this folder. Nothing in it is changed."
                onClick={requestForget}
              >
                Forget
              </button>
            </>
          )}
          <button
            class="btn btn--small"
            title="How Klunk works, and what to do when something looks wrong"
            onClick={() => showHelp(!help)}
          >
            {help ? 'Close help' : 'Help'}
          </button>
        </div>
      </header>

      {help && <Help onClose={() => showHelp(false)} />}

      {/* Everything else is hidden rather than unmounted while help is open,
          for the reason the tabs are hidden rather than unmounted while the
          editor is open: a teacher reads help *because* they are in the middle
          of something, and a batch of AI drafts or a half-built paper has to
          still be there when they come back. */}
      <div hidden={help}>

        {pending && paper && (
          <section class="panel panel--alert">
            {/* The paper is named in the heading rather than the sentence. Putting
                it in the sentence made the builder's own Close read "Closing it
                closes Guard test paper", since that action's subject and object
                are the same thing. */}
            <p class="panel__title">{paper.title} has changes you have not saved</p>
            <p>
              {pending.what}{' '}
              {paperIsSaved(index, paper) ? (
                <>
                  will discard everything you have changed since you last saved. The
                  version in <code>papers/</code> is unchanged.
                </>
              ) : (
                <>
                  will discard the whole paper. It has never been saved, so there is no
                  copy in this folder's <code>papers/</code> to come back to.
                </>
              )}
            </p>
            <div class="rowbtns">
              <button class="btn" onClick={() => setPending(null)}>
                Stay here
              </button>
              <button
                class="btn btn--primary"
                onClick={() => {
                  setPending(null)
                  void pending.run()
                }}
              >
                {pending.confirm}
              </button>
            </div>
          </section>
        )}

        {phase === 'starting' && <p class="muted">Looking for the folder you used last time…</p>}
        {phase === 'scanning' && <p class="muted">Reading your folder…</p>}

        {phase === 'error' && (
          <section class="panel panel--alert">
            <p class="panel__title">
              {gone ? `${gone.name} is no longer on this computer` : 'Klunk could not open that folder'}
            </p>
            {gone ? (
              <p>
                This folder has been renamed, moved or deleted since Klunk last opened it, so
                   there is nothing left to read. Forgetting it stops Klunk offering it, and
                   deletes nothing.
              </p>
            ) : (
              <>
                <p>{error?.message}</p>
                {error?.detail && (
                  <p class="hint">
                    If you report this, include this line: <code>{error.detail}</code>
                  </p>
                )}
              </>
            )}
            <div class="rowbtns">
              {gone && (
                <button class="btn btn--primary" onClick={() => void forgetMissing(gone)}>
                  Forget {gone.name}
                </button>
              )}
              <button class="btn" onClick={() => void choose()}>
                Choose a folder
              </button>
            </div>
          </section>
        )}

        {phase === 'empty' && (
          <Welcome
            caps={caps}
            insecure={insecure}
            folders={folders}
            onChoose={() => void choose()}
            onOpen={(entry) => void switchTo(entry)}
          />
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

        {/* Same treatment as the question editor: the whole screen, because a
            half-described examination is as easy to lose to a stray tab click and
            as annoying to type again. */}
        {phase === 'ready' && folder && profileEditor !== null && (
          <ProfileEditor
            index={index}
            folder={folder}
            editing={profileEditor === 'new' ? null : profileEditor}
            onCancel={() => showProfileEditor(null)}
            onSaved={(message) => {
              showProfileEditor(null)
              setNotice(message)
              void load(folder)
            }}
          />
        )}

        {/* And again for the cover sheet, which is the same kind of thing: a
            form holding a logo that has been chosen and not yet copied, which a
            stray tab click would throw away along with the trip through the
            native file dialog it cost. */}
        {phase === 'ready' && folder && coverEditor && (
          <CoverEditor
            index={index}
            folder={folder}
            onCancel={() => showCoverEditor(false)}
            onSaved={(message) => {
              showCoverEditor(false)
              setNotice(message)
              void load(folder)
            }}
          />
        )}

        {/* Kept mounted, not unmounted, while the editor is open. A batch of
            questions read back from an AI is expensive to get and lives in this
            subtree; sending one of them to the editor to be fixed must not throw
            away the other four.

            A rescan has to keep it mounted for the same reason. Saving anything
            reloads the folder, which runs phase through ready → scanning →
            ready, and unmounting on the way past discarded the whole batch the
            moment the first questions in it were saved. `folder` is what
            separates a reload from the very first scan, which has nothing worth
            keeping and should show the message on its own. */}
        {(phase === 'ready' || (phase === 'scanning' && folder)) && (
          /* Keyed on the open folder, so everything a tab remembers goes when
             the folder does. `switchTo` already clears the paper for this
             reason — a paper is a selection of questions from the folder it was
             built in — and every tab is the same case. Switching to an empty
             folder left the extractor showing the other folder's paper by name,
             and under it the fourteen questions read out of it, none of which
             exist here. The key changes on the handle rather than on a rescan,
             which hands `load` the folder it already has. */
          <div key={folderKey} hidden={editor !== null || profileEditor !== null || coverEditor}>
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
              <button
                class={`tab ${view === 'draft' ? 'tab--on' : ''}`}
                onClick={() => setView('draft')}
                title="Klunk writes the prompt, your school's AI answers it, Klunk checks the answer"
              >
                Draft with AI
              </button>
              <button
                class={`tab ${view === 'paper' ? 'tab--on' : ''}`}
                onClick={() => setView('paper')}
                title="Read a past paper and its marking guide out of this folder"
              >
                From a past paper
                {index.pdfs.length > 0 && <span class="tab__n">{index.pdfs.length}</span>}
              </button>
              <button
                class={`tab ${view === 'syllabus' ? 'tab--on' : ''}`}
                onClick={() => setView('syllabus')}
                title="Read the syllabus models in this folder, or build another from a document"
              >
                {/* "From a syllabus" until #76, which is what the tab did rather
                    than what it is about. The models in the folder are the first
                    thing on it now, and a teacher looking for their own syllabus
                    was not going to find it behind a preposition. */}
                Syllabus
                {/* The models, not the documents on offer.
                    #74 put the document count here on the principle that a badge
                    should count what the list holds, and the list the tab opened
                    on was the documents. The list it opens on now is the models,
                    and 36 over a folder holding two syllabuses would be the same
                    fault the other way up. The documents are still all offered,
                    a heading further down. */}
                {index.syllabuses.length > 0 && (
                  <span class="tab__n">{index.syllabuses.length}</span>
                )}
              </button>
            </nav>

            {view === 'library' && folder && (
              <Library
                index={index}
                folder={folder}
                onNew={() => openEditor('new')}
                onEdit={(item) => openEditor({ question: item.question, file: item.file })}
                onBuildProfile={() => showProfileEditor('new')}
                onReload={() => void load(folder)}
              />
            )}

            {view === 'build' && folder && (
              /* Keyed on the paper, so everything the builder remembers about the
                 one on screen — which section is being added to, the message
                 from the last save, what the bank rail is searched for — goes
                 when the paper does. It is kept mounted otherwise, and a
                 three-section paper closed in favour of a one-section paper left
                 it aiming at a section that no longer existed: the rail said
                 "Section 2" and + silently did nothing. */
              <Builder
                key={paper?.id ?? 'none'}
                index={index}
                folder={folder}
                paper={paper}
                setPaper={setPaper}
                onBuildProfile={() => showProfileEditor('new')}
                onEditProfile={(profile, path) => showProfileEditor({ profile, path })}
                onEditCover={() => showCoverEditor(true)}
                dirty={dirty}
                onClose={requestClosePaper}
                onSaved={() => void load(folder)}
              />
            )}

            {view === 'draft' && folder && (
              <Factory
                index={index}
                folder={folder}
                onEdit={(editing) => openEditor(editing)}
                onSaved={() => void load(folder)}
              />
            )}

            {view === 'paper' && folder && (
              <Extractor
                index={index}
                folder={folder}
                today={today}
                onEdit={(editing) => openEditor(editing)}
                onSaved={() => void load(folder)}
              />
            )}

            {view === 'syllabus' && folder && (
              <SyllabusReader
                index={index}
                folder={folder}
                today={today}
                onSaved={(message) => {
                  setNotice(message)
                  void load(folder)
                }}
              />
            )}
          </div>
        )}
      </div>

      <footer class="colophon">
        Runs entirely in your browser · nothing uploaded · no network after load
      </footer>
    </div>
  )
}

/**
 * The subject switcher.
 *
 * Every folder on screen at once rather than behind a menu. Content is laid out
 * one folder per syllabus model, and a teacher is typically across two or three
 * of them, so a row costs almost nothing and makes switching a single click
 * with nothing to discover first. It wraps if somebody really does keep eight.
 *
 * The open folder is shown from the live handle rather than from the list,
 * because the list is read asynchronously and would otherwise flicker to
 * nothing on the way past.
 */
function Switcher({
  folders,
  current,
  openName,
  onSwitch,
  onAdd,
}: {
  folders: RememberedFolder[]
  current: number
  openName: string
  onSwitch: (entry: RememberedFolder) => void
  onAdd: () => void
}) {
  // Only once the list has caught up and knows which entry is open. Until then
  // the open folder would be drawn twice, once as itself and once as an "other",
  // and two folders can share a name so there is no cheaper way to tell.
  const others =
    current < 0 ? [] : folders.map((entry, i) => ({ entry, i })).filter(({ i }) => i !== current)

  return (
    <div class="switcher">
      <span class="folder-name folder-name--on" title="Everything is read and written here">
        {openName}
      </span>
      {others.map(({ entry, i }) => (
        <button
          key={i}
          class="folder-name folder-name--other"
          onClick={() => onSwitch(entry)}
          title={
            entry.permission === 'granted'
              ? `Switch to ${entry.handle.name}`
              : `Switch to ${entry.handle.name}. Your browser will ask to confirm access.`
          }
        >
          {entry.handle.name}
          {entry.permission !== 'granted' && <span class="folder-name__lock">·</span>}
        </button>
      ))}
      <button class="btn btn--small" onClick={onAdd} title="Point Klunk at another subject's folder">
        Add folder
      </button>
    </div>
  )
}

function Welcome({
  caps,
  insecure,
  folders,
  onChoose,
  onOpen,
}: {
  caps: ReturnType<typeof detectCapabilities>
  insecure: string | null
  folders: RememberedFolder[]
  onChoose: () => void
  onOpen: (entry: RememberedFolder) => void
}) {
  if (caps.storageMode !== 'folder') {
    return (
      <section class="panel panel--alert">
        <p class="panel__title">Klunk needs Chrome or Edge</p>
        <p>
          Open the same link in Chrome or Edge to carry on. Klunk works by opening a
             folder on your computer and writing to it, and only those two browsers can do
             that.
        </p>
        <p class="muted">
          You lose nothing by switching. Your banks and papers are ordinary files in your
             own folder, so the other browser reads exactly the same ones.
        </p>
        {insecure && <p class="muted">{insecure}</p>}
      </section>
    )
  }

  // Folders are still remembered here; what has lapsed is only the permission,
  // and a browser will renew that on a click. Offering them beats sending a
  // teacher back through the file dialog to find a folder Klunk already knows.
  if (folders.length > 0) {
    return (
      <section class="hero">
        <h2>Welcome back</h2>
        <p>
          Your browser needs you to confirm access again before Klunk can read{' '}
          {folders.length === 1 ? 'your folder' : 'these folders'}. It is one click for each
             folder, and only once this session.
        </p>
        <div class="hero__folders">
          {folders.map((entry) => (
            <button
              key={entry.handle.name}
              class="btn btn--primary"
              onClick={() => onOpen(entry)}
            >
              Open {entry.handle.name}
            </button>
          ))}
        </div>
        <div class="rowbtns" style={{ justifyContent: 'center', marginTop: '1.2rem' }}>
          <button class="btn" onClick={onChoose}>
            Add a different folder
          </button>
        </div>
      </section>
    )
  }

  return (
    <section class="hero">
      <h2>Choose your folder</h2>
      <p>
        Point Klunk at the folder holding one subject's question banks and papers,
           usually a OneDrive or Teams folder. Use one folder per subject: the access you
           give then covers only the subject you are working on, and swapping to another
           one later takes a single click.
      </p>
      <p class="muted">
        Klunk copies nothing anywhere else, and nothing leaves your computer. Your
           browser remembers the folder, so you only do this once per subject.
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
  folder,
  onNew,
  onEdit,
  onBuildProfile,
  onReload,
}: {
  index: ContentIndex
  folder: FileSystemDirectoryHandle
  onNew: () => void
  onEdit: (item: QuestionRef) => void
  /** The landing screen for a new folder is here, so the offer has to be here too. */
  onBuildProfile: () => void
  onReload: () => void
}) {
  const questions = useMemo(() => allQuestions(index), [index])
  // What each model in the folder defines, so a tag naming nothing is marked
  // rather than printed as though it were live (#44).
  const known = useMemo(() => knownIds(index.syllabuses), [index.syllabuses])
  const duplicates = useMemo(() => duplicateModels(index.syllabuses), [index.syllabuses])

  const [type, setType] = useState('')
  const [topic, setTopic] = useState('')
  const [text, setText] = useState('')
  const [untaggedOnly, setUntaggedOnly] = useState(false)

  const groups = useMemo(() => topicOptions(index), [index])
  const chosenTopic = useMemo(
    () => groups.flatMap((g) => g.topics).find((t) => t.key === topic),
    [groups, topic],
  )

  const shown = useMemo(() => {
    const needle = text.trim().toLowerCase()
    return questions.filter((ref) => {
      const q = ref.question
      if (type && q.questionType !== type) return false
      if (chosenTopic) {
        if (!(q.syllabus?.topicIds ?? []).includes(chosenTopic.topicId)) return false
        if (!inSyllabus(ref, chosenTopic.syllabusId)) return false
        // A question that names a course has to name this one. One that names
        // none cannot be ruled out, which is the reading `inSyllabus` takes a
        // level up and the reason both IB courses hold `A1-1` without the
        // filter having to guess which was meant.
        const courseId = q.syllabus?.courseId
        if (courseId !== undefined && courseId !== chosenTopic.courseId) return false
      }
      if (untaggedOnly && (q.syllabus?.topicIds?.length || q.syllabus?.pointIds?.length)) {
        return false
      }
      if (needle && !questionHaystack(q).includes(needle)) return false
      return true
    })
  }, [questions, type, chosenTopic, text, untaggedOnly])

  const shownMarks = shown.reduce((sum, r) => sum + r.question.marks, 0)

  // Setup is decided by what the folder still lacks, not by whether it is empty.
  // Gating it on an empty folder meant that installing the profile — which is
  // done from this very panel — took the syllabus half off the screen, at the
  // one moment it still applied and nothing else on the page explained the gap.
  const needsProfile = index.profiles.length === 0
  const needsSyllabus = index.syllabuses.length === 0

  if (questions.length === 0 && (needsProfile || needsSyllabus)) {
    const both = needsProfile && needsSyllabus
    const canGiveProfile = profilesOnOffer(index).offered.length > 0
    return (
      <section class="panel setup">
        <p class="panel__title">
          {both ? 'A new subject. Two things to set up.' : 'One thing still to set up.'}
        </p>
        {/* "Klunk can give you one of the two things it needs" is only true when
            Klunk has a stock profile that fits this folder, which for every
            subject but Design and Technology it does not (#48). */}
        <p class="muted">
          {both
            ? canGiveProfile
              ? 'This folder is empty. Klunk can give you one of the two things it needs, and you build the other yourself.'
              : 'This folder is empty. It needs a paper profile and a syllabus model, and you build both yourself.'
               : needsProfile
                 ? canGiveProfile
                   ? 'The syllabus model is in place. This folder still needs a paper profile, and Klunk can give you that.'
                   : 'The syllabus model is in place. This folder still needs a paper profile, which you describe yourself.'
                 : 'The profile is in place. The syllabus model is the one you build yourself.'}
        </p>

        {needsProfile && (
          <>
            <h3 class="setup__head">{both && '1 · '}A paper profile</h3>
            <p>
              A profile is the exam structure: how many sections, what each is worth, which
                 question types belong where. The checker compares your paper against it.
            </p>
            <ProfileInstaller
              index={index}
              folder={folder}
              onBuild={onBuildProfile}
              onInstalled={onReload}
            />
          </>
        )}

        {needsSyllabus && (
          <>
            <h3 class="setup__head">{both && '2 · '}A syllabus model</h3>
            <SyllabusNote />
          </>
        )}

        <div class="rowbtns" style={{ marginTop: '1.4rem' }}>
          <button class="btn btn--primary" onClick={onNew}>
            Write a question
          </button>
          <button class="btn" onClick={onReload}>
            Reload the folder
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
            {groups.map((g) => (
              <optgroup key={g.label} label={g.label}>
                {g.topics.map((t) => (
                  <option key={t.key} value={t.key}>
                    {t.label}
                  </option>
                ))}
              </optgroup>
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

        {duplicates.map((d) => (
          <section key={d.source} class="panel panel--note">
            <p class="panel__title">Two syllabus models from one document</p>
            <p>
              {d.models.map((m) => m.path).join(' and ')} were both built from{' '}
              <span class="mono">{d.source}</span>. Questions tagged against one of them do not
                 count towards the other, so a paper built from the wrong one looks uncovered.
            </p>
            <p>
              Keep the one your questions are tagged against and delete the other from this
                 folder. If you meant to keep two because Year 11 and Year 12 are on different
                 editions of this syllabus, build the second one from that edition's own
                 document rather than from this one.
            </p>
          </section>
        ))}

        {questions.length === 0 ? (
          <section class="panel">
            <p class="panel__title">No questions found</p>
            <p>
              Klunk read {index.scanned} file{index.scanned === 1 ? '' : 's'} in this folder, and
                 none of them holds questions. Write your first question and Klunk makes the bank
                 for it.
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
                images={index.images}
                known={ref.syllabusId === undefined ? undefined : known.get(ref.syllabusId)}
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

interface TopicChoice {
  /**
   * `syllabusId::courseId::topicId`, not the bare topic id. Both NSW models
   * number their topics `PRE-01`/`HSC-01` upwards, so the bare id names two
   * different topics in a folder holding both and cannot be what the filter is
   * keyed on.
   *
   * The course is in the key because a topic id is only unique within a course
   * (#47). The IB model uses the code its guide prints, so Standard level and
   * Higher level both hold `A1-1`, and two options carrying one value made a
   * `<select>` snap to the first: choosing Higher level left the box reading
   * Standard level.
   */
  key: string
  syllabusId: string
  courseId: string
  topicId: string
  label: string
}

interface TopicGroup {
  label: string
  topics: TopicChoice[]
}

/**
 * Every topic of every course of every syllabus in the folder.
 *
 * It read `index.syllabuses[0]` and banks sort by path, so the second model's
 * topics could not be filtered on at all.
 *
 * One syllabus per optgroup, and the course still named on the option itself
 * rather than only on the group. Grouping by course reads better with the list
 * open, but a closed select shows the option and nothing else, and Design and
 * Technology has four topic names — *project management* among them — that its
 * Preliminary and HSC courses both use. Dropping the course prefix made those
 * indistinguishable the whole time the list was shut, which is most of the time.
 */
function topicOptions(index: ContentIndex): TopicGroup[] {
  const out: TopicGroup[] = []
  for (const { data: syllabus } of index.syllabuses) {
    const topics: TopicChoice[] = []
    for (const course of syllabus.courses) {
      for (const topic of course.topics) {
        const group = topic.group ? `${topic.group} · ` : ''
        topics.push({
          key: `${syllabus.id}::${course.id}::${topic.id}`,
          syllabusId: syllabus.id,
          courseId: course.id,
          topicId: topic.id,
          label: `${course.name}: ${group}${topic.name}`,
        })
      }
    }
    if (topics.length > 0) out.push({ label: syllabus.name, topics })
  }
  return out
}
