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

import type { PageText } from './extract'

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
 */
export const NO_TEXT_IN_PAPER =
  'This PDF holds no text, only a picture of each page. Use the original file if you ' +
  'have one, or write the questions yourself on the Write a question tab.'

/** The same for a marking guide, where the answers are what is lost. */
export const NO_TEXT_IN_GUIDE =
  'This PDF holds no text, only a picture of each page. Use the original file if you ' +
  'have one, or set the answers yourself as you check each question.'
