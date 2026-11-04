/**
 * The pictures in a Word document's table rows, and where each one is kept.
 *
 * A `.docx` holds every picture whole, as its own file under `word/media/`, so
 * nothing has to be cut out of a page the way `pdfimage.ts` does (#207). What
 * says where a picture sits is the markup around it: a `<w:drawing>` inside a
 * table row, naming its file by a relationship id that
 * `word/_rels/document.xml.rels` resolves.
 *
 * Rows rather than paragraphs because the one school paper looked at sets each
 * question as one table row, its number in the first cell and its pictures in
 * the row. Which row is a question is the reader's business, not this file's.
 *
 * Only `<w:drawing>`. An equation from the old equation editor or MathType is a
 * `<w:object>`, an embedded object drawn from a Windows metafile that no
 * browser shows, and it is a formula and never a diagram.
 */

import { paraText, unescapeXml } from './ooxml'

const PARA_RE = /<w:p(?: [^>]*)?>[\s\S]*?<\/w:p>|<w:p(?: [^>]*)?\/>/g
const DRAWING_RE = /<w:drawing>[\s\S]*?<\/w:drawing>/g
// `a:blip` is the picture itself. An SVG is carried as an extension inside it,
// with this `r:embed` naming the PNG Word keeps beside it for whatever cannot
// draw SVG, which is the one wanted here.
const BLIP_RE = /<a:blip\b[^>]*\br:embed="([^"]+)"/
const DESCR_RE = /<wp:docPr\b[^>]*\bdescr="([^"]*)"/
const RELATIONSHIP_RE = /<Relationship\b[^>]*>/g

/** One picture in a row, as the document names it. */
export interface RowPicture {
  /** The zip member holding it, such as `word/media/image8.png`. */
  member: string
  /** The alt text Word holds for it, which is empty more often than not. */
  alt: string
  /**
   * Which lettered option it sits beside, counting A as 0, where the row sets
   * its options as a table of letters (#238). Absent for any other picture.
   */
  choice?: number
}

/** One table row: what each cell says, and the pictures anywhere in it. */
export interface PictureRow {
  /** Which table it is in, counting from 0, so a reader can tell where one ends. */
  table: number
  cells: string[]
  pictures: RowPicture[]
}

/** Every table row in the document, in order, whether or not it holds a picture. */
export function pictureRows(documentXml: string, relsXml: string): PictureRow[] {
  const targets = relationships(relsXml)
  const out: PictureRow[] = []
  for (const [table, tableXml] of outermost(documentXml, 'w:tbl').entries()) {
    for (const row of outermost(tableXml, 'w:tr')) {
      const cells = outermost(row, 'w:tc').map((cell) =>
        [...cell.matchAll(PARA_RE)]
          .map((p) => paraText(p[0]))
          .filter((t) => t !== '')
          .join(' '),
      )
      const pictures: RowPicture[] = []
      const choices = choicePictures(row)
      for (const drawing of row.matchAll(DRAWING_RE)) {
        const id = drawing[0].match(BLIP_RE)?.[1]
        const target = id === undefined ? undefined : targets.get(id)
        // A drawing with no blip is a shape or a chart, which has no picture
        // file to take.
        if (target === undefined) continue
        const choice = choices.get(drawing.index)
        pictures.push({
          member: target,
          alt: unescapeXml(drawing[0].match(DESCR_RE)?.[1] ?? '').trim(),
          ...(choice === undefined ? {} : { choice }),
        })
      }
      out.push({ table, cells, pictures })
    }
  }
  return out
}

/**
 * Every `tag` element not inside another, as its whole markup.
 *
 * Not a lazy regex, which stops at the first closing tag and so ends a table
 * at the end of any table nested in it. The Year 8 paper sets the
 * sub-questions of its first question as a table inside that question's row,
 * and a lazy match lost the eight questions after it (#207). `ooxml.ts` still
 * matches lazily (#236).
 *
 * Counting depth on the one tag is enough: a nested table's rows sit inside one
 * of the outer rows, and its cells inside one of the outer cells.
 */
function outermost(xml: string, tag: string): string[] {
  return spans(xml, tag).map(([start, end]) => xml.slice(start, end))
}

/** Where each of `outermost`'s elements starts and ends in `xml`. */
function spans(xml: string, tag: string): [number, number][] {
  // The lookahead keeps `<w:tblPr>` from being a `<w:tbl>`, and `<w:trPr>` a `<w:tr>`.
  const re = new RegExp(`<${tag}(?=[\\s>])[^>]*>|</${tag}>`, 'g')
  const out: [number, number][] = []
  let depth = 0
  let start = 0
  for (const m of xml.matchAll(re)) {
    if (m[0].startsWith('</')) {
      depth--
      if (depth === 0) out.push([start, m.index + m[0].length])
    } else {
      if (depth === 0) start = m.index
      depth++
    }
  }
  return out
}

const LETTER_RE = /^\(?([A-H])[.)]?$/

/** One cell of a table inside a row: its words, and where its drawings start in the row. */
interface GridCell {
  text: string
  drawings: number[]
}

/**
 * The drawings in a row that are its lettered options, by where each starts in
 * the row, to which option (#238).
 *
 * The Year 8 Term 2 task sets a multiple-choice question's options as a table
 * inside the question's row, in two layouts. Support 6 runs the letters down a
 * column with each option's picture in the column beside it, and puts the
 * question's own triangle in a third column beside A only. Beyond 3 runs the
 * letters across a row with each shape in the row under it. So a column of
 * pictures is the options only where every lettered row has exactly one, and
 * anything else in the table is the question's.
 *
 * The letters have to run A, B, C from the start, at least two of them, so a
 * table that happens to hold a cell saying "A" is not taken for a list.
 */
function choicePictures(row: string): Map<number, number> {
  const out = new Map<number, number>()
  for (const [cellStart, cellEnd] of spans(row, 'w:tc')) {
    // Past the cell's own opening tag, or the cell would be found as itself.
    const open = row.indexOf('>', cellStart) + 1
    for (const [tableStart, tableEnd] of spans(row.slice(open, cellEnd), 'w:tbl')) {
      const base = open + tableStart
      const grid = gridOf(row.slice(base, open + tableEnd), base)
      for (const [drawing, choice] of lettered(grid)) out.set(drawing, choice)
    }
  }
  return out
}

/** A table's rows of cells, with each drawing placed by where it starts in the row. */
function gridOf(table: string, base: number): GridCell[][] {
  return spans(table, 'w:tr').map(([rowStart, rowEnd]) =>
    spans(table.slice(rowStart, rowEnd), 'w:tc').map(([s, e]) => {
      const cell = table.slice(rowStart + s, rowStart + e)
      return {
        text: [...cell.matchAll(PARA_RE)]
          .map((p) => paraText(p[0]))
          .join(' ')
          .trim(),
        drawings: [...cell.matchAll(DRAWING_RE)].map((d) => base + rowStart + s + d.index),
      }
    }),
  )
}

function lettered(grid: GridCell[][]): Map<number, number> {
  const letters: { row: number; col: number }[] = []
  grid.forEach((cells, row) =>
    cells.forEach((cell, col) => {
      const m = cell.text.match(LETTER_RE)
      if (m && m[1]!.charCodeAt(0) - 65 === letters.length) letters.push({ row, col })
    }),
  )
  const out = new Map<number, number>()
  if (letters.length < 2) return out
  const one = (row: number, col: number) => {
    const d = grid[row]?.[col]?.drawings ?? []
    return d.length === 1 ? d[0] : undefined
  }

  // Down a column: the first other column with one picture on every lettered row.
  if (letters.every((l) => l.col === letters[0]!.col)) {
    const width = Math.max(...letters.map((l) => grid[l.row]!.length))
    for (let col = 0; col < width; col++) {
      if (col === letters[0]!.col) continue
      const found = letters.map((l) => one(l.row, col))
      if (found.every((d) => d !== undefined)) {
        found.forEach((d, choice) => out.set(d!, choice))
        return out
      }
    }
    return out
  }

  // Across a row: each letter's picture in its own cell, or else the one under it.
  if (letters.every((l) => l.row === letters[0]!.row)) {
    const found = letters.map((l) => one(l.row, l.col) ?? one(l.row + 1, l.col))
    if (found.every((d) => d !== undefined)) found.forEach((d, choice) => out.set(d!, choice))
  }
  return out
}

/**
 * Relationship ids to zip members.
 *
 * A target is relative to `word/`, where the document is. A linked picture is
 * `TargetMode="External"`, a file on the author's own disk, and is not in the
 * zip to be taken.
 */
function relationships(relsXml: string): Map<string, string> {
  const out = new Map<string, string>()
  for (const m of relsXml.matchAll(RELATIONSHIP_RE)) {
    const tag = m[0]
    if (/\bTargetMode="External"/.test(tag)) continue
    const id = tag.match(/\bId="([^"]+)"/)?.[1]
    const target = tag.match(/\bTarget="([^"]+)"/)?.[1]
    if (id === undefined || target === undefined) continue
    const path = unescapeXml(target)
    out.set(id, path.startsWith('/') ? path.slice(1) : `word/${path}`)
  }
  return out
}

/**
 * The type a browser draws a member as, or `undefined` for one it cannot.
 *
 * A Windows metafile (`.emf`, `.wmf`) is what Word keeps for a picture pasted
 * from older Office programs, and a TIFF is a scanner's. None of the three shows
 * in an `<img>`, so offering one would put a broken picture on the card.
 */
export function imageType(member: string): string | undefined {
  const ext = member.match(/\.([a-z0-9]+)$/i)?.[1]?.toLowerCase()
  switch (ext) {
    case 'png':
      return 'image/png'
    case 'jpg':
    case 'jpeg':
      return 'image/jpeg'
    case 'gif':
      return 'image/gif'
    case 'bmp':
      return 'image/bmp'
    case 'webp':
      return 'image/webp'
    default:
      return undefined
  }
}
