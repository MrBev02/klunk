/**
 * Reading an `.xlsx` into rows of text, deciding nothing about what they mean.
 *
 * The same division as `ooxml.ts` against `syllabus.ts`: this reports what the
 * markup says and the reader above it decides what a row is. So this file knows
 * about shared strings and merged cells and nothing about syllabuses, and
 * `ibdt.ts` knows about syllabuses and never opens a zip.
 *
 * Two things about the format matter and both would silently lose content:
 *
 * **Text is not in the sheet.** Excel stores every string once in
 * `sharedStrings.xml` and puts an index in the cell, marked `t="s"`. Reading the
 * cell's `<v>` as its value gives a table of integers that still parses and
 * still counts, which is the Mathematics `<m:t>` mistake in a different costume.
 *
 * **A merged cell is written once and left blank underneath.** The IB workbook
 * merges the theme cell down the whole of a theme, so twenty-three of the
 * twenty-four topic rows have no theme in them. Filling a blank from the row
 * above is therefore not a repair, it is how the format works — but it is a
 * decision, so it is `carryDown` up here where it can be seen rather than a
 * `?? previous` buried in the reader.
 */

import { NotADocxError, readZipMember } from './docx'

/** A sheet as a rectangle of trimmed text, blank where the sheet is blank. */
export interface Sheet {
  name: string
  rows: string[][]
}

/**
 * Every worksheet in the workbook, in the order the workbook lists them.
 *
 * @throws NotADocxError when the file is not a readable `.xlsx`.
 */
export async function readWorkbook(file: Blob): Promise<Sheet[]> {
  const bytes = await file.arrayBuffer()
  const read = (name: string) => readZipMember(bytes, name, 'spreadsheet')

  const workbook = await read('xl/workbook.xml')
  const rels = await read('xl/_rels/workbook.xml.rels')
  const strings = sharedStrings(await readOrEmpty(read, 'xl/sharedStrings.xml'))

  const targets = relationships(rels)
  const sheets: Sheet[] = []

  for (const { name, rid } of sheetList(workbook)) {
    const target = targets.get(rid)
    if (!target) continue
    sheets.push({ name, rows: parseSheet(await read(partFor(target)), strings) })
  }

  if (sheets.length === 0) {
    throw new NotADocxError('this spreadsheet has no worksheets in it')
  }
  return sheets
}

/**
 * A workbook with no strings in it at all has no `sharedStrings.xml`.
 *
 * Vanishingly unlikely for a syllabus map and fatal if it happened, so it costs
 * one `catch` to treat as empty rather than as a damaged file.
 */
async function readOrEmpty(read: (name: string) => Promise<string>, name: string): Promise<string> {
  try {
    return await read(name)
  } catch (err) {
    if (err instanceof NotADocxError) return ''
    throw err
  }
}

/**
 * Copy each blank cell down from the row above, within the given columns.
 *
 * Excel writes a merged cell once, in its top-left corner, and leaves every
 * other cell of the merge empty. A column that is merged down — the IB
 * workbook's Theme and Topic columns both are — therefore reads as one value
 * followed by a run of blanks, and carrying it down is reading the merge rather
 * than guessing at it.
 *
 * Scoped to named columns on purpose. Doing it to every column would turn the
 * blank cells that genuinely mean "nothing here" into a copy of the row above,
 * which is how a content point acquires the wrong parent.
 */
export function carryDown(rows: string[][], columns: number[]): string[][] {
  const held = new Map<number, string>()
  return rows.map((row) => {
    const filled = [...row]
    for (const at of columns) {
      const here = (filled[at] ?? '').trim()
      if (here) held.set(at, here)
      else filled[at] = held.get(at) ?? ''
    }
    return filled
  })
}

/* ------------------------------------------------------------------- parsing */

/** `<si>` in document order; a cell's `t="s"` value indexes into this. */
function sharedStrings(xml: string): string[] {
  if (!xml) return []
  return [...xml.matchAll(/<si\b[^>]*>([\s\S]*?)<\/si>|<si\b[^>]*\/>/g)].map((m) =>
    textOf(m[1] ?? ''),
  )
}

function relationships(xml: string): Map<string, string> {
  const out = new Map<string, string>()
  for (const m of xml.matchAll(/<Relationship\b([^>]*)\/?>/g)) {
    const id = attribute(m[1] ?? '', 'Id')
    const target = attribute(m[1] ?? '', 'Target')
    if (id && target) out.set(id, target)
  }
  return out
}

function sheetList(xml: string): { name: string; rid: string }[] {
  const out: { name: string; rid: string }[] = []
  for (const m of xml.matchAll(/<sheet\b([^>]*)\/?>/g)) {
    const name = attribute(m[1] ?? '', 'name')
    // Namespaced, and the prefix is not guaranteed to be `r`, so match on the
    // local name. Excel writes `r:id`; other writers do not always.
    const rid = /(?:^|\s)(?:[\w.-]+:)?id="([^"]*)"/.exec(m[1] ?? '')?.[1]
    if (name && rid) out.push({ name: decode(name), rid })
  }
  return out
}

/**
 * A relationship target to a zip member path.
 *
 * Targets are relative to `xl/`, and Excel writes them both ways — `worksheets/
 * sheet1.xml` and `/xl/worksheets/sheet1.xml` — so both are normalised to the
 * one form `readZipMember` looks for.
 */
function partFor(target: string): string {
  const clean = target.replace(/^\//, '').replace(/^xl\//, '')
  return `xl/${clean}`
}

function parseSheet(xml: string, strings: string[]): string[][] {
  const rows: string[][] = []

  for (const rowMatch of xml.matchAll(/<row\b([^>]*)>([\s\S]*?)<\/row>/g)) {
    // Rows Excel considers empty are simply absent, and the row number is the
    // only thing that says so. Without this a blank line between two tables
    // closes up and two unrelated blocks become adjacent.
    const number = Number(attribute(rowMatch[1] ?? '', 'r') ?? '0')
    const cells: string[] = []

    for (const cellMatch of (rowMatch[2] ?? '').matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const at = columnOf(attribute(cellMatch[1] ?? '', 'r') ?? '')
      if (at < 0) continue
      while (cells.length < at) cells.push('')
      cells[at] = valueOf(cellMatch[1] ?? '', cellMatch[2] ?? '', strings)
    }

    if (number > 0) while (rows.length < number - 1) rows.push([])
    rows.push(cells)
  }

  return rows
}

function valueOf(attributes: string, body: string, strings: string[]): string {
  const type = attribute(attributes, 't')

  if (type === 's') {
    const index = Number(/<v[^>]*>([\s\S]*?)<\/v>/.exec(body)?.[1] ?? '')
    return strings[index] ?? ''
  }
  // `inlineStr` keeps the text in the cell, and a formula cell caches its
  // result as a string the same way. Both are read as text.
  if (type === 'inlineStr' || type === 'str') return textOf(body)

  // A number comes through as whatever Excel stored, which for this reader's
  // purposes is text. Nothing here reads a date, so no serial is converted.
  return textOf(/<v[^>]*>([\s\S]*?)<\/v>/.exec(body)?.[1] ?? '')
}

/**
 * The text of a run-bearing element.
 *
 * `<t>` holds the characters; everything else is formatting. `xml:space` is not
 * honoured because every value here is trimmed anyway, and a cell whose meaning
 * depends on its leading spaces is not something this reads.
 */
function textOf(xml: string): string {
  const parts = [...xml.matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/g)].map((m) => m[1] ?? '')
  const joined = parts.length > 0 ? parts.join('') : xml.replace(/<[^>]*>/g, '')
  return decode(joined).replace(/\s+/g, ' ').trim()
}

/** `C` to 2, `AB` to 27. Excel numbers columns in base 26 with no zero. */
function columnOf(reference: string): number {
  const letters = /^[A-Z]+/.exec(reference)?.[0]
  if (!letters) return -1
  let n = 0
  for (const ch of letters) n = n * 26 + (ch.charCodeAt(0) - 64)
  return n - 1
}

function attribute(attributes: string, name: string): string | undefined {
  return new RegExp(`(?:^|\\s)${name}="([^"]*)"`).exec(attributes)?.[1]
}

function decode(text: string): string {
  return text
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(Number(dec)))
    .replace(/&amp;/g, '&')
}
