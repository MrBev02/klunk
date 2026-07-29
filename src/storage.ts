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

const DB_NAME = 'klunk'
const DB_STORE = 'handles'
const HANDLE_KEY = 'contentFolder'

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

export async function pickFolder(): Promise<FileSystemDirectoryHandle | null> {
  if (typeof window.showDirectoryPicker !== 'function') return null
  try {
    const handle = await window.showDirectoryPicker({ id: 'klunk-content', mode: 'readwrite' })
    await idbPut(HANDLE_KEY, handle)
    return handle
  } catch (err) {
    // AbortError just means the teacher closed the dialog, which is not a fault.
    if (err instanceof DOMException && err.name === 'AbortError') return null
    throw err
  }
}

/**
 * Reopen the previously chosen folder, if the browser still has the grant.
 *
 * Returns null when there is no stored handle, or when the grant has lapsed and
 * would need a fresh gesture. Permission cannot be requested here: browsers
 * require a user gesture, and this runs at startup.
 */
export async function restoreFolder(): Promise<FileSystemDirectoryHandle | null> {
  const handle = await idbGet<FileSystemDirectoryHandle>(HANDLE_KEY).catch(() => undefined)
  if (!handle) return null
  const state = await handle.queryPermission({ mode: 'readwrite' })
  return state === 'granted' ? handle : null
}

/** Ask for permission again. Must be called from a click or similar. */
export async function regrant(handle: FileSystemDirectoryHandle): Promise<boolean> {
  const state = await handle.requestPermission({ mode: 'readwrite' })
  return state === 'granted'
}

export async function forgetFolder(): Promise<void> {
  await idbDelete(HANDLE_KEY).catch(() => undefined)
}

export async function storedFolderName(): Promise<string | null> {
  const handle = await idbGet<FileSystemDirectoryHandle>(HANDLE_KEY).catch(() => undefined)
  return handle?.name ?? null
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
    } else if (name.toLowerCase().endsWith('.json')) {
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
  const parts = path.split('/').filter(Boolean)
  const filename = parts.pop()
  if (!filename) throw new Error(`not a file path: ${path}`)

  let target = dir
  for (const part of parts) {
    target = await target.getDirectoryHandle(part, { create: true })
  }

  const file = await target.getFileHandle(filename, { create: true })
  const writable = await file.createWritable()
  await writable.write(`${JSON.stringify(value, null, 2)}\n`)
  await writable.close()
}

/* ------------------------------------------------------------------ querying */

/** Every question across every bank, tagged with the file it came from. */
export function allQuestions(index: ContentIndex): QuestionRef[] {
  const out: QuestionRef[] = []
  for (const bank of index.banks) {
    for (const question of bank.data.questions) {
      out.push({ question, file: bank.path, bankName: bank.data.name })
    }
  }
  return out
}

export interface FoundQuestion {
  question: Question
  /** Where it was actually found, which may differ from where the paper looked. */
  file: string
  /** True when the exact path missed and the question was recovered elsewhere. */
  relocated: boolean
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
  if (hit && exact) return { question: hit, file: exact.path, relocated: false }

  const base = file.split('/').pop()
  if (base) {
    for (const bank of index.banks) {
      if (bank.path.split('/').pop() !== base) continue
      const found = bank.data.questions.find((q) => q.id === questionId)
      if (found) return { question: found, file: bank.path, relocated: true }
    }
  }

  // Last resort: the id is unique across the whole folder, so there is only one
  // question it could mean. More than one match is genuinely ambiguous and is
  // reported as missing instead of guessed at.
  const matches: FoundQuestion[] = []
  for (const bank of index.banks) {
    for (const q of bank.data.questions) {
      if (q.id === questionId) matches.push({ question: q, file: bank.path, relocated: true })
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
