/**
 * The answer-key reader, on fictional pages.
 *
 * Positioned text and no PDF, as `guide.test.ts` and `objective.test.ts` are.
 * What the real markscheme does is checked in `objective.corpus.test.ts`, which
 * skips itself when the content folder is absent.
 */

import { describe, expect, it } from 'vitest'
import { readAnswerKey } from './answerkey'
import type { PageText } from './extract'
import { NotAGuideError } from './guide'
import { readMarkingGuide } from './guideformats'

function page(number: number, ...lines: string[]): PageText {
  return {
    number,
    width: 612,
    pieces: lines.map((str, i) => ({ x: 72, y: 700 - i * 28, width: str.length * 5, str })),
  }
}

/** The three-column shape the real markscheme prints, `1. D 11. B 21. B`. */
function grid(): PageText {
  const answers = 'DBBABABCBCBBDBBCCDDBBDDABDCCDB'.split('')
  const rows: string[] = []
  for (let row = 0; row < 10; row += 1) {
    rows.push(
      [0, 10, 20].map((offset) => `${row + offset + 1}. ${answers[row + offset]}`).join(' '),
    )
  }
  return page(1, 'Design Technology', 'Standard level', 'Paper 1', 'Markscheme', ...rows)
}

describe('reading a markscheme that is a grid of answers', () => {
  it('reads every answer out of three interleaved columns', () => {
    const guide = readAnswerKey([grid()])

    expect(Object.keys(guide.answerKey)).toHaveLength(30)
    expect(guide.answerKey[1]).toBe('D')
    expect(guide.answerKey[11]).toBe('B')
    expect(guide.answerKey[21]).toBe('B')
    expect(guide.answerKey[30]).toBe('B')
  })

  it('carries no criteria and no mapping, because the document has none', () => {
    const guide = readAnswerKey([grid()])
    expect(guide.entries).toEqual([])
    expect(guide.mapping).toEqual([])
    expect(guide.notes).toEqual([])
  })

  it('reads a one-column markscheme the same way', () => {
    const guide = readAnswerKey([
      page(1, ...Array.from({ length: 8 }, (_, i) => `${i + 1}. ${'ABCD'[i % 4]}`)),
    ])
    expect(Object.keys(guide.answerKey)).toHaveLength(8)
    expect(guide.answerKey[5]).toBe('A')
  })

  it('accepts a lower-case answer letter and reports it upper-cased', () => {
    const guide = readAnswerKey([
      page(1, ...Array.from({ length: 8 }, (_, i) => `${i + 1}. ${'abcd'[i % 4]}`)),
    ])
    expect(guide.answerKey[1]).toBe('A')
    expect(guide.answerKey[8]).toBe('D')
  })
})

describe('refusing what it does not recognise', () => {
  it('refuses a document with too few answers to be a markscheme', () => {
    expect(() => readAnswerKey([page(1, '1. A', '2. B', '3. C')])).toThrow(NotAGuideError)
  })

  it('refuses when the numbering is not one to however many there are', () => {
    // A stray `3. B` in somebody's prose cannot claim a document, because the
    // numbers have to run from one with nothing missing.
    expect(() =>
      readAnswerKey([page(1, '3. B', '7. A', '9. C', '14. D', '22. A', '31. B')]),
    ).toThrow(/not a markscheme/)
  })

  it('refuses when one question is given two different answers', () => {
    expect(() =>
      readAnswerKey([page(1, '1. A', '2. B', '3. C', '4. D', '5. A', '6. B'), page(2, '3. D')]),
    ).toThrow(NotAGuideError)
  })

  it('refuses a document with no answers at all', () => {
    expect(() => readAnswerKey([page(1, 'Design Technology', 'Markscheme')])).toThrow(
      NotAGuideError,
    )
  })
})

describe('choosing between the two guide readers', () => {
  it('claims a grid markscheme as an answer key', () => {
    const { format, guide } = readMarkingGuide([grid()])
    expect(format).toBe('answerkey')
    expect(Object.keys(guide.answerKey)).toHaveLength(30)
  })

  it('leaves a NESA guide to the NESA reader', () => {
    // NESA prints `1 D` with no full stop, under a `Question Answer` heading, so
    // the two readers cannot claim each other's documents.
    const { format, guide } = readMarkingGuide([
      page(
        1,
        'Section I',
        'Multiple-choice Answer Key',
        'Question        Answer',
        '   1                D',
        '   2                B',
      ),
    ])
    expect(format).toBe('nesa')
    expect(guide.answerKey[1]).toBe('D')
    expect(guide.answerKey[2]).toBe('B')
  })

  it('refuses a document that is neither, naming both', () => {
    expect(() => readMarkingGuide([page(1, 'A page of ordinary prose about design.')])).toThrow(
      /This document is neither/,
    )
  })
})
