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
import type { PageText } from './page'
import { NotAPaperError } from '../pastpapers/extract'
import { NotAGuideError } from '../pastpapers/guide'
import { MathematicsGuideError, readMarkingGuide } from '../pastpapers/guideformats'
import { MathematicsPaperError, readPastPaper } from '../pastpapers/paperformats'
import {
  hasNoText,
  isSetAsMathematics,
  MATHEMATICS_IN_GUIDE,
  MATHEMATICS_IN_PAPER,
  NO_TEXT_IN_GUIDE,
  NO_TEXT_IN_PAPER,
} from './textlayer'

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
    expect(() => readPastPaper(scan)).not.toThrow(MathematicsPaperError)
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
    const paper = readPastPaper(
      Array.from({ length: 6 }, (_, i) => page(i + 1, ...question(i + 1))),
    )
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

/**
 * A paper set as mathematics (#198). The real papers cannot come into this
 * repository; what they establish is that their formulas are set in fonts that
 * exist only for mathematics, and that is what a piece's `font` says here.
 */
describe('refusing a paper set as mathematics', () => {
  /** Six objective questions, every line set in `font`. */
  function paperIn(font: string | undefined): PageText[] {
    return Array.from({ length: 6 }, (_, i) => {
      const p = page(i + 1, ...question(i + 1))
      return { ...p, pieces: p.pieces.map((piece) => ({ ...piece, ...(font ? { font } : {}) })) }
    })
  }

  it('refuses a paper whose formulas are set in a mathematics font, before any reader', () => {
    // The same six questions read as an objective paper in Times. Only the
    // font differs, which is the point: the reader would have taken it.
    expect(readPastPaper(paperIn('Times-Roman')).paper.questions).toHaveLength(6)
    const maths = paperIn('SymbolGreekII-Italic')
    expect(isSetAsMathematics(maths)).toBe(true)
    // Still a refusal to anything catching one, and its own kind, so the
    // manifest does not file a mathematics paper as "Not a past paper".
    expect(() => readPastPaper(maths)).toThrow(NotAPaperError)
    expect(() => readPastPaper(maths)).toThrow(MathematicsPaperError)
    expect(() => readMarkingGuide(maths)).toThrow(MathematicsGuideError)
    expect(() => readPastPaper(maths)).toThrow(MATHEMATICS_IN_PAPER)
    expect(() => readMarkingGuide(maths)).toThrow(MATHEMATICS_IN_GUIDE)
  })

  it('knows the fonts of MathType, TeX and Word equations, not only the ones NESA used', () => {
    for (const font of ['EuclidSymbol', 'MTExtra', 'CMMI10', 'CambriaMath', 'STIXTwoMath']) {
      expect(isSetAsMathematics(paperIn(font)), font).toBe(true)
    }
  })

  it('does not refuse for plain Symbol, which Word sets its bullet points in', () => {
    expect(isSetAsMathematics(paperIn('Symbol'))).toBe(false)
    expect(isSetAsMathematics(paperIn('AppleSymbols'))).toBe(false)
  })

  it('does not refuse for a single Greek letter in a science paper', () => {
    const one = paperIn('Times-Roman')
    one[0]!.pieces[0] = { ...one[0]!.pieces[0]!, font: 'SymbolGreekII-Italic' }
    expect(isSetAsMathematics(one)).toBe(false)
  })

  it('says nothing about a document opened without font names', () => {
    expect(isSetAsMathematics(paperIn(undefined))).toBe(false)
  })
})
