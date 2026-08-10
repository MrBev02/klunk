/**
 * Syllabuses that state their content in headings rather than in a table.
 *
 * `src/syllabus.ts` reads the 2013 Stage 6 documents, where the content is a
 * three- or two-column table and the table is the structure. Three of the four
 * other NESA documents on disk have no content table at all, and they divide
 * into two shapes:
 *
 * **Outcomes and Content blocks.** Drama Stage 6 (2009), the NSW Curriculum
 * Reform exports — English Advanced 11–12 (2024), Mathematics Advanced 11–12
 * (2024) — and the 7–10 syllabuses — Computing Technology 7–10 (2022) — each
 * state a course section holding a repeating `[topic heading, "Outcomes",
 * "Content"]`. They disagree about almost everything else, and the
 * disagreements are what the rules below are mostly about:
 *
 * | | Drama 2009 | Curriculum Reform 2024 | 7–10 2022 |
 * |---|---|---|---|
 * | course said by | `8.1 Content: Drama Stage 6 Preliminary Course` | `Outcomes and content for Year 11` | `Outcomes and content for Stage 4` |
 * | outcome code | opens the line, `P1.1 develops…` | closes it, `…shapes meaning EAV-11-01` | closes it, `…responsibly CT5-SAF-01` |
 * | content points | paragraphs | bullets | bullets |
 * | inside `Content` | nothing further | a further level of sub-heading | a further level of sub-heading |
 *
 * The 7–10 shape is the reform contract with two differences, and both were
 * enough to make the document unreadable rather than merely imperfect (#50).
 * **A junior course is a stage, not a year**, so `courseNamed` has to know one.
 * And **the outcome code carries the stage inside its prefix**, `CT4-ADJ-01`
 * against `EAV-11-01`, which the code pattern refused — silently, and only for
 * the stage courses, since the Life Skills codes are all letters.
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
import type { SyllabusCourse, SyllabusOutcome, SyllabusPoint, SyllabusTopic } from './types'

/* ----------------------------------------------------------------- the rules */

/**
 * An outcome code, in every shape NESA has printed across the seven documents.
 *
 * `P1` and `H10` in Visual Arts, `P1.1` and `H3.5` in Drama and the 2013
 * syllabuses, `EAV-11-01` and `MAV-12-08` in the reform exports, `MAO-WM-01`
 * for a Working Mathematically outcome and `BI-11WS-01` in Biology 11–12 (2025).
 *
 * The `\d?` is Computing Technology 7–10 (#50), which puts the stage inside the
 * prefix: `CT4-ADJ-01`, `CT5-SAF-01`. Without it `[A-Z]{1,4}` takes `CT` and
 * then neither branch can start at `4`, so the code does not match at all —
 * while `CTLS-SAF-01` does, its prefix being all letters. That asymmetry is what
 * made the fault dangerous rather than obvious: the Life Skills outcomes read
 * and the Stage 4 and Stage 5 ones silently did not.
 *
 * `HYPHENATED_NUMBER` is Biology Stage 6 (2017), and the four science
 * syllabuses published beside it, which number the subject rather than
 * lettering it (#77): `BIO11-8`, `BIO12-15`, and `BIO11/12-1` for the seven
 * Working Scientifically outcomes both courses share. Neither shape matched —
 * `[A-Z]{1,4}` takes `BIO`, `NUMBER` takes `11` and stops short of the hyphen,
 * and `LETTERED` cannot start at a digit followed by another digit.
 *
 * **The order of the three branches is load-bearing.** `CODE_FIRST_RE` has
 * nothing anchoring its end, so the alternation is decided rather than
 * backtracked into, and `NUMBER` is the only branch that can stop in the middle
 * of another. Tried first, it reads the Objectives and Outcomes table's
 * `BIO11-8 describes single cells…` as the code `BIO11` carrying the text
 * `-8 describes single cells…`: a code naming nothing, wearing the right
 * wording. So it goes last.
 */
const LETTERED = String.raw`\d?(?:-[A-Z0-9]{1,6})+-\d{2}`
const HYPHENATED_NUMBER = String.raw`\d+(?:/\d+)?-\d{1,2}`
const NUMBER = String.raw`\d+(?:\.\d+)?`
const CODE = String.raw`[A-Z]{1,4}(?:${LETTERED}|${HYPHENATED_NUMBER}|${NUMBER})`

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

/**
 * The same heading with the label at the other end.
 *
 * Biology Stage 6 (2017) heads its two course sections `Biology Year 11 Course
 * Content` and `Biology Year 12 Course Content` (#77): the subject opens the
 * heading and the label closes it. Everything else about the document is the
 * reform contract, so this one rule is the difference between reading it and
 * refusing it outright.
 *
 * The whole label is required rather than `content` alone, because `Year 11
 * Course Structure and Requirements` heads the section beside it and a looser
 * rule would open a course on that too.
 */
const COURSE_CONTENT_RE = /^(.+?)\s+course content$/i

/**
 * The section in which a syllabus declares its own capability vocabulary.
 *
 * NESA's 2017 science syllabuses print a general capability against a content
 * point as an icon, and the icon's alt text names it. Rather than hardcoding
 * the thirteen, they are read from the sub-headings of this section — the
 * document says what its own icons mean, and a syllabus that has no such
 * section simply has no capabilities (#78).
 */
const LEARNING_ACROSS_RE = /^learning across the curriculum$/

/**
 * A capability name reduced to what two spellings of it have in common.
 *
 * The alt text is not consistent: Biology writes `Work and enterprise icon`
 * four times and `Work and enterprise` four times for the same capability, and
 * the Asia one carries a curly apostrophe where the heading does too. So the
 * trailing word and the punctuation come off both sides before comparing.
 */
function capabilityKey(text: string): string {
  return text
    .toLowerCase()
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\s+icon$/, '')
}

/**
 * One content paragraph as a line, with the capabilities its pictures name.
 *
 * A picture that is not in the vocabulary is ignored rather than recorded: a
 * syllabus also carries a logo and several described diagrams, and neither is a
 * tag on the point it happens to sit near.
 */
function lineOf(para: Para, vocabulary: Map<string, string>): Line {
  const capabilities: string[] = []
  for (const alt of para.pictures) {
    const name = vocabulary.get(capabilityKey(alt))
    if (name && !capabilities.includes(name)) capabilities.push(name)
  }
  const line: Line = { text: para.text, capabilities }
  if (para.listLevel !== undefined) line.level = para.listLevel
  return line
}

/** The line under `Students:` that is the list's own lead-in, and not a point. */
const STUDENTS_RE = /^students:$/i

/** `Inquiry question: What distinguishes one cell from another?` */
const INQUIRY_RE = /^inquiry question:\s*(.+)$/i

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
  // Life Skills is a course in its own right — its own enrolment numbers, its
  // own outcome codes, its own content, and a syllabus that says its outcomes
  // cannot be combined with the others — and Klunk does not model it. Saying so
  // here, before the level rule below, is what keeps it out: Computing
  // Technology 7–10 heads an outcome column `Related Life Skills for Stages
  // 4/5` and a section `Life Skills outcomes and content for Stage 4/5`, and
  // both would otherwise be filed under a stage. Stated rather than left to the
  // plural failing to match, because that would be an accident (#50).
  if (/\blife skills\b/.test(low)) return null

  // A course the document states as a word and a number. The reform Stage 6
  // syllabuses run Year 11 and Year 12 where the older ones run Preliminary and
  // HSC; the 7–10 syllabuses run Stage 4 and Stage 5, and a junior course is a
  // stage rather than a year — Computing Technology 7–10 is organised that way
  // throughout and its outcome codes carry the stage, `CT4-`, `CT5-`, the way
  // the reform codes carry the year. So a year group is a label on the paper
  // rather than a level in the model (#50).
  //
  // Keeping the document's own words matters: a folder holding a model of each
  // edition of one subject is the normal state for a year (#29), and the course
  // names are what tells them apart on screen.
  //
  // Two restrictions on the stage half, both established from the corpus rather
  // than reasoned:
  //
  // **Stages 1 to 5 only.** `Stage 6` is never a course. It names the syllabus
  // — `Drama Stage 6`, `Visual Arts Stage 6` — and the senior courses inside it
  // are Preliminary and HSC, or Year 11 and Year 12. Visual Arts opens with a
  // K–12 continuum table headed `Stages 1–3 | Stages 4–5 | Stage 6 |
  // Post-school`, and without this the third column mints a course `s6` and the
  // model gains a third, empty one. The corpus test caught exactly that.
  //
  // **Singular only.** The same table's other columns are `Stages 1–3` and
  // `Stages 4–5`, which are bands of schooling and not courses either. The
  // plural is rejected out loud rather than left to `\s*` failing to consume the
  // `s`, which is what happened to work and would not have survived an edit.
  const year = low.match(/\byear\s*(\d+)\b/)
  if (year) return { id: `y${year[1]}`, name: `Year ${year[1]}` }
  const stage = low.match(/\bstage(?!s)\s*([1-5])\b/)
  if (stage) return { id: `s${stage[1]}`, name: `Stage ${stage[1]}` }
  return null
}

/**
 * Which course a heading opens, if it opens one.
 *
 * Two wordings, because NESA puts the label at either end of the heading and
 * the course name at the other. The first that names exactly one course wins,
 * and a heading matching the shape while naming no course opens nothing — which
 * is what keeps `Contents` out, being `content` followed by `s`.
 */
function courseSectionNamed(text: string): { id: string; name: string } | null {
  for (const re of [COURSE_SECTION_RE, COURSE_CONTENT_RE]) {
    const opens = re.exec(text)
    const named = opens ? courseNamed(opens[1] as string) : null
    if (named) return named
  }
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
  lines: Line[],
): void {
  const id = `${prefixOf(course.id)}-${String(course.topics.length + 1).padStart(2, '0')}`

  // Two lines a syllabus prints that are not content points. `Students:` is the
  // list's own lead-in, the counterpart of `A student:` above an `Outcomes`
  // block, and carries nothing; the inquiry question belongs to the topic,
  // there being exactly one per topic and no way to tag a question against a
  // question. Only the first is lifted, so a second would stay visible as a
  // point rather than being swallowed (#78).
  let inquiryQuestion: string | undefined
  // One of Biology's 29 inquiry questions carries a capability icon of its own,
  // so lifting the question as a bare string would drop that tag without a
  // word. It moves with it, onto the topic, which is where the question now is.
  let topicCapabilities: string[] = []
  const content: Line[] = []
  for (const line of lines) {
    const text = line.text.trim()
    if (STUDENTS_RE.test(text)) continue
    const inquiry = INQUIRY_RE.exec(text)
    if (inquiry && inquiryQuestion === undefined) {
      inquiryQuestion = (inquiry[1] ?? '').trim()
      topicCapabilities = line.capabilities
      continue
    }
    content.push(line)
  }

  // A sub-item hangs off the last item above it. Only a stated depth of 0 opens
  // one, so a document with no nesting never sets a parent at all, and a
  // sub-item with nothing above it keeps none rather than being given a
  // plausible one.
  let above: string | undefined
  const points = content.map((line, i) => {
    const pointId = `${id}.${String(i + 1).padStart(2, '0')}`
    const point: SyllabusPoint = { id: pointId, text: line.text }
    if (line.level === 0 || line.level === undefined) {
      if (line.level === 0) above = pointId
    } else if (above) {
      point.parent = above
    }
    if (line.capabilities.length > 0) point.capabilities = [...line.capabilities]
    return point
  })

  const topic: SyllabusTopic = {
    id,
    name: tidyName(heading),
    text: heading,
    outcomes: [...outcomes],
    points,
  }
  if (inquiryQuestion) topic.inquiryQuestion = inquiryQuestion
  if (topicCapabilities.length > 0) topic.capabilities = [...topicCapabilities]
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
  section: { name: string; outcomes: string[]; lead: Line[]; subs: Sub[] },
): void {
  if (section.subs.length === 0) {
    addTopic(course, section.name, '', section.outcomes, section.lead)
    return
  }
  const group = tidyName(section.name)
  if (section.lead.length > 0) addTopic(course, section.name, group, section.outcomes, section.lead)
  for (const sub of section.subs) addTopic(course, sub.name, group, section.outcomes, sub.points)
}

/**
 * One line of content, with what the markup said about it beyond its text.
 *
 * A bare string was enough while every document set its content out as one flat
 * list. Biology's is items with sub-items under them, and prints a capability
 * against either (#78), and neither survives being reduced to a sentence.
 */
interface Line {
  text: string
  /** Depth in the bulleted list. Absent where the paragraph is not a list item. */
  level?: number
  capabilities: string[]
}

interface Sub {
  name: string
  points: Line[]
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

/**
 * A line that points at another course's outcomes rather than stating one.
 *
 * Computing Technology 7–10 closes each `Outcomes` block with one: `Related
 * Life Skills outcomes: CTLS-COL-01, CTLS-DAT-01, …` under a Stage 5 topic, and
 * `Related Stage 4/5 outcomes: CT5-COL-01, …` under a Life Skills one. Twelve
 * in the document.
 *
 * Without this `CODE_LAST_RE` matches the *last* code on the line, so the topic
 * gains one outcome belonging to a different course with the whole
 * cross-reference sentence as its text. It was invisible until the `CODE` fix
 * above, which is the point worth keeping: the two faults hid each other (#50).
 */
const CROSS_REFERENCE_RE = /^related\b.*\boutcomes\s*:/i

/** Every outcome code in a run of lines, however the lines carry it. */
function codesIn(lines: string[]): [string, string][] {
  const found: [string, string][] = []
  for (let i = 0; i < lines.length; i++) {
    const line = (lines[i] ?? '').trim()
    if (!line) continue
    if (CROSS_REFERENCE_RE.test(line)) continue

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

/**
 * The capability vocabulary a syllabus declares about itself.
 *
 * The sub-headings of `Learning Across the Curriculum`, mapped from a comparable
 * key to the document's own spelling, so what lands in the model is the wording
 * the syllabus uses rather than the wording an icon's alt text happens to have.
 *
 * Empty for every document that has no such section, which is every document but
 * the 2017 sciences — and an empty vocabulary matches no picture, so those
 * models are untouched.
 */
export function capabilityVocabulary(items: Block[]): Map<string, string> {
  const out = new Map<string, string>()
  let under: number | undefined

  for (const block of items) {
    if (block.kind !== 'para' || block.headingLevel === undefined) continue
    if (under === undefined) {
      if (LEARNING_ACROSS_RE.test(headingKey(block.text))) under = block.headingLevel
      continue
    }
    // The section has ended, at its own level or above it.
    if (block.headingLevel <= under) break
    const name = tidyHeading(sectionNumber(block.text)?.rest ?? block.text).trim()
    if (name) out.set(capabilityKey(name), name)
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
  const vocabulary = capabilityVocabulary(items)

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
  let section: { name: string; outcomes: string[]; lead: Line[]; subs: Sub[] } | null = null
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
        const line = lineOf(block, vocabulary)
        const sub = section.subs[section.subs.length - 1]
        if (sub) sub.points.push(line)
        else section.lead.push(line)
      }
      continue
    }

    const named = courseSectionNamed(sectionNumber(block.text)?.rest ?? block.text)
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

    // A heading the next heading marks as a topic: the contract is `[topic
    // heading, "Outcomes", "Content"]`, and either marker is enough because a
    // topic may state one without the other.
    //
    // Except between the two. Biology Stage 6 (2017) prints `Content Focus` and
    // `Working Scientifically` under every module, after its `Outcomes` and
    // before its `Content` (#77), so `Working Scientifically` is a heading whose
    // next heading is `Content`. Taken as a topic it takes the whole module with
    // it: the module keeps its outcomes and loses its content, all sixteen
    // topics that hold the content are grouped under `Working Scientifically` in
    // every module alike, and not one of them ends with any outcome at all. The
    // counts stay plausible and what a question is tagged against is gone, which
    // is #50's lesson exactly.
    //
    // So an open topic that has stated its outcomes and is still waiting for its
    // content is not interrupted. That is a no-op on every other document, none
    // of which prints a heading between the two markers.
    const next = after.get(i)
    if (next === OUTCOMES_BLOCK || (next === CONTENT_BLOCK && mode !== 'outcomes')) {
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
  const vocabulary = capabilityVocabulary(items)
  if (fromTables.size === 0) {
    throw new NotASyllabusError('no table in this document sets out the outcomes by course')
  }

  const courses = new Map<string, Building>()
  for (const [id, found] of fromTables) {
    courses.set(id, { id, name: found.name, outcomes: new Map(found.outcomes), topics: [] })
  }
  const everyCourse = [...courses.keys()]

  let inContent = false
  let section: { name: string; into: string[]; lead: Line[]; subs: Sub[] } | null = null

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
    const line = lineOf(block, vocabulary)
    const sub = section.subs[section.subs.length - 1]
    if (sub) sub.points.push(line)
    else section.lead.push(line)
  }

  closeSection()
  return finish(courses)
}
