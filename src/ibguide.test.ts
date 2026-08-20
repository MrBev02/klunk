/**
 * The guide reader on fictional pages, which is the check that runs in CI.
 *
 * Every fixture below is invented, for the reason `extract.test.ts` gives about
 * the NESA papers: the IB subject guide is licensed through the Programme
 * Resource Centre and cannot enter this repo, which is public. So the themes,
 * the levels of organization, the topic names and every statement here are made
 * up, arranged in the *shape* the guide prints. The shape is what is being
 * tested — what identifies a heading, what closes a topic, what a page break
 * does to an understanding — and none of it needs the IB's words.
 *
 * Fictional on purpose in a second way: the theme and level names are nothing
 * like the real ones, so a test passing is evidence the reader *read* them
 * rather than evidence it knows them. `ibguide.corpus.test.ts` checks the real
 * guide, outside the repo, and skips itself when it is not there.
 */

import { describe, expect, it } from 'vitest'
import type { PageText } from './extract'
import { readIbGuide } from './ibguide'
import { page } from './fixtures/page'
import { NotASyllabusError } from './syllabus'

/** The Overview table, whose three columns interleave into one line each. */
const OVERVIEW = page(
  4,
  'Syllabus content',
  'A. Making in theory B. Making in practice C. Making in context',
  '1. Makers A1.1 Hand tools B1.1 Workshop habits C1.1 Tools and the town',
  '2. Method A2.1 Sequencing B2.1 Method in the round C2.1 Method and the town',
  'Design technology guide',
)

const HOURS_SL = 'Standard level (SL) and higher level (HL): 10 hours'
const HOURS_HL = 'Higher level (HL): 6 hours'

/** One whole topic, in the order the guide prints it. */
function topic(number: string, title: string, hours: string, ...body: string[]): string[] {
  return [
    `${number} ${title}`,
    'Guiding question',
    `Why does ${title.toLowerCase()} matter to a maker?`,
    hours,
    ...body,
    'Linking questions',
    `• How does ${title.toLowerCase()} shape a workshop? (B1.1)`,
  ]
}

function guide(...pages: PageText[]) {
  return readIbGuide([OVERVIEW, ...pages])
}

const SIMPLE = page(
  5,
  'Syllabus content',
  'A. Making in theory',
  ...topic(
    'A1.1',
    'Hand tools',
    HOURS_SL,
    '1.1.1 A hand tool is shaped by the hand that holds it.',
    'Students must be able to describe how a grip changes the work a tool can do.',
    '1.1.2 A blade dulls with use and is sharpened against a stone.',
    'Students must be able to explain why an edge angle suits one material and not another.',
  ),
  '30 Design technology guide',
)

describe('finding the syllabus', () => {
  it('reads a topic and every understanding under it', () => {
    const [sl] = guide(SIMPLE).courses
    const tools = sl!.topics[0]!

    expect(tools.id).toBe('A1-1')
    expect(tools.text).toBe('A1.1 Hand tools')
    expect(tools.points!.map((p) => p.id)).toEqual(['A1-1.1', 'A1-1.2'])
    expect(tools.points![0]!.text).toBe(
      '1.1.1 A hand tool is shaped by the hand that holds it. Students must be able to ' +
        'describe how a grip changes the work a tool can do.',
    )
  })

  it('names a topic with its number, level of organization and title', () => {
    // The level comes from the Overview table's own row, so the name is read
    // rather than assembled from anything this reader knows.
    expect(guide(SIMPLE).courses[0]!.topics[0]!.name).toBe('A1.1 Makers: Hand tools')
  })

  it('puts every topic of a theme under the theme, not only the first', () => {
    const pages = page(
      5,
      'A. Making in theory',
      ...topic('A1.1', 'Hand tools', HOURS_SL, '1.1.1 One.', 'Students must be able to do one.'),
      ...topic('A2.1', 'Sequencing', HOURS_SL, '2.1.1 Two.', 'Students must be able to do two.'),
    )
    expect(guide(pages).courses[0]!.topics.map((t) => t.group)).toEqual([
      'A. Making in theory',
      'A. Making in theory',
    ])
  })

  it('ignores a topic code that is not followed by "Guiding question"', () => {
    // The Overview table's rows match every pattern a heading matches. If the
    // code alone were enough, this model would carry eight topics that are
    // half of one line of a table.
    expect(guide(SIMPLE).courses[1]!.topics.map((t) => t.id)).toEqual(['A1-1'])
  })

  it('stops a topic at "Linking questions"', () => {
    const pages = page(
      5,
      'A. Making in theory',
      ...topic('A1.1', 'Hand tools', HOURS_SL, '1.1.1 One.', 'Students must be able to do one.'),
      'Students must ensure their work adheres to the academic integrity policy.',
      '1.1.2 A stray numbered line after the topic has closed.',
    )
    expect(guide(pages).courses[0]!.topics[0]!.points!).toHaveLength(1)
  })
})

describe('the words on the page', () => {
  it('drops the running head and foot', () => {
    for (const point of guide(SIMPLE).courses[0]!.topics[0]!.points!) {
      expect(point.text).not.toMatch(/Design technology guide|Syllabus content/)
    }
  })

  it('takes "Students must" in any form, not only "Students must be able to"', () => {
    // Two of the guide's 161 understandings open the paragraph differently, and
    // requiring the full phrase folds both into the statement above them.
    const pages = page(
      5,
      'A. Making in theory',
      ...topic(
        'A1.1',
        'Hand tools',
        HOURS_SL,
        '1.1.1 A hand tool is shaped by the hand that holds it.',
        'Students must outline how a grip changes the work a tool can do.',
      ),
    )
    expect(guide(pages).courses[0]!.topics[0]!.points![0]!.text).toContain(
      'it. Students must outline how',
    )
  })

  it('adds the full stop the guide leaves off, rather than running two sentences together', () => {
    const pages = page(
      5,
      'A. Making in theory',
      ...topic(
        'A1.1',
        'Hand tools',
        HOURS_SL,
        '1.1.1 A hand tool is shaped by the hand that holds it',
        'Students must be able to describe a grip.',
      ),
    )
    expect(guide(pages).courses[0]!.topics[0]!.points![0]!.text).toContain(
      'holds it. Students must be able to',
    )
  })

  it('joins a hyphen at the end of a line without a space', () => {
    // Otherwise a word broken at its own hyphen comes out as `multi- meters`.
    const pages = page(
      5,
      'A. Making in theory',
      ...topic(
        'A1.1',
        'Hand tools',
        HOURS_SL,
        '1.1.1 A tool may be single- or double-',
        'edged, and the difference matters.',
        'Students must be able to describe both.',
      ),
    )
    expect(guide(pages).courses[0]!.topics[0]!.points![0]!.text).toContain('double-edged')
  })
})

describe('an understanding split by a page break', () => {
  const STATEMENT = '1.1.2 A blade dulls with use and is sharpened against a stone, which is'
  const REST = 'why a workshop keeps one.'

  const first = page(
    5,
    'Syllabus content',
    'A. Making in theory',
    'A1.1 Hand tools',
    'Guiding question',
    'Why do hand tools matter to a maker?',
    HOURS_SL,
    '1.1.1 A hand tool is shaped by the hand that holds it.',
    'Students must be able to describe how a grip changes the work.',
    STATEMENT,
    REST,
    'Students must be able to explain why an edge angle suits one material and',
    '30 Design technology guide',
  )

  const second = page(
    6,
    'Syllabus content',
    // The guide reprints the statement at the top of the next page, then
    // carries the paragraph on mid-sentence underneath it.
    STATEMENT,
    REST,
    'not another, and sharpen an edge to that angle.',
    'Linking questions',
    '• How does a sharp edge shape a workshop? (B1.1)',
  )

  it('merges the reprint instead of counting it', () => {
    expect(guide(first, second).courses[0]!.topics[0]!.points!.map((p) => p.id)).toEqual([
      'A1-1.1',
      'A1-1.2',
    ])
  })

  it('leaves the sentence the break cut in half whole', () => {
    const split = guide(first, second).courses[0]!.topics[0]!.points![1]!

    // The failure this guards is not a missing point but a truncated one: the
    // count was right while the content was wrong (#26, #43).
    expect(split.text).toContain('suits one material and not another')
    expect(split.text.match(/A blade dulls with use/g)).toHaveLength(1)
  })
})

describe('Standard level and Higher level', () => {
  const both = page(
    5,
    'A. Making in theory',
    ...topic('A1.1', 'Hand tools', HOURS_SL, '1.1.1 One.', 'Students must be able to do one.'),
    ...topic(
      'A2.1',
      'Sequencing (HL only)',
      HOURS_HL,
      '2.1.1 Two.',
      'Students must be able to do two.',
    ),
  )

  it('keeps an HL-only topic out of the Standard level course', () => {
    const { courses } = guide(both)

    expect(courses[0]!.topics.map((t) => t.id)).toEqual(['A1-1'])
    expect(courses[1]!.topics.map((t) => t.id)).toEqual(['A1-1', 'A2-1'])
  })

  it('drops "(HL only)" from the name and keeps it in the published heading', () => {
    const hl = guide(both).courses[1]!.topics[1]!

    expect(hl.name).toBe('A2.1 Method: Sequencing')
    expect(hl.text).toBe('A2.1 Sequencing (HL only)')
  })

  it('refuses a topic whose heading and hours line disagree', () => {
    // Two independent statements of the same fact, so a disagreement means one
    // of them is being misread. Guessing puts a whole topic in the wrong course
    // and nothing on screen looks wrong.
    const pages = page(
      5,
      'A. Making in theory',
      ...topic('A1.1', 'Hand tools (HL only)', HOURS_SL, '1.1.1 One.', 'Students must do one.'),
    )
    expect(() => guide(pages)).toThrow(NotASyllabusError)
    expect(() => guide(pages)).toThrow(/disagrees with itself/)
  })
})

describe('refusing what it does not recognise', () => {
  it('refuses a PDF that is not the guide', () => {
    // A teacher's folder holds past papers, and they are offered from the same
    // list, so this is the ordinary case rather than the exotic one.
    const paper = page(
      1,
      'Section I',
      '10 marks',
      'Attempt Questions 1–10',
      '1 Which material is most suitable for a lightweight bicycle frame?',
      'A. Cast iron',
      'B. Carbon fibre',
    )
    expect(() => readIbGuide([paper])).toThrow(NotASyllabusError)
    // All three wrong documents are named, because all three are offered in the
    // same list: a past paper, a NESA syllabus saved as a PDF, and the guide.
    expect(() => readIbGuide([paper])).toThrow(/Word download rather than the PDF one/)
    expect(() => readIbGuide([paper])).toThrow(/From a past paper tab/)
  })

  it('refuses a document with topic headings and no understandings under them', () => {
    const pages = page(
      5,
      'A. Making in theory',
      'A1.1 Hand tools',
      'Guiding question',
      'Why do hand tools matter to a maker?',
      HOURS_SL,
      'Linking questions',
    )
    expect(() => guide(pages)).toThrow(/no understandings/)
  })
})
