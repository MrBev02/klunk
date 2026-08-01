/**
 * The syllabus reader against the real NESA documents, which is the only check
 * that counts.
 *
 * **This never runs in CI, by design.** A NESA syllabus is copyright and cannot
 * enter this repo, which is public. The documents live in the teacher's content
 * folder outside it, so this suite looks for them and skips itself when they are
 * absent. `syllabus.test.ts` is the committed check and runs on synthetic XML.
 *
 * What is asserted here is *structure*, never text: how many topics a course
 * has, how many content points, how many outcomes, and what its groups are
 * called. A count is a fact about the document rather than the document's
 * expression of itself, which is why these numbers are safe to commit when the
 * syllabuses are not.
 *
 * The counts come from `CLAUDE.md`, where they have been the generator's
 * regression check since the Python tool was written.
 *
 * The last test is the one that matters most: the same four documents run
 * through `tools/nesa_stage6_syllabus.py`, and the two must agree exactly. A
 * port that is merely plausible is worthless; a port that is identical means
 * every rule survived the move.
 */

/// <reference types="node" />
import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { readZipMember } from './docx'
import { parseSyllabusXml, summarise } from './syllabus'

const SOURCE = '../klunk-content/source'
const FIXTURES = '../klunk-content/fixtures'

interface Expected {
  path: string
  /** Per course: topics, points, outcomes, and the groups by name. */
  courses: Record<string, { topics: number; points: number; outcomes: number; groups: string[] }>
}

const EXPECTED: Record<string, Expected> = {
  'Design and Technology': {
    path: `${SOURCE}/nsw-hsc-dt/design-technology-st6-syl.docx`,
    courses: {
      // No group on any topic: D&T is one content table per course, so there is
      // nothing for a group to divide. Every topic was once filed under
      // "7.2Key Competencies" without any count changing (#14).
      pre: { topics: 20, points: 78, outcomes: 12, groups: [] },
      hsc: { topics: 20, points: 61, outcomes: 13, groups: [] },
    },
  },
  'Textiles and Design': {
    path: `${SOURCE}/other-syllabuses/textiles-design-st6-syl.docx`,
    courses: {
      pre: {
        topics: 18,
        points: 104,
        outcomes: 11,
        groups: [
          'Design',
          'Properties and Performance of Textiles',
          'Australian Textile, Clothing, Footwear and Allied Industries',
        ],
      },
      hsc: {
        topics: 16,
        points: 79,
        outcomes: 13,
        groups: [
          'Design',
          'Properties and Performance of Textiles',
          'Australian Textile, Clothing, Footwear and Allied Industries',
        ],
      },
    },
  },
}

/** Kept purely as parser regression tests; both subjects are out of scope. */
const ALSO_PARSES = [
  `${FIXTURES}/industrial-technology-st6-syl.docx`,
  `${FIXTURES}/food-technology-st6-syl.docx`,
]

const available = Object.values(EXPECTED).every((e) => existsSync(e.path))

async function coursesOf(path: string) {
  const bytes = readFileSync(path)
  const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)
  return parseSyllabusXml(await readZipMember(buffer as ArrayBuffer, 'word/document.xml'))
}

describe.skipIf(!available)('the syllabus reader against the real NESA documents', () => {
  for (const [subject, expected] of Object.entries(EXPECTED)) {
    it(`reads ${subject} to its established counts`, async () => {
      const found = summarise(await coursesOf(expected.path))
      for (const [courseId, want] of Object.entries(expected.courses)) {
        const got = found.find((c) => c.courseId === courseId)
        expect(got, `${subject} ${courseId}`).toBeDefined()
        expect(
          { topics: got?.topics, points: got?.points, outcomes: got?.outcomes },
          `${subject} ${courseId}`,
        ).toEqual({ topics: want.topics, points: want.points, outcomes: want.outcomes })
        // Sorted, because the order groups appear in is not what is being checked.
        expect([...(got?.groups ?? [])].sort(), `${subject} ${courseId} groups`).toEqual(
          [...want.groups].sort(),
        )
      }
    })
  }

  it('takes no group from a heading that does not say it is one', async () => {
    // The specific fault of #14, kept as its own case because it is the one
    // that hid behind correct counts for a long time.
    const courses = await coursesOf(EXPECTED['Design and Technology']!.path)
    const groups = courses.flatMap((c) => c.topics.map((t) => t.group)).filter(Boolean)
    expect(groups).toEqual([])
  })

  it('carries no non-breaking spaces into a group name', async () => {
    const courses = await coursesOf(EXPECTED['Textiles and Design']!.path)
    const groups = courses.flatMap((c) => c.topics.map((t) => t.group ?? ''))
    expect(groups.filter((g) => / /.test(g))).toEqual([])
  })

  for (const path of ALSO_PARSES) {
    const name = path.split('/').pop() ?? path
    it.skipIf(!existsSync(path))(`still reads ${name}`, async () => {
      const courses = await coursesOf(path)
      expect(courses.length).toBeGreaterThan(0)
      expect(courses.every((c) => c.topics.length > 0)).toBe(true)
    })
  }
})

/**
 * The port against what it was ported from.
 *
 * Skipped when python3 is not on the path, since it is not a dependency of the
 * app — only of this comparison.
 */
const havePython = (() => {
  try {
    execFileSync('python3', ['--version'], { stdio: 'ignore' })
    return true
  } catch {
    return false
  }
})()

describe.skipIf(!available || !havePython)('the port against the Python generator', () => {
  for (const [subject, expected] of Object.entries(EXPECTED)) {
    it(`agrees with tools/nesa_stage6_syllabus.py on ${subject}`, async () => {
      const fromPython = JSON.parse(
        execFileSync(
          'python3',
          [
            'tools/nesa_stage6_syllabus.py',
            expected.path,
            '--id',
            'comparison',
            '--name',
            'Comparison',
            // Fixed, so the two differ only where the parsing differs.
            '--retrieved',
            '2026-01-01',
          ],
          { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 },
        ),
      ) as { courses: unknown[] }

      // Compared through JSON on both sides: the Python model writes `group`
      // only when there is one, and an absent key and an empty string are the
      // difference #14 was about.
      expect(JSON.parse(JSON.stringify(await coursesOf(expected.path)))).toEqual(
        fromPython.courses,
      )
    })
  }
})
