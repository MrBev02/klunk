/**
 * The workbook reader, on a spreadsheet built here.
 *
 * `readWorkbook` needs a real zip, so this writes one — stored rather than
 * deflated, which zip allows and which keeps the helper to twenty lines. That
 * is worth the trouble rather than testing only the exported helpers: the two
 * paths that would silently lose content, shared strings and absent rows, are
 * both inside `readWorkbook` and neither would fail loudly.
 */

import { describe, expect, it } from 'vitest'
import { NotADocxError } from './docx'
import { carryDown, readWorkbook } from './xlsx'

/* ------------------------------------------------------------------- helpers */

/** A zip with every member stored, which is enough for `readZipMember`. */
function zip(members: Record<string, string>): Blob {
  const encoder = new TextEncoder()
  const bytes = (text: string) => Uint8Array.from(encoder.encode(text))
  const local: Uint8Array<ArrayBuffer>[] = []
  const central: Uint8Array<ArrayBuffer>[] = []
  let offset = 0

  for (const [name, text] of Object.entries(members)) {
    const nameBytes = bytes(name)
    const data = bytes(text)

    const header = new Uint8Array(30 + nameBytes.length)
    const head = new DataView(header.buffer)
    head.setUint32(0, 0x04034b50, true)
    head.setUint16(8, 0, true) // stored
    head.setUint32(18, data.length, true) // compressed size
    head.setUint32(22, data.length, true) // uncompressed size
    head.setUint16(26, nameBytes.length, true)
    header.set(nameBytes, 30)

    const entry = new Uint8Array(46 + nameBytes.length)
    const dir = new DataView(entry.buffer)
    dir.setUint32(0, 0x02014b50, true)
    dir.setUint16(10, 0, true) // stored
    dir.setUint32(20, data.length, true)
    dir.setUint32(24, data.length, true)
    dir.setUint16(28, nameBytes.length, true)
    dir.setUint32(42, offset, true)
    entry.set(nameBytes, 46)

    local.push(header, data)
    central.push(entry)
    offset += header.length + data.length
  }

  const directory = central.reduce((n, e) => n + e.length, 0)
  const end = new Uint8Array(22)
  const tail = new DataView(end.buffer)
  tail.setUint32(0, 0x06054b50, true)
  tail.setUint16(8, central.length, true)
  tail.setUint16(10, central.length, true)
  tail.setUint32(12, directory, true)
  tail.setUint32(16, offset, true)

  return new Blob([...local, ...central, end])
}

const RELS =
  '<?xml version="1.0"?><Relationships>' +
  '<Relationship Id="rId1" Target="worksheets/sheet1.xml"/>' +
  '<Relationship Id="rId2" Target="/xl/worksheets/sheet2.xml"/>' +
  '</Relationships>'

const WORKBOOK =
  '<?xml version="1.0"?><workbook><sheets>' +
  '<sheet name="Mapping" sheetId="1" r:id="rId1"/>' +
  '<sheet name="Tips" sheetId="2" r:id="rId2"/>' +
  '</sheets></workbook>'

const STRINGS =
  '<?xml version="1.0"?><sst count="4">' +
  '<si><t>Theme</t></si>' +
  '<si><t>Ergonomics &amp; anthropometrics</t></si>' +
  // Split across runs, which Excel does whenever part of a cell is formatted.
  '<si><r><t>Design in </t></r><r><t>theory</t></r></si>' +
  '<si><t>Tip</t></si>' +
  '</sst>'

function sheet(rows: string): string {
  return `<?xml version="1.0"?><worksheet><sheetData>${rows}</sheetData></worksheet>`
}

function book(rows: string, extra: Record<string, string> = {}): Blob {
  return zip({
    'xl/workbook.xml': WORKBOOK,
    'xl/_rels/workbook.xml.rels': RELS,
    'xl/sharedStrings.xml': STRINGS,
    'xl/worksheets/sheet1.xml': sheet(rows),
    'xl/worksheets/sheet2.xml': sheet('<row r="1"><c r="A1" t="s"><v>3</v></c></row>'),
    ...extra,
  })
}

/* --------------------------------------------------------------------- tests */

describe('readWorkbook', () => {
  it('resolves a shared string rather than reporting its index', async () => {
    const [mapping] = await readWorkbook(
      book('<row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c></row>'),
    )

    // The whole point. `['0', '1']` still parses and still counts, which is
    // exactly how this would go unnoticed.
    expect(mapping!.rows[0]).toEqual(['Theme', 'Ergonomics & anthropometrics'])
  })

  it('joins the runs of a string that Excel split for formatting', async () => {
    const [mapping] = await readWorkbook(book('<row r="1"><c r="A1" t="s"><v>2</v></c></row>'))

    expect(mapping!.rows[0]![0]).toBe('Design in theory')
  })

  it('puts a cell in the column its reference names', async () => {
    const [mapping] = await readWorkbook(
      book('<row r="1"><c r="A1" t="s"><v>0</v></c><c r="D1" t="s"><v>3</v></c></row>'),
    )

    expect(mapping!.rows[0]).toEqual(['Theme', '', '', 'Tip'])
  })

  it('keeps the gap where Excel left a row out', async () => {
    // Excel writes no `<row>` at all for a blank line, so without the row
    // number two blocks either side of a gap become adjacent.
    const [mapping] = await readWorkbook(
      book(
        '<row r="1"><c r="A1" t="s"><v>0</v></c></row><row r="4"><c r="A4" t="s"><v>3</v></c></row>',
      ),
    )

    expect(mapping!.rows).toHaveLength(4)
    expect(mapping!.rows[3]).toEqual(['Tip'])
  })

  it('reads inline and numeric cells as text', async () => {
    const [mapping] = await readWorkbook(
      book(
        '<row r="1"><c r="A1" t="inlineStr"><is><t>50 hours</t></is></c><c r="B1"><v>33</v></c></row>',
      ),
    )

    expect(mapping!.rows[0]).toEqual(['50 hours', '33'])
  })

  it('names every sheet, and follows a target written either way', async () => {
    const sheets = await readWorkbook(book('<row r="1"><c r="A1" t="s"><v>0</v></c></row>'))

    expect(sheets.map((s) => s.name)).toEqual(['Mapping', 'Tips'])
    expect(sheets[1]!.rows[0]).toEqual(['Tip'])
  })

  it('refuses a file that is not a zip, in the words of the file it was given', async () => {
    await expect(readWorkbook(new Blob(['not a spreadsheet']))).rejects.toThrow(/not a spreadsheet/)
  })

  it('refuses a zip with no workbook part', async () => {
    await expect(readWorkbook(zip({ 'hello.txt': 'hi' }))).rejects.toThrow(NotADocxError)
  })
})

describe('carryDown', () => {
  it('fills a blank from the row above, in the named columns only', () => {
    const rows = [
      ['A. Theory', '1. People', 'A1.1'],
      ['', '', 'A1.2'],
      ['', '2. Process', 'A2.1'],
    ]

    expect(carryDown(rows, [0, 1])).toEqual([
      ['A. Theory', '1. People', 'A1.1'],
      ['A. Theory', '1. People', 'A1.2'],
      ['A. Theory', '2. Process', 'A2.1'],
    ])
  })

  it('leaves a column it was not asked about alone', () => {
    expect(
      carryDown(
        [
          ['a', 'b'],
          ['', ''],
        ],
        [0],
      ),
    ).toEqual([
      ['a', 'b'],
      ['a', ''],
    ])
  })

  it('holds nothing before the first value', () => {
    expect(carryDown([[''], ['x'], ['']], [0])).toEqual([[''], ['x'], ['x']])
  })
})
