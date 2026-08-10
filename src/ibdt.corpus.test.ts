/**
 * The IB reader against the real syllabus map.
 *
 * **This never runs in CI, by design**, for the reason the other two corpus
 * tests give: the document is licensed and cannot enter this repo, which is
 * public. It lives in the teacher's content folder outside the repo, so this
 * looks for it and skips itself when it is absent. `ibdt.test.ts` is the
 * committed check and runs on synthetic rows.
 *
 * What is asserted is structure and never text — how many topics and points,
 * what the themes are called, which reader claimed the document, and the shape
 * of an id. A count is a fact about a document rather than the document's
 * expression of itself, which is why these numbers are safe to commit when the
 * syllabus is not.
 *
 * The numbers were established here rather than inherited: the topics were
 * counted off the map's own summary sheet, which lists all twenty-four with
 * their themes, and the understandings by counting the rows under each. They go
 * into `CLAUDE.md` as the regression check.
 */

/// <reference types="node" />
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { IB_MAP, have } from './corpus'
import { readSyllabusWorkbook } from './formats'
import { summarise } from './syllabus'
import { readWorkbook } from './xlsx'

const MAP = IB_MAP

const THEMES = ['A. Design in theory', 'B. Design in practice', 'C. Design in context']

const describeIfPresent = have(MAP) ? describe : describe.skip

describeIfPresent('IB DP Design Technology syllabus map', () => {
  const read = async () => {
    const bytes = readFileSync(MAP)
    return readSyllabusWorkbook(await readWorkbook(new Blob([new Uint8Array(bytes)])))
  }

  it('is claimed by the workbook reader', async () => {
    expect((await read()).format).toBe('workbook')
  })

  it('splits into an SL course and an HL course', async () => {
    const summary = summarise((await read()).courses)

    // Eleven of the twenty-four topics are HL only, so SL is the other
    // thirteen. HL is not "the extra eleven": it is the whole syllabus, which
    // is why the same topic id appears in both courses.
    expect(summary).toEqual([
      { courseId: 'sl', courseName: 'Standard level', topics: 13, points: 79, outcomes: 0, groups: THEMES },
      { courseId: 'hl', courseName: 'Higher level', topics: 24, points: 161, outcomes: 0, groups: THEMES },
    ])
  })

  it('carries every SL topic into HL unchanged', async () => {
    const { courses } = await read()
    const [sl, hl] = courses
    const inHl = new Map(hl!.topics.map((t) => [t.id, t]))

    for (const topic of sl!.topics) {
      expect(inHl.get(topic.id)).toEqual(topic)
    }
  })

  it('names topics with their number, level of organization and title', async () => {
    const { courses } = await read()
    const first = courses[0]!.topics[0]!

    expect(first.id).toBe('A1-1')
    expect(first.name).toBe('A1.1 People: Ergonomics')
    expect(first.text).toBe('A1.1 Ergonomics')
    expect(first.group).toBe('A. Design in theory')
    expect(first.points![0]!.id).toBe('A1-1.1')
  })

  it('drops "(HL only)" from a name, since the course it is in already says so', async () => {
    const hl = (await read()).courses[1]!
    const structures = hl.topics.find((t) => t.id === 'A3-2')!

    expect(structures.name).toBe('A3.2 Product: Introduction to structural systems')
    // Kept verbatim, because `name` is edited and the published heading still
    // has to be checkable against the guide.
    expect(structures.text).toBe('A3.2 Introduction to structural systems (HL only)')
  })

  it('keeps the understanding and what students must do with it in one point', async () => {
    const first = (await read()).courses[0]!.topics[0]!.points![0]!

    expect(first.text).toMatch(/^1\.1\.1 Ergonomics is the relationship/)
    expect(first.text).toContain('Students must be able to')
  })

  it('never runs the two columns together as one sentence', async () => {
    // Nineteen of the map's understandings are published without a full stop.
    for (const course of (await read()).courses) {
      for (const topic of course.topics) {
        for (const point of topic.points!) {
          expect(point.text).not.toMatch(/[a-z)] Students must/)
        }
      }
    }
  })

  it('gives every topic and point an id the schema will take', async () => {
    const { courses } = await read()

    for (const course of courses) {
      for (const topic of course.topics) {
        expect(topic.id).toMatch(/^[A-Z0-9]+(-[A-Z0-9]+)*$/)
        expect(topic.points!.length).toBeGreaterThan(0)
        for (const point of topic.points!) {
          expect(point.id).toMatch(/^[A-Z0-9]+(-[A-Z0-9]+)*\.[0-9]+$/)
          expect(point.text.trim()).not.toBe('')
        }
      }
    }
  })

  it('leaves no topic name opening with a list marker or holding a hard space', async () => {
    // The Textiles lesson (#26, #43), asserted here too: a content point that
    // was read as a heading is what these two checks catch.
    for (const course of (await read()).courses) {
      for (const topic of course.topics) {
        expect(topic.name).not.toMatch(/^\s*(?:[ivx]+\)|[a-z]\)|[-•])/i)
        expect(topic.name).not.toContain(' ')
      }
    }
  })
})
