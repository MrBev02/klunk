/**
 * Remembering what each document in the folder turned out to be (#74).
 *
 * The folder is full of documents Klunk has already opened and formed an
 * opinion about, and until now it threw every one of those opinions away. A
 * bank records `NSW HSC Design and Technology, 2019` and not the filename, so
 * nothing linked those fourteen questions back to `dt-2019-paper.pdf`; a
 * refusal — the Biology PDF told to use the Word export, the subject guide
 * refused as a markscheme — cost real seconds to establish and was forgotten the
 * moment the panel cleared. The syllabus side is the exception that shows the
 * shape works: a model records `source.title`, which is a manifest of one row.
 *
 * The immediate use is #73, where "From a syllabus" offers 37 documents of which
 * 24 are past papers and marking guides. But the reason to hold it in the folder
 * rather than in one teacher's browser is that the knowledge belongs to the
 * folder: everything else Klunk keeps lives there, and a shared OneDrive folder
 * is shared by two teachers.
 *
 * **It is a cache, and it is treated as one throughout.** It holds no content,
 * nothing depends on it being right, and every fact in it can be recovered by
 * opening the document again. So it is never authoritative: a reader still
 * refuses what it does not recognise, and an entry only ever orders a list or
 * adds a line under a chosen file. Delete the file and Klunk fills a new one as
 * it goes. That is the whole disaster recovery plan, and it is why the functions
 * below drop what does not fit instead of reporting it.
 *
 * Pure, over plain values, so all of it tests without a folder — `storage.ts`
 * does the reading and writing.
 */

import type { DocumentEntry, DocumentPurpose, Manifest } from './types'

/**
 * Where the manifest is written.
 *
 * A fixed path, unlike every other file Klunk owns, which is found by its `type`
 * wherever it sits. Those are the teacher's files and they may organise them;
 * this one is Klunk's own scratch note and there is nothing to organise.
 */
export const MANIFEST_PATH = 'manifest.json'

export function emptyManifest(): Manifest {
  return { formatVersion: '1', type: 'klunk_manifest', documents: [] }
}

/**
 * Take a parsed JSON value for a manifest, keeping only what makes sense.
 *
 * Everything unrecognised is dropped in silence rather than reported. A file the
 * teacher never wrote, holding nothing that cannot be worked out again, has no
 * business putting a fault on their screen — and the next write replaces it
 * wholesale, so a mangled manifest heals itself without anybody being told.
 */
export function readManifest(data: unknown): Manifest {
  const manifest = emptyManifest()
  if (typeof data !== 'object' || data === null) return manifest

  const documents = (data as { documents?: unknown }).documents
  if (!Array.isArray(documents)) return manifest

  for (const raw of documents) {
    const entry = readEntry(raw)
    if (entry) manifest.documents.push(entry)
  }
  return manifest
}

function readEntry(raw: unknown): DocumentEntry | null {
  if (typeof raw !== 'object' || raw === null) return null
  const { path, readAs, refusedAs, into, when } = raw as Record<string, unknown>
  if (typeof path !== 'string' || !path) return null

  const refused = Array.isArray(refusedAs) ? refusedAs.filter(isPurpose) : []
  return {
    path,
    ...(isPurpose(readAs) ? { readAs } : {}),
    ...(refused.length > 0 ? { refusedAs: [...new Set(refused)].sort() } : {}),
    ...(typeof into === 'string' && into ? { into } : {}),
    ...(typeof when === 'string' && when ? { when } : {}),
  }
}

function isPurpose(value: unknown): value is DocumentPurpose {
  return value === 'syllabus' || value === 'paper' || value === 'marking guide'
}

/** What happened to one document, as the screens report it. */
export type DocumentNote =
  | { path: string; read: DocumentPurpose; into?: string; when: string }
  | { path: string; refused: DocumentPurpose; when: string }

/**
 * Fold one note into a manifest, returning a new one.
 *
 * A successful read **clears that slot's refusal**, because a document that has
 * now been read as a syllabus is not a document the syllabus reader refuses: the
 * old entry was either wrong or was about a file that has since been replaced
 * under the same name. Refusals otherwise accumulate, since a document can
 * honestly be refused by every slot there is.
 */
export function note(manifest: Manifest, entry: DocumentNote): Manifest {
  const documents = manifest.documents.filter((d) => d.path !== entry.path)
  const was = manifest.documents.find((d) => d.path === entry.path)
  const refused = new Set(was?.refusedAs ?? [])

  let next: DocumentEntry
  if ('read' in entry) {
    refused.delete(entry.read)
    // A new destination replaces the old one; no destination leaves the old one
    // alone, so re-reading a paper does not forget which bank it filled.
    const into = entry.into || was?.into
    next = {
      path: entry.path,
      readAs: entry.read,
      ...(into ? { into } : {}),
      when: entry.when,
    }
  } else {
    refused.add(entry.refused)
    next = {
      path: entry.path,
      // A refusal does not unsay a successful read. Two slots, two answers: the
      // subject guide reads as a syllabus and is refused as a markscheme, and
      // both of those are true at once.
      ...(was?.readAs && was.readAs !== entry.refused ? { readAs: was.readAs } : {}),
      ...(was?.into ? { into: was.into } : {}),
      when: entry.when,
    }
  }
  if (refused.size > 0) next.refusedAs = [...refused].sort()

  documents.push(next)
  documents.sort((a, b) => a.path.localeCompare(b.path))
  return { ...manifest, documents }
}

/**
 * Drop entries for documents that are no longer in the folder.
 *
 * Renaming a file in OneDrive is an ordinary thing to do, and the entry it
 * leaves behind is about a path nothing will ever offer again. Pruning on write
 * is what keeps this file from growing forever and is the automatic form of
 * "delete it and start again".
 *
 * `known` empty means the folder has not been scanned, not that it is empty, so
 * nothing is pruned then: a manifest emptied by a scan that had not happened yet
 * would be the one way this file could destroy something.
 */
export function prune(manifest: Manifest, known: Iterable<string>): Manifest {
  const paths = new Set(known)
  if (paths.size === 0) return manifest
  return { ...manifest, documents: manifest.documents.filter((d) => paths.has(d.path)) }
}

export function entryFor(manifest: Manifest, path: string): DocumentEntry | undefined {
  return manifest.documents.find((d) => d.path === path)
}

/**
 * The three groups a list of documents falls into, for one slot.
 *
 * `matching` first, `unknown` next, `other` last: a teacher looking for a
 * syllabus wants the ones known to be syllabuses, then the ones nobody has
 * opened, and the twenty-four past papers at the bottom. **Nothing is dropped**,
 * which is the constraint the whole feature sits under — before the subject
 * guide was offered here at all it could not be read at all (#58), and a
 * confident filter would put Klunk straight back there.
 */
export interface Grouped {
  /** Known to be what this slot wants. */
  matching: string[]
  /** Never opened, so it might be anything. */
  unknown: string[]
  /** Known to be something else, or refused by this slot. */
  other: string[]
}

export function groupFor(paths: string[], manifest: Manifest, want: DocumentPurpose): Grouped {
  const grouped: Grouped = { matching: [], unknown: [], other: [] }
  for (const path of paths) {
    const entry = entryFor(manifest, path)
    if (entry?.readAs === want) grouped.matching.push(path)
    else if (entry?.readAs || entry?.refusedAs?.includes(want)) grouped.other.push(path)
    else grouped.unknown.push(path)
  }
  return grouped
}

/**
 * What to say about a document already chosen, or nothing.
 *
 * The case worth the sentence is a document whose content is already somewhere:
 * reading the 2019 paper into a second bank is a real mistake with no warning
 * today. A bare `readAs` with nothing to show for it is not worth a line — the
 * teacher is about to read it again, which is what the button says.
 */
export function historyOf(manifest: Manifest, path: string): string {
  const entry = entryFor(manifest, path)
  if (!entry?.into) return ''
  // One sentence for all three purposes: a syllabus document is read into a
  // model exactly as a paper is read into a bank.
  return `Already read into ${entry.into}${entry.when ? ` on ${entry.when}` : ''}.`
}
