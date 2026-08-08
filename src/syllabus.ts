/**
 * Building a Klunk syllabus model from a NESA Stage 6 (2013) syllabus.
 *
 * A port of `tools/nesa_stage6_syllabus.py`, which asked a teacher to open a
 * terminal and run Python with three flags — the one place left where the app
 * gave up on its own premise that nobody should have to touch a file.
 *
 * Moving it here changes where the generator runs and nothing else. Klunk still
 * ships no syllabus model: a syllabus is copyright, the NESA Stage 6 (2013)
 * notice permits a NSW teacher to copy reasonable portions for bona fide study
 * and forbids reproducing a major extract, and a complete content inventory
 * republished on the public web is not a reasonable portion under anyone's
 * reading. The teacher generates from their own copy into their own folder,
 * exactly as before.
 *
 * This takes XML and no file, the way `extract.ts` takes positioned text and no
 * PDF, so every rule below is testable without a `.docx` anywhere near it.
 *
 * The rules each cost real effort to establish and are commented where they are
 * not obvious. The two that were wrong for a long time without changing any
 * count are the group heading (#14) and course membership.
 */

import { blocks, tidyHeading, type CellNote, type Table } from './ooxml'
import type { Syllabus, SyllabusCourse, SyllabusOutcome, SyllabusTopic } from './types'

/* ----------------------------------------------------------------- the rules */

// "P1.1examines design theory and practice" — the code and its text sit in
// separate runs of one paragraph, so they arrive concatenated.
const OUTCOME_RE = /^([A-Z]{1,2}\d+\.\d+)\s*([\s\S]*)$/

// Which course a content table belongs to is stated in the heading above it.
// Not anchored to the start: Word concatenates the section number onto the
// heading text, so the paragraph reads "8Content: ... Preliminary Course".
// Table-of-contents entries match this too, but they all appear before the
// tables and each heading overwrites the last, so the nearest one still wins.
const COURSE_HEADING_RE = /Content:[\s\S]*?\b(Preliminary|HSC)\b/i

// Industrial Technology never writes "Content: ... HSC". It splits the course
// into focus areas and marks each one "(Preliminary)" or "(HSC)". Without this,
// every focus area inherits the last Content: heading and the whole Preliminary
// half is filed under HSC.
const COURSE_MARKER_RE = /\((Preliminary|HSC)\)/i

// The group a topic sits in, taken only from a heading that says it is one.
//
// This used to accept any short paragraph that did not end in a full stop, on
// the theory that a heading looks different from prose. It does not look
// different enough. Design and Technology filed all forty of its topics under
// "7.2Key Competencies", a numbered section heading from the document
// furniture, and Textiles picked up a stray line listing footwear trades for
// three of its topics (#14). Both syllabuses label their real groups, so the
// label is the signal.
//
// Design and Technology has neither, and should not: it is one content table
// per course, so there is nothing for a group to divide. No label, no group.
//
// The word itself is captured as well as the name, because it is the word a
// teacher reads on the page in front of them: Textiles divides its courses into
// areas of study and Industrial Technology into focus areas, and a screen that
// calls both a "focus area" is inventing a vocabulary neither document uses.
const FOCUS_AREA_RE =
  /^\s*(?:\d+(?:\.\d+)*\s*)?(area\s+of\s+study|focus\s+area)\s*[:–—-]\s*([\s\S]+)$/i

// "Focus Area: Automotive Technologies (Preliminary)" names the course too, and
// that belongs to the course, not to the name of the area.
const COURSE_SUFFIX_RE = /\s*\((?:Preliminary|HSC)\)\s*$/i

// A topic heading often ends by announcing its own list.
const TRAILING_NOISE_RE = /[,;]?\s*includ(?:ing|es)\s*[:;.]?\s*$/i

// A row whose "Students learn about" cell opens with a list marker is not a new
// topic. It is the tail of the one above, which ran past the bottom of a page:
// Word starts a fresh table row after the break, and the list carries on from
// where it stopped. Textiles HSC does this once, at "iv)", and the row was read
// as a topic named after a content point with the five points that followed it
// hanging underneath (#26).
//
// The same shape as the "Question N (continued)" blocks in the past papers, and
// the same rule: merge into the parent rather than register a new one.
//
// Only a marker in brackets, which is what NESA prints. A full stop after the
// numeral would also match "i.e." at the start of a heading.
const CONTINUATION_RE = /^\s*(?:[ivxlcdm]+|[a-z]|\d+)\)/

const CONTENT_HEADERS = ['outcomes', 'students learn about', 'students learn to']

/* ------------------------------------------------------------------ reading */

/**
 * Which content-table layout a table uses, if any.
 *
 * NESA Stage 6 (2013) syllabuses use two, and a generator that assumes either
 * one silently handles half the faculty:
 *
 * - `wide`: one table per course, three columns, `Outcomes | Students learn
 *   about | Students learn to`, the outcome cell blank on continuation rows.
 *   Design and Technology.
 * - `narrow`: many small tables, two columns, no outcome column at all. Each
 *   row is one topic and the outcomes appear as paragraphs above the table.
 *   Textiles and Design, Industrial Technology, Food Technology.
 */
export function tableLayout(rows: string[][][]): 'wide' | 'narrow' | null {
  const first = rows[0]
  if (!first) return null
  const header = first.map((c) => c.join(' ').trim().toLowerCase().replace(/:+$/, ''))

  const startsWith = (from: number, want: string[]) =>
    want.every((w, i) => (header[from + i] ?? '').startsWith(w))

  if (header.length >= 3 && startsWith(0, CONTENT_HEADERS)) return 'wide'
  if (header.length >= 2 && startsWith(0, CONTENT_HEADERS.slice(1))) return 'narrow'
  return null
}

/**
 * Which course a block of content belongs to.
 *
 * In the narrow layout nothing names the course, but the outcome codes do:
 * NESA prefixes Preliminary outcomes with P and HSC outcomes with H. Falling
 * back to the nearest "Content: … Preliminary/HSC" heading covers the wide
 * layout and anything that breaks the convention. Relying on the heading alone
 * silently misfiles whole courses.
 */
export function courseOf(codes: string[], hint: string | null): { id: string; name: string } {
  const letters = new Set(codes.filter(Boolean).map((c) => c[0]?.toUpperCase()))
  if (letters.size === 1 && letters.has('P')) return { id: 'pre', name: 'Preliminary course' }
  if (letters.size === 1 && letters.has('H')) return { id: 'hsc', name: 'HSC course' }
  if (hint) {
    const low = hint.toLowerCase()
    if (low.startsWith('prelim')) return { id: 'pre', name: 'Preliminary course' }
    if (low.startsWith('hsc')) return { id: 'hsc', name: 'HSC course' }
  }
  return { id: 'course', name: 'Course' }
}

/**
 * A heading without its trailing "including:", so it reads as a label.
 *
 * The verbatim heading is kept separately, because this is an edit and the
 * original still has to be checkable against the syllabus.
 */
export function tidyName(heading: string): string {
  // `text` keeps the heading exactly as published; this is the label, so the
  // non-breaking spaces the .docx is full of come out here rather than there.
  return tidyHeading(heading.replace(TRAILING_NOISE_RE, ''))
}

/**
 * The name captured from a focus-area heading.
 *
 * What follows the label can still carry the course in brackets and the
 * non-breaking spaces the `.docx` is full of, which are invisible on screen and
 * make two spellings of the same area look like two areas.
 */
export function focusAreaName(captured: string): string {
  const name = captured.replace(COURSE_SUFFIX_RE, '')
  return name.split(/\s+/).join(' ').trim().replace(/[:;.,]+$/, '').trim()
}

/**
 * The document's own word for a division, as a label rather than as a heading.
 *
 * NESA writes these in title case in the heading itself — `Area of Study:` — and
 * a form label reading "Area Of Study" is not how the phrase is written in
 * prose. Only the first letter is kept capital, so the word survives and the
 * heading's typography does not.
 */
function sentenceCase(word: string): string {
  const tidy = word.split(/\s+/).join(' ').trim().toLowerCase()
  return tidy ? tidy[0]!.toUpperCase() + tidy.slice(1) : ''
}

/* ------------------------------------------------------------------ building */

interface Building {
  id: string
  name: string
  outcomes: Map<string, string>
  topics: SyllabusTopic[]
}

/**
 * Append one topic to a course.
 *
 * The first paragraph of a "Students learn about" cell is the topic heading and
 * the rest are its content points. Both layouts agree on that, which is why
 * they share this.
 *
 * Topic numbering continues from the course's length, so a course spread over
 * many tables still numbers straight through.
 */
function addTopic(
  course: Building,
  about: string[],
  skills: string[],
  outcomes: string[],
  group: string,
): SyllabusTopic | null {
  const [heading, ...points] = about
  if (heading === undefined) return null

  // A continuation of the topic above, not a topic. Everything in the cell is
  // content, the heading line included, and the "learn to" cell belongs to the
  // same topic as well. Nothing to continue means the document opened with one,
  // which no NESA syllabus does; taking it as a topic is then the only reading
  // left and loses nothing.
  const parent = course.topics[course.topics.length - 1]
  if (parent && CONTINUATION_RE.test(heading)) {
    const start = parent.points?.length ?? 0
    parent.points = [
      ...(parent.points ?? []),
      ...about.map((text, i) => ({
        id: `${parent.id}.${String(start + i + 1).padStart(2, '0')}`,
        text,
      })),
    ]
    parent.skills = [...(parent.skills ?? []), ...skills]
    return null
  }

  const id = `${course.id.toUpperCase()}-${String(course.topics.length + 1).padStart(2, '0')}`
  const topic: SyllabusTopic = {
    id,
    name: tidyName(heading),
    text: heading,
    outcomes: [...outcomes],
    points: points.map((text, i) => ({
      id: `${id}.${String(i + 1).padStart(2, '0')}`,
      text,
    })),
    skills: [...skills],
  }
  // Industrial Technology repeats topic names across eight focus areas, so
  // without a group a teacher browsing 146 flat topics cannot tell Automotive
  // from Electronics. Absent rather than empty when there is none.
  if (group) topic.group = group

  course.topics.push(topic)
  return topic
}

/**
 * Whether a row's content cell looks like the tail of the topic above it.
 *
 * A heading styled as a list item, at the top of a fresh page, is what a topic
 * that ran past the bottom of the previous one looks like in the markup. Both
 * halves are needed and neither is sufficient. See `suspects` on the reading for
 * why this only ever raises a question.
 */
function looksLikeATail(note: CellNote | undefined): boolean {
  return note !== undefined && note.listed && note.afterPageBreak
}

/** A three-column table, where each row may carry its own outcome. */
function addWideTable(course: Building, table: Table, group: string, doubtful: string[]): void {
  let current: string[] = []

  for (const [at, row] of table.rows.slice(1).entries()) {
    if (row.length < 3) continue

    const cell = (row[0] ?? []).join(' ').trim()
    if (cell) {
      const m = OUTCOME_RE.exec(cell)
      if (m) {
        const code = m[1] as string
        if (!course.outcomes.has(code)) course.outcomes.set(code, (m[2] ?? '').trim())
        current = [code]
      }
    }

    const made = addTopic(course, row[1] ?? [], row[2] ?? [], current, group)
    if (made && looksLikeATail(table.notes[at + 1]?.[1])) doubtful.push(made.id)
  }
}

/** A two-column table, where every row is a topic and the outcomes came from above it. */
function addNarrowTable(
  course: Building,
  table: Table,
  outcomes: string[],
  group: string,
  doubtful: string[],
): void {
  for (const [at, row] of table.rows.slice(1).entries()) {
    if (row.length < 2) continue
    const made = addTopic(course, row[0] ?? [], row[1] ?? [], outcomes, group)
    if (made && looksLikeATail(table.notes[at + 1]?.[0])) doubtful.push(made.id)
  }
}

export class NotASyllabusError extends Error {}

/**
 * A reading of the tables, with what it is unsure about.
 *
 * `suspects` holds topic ids that may be the tail of the topic above rather than
 * topics of their own. It is deliberately **a question and never a decision**,
 * because the evidence does not support deciding.
 *
 * The markup does distinguish the two in Textiles and Design, where every real
 * heading is styled as a heading or bold and the two continuation rows are
 * styled as list items. It does not distinguish them anywhere else. All forty of
 * Design and Technology's topic headings are list items, so merging on that
 * signal would collapse the course to a single topic. Industrial Technology is
 * worse than useless: it uses list-styled headings routinely, so `framing joints`
 * and `carcase joints` are the same kind of thing and a page break falling
 * between them would keep one and swallow the other.
 *
 * So the signal is real, and it is real about *one document*. Reporting it costs
 * a teacher a moment's reading when it is wrong. Acting on it would silently cost
 * a topic, which is the #26 and #43 fault reproduced by its own fix.
 */
export interface TableReading {
  courses: SyllabusCourse[]
  /** Topic ids worth a second look, in the order they were read. */
  suspects: string[]
  /**
   * What the document calls a group, where it says so: `Area of study` in
   * Textiles, `Focus area` in Industrial Technology. Empty when the document
   * divides its courses into nothing, which is Design and Technology.
   */
  groupLabel: string
}

/**
 * Read the document body and return its courses in published order.
 *
 * @throws NotASyllabusError when no content table is present.
 */
export function parseSyllabusTables(xml: string): TableReading {
  const courses = new Map<string, Building>()
  let hint: string | null = null
  // Outcomes stated as plain paragraphs since the last content table. In the
  // narrow layout this is the only place they appear.
  let pending = new Map<string, string>()
  let group = ''
  // What this document calls the division a group is. Only ever set from a
  // marker actually seen, so a syllabus with no areas carries no word for them.
  let groupLabel = ''
  const suspects: string[] = []

  for (const block of blocks(xml)) {
    if (block.kind === 'para') {
      const heading = COURSE_HEADING_RE.exec(block.text)
      if (heading) {
        hint = heading[1] ?? null
        continue
      }
      const outcome = OUTCOME_RE.exec(block.text)
      if (outcome) {
        const code = outcome[1] as string
        if (!pending.has(code)) pending.set(code, (outcome[2] ?? '').trim())
        continue
      }
      // A focus-area marker names the course as well as the group, and is the
      // only course signal Industrial Technology gives.
      const marker = COURSE_MARKER_RE.exec(block.text)
      if (marker) hint = marker[1] ?? hint
      const area = FOCUS_AREA_RE.exec(block.text)
      if (area) {
        group = focusAreaName(area[2] ?? '')
        groupLabel = sentenceCase(area[1] ?? '')
      }
      continue
    }

    const layout = tableLayout(block.rows)
    if (layout === null) continue

    const codes = [...pending.keys()]
    const { id, name } = courseOf(codes, hint)
    let course = courses.get(id)
    if (!course) {
      course = { id, name, outcomes: new Map(), topics: [] }
      courses.set(id, course)
    }

    if (layout === 'wide') {
      addWideTable(course, block, group, suspects)
    } else {
      for (const [code, text] of pending) {
        if (!course.outcomes.has(code)) course.outcomes.set(code, text)
      }
      addNarrowTable(course, block, codes, group, suspects)
    }

    pending = new Map()
  }

  if (courses.size === 0) {
    throw new NotASyllabusError(
      'No "Students learn about / Students learn to" table was found, so this does ' +
        'not look like a NESA Stage 6 (2013) syllabus.',
    )
  }

  // Preliminary before HSC, then anything unrecognised, so the output order is
  // stable regardless of how the document happened to be laid out.
  const order: Record<string, number> = { pre: 0, hsc: 1 }
  return {
    courses: [...courses.values()]
      .sort((a, b) => (order[a.id] ?? 9) - (order[b.id] ?? 9))
      .map(
        (c): SyllabusCourse => ({
          id: c.id,
          name: c.name,
          outcomes: [...c.outcomes].map(([code, text]): SyllabusOutcome => ({ code, text })),
          topics: c.topics,
        }),
      ),
    suspects,
    groupLabel,
  }
}

/**
 * The courses alone.
 *
 * Kept because `syllabus.corpus.test.ts` compares this against
 * `tools/nesa_stage6_syllabus.py` output for output on all four documents, and
 * that comparison is what makes the port trustworthy rather than plausible.
 *
 * @throws NotASyllabusError when no content table is present, which means the
 *   document is not a 2013-era NESA Stage 6 syllabus.
 */
export function parseSyllabusXml(xml: string): SyllabusCourse[] {
  return parseSyllabusTables(xml).courses
}

/* -------------------------------------------------------------------- model */

export interface SyllabusIdentity {
  id: string
  name: string
  framework?: string
  authority?: string
  syllabusVersion?: string
  /** The document's own word for a division, from the reader that read it. */
  groupLabel?: string
  sourceTitle: string
  sourceUrl?: string
  /** ISO date. Passed in rather than read from the clock, so a model is reproducible. */
  retrieved: string
  licence?: string
}

const DEFAULT_LICENCE =
  'NSW Education Standards Authority, Crown copyright. Not redistributable.'

/** Assemble the model, matching `schemas/syllabus.schema.json`. */
export function toSyllabus(courses: SyllabusCourse[], who: SyllabusIdentity): Syllabus {
  const source: Syllabus['source'] = {
    title: who.sourceTitle,
    retrieved: who.retrieved,
    licence: who.licence ?? DEFAULT_LICENCE,
    // Never assume otherwise. A syllabus is copyright unless its publisher has
    // clearly said it may be republished, and Klunk reads this flag before it
    // will bundle anything.
    redistributable: false,
  }
  if (who.sourceUrl) source.url = who.sourceUrl

  return {
    formatVersion: '1',
    type: 'klunk_syllabus',
    id: who.id,
    name: who.name,
    framework: who.framework ?? 'NESA',
    authority: who.authority ?? 'NSW Education Standards Authority',
    // No default. This used to fall back to "Stage 6 (2013)", which was true of
    // the only two documents Klunk could then read and is false of Visual Arts
    // Stage 6 (2016), Drama Stage 6 (2009) and the 2024 syllabuses. A teacher
    // checks this field to tell which edition a bank is tagged against, and two
    // editions of one subject are live at the same time (#29), so a confident
    // wrong answer here is worse than none.
    ...(who.syllabusVersion?.trim() ? { syllabusVersion: who.syllabusVersion.trim() } : {}),
    // Written only where the document said it, and only where there is a group
    // for the word to name. A syllabus that divides its courses into nothing
    // gets no vocabulary for a division it does not have.
    ...(who.groupLabel?.trim() && courses.some((c) => c.topics.some((t) => t.group))
      ? { groupLabel: who.groupLabel.trim() }
      : {}),
    source,
    courses,
  }
}

/** What was found, for a teacher to check before anything is written. */
export interface SyllabusSummary {
  courseId: string
  courseName: string
  topics: number
  points: number
  outcomes: number
  groups: string[]
}

/**
 * The counts, which are what a teacher can actually check against the document.
 *
 * Groups are listed rather than counted because they were wrong for a long time
 * without changing any count (#14): Design and Technology should have none at
 * all, and Textiles exactly three.
 */
export function summarise(courses: SyllabusCourse[]): SyllabusSummary[] {
  return courses.map((c) => ({
    courseId: c.id,
    courseName: c.name,
    topics: c.topics.length,
    points: c.topics.reduce((n, t) => n + (t.points?.length ?? 0), 0),
    outcomes: c.outcomes?.length ?? 0,
    groups: [...new Set(c.topics.map((t) => t.group).filter((g): g is string => !!g))],
  }))
}

/** A filename to the slug a syllabus id has to be. */
export function suggestSyllabusId(filename: string): string {
  return (
    filename
      .replace(/\.[^.]+$/, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '') || 'syllabus'
  )
}
