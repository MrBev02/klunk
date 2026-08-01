/**
 * The zip reader, on zips built here.
 *
 * A real `.docx` exercises the deflate path in `syllabus.corpus.test.ts`, but
 * that suite skips itself without the content folder and never runs in CI. This
 * one builds its own archives so the reader is covered wherever it runs, and so
 * the refusals can be provoked, which a real document will not do.
 */

import { describe, expect, it } from 'vitest'
import { NotADocxError, readZipMember } from './docx'

/* ---------------------------------------------------------- a zip, by hand */

interface Member {
  name: string
  body: string
  /** Stored rather than deflated. Word does this for tiny members. */
  stored?: boolean
}

async function zip(members: Member[], options: { corruptIndex?: boolean } = {}) {
  const parts: Uint8Array[] = []
  const directory: Uint8Array[] = []
  let at = 0

  for (const member of members) {
    const name = new TextEncoder().encode(member.name)
    const raw = new TextEncoder().encode(member.body)
    const data = member.stored ? raw : await deflate(raw)
    const method = member.stored ? 0 : 8

    const local = new Uint8Array(30 + name.length)
    const lv = new DataView(local.buffer)
    lv.setUint32(0, 0x04034b50, true)
    lv.setUint16(4, 20, true)
    lv.setUint16(8, method, true)
    lv.setUint32(18, data.length, true)
    lv.setUint32(22, raw.length, true)
    lv.setUint16(26, name.length, true)
    local.set(name, 30)

    const central = new Uint8Array(46 + name.length)
    const cv = new DataView(central.buffer)
    cv.setUint32(0, options.corruptIndex ? 0xdeadbeef : 0x02014b50, true)
    cv.setUint16(10, method, true)
    cv.setUint32(20, data.length, true)
    cv.setUint32(24, raw.length, true)
    cv.setUint16(28, name.length, true)
    cv.setUint32(42, at, true)
    central.set(name, 46)

    parts.push(local, data)
    directory.push(central)
    at += local.length + data.length
  }

  const directoryAt = at
  const directorySize = directory.reduce((n, d) => n + d.length, 0)

  const end = new Uint8Array(22)
  const ev = new DataView(end.buffer)
  ev.setUint32(0, 0x06054b50, true)
  ev.setUint16(8, members.length, true)
  ev.setUint16(10, members.length, true)
  ev.setUint32(12, directorySize, true)
  ev.setUint32(16, directoryAt, true)

  return concat([...parts, ...directory, end])
}

async function deflate(bytes: Uint8Array): Promise<Uint8Array> {
  const stream = new Blob([bytes as BlobPart])
    .stream()
    .pipeThrough(new CompressionStream('deflate-raw'))
  return new Uint8Array(await new Response(stream).arrayBuffer())
}

function concat(chunks: Uint8Array[]): ArrayBuffer {
  const total = chunks.reduce((n, c) => n + c.length, 0)
  const out = new Uint8Array(total)
  let at = 0
  for (const c of chunks) {
    out.set(c, at)
    at += c.length
  }
  return out.buffer
}

/* ------------------------------------------------------------------- tests */

const DOCUMENT = '<w:document><w:body><w:p><w:r><w:t>hello</w:t></w:r></w:p></w:body></w:document>'

describe('readZipMember', () => {
  it('reads a deflated member, which is how Word stores the document', async () => {
    const bytes = await zip([
      { name: '[Content_Types].xml', body: '<Types/>' },
      { name: 'word/document.xml', body: DOCUMENT },
    ])
    expect(await readZipMember(bytes, 'word/document.xml')).toBe(DOCUMENT)
  })

  it('reads a stored member', async () => {
    const bytes = await zip([{ name: 'word/document.xml', body: DOCUMENT, stored: true }])
    expect(await readZipMember(bytes, 'word/document.xml')).toBe(DOCUMENT)
  })

  it('finds the member wherever it sits in the archive', async () => {
    const bytes = await zip([
      { name: 'docProps/app.xml', body: '<Properties/>' },
      { name: 'word/document.xml', body: DOCUMENT },
      { name: 'word/styles.xml', body: '<Styles/>' },
    ])
    expect(await readZipMember(bytes, 'word/document.xml')).toBe(DOCUMENT)
  })

  it('keeps text that is not ASCII', async () => {
    // NESA documents are full of en dashes, curly quotes and non-breaking
    // spaces, and a reader that mangled them would corrupt every topic name.
    const body = '<w:t>Preliminary course – “design”</w:t>'
    const bytes = await zip([{ name: 'word/document.xml', body }])
    expect(await readZipMember(bytes, 'word/document.xml')).toBe(body)
  })

  it('says a Word document is not there rather than returning nothing', async () => {
    const bytes = await zip([{ name: 'word/styles.xml', body: '<Styles/>' }])
    await expect(readZipMember(bytes, 'word/document.xml')).rejects.toThrow(NotADocxError)
  })

  it('refuses something that is not a zip at all', async () => {
    // A teacher picking the PDF of the syllabus instead of the .docx is the
    // realistic case, and it should say so rather than throw a decoder error.
    const pdf = new TextEncoder().encode('%PDF-1.7\nnot a zip by any reading')
    await expect(readZipMember(pdf.buffer as ArrayBuffer, 'word/document.xml')).rejects.toThrow(
      NotADocxError,
    )
  })

  it('refuses an index that does not read as one', async () => {
    const bytes = await zip([{ name: 'word/document.xml', body: DOCUMENT }], {
      corruptIndex: true,
    })
    await expect(readZipMember(bytes, 'word/document.xml')).rejects.toThrow(NotADocxError)
  })
})
