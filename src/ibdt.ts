/**
 * Reading the IB DP Design Technology syllabus map into a model (#4).
 *
 * The IB publishes its guide through the Programme Resource Centre, licensed,
 * and there is no Word export of it. What a teacher can actually hold is the
 * old-vs-new syllabus map published alongside the change: a spreadsheet whose
 * first sheet is the whole new syllabus, one row per understanding, with the
 * theme, the level of organization, the topic, the understanding, what students
 * must be able to do with it, and whether it is SL and HL or HL only.
 *
 * So this reads that sheet. The same posture as every other reader: the
 * document is the teacher's own copy, the model is written into the teacher's
 * own folder, and Klunk ships neither.
 *
 * **Why the columns and not the coordinates.** The sheet is found by its header
 * row — six headings that name what each column holds — and everything after is
 * read relative to where those headings landed. A reader keyed on "theme is
 * column A" is a reader fitted to one save of one file, which is the mistake
 * `CLAUDE.md` records against the Textiles page-break rule. If the header is not
 * there this refuses the workbook rather than reading eight sheets of assessment
 * comparison as content.
 *
 * **Why two courses out of one sheet.** SL and HL are one syllabus: HL is
 * everything SL has plus eleven further topics. The marker is per understanding,
 * but in this document it never splits a topic — every topic is wholly SL and HL
 * or wholly HL only — and `readIbDesignTechnology` checks that rather than
 * assuming it, because a topic that was half HL would come out of a naive split
 * with its SL half silently missing. Visual Arts already establishes that two
 * courses may share content (`CLAUDE.md`); this is the same shape with the
 * sharing one-way.
 */

import { NotASyllabusError } from './syllabus'
import type { SyllabusCourse, SyllabusPoint, SyllabusTopic } from './types'
import { carryDown } from './xlsx'

/**
 * The header contract, lower-cased. A workbook without all six is not this
 * document and is refused.
 *
 * Matched as "the heading starts with this", because the published sheet writes
 * the level column `Level of organization` and nothing stops a later edition
 * appending a note to a heading. Starting-with is enough to tell six columns
 * apart and survives that; equality is not.
 */
const HEADINGS = {
  theme: 'theme',
  level: 'level of organization',
  topic: 'topic number and name',
  understanding: 'understandings number and name',
  content: 'understandings content',
  level_of_study: 'sl and hl or hl only',
} as const

type Column = keyof typeof HEADINGS

/** What the `SL and HL or HL only` column says when a row is HL only. */
const HL_ONLY = 'hl'

export interface IbCourseCounts {
  topics: number
  points: number
}

/**
 * Read the syllabus map into an SL course and an HL course.
 *
 * @param sheets Every worksheet in the workbook, as `readWorkbook` returns them.
 * @throws NotASyllabusError when no sheet carries the header contract, or when
 *   one does but a topic is split across the two levels of study.
 */
export function readIbDesignTechnology(sheets: { name: string; rows: string[][] }[]): {
  courses: SyllabusCourse[]
} {
  const found = findContentSheet(sheets)
  if (!found) {
    throw new NotASyllabusError(
      'Klunk could not find a syllabus in this spreadsheet. Check that you picked the ' +
        'old-to-new syllabus map rather than another spreadsheet in your folder. Klunk ' +
        'looks for a sheet with columns headed Theme, Level of organization, Topic number ' +
        'and name, Understandings number and name, Understandings content, and SL and HL ' +
        'or HL only, and no sheet in this one has all six.',
    )
  }

  const topics = readTopics(found.rows, found.at)
  if (topics.length === 0) {
    throw new NotASyllabusError(
      'Klunk found the right column headings in this spreadsheet but no topics under them.',
    )
  }

  // The split is by topic, so a topic whose understandings disagree cannot be
  // put in either course without losing some of them. Checked rather than
  // assumed: it holds in the published map, but it is a fact about that
  // document and not about the format, and the failure would be silent.
  const mixed = topics.filter((t) => t.points.some((p) => p.hlOnly !== isHlOnly(t)))
  if (mixed.length > 0) {
    throw new NotASyllabusError(
      `${mixed.map((t) => t.name).join(', ')} has some content marked HL only and some ` +
        'marked SL and HL. Klunk sorts this syllabus into a Standard level course and a ' +
        'Higher level course one whole topic at a time, so it cannot place a topic that is ' +
        'both. Correct the SL and HL or HL only column for that topic and read it again.',
    )
  }

  return {
    courses: [
      {
        id: 'sl',
        name: 'Standard level',
        topics: topics.filter((t) => !isHlOnly(t)).map(toTopic),
      },
      { id: 'hl', name: 'Higher level', topics: topics.map(toTopic) },
    ],
  }
}

/* ------------------------------------------------------------------- reading */

interface Read {
  /** `A1-1`, from the published `A1.1`. */
  id: string
  /** `A1.1 People: Ergonomics`. */
  name: string
  /** The topic heading as the sheet writes it, for checking against the guide. */
  text: string
  /** The theme, e.g. `A. Design in theory`. */
  group: string
  points: { text: string; hlOnly: boolean }[]
}

/** Every understanding in the topic is HL only, which `readTopics` guarantees. */
function isHlOnly(read: Read): boolean {
  return read.points[0]?.hlOnly ?? false
}

function toTopic(read: Read): SyllabusTopic {
  const points: SyllabusPoint[] = read.points.map((p, i) => ({
    id: `${read.id}.${i + 1}`,
    text: p.text,
  }))
  return { id: read.id, name: read.name, text: read.text, group: read.group, points }
}

/**
 * The first sheet carrying all six headings, and which row they are on.
 *
 * Searched rather than assumed to be the first sheet: this workbook opens with
 * three title lines and a legend before the header row, and a later edition may
 * open with more or reorder the sheets.
 */
function findContentSheet(
  sheets: { name: string; rows: string[][] }[],
): { rows: string[][]; at: Record<Column, number> } | null {
  for (const sheet of sheets) {
    for (const [index, row] of sheet.rows.entries()) {
      const at = columnsIn(row)
      if (at) return { rows: sheet.rows.slice(index + 1), at }
    }
  }
  return null
}

function columnsIn(row: string[]): Record<Column, number> | null {
  const at = {} as Record<Column, number>

  for (const [column, heading] of Object.entries(HEADINGS) as [Column, string][]) {
    // First match, and the direction matters. This sheet sets the new syllabus
    // out beside the one it replaces, so `SL and HL or HL only` heads two
    // columns: the new course's and the 2020 course's. The new one is to the
    // left of the old one throughout, so the first match is the new course and
    // the last would model the course being retired.
    const found = row.findIndex((cell) => cell.trim().toLowerCase().startsWith(heading))
    if (found < 0) return null
    at[column] = found
  }

  return at
}

function readTopics(rows: string[][], at: Record<Column, number>): Read[] {
  const topics: Read[] = []

  // Theme and level are merged down the block they cover, so all but the first
  // row of each is blank in the markup rather than blank in the syllabus.
  for (const row of carryDown(rows, [at.theme, at.level])) {
    const cell = (column: Column) => (row[at[column]] ?? '').trim()

    const heading = cell('topic')
    const understanding = cell('understanding')
    const hlOnly = cell('level_of_study').toLowerCase().startsWith(HL_ONLY)

    if (heading) {
      const number = numberOf(heading)
      if (number) {
        topics.push({
          id: number.replace(/\./g, '-'),
          name: nameFor(number, cell('level'), heading),
          text: heading,
          group: cell('theme'),
          points: [],
        })
      }
    }

    const open = topics[topics.length - 1]
    if (!understanding || !open) continue
    open.points.push({ text: pointText(understanding, cell('content')), hlOnly })
  }

  return topics.filter((t) => t.points.length > 0)
}

/** `A1.1` out of `A1.1 Ergonomics`, or nothing if the row is not a topic. */
function numberOf(heading: string): string | null {
  return /^([A-Z]\d+\.\d+)\b/.exec(heading)?.[1] ?? null
}

/**
 * `A1.1 People: Ergonomics`.
 *
 * The level of organization is folded into the topic name rather than into the
 * group, because the schema has one grouping level and the theme is the one
 * worth having there — three groups of eight read well in a topic list where
 * twelve of two would not. Folding it here means nothing published is dropped:
 * the theme is the group, the level is in the name, and both are on screen
 * wherever a topic is.
 *
 * `(HL only)` is stripped. It is true of the topic and is said by the topic
 * being in the HL course and not the SL one, so leaving it in the name would
 * put it on screen twice — and inside the SL course it can never appear at all,
 * so a name that carried it would be wrong there rather than merely redundant.
 */
function nameFor(number: string, level: string, heading: string): string {
  const title = heading
    .slice(number.length)
    .replace(/\s*\(HL only\)\s*$/i, '')
    .trim()
  const where = level.replace(/^\d+\.\s*/, '').trim()
  return where ? `${number} ${where}: ${title}` : `${number} ${title}`
}

/**
 * The understanding and what students must do with it, as one content point.
 *
 * Two columns and one point, because they are one thing said twice over: the
 * understanding states what is true and the content states what a student must
 * be able to do about it. The second is where the command term lives — describe,
 * explain, discuss — which is the most useful line on the page to a person
 * writing a question, so dropping it to keep the point short would drop the
 * reason for reading the sheet.
 */
function pointText(understanding: string, content: string): string {
  const opening = understanding.trim()
  if (!content) return opening

  // Nineteen of the map's understandings end without a full stop, and joined as
  // they are those read "…produced in a range of sizes Students must be able
  // to…". Adding the stop is the smallest repair that keeps the sentence a
  // sentence, and it is unambiguous — the next word is always the start of a new
  // one. Anything already punctuated is left exactly as published.
  const stopped = /[.?!:;]$/.test(opening) ? opening : `${opening}.`
  return `${stopped} ${content.trim()}`
}

/** The counts, for a caller that wants them without walking the courses. */
export function countIb(courses: SyllabusCourse[]): Record<string, IbCourseCounts> {
  const out: Record<string, IbCourseCounts> = {}
  for (const course of courses) {
    out[course.id] = {
      topics: course.topics.length,
      points: course.topics.reduce((n, t) => n + (t.points?.length ?? 0), 0),
    }
  }
  return out
}
