/**
 * The two real scans, which are the only evidence there is for the rule.
 *
 * `textlayer.test.ts` is the committed half and builds a scanned page by hand: a
 * `PageText` with an empty `pieces`. That is an assumption about what pdf.js
 * gives back for a page holding one full-page image and nothing else, and this
 * suite is what stops it being only an assumption. Without it the synthetic
 * tests would keep passing against a shape no document ever takes.
 *
 * As everywhere else on this side, the documents cannot enter this repository:
 * they are a school's own examination papers. So this skips when they are absent
 * and `npm run test:corpus` fails instead, and each document gates itself.
 */

/// <reference types="node" />
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
  EC_2024_SCAN,
  EC_2025_SCAN,
  EC_2025_SCAN_MG,
  MATHS_2025_GUIDE,
  MATHS_2025_PAPER,
  MATHS_2026_PAPER,
  allDocuments,
  have,
} from '../testing/corpus'
import { NotAPaperError } from '../pastpapers/extract'
import { NotAGuideError } from '../pastpapers/guide'
import { MathematicsGuideError, readMarkingGuide } from '../pastpapers/guideformats'
import { MathematicsPaperError, readPastPaper } from '../pastpapers/paperformats'
import { PDF_OPTIONS, pagesFromDocument } from './pdftext'
import {
  MATHEMATICS_IN_GUIDE,
  MATHEMATICS_IN_PAPER,
  hasNoText,
  isSetAsMathematics,
} from './textlayer'

async function pagesOf(path: string) {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs')
  const doc = await pdfjs.getDocument({ data: new Uint8Array(readFileSync(path)), ...PDF_OPTIONS })
    .promise
  return pagesFromDocument(doc as never)
}

/** What each scan is, established by rendering it and looking (#89). */
const SCANS = [
  { path: EC_2025_SCAN, what: 'the 2025 paper, A4 and upside down', pages: 24 },
  { path: EC_2024_SCAN, what: 'the 2024 paper, A3 and two pages to a sheet', pages: 10 },
  // The guide half of the rule rested on papers until this arrived: the right
  // shape of document to refuse, and the wrong kind of file (#94).
  { path: EC_2025_SCAN_MG, what: "the 2025 paper's marking guide", pages: 10 },
]

describe('a scanned paper holds no text', () => {
  for (const scan of SCANS) {
    const there = have(scan.path)

    it.skipIf(!there)(
      `${scan.what} has ${scan.pages} pages and no text on any of them`,
      async () => {
        const pages = await pagesOf(scan.path)

        expect(pages).toHaveLength(scan.pages)
        // Every page, not merely the document as a whole: a single stray piece
        // anywhere would mean the copier had run text recognition after all, and
        // the rule would be resting on a document that no longer shows it.
        for (const page of pages) expect(page.pieces).toHaveLength(0)
        expect(hasNoText(pages)).toBe(true)
      },
    )

    it.skipIf(!there)(
      `${scan.what} is refused for holding no text, not for its shape`,
      async () => {
        const pages = await pagesOf(scan.path)

        expect(() => readPastPaper(pages)).toThrow(NotAPaperError)
        expect(() => readPastPaper(pages)).toThrow(/holds no text/)
        expect(() => readMarkingGuide(pages)).toThrow(NotAGuideError)
        expect(() => readMarkingGuide(pages)).toThrow(/holds no text/)
      },
    )
  }
})

/**
 * A paper set as mathematics (#198). Before this, every reader took both papers
 * and read them to the right number of questions and marks with nearly every
 * formula wrong, which is why the refusal comes before any reader.
 */
const MATHEMATICS = [
  { path: MATHS_2025_PAPER, what: 'the 2025 HSC Mathematics Advanced paper', paper: true },
  { path: MATHS_2026_PAPER, what: 'the 2026 HSC Mathematics Advanced paper', paper: true },
  { path: MATHS_2025_GUIDE, what: 'the 2025 marking guide', paper: false },
]

describe('a paper set as mathematics is refused before any reader', () => {
  for (const doc of MATHEMATICS) {
    it.skipIf(!have(doc.path))(`${doc.what} is refused, and told to go to an AI`, async () => {
      const pages = await pagesOf(doc.path)

      expect(isSetAsMathematics(pages)).toBe(true)
      if (doc.paper) {
        expect(() => readPastPaper(pages)).toThrow(MathematicsPaperError)
        expect(() => readPastPaper(pages)).toThrow(MATHEMATICS_IN_PAPER)
      } else {
        expect(() => readMarkingGuide(pages)).toThrow(MathematicsGuideError)
        expect(() => readMarkingGuide(pages)).toThrow(MATHEMATICS_IN_GUIDE)
      }
    })
  }

  // The case against, and the one that matters more: a refusal before any
  // reader can cost a document that reads. Every PDF any suite reads, which is
  // eleven years of D&T papers and guides, the Biology pair and the IB papers
  // and guide.
  const others = allDocuments().filter(
    (path) => path.endsWith('.pdf') && !MATHEMATICS.some((m) => m.path === path),
  )

  it.skipIf(!have(...others))(
    `none of the ${others.length} other PDFs is taken for mathematics`,
    async () => {
      // The fonts are known for all of them, so a pass is not merely every
      // document having no font name at all.
      for (const path of others) {
        const pages = await pagesOf(path)
        const pieces = pages.flatMap((page) => page.pieces)
        if (pieces.length > 0)
          expect(
            pieces.some((piece) => piece.font),
            path,
          ).toBe(true)
        expect(isSetAsMathematics(pages), path).toBe(false)
      }
    },
    120_000,
  )
})
