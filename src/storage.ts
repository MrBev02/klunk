/**
 * Reading and writing the teacher's content folder.
 *
 * Klunk never uploads anything. The teacher points at a folder once, the app
 * reads and writes in place, and the browser remembers the grant so the next
 * visit reopens it without a second trip through the file dialog.
 *
 * Files are classified by their `type` field rather than by which directory
 * they sit in. Teachers reorganise folders; a file that says what it is
 * survives that, and a convention like "banks live in bank/" does not.
 */

import type { Bank, Loaded, Paper, Profile, Question, QuestionRef, Syllabus } from './types'
// validate.ts has no runtime imports of its own, so this cannot close a cycle
// back through paper.ts.
import { suggestQuestionId } from './validate'

const DB_NAME = 'klunk'
const DB_STORE = 'handles'
/** The one handle Klunk remembered before it could hold more than one. */
const LEGACY_KEY = 'contentFolder'
const FOLDERS_KEY = 'contentFolders'

/**
 * How many folders are worth remembering.
 *
 * A teacher is across two or three subjects, not thirty. The cap exists so a
 * teacher who tries a folder once does not carry it forever, not because there
 * is any cost to the eighth.
 */
const MAX_REMEMBERED = 8

/** Directories never worth walking into. */
const SKIP_DIRS = new Set(['node_modules', '.git', '.vscode', '.idea', 'dist', 'dist-single'])

export interface Problem {
  path: string
  message: string
}

export interface ContentIndex {
  profiles: Loaded<Profile>[]
  syllabuses: Loaded<Syllabus>[]
  banks: Loaded<Bank>[]
  papers: Loaded<Paper>[]
  /** Files that looked like ours but could not be used, kept to be shown rather than swallowed. */
  problems: Problem[]
  /** Total .json files inspected, so "found nothing" can be distinguished from "found nothing of ours". */
  scanned: number
  /**
   * Every PDF in the folder, by path, unread.
   *
   * Past papers and marking guides live alongside the banks they will fill, so
   * the extractor offers what is already there. Only the paths: a folder may
   * hold a lot of PDFs and reading them all on every scan would be slow and
   * pointless.
   */
  pdfs: string[]
  /**
   * Every Word document in the folder, by path, unread.
   *
   * A teacher downloads the syllabus into the same folder as everything else,
   * so the syllabus reader offers what is already there rather than sending
   * them to a file dialog for a file they have already got. Same reasoning as
   * `pdfs`, and the same cost: paths only.
   */
  docx: string[]
  /**
   * Stimulus images, keyed by folder-relative path, as object URLs.
   *
   * Loaded eagerly for the images questions actually reference, rather than
   * every image in the folder: a faculty folder may hold a lot of unrelated
   * pictures, and the ones nothing points at are nobody's business.
   */
  images: Map<string, string>
}

export function emptyIndex(): ContentIndex {
  return {
    profiles: [],
    syllabuses: [],
    banks: [],
    papers: [],
    problems: [],
    scanned: 0,
    pdfs: [],
    docx: [],
    images: new Map(),
  }
}

/**
 * Resolve a stimulus path against the bank file that referenced it.
 *
 * Stimulus paths are relative to their bank, so a bank at `bank/design.json`
 * referencing `stimulus/handle.png` means `bank/stimulus/handle.png`. Keeping
 * them relative means a teacher can move or copy a bank folder and its images
 * travel with it.
 */
export function joinPath(baseFile: string, rel: string): string {
  if (rel.startsWith('/')) return rel.replace(/^\/+/, '')
  const parts = baseFile.split('/').slice(0, -1)
  for (const seg of rel.split('/')) {
    if (!seg || seg === '.') continue
    if (seg === '..') parts.pop()
    else parts.push(seg)
  }
  return parts.join('/')
}

/**
 * Release an index's image object URLs.
 *
 * The rule is that a `ContentIndex` owns the object URLs in its `images` map, so
 * whoever discards an index must release it. `scanFolder` does that for the
 * index it replaces; a caller that throws an index away without scanning a
 * replacement calls this itself. Object URLs live until the page unloads, and a
 * rescan happens on every reload and every paper save, so nothing else reclaims
 * them.
 */
export function releaseImages(index: ContentIndex): void {
  for (const url of index.images.values()) URL.revokeObjectURL(url)
  index.images.clear()
}

async function fileAt(
  dir: FileSystemDirectoryHandle,
  path: string,
): Promise<File | null> {
  const parts = path.split('/').filter(Boolean)
  const name = parts.pop()
  if (!name) return null

  let here: FileSystemDirectoryHandle = dir
  for (const part of parts) {
    const next = await here.getDirectoryHandle(part).catch(() => null)
    if (!next) return null
    here = next
  }
  const handle = await here.getFileHandle(name).catch(() => null)
  return handle ? await handle.getFile() : null
}

/**
 * Load every image a question points at.
 *
 * A missing image is left out of the map rather than treated as an error, so
 * the renderer can print a placeholder naming the file. That is deliberate: a
 * missing picture should be obvious on the proof rather than discovered in the
 * exam room.
 */
async function loadImages(
  dir: FileSystemDirectoryHandle,
  index: ContentIndex,
): Promise<void> {
  const wanted = new Set<string>()
  for (const bank of index.banks) {
    for (const question of bank.data.questions) {
      for (const s of question.stimulus ?? []) {
        if (s.kind === 'image' && s.file) wanted.add(joinPath(bank.path, s.file))
      }
    }
  }

  for (const path of wanted) {
    const file = await fileAt(dir, path).catch(() => null)
    if (file) index.images.set(path, URL.createObjectURL(file))
    else index.problems.push({ path, message: 'image referenced by a question is missing' })
  }
}

/* ------------------------------------------------------------ handle storage */

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1)
    req.onupgradeneeded = () => req.result.createObjectStore(DB_STORE)
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

async function idbPut(key: string, value: unknown): Promise<void> {
  const db = await openDb()
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(DB_STORE, 'readwrite')
    tx.objectStore(DB_STORE).put(value, key)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
  db.close()
}

async function idbGet<T>(key: string): Promise<T | undefined> {
  const db = await openDb()
  const value = await new Promise<T | undefined>((resolve, reject) => {
    const tx = db.transaction(DB_STORE, 'readonly')
    const req = tx.objectStore(DB_STORE).get(key)
    req.onsuccess = () => resolve(req.result as T | undefined)
    req.onerror = () => reject(req.error)
  })
  db.close()
  return value
}

async function idbDelete(key: string): Promise<void> {
  const db = await openDb()
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(DB_STORE, 'readwrite')
    tx.objectStore(DB_STORE).delete(key)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
  db.close()
}

/* ------------------------------------------------------------------- picking */

/**
 * Remembering more than one folder, because a subject is a folder.
 *
 * Content is laid out one folder per syllabus model: the permission grant is
 * the unit, and a faculty-wide folder would hand every teacher write access to
 * every other subject's banks and rescan all of them on every save. Plenty of
 * teachers are across two or three subjects though, so the layout only works if
 * moving between them is trivial. It is a click: a remembered folder already
 * holds its grant, so switching never opens the file picker. Only adding one
 * does.
 */

/** Identity is `isSameEntry`, never the name: two subjects' folders can share one. */
async function isSame(
  a: FileSystemDirectoryHandle,
  b: FileSystemDirectoryHandle,
): Promise<boolean> {
  return a.isSameEntry(b).catch(() => false)
}

/**
 * Fold a folder into the remembered list, most recently used first.
 *
 * Kept separate from the storage so the ordering and the deduplication can be
 * tested without an IndexedDB. The freshly picked handle replaces the stored
 * one rather than the other way round, because it is the one that was just
 * granted.
 */
export async function mergeFolder(
  existing: FileSystemDirectoryHandle[],
  handle: FileSystemDirectoryHandle,
  limit = MAX_REMEMBERED,
): Promise<FileSystemDirectoryHandle[]> {
  const rest: FileSystemDirectoryHandle[] = []
  for (const other of existing) {
    if (!(await isSame(other, handle))) rest.push(other)
  }
  return [handle, ...rest].slice(0, limit)
}

function isDirectoryHandle(value: unknown): value is FileSystemDirectoryHandle {
  return (
    typeof value === 'object' &&
    value !== null &&
    (value as FileSystemDirectoryHandle).kind === 'directory'
  )
}

/** The remembered handles, newest first, whether or not they still have permission. */
async function storedFolders(): Promise<FileSystemDirectoryHandle[]> {
  const stored = await idbGet<unknown[]>(FOLDERS_KEY).catch(() => undefined)
  if (Array.isArray(stored)) return stored.filter(isDirectoryHandle)

  // Before Klunk could hold more than one folder there was a single key. That
  // grant is live and working, so it is migrated rather than dropped: a teacher
  // reopening after an update must not be sent back through the file dialog.
  const legacy = await idbGet<unknown>(LEGACY_KEY).catch(() => undefined)
  return isDirectoryHandle(legacy) ? [legacy] : []
}

export interface RememberedFolder {
  handle: FileSystemDirectoryHandle
  /** 'granted' means it opens with no further ceremony. Anything else costs a click. */
  permission: PermissionState
}

/** Every remembered folder, newest first, each with whether it can be opened silently. */
export async function listFolders(): Promise<RememberedFolder[]> {
  const handles = await storedFolders()
  const out: RememberedFolder[] = []
  for (const handle of handles) {
    const permission = await handle
      .queryPermission({ mode: 'readwrite' })
      .catch((): PermissionState => 'prompt')
    out.push({ handle, permission })
  }
  return out
}

async function saveFolders(list: FileSystemDirectoryHandle[]): Promise<void> {
  await idbPut(FOLDERS_KEY, list)
  // Once the list exists the old single key is never read again, so dropping it
  // is only tidying. It is worth doing: "forget this folder" should not leave a
  // handle to it sitting in the database.
  await idbDelete(LEGACY_KEY).catch(() => undefined)
}

export async function rememberFolder(handle: FileSystemDirectoryHandle): Promise<void> {
  await saveFolders(await mergeFolder(await storedFolders(), handle))
}

/** Add a folder. Opens the file picker, so it must be called from a click. */
export async function pickFolder(): Promise<FileSystemDirectoryHandle | null> {
  if (typeof window.showDirectoryPicker !== 'function') return null
  try {
    const handle = await window.showDirectoryPicker({ id: 'klunk-content', mode: 'readwrite' })
    await rememberFolder(handle)
    return handle
  } catch (err) {
    // AbortError just means the teacher closed the dialog, which is not a fault.
    if (err instanceof DOMException && err.name === 'AbortError') return null
    throw err
  }
}

/**
 * Reopen the folder last used, if the browser still has the grant.
 *
 * Returns null when nothing is remembered, or when every grant has lapsed and
 * would need a fresh gesture. Permission cannot be requested here: browsers
 * require a gesture, and this runs at startup. The lapsed ones are not lost —
 * `listFolders` still reports them, so the welcome screen can offer them as a
 * click rather than sending the teacher back through the file dialog.
 */
export async function restoreFolder(): Promise<FileSystemDirectoryHandle | null> {
  for (const { handle, permission } of await listFolders()) {
    if (permission === 'granted') return handle
  }
  return null
}

/**
 * Make a remembered folder usable now.
 *
 * Must be called from a click: a lapsed grant needs a gesture to renew, and
 * that gesture has to be the same click that chose the folder, or switching
 * subjects costs two.
 */
export async function openFolder(handle: FileSystemDirectoryHandle): Promise<boolean> {
  const state = await handle.queryPermission({ mode: 'readwrite' })
  if (state === 'granted') return true
  return (await handle.requestPermission({ mode: 'readwrite' })) === 'granted'
}

/** Stop remembering one folder. The folder itself is untouched. */
export async function forgetFolder(handle: FileSystemDirectoryHandle): Promise<void> {
  const kept: FileSystemDirectoryHandle[] = []
  for (const other of await storedFolders()) {
    if (!(await isSame(other, handle))) kept.push(other)
  }
  await saveFolders(kept)
}

/* ------------------------------------------------------------------ scanning */

async function* walk(
  dir: FileSystemDirectoryHandle,
  prefix = '',
  depth = 0,
): AsyncGenerator<{ path: string; handle: FileSystemFileHandle }> {
  // Deep enough for any sane folder, shallow enough that a stray symlinked tree
  // cannot spin forever.
  if (depth > 6) return

  for await (const [name, entry] of dir.entries()) {
    if (name.startsWith('.')) continue
    const path = prefix ? `${prefix}/${name}` : name

    if (entry.kind === 'directory') {
      if (SKIP_DIRS.has(name)) continue
      yield* walk(entry, path, depth + 1)
    } else {
      yield { path, handle: entry }
    }
  }
}

/**
 * Read every JSON file in the folder and sort it into the index by its `type`.
 *
 * A file that fails to parse, or that carries a Klunk type but the wrong shape,
 * becomes a problem rather than an exception. One bad file must not stop a
 * teacher seeing the other forty.
 *
 * Pass the index this one replaces as `previous` and its image object URLs are
 * released, which is the only thing that reclaims them.
 */
export async function scanFolder(
  dir: FileSystemDirectoryHandle,
  previous?: ContentIndex,
): Promise<ContentIndex> {
  const index = emptyIndex()

  for await (const { path, handle } of walk(dir)) {
    // A past paper is not content Klunk owns, so it is only noted, never read
    // here: the bytes are fetched when a teacher picks one. Noting it at all is
    // what lets the extractor offer the papers already in the folder instead of
    // sending a teacher to a file dialog for something they have downloaded.
    if (path.toLowerCase().endsWith('.pdf')) {
      index.pdfs.push(path)
      continue
    }
    // Word's lock files are real .docx-adjacent entries in the folder and are
    // not documents. Offering `~$syllabus.docx` would only ever waste a click.
    if (path.toLowerCase().endsWith('.docx') && !(path.split('/').pop() ?? '').startsWith('~$')) {
      index.docx.push(path)
      continue
    }
    if (!path.toLowerCase().endsWith('.json')) continue

    index.scanned += 1

    let data: unknown
    try {
      data = JSON.parse(await (await handle.getFile()).text())
    } catch (err) {
      // Only complain about files that were probably meant to be ours. A
      // tsconfig.json in the folder is not the teacher's problem.
      if (looksLikeContentPath(path)) {
        index.problems.push({ path, message: `not valid JSON: ${(err as Error).message}` })
      }
      continue
    }

    if (typeof data !== 'object' || data === null) continue
    const type = (data as { type?: unknown }).type

    switch (type) {
      case 'klunk_profile':
        pushIf(index.profiles, index, path, data as Profile, hasSections)
        break
      case 'klunk_syllabus':
        pushIf(index.syllabuses, index, path, data as Syllabus, (d) => Array.isArray(d.courses))
        break
      case 'klunk_bank':
        pushIf(index.banks, index, path, data as Bank, (d) => Array.isArray(d.questions))
        break
      case 'klunk_paper':
        pushIf(index.papers, index, path, data as Paper, (d) => Array.isArray(d.sections))
        break
      default:
        break
    }
  }

  const byPath = (a: Loaded<unknown>, b: Loaded<unknown>) => a.path.localeCompare(b.path)
  index.profiles.sort(byPath)
  index.syllabuses.sort(byPath)
  index.banks.sort(byPath)
  index.papers.sort(byPath)
  index.pdfs.sort((a, b) => a.localeCompare(b))
  index.docx.sort((a, b) => a.localeCompare(b))

  await loadImages(dir, index)

  // Last, and only on success: a scan that throws leaves the previous index on
  // screen, still needing the images it points at.
  if (previous) releaseImages(previous)

  return index
}

function hasSections(p: Profile): boolean {
  return Array.isArray(p.paper?.sections)
}

function looksLikeContentPath(path: string): boolean {
  return /(^|\/)(bank|banks|papers|profiles|syllabus)\//i.test(path)
}

function pushIf<T>(
  target: Loaded<T>[],
  index: ContentIndex,
  path: string,
  data: T,
  valid: (d: T) => boolean,
): void {
  if (valid(data)) {
    target.push({ path, data })
  } else {
    index.problems.push({ path, message: 'has a Klunk type but is missing its required contents' })
  }
}

/* ------------------------------------------------------------------- writing */

export async function writeJson(
  dir: FileSystemDirectoryHandle,
  path: string,
  value: unknown,
): Promise<void> {
  await writeFile(dir, path, `${JSON.stringify(value, null, 2)}\n`)
}

/** Write a file, creating any directories on the way. */
export async function writeFile(
  dir: FileSystemDirectoryHandle,
  path: string,
  data: FileSystemWriteChunkType,
): Promise<void> {
  const parts = path.split('/').filter(Boolean)
  const filename = parts.pop()
  if (!filename) throw new Error(`not a file path: ${path}`)

  let target = dir
  for (const part of parts) {
    target = await target.getDirectoryHandle(part, { create: true })
  }

  const file = await target.getFileHandle(filename, { create: true })
  const writable = await file.createWritable()
  await writable.write(data)
  await writable.close()
}

/**
 * Copy a file the teacher chose into the folder, without overwriting anything.
 *
 * Two different photographs called `handle.png` is not a rare event, and the
 * second one silently replacing the first would change a question nobody was
 * editing. So a name already in use gets a numbered sibling, and the name
 * actually used is returned for the stimulus path to be written against.
 */
export async function copyFileInto(
  dir: FileSystemDirectoryHandle,
  directory: string,
  name: string,
  data: Blob,
): Promise<string> {
  const safe = safeFilename(name)
  const dot = safe.lastIndexOf('.')
  const stem = dot > 0 ? safe.slice(0, dot) : safe
  const ext = dot > 0 ? safe.slice(dot) : ''

  let chosen = safe
  for (let n = 1; await exists(dir, joinDir(directory, chosen)); n += 1) {
    chosen = `${stem}-${n}${ext}`
    if (n > 200) throw new Error(`too many files called ${safe} already`)
  }

  await writeFile(dir, joinDir(directory, chosen), data)
  return chosen
}

function joinDir(directory: string, name: string): string {
  return directory ? `${directory}/${name}` : name
}

/** Strip anything that would turn a filename into a path or an argument. */
export function safeFilename(name: string): string {
  const cleaned = name
    .split(/[\\/]/)
    .pop()
    ?.replace(/[^A-Za-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return cleaned || 'file'
}

export async function exists(dir: FileSystemDirectoryHandle, path: string): Promise<boolean> {
  return (await fileAt(dir, path).catch(() => null)) !== null
}

/**
 * Read a file from the folder as bytes.
 *
 * For the PDFs the scan noted but did not open. Read on demand rather than
 * held, because a past paper is a megabyte and a folder may hold twenty-two of
 * them; keeping them all in memory to open one would be a poor trade.
 */
export async function readBytes(
  dir: FileSystemDirectoryHandle,
  path: string,
): Promise<Uint8Array> {
  const file = await fileAt(dir, path)
  if (!file) throw new Error(`There is no file at ${path} any more.`)
  return new Uint8Array(await file.arrayBuffer())
}

/**
 * Add or replace one question in a bank file, leaving the rest of it alone.
 *
 * The bank is re-read from disk rather than taken from the index, because the
 * index is a snapshot from the last scan. A teacher with the folder open in two
 * tabs, or a bank edited by hand since the scan, would otherwise have that work
 * overwritten by a save of one unrelated question.
 */
export interface SaveQuestionOptions {
  name?: string | undefined
  syllabusId?: string | undefined
  /**
   * The question this save replaces, when it is an edit of one already there.
   *
   * Absent means the question is new, and that distinction is the whole point:
   * without it a save cannot tell "put my changes back" from "add this", and an
   * id that turned out to be taken was treated as the former.
   *
   * `asLoaded` is the question as it was when the teacher opened it, which is
   * the only way to tell an edit landing on untouched text from one landing on
   * somebody else's changes. Comparing against the incoming question would say
   * "changed" every time, since that is what editing is.
   */
  replacing?: { id: string; asLoaded?: Question } | undefined
}

export interface SaveQuestionResult {
  created: boolean
  /** The id actually written, which is not always the one that was asked for. */
  id: string
  /** Set when the id asked for was taken on disk and a free one was used. */
  reassignedFrom?: string
  /** Set when an edit landed on a question somebody else had changed. */
  overwroteChanges?: boolean
}

/**
 * Write one question into a bank, without treading on anybody else's.
 *
 * The bank is re-read here rather than taken from the in-memory index, because
 * the folder is normally a shared OneDrive and the index is as old as the last
 * scan. That much was always true. What it did not do was notice that the id it
 * had been handed was minted against that same stale index: two teachers who
 * both had the bank open at sixteen questions were both given
 * `example-bank-sa-02`, and the second save replaced the first teacher's
 * question, because a collision is indistinguishable from an edit unless
 * somebody says which one it is. Neither of them was told, and the file still
 * held seventeen questions, so nothing looked wrong.
 */
export async function saveQuestion(
  dir: FileSystemDirectoryHandle,
  bankPath: string,
  question: Question,
  options?: SaveQuestionOptions,
): Promise<SaveQuestionResult> {
  const existing = await readJson(dir, bankPath)

  let bank: Bank
  let created = false
  if (existing === null) {
    bank = { formatVersion: '1', type: 'klunk_bank', questions: [] }
    if (options?.name) bank.name = options.name
    if (options?.syllabusId) bank.syllabusId = options.syllabusId
    created = true
  } else if (isBank(existing)) {
    bank = existing
  } else {
    // Refusing rather than replacing: a teacher typing an existing paper's name
    // into the "new bank" box would otherwise destroy the paper.
    throw new Error(`${bankPath} is already there and is not a question bank`)
  }

  const replacing = options?.replacing
  const target =
    replacing === undefined ? -1 : bank.questions.findIndex((q) => q.id === replacing.id)

  // Anything else holding this id belongs to somebody else, whoever they are.
  const clash = bank.questions.findIndex((q, i) => q.id === question.id && i !== target)

  let written = question
  let reassignedFrom: string | undefined
  if (clash >= 0) {
    const taken = new Set(bank.questions.map((q) => q.id))
    const free = suggestQuestionId(bankPath, question.questionType, taken)
    written = { ...question, id: free }
    reassignedFrom = question.id
  }

  let overwroteChanges: boolean | undefined
  if (target >= 0) {
    // An edit: the question keeps its place in the file, so a bank does not
    // reshuffle itself every time somebody fixes a typo.
    const onDisk = bank.questions[target]
    const asLoaded = replacing?.asLoaded
    if (asLoaded && onDisk && JSON.stringify(onDisk) !== JSON.stringify(asLoaded)) {
      overwroteChanges = true
    }
    bank.questions[target] = written
  } else {
    bank.questions.push(written)
  }

  await writeJson(dir, bankPath, bank)
  return {
    created,
    id: written.id,
    ...(reassignedFrom !== undefined ? { reassignedFrom } : {}),
    ...(overwroteChanges ? { overwroteChanges } : {}),
  }
}

async function readJson(dir: FileSystemDirectoryHandle, path: string): Promise<unknown | null> {
  const file = await fileAt(dir, path).catch(() => null)
  if (!file) return null
  return JSON.parse(await file.text()) as unknown
}

function isBank(value: unknown): value is Bank {
  if (typeof value !== 'object' || value === null) return false
  const bank = value as Bank
  return bank.type === 'klunk_bank' && Array.isArray(bank.questions)
}

function isProfile(value: unknown): value is Profile {
  if (typeof value !== 'object' || value === null) return false
  const profile = value as Profile
  return profile.type === 'klunk_profile' && Array.isArray(profile.paper?.sections)
}

/**
 * Write a profile a teacher wrote or edited.
 *
 * `installProfile` refuses to overwrite anything, because it offers a stock
 * profile and a teacher who has edited theirs must not lose it to a stray
 * click. This one has to be able to overwrite, since editing is the whole
 * point — but only the profile it was opened from. Anything else at that path
 * belongs to somebody else, and a teacher who picks an id another subject is
 * already using would otherwise replace that subject's paper structure and be
 * told it saved.
 */
export async function saveProfile(
  dir: FileSystemDirectoryHandle,
  profile: Profile,
  options?: { replacingId?: string | undefined },
): Promise<{ path: string }> {
  const path = `profiles/${profile.id}.json`
  const existing = await readJson(dir, path).catch(() => null)

  if (existing !== null && options?.replacingId !== profile.id) {
    throw new Error(
      isProfile(existing)
        ? `${path} is already there and holds another profile, "${existing.name}". ` +
          'Give this one a different id.'
        : `${path} is already there and is not a profile`,
    )
  }

  await writeJson(dir, path, profile)

  // An id change leaves the old file behind, holding a profile no longer being
  // edited. Deleting it is not this function's call — a paper may still name it,
  // and papers resolve a profile by id — so the caller is told instead.
  return { path }
}

/* ------------------------------------------------------------------ querying */

/**
 * Which syllabus a question belongs to.
 *
 * The bank's default, overridden by the question's own. `bank.schema.json`
 * calls the bank field a default and says a question may override it, so
 * resolving it here means nothing downstream has to remember that — and it is
 * one rule rather than two, which matters now that both the folder listing and
 * a paper's own references have to answer the question.
 */
function syllabusOf(bank: Bank, question: Question): string | undefined {
  return question.syllabus?.syllabusId ?? bank.syllabusId
}

/** Every question across every bank, tagged with the file it came from. */
export function allQuestions(index: ContentIndex): QuestionRef[] {
  const out: QuestionRef[] = []
  for (const bank of index.banks) {
    for (const question of bank.data.questions) {
      out.push({
        question,
        file: bank.path,
        bankName: bank.data.name,
        syllabusId: syllabusOf(bank.data, question),
      })
    }
  }
  return out
}

/**
 * Whether this question could be part of that syllabus.
 *
 * A question that names a different syllabus is not, and a question that names
 * none cannot be ruled out — all that is known about it is the bare topic id it
 * was tagged with, and hiding one a teacher tagged is worse than showing one
 * they did not mean. So this narrows only where the file actually disagrees.
 */
export function inSyllabus(ref: QuestionRef, syllabusId: string): boolean {
  return ref.syllabusId === undefined || ref.syllabusId === syllabusId
}

/** Every question id in the folder, which is what a new id must not collide with. */
export function questionIds(index: ContentIndex): Set<string> {
  const out = new Set<string>()
  for (const bank of index.banks) {
    for (const question of bank.data.questions) out.add(question.id)
  }
  return out
}

export interface FoundQuestion {
  question: Question
  /** Where it was actually found, which may differ from where the paper looked. */
  file: string
  /** True when the exact path missed and the question was recovered elsewhere. */
  relocated: boolean
  /** The syllabus it belongs to, so a paper can notice one from another subject. */
  syllabusId?: string | undefined
}

/**
 * Find a question a paper refers to, surviving a moved or renamed bank.
 *
 * A paper stores paths relative to the folder the teacher picked. Point Klunk
 * at a different root, or move a bank into a subfolder, and every exact path
 * misses. That should not destroy a paper, so resolution falls back: same
 * filename elsewhere in the folder, then a question id that is unique across
 * every bank. Both fallbacks are reported rather than applied silently, because
 * quietly using a different question than the one recorded is worse than saying
 * the reference is broken.
 */
export function findQuestion(
  index: ContentIndex,
  file: string,
  questionId: string,
): FoundQuestion | null {
  const exact = index.banks.find((b) => b.path === file)
  const hit = exact?.data.questions.find((q) => q.id === questionId)
  if (hit && exact) {
    return {
      question: hit,
      file: exact.path,
      relocated: false,
      syllabusId: syllabusOf(exact.data, hit),
    }
  }

  const base = file.split('/').pop()
  if (base) {
    for (const bank of index.banks) {
      if (bank.path.split('/').pop() !== base) continue
      const found = bank.data.questions.find((q) => q.id === questionId)
      if (found) {
        return {
          question: found,
          file: bank.path,
          relocated: true,
          syllabusId: syllabusOf(bank.data, found),
        }
      }
    }
  }

  // Last resort: the id is unique across the whole folder, so there is only one
  // question it could mean. More than one match is genuinely ambiguous and is
  // reported as missing instead of guessed at.
  const matches: FoundQuestion[] = []
  for (const bank of index.banks) {
    for (const q of bank.data.questions) {
      if (q.id === questionId) {
        matches.push({
          question: q,
          file: bank.path,
          relocated: true,
          syllabusId: syllabusOf(bank.data, q),
        })
      }
    }
  }
  return matches.length === 1 ? (matches[0] ?? null) : null
}

/** Topic and point ids a question is tagged against, flattened for filtering. */
export function syllabusIdsOf(question: Question): string[] {
  const s = question.syllabus
  if (!s) return []
  return [...(s.topicIds ?? []), ...(s.pointIds ?? [])]
}
