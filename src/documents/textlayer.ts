/**
 * Whether a document holds any text to read, and what to say when it does not.
 *
 * `extract.ts` and `objective.ts` decide what a question is entirely from
 * geometry. A question number is told from a table cell by sitting at the page's
 * leftmost column; a cell boundary is 14 points because the widest gap inside
 * running prose is 8.4; a mark belongs to the bullet whose vertical centre is
 * nearest it. Every one of those rules needs positioned text, and a photograph
 * or a scan carries none of it. There is no parser to write for one, at any
 * price, which is what #89 is about.
 *
 * **This is consulted only once every reader has already refused**, and that is
 * what makes it safe. A scan somebody has run text recognition over reads like
 * any other document and must not be turned away for having been scanned. The
 * question here is never "was this scanned" but "is there anything here to
 * read", and it is worth asking only when the answer is already known to be no.
 * So this can change a refusal message and can never cost a document that reads.
 *
 * **The rule is zero, and it has evidence on both sides.** Two scans of Year 11
 * Enterprise Computing exams, straight off a school copier, carry 0 text pieces
 * across all 34 of their pages: the copier ran no text recognition, and every
 * page is a single full-page image. Against that, every PDF in the content
 * folder was counted through `pagesFromDocument` after the rotated runs are
 * dropped, and none of its 385 pages is empty:
 *
 * | | |
 * |---|---|
 * | documents | 28 |
 * | pages | 385 |
 * | pages carrying no text at all | 0 |
 * | fewest on any one page | 2, a divider page of the IB guide |
 * | lowest document mean | 31 pieces per page |
 *
 * An earlier draft of this put the line at a *tenth* of that lowest mean, to
 * catch a scanner that stamps a page number onto each image. No such document
 * exists here, so that constant is not written down: it would have been a rule
 * fitted to the corpus that has the text layer rather than to the one that does
 * not. If a stamping scanner turns up it is a new finding and a new rule.
 */

import type { PageText } from './page'

/**
 * Is every page of this document a picture, with no text anywhere in it?
 *
 * False for a document with no pages at all, which is a broken file rather than
 * a scan, and whose refusal should say what it says today.
 */
export function hasNoText(pages: PageText[]): boolean {
  return pages.length > 0 && pages.every((page) => page.pieces.length === 0)
}

/**
 * What to tell a teacher who has handed over a picture of a paper.
 *
 * "The original file" rather than the original PDF: these arrived as a scan of a
 * school's own exam, which was written in Word and is somewhere on the school's
 * drive.
 *
 * **Both of these sent the teacher off to do by hand what the panel directly
 * below now offers to do**, and the guide's was the worse of the two: *set the
 * answers yourself as you check each question*, printed above a step that reads
 * the whole marking guide. The wording is #89's, written when the refusal was
 * the end of the screen, and driving the real scanned pair is what showed it
 * still standing there (#94).
 */
export const NO_TEXT_IN_PAPER =
  'This PDF holds no text, only a picture of each page. Transcribe it with an AI below, ' +
  'or use the original file if you have one.'

/** The same for a marking guide, where the answers are what is lost. */
export const NO_TEXT_IN_GUIDE =
  'This PDF holds no text, only a picture of each page. Read it with an AI below, or use ' +
  'the original file if you have one.'

/* ------------------------------------------------- a paper set as mathematics */

/**
 * Fonts that exist only to set mathematics (#198).
 *
 * A NESA mathematics paper reads to the right number of questions and the right
 * marks, and nearly every formula in it is wrong: an exponent drops to the
 * baseline (`t − 8t + 12` for t² − 8t + 12), π and θ come out as `p` and `q`,
 * `f`, ∫ and √ vanish, and the 2026 paper's brackets read as `^x − 1h`. A
 * count-based check cannot see any of it, and neither can the text, because
 * `p` and `q` are ordinary letters. The fonts can.
 *
 * Measured over every PDF in the content folder that has text, 30 documents.
 * The 2025 and 2026 HSC Mathematics Advanced papers and the 2025 marking guide
 * all set formulas in `SymbolGreekII-Italic`, two of them in MathMagic's
 * `MMaVariableA`/`B`, `MMBinary` and `MMEtc`, and the 2026 paper in
 * `EuclidSymbol` and `EuclidExtra`. None of the other 27, eleven years of
 * Design and Technology papers and guides, the Biology pair and the IB papers
 * and guide, uses any font on this list. The rest of the list is not from the
 * corpus: they are the maths fonts of MathType, TeX and Word's equation editor,
 * named because they mean the same thing and a school's own paper will be set
 * in one of them.
 *
 * **Plain `Symbol` is left off deliberately.** Word sets its bullet points in
 * it, so a school paper with a bulleted list would be refused for nothing.
 * `AppleSymbols` is left off for the same reason: both maths papers use it, but
 * it is a general symbol font.
 */
const MATHEMATICS_FONT =
  /^(SymbolGreek|MMa|MMBinary|MMEtc|Euclid|MT ?Extra|MathematicalPi|MT(SY|MI|EX)|CM(MI|SY|EX)\d|LMMath|LatinModernMath|STIX(Two)?Math|CambriaMath|Cambria-Math|AsanaMath)/i

/**
 * How many runs in a mathematics font make a paper a mathematics paper.
 *
 * Not one, because a science paper may set a single μ or Ω in a Greek symbol
 * font and is not thereby unreadable. The fewest in any of the three
 * mathematics documents is 26, the 2025 paper's `SymbolGreekII-Italic` alone;
 * the most in any other document is none.
 */
const MATHEMATICS_PIECES = 10

/**
 * Is this document set as mathematics, which no text reader can keep?
 *
 * **Asked before any reader, unlike `hasNoText`,** because every reader takes
 * a mathematics paper and reads it confidently wrong. So this can cost a
 * document that reads, and the evidence for it is the measurement above.
 */
export function isSetAsMathematics(pages: PageText[]): boolean {
  let count = 0
  for (const page of pages) {
    for (const piece of page.pieces) {
      if (piece.font !== undefined && MATHEMATICS_FONT.test(piece.font)) count += 1
      if (count >= MATHEMATICS_PIECES) return true
    }
  }
  return false
}

/** What to tell a teacher who has handed over a mathematics paper. */
export const MATHEMATICS_IN_PAPER =
  'Transcribe this paper with an AI below. Its formulas are set in mathematics fonts, ' +
  'which Klunk cannot read from a PDF.'

/** The same for its marking guide. */
export const MATHEMATICS_IN_GUIDE =
  'Read this marking guide with an AI below. Its formulas are set in mathematics fonts, ' +
  'which Klunk cannot read from a PDF.'
