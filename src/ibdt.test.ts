/**
 * The IB reader, on invented rows.
 *
 * This is the check that runs in CI, so every row here is fictional: the shape
 * of the published map with a syllabus that does not exist written into it.
 * `ibdt.corpus.test.ts` runs the real document and is skipped when it is absent.
 *
 * The header row is real, because it is the contract the reader matches on and
 * a made-up one would test nothing. Column headings are not a syllabus.
 */

import { describe, expect, it } from 'vitest'
import { readIbDesignTechnology } from './ibdt'
import { NotASyllabusError } from './syllabus'

const HEADER = [
  'Theme',
  'Level of organization',
  'Topic number and name',
  'Understandings number and name',
  'Understandings content',
  'SL and HL or HL only',
  // The map sets the new syllabus beside the one it replaces, and four of the
  // six headings repeat on the old side. Kept here so the test proves the
  // reader takes the left-hand set.
  'Topic or option number and name',
  'Sub-topic number and name',
  'Sub-topic content',
  'SL and HL or HL only',
  'SME notes',
]

/** A row with only the columns a caller cares about filled in. */
function row(cells: Record<number, string>): string[] {
  const out = Array.from({ length: HEADER.length }, () => '')
  for (const [at, value] of Object.entries(cells)) out[Number(at)] = value
  return out
}

const SHEET = [
  ['Fictional Studies Syllabus Map'],
  [],
  HEADER,
  // Theme and level are merged down their blocks, so only the first row of
  // each carries them: every row after has them blank.
  row({
    0: 'A. Making things up',
    1: '1. People',
    2: 'A1.1 Believability',
    3: '1.1.1 A story holds together when nothing in it contradicts anything else.',
    4: 'Students must be able to explain why an inconsistency breaks a reader out of a story.',
    5: 'SL and HL',
    6: '3. Narrative',
    9: 'HL only',
  }),
  row({
    3: '1.1.2 Detail earns trust.',
    4: 'Students must be able to discuss how specific detail makes an invented world credible.',
    5: 'SL and HL',
  }),
  row({
    1: '2. Process',
    2: 'A2.1 Drafting',
    3: '2.1.1 A first draft is for finding the shape.',
    4: 'Students must be able to outline why a first draft is not a final one.',
    5: 'SL and HL',
  }),
  row({
    0: 'B. Checking things',
    1: '1. People',
    2: 'B1.1 Fact-checking (HL only)',
    3: '1.1.1 A claim is worth only its source.',
    4: 'Students must be able to evaluate a source for reliability.',
    5: 'HL',
  }),
  row({
    3: '1.1.2 Two sources repeating each other are one source.',
    4: 'Students must be able to identify circular sourcing.',
    5: 'HL',
  }),
]

function read(rows: string[][]) {
  return readIbDesignTechnology([{ name: 'Mapping', rows }])
}

describe('readIbDesignTechnology', () => {
  it('splits SL and HL by the level-of-study column', () => {
    const [sl, hl] = read(SHEET).courses

    expect(sl!.id).toBe('sl')
    expect(sl!.topics.map((t) => t.id)).toEqual(['A1-1', 'A2-1'])
    // HL is the whole syllabus, not the difference.
    expect(hl!.topics.map((t) => t.id)).toEqual(['A1-1', 'A2-1', 'B1-1'])
  })

  it('reads a merged theme and level down the rows they cover', () => {
    const hl = read(SHEET).courses[1]!

    expect(hl.topics.map((t) => t.group)).toEqual([
      'A. Making things up',
      'A. Making things up',
      'B. Checking things',
    ])
    expect(hl.topics.map((t) => t.name)).toEqual([
      'A1.1 People: Believability',
      'A2.1 Process: Drafting',
      'B1.1 People: Fact-checking',
    ])
  })

  it('numbers points off the topic id, in published order', () => {
    const topic = read(SHEET).courses[0]!.topics[0]!

    expect(topic.points!.map((p) => p.id)).toEqual(['A1-1.1', 'A1-1.2'])
    expect(topic.points![0]!.text).toBe(
      '1.1.1 A story holds together when nothing in it contradicts anything else. ' +
        'Students must be able to explain why an inconsistency breaks a reader out of a story.',
    )
  })

  it('keeps the published heading verbatim beside the tidied name', () => {
    const topic = read(SHEET).courses[1]!.topics[2]!

    expect(topic.name).toBe('B1.1 People: Fact-checking')
    expect(topic.text).toBe('B1.1 Fact-checking (HL only)')
  })

  it('reads the new syllabus columns, not the ones it is replacing', () => {
    // The first row names an old topic and marks it HL only on the right-hand
    // side. Reading either would put A1.1 in the wrong course under the wrong
    // name.
    const sl = read(SHEET).courses[0]!

    expect(sl.topics[0]!.name).toBe('A1.1 People: Believability')
    expect(sl.topics.map((t) => t.id)).toContain('A1-1')
  })

  it('finds the header wherever it sits, and skips the sheets without it', () => {
    const courses = readIbDesignTechnology([
      {
        name: 'Tips',
        rows: [
          ['Tip', "Why It's Useful"],
          ['Start early', 'Because.'],
        ],
      },
      { name: 'Mapping', rows: SHEET },
    ]).courses

    expect(courses[1]!.topics).toHaveLength(3)
  })

  it('refuses a workbook with no header row', () => {
    expect(() =>
      readIbDesignTechnology([{ name: 'Assessment', rows: [['Aspect', '2020', '2027']] }]),
    ).toThrow(NotASyllabusError)
  })

  it('refuses a header row with no topics under it', () => {
    expect(() => read([HEADER])).toThrow(/no topics/)
  })

  it('refuses a topic whose understandings disagree about the level of study', () => {
    const mixed = [
      HEADER,
      row({
        0: 'A. Making things up',
        1: '1. People',
        2: 'A1.1 Believability',
        3: '1.1.1 One.',
        5: 'SL and HL',
      }),
      row({ 3: '1.1.2 Two.', 5: 'HL' }),
    ]

    // Silently dropping 1.1.2 from SL, or silently keeping it, are both worse
    // than saying so: this is the whole reason the check exists.
    expect(() => read(mixed)).toThrow(/A1\.1 People: Believability/)
  })

  it('ignores a row that is not a topic and not an understanding', () => {
    const withNoise = [
      HEADER,
      row({ 0: 'red text', 1: '- highlights new content' }),
      ...SHEET.slice(3),
    ]

    expect(read(withNoise).courses[1]!.topics).toHaveLength(3)
  })

  it('closes an understanding that was published without a full stop', () => {
    const unstopped = [
      HEADER,
      row({
        0: 'A. Making things up',
        1: '1. People',
        2: 'A1.1 Believability',
        3: '1.1.1 There are four kinds of lie',
        4: 'Students must be able to name them.',
        5: 'SL and HL',
      }),
    ]

    expect(read(unstopped).courses[0]!.topics[0]!.points![0]!.text).toBe(
      '1.1.1 There are four kinds of lie. Students must be able to name them.',
    )
  })

  it('keeps an understanding with no "students must" column', () => {
    const sparse = [
      HEADER,
      row({
        0: 'A. Making things up',
        1: '1. People',
        2: 'A1.1 Believability',
        3: '1.1.1 One.',
        5: 'SL and HL',
      }),
    ]

    expect(read(sparse).courses[0]!.topics[0]!.points![0]!.text).toBe('1.1.1 One.')
  })
})
