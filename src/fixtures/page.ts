/**
 * Building a page of positioned text from something that reads like a page.
 *
 * Shared by the extractor's tests and the marking guide's, because both are
 * testing geometry and two copies of the geometry would drift. The fixtures
 * themselves are fictional — the real papers are NESA's and cannot enter this
 * repo — but the *shapes* are measured from the 2015–2025 corpus and are the
 * point of the exercise.
 */

import type { PageText } from '../extract'

/** Points per character. Only the ratio to page width matters. */
const CHAR = 5
/** A4 in points, so the right margin lands where the real papers put it. */
export const PAGE_WIDTH = 595

/**
 * The column the real papers put their marks in.
 *
 * x=518 of 595 measured across the corpus, which is column 103 at five points to
 * the character. Fixtures place marks here rather than "somewhere off to the
 * right" so that the geometry being tested is the geometry that exists.
 */
export const MARK_COLUMN = 103

/**
 * Build a page from layout-style strings, one per line.
 *
 * The column a run of text starts in becomes its x, so a fixture reads as the
 * page it stands for and the marks in the right margin are genuinely in the
 * right margin. Runs are separated by two or more spaces, which is what tells a
 * column apart from a word gap.
 */
export function page(number: number, ...lines: string[]): PageText {
  const pieces = lines.flatMap((line, row) => {
    const y = 800 - row * 12
    const out: { x: number; y: number; width: number; str: string }[] = []
    const re = /\S(?:.*?\S)?(?=\s{2,}|$)/g
    let match: RegExpExecArray | null
    while ((match = re.exec(line)) !== null) {
      out.push({ x: match.index * CHAR, y, width: match[0].length * CHAR, str: match[0] })
    }
    return out
  })
  return { number, width: PAGE_WIDTH, pieces }
}

/** Pieces deliberately out of reading order, as a content stream supplies them. */
export function shuffled(p: PageText): PageText {
  return { ...p, pieces: [...p.pieces].reverse() }
}

/** A line of text with its marks in the margin. */
export function marked(text: string, marks: number | string): string {
  return text.padEnd(MARK_COLUMN, ' ') + marks
}

/** The marks alone on a line, as happens when they centre against wrapped text. */
export function markOnly(marks: number | string): string {
  return ''.padEnd(MARK_COLUMN, ' ') + marks
}
