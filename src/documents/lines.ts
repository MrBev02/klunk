/**
 * A PDF page's positioned text grouped into lines, and each line into cells.
 *
 * Moved out of `pastpapers/extract.ts` (#174). It knows nothing about papers:
 * the NESA paper reader, the multiple-choice reader, both marking-guide
 * readers and the IB subject guide reader all start from it, and the subject
 * guide is a syllabus document, so leaving it in the past-paper reader made the
 * syllabus reader depend on one. Moved as it was; nothing in it changed.
 */

import type { PageText, TextPiece } from './page'

/**
 * One run of text on a row, with the horizontal span it occupies.
 *
 * A row is joined into a single `text` because that is what every rule about
 * what a question *says* wants. But a page also says things with position: a
 * table's columns are the only thing that tells `8 am 41.1 18.8` from a
 * sentence, and an option printed as a table row is told from a wrapped one by
 * which column its continuation starts in (#85). Keeping the spans costs
 * nothing and is the only way to ask.
 */
/** Where something sits across the page, in points. */
export interface Span {
  left: number
  right: number
}

export interface LineCell {
  left: number
  /** The end of the run, so two cells can be asked whether they overlap. */
  right: number
  text: string
}

export interface Line {
  page: number
  y: number
  /**
   * The left edge of the row's text, which is what tells a question from a table
   * cell that merely begins with a number.
   *
   * `8 am 41.1 18.8` is a row of a table of hourly temperatures, and it opened a
   * Question 8 that does not exist on the 2025 Biology paper. The text alone
   * cannot say otherwise; the position can, because a question number sits in
   * the left margin and a table sits inside it. Infinity where the row held
   * nothing but a margin mark.
   */
  x: number
  text: string
  /**
   * The row's runs, grouped into columns. One cell for ordinary prose.
   *
   * `text` is these joined, and stays exactly what it always was — nothing that
   * reads a line has to know this is here.
   */
  cells: LineCell[]
  /** A bare number alone in the right margin: marks for the block being read. */
  marginMark?: number
  /**
   * The top of a band, where the margin held a range rather than a number.
   *
   * Only the marking guides do this, and only for an extended response, whose
   * criteria are bands: `13–15`, `10–12`, `7–9`. A paper never has one.
   */
  marginTo?: number
}

export interface LineOptions {
  /** Baselines this far apart are the same row. */
  tolerance?: number
  /** Accept `13–15` in the margin as well as `3`. Marking guides only. */
  bands?: boolean
}

/**
 * Where the marks column starts, as a fraction of page width.
 *
 * Measured across all 22 files of the 2015–2025 corpus rather than guessed. The
 * papers put their marks at x=518 of 595 (0.871) and the marking guides put
 * theirs at x=485 (0.815) — two different columns, so one number has to clear
 * both. Body text is no guide to it: prose runs to x=524 and beyond, past the
 * papers' own marks column, so "furthest right" would read prose as marks.
 *
 * What makes the rule safe is the conjunction with a bare one- or two-digit
 * number. In the whole corpus the *only* such pieces beyond 0.6 of the width are
 * the marks themselves — no page number, figure label or measurement competes,
 * because page numbers carry dashes and the papers' own code is four digits. So
 * this sits below both columns and above anything that could be mistaken for
 * them, and it is a fraction because nothing promises every paper is A4.
 */
const MARGIN_FROM = 0.75

/** Two pieces further apart than this have a space between them. */
const SPACE_GAP = 1

/**
 * Two pieces further apart than this are in different columns.
 *
 * Measured over the twelve papers rather than picked, and the first guess of 6
 * was wrong in a way only the measurement showed. **A justified line's word
 * gaps are wide.** The 2017 D&T paper sets one option flush to both margins,
 * and at 6 points it shattered into a cell per word, so an option printed as
 * plain prose would have come back as `Conduct – research – into – the`.
 *
 * Every gap in the corpus with a word on each side of it was measured: the
 * widest inside running prose is **8.4** (2018 D&T, and the 2017 line sits
 * under it). The narrowest real column boundary is **22**, an option label
 * against its own text — `A.` ends at x=111 and `Ectotherm` starts at x=133.
 * The four gaps between 8.4 and 22 are all genuine columns.
 *
 * Fourteen sits in the middle of that gap. Below it, pdf.js's own splitting
 * survives too: it breaks a run at a font change with no gap at all (`The fruit
 * fly,` then `Drosophila melanogaster`) and emits a piece per character for
 * `Q , S , R , T`, whose widest gap is 3.
 */
const CELL_GAP = 14

/** Two left edges this close are the same column. */
export const SAME_COLUMN = 2

/**
 * A ruled line for the student to write on, printed as a run of dots.
 *
 * Dropped per piece rather than per line. A whole row of them is easy to spot,
 * but a row also holding something else is not, and the papers produce exactly
 * that: the sideways margin notice puts one word on each ruled line's baseline,
 * so the row read as `............... Do`. Taking the rule out of the row leaves
 * whatever genuinely shares it.
 *
 * Four is well past an ellipsis and well short of any real line.
 */
function isRule(str: string): boolean {
  const text = str.trim()
  return /^[.…_\s]+$/.test(text) && (text.match(/[.…_]/g) ?? []).length >= 4
}

/** The geometry half of the rule, shared by the papers and the marking guides. */
export function isInMargin(x: number, pageWidth: number): boolean {
  return x >= pageWidth * MARGIN_FROM
}

/** An en dash in the guides, but a hyphen costs nothing to accept. */
const BAND = /^(\d{1,2})\s*[–-]\s*(\d{1,2})$/

function marginMark(piece: TextPiece, pageWidth: number, bands: boolean): [number, number] | null {
  const text = piece.str.trim()
  if (!isInMargin(piece.x, pageWidth)) return null
  if (/^\d{1,2}$/.test(text)) return [Number(text), Number(text)]
  if (!bands) return null
  const band = BAND.exec(text)
  return band ? [Number(band[1]), Number(band[2])] : null
}

/**
 * Group a row's pieces into the columns they were printed in.
 *
 * Pieces must already be sorted by x. A cell's text is joined the way `join`
 * joins a whole row, so a cell of one word and a row of one cell agree.
 */
function cellsOf(pieces: TextPiece[]): LineCell[] {
  const cells: { pieces: TextPiece[]; left: number; right: number }[] = []
  for (const piece of pieces) {
    const last = cells[cells.length - 1]
    if (last && piece.x - last.right < CELL_GAP) {
      last.pieces.push(piece)
      last.right = Math.max(last.right, piece.x + piece.width)
      continue
    }
    cells.push({ pieces: [piece], left: piece.x, right: piece.x + piece.width })
  }
  return cells
    .map((cell) => ({ left: cell.left, right: cell.right, text: join(cell.pieces) }))
    .filter((cell) => cell.text !== '')
}

/**
 * Are these two cells in the same column?
 *
 * By whether their spans overlap, and deliberately not by their left edges. A
 * column is centred as often as it is ranged left: on the 2025 Biology paper
 * `Body temperature` starts at x=247 and the `41.3` below it at x=280, so left
 * edges say they are different columns and the overlap says what the page says.
 */
export function sameColumn(a: Span, b: Span): boolean {
  return Math.min(a.right, b.right) > Math.max(a.left, b.left)
}

function join(pieces: TextPiece[]): string {
  let out = ''
  let end = -Infinity
  for (const piece of pieces) {
    if (out !== '' && piece.x - end > SPACE_GAP) out += ' '
    out += piece.str
    end = piece.x + piece.width
  }
  return out.replace(/\s+/g, ' ').trim()
}

/**
 * Rebuild reading order from positions.
 *
 * Pieces arrive in content-stream order, which is the order the PDF was written
 * and not the order it is read. Grouping by baseline and sorting across fixes
 * that. Page coordinates run bottom-up, so descending y is top-down.
 */
export function toLines(page: PageText, options: LineOptions = {}): Line[] {
  const { tolerance = 2, bands = false } = options
  const rows: { y: number; pieces: TextPiece[] }[] = []
  for (const piece of page.pieces) {
    if (!piece.str.trim() || isRule(piece.str)) continue
    const row = rows.find((r) => Math.abs(r.y - piece.y) <= tolerance)
    if (row) row.pieces.push(piece)
    else rows.push({ y: piece.y, pieces: [piece] })
  }

  rows.sort((a, b) => b.y - a.y)

  return rows.map((row) => {
    row.pieces.sort((a, b) => a.x - b.x)
    const marks: [number, number][] = []
    const rest: TextPiece[] = []
    for (const piece of row.pieces) {
      const mark = marginMark(piece, page.width, bands)
      if (mark) marks.push(mark)
      else rest.push(piece)
    }
    const line: Line = {
      page: page.number,
      y: row.y,
      x: rest.length > 0 ? Math.min(...rest.map((p) => p.x)) : Number.POSITIVE_INFINITY,
      text: join(rest),
      cells: cellsOf(rest),
    }
    // Only when it is the sole mark on the row. Two numbers in the margin of one
    // row is not something this understands, and guessing would be worse.
    if (marks.length === 1) {
      const [from, to] = marks[0]!
      line.marginMark = from
      if (to !== from) line.marginTo = to
    }
    return line
  })
}
