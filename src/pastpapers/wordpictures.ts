/**
 * Which of a Word paper's pictures belong to which transcribed question (#207).
 *
 * A transcribed paper has no positions, so nothing can be cut from it. A `.docx`
 * does not need cutting: each picture is a whole file, and in the one school
 * paper looked at each question is one table row whose first cell is its
 * number, with its pictures in that row. So a picture belongs to a question by
 * the document's structure rather than by where the text is not, which is a
 * firmer footing than `picturesFor` has on a PDF.
 *
 * This places pictures and nothing else. #201 decided against a Word reader,
 * and the questions still come from the AI's reply.
 */

import { readZipBytes, readZipMember } from '../documents/docx'
import { imageType, pictureRows, type PictureRow, type RowPicture } from '../documents/docxmedia'

/** A numbered question row, with every picture that may belong to it. */
export interface WordQuestion {
  number: number
  pictures: RowPicture[]
}

// A cell holding a number and nothing else. Word's runs leave "1 ." on that
// paper, so the space before the full stop is allowed.
const NUMBER_CELL_RE = /^(?:Q(?:uestion)?\s*)?(\d{1,3})\s*[.)]?$/i

/**
 * The numbered rows of every table, in paper order.
 *
 * A row whose first cell is not a number carries on the question above it in
 * the same table, which is how a question set over two rows keeps a picture in
 * its second. A new table starts afresh, so a picture under a band heading is
 * not handed to the last question of the band before. A table nested inside a
 * question's row, as the Support band's Question 1 sets its sub-questions, is
 * part of that row and never a row of its own.
 */
export function wordQuestions(rows: PictureRow[]): WordQuestion[] {
  const out: WordQuestion[] = []
  let current: WordQuestion | undefined
  let table = -1
  for (const row of rows) {
    if (row.table !== table) {
      table = row.table
      current = undefined
    }
    const number = (row.cells[0] ?? '').trim().match(NUMBER_CELL_RE)?.[1]
    if (number !== undefined) {
      current = { number: Number(number), pictures: [] }
      out.push(current)
    }
    if (current) current.pictures.push(...row.pictures.filter((p) => !isFormulaPicture(p)))
  }
  return out
}

/**
 * A formula set as a picture by Efofex FX Equation.
 *
 * Efofex writes the formula in spoken English into the alt text, followed by
 * `efofex://…` and its own `FXData:` payload, so it names itself. Nine of
 * the nineteen pictures in the Year 8 paper's questions are these, and the
 * transcription prompt already sends a formula to text (#201): attaching the
 * picture as well would set it on the paper twice.
 *
 * Only `fxe`. Efofex's FX Draw writes the same `FXData:` payload under
 * `efofex://fxd/…`, and that is a diagram: the Term 2 Year 8 paper draws a
 * sector and a triangle with it, and an earlier test of the word `efofex` alone
 * dropped both.
 *
 * A pasted screenshot of a formula says nothing about itself and cannot be told
 * from a diagram here. That is what the reply's own description decides.
 */
export function isFormulaPicture(picture: RowPicture): boolean {
  return /efofex:\/\/fxe\//i.test(picture.alt)
}

/** A transcribed question, as much of it as placing a picture needs. */
export interface ReplyQuestion {
  /** The number it was printed with, where that is a plain number. */
  number?: number | undefined
  /** The section the reply put it in, where it named one. */
  section?: string | undefined
}

/**
 * The pictures for each transcribed question, or null where the paper and the
 * reply cannot be lined up.
 *
 * A paper that numbers its questions once is matched by number, since each
 * number names one row. One that numbers each band from 1, as both Year 8
 * papers do, has five rows numbered 1, and the number alone cannot say which.
 * Walking forward through the paper from the last match used to decide it, so
 * a reply that left out the first band gave its own Question 1 the first
 * band's pictures, kept them, and took back the warning that would have caught
 * it. Bands are now paired by order, and only where the reply has as many as
 * the paper: a band left out, or one more, and nothing is placed.
 *
 * The reply's section names are used to tell its bands apart, never to match
 * them to the paper's headings, which the two need not agree on. Where they
 * are inconsistent the reply splits into more bands than the paper has, and
 * the answer is null rather than a guess.
 */
export function placeWordPictures(
  replies: ReplyQuestion[],
  questions: WordQuestion[],
): RowPicture[][] | null {
  const bands = paperBands(questions)
  const told = replyBands(replies)
  if (bands.length > 1 && told.length !== bands.length) return null
  const out: RowPicture[][] = replies.map(() => [])
  for (const [b, members] of told.entries()) {
    // One band in the paper takes every band of the reply, its numbers being unique.
    const rows = bands.length === 1 ? bands[0]! : bands[b]!
    let cursor = 0
    for (const r of members) {
      const number = replies[r]!.number
      if (number === undefined) continue
      const at = rows.findIndex((q, i) => i >= cursor && q.number === number)
      if (at < 0) continue
      cursor = at + 1
      out[r] = rows[at]!.pictures
    }
  }
  return out
}

/** The paper's rows split where the numbering starts again. */
function paperBands(questions: WordQuestion[]): WordQuestion[][] {
  const bands: WordQuestion[][] = []
  let last = Infinity
  for (const q of questions) {
    if (q.number <= last) bands.push([])
    bands[bands.length - 1]!.push(q)
    last = q.number
  }
  return bands
}

/**
 * The reply's questions, by index, split where its numbering starts again or
 * its section changes. Either alone misses a case: a band whose first questions
 * were left out can carry on upwards from the band before, and a reply need not
 * name its sections at all.
 */
function replyBands(replies: ReplyQuestion[]): number[][] {
  const bands: number[][] = []
  let number: number | undefined
  let section: string | undefined
  for (const [i, r] of replies.entries()) {
    const name = r.section?.trim().toLowerCase() || undefined
    const restarts =
      bands.length === 0 ||
      (r.number !== undefined && number !== undefined && r.number <= number) ||
      (name !== undefined && section !== undefined && name !== section)
    if (restarts) bands.push([])
    bands[bands.length - 1]!.push(i)
    if (r.number !== undefined) number = r.number
    if (name !== undefined) section = name
  }
  return bands
}

/** A picture taken whole out of a Word paper, ready for a card. */
export interface WordPicture {
  blob: Blob
  /** For showing it on the card. Like a cut-out's, never revoked. */
  url: string
  /** The lettered option it sits beside in the paper, counting A as 0 (#238). */
  choice?: number
}

/**
 * The pictures each transcribed question should be offered, read out of the
 * paper, or null where its bands and the reply's cannot be lined up.
 *
 * A picture a browser cannot draw is passed over, as is a formula Efofex set:
 * neither would be any use on a card.
 */
export async function wordPicturesFor(
  bytes: ArrayBuffer,
  replies: ReplyQuestion[],
): Promise<WordPicture[][] | null> {
  const document = await readZipMember(bytes, 'word/document.xml')
  const rels = await readZipMember(bytes, 'word/_rels/document.xml.rels')
  const placed = placeWordPictures(replies, wordQuestions(pictureRows(document, rels)))
  if (placed === null) return null
  const out: WordPicture[][] = []
  for (const pictures of placed) {
    const mine: WordPicture[] = []
    for (const picture of pictures) {
      const type = imageType(picture.member)
      if (type === undefined) continue
      const blob = new Blob([await readZipBytes(bytes, picture.member)], { type })
      const url = URL.createObjectURL(blob)
      mine.push(
        picture.choice === undefined ? { blob, url } : { blob, url, choice: picture.choice },
      )
    }
    out.push(mine)
  }
  return out
}
