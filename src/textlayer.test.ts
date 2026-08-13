/**
 * A document with nothing in it to read, and the refusal it earns.
 *
 * The real evidence is two scans of Year 11 Enterprise Computing exams, straight
 * off a school copier, which carry no text on any of their 34 pages (#89). They
 * cannot come into this repository, and they do not need to: what they establish
 * is that a scanned page arrives with an empty `pieces`, and a page with an empty
 * `pieces` is what is written here.
 *
 * The case worth guarding is the second one. A scan must change what the refusal
 * *says* and must never change what a reader *claims*, or a document somebody has
 * run text recognition over would be turned away for having been scanned.
 */

import { describe, expect, it } from 'vitest'
import { NotAPaperError, type PageText } from './extract'
import { NotAGuideError } from './guide'
import { readMarkingGuide } from './guideformats'
import { readPastPaper } from './paperformats'
import { hasNoText, NO_TEXT_IN_GUIDE, NO_TEXT_IN_PAPER } from './textlayer'

/** A page holding a full-page image and no text, which is what a scan gives. */
function scanned(number: number): PageText {
  return { number, width: 596, pieces: [] }
}

/** A page of lines, top to bottom, at whole-line spacing. */
function page(number: number, ...lines: string[]): PageText {
  return {
    number,
    width: 596,
    pieces: lines.map((str, i) => ({ x: 72, y: 700 - i * 16, width: str.length * 5, str })),
  }
}

/** One well-formed objective question, numbered `n`. */
function question(n: number): string[] {
  return [
    `${n}. Which term describes the property being asked about in question ${n}?`,
    'A. The first option',
    'B. The second option',
    'C. The third option',
    'D. The fourth option',
  ]
}

describe('telling a picture of a document from a document', () => {
  it('says a document whose every page is a picture holds no text', () => {
    expect(hasNoText([scanned(1), scanned(2), scanned(3)])).toBe(true)
  })

  it('says nothing of the sort about a document with text anywhere in it', () => {
    expect(hasNoText([scanned(1), page(2, 'Question 1'), scanned(3)])).toBe(false)
  })

  it('leaves a file with no pages at all to the refusal it already had', () => {
    // Broken rather than scanned, and "use the original file" is no help.
    expect(hasNoText([])).toBe(false)
  })
})

describe('refusing a scanned paper', () => {
  const scan = [scanned(1), scanned(2), scanned(3)]

  it('says there is no text, rather than listing the shapes it reads', () => {
    expect(() => readPastPaper(scan)).toThrow(NotAPaperError)
    expect(() => readPastPaper(scan)).toThrow(NO_TEXT_IN_PAPER)
  })

  it('does not mention Section I, which is the one thing that is not wrong', () => {
    try {
      readPastPaper(scan)
      expect.unreachable('a scan must be refused')
    } catch (err) {
      expect((err as Error).message).not.toContain('Section I')
    }
  })

  it('still lists the shapes for a document that has text and is neither', () => {
    const prose = [page(1, 'A letter to the parents of Year 11, about the swimming carnival.')]
    expect(() => readPastPaper(prose)).toThrow(/Section I, II and III/)
  })

  it('never takes a paper away from a reader that claims it', () => {
    // The text-recognised scan: it reads, so nothing here may fire.
    const paper = readPastPaper(Array.from({ length: 6 }, (_, i) => page(i + 1, ...question(i + 1))))
    expect(paper.format).toBe('objective')
    expect(paper.paper.questions).toHaveLength(6)
  })
})

describe('refusing a scanned marking guide', () => {
  const scan = [scanned(1), scanned(2)]

  it('says there is no text, rather than listing the shapes it reads', () => {
    expect(() => readMarkingGuide(scan)).toThrow(NotAGuideError)
    expect(() => readMarkingGuide(scan)).toThrow(NO_TEXT_IN_GUIDE)
  })

  it('still lists the shapes for a document that has text and is neither', () => {
    const prose = [page(1, 'A letter to the parents of Year 11, about the swimming carnival.')]
    expect(() => readMarkingGuide(prose)).toThrow(/markscheme/)
  })
})
