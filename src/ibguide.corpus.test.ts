/**
 * The guide reader against the real subject guide, and against the map.
 *
 * **This never runs in CI, by design**, for the reason the other corpus tests
 * give: the guide is licensed through the Programme Resource Centre and cannot
 * enter this repo, which is public. It lives in the teacher's content folder
 * outside the repo, so this looks for it and skips itself when it is absent.
 * `ibguide.test.ts` is the committed check and runs on synthetic pages.
 *
 * What is asserted is structure and never text — counts, ids, which reader
 * claimed the document. A count is a fact about a document rather than the
 * document's expression of itself, which is why these numbers are safe to commit
 * when the syllabus is not.
 *
 * The last test is the one that matters most. Klunk now reads this syllabus from
 * two unrelated documents, and **the two models must be identical**. That is a
 * far stronger check than either reader could give alone: the map is a third
 * party's transcription and the guide is the IB's own, so agreement to the
 * character means both transcribed the same syllabus and both readers read it.
 * A difference is a finding, and the guide is right — it is the source of truth,
 * which is the whole reason for #58.
 */

/// <reference types="node" />
import { existsSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { readSyllabusPdf, readSyllabusWorkbook } from './formats'
import { pagesFromDocument } from './pdftext'
import { summarise } from './syllabus'
import type { SyllabusCourse } from './types'
import { readWorkbook } from './xlsx'

const SOURCE = '../klunk-content/source/ib-dt'
const GUIDE = `${SOURCE}/design-technology-guide-2027.pdf`
const MAP = `${SOURCE}/ib-dt-syllabus-map-old-vs-new.xlsx`

const THEMES = ['A. Design in theory', 'B. Design in practice', 'C. Design in context']

const describeIfPresent = existsSync(GUIDE) ? describe : describe.skip

async function pages() {
  // The legacy build is the one that runs under Node, as in `extract.corpus`.
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs')
  const data = new Uint8Array(readFileSync(GUIDE))
  const doc = await pdfjs.getDocument({ data }).promise
  return pagesFromDocument(doc as never)
}

describeIfPresent('IB DP Design Technology subject guide', () => {
  const read = async () => readSyllabusPdf(await pages())

  it('is claimed by the guide reader', async () => {
    expect((await read()).format).toBe('guide')
  })

  it('splits into an SL course and an HL course', async () => {
    // The same numbers the syllabus map gives, counted off the guide's own
    // Overview table and its numbered understandings.
    expect(summarise((await read()).courses)).toEqual([
      { courseId: 'sl', courseName: 'Standard level', topics: 13, points: 79, outcomes: 0, groups: THEMES },
      { courseId: 'hl', courseName: 'Higher level', topics: 24, points: 161, outcomes: 0, groups: THEMES },
    ])
  })

  it('names topics with their number, level of organization and title', async () => {
    const first = (await read()).courses[0]!.topics[0]!

    expect(first.id).toBe('A1-1')
    expect(first.name).toBe('A1.1 People: Ergonomics')
    expect(first.text).toBe('A1.1 Ergonomics')
    expect(first.group).toBe('A. Design in theory')
  })

  it('carries no page furniture into a content point', async () => {
    // The running head and foot land inside any understanding that spans a page
    // break, so this is the check that a content point is the syllabus and not
    // the page it was printed on. It fails loudly rather than quietly, unlike
    // the counts, which were right while the content was wrong (#26, #43).
    for (const course of (await read()).courses) {
      for (const topic of course.topics) {
        for (const point of topic.points!) {
          expect(point.text, `${point.id}`).not.toMatch(/Design technology guide|Syllabus content/)
        }
      }
    }
  })

  it('merges an understanding that a page break reprinted, rather than truncating it', async () => {
    // B1.1's 1.1.2 is printed across a page break: the statement is reprinted at
    // the top of the next page and the paragraph under it continues
    // mid-sentence. Dropping the repeat by its number alone gives the right
    // count and a point that stops at "…to establish users'".
    const hl = (await read()).courses[1]!
    const ucd = hl.topics.find((t) => t.id === 'B1-1')!
    const split = ucd.points![1]!

    expect(split.id).toBe('B1-1.2')
    // Said as structure: the statement appears once, and the sentence the break
    // cut in half is whole. Neither is a quotation of the syllabus.
    expect(split.text.match(/UCD uses specific research methods/g)).toHaveLength(1)
    expect(split.text.trim()).toMatch(/\.$/)
  })

  it('agrees with the syllabus map on every topic', async () => {
    if (!existsSync(MAP)) return
    const map = await readMap()

    // Structure first, and exactly: same courses, same topics in the same
    // order, same ids, same names, same themes, same number of understandings
    // with the same ids. Two unrelated documents read by two unrelated readers
    // agreeing on all of that is what makes either of them trustworthy.
    expect(shapeOf((await read()).courses)).toEqual(shapeOf(map.courses))
  })

  it('differs from the syllabus map in three places, and the guide is right in all three', async () => {
    if (!existsSync(MAP)) return

    const guide = flatten((await read()).courses)
    const map = flatten((await readMap()).courses)

    // A full stop the map's transcriber dropped off the end of a cell, and
    // nothing else. The guide prints one; a reader comparing the two would
    // otherwise see two dozen differences and stop looking at any of them.
    const stop: string[] = []
    const real: string[] = []
    for (const [id, text] of guide) {
      const theirs = map.get(id)
      if (theirs === undefined || theirs === text) continue
      if (`${theirs}.` === text) stop.push(id)
      else real.push(id)
    }

    expect(stop).toHaveLength(23)

    // The three that are not punctuation, each checked against the guide by
    // hand. B3.4's 3.4.2 and C2.1's 2.1.1 are hyphenated words broken across a
    // line, which the map joined by deleting the hyphen: `multimeters` and
    // `decisionmaking`. C4.1's 4.1.5 is the one that matters — the map repeats
    // the paragraph belonging to 4.1.4 under it, so a teacher working from the
    // map has the wrong command term and the wrong content for that
    // understanding entirely. It is the case for reading the guide, in one cell.
    expect(real).toEqual(['B3-4.2', 'C2-1.1', 'C4-1.5'])
  })
})

async function readMap() {
  const bytes = readFileSync(MAP)
  return readSyllabusWorkbook(await readWorkbook(new Blob([new Uint8Array(bytes)])))
}

/** Everything about the model except the words, which is what can be compared. */
function shapeOf(courses: SyllabusCourse[]) {
  return courses.map((course) => ({
    id: course.id,
    name: course.name,
    topics: course.topics.map((topic) => ({
      id: topic.id,
      name: topic.name,
      text: topic.text,
      group: topic.group,
      points: topic.points!.map((point) => point.id),
    })),
  }))
}

/** Every point in the HL course, which is the whole syllabus, by id. */
function flatten(courses: SyllabusCourse[]): Map<string, string> {
  const out = new Map<string, string>()
  for (const topic of courses[1]!.topics) {
    for (const point of topic.points!) out.set(point.id, point.text)
  }
  return out
}
