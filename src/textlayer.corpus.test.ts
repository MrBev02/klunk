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
import { EC_2024_SCAN, EC_2025_SCAN, have } from './corpus'
import { NotAPaperError } from './extract'
import { NotAGuideError } from './guide'
import { readMarkingGuide } from './guideformats'
import { readPastPaper } from './paperformats'
import { pagesFromDocument } from './pdftext'
import { hasNoText } from './textlayer'

async function pagesOf(path: string) {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs')
  const doc = await pdfjs.getDocument({ data: new Uint8Array(readFileSync(path)) }).promise
  return pagesFromDocument(doc as never)
}

/** What each scan is, established by rendering it and looking (#89). */
const SCANS = [
  { path: EC_2025_SCAN, what: 'the 2025 paper, A4 and upside down', pages: 24 },
  { path: EC_2024_SCAN, what: 'the 2024 paper, A3 and two pages to a sheet', pages: 10 },
]

describe('a scanned paper holds no text', () => {
  for (const scan of SCANS) {
    const there = have(scan.path)

    it.skipIf(!there)(`${scan.what} has ${scan.pages} pages and no text on any of them`, async () => {
      const pages = await pagesOf(scan.path)

      expect(pages).toHaveLength(scan.pages)
      // Every page, not merely the document as a whole: a single stray piece
      // anywhere would mean the copier had run text recognition after all, and
      // the rule would be resting on a document that no longer shows it.
      for (const page of pages) expect(page.pieces).toHaveLength(0)
      expect(hasNoText(pages)).toBe(true)
    })

    it.skipIf(!there)(`${scan.what} is refused for holding no text, not for its shape`, async () => {
      const pages = await pagesOf(scan.path)

      expect(() => readPastPaper(pages)).toThrow(NotAPaperError)
      expect(() => readPastPaper(pages)).toThrow(/holds no text/)
      expect(() => readMarkingGuide(pages)).toThrow(NotAGuideError)
      expect(() => readMarkingGuide(pages)).toThrow(/holds no text/)
    })
  }
})
