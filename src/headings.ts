/**
 * Syllabuses that state their content in headings rather than in a table.
 *
 * `src/syllabus.ts` reads the 2013 Stage 6 documents, where the content is a
 * three- or two-column table and the table is the structure. Three of the four
 * other NESA documents on disk have no content table at all, and they divide
 * into two shapes:
 *
 * **Outcomes and Content blocks.** Drama Stage 6 (2009) and the NSW Curriculum
 * Reform exports — English Advanced 11–12 (2024), Mathematics Advanced 11–12
 * (2024) — each state a course section holding a repeating `[topic heading,
 * "Outcomes", "Content"]`. They disagree about almost everything else, and the
 * disagreements are what the rules below are mostly about:
 *
 * | | Drama 2009 | Curriculum Reform 2024 |
 * |---|---|---|
 * | course said by | `8.1 Content: Drama Stage 6 Preliminary Course` | `Outcomes and content for Year 11` |
 * | outcome code | opens the line, `P1.1 develops…` | closes it, `…shapes meaning EAV-11-01` |
 * | content points | paragraphs | bullets |
 * | inside `Content` | nothing further | a further level of sub-heading |
 *
 * **Prose under numbered headings.** Visual Arts Stage 6 (2016) has no
 * `Outcomes`/`Content` blocks and no paragraph styles whatever. Its content is
 * section 8, prose under headings marked only by bold and by the section number
 * Word concatenates onto them.
 *
 * Two rules here were established by checking a document rather than by
 * reasoning, and both would look arbitrary otherwise.
 *
 * **Heading level numbers are not trustworthy, so nothing ranks by them.**
 * Drama gives the first topic of 8.1 the style `Head5` and the next two
 * `Heading3`, and gives `Content` the style `Heading3` under two topics and
 * `Head6` under the third. Whether a heading opens a new section or is a
 * sub-heading inside one is decided instead by whether the *next* heading is
 * `Outcomes` or `Content`. That is right on all three documents and needs no
 * level at all. Levels are used for one thing only, where they are consistent:
 * a heading at or above the course heading's level ends the course.
 *
 * **Bold means heading in Visual Arts and means nothing in Drama.** Every one of
 * the sixty Visual Arts headings is entirely bold and no body paragraph is;
 * Drama styles its headings properly and also bolds ordinary sentences such as
 * "Teachers should ensure that students do not submit the same project for any
 * other HSC subject." So the bold rule is scoped to the prose reader, which
 * additionally requires the numbered content section that Visual Arts has and
 * Drama's body text does not.
 */

import { blocks, sectionNumber, tidyHeading, type Block, type Para } from './ooxml'
import { NotASyllabusError, tidyName } from './syllabus'
import type { SyllabusCourse, SyllabusOutcome, SyllabusTopic } from './types'

/* ----------------------------------------------------------------- the rules */

/**
 * An outcome code, in every shape NESA has printed across the five documents.
 *
 * `P1` and `H10` in Visual Arts, `P1.1` and `H3.5` in Drama and the 2013
 * syllabuses, `EAV-11-01` and `MAV-12-08` in the reform exports, `MAO-WM-01`
 * for a Working Mathematically outcome and `BI-11WS-01` in Biology.
 */
const CODE = String.raw`[A-Z]{1,4}(?:\d+(?:\.\d+)?|(?:-[A-Z0-9]{1,6})+-\d{2})`

/** A cell or bullet that is nothing but the code, its text on the next line. */
const CODE_ONLY_RE = new RegExp(`^(${CODE})$`)

// "P1.1 develops acting skills…", "P1:explores the conventions of practice".
// The separator is optional because Drama's own table prints "P1.1develops",
// the code and its text having arrived from two runs of one paragraph.
const CODE_FIRST_RE = new RegExp(`^(${CODE})[\\s:]*(.+)$`)

// "…shapes meaning in texts of different modes and mediums EAV-11-01".
const CODE_LAST_RE = new RegExp(`^(.+?)\\s+(${CODE})$`)

/**
 * The heading that opens a course's content.
 *
 * Not anchored past the label, because what follows is a whole course title:
 * "Content: Drama Stage 6 Preliminary Course", "Outcomes and content for
 * Year 11". A heading of `Content` alone is the block marker inside a topic and
 * deliberately does not match, since there is nothing after the label to name a
 * course with.
 */
const COURSE_SECTION_RE = /^(?:outcomes and content for|content)\s*[:–—-]?\s*(.+)$/i

/** The two block markers, which is the whole contract the shapes have in common. */
const OUTCOMES_BLOCK = 'outcomes'
const CONTENT_BLOCK = 'content'

/**
 * Which course a heading names, if it names exactly one.
 *
 * `null` for "Drama Stage 6 Preliminary and HSC Courses", which heads the
 * section holding *both* courses and must not open either of them. Naming both
 * is how every one of these documents titles that section, so the ambiguity is
 * the signal rather than a failure to decide.
 */
export function courseNamed(text: string): { id: string; name: string } | null {
  const low = text.toLowerCase()
  const preliminary = /\bpreliminary\b/.test(low)
  const hsc = /\bhsc\b/.test(low)
  if (preliminary && hsc) return null
  if (preliminary) return { id: 'pre', name: 'Preliminary course' }
  if (hsc) return { id: 'hsc', name: 'HSC course' }
  // The reform syllabuses run Year 11 and Year 12 where the older ones run
  // Preliminary and HSC. Keeping the document's own words matters: a folder
  // holding a model of each edition of one subject is the normal state for a
  // year (#29), and the course names are what tells them apart on screen.
  const year = /\byear\s*(\d+)\b/.exec(low)
  if (year) return { id: `y${year[1]}`, name: `Year ${year[1]}` }
  return null
}

/* -------------------------------------------------------------- the building */

interface Building {
  id: string
  name: string
  outcomes: Map<string, string>
  topics: SyllabusTopic[]
}

/** A course id to the prefix its topic ids carry: `pre` → `PRE-01`, `y11` → `Y11-01`. */
function prefixOf(courseId: string): string {
  return courseId.toUpperCase().replace(/[^A-Z0-9-]/g, '')
}

function addTopic(
  course: Building,
  heading: string,
  group: string,
  outcomes: string[],
  points: string[],
): void {
  const id = `${prefixOf(course.id)}-${String(course.topics.length + 1).padStart(2, '0')}`
  const topic: SyllabusTopic = {
    id,
    name: tidyName(heading),
    text: heading,
    outcomes: [...outcomes],
    points: points.map((text, i) => ({
      id: `${id}.${String(i + 1).padStart(2, '0')}`,
      text,
    })),
  }
  if (group) topic.group = group
  course.topics.push(topic)
}

/**
 * One section of content to its topics.
 *
 * A section with sub-headings becomes a group holding one topic per
 * sub-heading; a section without them is itself the topic. So a group only ever
 * exists where it divides something, which is the same rule the 2013 reader
 * follows in refusing Design and Technology a group at all (#14).
 *
 * Content sitting under the section before its first sub-heading becomes a topic
 * named after the section. In Drama that is the whole of the content; in English
 * Advanced it is the paragraph describing the focus area. Nothing under a
 * `Content` heading is dropped, because there is no rule that separates a
 * description from a content point without guessing.
 */
function addSection(
  course: Building,
  section: { name: string; outcomes: string[]; lead: string[]; subs: Sub[] },
): void {
  if (section.subs.length === 0) {
    addTopic(course, section.name, '', section.outcomes, section.lead)
    return
  }
  const group = tidyName(section.name)
  if (section.lead.length > 0) addTopic(course, section.name, group, section.outcomes, section.lead)
  for (const sub of section.subs) addTopic(course, sub.name, group, section.outcomes, sub.points)
}

interface Sub {
  name: string
  points: string[]
}

/** In published order, with any course that gathered no topic left out. */
function finish(courses: Map<string, Building>): SyllabusCourse[] {
  const out = [...courses.values()]
    .filter((c) => c.topics.length > 0)
    .map(
      (c): SyllabusCourse => ({
        id: c.id,
        name: c.name,
        outcomes: [...c.outcomes].map(([code, text]): SyllabusOutcome => ({ code, text })),
        topics: c.topics,
      }),
    )
  if (out.length === 0) {
    throw new NotASyllabusError('no course in this document sets out any content')
  }
  return out
}

/* ------------------------------------------------------------------ outcomes */

/** Every outcome code in a run of lines, however the lines carry it. */
function codesIn(lines: string[]): [string, string][] {
  const found: [string, string][] = []
  for (let i = 0; i < lines.length; i++) {
    const line = (lines[i] ?? '').trim()
    if (!line) continue

    // "EAV-11-01" on its own line, its text on the next. Only the reform
    // exports' table of outcomes does this, and only inside a cell.
    const alone = CODE_ONLY_RE.exec(line)
    if (alone) {
      const next = (lines[i + 1] ?? '').trim()
      if (next && !CODE_ONLY_RE.test(next)) {
        found.push([alone[1] as string, next])
        i++
        continue
      }
      found.push([alone[1] as string, ''])
      continue
    }

    const first = CODE_FIRST_RE.exec(line)
    if (first) {
      found.push([first[1] as string, (first[2] ?? '').trim()])
      continue
    }

    const last = CODE_LAST_RE.exec(line)
    if (last) found.push([last[2] as string, (last[1] ?? '').trim()])
  }
  return found
}

/**
 * The outcomes a table states, by course.
 *
 * The one thing every document here shares. Drama heads its columns `Objectives
 * | Preliminary Course Outcomes | HSC Course Outcomes`, Visual Arts heads its
 * `Content | Preliminary course | HSC course`, and the reform exports head
 * theirs `Year 11 | Year 12`. In all three the *column* names the course and the
 * cells hold the codes, so one rule reads them all.
 *
 * It earns its place beyond tidiness: one Drama HSC outcome, H2.5, is in that
 * table and attached to no topic, so a model built only from the topic blocks
 * would quietly be one outcome short.
 */
export function courseOutcomeTables(
  items: Block[],
): Map<string, { name: string; outcomes: Map<string, string> }> {
  const out = new Map<string, { name: string; outcomes: Map<string, string> }>()

  for (const block of items) {
    if (block.kind !== 'table') continue
    const header = block.rows[0]
    if (!header || header.length < 2) continue

    const columns = header.map((cell) => courseNamed(cell.join(' ')))
    if (!columns.some(Boolean)) continue

    for (const row of block.rows.slice(1)) {
      row.forEach((cell, i) => {
        const who = columns[i]
        if (!who) return
        let course = out.get(who.id)
        if (!course) {
          course = { name: who.name, outcomes: new Map() }
          out.set(who.id, course)
        }
        for (const [code, text] of codesIn(cell)) {
          if (text && !course.outcomes.has(code)) course.outcomes.set(code, text)
        }
      })
    }
  }

  return out
}

/* ------------------------------------- syllabuses with Outcomes and Content */

function isHeading(para: Para): boolean {
  return para.headingLevel !== undefined
}

/** A heading's text with its automatic number off, lowercased, for comparing. */
function headingKey(text: string): string {
  return tidyHeading(sectionNumber(text)?.rest ?? text).toLowerCase()
}

/**
 * A syllabus that sets out each topic under `Outcomes` and `Content` headings.
 *
 * @throws NotASyllabusError when no course section is found, or when the ones
 *   found hold no content.
 */
export function parseHeadingsXml(xml: string): SyllabusCourse[] {
  const items = blocks(xml)
  const fromTables = courseOutcomeTables(items)

  // Which heading follows this one, for the rule that decides whether a heading
  // opens a section or sits inside one.
  const after = new Map<number, string>()
  let previous: number | null = null
  for (let i = 0; i < items.length; i++) {
    const block = items[i]
    if (!block || block.kind !== 'para' || !isHeading(block)) continue
    if (previous !== null) after.set(previous, headingKey(block.text))
    previous = i
  }

  const courses = new Map<string, Building>()
  let course: Building | null = null
  let courseLevel: number | undefined
  let section: { name: string; outcomes: string[]; lead: string[]; subs: Sub[] } | null = null
  let mode: 'outcomes' | 'content' | null = null

  const closeSection = () => {
    if (course && section) addSection(course, section)
    section = null
    mode = null
  }

  for (let i = 0; i < items.length; i++) {
    const block = items[i]
    if (!block || block.kind !== 'para') continue

    if (!isHeading(block)) {
      if (!course || !section) continue
      if (mode === 'outcomes') {
        for (const [code, text] of codesIn([block.text])) {
          if (!section.outcomes.includes(code)) section.outcomes.push(code)
          if (text && !course.outcomes.has(code)) course.outcomes.set(code, text)
        }
      } else if (mode === 'content') {
        const sub = section.subs[section.subs.length - 1]
        if (sub) sub.points.push(block.text)
        else section.lead.push(block.text)
      }
      continue
    }

    const bare = sectionNumber(block.text)?.rest ?? block.text
    const opens = COURSE_SECTION_RE.exec(bare)
    const named = opens ? courseNamed(opens[1] as string) : null
    if (named) {
      closeSection()
      let building = courses.get(named.id)
      if (!building) {
        building = {
          id: named.id,
          name: named.name,
          outcomes: new Map(fromTables.get(named.id)?.outcomes ?? []),
          topics: [],
        }
        courses.set(named.id, building)
      }
      course = building
      courseLevel = block.headingLevel
      continue
    }

    if (!course) continue

    // The course's content has ended: the next section of the document has
    // started at the course heading's level or above it. This is the one place
    // level numbers are used, and the one place they agree across documents.
    if (
      courseLevel !== undefined &&
      block.headingLevel !== undefined &&
      block.headingLevel <= courseLevel
    ) {
      closeSection()
      course = null
      courseLevel = undefined
      continue
    }

    const key = headingKey(block.text)
    if (key === OUTCOMES_BLOCK) {
      mode = 'outcomes'
      continue
    }
    if (key === CONTENT_BLOCK) {
      mode = 'content'
      continue
    }

    const next = after.get(i)
    if (next === OUTCOMES_BLOCK || next === CONTENT_BLOCK) {
      closeSection()
      section = { name: block.text, outcomes: [], lead: [], subs: [] }
      continue
    }
    if (mode === 'content' && section) section.subs.push({ name: block.text, points: [] })
  }

  closeSection()

  if (courses.size === 0) {
    throw new NotASyllabusError(
      'no heading in this document opens a course, so its content could not be ' +
        'told apart from the rest of it',
    )
  }
  return finish(courses)
}

/* ----------------------------------------- syllabuses whose content is prose */

/** The numbered section that holds the content, as every one of these documents titles it. */
const CONTENT_SECTION_RE = /^content\b/i

/**
 * A syllabus whose content is prose under numbered headings, marked only by bold.
 *
 * Written for Visual Arts Stage 6 (2016) and deliberately narrow. It needs a
 * table of outcomes whose columns name courses, and a bold, numbered top-level
 * section whose title begins `Content`. Drama has the first and not the second,
 * and is read by `parseHeadingsXml` instead — which is the point, because the
 * bold rule below would misread Drama badly.
 *
 * @throws NotASyllabusError when either of those is missing.
 */
export function parseProseXml(xml: string): SyllabusCourse[] {
  const items = blocks(xml)
  const fromTables = courseOutcomeTables(items)
  if (fromTables.size === 0) {
    throw new NotASyllabusError('no table in this document sets out the outcomes by course')
  }

  const courses = new Map<string, Building>()
  for (const [id, found] of fromTables) {
    courses.set(id, { id, name: found.name, outcomes: new Map(found.outcomes), topics: [] })
  }
  const everyCourse = [...courses.keys()]

  let inContent = false
  let section: { name: string; into: string[]; lead: string[]; subs: Sub[] } | null = null

  const closeSection = () => {
    if (section) {
      for (const id of section.into) {
        const course = courses.get(id)
        // The outcomes stay at course level. This syllabus maps an outcome to a
        // content *area* — practice, frames, representation — and three of the
        // six areas have no section of their own, so pairing them off with the
        // sections by name would be a guess of exactly the kind that produced
        // #14. `outcomesFor` in src/prompt.ts already falls back to the whole
        // course when a syllabus does not map outcomes onto topics.
        if (course) {
          addSection(course, {
            name: section.name,
            outcomes: [],
            lead: section.lead,
            subs: section.subs,
          })
        }
      }
    }
    section = null
  }

  for (const block of items) {
    if (block.kind !== 'para') continue
    // Bold is the only thing that marks a heading in this document. It holds for
    // all sixty of them and for no body paragraph, checked with an explicit
    // `w:val="0"` honoured, since the document also carries bold-off runs.
    const heading = block.bold && !block.listed
    const numbered = heading ? sectionNumber(block.text) : null

    if (heading && numbered && numbered.depth === 1) {
      closeSection()
      inContent = CONTENT_SECTION_RE.test(numbered.rest)
      continue
    }
    if (!inContent) continue

    if (heading && numbered) {
      closeSection()
      // A section that names one course belongs to it alone: Visual Arts states
      // the purpose of each course separately and then the content of both
      // together, so 8.1 is Preliminary, 8.2 is HSC, and 8.3 to 8.5 are shared.
      const only = courseNamed(numbered.rest)
      const into = only && courses.has(only.id) ? [only.id] : everyCourse
      section = { name: numbered.rest, into, lead: [], subs: [] }
      continue
    }

    if (heading) {
      if (section) section.subs.push({ name: block.text, points: [] })
      continue
    }

    if (!section) continue
    const sub = section.subs[section.subs.length - 1]
    if (sub) sub.points.push(block.text)
    else section.lead.push(block.text)
  }

  closeSection()
  return finish(courses)
}
