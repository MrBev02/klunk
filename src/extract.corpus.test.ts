/**
 * The extractor against the real papers, which is the only check that counts.
 *
 * **This never runs in CI, by design.** The corpus is eleven years of NESA past
 * papers and it cannot enter this repo — the repo is public and the papers are
 * NESA's. They live in the teacher's content folder outside it, so this suite
 * looks for them and skips itself when they are absent. `extract.test.ts` is the
 * committed check and runs on fictional fixtures.
 *
 * What is asserted here is *structure*, never text: how many questions a year
 * has, what they are worth, which section they fall in. A count is a fact about
 * a public examination, the same kind of thing a profile records, so the numbers
 * below are safe to commit even though the papers are not.
 *
 * The expected values were read off the papers by hand. Where the extractor and
 * the table disagree, the paper is right.
 */

// The only file in `src` that is a Node program rather than a browser one, so
// the Node types are pulled in here rather than left on in `tsconfig.json` for
// everything. The app must not be able to reach for a filesystem by accident.
/// <reference types="node" />
import { existsSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { extractPaper } from './extract'
import { pagesFromDocument } from './pdftext'

const CORPUS = '../klunk-content/source/nsw-hsc-dt/papers'
const available = existsSync(`${CORPUS}/dt-2015-paper.pdf`)

/**
 * What each year's paper holds.
 *
 * Section I is ten one-mark objective questions in every year, so only Sections
 * II and III are listed. `parts` is how many of that section's questions are
 * split into (a)/(b)/(c) — the number that varies most and the one that exercises
 * the margin-mark rule.
 */
const EXPECTED: Record<number, { sectionII: number[]; sectionIII: number[] }> = {
  2015: { sectionII: [4, 5, 6], sectionIII: [15] },
  // Not ascending. 2016 and 2021 were first recorded as though they were, and
  // 2020 as 7 and 8; all three were corrected against the papers themselves.
  2016: { sectionII: [4, 6, 5], sectionIII: [15] },
  2017: { sectionII: [2, 3, 4, 6], sectionIII: [15] },
  2018: { sectionII: [5, 4, 6], sectionIII: [15] },
  2019: { sectionII: [5, 4, 6], sectionIII: [15] },
  2020: { sectionII: [9, 6], sectionIII: [15] },
  2021: { sectionII: [5, 4, 6], sectionIII: [15] },
  2022: { sectionII: [2, 3, 4, 6], sectionIII: [15] },
  2023: { sectionII: [2, 3, 4, 6], sectionIII: [15] },
  2024: { sectionII: [2, 3, 4, 6], sectionIII: [15] },
  2025: { sectionII: [2, 3, 4, 6], sectionIII: [15] },
}

async function read(year: number) {
  // The legacy build is the one that runs under Node. The browser uses the
  // ordinary one; `pagesFromDocument` is what both share, so this exercises the
  // conversion the app actually performs.
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs')
  const data = new Uint8Array(readFileSync(`${CORPUS}/dt-${year}-paper.pdf`))
  const doc = await pdfjs.getDocument({ data }).promise
  return extractPaper(await pagesFromDocument(doc as never))
}

describe.skipIf(!available)('the 2015-2025 corpus', () => {
  for (const year of Object.keys(EXPECTED).map(Number)) {
    const expected = EXPECTED[year]!

    it(`${year}: reads the whole paper and totals 40 marks`, async () => {
      const paper = await read(year)

      const one = paper.questions.filter((q) => q.section === 'I')
      const two = paper.questions.filter((q) => q.section === 'II')
      const three = paper.questions.filter((q) => q.section === 'III')

      // The invariant, true of every paper from 2015 to 2025.
      expect(one).toHaveLength(10)
      expect(one.every((q) => q.marks === 1)).toBe(true)
      expect(one.every((q) => q.options?.length === 4)).toBe(true)
      expect(three).toHaveLength(1)

      expect(two.map((q) => q.marks)).toEqual(expected.sectionII)
      expect(three.map((q) => q.marks)).toEqual(expected.sectionIII)

      const total = paper.questions.reduce((sum, q) => sum + q.marks, 0)
      expect(total).toBe(40)

      // Numbering must be unbroken: 1..10 objective, then Section II and III.
      expect(paper.questions.map((q) => q.number)).toEqual(
        paper.questions.map((_, i) => i + 1),
      )
    })

    it(`${year}: every question was read and every part adds up`, async () => {
      const paper = await read(year)
      for (const q of paper.questions) {
        // Not "has text": 2016, 2018 and 2019 each print a Section II question
        // whose heading is followed straight by `(a)`, with no stem of its own.
        // That is the paper, so what must be true is that something was read.
        expect(q.text !== '' || (q.parts?.length ?? 0) > 0, `Q${q.number} read as empty`).toBe(true)
        // A question that cannot be saved as it stands has to say so, because the
        // schema requires text and the teacher supplies it in the review grid.
        if (q.text === '') {
          expect(q.notes.join(' '), `Q${q.number} is stemless in silence`).toMatch(/must have text/)
        }
        if (q.parts) {
          const sum = q.parts.reduce((s, p) => s + p.marks, 0)
          expect(sum, `Q${q.number} parts sum`).toBe(q.marks)
          expect(q.parts.every((p) => p.text !== '')).toBe(true)
        }
      }
    })
  }
})
