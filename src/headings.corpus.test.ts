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
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
  BIOLOGY,
  COMPUTING,
  DRAMA,
  DT_SYLLABUS,
  ENGLISH,
  MATHS,
  VISUAL_ARTS,
  have,
} from './corpus'
import { readZipMember } from './docx'
import { readSyllabusXml, type SyllabusFormat } from './formats'
import { summarise } from './syllabus'


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
    path: DRAMA,
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
    path: ENGLISH,
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
    path: MATHS,
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
    path: COMPUTING,
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
  // The live HSC syllabus, and the reason it matters that it reads: the 2025
  // reform document starts with Year 11 in 2027 while Year 12 continues on this
  // one (#29). Structurally it is the reform contract again and needed no new
  // reader — it was refused by three separate rules (#77), of which only the
  // first was visible. One of a series: Chemistry, Physics, Earth and
  // Environmental Science and Investigating Science were published beside it in
  // the same shape and with the same code pattern.
  'Biology Stage 6 (2017)': {
    path: BIOLOGY,
    format: 'headings',
    courses: {
      // Eleven outcomes per course, and the split is the point: four are the
      // course's own — `BIO11-8` to `BIO11-11` — and seven are the Working
      // Scientifically outcomes `BIO11/12-1` to `BIO11/12-7`, which both courses
      // share and which no other document's code shape admits.
      //
      // Nineteen topics is the seven Working Scientifically skills, which carry
      // no group, plus the twelve sub-headings inside the four modules' Content
      // blocks, which carry their module. A module appearing here as a topic
      // rather than as a group means the `Working Scientifically` heading
      // between `Outcomes` and `Content` has been taken for a topic again — and
      // the outcome check below is what catches the damage that does.
      //
      // The point counts are 31 and 41 below the number of paragraphs, which is
      // one `Students:` per topic — the list's own lead-in — plus one inquiry
      // question per module topic, both of which are now somewhere better (#78).
      // Sub-items still count as points; they gained a parent, not a new home.
      y11: {
        topics: 19,
        points: 122,
        outcomes: 11,
        groups: [
          'Module 1: Cells as the Basis of Life',
          'Module 2: Organisation of Living Things',
          'Module 3: Biological Diversity',
          'Module 4: Ecosystem Dynamics',
        ],
      },
      y12: {
        topics: 24,
        points: 149,
        outcomes: 11,
        groups: [
          'Module 5: Heredity',
          'Module 6: Genetic Change',
          'Module 7: Infectious Disease',
          'Module 8: Non-infectious Disease and Disorders',
        ],
      },
    },
  },
  'Visual Arts Stage 6 (2016)': {
    path: VISUAL_ARTS,
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

/**
 * Each document gates itself, rather than one missing document skipping them all.
 *
 * `every` was the rule, and it is the wrong one: a machine holding five of the
 * six documents ran none of these and said so nowhere (#65). That is this
 * repository's own lesson about a green run being evidence of nothing, and it
 * bit during #77 — the reader was changed with its whole corpus silently
 * skipping, so the four documents it had to keep reading went unchecked until
 * the gate was fixed.
 */
const has = (e: Expected) => have(e.path)

async function readingOf(path: string) {
  const bytes = readFileSync(path)
  const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)
  return readSyllabusXml(await readZipMember(buffer as ArrayBuffer, 'word/document.xml'))
}

describe('the heading readers against the real NESA documents', () => {
  for (const [subject, expected] of Object.entries(EXPECTED)) {
    // The document is missing on this machine, so say so against its own name
    // rather than skipping every document with it.
    describe.skipIf(!has(expected))(subject, () => {
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
    })
  }

  it.skipIf(!has(EXPECTED['Mathematics Advanced 11–12 (2024)']!))(
    'recovers the formulae Word keeps in its own namespace',
    async () => {
    // Mathematics Advanced is the only one of the six documents carrying any,
    // and without them 159 of its 359 content points read as complete sentences
    // with the mathematics silently missing.
      const { courses } = await readingOf(EXPECTED['Mathematics Advanced 11–12 (2024)']!.path)
      const points = courses.flatMap((c) => c.topics.flatMap((t) => t.points ?? []))
      const quadratic = points.find((p) => p.text.includes('graph a parabola of the form'))
      expect(quadratic?.text).toContain('y=ax2+bx+c')
    },
  )

  it.skipIf(!has(EXPECTED['Biology Stage 6 (2017)']!))(
    'reads Biology as items with sub-items under them, tagged with capabilities',
    async () => {
      // #78. The counts above cannot see any of this: a flattened sub-item is
      // still a point, and a lost capability is still a sentence.
      const { courses } = await readingOf(EXPECTED['Biology Stage 6 (2017)']!.path)
      const points = courses.flatMap((c) => c.topics.flatMap((t) => t.points ?? []))
      const topics = courses.flatMap((c) => c.topics)

      // 137 sub-items, counted off the markup's own `w:ilvl` before any of this
      // was built.
      expect(points.filter((p) => p.parent).length).toBe(137)

      // Every parent is a real point of the same topic, and no parent is itself
      // a sub-item — the document has two levels and only two.
      const byId = new Map(points.map((p) => [p.id, p]))
      for (const point of points.filter((p) => p.parent)) {
        const parent = byId.get(point.parent!)
        expect(parent, `${point.id} points at ${point.parent}`).toBeDefined()
        expect(parent!.parent).toBeUndefined()
        expect(point.id.split('.')[0]).toBe(point.parent!.split('.')[0])
      }

      // 139 paragraphs carry at least one icon: 138 content points and the one
      // inquiry question, whose tag moves onto its topic rather than being lost.
      const tagged = points.filter((p) => p.capabilities?.length).length
      const onTopics = topics.filter((t) => t.capabilities?.length).length
      expect(tagged).toBe(138)
      expect(onTopics).toBe(1)

      // The thirteen the syllabus declares under Learning Across the Curriculum,
      // in its own spelling — never the alt text's, which is not consistent.
      const used = new Set(points.flatMap((p) => p.capabilities ?? []))
      expect(used.size).toBe(13)
      expect(used).toContain('Work and Enterprise')
      expect([...used].filter((c) => /icon$/i.test(c))).toEqual([])

      // One inquiry question per module topic, and none left as a content point.
      expect(topics.filter((t) => t.inquiryQuestion).length).toBe(29)
      expect(points.filter((p) => /^inquiry question:/i.test(p.text))).toEqual([])
      expect(points.filter((p) => /^students:$/i.test(p.text.trim()))).toEqual([])
    },
  )

  it.skipIf(!has(EXPECTED['Biology Stage 6 (2017)']!))(
    'leaves no Biology topic holding content but no outcome',
    async () => {
      // The check the counts cannot make, and the one the fault needed. Taking
      // `Working Scientifically` for a topic left every module's content under
      // it with an empty outcome list while the totals still looked like a
      // syllabus — 23 topics against 19, which reads as a parser being generous
      // rather than as a model that has lost what a question is tagged against.
      const { courses } = await readingOf(EXPECTED['Biology Stage 6 (2017)']!.path)
      const bare = courses.flatMap((c) =>
        c.topics.filter((t) => (t.outcomes ?? []).length === 0).map((t) => `${c.id} ${t.id} ${t.name}`),
      )
      expect(bare).toEqual([])

      // The seven Working Scientifically outcomes are stated once each, in a
      // topic block, and both courses carry all seven.
      for (const course of courses) {
        const shared = (course.outcomes ?? []).filter((o) => o.code.includes('/'))
        expect(shared.map((o) => o.code)).toEqual([
          'BIO11/12-1',
          'BIO11/12-2',
          'BIO11/12-3',
          'BIO11/12-4',
          'BIO11/12-5',
          'BIO11/12-6',
          'BIO11/12-7',
        ])
      }
    },
  )

  // Skipped rather than returned early. It used to `return` when the document
  // was absent, which reports as a passing test that checked nothing — #65 in
  // miniature, inside the file that fixed it.
  it.skipIf(!have(DT_SYLLABUS))(
    'gives the 2013 documents to the table reader, not to these',
    async () => {
      // The order the readers are tried in is a decision, and this is what it is
      // for: Design and Technology has headings too, and would be read badly.
      expect((await readingOf(DT_SYLLABUS)).format).toBe('tables')
    },
  )
})
