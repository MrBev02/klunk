/**
 * The heading readers on synthetic OOXML.
 *
 * The real documents cannot be committed — they are NESA's and this repo is
 * public — so these are hand-written fragments in the shape the real ones use.
 * `headings.corpus.test.ts` runs against the actual files when the content
 * folder is there.
 *
 * The cases worth having are the ones the documents themselves disagree about,
 * because those are what a rewrite would quietly get wrong: where the outcome
 * code sits on the line, whether a heading opens a section or sits inside one,
 * and what may be taken as a heading at all.
 */

import { describe, expect, it } from 'vitest'
import { FORMAT_DESCRIPTIONS, readSyllabusXml } from './formats'
import { courseNamed, parseHeadingsXml, parseProseXml } from './headings'
import { NotASyllabusError } from './syllabus'

/* ------------------------------------------------- building a document body */

const runs = (...text: string[]) => text.map((t) => `<w:r><w:t>${t}</w:t></w:r>`).join('')

const para = (...text: string[]) => `<w:p>${runs(...text)}</w:p>`

/** A styled heading, the way Word and Drama both write one. */
const heading = (style: string, ...text: string[]) =>
  `<w:p><w:pPr><w:pStyle w:val="${style}"/></w:pPr>${runs(...text)}</w:p>`

/** A bulleted paragraph. */
const bullet = (...text: string[]) =>
  `<w:p><w:pPr><w:pStyle w:val="ListParagraph"/><w:numPr><w:ilvl w:val="0"/>` +
  `<w:numId w:val="7"/></w:numPr></w:pPr>${runs(...text)}</w:p>`

/** A paragraph whose every run is bold, which is all Visual Arts marks a heading with. */
const boldPara = (...text: string[]) =>
  `<w:p>${text.map((t) => `<w:r><w:rPr><w:b/></w:rPr><w:t>${t}</w:t></w:r>`).join('')}</w:p>`

const cell = (...lines: string[]) => `<w:tc>${lines.map((l) => para(l)).join('')}</w:tc>`
const row = (...cells: string[]) => `<w:tr>${cells.join('')}</w:tr>`
const table = (...rows: string[]) => `<w:tbl>${rows.join('')}</w:tbl>`
const body = (...blocks: string[]) => `<w:document><w:body>${blocks.join('')}</w:body></w:document>`

/* ---------------------------------------------------------------- the shapes */

/** The NSW Curriculum Reform export: styled levels, bullets, code at the end. */
const REFORM = body(
  heading('Heading1', 'Example 11–12 (2024)'),
  heading('Heading2', 'Outcomes and content for Year 11'),
  heading('Heading3', 'First focus area'),
  heading('Heading4', 'Outcomes'),
  para('A student:'),
  bullet('does the first thing EXV-11-01'),
  bullet('does the second thing EXV-11-02'),
  heading('Heading4', 'Content'),
  para('What this focus area is about.'),
  heading('Heading5', 'Understanding'),
  bullet('The first thing understood'),
  bullet('The second thing understood'),
  heading('Heading5', 'Responding'),
  bullet('Respond to the first thing'),
  heading('Heading2', 'Outcomes and content for Year 12'),
  heading('Heading3', 'Second focus area'),
  heading('Heading4', 'Outcomes'),
  bullet('does the later thing EXV-12-01'),
  heading('Heading4', 'Content'),
  bullet('A point with no sub-heading above it'),
)

/** Drama's shape: the course in a numbered heading, code first, content in prose. */
const DRAMA = body(
  heading('Heading1', '8 Content: Example Stage 6 Preliminary and HSC Courses'),
  heading('Heading2', '8.1 Content: Example Stage 6 Preliminary Course'),
  heading('Head5', 'First component'),
  heading('Head6', 'Outcomes'),
  para('The student:'),
  bullet('P1.1 does the first thing'),
  bullet('P1.2 does the second thing'),
  heading('Heading3', 'Content'),
  para('Students learn the first thing.'),
  para('Students learn the second thing.'),
  heading('Heading3', 'Second component'),
  heading('Head6', 'Outcomes'),
  bullet('P2.1 does a later thing'),
  heading('Head6', 'Content'),
  para('Students learn a later thing.'),
  heading('Heading1', '9 Course Requirements'),
  para('This paragraph is not content and must not be read as any.'),
  heading('Head5', 'A heading after the content has ended'),
)

/** Visual Arts's shape: no styles at all, bold and a section number. */
const PROSE = body(
  table(
    row(cell('Content'), cell('Preliminary course'), cell('HSC course')),
    row(cell('practice'), cell('A student:', 'P1:does the first thing'), cell('H1:does it better')),
    row(cell('frames'), cell('P2:does the second thing'), cell('H2:does that better')),
  ),
  boldPara('7Objectives and Outcomes'),
  para('Not content: this section is before the content section.'),
  boldPara('8Content: Example Preliminary and HSC Courses'),
  boldPara('8.1Purpose and Focus of the Preliminary Course'),
  para('Only the Preliminary course learns this.'),
  boldPara('8.2Purpose and Focus of the HSC Course'),
  para('Only the HSC course learns this.'),
  boldPara('8.3The Shared Section'),
  para('Both courses learn this.'),
  boldPara('A sub-heading'),
  para('And this.'),
  bullet('And this bullet.'),
  boldPara('9Course Requirements'),
  para('Not content: the content section has ended.'),
)

/* ------------------------------------------------------------- courseNamed */

describe('courseNamed', () => {
  it('reads the course a heading names', () => {
    expect(courseNamed('Content: Drama Stage 6 Preliminary Course')?.id).toBe('pre')
    expect(courseNamed('Content: Drama HSC Course')?.id).toBe('hsc')
    expect(courseNamed('Outcomes and content for Year 11')).toEqual({ id: 'y11', name: 'Year 11' })
  })

  it('refuses a heading that names both, because that is the section holding the pair', () => {
    // Every one of these documents titles its content section this way, and
    // taking it as a course files the whole syllabus under one of them.
    expect(courseNamed('Content: Drama Stage 6 Preliminary and HSC Courses')).toBeNull()
  })

  it('refuses a heading that names none', () => {
    expect(courseNamed('Rationale')).toBeNull()
    expect(courseNamed('Table of outcomes')).toBeNull()
  })
})

/* ---------------------------------------------------------- parseHeadingsXml */

describe('parseHeadingsXml on the reform shape', () => {
  const courses = parseHeadingsXml(REFORM)

  it('takes a course from each Outcomes and content heading', () => {
    expect(courses.map((c) => [c.id, c.name])).toEqual([
      ['y11', 'Year 11'],
      ['y12', 'Year 12'],
    ])
  })

  it('reads the outcome code off the end of the line, where this shape puts it', () => {
    expect(courses[0]?.outcomes).toEqual([
      { code: 'EXV-11-01', text: 'does the first thing' },
      { code: 'EXV-11-02', text: 'does the second thing' },
    ])
  })

  it('makes the focus area a group and its sub-headings the topics', () => {
    const topics = courses[0]?.topics ?? []
    expect(topics.map((t) => [t.name, t.group])).toEqual([
      // The paragraph describing the focus area is content too, and becomes a
      // topic named after the focus area rather than being dropped.
      ['First focus area', 'First focus area'],
      ['Understanding', 'First focus area'],
      ['Responding', 'First focus area'],
    ])
    expect(topics.map((t) => t.points?.length)).toEqual([1, 2, 1])
  })

  it('gives a focus area with no sub-headings no group, because nothing divides it', () => {
    const topics = courses[1]?.topics ?? []
    expect(topics.map((t) => [t.name, t.group])).toEqual([['Second focus area', undefined]])
    expect(topics[0]?.points).toEqual([
      { id: 'Y12-01.01', text: 'A point with no sub-heading above it' },
    ])
  })

  it('tags every topic with its focus area outcomes', () => {
    expect(courses[0]?.topics.map((t) => t.outcomes)).toEqual([
      ['EXV-11-01', 'EXV-11-02'],
      ['EXV-11-01', 'EXV-11-02'],
      ['EXV-11-01', 'EXV-11-02'],
    ])
  })
})

describe('parseHeadingsXml on the Drama shape', () => {
  const courses = parseHeadingsXml(DRAMA)

  it('takes the course from the numbered heading and not from the one naming both', () => {
    expect(courses.map((c) => c.id)).toEqual(['pre'])
  })

  it('reads the outcome code off the front of the line, where this shape puts it', () => {
    expect(courses[0]?.outcomes).toEqual([
      { code: 'P1.1', text: 'does the first thing' },
      { code: 'P1.2', text: 'does the second thing' },
      { code: 'P2.1', text: 'does a later thing' },
    ])
  })

  it('reads content that is prose rather than bullets', () => {
    expect(courses[0]?.topics.map((t) => [t.name, t.points?.length])).toEqual([
      ['First component', 2],
      ['Second component', 1],
    ])
  })

  it('ranks nothing by heading level, since this shape contradicts itself', () => {
    // The first component is `Head5` and the second `Heading3`; `Content` is
    // `Heading3` under one and `Head6` under the other. Both components are
    // topics all the same, because what decides is the heading that follows.
    expect(courses[0]?.topics.map((t) => t.name)).toEqual(['First component', 'Second component'])
  })

  it('ends the course at a heading level above it', () => {
    // Everything under "9 Course Requirements" is not content, and a reader
    // that never closes the course turns each of its headings into a topic.
    const names = courses[0]?.topics.map((t) => t.name) ?? []
    expect(names).not.toContain('A heading after the content has ended')
    const points = courses[0]?.topics.flatMap((t) => t.points ?? []) ?? []
    expect(points.map((p) => p.text)).not.toContain(
      'This paragraph is not content and must not be read as any.',
    )
  })
})

describe('parseHeadingsXml refusing', () => {
  it('refuses a document with no course heading', () => {
    const xml = body(heading('Heading1', 'Rationale'), para('Prose and nothing else.'))
    expect(() => parseHeadingsXml(xml)).toThrow(NotASyllabusError)
  })

  it('refuses a course heading with no content under it', () => {
    const xml = body(heading('Heading2', 'Outcomes and content for Year 11'), para('Nothing here.'))
    expect(() => parseHeadingsXml(xml)).toThrow(NotASyllabusError)
  })
})

/* ------------------------------------------------------------- parseProseXml */

describe('parseProseXml', () => {
  const courses = parseProseXml(PROSE)

  it('takes the courses from the columns of the outcome table', () => {
    expect(courses.map((c) => [c.id, c.name])).toEqual([
      ['pre', 'Preliminary course'],
      ['hsc', 'HSC course'],
    ])
    expect(courses[0]?.outcomes).toEqual([
      { code: 'P1', text: 'does the first thing' },
      { code: 'P2', text: 'does the second thing' },
    ])
  })

  it('reads only the numbered content section', () => {
    const points = courses.flatMap((c) => c.topics.flatMap((t) => (t.points ?? []).map((p) => p.text)))
    expect(points).not.toContain('Not content: this section is before the content section.')
    expect(points).not.toContain('Not content: the content section has ended.')
  })

  it('gives a section naming one course to that course alone, and the rest to both', () => {
    expect(courses[0]?.topics.map((t) => t.name)).toEqual([
      'Purpose and Focus of the Preliminary Course',
      'The Shared Section',
      'A sub-heading',
    ])
    expect(courses[1]?.topics.map((t) => t.name)).toEqual([
      'Purpose and Focus of the HSC Course',
      'The Shared Section',
      'A sub-heading',
    ])
  })

  it('takes both paragraphs and bullets as content points', () => {
    // Most of this shape is prose, so reading only the bullets would drop most
    // of the syllabus.
    const shared = courses[0]?.topics.find((t) => t.name === 'A sub-heading')
    expect(shared?.points?.map((p) => p.text)).toEqual(['And this.', 'And this bullet.'])
  })

  it('leaves topic outcomes empty, because this shape maps them to content areas', () => {
    expect(courses.flatMap((c) => c.topics.flatMap((t) => t.outcomes ?? []))).toEqual([])
  })

  it('refuses a document with no outcome table naming courses', () => {
    const xml = body(boldPara('8Content: Example'), para('Some content.'))
    expect(() => parseProseXml(xml)).toThrow(NotASyllabusError)
  })

  it('refuses a document whose content section is not numbered and bold', () => {
    const xml = body(
      table(row(cell('Content'), cell('Preliminary course')), row(cell('x'), cell('P1:a thing'))),
      para('8Content: Example'),
      para('Some content.'),
    )
    expect(() => parseProseXml(xml)).toThrow(NotASyllabusError)
  })
})

/* -------------------------------------------------------------- the chooser */

describe('readSyllabusXml', () => {
  it('gives each shape to the reader that fits it', () => {
    expect(readSyllabusXml(REFORM).format).toBe('headings')
    expect(readSyllabusXml(DRAMA).format).toBe('headings')
    expect(readSyllabusXml(PROSE).format).toBe('prose')
  })

  it('gives a content table to the 2013 reader even though it also has headings', () => {
    const xml = body(
      heading('Heading1', 'Content: Example Preliminary Course'),
      table(
        row(cell('Outcomes'), cell('Students learn about:'), cell('Students learn to:')),
        row(cell('P1.1 does a thing'), cell('a topic', 'a point'), cell('a skill')),
      ),
    )
    expect(readSyllabusXml(xml).format).toBe('tables')
  })

  it('names the documents it does read when nothing fits', () => {
    // The teacher can act on the list of what Klunk reads. They cannot act on
    // which pattern each reader failed to match, so that is left out.
    const xml = body(para('An ordinary letter, in Word, about nothing in particular.'))
    expect(() => readSyllabusXml(xml)).toThrow(NotASyllabusError)
    expect(() => readSyllabusXml(xml)).toThrow(/sets out its content in a table/)
    expect(() => readSyllabusXml(xml)).toThrow(/Outcomes and Content headings/)
    expect(() => readSyllabusXml(xml)).toThrow(/numbered sections of prose/)
  })

  it('describes every format it can report', () => {
    for (const format of ['tables', 'headings', 'prose'] as const) {
      expect(FORMAT_DESCRIPTIONS[format].length).toBeGreaterThan(0)
    }
  })
})
