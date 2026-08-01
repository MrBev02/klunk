/**
 * Getting `word/document.xml` out of a `.docx`, with no dependency.
 *
 * A `.docx` is a zip, and the syllabus generator only ever wanted one member of
 * it. `tools/nesa_stage6_syllabus.py` had `zipfile` for free; the browser has
 * `DecompressionStream`, which handles the deflate that zip stores everything
 * in, so the rest is reading the central directory by hand. Sixty lines against
 * a library, and the library would be the app's second dependency.
 *
 * Deliberately narrow. This is not a zip reader: it finds one named member,
 * inflates it and stops. Anything unusual — encryption, a spanned archive, the
 * ZIP64 extensions — is refused by name rather than half-handled, because a
 * syllabus that parsed into the wrong shape would be worse than one that did
 * not parse at all.
 */

const SIG_EOCD = 0x06054b50
const SIG_CENTRAL = 0x02014b50
const SIG_LOCAL = 0x04034b50

/** Stored and deflated. Every `.docx` Word writes uses one of the two. */
const METHOD_STORED = 0
const METHOD_DEFLATE = 8

/** Zip's own "this number did not fit, look in the ZIP64 extra field" marker. */
const ZIP64_MARKER = 0xffffffff

export class NotADocxError extends Error {}

/**
 * Read one member of a zip as text.
 *
 * @param bytes The whole file.
 * @param name Member path, e.g. `word/document.xml`.
 * @returns The member's contents, decoded as UTF-8.
 */
export async function readZipMember(bytes: ArrayBuffer, name: string): Promise<string> {
  const view = new DataView(bytes)
  const eocd = findEocd(view)

  const count = view.getUint16(eocd + 10, true)
  const directoryAt = view.getUint32(eocd + 16, true)

  if (count === 0xffff || directoryAt === ZIP64_MARKER) {
    throw new NotADocxError('this file uses ZIP64, which Klunk does not read')
  }

  const entry = findEntry(view, directoryAt, count, name)
  if (entry === null) throw new NotADocxError(`no ${name} inside: not a Word document`)

  // The central directory's copy of the name and extra lengths need not match
  // the local header's, so the data offset has to come from the local header.
  if (view.getUint32(entry.localAt, true) !== SIG_LOCAL) {
    throw new NotADocxError('the file is damaged: a local header is missing')
  }
  const nameLength = view.getUint16(entry.localAt + 26, true)
  const extraLength = view.getUint16(entry.localAt + 28, true)
  const dataAt = entry.localAt + 30 + nameLength + extraLength

  const data = new Uint8Array(bytes, dataAt, entry.compressedSize)

  if (entry.method === METHOD_STORED) return new TextDecoder().decode(data)
  if (entry.method !== METHOD_DEFLATE) {
    throw new NotADocxError(`${name} is compressed in a way Klunk cannot read`)
  }

  // 'deflate-raw' rather than 'deflate': zip stores the deflate stream with no
  // zlib header around it, and asking for the wrapped form fails on the first byte.
  const stream = new Blob([data]).stream().pipeThrough(new DecompressionStream('deflate-raw'))
  return new TextDecoder().decode(await new Response(stream).arrayBuffer())
}

/** The document body of a `.docx`. */
export async function readDocxXml(file: Blob): Promise<string> {
  return readZipMember(await file.arrayBuffer(), 'word/document.xml')
}

/**
 * Find the end-of-central-directory record.
 *
 * Scanned backwards because the record sits at the very end unless the zip
 * carries a comment, which may be up to 64k. Word writes none, but a file that
 * has been through some other tool may.
 */
function findEocd(view: DataView): number {
  const smallest = 22
  const furthest = Math.max(0, view.byteLength - smallest - 0xffff)
  for (let at = view.byteLength - smallest; at >= furthest; at--) {
    if (view.getUint32(at, true) === SIG_EOCD) return at
  }
  throw new NotADocxError('this is not a zip file, so it is not a Word document')
}

interface Entry {
  method: number
  compressedSize: number
  localAt: number
}

function findEntry(
  view: DataView,
  directoryAt: number,
  count: number,
  name: string,
): Entry | null {
  const wanted = new TextEncoder().encode(name)
  let at = directoryAt

  for (let i = 0; i < count; i++) {
    if (view.getUint32(at, true) !== SIG_CENTRAL) {
      throw new NotADocxError('the file is damaged: the index does not read as a zip index')
    }
    const method = view.getUint16(at + 10, true)
    const compressedSize = view.getUint32(at + 20, true)
    const nameLength = view.getUint16(at + 28, true)
    const extraLength = view.getUint16(at + 30, true)
    const commentLength = view.getUint16(at + 32, true)
    const localAt = view.getUint32(at + 42, true)

    if (nameLength === wanted.length && sameBytes(view, at + 46, wanted)) {
      if (compressedSize === ZIP64_MARKER || localAt === ZIP64_MARKER) {
        throw new NotADocxError('this file uses ZIP64, which Klunk does not read')
      }
      return { method, compressedSize, localAt }
    }

    at += 46 + nameLength + extraLength + commentLength
  }

  return null
}

function sameBytes(view: DataView, at: number, wanted: Uint8Array): boolean {
  for (let i = 0; i < wanted.length; i++) {
    if (view.getUint8(at + i) !== wanted[i]) return false
  }
  return true
}
