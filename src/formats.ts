/**
 * Picking the reader that fits the document a teacher handed over.
 *
 * There are three for Word documents, because NESA has published three shapes
 * of syllabus and a teacher should not have to know which one they are holding.
 * Each reader refuses a document it does not recognise rather than producing a
 * half-model, so trying them in order is safe: the first one that recognises the
 * document is the one that reads it.
 *
 * Order matters in one place. The 2013 reader runs first because a document with
 * a `Students learn about` table is that document, whatever else it also
 * contains, and because both other readers would find something to say about it.
 *
 * The fourth shape is a spreadsheet and so does not join that queue: a workbook
 * and a Word document are told apart by their extension long before either
 * reader sees them, and `readSyllabusWorkbook` takes rows where the other three
 * take XML. It is here anyway so that everything that decides what a document is
 * lives in one file.
 */

import type { PageText } from './extract'
import { parseHeadingsXml, parseProseXml } from './headings'
import { readIbDesignTechnology } from './ibdt'
import { readIbGuide } from './ibguide'
import { NotASyllabusError, parseSyllabusTables } from './syllabus'
import type { SyllabusCourse } from './types'
import type { Sheet } from './xlsx'

export type SyllabusFormat = 'tables' | 'headings' | 'prose' | 'workbook' | 'guide'

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
  workbook: 'the IB Design Technology syllabus map, one row per understanding',
  guide: 'the IB Design Technology subject guide, a topic at a time',
}

/**
 * Only the content-table reader reports anything doubtful, because it is the only
 * one where a page break can turn a content point into a heading: the other two
 * read headings that Word itself marks as headings.
 */
const READERS: [
  SyllabusFormat,
  (xml: string) => { courses: SyllabusCourse[]; suspects: string[]; groupLabel: string },
][] = [
  ['tables', parseSyllabusTables],
  // Every reform document divides a course into focus areas and calls them
  // that: Computing Technology, Biology, English Advanced and Mathematics
  // Advanced all do. Drama is read here too and divides its courses into
  // nothing, so the word never appears on its model's screen either way.
  ['headings', (xml) => ({ courses: parseHeadingsXml(xml), suspects: [], groupLabel: 'Focus area' })],
  // Visual Arts. Its groups are 8.3 to 8.5, and the syllabus calls the things
  // those sections set out the content areas.
  ['prose', (xml) => ({ courses: parseProseXml(xml), suspects: [], groupLabel: 'Content area' })],
]

export interface SyllabusReading {
  format: SyllabusFormat
  courses: SyllabusCourse[]
  /** Topic ids that may be the tail of the topic above. A question, never a decision. */
  suspects: string[]
  /**
   * The document's own word for the division a topic sits under — `Focus area`,
   * `Area of study`, `Theme`. Carried so that a screen showing the model says
   * what the syllabus in front of the teacher says, rather than picking one
   * curriculum authority's vocabulary and using it for all of them.
   *
   * Empty where the reader has no evidence, which is a document that divides
   * its courses into nothing.
   */
  groupLabel: string
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

/**
 * Read a spreadsheet as a syllabus.
 *
 * One reader, so there is nothing to choose between. It is separate from
 * `readSyllabusXml` rather than a fourth entry in it because the two take
 * different things — sheets against markup — and collapsing them would mean
 * opening every workbook as a Word document first to find out it is not one.
 *
 * @throws NotASyllabusError when the workbook is not a syllabus map.
 */
export function readSyllabusWorkbook(sheets: Sheet[]): SyllabusReading {
  return {
    format: 'workbook',
    ...readIbDesignTechnology(sheets),
    suspects: [],
    groupLabel: 'Theme',
  }
}

/**
 * Read a PDF as a syllabus.
 *
 * One reader again, and separate again for the same reason: it takes pages of
 * positioned text where the others take markup or rows. It is the IB subject
 * guide, because the IB publishes no Word export of it (#58) — a PDF is a poor
 * input and the only one there is.
 *
 * @throws NotASyllabusError when the PDF is not the guide. A teacher's folder
 *   holds past papers too, and they are offered from the same list.
 */
export function readSyllabusPdf(pages: PageText[]): SyllabusReading {
  return { format: 'guide', ...readIbGuide(pages), suspects: [], groupLabel: 'Theme' }
}
