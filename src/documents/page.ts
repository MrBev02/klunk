/**
 * A PDF page as positioned text: what every PDF reader in Klunk is given.
 *
 * Moved out of `pastpapers/extract.ts` (#173). These describe any page, not a
 * past paper, and `pdftext.ts`, `pdfimage.ts` and `textlayer.ts` in this
 * folder all take them, so leaving them in the past-paper reader made the
 * file-reading layer depend on one of the things built on top of it.
 */

/** One run of text with its position on the page, in PDF points. */
export interface TextPiece {
  /** Left edge, from the left of the page. */
  x: number
  /** Baseline, from the bottom of the page. Higher is further up. */
  y: number
  /** Advance width, so the end of the piece is known and gaps can be measured. */
  width: number
  str: string
}

export interface PageText {
  /** 1-based, in reading order. */
  number: number
  /** Page width in points, so the right margin is a fraction rather than a guess. */
  width: number
  pieces: TextPiece[]
}
