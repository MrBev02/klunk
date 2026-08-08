/**
 * Picking the reader that fits the past paper a teacher handed over.
 *
 * The sibling of `src/formats.ts`, and deliberately the same shape, because it
 * is the same problem: a teacher should not have to know which kind of document
 * they are holding, and a reader that refuses what it does not recognise is what
 * makes trying them in order safe.
 *
 * Order matters here for one reason. The NESA reader runs first because a NSW
 * HSC paper is that paper whatever else it also contains: its Section I prints
 * ten numbered questions with four options each, which is close enough to an
 * objective paper that the second reader would find something to say about it,
 * and it would say it about ten questions out of fourteen.
 *
 * There is no third entry and there does not need to be one for this to earn its
 * place. Until #64 the paper side had a single reader and no way to refuse, so a
 * document it could not read produced zero questions, zero explanation, and a
 * panel that then said everything had been saved.
 */

import { NotAPaperError, type ExtractedPaper, extractPaper, type PageText } from './extract'
import { readObjectivePaper } from './objective'

export type PaperFormat = 'nesa' | 'objective'

/**
 * What to tell a teacher the paper was read as.
 *
 * Worth saying on screen for the reason `FORMAT_DESCRIPTIONS` is: if Klunk has
 * taken the document for the wrong shape, the questions underneath will look
 * wrong and this line is what says why.
 */
export const PAPER_FORMAT_DESCRIPTIONS: Record<PaperFormat, string> = {
  nesa: 'a NSW HSC examination, with Sections I to III and its marks in the margin',
  objective: 'a paper of numbered multiple-choice questions',
}

const READERS: [PaperFormat, (pages: PageText[]) => ExtractedPaper][] = [
  ['nesa', extractPaper],
  ['objective', readObjectivePaper],
]

export interface PaperReading {
  format: PaperFormat
  paper: ExtractedPaper
}

/**
 * Read a PDF as a past paper, whichever shape it is.
 *
 * @throws NotAPaperError when no reader recognises it, carrying the list of what
 *   Klunk does read. What each reader looked for is left out for the reason
 *   `readSyllabusXml` leaves it out: it is the shape of the markup, and a
 *   teacher cannot act on it. What they can act on is knowing which documents
 *   work and that this one is not one of them.
 */
export function readPastPaper(pages: PageText[]): PaperReading {
  for (const [format, read] of READERS) {
    try {
      return { format, paper: read(pages) }
    } catch (err) {
      if (!(err instanceof NotAPaperError)) throw err
    }
  }

  throw new NotAPaperError(
    'Klunk could not read any questions in this document. It reads a NSW HSC ' +
      'examination, which prints Section I, II and III headings and a heading like ' +
      '"Question 11 (5 marks)" above each question, and a paper of numbered ' +
      'multiple-choice questions, printed as "1." with four options labelled A to D. ' +
      'This document is neither.',
  )
}
