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
import { applyGuide, extractGuide } from './guide'
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

async function open(file: string) {
  // The legacy build is the one that runs under Node. The browser uses the
  // ordinary one; `pagesFromDocument` is what both share, so this exercises the
  // conversion the app actually performs.
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs')
  const data = new Uint8Array(readFileSync(`${CORPUS}/${file}`))
  const doc = await pdfjs.getDocument({ data }).promise
  return pagesFromDocument(doc as never)
}

async function read(year: number) {
  return extractPaper(await open(`dt-${year}-paper.pdf`))
}

async function readGuide(year: number) {
  return extractGuide(await open(`dt-${year}-mg.pdf`))
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

    it(`${year}: no question carries the paper's furniture in its text`, async () => {
      // The structural checks above all passed while Question 11 read as
      // "…in this…area. Of…". Marks added up, parts were present, nothing looked
      // wrong — because none of it looks at what the words are. The paper prints
      // "Do NOT write in this area." sideways up the margin, one word per ruled
      // line, so those words landed on the same rows as the rules beside them.
      const paper = await read(year)
      const texts = paper.questions.flatMap((q) => [
        q.text,
        ...(q.parts ?? []).map((p) => p.text),
        ...(q.options ?? []).map((o) => o.text),
      ])
      for (const text of texts) {
        expect(text, 'a ruled answer line was read as question text').not.toMatch(/[.…_]{4,}/)
        expect(text, 'the sideways margin notice was read as question text').not.toMatch(
          /Do NOT write|Office Use Only/i,
        )
        expect(text, 'a copyright notice was read as question text').not.toMatch(/©/)
        expect(text, 'the answer booklet front matter was read as question text').not.toMatch(
          /Answer Booklet|Centre Number|Student Number/i,
        )
        expect(text, 'a page number was read as question text').not.toMatch(/–\s*\d+\s*–/)
      }
    })

    it(`${year}: the marking guide gives an answer key, criteria and outcomes`, async () => {
      const guide = await readGuide(year)

      // Ten objective questions in every year, so ten answers, each a real label.
      expect(Object.keys(guide.answerKey)).toHaveLength(10)
      for (let n = 1; n <= 10; n += 1) {
        expect(guide.answerKey[n], `no answer for Q${n}`).toMatch(/^[A-D]$/)
      }

      expect(guide.year).toBe(year)
      expect(guide.entries.length).toBeGreaterThan(0)

      for (const entry of guide.entries) {
        const where = entry.part ? `Q${entry.number}(${entry.part})` : `Q${entry.number}`
        expect(entry.criteria.length, `${where} has no criteria`).toBeGreaterThan(0)
        expect(entry.criteria.every((c) => c.description !== '')).toBe(true)
        // A criterion worth nothing means a mark was missed, not that NESA wrote one.
        expect(entry.criteria.every((c) => c.marks > 0), `${where} has a zero criterion`).toBe(true)
      }

      // The mapping grid covers every question in the paper, the ten objective
      // ones included, so it is a second independent reading of the whole thing.
      for (const row of guide.mapping) {
        const where = row.part ? `Q${row.number}(${row.part})` : `Q${row.number}`
        expect(row.outcomes.length, `${where} has no outcomes`).toBeGreaterThan(0)
        expect(
          row.outcomes.every((o) => /^[A-Z]\d+\.\d+$/.test(o)),
          `${where}: ${row.outcomes.join(', ')}`,
        ).toBe(true)
      }
      expect(guide.notes).toEqual([])

      // 2016 is the one year that leaves a cell of the grid blank — its Section
      // III row gives no marks — so it is the one year the grid is not a
      // complete second reading of the paper.
      const total = guide.mapping.reduce((sum, m) => sum + (m.marks ?? 0), 0)
      expect(total).toBe(year === 2016 ? 25 : 40)

      // The extended response is banded rather than marked criterion by
      // criterion, and it is always the last entry. Banding is *not* unique to
      // it: from 2018 a Section II question carries a `2–3` band too, so
      // "only Section III is banded" is not a rule and is not tested as one.
      const last = guide.entries[guide.entries.length - 1]!
      expect(last.criteria.every((c) => c.marksTo !== undefined), `${year} Q${last.number}`).toBe(true)
      expect(Math.max(...last.criteria.map((c) => c.marksTo ?? 0))).toBe(15)
    })

    it(`${year}: the guide goes back onto the paper without a mismatch`, async () => {
      const marked = applyGuide(await read(year), await readGuide(year))

      expect(marked.notes, `${year} paper-level notes`).toEqual([])

      for (const q of marked.questions) {
        if (q.section === 'I') {
          expect(q.answer, `Q${q.number} has no answer`).toMatch(/^[A-D]$/)
          expect(q.options?.some((o) => o.label === q.answer)).toBe(true)
          continue
        }
        expect(q.outcomes?.length, `Q${q.number} has no outcomes`).toBeGreaterThan(0)
        // Criteria live on the question, or on each of its parts, never nowhere.
        const marks = q.parts
          ? q.parts.every((p) => (p.criteria?.length ?? 0) > 0)
          : (q.criteria?.length ?? 0) > 0
        expect(marks, `Q${q.number} has no criteria`).toBe(true)
        expect(q.notes.filter((n) => /marking guide|answer key/i.test(n))).toEqual([])
      }
    })
  }
})
