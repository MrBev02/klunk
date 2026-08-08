/**
 * The objective reader against the real paper, which is the only check that
 * counts.
 *
 * **This never runs in CI, by design**, the same as `extract.corpus.test.ts`.
 * The document lives in the teacher's content folder outside this repo, so this
 * suite looks for it and skips itself when it is absent.
 *
 * The document is a **RevisionDojo practice paper**, not the IB's own, and this
 * suite is not evidence that Klunk extracts IB papers (#45, and `CLAUDE.md`).
 * What it is evidence of is that a paper of plainly-numbered multiple-choice
 * questions reads, which is what #64 was filed for: the NESA reader returned
 * zero questions and zero explanation for this document, and the panel then
 * said everything had been saved.
 *
 * What is asserted is *structure*, never text. Counts are facts about the shape
 * of a document, the same kind of thing a profile records.
 */

/// <reference types="node" />
import { existsSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { NotAPaperError, extractPaper } from './extract'
import { NotAGuideError, applyGuide, extractGuide } from './guide'
import { readMarkingGuide } from './guideformats'
import { readObjectivePaper } from './objective'
import { readPastPaper } from './paperformats'
import { pagesFromDocument } from './pdftext'

const PAPER =
  '../klunk-content/source/ib-dt/Design Technology SL Paper 1 (Set 1) (1).pdf'
const GUIDE =
  '../klunk-content/source/ib-dt/Design Technology SL Paper 1 (Set 1) - Markscheme (1).pdf'
const available = existsSync(PAPER) && existsSync(GUIDE)

async function open(file: string) {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs')
  const data = new Uint8Array(readFileSync(file))
  const doc = await pdfjs.getDocument({ data }).promise
  return pagesFromDocument(doc as never)
}

describe.skipIf(!available)('a numbered multiple-choice paper', () => {
  it('reads all thirty questions, each worth one mark', async () => {
    const paper = readObjectivePaper(await open(PAPER))

    expect(paper.questions).toHaveLength(30)
    expect(paper.questions.map((q) => q.number)).toEqual(
      paper.questions.map((_, i) => i + 1),
    )
    expect(paper.questions.every((q) => q.marks === 1)).toBe(true)
    expect(paper.questions.reduce((sum, q) => sum + q.marks, 0)).toBe(30)
  })

  it('reads four options on every question, labelled A to D', async () => {
    const paper = readObjectivePaper(await open(PAPER))
    for (const q of paper.questions) {
      expect(q.options?.map((o) => o.label), `Q${q.number}`).toEqual(['A', 'B', 'C', 'D'])
      expect(q.options?.every((o) => o.text.trim() !== ''), `Q${q.number}`).toBe(true)
    }
  })

  it('reads a stem for every question and drops the running foot', async () => {
    const paper = readObjectivePaper(await open(PAPER))
    for (const q of paper.questions) {
      expect(q.text, `Q${q.number}`).not.toBe('')
      expect(q.notes, `Q${q.number}`).toEqual([])
    }

    // The download stamp and the site name are printed on every page, and the
    // foot lands after the last option, so without the furniture rule they weld
    // onto whichever option ends the page.
    const everything = paper.questions
      .flatMap((q) => [q.text, ...(q.options ?? []).map((o) => o.text)])
      .join(' ')
    expect(everything).not.toMatch(/revisiondojo|Downloaded by/i)
  })

  it('agrees with the total the paper states, so says nothing about it', async () => {
    // The cover prints "The maximum mark for the examination paper is [30
    // marks]", which is an independent statement of the count.
    expect(readObjectivePaper(await open(PAPER)).notes).toEqual([])
  })

  it('is refused by the NESA reader, which is why a second one exists', async () => {
    await expect(async () => extractPaper(await open(PAPER))).rejects.toThrow(NotAPaperError)
  })

  it('is claimed by the objective reader when the two are tried in order', async () => {
    const { format, paper } = readPastPaper(await open(PAPER))
    expect(format).toBe('objective')
    expect(paper.questions).toHaveLength(30)
  })
})

describe.skipIf(!available)('its markscheme', () => {
  it('is refused by the NESA guide reader, which is why a second one exists', async () => {
    await expect(async () => extractGuide(await open(GUIDE))).rejects.toThrow(NotAGuideError)
  })

  it('reads all thirty answers, one per question', async () => {
    const { format, guide } = readMarkingGuide(await open(GUIDE))
    expect(format).toBe('answerkey')
    expect(Object.keys(guide.answerKey)).toHaveLength(30)
    expect(Object.values(guide.answerKey).every((a) => 'ABCD'.includes(a))).toBe(true)
  })

  it('answers every question of the paper when the two are put together', async () => {
    // The outcome the whole of #66 is about. Without it every question came
    // through answered A, because `adopt.ts` has to put something in
    // `correctAnswer` and the guide it was handed was silently empty.
    const { paper } = readPastPaper(await open(PAPER))
    const { guide } = readMarkingGuide(await open(GUIDE))
    const marked = applyGuide(paper, guide)

    expect(marked.questions).toHaveLength(30)
    for (const q of marked.questions) {
      expect(q.answer, `Q${q.number}`).toBeDefined()
      expect(q.options?.some((o) => o.label === q.answer), `Q${q.number}`).toBe(true)
      expect(q.notes, `Q${q.number}`).toEqual([])
    }

    // Not all the same letter, which is what the silently empty guide looked like.
    expect(new Set(marked.questions.map((q) => q.answer)).size).toBeGreaterThan(1)
  })
})
