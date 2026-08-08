/**
 * Picking the reader that fits the marking guide a teacher handed over.
 *
 * The sibling of `src/paperformats.ts`, deliberately the same shape for the same
 * reason: a teacher should not have to know which kind of document they are
 * holding, and a reader that refuses what it does not recognise is what makes
 * trying readers in order safe.
 *
 * NESA runs first, as it does on the paper side. The two cannot claim each
 * other's documents anyway — NESA's key rows are `1 D` and the grid reader wants
 * `1. D` — but the order costs nothing and the asymmetry would be a thing to
 * remember rather than a thing that is true.
 */

import type { PageText } from './extract'
import { readAnswerKey } from './answerkey'
import { type ExtractedGuide, NotAGuideError, extractGuide } from './guide'

export type GuideFormat = 'nesa' | 'answerkey'

/**
 * What to tell a teacher the marking guide was read as.
 *
 * Worth saying for the reason the paper's is: if Klunk has taken the document
 * for the wrong shape, the answers underneath are what look wrong, and this is
 * the line that says why.
 */
export const GUIDE_FORMAT_DESCRIPTIONS: Record<GuideFormat, string> = {
  nesa: 'a NSW HSC marking guide, with an answer key and a criteria table for each question',
  answerkey: 'a markscheme listing each question number against its answer',
}

const READERS: [GuideFormat, (pages: PageText[]) => ExtractedGuide][] = [
  ['nesa', extractGuide],
  ['answerkey', readAnswerKey],
]

export interface GuideReading {
  format: GuideFormat
  guide: ExtractedGuide
}

/**
 * Read a PDF as a marking guide, whichever shape it is.
 *
 * @throws NotAGuideError when no reader recognises it.
 */
export function readMarkingGuide(pages: PageText[]): GuideReading {
  for (const [format, read] of READERS) {
    try {
      return { format, guide: read(pages) }
    } catch (err) {
      if (!(err instanceof NotAGuideError)) throw err
    }
  }

  throw new NotAGuideError(
    'Klunk could not read any answers in this document. It reads a NSW HSC marking ' +
      'guide, which prints a "Question Answer" key and a criteria table for each ' +
      'question, and a markscheme listing each question number against its answer, ' +
      'such as "1. D". This document is neither.',
  )
}
