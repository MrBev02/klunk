/**
 * The heading readers against the real NESA documents.
 *
 * **This never runs in CI, by design**, for the reason `syllabus.corpus.test.ts`
 * gives: a syllabus is copyright and cannot enter this repo, which is public.
 * The documents live in the teacher's content folder outside it, so this looks
 * for them and skips itself when they are absent. `headings.test.ts` is the
 * committed check and runs on synthetic XML.
 *
 * What is asserted is structure and never text — how many topics, points and
 * outcomes, what the groups are called, and which reader claimed the document.
 * A count is a fact about a document rather than the document's expression of
 * itself, which is why these numbers are safe to commit when the syllabuses are
 * not.
 *
 * Unlike the 2013 counts, these were established here rather than inherited:
 * each was read off the document by hand first — the heading list for the
 * topics, the outcome table for the outcomes — and then checked against what the
 * reader produced. They go into `CLAUDE.md` as the regression check.
 */

/// <reference types="node" />
import { existsSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { readZipMember } from './docx'
import { readSyllabusXml, type SyllabusFormat } from './formats'
import { summarise } from './syllabus'

const SOURCE = '../klunk-content/source'

interface Expected {
  path: string
  format: SyllabusFormat
  courses: Record<string, { topics: number; points: number; outcomes: number; groups: string[] }>
}

// Computing Technology's six focus areas, which are the groups of all three of
// its course sections. Named once because both courses have the same six and a
// second copy would drift.
const FOCUS_AREAS = [
  'Enterprise information systems: Modelling networks and social connections',
  'Enterprise information systems: Designing for user experience',
  'Enterprise information systems: Analysing data',
  'Software development: Building mechatronic and automated systems',
  'Software development: Creating games and simulations',
  'Software development: Developing apps and web software',
]

const EXPECTED: Record<string, Expected> = {
  // Drama styles its headings inconsistently — the first topic of 8.1 is
  // `Head5` and the next two are `Heading3` — so this is the document that
  // proves the reader ranks nothing by heading level.
  'Drama Stage 6 (2009)': {
    path: `${SOURCE}/nsw-hsc-drama/drama-st6-syl-from2010.docx`,
    format: 'headings',
    courses: {
      // No group on any topic: the courses are three topics each with nothing
      // dividing them, so a group would have nothing to do.
      pre: { topics: 3, points: 15, outcomes: 18, groups: [] },
      // Nineteen outcomes against eighteen for the Preliminary course, and the
      // extra one is the whole reason the outcome table is read: H2.5 is in the
      // table and attached to no topic.
      hsc: { topics: 3, points: 20, outcomes: 19, groups: [] },
    },
  },
  'English Advanced 11–12 (2024)': {
    path: `${SOURCE}/nsw-hsc-english/NESA - english_advanced_11_12_2024 (S6).docx`,
    format: 'headings',
    courses: {
      // Three topics per focus area, not two: `Understanding` and `Responding`,
      // plus one named after the focus area holding the paragraph that
      // describes it. Nothing under a `Content` heading is dropped.
      y11: {
        topics: 9,
        points: 30,
        outcomes: 6,
        groups: [
          'Reading to write: Transition to English Advanced',
          'Narratives that shape our world',
          'Critical study of literature',
        ],
      },
      y12: {
        topics: 12,
        points: 43,
        outcomes: 6,
        groups: [
          'Texts and human experiences',
          'Textual conversations',
          'Critical study of literature',
          'The craft of writing',
        ],
      },
    },
  },
  'Mathematics Advanced 11–12 (2024)': {
    path: `${SOURCE}/nsw-hsc-maths/NESA - mathematics_advanced_11_12_2024 (S6).docx`,
    format: 'headings',
    courses: {
      // Eleven outcomes where the table of outcomes lists ten: `MAO-WM-01
      // Working mathematically` is stated above that table rather than in it,
      // and reaches the model through the focus areas that cite it.
      //
      // Two focus areas are missing from the groups deliberately —
      // `Trigonometric identities and equations` and `Graph transformations`
      // set out their content with no sub-headings, so each is a topic rather
      // than a group.
      y11: {
        topics: 27,
        points: 201,
        outcomes: 11,
        groups: [
          'Working with functions',
          'Trigonometry and measure of angles',
          'Introduction to differentiation',
          'Exponential and logarithmic functions',
          'Probability and data',
        ],
      },
      y12: {
        topics: 25,
        points: 158,
        outcomes: 9,
        groups: [
          'Further graph transformations and modelling',
          'Sequences and series',
          'Differential calculus',
          'Integral calculus',
          'Applications of calculus',
          'Random variables',
          'Financial mathematics',
        ],
      },
    },
  },
  // The first junior document, and the one that settled #50: a 7–10 syllabus is
  // organised by stage, not by year. Structurally it is the Curriculum Reform
  // contract above — styled heading levels, bullets, the code closing the line —
  // and it was refused only because `courseNamed` did not know a stage and
  // `CODE` did not admit the digit in `CT4-`/`CT5-`.
  'Computing Technology 7–10 (2022)': {
    path: `${SOURCE}/nsw-computing-technology-7-10/NESA - computing_technology_7_10_2022 (S4, S5, LS).docx`,
    format: 'headings',
    courses: {
      // One outcome, and it is not an outcome: `CT4-ADJ-01` reads "in Stage 4
      // teachers may adjust the Stage 5 outcomes as appropriate to the needs of
      // students in Years 7 and 8". NESA has given an instruction a code and put
      // it in the outcome column, and it is the whole of Stage 4's outcome set.
      // Filtering it out would be deciding something the document does not.
      s4: { topics: 24, points: 246, outcomes: 1, groups: FOCUS_AREAS },
      // The same 246 points as Stage 4, because the syllabus says so: "The
      // content available for Stage 4 is identical to Stage 5." Checked rather
      // than taken on trust — the points are identical strings in identical
      // order under identical headings. This is the Visual Arts arrangement
      // arriving from a second direction, and the ids stay distinct because
      // `prefixOf` mints them per course: `S4-01` against `S5-01`.
      s5: { topics: 24, points: 246, outcomes: 10, groups: FOCUS_AREAS },
      // No `ls`. Life Skills for Stages 4/5 is a third course section in this
      // document — its own enrolment numbers, its own `CTLS-` codes, its own 201
      // points — and Klunk does not model it. `COURSE_SECTION_RE` is anchored so
      // the section never opens a course, and `courseNamed` returns null for a
      // Life Skills outcome column. That is a decision, not an oversight (#71).
    },
  },
  'Visual Arts Stage 6 (2016)': {
    path: `${SOURCE}/nsw-hsc-visual-arts/visual-arts-st6-syl-amended-2016.docx`,
    format: 'prose',
    courses: {
      // The two courses hold the same 132 points because the syllabus says so:
      // 8.1 is the Preliminary course and 8.2 the HSC course, and 8.3 to 8.5
      // are the content of both.
      pre: {
        topics: 17,
        points: 132,
        outcomes: 10,
        groups: [
          'Practice in Artmaking, Art Criticism and Art History',
          'The Conceptual Framework – Agencies in the Artworld',
          'The Frames',
        ],
      },
      hsc: {
        topics: 17,
        points: 132,
        outcomes: 10,
        groups: [
          'Practice in Artmaking, Art Criticism and Art History',
          'The Conceptual Framework – Agencies in the Artworld',
          'The Frames',
        ],
      },
    },
  },
}

const available = Object.values(EXPECTED).every((e) => existsSync(e.path))

async function readingOf(path: string) {
  const bytes = readFileSync(path)
  const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)
  return readSyllabusXml(await readZipMember(buffer as ArrayBuffer, 'word/document.xml'))
}

describe.skipIf(!available)('the heading readers against the real NESA documents', () => {
  for (const [subject, expected] of Object.entries(EXPECTED)) {
    it(`reads ${subject} to its established counts`, async () => {
      const { format, courses } = await readingOf(expected.path)
      expect(format, `${subject} was read by the wrong reader`).toBe(expected.format)

      const found = summarise(courses)
      expect(found.map((c) => c.courseId).sort()).toEqual(Object.keys(expected.courses).sort())

      for (const [courseId, want] of Object.entries(expected.courses)) {
        const got = found.find((c) => c.courseId === courseId)
        expect(got, `${subject} ${courseId}`).toBeDefined()
        expect(
          { topics: got?.topics, points: got?.points, outcomes: got?.outcomes },
          `${subject} ${courseId}`,
        ).toEqual({ topics: want.topics, points: want.points, outcomes: want.outcomes })
        // Sorted, because the order groups appear in is not what is checked.
        expect([...(got?.groups ?? [])].sort(), `${subject} ${courseId} groups`).toEqual(
          [...want.groups].sort(),
        )
      }
    })

    // The checks a count cannot make. A count says how many topics there are,
    // never whether they are topics — which is the lesson of #26 and #14.
    it(`gives ${subject} no topic that is really a content point`, async () => {
      const { courses } = await readingOf(expected.path)
      const names = courses.flatMap((c) => c.topics.map((t) => t.name))
      expect(names.filter((n) => n === '')).toEqual([])
      // A heading never opens "i)" or "a)" or ends in a full stop.
      expect(names.filter((n) => /^\s*(?:[ivxlcdm]+|[a-z]|\d+)\)/.test(n))).toEqual([])
      expect(names.filter((n) => /\.$/.test(n))).toEqual([])
      // Nor is a heading ever the marker that opened its own block.
      expect(names.filter((n) => /^(outcomes|content)$/i.test(n))).toEqual([])
    })

    it(`carries no non-breaking space into a ${subject} topic name or group`, async () => {
      const { courses } = await readingOf(expected.path)
      const labels = courses.flatMap((c) => c.topics.flatMap((t) => [t.name, t.group ?? '']))
      expect(labels.filter((n) => / /.test(n))).toEqual([])
    })

    it(`leaves no ${subject} outcome without its text`, async () => {
      const { courses } = await readingOf(expected.path)
      const empty = courses.flatMap((c) =>
        (c.outcomes ?? []).filter((o) => o.text.trim() === '').map((o) => `${c.id} ${o.code}`),
      )
      expect(empty).toEqual([])
    })

    it(`tags every ${subject} topic outcome against one the course declares`, async () => {
      const { courses } = await readingOf(expected.path)
      const unknown = courses.flatMap((c) => {
        const declared = new Set((c.outcomes ?? []).map((o) => o.code))
        return c.topics.flatMap((t) => (t.outcomes ?? []).filter((code) => !declared.has(code)))
      })
      expect(unknown).toEqual([])
    })
  }

  it('recovers the formulae Word keeps in its own namespace', async () => {
    // Mathematics Advanced is the only one of the six documents carrying any,
    // and without them 159 of its 359 content points read as complete sentences
    // with the mathematics silently missing.
    const { courses } = await readingOf(EXPECTED['Mathematics Advanced 11–12 (2024)']!.path)
    const points = courses.flatMap((c) => c.topics.flatMap((t) => t.points ?? []))
    const quadratic = points.find((p) => p.text.includes('graph a parabola of the form'))
    expect(quadratic?.text).toContain('y=ax2+bx+c')
  })

  it('gives the 2013 documents to the table reader, not to these', async () => {
    // The order the readers are tried in is a decision, and this is what it is
    // for: Design and Technology has headings too, and would be read badly.
    const dt = `${SOURCE}/nsw-hsc-dt/design-technology-st6-syl.docx`
    if (!existsSync(dt)) return
    expect((await readingOf(dt)).format).toBe('tables')
  })
})
