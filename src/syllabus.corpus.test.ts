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
import { parseSyllabusTables, parseSyllabusXml, summarise } from './syllabus'

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
        // Was 16 and 79 until #26. One HSC topic runs past the bottom of a page
        // and continues in a fresh table row opening on "iv)", which was read as
        // a sixteenth topic named after a content point. Merging it into its
        // parent moves that line from a heading to a point: one topic fewer,
        // one point more, and the count that was "right" all along was counting
        // the fault.
        topics: 15,
        points: 80,
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

async function xmlOf(path: string) {
  const bytes = readFileSync(path)
  const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)
  return readZipMember(buffer as ArrayBuffer, 'word/document.xml')
}

async function coursesOf(path: string) {
  return parseSyllabusXml(await xmlOf(path))
}

async function suspectsOf(path: string) {
  return parseSyllabusTables(await xmlOf(path)).suspects
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

  // #26, and the two checks a count cannot make: a count says how many topics
  // there are, never whether they are topics.
  for (const subject of Object.keys(EXPECTED)) {
    it(`names no ${subject} topic after a content point`, async () => {
      const courses = await coursesOf(EXPECTED[subject]!.path)
      const names = courses.flatMap((c) => c.topics.map((t) => t.name))
      // A heading never opens "i)" or "iv)" or "a)". A row that does is the tail
      // of the topic above, which ran past the bottom of a page.
      expect(names.filter((n) => /^\s*(?:[ivxlcdm]+|[a-z]|\d+)\)/.test(n))).toEqual([])
    })

    it(`carries no non-breaking space into a ${subject} topic name`, async () => {
      const courses = await coursesOf(EXPECTED[subject]!.path)
      const names = courses.flatMap((c) => c.topics.map((t) => t.name))
      expect(names.filter((n) => /\u00a0/.test(n))).toEqual([])
    })
  }

  /*
   * #43. The reader points at a row that may be the tail of the one above and
   * never merges it, so these assert both halves: which topics are flagged, and
   * that the counts above are untouched by the flagging.
   *
   * Textiles Preliminary is the one real case in the corpus. Its `PRE-05 verbal`
   * is a content point of `PRE-04 Communication techniques`, alongside
   * `graphical` and `written`, split off by a page break. Textiles HSC has the
   * #26 case, which `CONTINUATION_RE` already merges, so no topic exists to flag.
   */
  it('points at the Textiles Preliminary row that is really a content point', async () => {
    expect(await suspectsOf(EXPECTED['Textiles and Design']!.path)).toEqual(['PRE-05'])
  })

  it('points at nothing in Design and Technology, whose headings are all bullets', async () => {
    // The case that rules out merging on the markup. All forty of this
    // document's real topic headings are list items, so a reader that acted on
    // that signal would collapse each course to a single topic.
    expect(await suspectsOf(EXPECTED['Design and Technology']!.path)).toEqual([])
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
