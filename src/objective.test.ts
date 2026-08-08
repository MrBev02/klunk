/**
 * The objective-paper reader, on fictional pages.
 *
 * Positioned text and no PDF, the same as `extract.test.ts`, so every rule is
 * exercised without a document. What the real paper does is checked in
 * `objective.corpus.test.ts`, which skips itself when the content folder is
 * absent.
 */

import { describe, expect, it } from 'vitest'
import { NotAPaperError, type PageText } from './extract'
import { readObjectivePaper } from './objective'

/** A page of lines, top to bottom, at whole-line spacing. */
function page(number: number, ...lines: string[]): PageText {
  return {
    number,
    width: 596,
    pieces: lines.map((str, i) => ({ x: 72, y: 700 - i * 16, width: str.length * 5, str })),
  }
}

/** One well-formed question, numbered `n`. */
function question(n: number): string[] {
  return [
    `${n}. Which term describes the property being asked about in question ${n}?`,
    'A. The first option',
    'B. The second option',
    'C. The third option',
    'D. The fourth option',
  ]
}

/** A paper of `count` well-formed questions, one per page from page 1. */
function paperOf(count: number): PageText[] {
  return Array.from({ length: count }, (_, i) => page(i + 1, ...question(i + 1)))
}

describe('reading a numbered multiple-choice paper', () => {
  it('reads every question, its stem and its four options', () => {
    const paper = readObjectivePaper(paperOf(6))

    expect(paper.questions).toHaveLength(6)
    const first = paper.questions[0]!
    expect(first.number).toBe(1)
    expect(first.text).toBe('Which term describes the property being asked about in question 1?')
    expect(first.options?.map((o) => o.label)).toEqual(['A', 'B', 'C', 'D'])
    expect(first.options?.[2]?.text).toBe('The third option')
  })

  it('takes every question as one mark and as multiple choice', () => {
    const paper = readObjectivePaper(paperOf(6))
    expect(paper.questions.every((q) => q.marks === 1)).toBe(true)
    expect(paper.questions.every((q) => q.questionType === 'multiple_choice')).toBe(true)
    expect(paper.questions.every((q) => q.section === 'I')).toBe(true)
  })

  it('joins a stem that wraps onto the next line', () => {
    const paper = readObjectivePaper([
      page(1, ...question(1)),
      page(
        2,
        '2. A library self-service kiosk has been designed so that the majority of',
        'users can comfortably reach the touchscreen.',
        'What percentile should be used?',
        'A. 99th',
        'B. 95th',
        'C. 50th',
        'D. 5th',
      ),
      ...paperOf(6).slice(2),
    ])

    expect(paper.questions[1]?.text).toBe(
      'A library self-service kiosk has been designed so that the majority of users can comfortably reach the touchscreen. What percentile should be used?',
    )
  })

  it('joins an option that wraps, rather than adding it to the stem', () => {
    const paper = readObjectivePaper([
      page(
        1,
        '1. Which statement best describes compressive strength?',
        'A. The ability of a material to withstand',
        'squeezing forces',
        'B. Second',
        'C. Third',
        'D. Fourth',
      ),
      ...paperOf(6).slice(1),
    ])

    const first = paper.questions[0]!
    expect(first.text).toBe('Which statement best describes compressive strength?')
    expect(first.options?.[0]?.text).toBe('The ability of a material to withstand squeezing forces')
  })

  it('accepts `1)` and `A)` as well as full stops', () => {
    const paper = readObjectivePaper([
      page(1, '1) First question?', 'A) One', 'B) Two', 'C) Three', 'D) Four'),
      ...paperOf(6).slice(1),
    ])
    expect(paper.questions[0]?.text).toBe('First question?')
    expect(paper.questions[0]?.options).toHaveLength(4)
  })

  it('does not let the numbering jump, because a wrapped line can start with a digit', () => {
    const paper = readObjectivePaper([
      page(
        1,
        '1. What load does it carry?',
        '2000 N is applied to the joint.',
        'A. One',
        'B. Two',
        'C. Three',
        'D. Four',
      ),
      ...paperOf(6).slice(1),
    ])

    // `2000 N…` does not open question 2: only the next number in sequence does.
    expect(paper.questions).toHaveLength(6)
    expect(paper.questions[0]?.text).toBe('What load does it carry? 2000 N is applied to the joint.')
  })
})

describe('the running head and foot', () => {
  it('drops a line printed on most pages, wherever it falls', () => {
    const pages = paperOf(6).map((p) => ({
      ...p,
      pieces: [
        ...p.pieces,
        { x: 72, y: 60, width: 80, str: 'revisiondojo.com' },
        { x: 72, y: 44, width: 300, str: 'Downloaded by someone@example.edu.au' },
      ],
    }))
    const paper = readObjectivePaper(pages)

    // The foot falls after option D, so without this rule it welds onto it.
    expect(paper.questions[0]?.options?.[3]?.text).toBe('The fourth option')
    const everything = paper.questions.flatMap((q) => [q.text, ...(q.options ?? []).map((o) => o.text)])
    expect(everything.join(' ')).not.toMatch(/revisiondojo|Downloaded by/)
  })

  it('keeps an option that repeats on every page, because it is an option', () => {
    // A paper whose questions all offer the same four answers prints them on
    // every page. Dropping them as furniture would strip the options off every
    // question and leave the count untouched, which is the count-right
    // content-wrong fault in a new reader.
    const pages = Array.from({ length: 6 }, (_, i) =>
      page(
        i + 1,
        `${i + 1}. What happens to the value in scenario ${i + 1}?`,
        'A. Increase',
        'B. Decrease',
        'C. No change',
        'D. Cannot be determined',
        'somepaper.com',
      ),
    )
    const paper = readObjectivePaper(pages)

    expect(paper.questions).toHaveLength(6)
    expect(paper.questions.every((q) => q.options?.length === 4)).toBe(true)
    expect(paper.questions[0]?.options?.map((o) => o.text)).toEqual([
      'Increase',
      'Decrease',
      'No change',
      'Cannot be determined',
    ])
    // The footer still goes, on the same pages, by the same rule.
    expect(paper.questions.flatMap((q) => (q.options ?? []).map((o) => o.text)).join(' ')).not.toMatch(
      /somepaper/,
    )
  })

  it('keeps a line that repeats on only a few of many pages', () => {
    const pages = paperOf(9)
    const withText = pages.map((p, i) =>
      i < 3
        ? { ...p, pieces: [...p.pieces, { x: 72, y: 60, width: 90, str: 'Shared wording' }] }
        : p,
    )
    const paper = readObjectivePaper(withText)
    const everything = paper.questions.flatMap((q) => (q.options ?? []).map((o) => o.text))
    expect(everything.join(' ')).toMatch(/Shared wording/)
  })

  it('drops nothing at all when there are too few pages to tell', () => {
    // Two pages, so "on most of them" means "on both", which is as likely to be
    // a coincidence as a footer.
    const paper = readObjectivePaper([
      page(1, ...question(1), ...question(2), ...question(3), 'Repeated'),
      page(2, ...question(4), ...question(5), ...question(6), 'Repeated'),
    ])
    const everything = paper.questions.flatMap((q) => (q.options ?? []).map((o) => o.text))
    expect(everything.join(' ')).toMatch(/Repeated/)
  })
})

describe('refusing what it does not recognise', () => {
  it('refuses a document with too few questions to be a paper', () => {
    expect(() => readObjectivePaper(paperOf(4))).toThrow(NotAPaperError)
  })

  it('refuses a numbered list that has no options under it', () => {
    expect(() =>
      readObjectivePaper([
        page(
          1,
          '1. Materials',
          '2. Structures',
          '3. Ergonomics',
          '4. Production',
          '5. Sustainability',
          '6. Innovation',
        ),
      ]),
    ).toThrow(NotAPaperError)
  })

  it('refuses when only a minority of the questions have four options', () => {
    const pages = [
      ...paperOf(2),
      ...Array.from({ length: 4 }, (_, i) => page(i + 3, `${i + 3}. A question with no options.`)),
    ]
    expect(() => readObjectivePaper(pages)).toThrow(/not a multiple-choice paper/)
  })

  it('refuses a document whose numbering does not start at 1', () => {
    const pages = Array.from({ length: 6 }, (_, i) => page(i + 1, ...question(i + 4)))
    expect(() => readObjectivePaper(pages)).toThrow(NotAPaperError)
  })

  it('reads the paper but reports a question that has three options', () => {
    const pages = [
      page(1, '1. Which one?', 'A. One', 'B. Two', 'C. Three'),
      ...paperOf(6).slice(1),
    ]
    const paper = readObjectivePaper(pages)

    // Reported on the question, not fatal to the document: a real paper prints
    // the odd oddity and refusing would throw away the other five.
    expect(paper.questions[0]?.notes.join(' ')).toMatch(/Read 3 options rather than four/)
    expect(paper.questions).toHaveLength(6)
  })
})

describe('the stated total', () => {
  it('says so when the total disagrees with how many were read', () => {
    const pages = paperOf(6)
    pages[0] = page(
      1,
      'The maximum mark for the examination paper is [30 marks].',
      ...question(1),
    )
    const paper = readObjectivePaper(pages)
    expect(paper.notes.join(' ')).toMatch(/says it is worth 30 marks and Klunk read 6 questions/)
  })

  it('says nothing when the total agrees', () => {
    const pages = paperOf(6)
    pages[0] = page(1, 'The maximum mark for the examination paper is [6 marks].', ...question(1))
    expect(readObjectivePaper(pages).notes).toEqual([])
  })

  it('says nothing when the paper states no total', () => {
    expect(readObjectivePaper(paperOf(6)).notes).toEqual([])
  })
})
