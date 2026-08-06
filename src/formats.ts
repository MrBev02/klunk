/**
 * Picking the reader that fits the document a teacher handed over.
 *
 * There are three, because NESA has published three shapes of syllabus and a
 * teacher should not have to know which one they are holding. Each reader
 * refuses a document it does not recognise rather than producing a half-model,
 * so trying them in order is safe: the first one that recognises the document
 * is the one that reads it.
 *
 * Order matters in one place. The 2013 reader runs first because a document with
 * a `Students learn about` table is that document, whatever else it also
 * contains, and because both other readers would find something to say about it.
 */

import { parseHeadingsXml, parseProseXml } from './headings'
import { NotASyllabusError, parseSyllabusTables } from './syllabus'
import type { SyllabusCourse } from './types'

export type SyllabusFormat = 'tables' | 'headings' | 'prose'

/**
 * What to tell a teacher the document was read as.
 *
 * Worth saying on screen: three shapes read into one model, and if Klunk has
 * taken the document for the wrong one, the counts underneath will look wrong
 * and this line says why.
 */
export const FORMAT_DESCRIPTIONS: Record<SyllabusFormat, string> = {
  tables: 'a Stage 6 syllabus that sets out its content in a table',
  headings: 'a syllabus that sets out each topic under Outcomes and Content headings',
  prose: 'an older syllabus whose content is written as numbered sections of prose',
}

/**
 * Only the content-table reader reports anything doubtful, because it is the only
 * one where a page break can turn a content point into a heading: the other two
 * read headings that Word itself marks as headings.
 */
const READERS: [SyllabusFormat, (xml: string) => { courses: SyllabusCourse[]; suspects: string[] }][] =
  [
    ['tables', parseSyllabusTables],
    ['headings', (xml) => ({ courses: parseHeadingsXml(xml), suspects: [] })],
    ['prose', (xml) => ({ courses: parseProseXml(xml), suspects: [] })],
  ]

export interface SyllabusReading {
  format: SyllabusFormat
  courses: SyllabusCourse[]
  /** Topic ids that may be the tail of the topic above. A question, never a decision. */
  suspects: string[]
}

/**
 * Read a Word document as a syllabus, whichever shape it is.
 *
 * @throws NotASyllabusError when no reader recognises it, carrying what each one
 *   looked for, since that is the only thing a teacher can act on.
 */
export function readSyllabusXml(xml: string): SyllabusReading {
  for (const [format, read] of READERS) {
    try {
      return { format, ...read(xml) }
    } catch (err) {
      if (!(err instanceof NotASyllabusError)) throw err
    }
  }

  // What each reader looked for and did not find is left out on purpose. It is
  // the shape of the markup, and a teacher cannot act on it. What they can act
  // on is the list of documents Klunk does read.
  throw new NotASyllabusError(
    'Klunk could not find any course content in this document. It reads a Stage 6 ' +
      'syllabus that sets out its content in a table, one that sets out each topic ' +
      'under Outcomes and Content headings, and an older one written as numbered ' +
      'sections of prose. This document is none of those.',
  )
}
