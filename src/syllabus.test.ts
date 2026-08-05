/**
 * The syllabus reader on synthetic OOXML.
 *
 * The real documents cannot be committed — they are NESA's and this repo is
 * public — so these are hand-written fragments in the shape the real ones use.
 * `syllabus.corpus.test.ts` runs against the actual files when the content
 * folder is there, and additionally checks this reader against the Python
 * generator it was ported from.
 *
 * The cases worth having are the ones that were wrong at some point, since
 * those are the ones a rewrite is most likely to get wrong again: which course
 * a table belongs to, and what counts as a group heading (#14).
 */

import { describe, expect, it } from 'vitest'
import {
  courseOf,
  focusAreaName,
  NotASyllabusError,
  parseSyllabusXml,
  suggestSyllabusId,
  summarise,
  tableLayout,
  tidyName,
  toSyllabus,
} from './syllabus'

/* ------------------------------------------------- building a document body */

const para = (...runs: string[]) =>
  `<w:p>${runs.map((r) => `<w:r><w:t>${r}</w:t></w:r>`).join('')}</w:p>`

const cell = (...lines: string[]) => `<w:tc>${lines.map((l) => para(l)).join('')}</w:tc>`

const row = (...cells: string[]) => `<w:tr>${cells.join('')}</w:tr>`

const table = (...rows: string[]) => `<w:tbl>${rows.join('')}</w:tbl>`

const body = (...blocks: string[]) => `<w:document><w:body>${blocks.join('')}</w:body></w:document>`

/** The three-column layout Design and Technology uses. */
const wideHeader = row(cell('Outcomes'), cell('Students learn about:'), cell('Students learn to:'))

/** The two-column layout Textiles and Design uses. */
const narrowHeader = row(cell('Students learn about:'), cell('Students learn to:'))

describe('tableLayout', () => {
  it('knows the three-column content table', () => {
    expect(tableLayout([[['Outcomes'], ['Students learn about:'], ['Students learn to:']]])).toBe(
      'wide',
    )
  })

  it('knows the two-column one, which has no outcome column at all', () => {
    expect(tableLayout([[['Students learn about'], ['Students learn to']]])).toBe('narrow')
  })

  it('ignores a table that is not a content table', () => {
    expect(tableLayout([[['Component'], ['Weighting']]])).toBeNull()
    expect(tableLayout([])).toBeNull()
  })
})

describe('courseOf', () => {
  it('reads the course off the outcome prefix, which is the only signal the narrow layout gives', () => {
    expect(courseOf(['P1.1', 'P4.2'], null).id).toBe('pre')
    expect(courseOf(['H1.1'], null).id).toBe('hsc')
  })

  it('falls back to the nearest heading when the codes do not agree', () => {
    // A mixed block cannot be attributed by its codes, so the heading decides.
    expect(courseOf(['P1.1', 'H1.1'], 'HSC').id).toBe('hsc')
    expect(courseOf([], 'Preliminary').id).toBe('pre')
  })

  it('prefers the codes over the heading', () => {
    // Relying on the heading alone silently misfiled whole courses: Industrial
    // Technology never writes "Content: ... HSC" at all.
    expect(courseOf(['H2.1'], 'Preliminary').id).toBe('hsc')
  })

  it('says so rather than guessing when nothing names the course', () => {
    expect(courseOf([], null).id).toBe('course')
  })
})

describe('tidyName', () => {
  it('drops a heading that announces its own list', () => {
    expect(tidyName('factors affecting designing, including:')).toBe('factors affecting designing')
    expect(tidyName('the work of designers includes:')).toBe('the work of designers')
  })

  it('leaves a heading that says nothing of the sort', () => {
    expect(tidyName('emerging technologies')).toBe('emerging technologies')
  })

  it('flattens the non-breaking spaces the document is full of', () => {
    // #26. Invisible on screen, so a name carrying one looks identical to a
    // name without and matches nothing. The verbatim heading is kept in `text`.
    expect(tidyName('the impact of the major design\u00a0project')).toBe(
      'the impact of the major design project',
    )
  })
})

describe('focusAreaName', () => {
  it('takes the course marker off, since that belongs to the course', () => {
    expect(focusAreaName('Automotive Technologies (Preliminary)')).toBe('Automotive Technologies')
  })

  it('flattens the non-breaking spaces the document is full of', () => {
    // Invisible on screen, and they make two spellings of one area look like two.
    expect(focusAreaName('Properties\u00a0and Performance  of Textiles')).toBe(
      'Properties and Performance of Textiles',
    )
  })
})

describe('parseSyllabusXml, wide layout', () => {
  const xml = body(
    para('8Content: Design and Technology Preliminary Course'),
    table(
      wideHeader,
      row(
        cell('P1.1', 'examines design theory and practice'),
        cell('design theory and practice', 'the nature of design', 'design in society'),
        cell('analyse design theory'),
      ),
      // A blank outcome cell means the outcome above still applies.
      row(cell(), cell('design processes', 'stages of a design process'), cell('apply a process')),
    ),
  )

  it('reads the topic heading and its content points apart', () => {
    const [course] = parseSyllabusXml(xml)
    expect(course?.topics.map((t) => t.name)).toEqual([
      'design theory and practice',
      'design processes',
    ])
    expect(course?.topics[0]?.points?.map((p) => p.text)).toEqual([
      'the nature of design',
      'design in society',
    ])
  })

  it('numbers topics and points with stable local ids', () => {
    const [course] = parseSyllabusXml(xml)
    expect(course?.topics.map((t) => t.id)).toEqual(['PRE-01', 'PRE-02'])
    expect(course?.topics[0]?.points?.map((p) => p.id)).toEqual(['PRE-01.01', 'PRE-01.02'])
  })

  it('carries the outcome down the continuation rows', () => {
    const [course] = parseSyllabusXml(xml)
    expect(course?.topics.map((t) => t.outcomes)).toEqual([['P1.1'], ['P1.1']])
    expect(course?.outcomes).toEqual([
      { code: 'P1.1', text: 'examines design theory and practice' },
    ])
  })
})

describe('parseSyllabusXml, narrow layout', () => {
  const xml = body(
    para('Area of Study: Design'),
    para('P2.1', 'explains the elements of design'),
    table(
      narrowHeader,
      row(cell('Elements of design', 'colour', 'texture'), cell('identify elements')),
      row(cell('Principles of design', 'balance'), cell('apply principles')),
    ),
    para('Area of Study: Properties and Performance of Textiles'),
    para('P3.1', 'describes fabric structure'),
    table(narrowHeader, row(cell('Fabric structure', 'woven'), cell('classify fabrics'))),
  )

  it('takes the outcomes from the paragraphs above each table', () => {
    const [course] = parseSyllabusXml(xml)
    expect(course?.outcomes?.map((o) => o.code)).toEqual(['P2.1', 'P3.1'])
    expect(course?.topics.map((t) => t.outcomes)).toEqual([['P2.1'], ['P2.1'], ['P3.1']])
  })

  it('numbers straight through a course spread over many tables', () => {
    const [course] = parseSyllabusXml(xml)
    expect(course?.topics.map((t) => t.id)).toEqual(['PRE-01', 'PRE-02', 'PRE-03'])
  })

  it('groups each topic under the area of study above it', () => {
    const [course] = parseSyllabusXml(xml)
    expect(course?.topics.map((t) => t.group)).toEqual([
      'Design',
      'Design',
      'Properties and Performance of Textiles',
    ])
  })
})

/**
 * A topic that ran past the bottom of a page (#26).
 *
 * Word starts a fresh table row after the break and the list carries on from
 * where it stopped, so the row opens on "iv)" with no heading of its own.
 * Textiles HSC has one, and it became a topic named after a content point with
 * the five points that followed it hanging underneath.
 */
describe('a row that continues the topic above', () => {
  const xml = body(
    para('P2.1', 'explains innovations'),
    table(
      narrowHeader,
      row(
        cell('Innovations', 'advances in:', 'i)fibre', 'ii)yarn'),
        cell('identify innovations'),
      ),
      row(cell('iii)fabric', 'the advantages of:', 'the consumer'), cell('evaluate advances')),
      row(cell('Major Textiles Project', 'investigation'), cell('investigate')),
    ),
  )

  it('adds the whole cell to the topic above rather than starting one', () => {
    const [course] = parseSyllabusXml(xml)
    expect(course?.topics.map((t) => t.name)).toEqual(['Innovations', 'Major Textiles Project'])
    expect(course?.topics[0]?.points?.map((p) => p.text)).toEqual([
      'advances in:',
      'i)fibre',
      'ii)yarn',
      // The heading line of the continuation row is content, not a heading.
      'iii)fabric',
      'the advantages of:',
      'the consumer',
    ])
  })

  it('numbers the points it merges on from the parent, and takes its skills too', () => {
    const [course] = parseSyllabusXml(xml)
    expect(course?.topics[0]?.points?.map((p) => p.id)).toEqual([
      'PRE-01.01',
      'PRE-01.02',
      'PRE-01.03',
      'PRE-01.04',
      'PRE-01.05',
      'PRE-01.06',
    ])
    expect(course?.topics[0]?.skills).toEqual(['identify innovations', 'evaluate advances'])
  })

  it('numbers the topics after it as though it had never been there', () => {
    // The point of the fix a teacher sees: the ids do not skip, and no topic is
    // named after a content point.
    const [course] = parseSyllabusXml(xml)
    expect(course?.topics.map((t) => t.id)).toEqual(['PRE-01', 'PRE-02'])
  })

  it('takes it as a topic when there is nothing to continue', () => {
    // No NESA syllabus opens a course on a continuation, and reading it as a
    // topic at least keeps the content.
    const [course] = parseSyllabusXml(
      body(
        para('P2.1', 'explains innovations'),
        table(narrowHeader, row(cell('iv)finishing techniques', 'a point'), cell('x'))),
      ),
    )
    expect(course?.topics.map((t) => t.id)).toEqual(['PRE-01'])
  })
})

describe('what a tab or a line break is worth', () => {
  // #26: both used to be replaced in the XML before the runs were collected,
  // which did nothing at all — only <w:t> contents are read, so the space landed
  // between elements and went out with the markup. "Design inspiration" and
  // "including:" arrived as one word.
  const tabbed = (...parts: string[]) => `<w:p>${parts.join('')}</w:p>`
  const run = (text: string) => `<w:r><w:t>${text}</w:t></w:r>`

  it('reads a tab between two runs as a space', () => {
    const xml = body(
      table(
        narrowHeader,
        `<w:tr><w:tc>${tabbed(run('Design inspiration'), '<w:tab/>', run('including:'))}</w:tc><w:tc>${tabbed(run('x'))}</w:tc></w:tr>`,
      ),
    )
    const [course] = parseSyllabusXml(xml)
    expect(course?.topics[0]?.text).toBe('Design inspiration including:')
    expect(course?.topics[0]?.name).toBe('Design inspiration')
  })

  it('reads a line break the same way, and counts a tab beside a space once', () => {
    const xml = body(
      table(
        narrowHeader,
        `<w:tr><w:tc>${tabbed(run('the use of textiles to enhance'), '<w:br/>', '<w:tab/>', run('performance'))}</w:tc><w:tc>${tabbed(run('x'))}</w:tc></w:tr>`,
      ),
    )
    const [course] = parseSyllabusXml(xml)
    expect(course?.topics[0]?.text).toBe('the use of textiles to enhance performance')
  })

  it('leaves a tab stop alone, since that is a paragraph property and not text', () => {
    const xml = body(
      table(
        narrowHeader,
        `<w:tr><w:tc>${tabbed('<w:pPr><w:tabs><w:tab w:val="left" w:pos="999"/></w:tabs></w:pPr>', run('Fabric structure'))}</w:tc><w:tc>${tabbed(run('x'))}</w:tc></w:tr>`,
      ),
    )
    const [course] = parseSyllabusXml(xml)
    expect(course?.topics[0]?.text).toBe('Fabric structure')
  })
})

describe('what counts as a group', () => {
  it('takes a group only from a heading that says it is one', () => {
    // #14: every topic in Design and Technology was filed under
    // "7.2Key Competencies", a numbered section heading from the furniture,
    // because any short paragraph not ending in a full stop was taken as a
    // group. The counts stayed right the whole time.
    const xml = body(
      para('7.2Key Competencies'),
      para('Students engage in a range of learning experiences'),
      para('Cutting, clicking and closing'),
      table(
        wideHeader,
        row(cell('H1.1', 'critically analyses'), cell('emerging technologies', 'a point'), cell('x')),
      ),
    )
    const [course] = parseSyllabusXml(xml)
    expect(course?.topics[0]?.group).toBeUndefined()
  })

  it('accepts both labels the syllabuses actually use', () => {
    for (const label of ['Area of Study: Design', 'Focus Area: Design', '3.1 Focus Area – Design']) {
      const xml = body(
        para(label),
        table(wideHeader, row(cell('H1.1', 'x'), cell('a topic', 'a point'), cell('y'))),
      )
      expect(parseSyllabusXml(xml)[0]?.topics[0]?.group, label).toBe('Design')
    }
  })
})

describe('parseSyllabusXml, the whole document', () => {
  it('puts Preliminary before HSC however the document was laid out', () => {
    // Headings, not codes: in the wide layout the outcomes are inside the
    // table, so by the time the table is reached nothing has been gathered from
    // the paragraphs above and the heading is the only signal there is.
    const xml = body(
      para('12Content: HSC Course'),
      table(wideHeader, row(cell('H1.1', 'x'), cell('an HSC topic', 'p'), cell('y'))),
      para('8Content: Preliminary Course'),
      table(wideHeader, row(cell('P1.1', 'x'), cell('a Preliminary topic', 'p'), cell('y'))),
    )
    expect(parseSyllabusXml(xml).map((c) => c.id)).toEqual(['pre', 'hsc'])
  })

  it('says so rather than guessing when a wide table has no heading above it', () => {
    const xml = body(table(wideHeader, row(cell('P1.1', 'x'), cell('a topic', 'p'), cell('y'))))
    // Not 'pre'. The outcome is in the table, so it is not in scope when the
    // course is decided, and inventing one would file content under a course
    // the document never named.
    expect(parseSyllabusXml(xml)[0]?.id).toBe('course')
  })

  it('ignores paragraphs inside a table, which are cell contents', () => {
    // A topic heading that reads like a course heading must not be taken as
    // one just because it is a paragraph.
    const xml = body(
      para('8Content: Preliminary Course'),
      table(wideHeader, row(cell('P1.1', 'x'), cell('Content: HSC as a topic name', 'p'), cell('y'))),
    )
    const [course] = parseSyllabusXml(xml)
    expect(course?.id).toBe('pre')
    expect(course?.topics[0]?.name).toBe('Content: HSC as a topic name')
  })

  it('refuses a document with no content table rather than returning nothing', () => {
    const xml = body(para('A syllabus, but not one of these'), table(row(cell('a'), cell('b'))))
    expect(() => parseSyllabusXml(xml)).toThrow(NotASyllabusError)
  })

  it('decodes the entities and drops the runs Word never shows', () => {
    const xml = body(
      table(
        wideHeader,
        row(
          cell('P1.1', 'x'),
          `<w:tc><w:p><w:instrText>TOC \\o</w:instrText><w:r><w:t>design &amp; technology</w:t></w:r></w:p><w:p><w:r><w:t>cost &lt; value</w:t></w:r></w:p></w:tc>`,
          cell('y'),
        ),
      ),
    )
    const [course] = parseSyllabusXml(xml)
    expect(course?.topics[0]?.name).toBe('design & technology')
    expect(course?.topics[0]?.points?.[0]?.text).toBe('cost < value')
  })
})

describe('summarise', () => {
  it('counts what a teacher can check against the document', () => {
    const xml = body(
      para('Area of Study: Design'),
      para('P1.1', 'x'),
      table(narrowHeader, row(cell('a topic', 'one', 'two'), cell('skill'))),
    )
    expect(summarise(parseSyllabusXml(xml))).toEqual([
      {
        courseId: 'pre',
        courseName: 'Preliminary course',
        topics: 1,
        points: 2,
        outcomes: 1,
        groups: ['Design'],
      },
    ])
  })
})

describe('toSyllabus', () => {
  const identity = {
    id: 'nsw-hsc-design-technology',
    name: 'Design and Technology',
    sourceTitle: 'design-technology-st6-syl.docx',
    retrieved: '2026-08-02',
  }

  it('marks the model as not redistributable, whatever else it says', () => {
    // Klunk reads this before it will bundle anything, and a syllabus is
    // copyright unless its publisher has clearly said otherwise.
    expect(toSyllabus([], identity).source?.redistributable).toBe(false)
  })

  it('leaves the url out rather than writing an empty one', () => {
    expect('url' in (toSyllabus([], identity).source ?? {})).toBe(false)
    expect(toSyllabus([], { ...identity, sourceUrl: 'https://example.invalid' }).source?.url).toBe(
      'https://example.invalid',
    )
  })

  it('claims no edition unless it was told one', () => {
    // This used to default to "Stage 6 (2013)", which was true of the only two
    // documents Klunk could read at the time. It is false of Visual Arts Stage 6
    // (2016), of Drama Stage 6 (2009) and of the 2024 syllabuses, and a teacher
    // reads this field to tell which edition their questions are tagged against.
    expect('syllabusVersion' in toSyllabus([], identity)).toBe(false)
    expect('syllabusVersion' in toSyllabus([], { ...identity, syllabusVersion: '  ' })).toBe(false)
    expect(toSyllabus([], { ...identity, syllabusVersion: ' 11–12 (2024) ' }).syllabusVersion).toBe(
      '11–12 (2024)',
    )
  })
})

describe('suggestSyllabusId', () => {
  it('turns the filename into the slug an id has to be', () => {
    expect(suggestSyllabusId('design-technology-st6-syl.docx')).toBe('design-technology-st6-syl')
    expect(suggestSyllabusId('Textiles and Design (2013).docx')).toBe('textiles-and-design-2013')
    expect(suggestSyllabusId('!!!.docx')).toBe('syllabus')
  })
})
