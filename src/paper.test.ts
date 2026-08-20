/**
 * Tests for the paper logic.
 *
 * This is the part that has to be right and cannot be checked by looking at the
 * screen: whether the marks add up, whether a section has the wrong number of
 * questions, and whether the option letters on the marking guide match the ones
 * on the student paper. A teacher discovers a mistake in any of those in an exam
 * room, which is far too late.
 */

import { describe, expect, it } from 'vitest'
import {
  addRef,
  checkPaper,
  moveRef,
  newPaper,
  paperIsDirty,
  paperIsSaved,
  pickableQuestions,
  removeRef,
  resolvePaper,
  rowAnswers,
  shuffledChoices,
  shuffledMatching,
  shuffledResponses,
} from './paper'
import { emptyManifest } from './manifest'
import type { ContentIndex } from './storage'
import type { Bank, Paper, Profile, Question, Syllabus } from './types'

const profile: Profile = {
  formatVersion: '1',
  type: 'klunk_profile',
  id: 'test',
  name: 'Test paper',
  paper: {
    totalMarks: 20,
    sections: [
      {
        id: 'I',
        name: 'Section I',
        marks: 5,
        questionTypes: ['multiple_choice'],
        questionCount: 5,
        marksPerQuestion: 1,
      },
      {
        id: 'II',
        name: 'Section II',
        marks: 15,
        questionTypes: ['short_answer', 'extended_response'],
        minQuestions: 1,
        maxQuestions: 3,
      },
    ],
  },
  marks: { wholeNumberTotals: true },
}

function mc(id: string, marks = 1): Question {
  return {
    id,
    questionType: 'multiple_choice',
    questionText: `Question ${id}`,
    marks,
    syllabus: { topicIds: ['HSC-01'] },
    config: {
      choices: [{ text: 'alpha' }, { text: 'beta' }, { text: 'gamma' }, { text: 'delta' }],
      correctAnswer: 2,
    },
  }
}

function written(id: string, marks: number): Question {
  return {
    id,
    questionType: 'short_answer',
    questionText: `Written ${id}`,
    marks,
    syllabus: { topicIds: ['HSC-02'] },
  }
}

function indexWith(questions: Question[]): ContentIndex {
  const bank: Bank = { formatVersion: '1', type: 'klunk_bank', questions }
  return {
    profiles: [{ path: 'profiles/test.json', data: profile }],
    syllabuses: [],
    banks: [{ path: 'bank/test.json', data: bank }],
    papers: [],
    problems: [],
    scanned: 2,
    pdfs: [],
    docx: [],
    workbooks: [],
    schools: [],
    manifest: emptyManifest(),
    images: new Map(),
  }
}

/** A paper that satisfies the profile exactly. */
function goodPaper(): { index: ContentIndex; paper: Paper } {
  const questions = [...['a', 'b', 'c', 'd', 'e'].map((id) => mc(id)), written('f', 15)]
  const index = indexWith(questions)
  let paper = newPaper(profile, 'p1', 'Test')
  for (const id of ['a', 'b', 'c', 'd', 'e']) {
    paper = addRef(paper, 0, `bank/test.json#${id}`)
  }
  paper = addRef(paper, 1, 'bank/test.json#f')
  return { index, paper }
}

describe('resolvePaper', () => {
  it('numbers questions continuously across sections', () => {
    const { index, paper } = goodPaper()
    const resolved = resolvePaper(index, paper, profile)
    expect(resolved.sections[0]?.questions.map((q) => q.number)).toEqual([1, 2, 3, 4, 5])
    expect(resolved.sections[1]?.questions[0]?.number).toBe(6)
  })

  it('totals marks per section and overall', () => {
    const { index, paper } = goodPaper()
    const resolved = resolvePaper(index, paper, profile)
    expect(resolved.sections[0]?.marks).toBe(5)
    expect(resolved.sections[1]?.marks).toBe(15)
    expect(resolved.totalMarks).toBe(20)
  })

  it('reports a dangling reference instead of silently dropping it', () => {
    const { index, paper } = goodPaper()
    const broken = addRef(paper, 1, 'bank/test.json#does-not-exist')
    const resolved = resolvePaper(index, broken, profile)
    expect(resolved.missing).toContain('bank/test.json#does-not-exist')
    expect(checkPaper(resolved).some((c) => c.severity === 'error')).toBe(true)
  })

  it('honours a marks override without touching the bank', () => {
    const { index, paper } = goodPaper()
    const overridden: Paper = {
      ...paper,
      sections: paper.sections.map((s, i) =>
        i === 1
          ? { ...s, refs: [{ file: 'bank/test.json', questionId: 'f', marksOverride: 10 }] }
          : s,
      ),
    }
    const resolved = resolvePaper(index, overridden, profile)
    expect(resolved.sections[1]?.marks).toBe(10)
    // The bank question itself is untouched.
    expect(index.banks[0]?.data.questions.find((q) => q.id === 'f')?.marks).toBe(15)
  })
})

describe('checkPaper', () => {
  it('passes a paper that matches the profile', () => {
    const { index, paper } = goodPaper()
    const errors = checkPaper(resolvePaper(index, paper, profile)).filter(
      (c) => c.severity === 'error',
    )
    expect(errors).toEqual([])
  })

  it('catches a wrong total', () => {
    const { index, paper } = goodPaper()
    const short = removeRef(paper, 0, 0)
    const checks = checkPaper(resolvePaper(index, short, profile))
    expect(checks.some((c) => c.message.includes('19 marks'))).toBe(true)
  })

  it('catches the wrong number of questions in a fixed-count section', () => {
    const { index, paper } = goodPaper()
    const short = removeRef(paper, 0, 0)
    const checks = checkPaper(resolvePaper(index, short, profile))
    expect(checks.some((c) => c.message.includes('expects exactly 5'))).toBe(true)
  })

  it('catches too many questions in a ranged section', () => {
    const index = indexWith([
      ...['a', 'b', 'c', 'd', 'e'].map((id) => mc(id)),
      written('f', 5),
      written('g', 5),
      written('h', 3),
      written('i', 2),
    ])
    let paper = newPaper(profile, 'p', 'T')
    for (const id of ['a', 'b', 'c', 'd', 'e']) paper = addRef(paper, 0, `bank/test.json#${id}`)
    for (const id of ['f', 'g', 'h', 'i']) paper = addRef(paper, 1, `bank/test.json#${id}`)
    const checks = checkPaper(resolvePaper(index, paper, profile))
    expect(checks.some((c) => c.message.includes('at most 3'))).toBe(true)
  })

  /*
   * A section of alternatives, taken from the 2025 Visual Arts trial: six
   * questions worth 25 each, of which a student answers one, in a 25-mark
   * section of a 50-mark paper. Before this the paper read 175 marks.
   */
  describe('a section a student chooses from', () => {
    const choiceProfile: Profile = {
      formatVersion: '1',
      type: 'klunk_profile',
      id: 'va',
      name: 'Visual Arts trial',
      paper: {
        totalMarks: 50,
        sections: [
          { id: 'I', name: 'Section I', marks: 25 },
          {
            id: 'II',
            name: 'Section II',
            marks: 25,
            questionCount: 6,
            chooseCount: 1,
            marksPerQuestion: 25,
          },
        ],
      },
    }

    const alternatives = ['q4', 'q5', 'q6', 'q7', 'q8', 'q9']

    function choicePaper(marksEach: Record<string, number> = {}) {
      const index = indexWith([
        written('s1', 25),
        ...alternatives.map((id) => written(id, marksEach[id] ?? 25)),
      ])
      let paper = newPaper(choiceProfile, 'va', 'VA')
      paper = addRef(paper, 0, 'bank/test.json#s1')
      for (const id of alternatives) paper = addRef(paper, 1, `bank/test.json#${id}`)
      return { index, paper }
    }

    it('counts what a student can earn, not what is printed', () => {
      const { index, paper } = choicePaper()
      const resolved = resolvePaper(index, paper, choiceProfile)

      expect(resolved.sections[1]?.marks).toBe(25)
      // The printed total is kept, because it is what a marking guide covers.
      expect(resolved.sections[1]?.offeredMarks).toBe(150)
      expect(resolved.totalMarks).toBe(50)
      expect(checkPaper(resolved).filter((c) => c.severity === 'error')).toEqual([])
    })

    it('still counts every question against the offered count', () => {
      const { index, paper } = choicePaper()
      const short = removeRef(paper, 1, 0)
      const checks = checkPaper(resolvePaper(index, short, choiceProfile))
      expect(checks.some((c) => c.message.includes('expects exactly 6'))).toBe(true)
    })

    it('rejects alternatives that are not worth the same', () => {
      const { index, paper } = choicePaper({ q7: 20 })
      const checks = checkPaper(resolvePaper(index, paper, choiceProfile))
      expect(checks.some((c) => c.message.includes('have to be worth the same'))).toBe(true)
    })

    it('rejects a section holding fewer questions than a student answers', () => {
      const profile3: Profile = {
        ...choiceProfile,
        paper: {
          ...choiceProfile.paper,
          sections: [
            { id: 'I', name: 'Section I', marks: 25 },
            { id: 'II', name: 'Section II', marks: 25, chooseCount: 3, marksPerQuestion: 25 },
          ],
        },
      }
      const index = indexWith([written('s1', 25), written('q4', 25)])
      let paper = newPaper(profile3, 'va', 'VA')
      paper = addRef(paper, 0, 'bank/test.json#s1')
      paper = addRef(paper, 1, 'bank/test.json#q4')
      const checks = checkPaper(resolvePaper(index, paper, profile3))
      expect(checks.some((c) => c.message.includes('there is only 1'))).toBe(true)
    })

    it('leaves a section that is not a choice counting every question', () => {
      // The regression this whole change has to not cause: absent chooseCount
      // means answer everything, which is what every profile written before it
      // meant.
      const { index, paper } = goodPaper()
      const resolved = resolvePaper(index, paper, profile)
      expect(resolved.sections[0]?.marks).toBe(5)
      expect(resolved.sections[0]?.offeredMarks).toBe(5)
      expect(resolved.sections[0]?.chooseCount).toBeUndefined()
      expect(resolved.totalMarks).toBe(20)
    })
  })

  it('catches the same question used twice', () => {
    const { index, paper } = goodPaper()
    const dupe = addRef(paper, 1, 'bank/test.json#a')
    const checks = checkPaper(resolvePaper(index, dupe, profile))
    expect(checks.some((c) => c.message.includes('appears 2 times'))).toBe(true)
  })

  it('catches a question type the section does not allow', () => {
    const index = indexWith([
      ...['a', 'b', 'c', 'd'].map((id) => mc(id)),
      written('e', 1),
      written('f', 15),
    ])
    let paper = newPaper(profile, 'p', 'T')
    for (const id of ['a', 'b', 'c', 'd', 'e']) paper = addRef(paper, 0, `bank/test.json#${id}`)
    paper = addRef(paper, 1, 'bank/test.json#f')
    const checks = checkPaper(resolvePaper(index, paper, profile))
    expect(checks.some((c) => c.message.includes('not allowed in this section'))).toBe(true)
  })

  it('catches a question worth the wrong marks for a fixed-value section', () => {
    const index = indexWith([mc('a', 2), mc('b'), mc('c'), mc('d'), mc('e'), written('f', 14)])
    let paper = newPaper(profile, 'p', 'T')
    for (const id of ['a', 'b', 'c', 'd', 'e']) paper = addRef(paper, 0, `bank/test.json#${id}`)
    paper = addRef(paper, 1, 'bank/test.json#f')
    const checks = checkPaper(resolvePaper(index, paper, profile))
    expect(checks.some((c) => c.message.includes('this section is 1 per question'))).toBe(true)
  })

  it('warns rather than errors about a past-paper question', () => {
    const questions = [
      ...['a', 'b', 'c', 'd', 'e'].map((id) => mc(id)),
      { ...written('f', 15), source: { origin: 'extracted' as const, year: 2024, paper: 'HSC' } },
    ]
    const index = indexWith(questions)
    let paper = newPaper(profile, 'p', 'T')
    for (const id of ['a', 'b', 'c', 'd', 'e']) paper = addRef(paper, 0, `bank/test.json#${id}`)
    paper = addRef(paper, 1, 'bank/test.json#f')
    const checks = checkPaper(resolvePaper(index, paper, profile))
    const warning = checks.find((c) => c.message.includes('2024'))
    expect(warning?.severity).toBe('warning')
    expect(checks.filter((c) => c.severity === 'error')).toEqual([])
  })

  it('says so when there is no profile rather than pretending the paper is fine', () => {
    const { index, paper } = goodPaper()
    const checks = checkPaper(resolvePaper(index, paper, undefined))
    expect(checks.some((c) => c.message.includes('No profile set'))).toBe(true)
  })
})

/**
 * Reusing a question from a paper a cohort has already sat is the mistake this
 * whole safeguard exists for, and it is silent: the paper checks out perfectly
 * against the profile while being unfit to sit.
 */
describe('checkPaper against papers already sat', () => {
  /** A paper marked as sat, holding the given question ids from `bankPath`. */
  function satPaper(id: string, title: string, ids: string[], bankPath = 'bank/test.json') {
    let sat = newPaper(profile, id, title)
    sat.status = 'used'
    for (const q of ids) sat = addRef(sat, 0, `${bankPath}#${q}`)
    return { path: `papers/${id}.json`, data: sat }
  }

  it('warns when a question is on another paper students have sat', () => {
    const { index, paper } = goodPaper()
    index.papers = [satPaper('trial-2025', '2025 Trial HSC', ['b', 'c'])]

    const checks = checkPaper(resolvePaper(index, paper, profile))
    const warnings = checks.filter((c) => c.message.includes('already sat'))

    expect(warnings).toHaveLength(2)
    expect(warnings[0]?.severity).toBe('warning')
    expect(warnings[0]?.message).toContain('"2025 Trial HSC"')
    // A perfectly valid paper, which is exactly why the warning has to exist.
    expect(checks.filter((c) => c.severity === 'error')).toEqual([])
  })

  it('names every sat paper a question appears on, once each', () => {
    const { index, paper } = goodPaper()
    index.papers = [
      satPaper('trial-2024', '2024 Trial', ['b']),
      satPaper('trial-2025', '2025 Trial', ['b']),
    ]

    const warning = checkPaper(resolvePaper(index, paper, profile)).find((c) =>
      c.message.includes('already sat'),
    )
    expect(warning?.message).toContain('"2024 Trial", "2025 Trial"')
  })

  it('stays quiet about papers that are draft or final', () => {
    const { index, paper } = goodPaper()
    const draft = satPaper('d', 'Draft paper', ['b'])
    draft.data.status = 'draft'
    const final = satPaper('f', 'Final paper', ['c'])
    final.data.status = 'final'
    index.papers = [draft, final]

    const checks = checkPaper(resolvePaper(index, paper, profile))
    expect(checks.some((c) => c.message.includes('already sat'))).toBe(false)
  })

  it('does not warn a sat paper about reusing its own questions', () => {
    const { index, paper } = goodPaper()
    // The paper being edited, saved to the folder and marked sat: every question
    // on it appears on a sat paper, itself. Only its own status should be raised.
    const self = satPaper(paper.id, paper.title, ['a', 'b', 'c', 'd', 'e'])
    index.papers = [self]
    const sat = { ...paper, status: 'used' as const }

    const checks = checkPaper(resolvePaper(index, sat, profile))
    const own = checks.filter((c) => c.message.includes('marked as already sat'))
    const reuse = checks.filter((c) => c.message.includes('which students have already sat'))

    expect(own).toHaveLength(1)
    expect(reuse).toEqual([])
  })

  it('still warns when the sat paper referenced a bank since renamed', () => {
    const { index, paper } = goodPaper()
    // Matching on `file#id` would go silent here, which is the wrong moment for
    // a safeguard to go silent: the folder was reorganised, not the question.
    index.papers = [satPaper('trial-2025', '2025 Trial', ['b'], 'bank/old-name.json')]

    const checks = checkPaper(resolvePaper(index, paper, profile))
    expect(checks.some((c) => c.message.includes('"2025 Trial"'))).toBe(true)
  })
})

/** The same paper, assessing a named syllabus, which is what a real profile does. */
const designProfile: Profile = { ...profile, syllabusId: 'nsw-hsc-design-technology' }

/** A subject whose model has more than one course, which is what #49 turns on. */
const scienceProfile: Profile = { ...profile, syllabusId: 'nsw-science-7-10' }

/** Section II: short answer and extended response, so the written questions qualify. */
const written15 = designProfile.paper.sections[1]

/**
 * A folder holding two subjects, which is what `../klunk-content` holds and
 * what a shared OneDrive drifts into.
 *
 * Both NSW models number their topics from one within each course, so `HSC-01`
 * names a different topic in each and the tags cannot separate them. The
 * syllabus a question resolves to is the only thing that can, and a question
 * naming none must stay visible: all that is known about it is a bare topic id.
 */
function twoSubjects(): ContentIndex {
  // The topics the fixture questions are actually tagged against. An empty
  // course list would be simpler and would now mean something else: every tag in
  // the folder resolving to nothing, which is its own warning (#44).
  const syllabus = (id: string, name: string): { path: string; data: Syllabus } => ({
    path: `syllabus/${id}.json`,
    data: {
      formatVersion: '1',
      type: 'klunk_syllabus',
      id,
      name,
      framework: 'nsw',
      courses: [
        {
          id: 'hsc',
          name: 'HSC course',
          topics: [
            { id: 'HSC-01', name: 'One', points: [] },
            { id: 'HSC-02', name: 'Two', points: [] },
          ],
        },
      ],
    },
  })
  const bank = (name: string, syllabusId: string | undefined, questions: Question[]) => ({
    path: `bank/${name}.json`,
    data: {
      formatVersion: '1',
      type: 'klunk_bank' as const,
      ...(syllabusId === undefined ? {} : { syllabusId }),
      questions,
    },
  })

  return {
    profiles: [{ path: 'profiles/test.json', data: designProfile }],
    syllabuses: [
      syllabus('nsw-hsc-design-technology', 'Design and Technology'),
      syllabus('nsw-hsc-textiles-and-design', 'Textiles and Design'),
    ],
    banks: [
      bank('design', 'nsw-hsc-design-technology', [mc('dt-mc'), written('dt-written', 15)]),
      bank('textiles', 'nsw-hsc-textiles-and-design', [written('tex-written', 15)]),
      bank('loose', undefined, [written('loose-written', 15)]),
    ],
    papers: [],
    problems: [],
    scanned: 5,
    pdfs: [],
    docx: [],
    workbooks: [],
    schools: [],
    manifest: emptyManifest(),
    images: new Map(),
  }
}

/**
 * One subject across two years, which is the ordinary shape of a 7-10 syllabus
 * and of every Stage 6 one: `courses` is already plural and already carries it.
 *
 * The two years number their topics from one apiece, so the tags cannot tell
 * them apart any more than two subjects' could. The course a question names is
 * the only thing that can, and a question naming none stays visible for the
 * reason `inSyllabus` gives one level up (#47).
 */
function twoYears(): ContentIndex {
  const inCourse = (q: Question, courseId?: string): Question => ({
    ...q,
    syllabus: { ...q.syllabus, syllabusId: 'nsw-science-7-10', ...(courseId ? { courseId } : {}) },
  })

  return {
    profiles: [{ path: 'profiles/test.json', data: scienceProfile }],
    syllabuses: [
      {
        path: 'syllabus/nsw-science-7-10.json',
        data: {
          formatVersion: '1',
          type: 'klunk_syllabus',
          id: 'nsw-science-7-10',
          name: 'Science 7-10',
          framework: 'nsw',
          courses: [
            { id: 'y9', name: 'Year 9', topics: [{ id: 'Y9-01', name: 'One', points: [] }] },
            { id: 'y10', name: 'Year 10', topics: [{ id: 'Y10-01', name: 'One', points: [] }] },
          ],
        },
      },
    ],
    banks: [
      {
        path: 'bank/science.json',
        data: {
          formatVersion: '1',
          type: 'klunk_bank',
          syllabusId: 'nsw-science-7-10',
          questions: [
            inCourse(written('y9-written', 15), 'y9'),
            inCourse(written('y10-written', 15), 'y10'),
            // Tagged to the subject and to no year, which every question
            // written before this field existed is.
            inCourse(written('untagged-written', 15)),
          ],
        },
      },
    ],
    papers: [],
    problems: [],
    scanned: 3,
    pdfs: [],
    docx: [],
    workbooks: [],
    schools: [],
    manifest: emptyManifest(),
    images: new Map(),
  }
}

describe('pickableQuestions, by course', () => {
  const y9Profile: Profile = { ...scienceProfile, courseId: 'y9' }

  it('offers only the year the paper is for', () => {
    const ids = pickableQuestions(
      twoYears(),
      newPaper(y9Profile, 'p1', 'Test'),
      written15,
      y9Profile.syllabusId,
      y9Profile.courseId,
    ).map((r) => r.question.id)

    // Year 10's question is gone. The one naming no year stays: all that is
    // known about it is a bare topic id, and hiding a question a teacher tagged
    // is worse than showing one they did not mean.
    expect(ids).toEqual(['y9-written', 'untagged-written'])
  })

  it('offers every year when the profile names no course', () => {
    const ids = pickableQuestions(
      twoYears(),
      newPaper(scienceProfile, 'p1', 'Test'),
      written15,
      scienceProfile.syllabusId,
      undefined,
    ).map((r) => r.question.id)

    // Which is the fault #49 was filed about, and is correct here: the profile
    // does not say, so nothing can be decided. The builder says so on screen.
    expect(ids).toEqual(['y9-written', 'y10-written', 'untagged-written'])
  })
})

describe('checkPaper, on a question from another course', () => {
  const y9Profile: Profile = { ...scienceProfile, courseId: 'y9' }

  const warnings = (profile: Profile, questionId: string): string[] => {
    const paper = addRef(newPaper(profile, 'p1', 'Test'), 1, `bank/science.json#${questionId}`)
    return checkPaper(resolvePaper(twoYears(), paper, profile))
      .filter((c) => c.severity === 'warning')
      .map((c) => c.message)
  }

  it('names both courses, and by name rather than by id', () => {
    expect(warnings(y9Profile, 'y10-written')).toContain(
      'Question 1 is for Year 10, and this paper is for Year 9',
    )
  })

  it('says nothing about a question for the right course', () => {
    expect(warnings(y9Profile, 'y9-written')).not.toContainEqual(
      expect.stringContaining('this paper is for'),
    )
  })

  it('says nothing about a question that names no course', () => {
    // Same reading as the filter. A question naming no course is not wrong, and
    // a warning a teacher learns to ignore is worse than no warning (#44).
    expect(warnings(y9Profile, 'untagged-written')).not.toContainEqual(
      expect.stringContaining('this paper is for'),
    )
  })

  it('says nothing when the profile names no course', () => {
    expect(warnings(scienceProfile, 'y10-written')).not.toContainEqual(
      expect.stringContaining('this paper is for'),
    )
  })
})

/**
 * Klunk prints whatever a paper references, so this is the one place in the app
 * where offering the wrong subject's question reaches a student.
 */
describe('pickableQuestions', () => {
  const paper = newPaper(designProfile, 'p1', 'Test')

  it('offers only the subject the paper assesses', () => {
    const ids = pickableQuestions(twoSubjects(), paper, written15, designProfile.syllabusId).map(
      (r) => r.question.id,
    )

    // The Textiles question is gone; the untagged one stays, because nothing
    // about it rules it out.
    expect(ids).toEqual(['dt-written', 'loose-written'])
  })

  it('offers everything when the profile names no syllabus', () => {
    // Nothing can be decided, so nothing is narrowed. The builder says as much
    // on screen rather than filtering on a guess.
    const ids = pickableQuestions(twoSubjects(), paper, written15, undefined).map(
      (r) => r.question.id,
    )
    expect(ids).toEqual(['dt-written', 'tex-written', 'loose-written'])
  })

  it('still keeps the section to its own question types', () => {
    const ids = pickableQuestions(
      twoSubjects(),
      paper,
      designProfile.paper.sections[0],
      designProfile.syllabusId,
    ).map((r) => r.question.id)
    expect(ids).toEqual(['dt-mc'])
  })

  it('drops a question already somewhere on the paper', () => {
    const used = addRef(paper, 1, 'bank/design.json#dt-written')
    const ids = pickableQuestions(twoSubjects(), used, written15, designProfile.syllabusId).map(
      (r) => r.question.id,
    )
    expect(ids).toEqual(['loose-written'])
  })
})

/**
 * The picker cannot help a paper built before it filtered, or one whose file
 * was edited by hand. This is the last look before printing.
 */
describe('checkPaper against another subject', () => {
  const foreign = () => {
    const index = twoSubjects()
    let paper = newPaper(designProfile, 'p1', 'Test')
    paper = addRef(paper, 1, 'bank/textiles.json#tex-written')
    return { index, paper }
  }

  it('warns, naming both subjects rather than their ids', () => {
    const { index, paper } = foreign()
    const checks = checkPaper(resolvePaper(index, paper, designProfile))
    const warning = checks.find((c) => c.message.includes('belongs to'))

    expect(warning?.severity).toBe('warning')
    expect(warning?.message).toBe(
      'Question 1 belongs to Textiles and Design, not Design and Technology',
    )
    expect(warning?.where).toBe('Section II')
  })

  it('falls back to the id when that model is not in the folder', () => {
    const { index, paper } = foreign()
    // Ordinary: Klunk ships no syllabus models, so a bank can name one the
    // teacher has not generated.
    index.syllabuses = []
    const warning = checkPaper(resolvePaper(index, paper, designProfile)).find((c) =>
      c.message.includes('belongs to'),
    )
    expect(warning?.message).toContain('nsw-hsc-textiles-and-design')
  })

  it('warns when a tag names nothing in the syllabus any more', () => {
    const index = twoSubjects()
    // What a re-read over a corrected model does: the id the question was tagged
    // with is not in the new one.
    const dt = index.syllabuses[0]!.data.courses[0]!
    dt.topics = dt.topics.filter((t) => t.id !== 'HSC-01')

    let paper = newPaper(designProfile, 'p1', 'Test')
    paper = addRef(paper, 0, 'bank/design.json#dt-mc')
    const warning = checkPaper(resolvePaper(index, paper, designProfile)).find((c) =>
      c.message.includes('not in'),
    )

    expect(warning?.severity).toBe('warning')
    expect(warning?.message).toBe(
      'Question 1 is tagged HSC-01, which is not in Design and Technology any more, so it will not show in coverage',
    )
  })

  it('says nothing about a tag when that model is not in the folder', () => {
    const index = twoSubjects()
    index.syllabuses = []
    let paper = newPaper(designProfile, 'p1', 'Test')
    paper = addRef(paper, 0, 'bank/design.json#dt-mc')
    const checks = checkPaper(resolvePaper(index, paper, designProfile))
    expect(checks.find((c) => c.message.includes('not in'))).toBeUndefined()
  })

  it('says nothing when the profile names no syllabus', () => {
    const { index, paper } = foreign()
    const checks = checkPaper(resolvePaper(index, paper, profile))
    expect(checks.some((c) => c.message.includes('belongs to'))).toBe(false)
  })

  it('says nothing about a question that names no syllabus', () => {
    const index = twoSubjects()
    let paper = newPaper(designProfile, 'p1', 'Test')
    paper = addRef(paper, 1, 'bank/loose.json#loose-written')

    const checks = checkPaper(resolvePaper(index, paper, designProfile))
    expect(checks.some((c) => c.message.includes('belongs to'))).toBe(false)
  })
})

/**
 * Why the builder must never aim at a section the paper does not have.
 *
 * `addRef` rewrites the section whose index matches and there is none, so the
 * paper comes back equal to the one that went in: the question is not added,
 * nothing is raised, and `paperIsDirty` says nothing changed, which is true.
 * That is defensible for a pure function and unusable as a button, so the range
 * is the caller's to hold — see the clamp in `src/builder.tsx`.
 */
describe('addRef out of range', () => {
  it('returns the paper unchanged, silently', () => {
    const paper = newPaper(profile, 'p1', 'Test')
    const after = addRef(paper, 7, 'bank/test.json#a')

    expect(after.sections.flatMap((s) => s.refs)).toEqual([])
    expect(paperIsDirty(indexWith([mc('a')]), after)).toBe(
      paperIsDirty(indexWith([mc('a')]), paper),
    )
  })
})

describe('rowAnswers', () => {
  const row = {
    label: 'Chopping board',
    cells: [{ answers: ['High density polyethylene', 'HDPE'] }, { answers: ['Non-porous'] }],
    marks: 2,
  }

  it('gives each answer column its own answers', () => {
    // The whole point of the shape: these two must not be the same string.
    expect(rowAnswers(row, 0)).toEqual(['High density polyethylene', 'HDPE'])
    expect(rowAnswers(row, 1)).toEqual(['Non-porous'])
  })

  it('is empty for a column the row has no cell for', () => {
    expect(rowAnswers(row, 2)).toEqual([])
    expect(rowAnswers({ label: 'A' }, 0)).toEqual([])
  })

  it('keeps an empty middle cell in its place', () => {
    // A gap is positional. Collapsing it would slide the third column's
    // answers into the second, which is a wrong marking guide, silently.
    const gapped = { label: 'A', cells: [{}, { answers: ['Third column'] }] }
    expect(rowAnswers(gapped, 0)).toEqual([])
    expect(rowAnswers(gapped, 1)).toEqual(['Third column'])
  })
})

describe('shuffledChoices', () => {
  it('is stable across calls, so the guide matches the paper', () => {
    const q = mc('stable')
    const first = shuffledChoices(q)
    for (let i = 0; i < 50; i += 1) {
      const again = shuffledChoices(q)
      expect(again.choices.map((c) => c.text)).toEqual(first.choices.map((c) => c.text))
      expect(again.correctIndex).toBe(first.correctIndex)
    }
  })

  it('keeps pointing at the originally correct option', () => {
    for (const id of ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h']) {
      const q = mc(id)
      const { choices, correctIndex } = shuffledChoices(q)
      expect(choices[correctIndex]?.text).toBe('gamma')
    }
  })

  it('actually reorders at least some questions', () => {
    const reordered = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'].filter((id) => {
      const { choices } = shuffledChoices(mc(id))
      return choices[0]?.text !== 'alpha'
    })
    expect(reordered.length).toBeGreaterThan(0)
  })

  it('leaves order alone when shuffle is off', () => {
    const q = mc('fixed')
    q.config = { ...q.config, shuffle: false }
    const { choices, correctIndex } = shuffledChoices(q)
    expect(choices.map((c) => c.text)).toEqual(['alpha', 'beta', 'gamma', 'delta'])
    expect(correctIndex).toBe(2)
  })

  it('does not renumber one question when another is added', () => {
    const before = shuffledChoices(mc('keep'))
    // Adding unrelated questions must not disturb this one, because the seed is
    // the question's own id and nothing positional.
    shuffledChoices(mc('new-one'))
    shuffledChoices(mc('new-two'))
    const after = shuffledChoices(mc('keep'))
    expect(after.choices.map((c) => c.text)).toEqual(before.choices.map((c) => c.text))
  })
})

/*
 * Both new types shuffle a lettered column and carry an answer that points into
 * it, so the answer has to move with it. A remap that is off by one prints a
 * marking guide that is wrong and looks entirely reasonable, which is the
 * failure mode this whole file exists for.
 */
describe('shuffledResponses', () => {
  const mr = (id: string, correctAnswers?: number[]): Question => ({
    id,
    questionType: 'multiple_response',
    questionText: 'Which of these are video formats?',
    marks: 1,
    config: {
      choices: [
        { text: 'WAV' },
        { text: 'MOV' },
        { text: 'PNG' },
        { text: 'MP3' },
        { text: 'MP4' },
        { text: 'MIDI' },
      ],
      ...(correctAnswers ? { correctAnswers } : {}),
    },
  })

  it('keeps pointing at the options that were the answers', () => {
    for (const id of ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h']) {
      const { choices, correctIndexes } = shuffledResponses(mr(id, [1, 4]))
      expect(correctIndexes.map((i) => choices[i]?.text).sort()).toEqual(['MOV', 'MP4'])
    }
  })

  it('is stable across calls', () => {
    const q = mr('stable', [1, 4])
    const first = shuffledResponses(q)
    for (let i = 0; i < 20; i += 1) {
      const again = shuffledResponses(q)
      expect(again.choices.map((c) => c.text)).toEqual(first.choices.map((c) => c.text))
      expect(again.correctIndexes).toEqual(first.correctIndexes)
    }
  })

  it('reports answers as unknown when none are recorded, not as an empty set', () => {
    const unknown = shuffledResponses(mr('none'))
    expect(unknown.known).toBe(false)
    expect(unknown.correctIndexes).toEqual([])

    // Same empty array, opposite meaning, and the guide prints them
    // differently. Nothing may collapse the two.
    const stated = shuffledResponses(mr('some', [0]))
    expect(stated.known).toBe(true)
  })

  it('reorders at least some questions', () => {
    const moved = ['a', 'b', 'c', 'd'].filter(
      (id) => shuffledResponses(mr(id, [0])).choices[0]?.text !== 'WAV',
    )
    expect(moved.length).toBeGreaterThan(0)
  })
})

describe('shuffledMatching', () => {
  const matching = (id: string, matches = true): Question => ({
    id,
    questionType: 'matching',
    questionText: 'Match the media type with its file format.',
    marks: 1,
    config: {
      items: [
        { text: 'Text', ...(matches ? { matches: [4] } : {}) },
        { text: 'Image', ...(matches ? { matches: [5] } : {}) },
        { text: 'Video', ...(matches ? { matches: [2] } : {}) },
        { text: 'Audio', ...(matches ? { matches: [0] } : {}) },
      ],
      options: [
        { text: 'MP3' },
        { text: 'SWF' },
        { text: 'MP4' },
        { text: 'ZIP' },
        { text: 'TXT' },
        { text: 'PNG' },
      ],
    },
  })

  it('gives each item the letter its own option ended up with', () => {
    const wanted = { Text: 'TXT', Image: 'PNG', Video: 'MP4', Audio: 'MP3' }
    for (const id of ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h']) {
      const { items, options } = shuffledMatching(matching(id))
      items.forEach((item) => {
        const letter = item.letters[0]
        expect(letter).toBeDefined()
        const at = (letter as string).charCodeAt(0) - 65
        expect(options[at]?.text).toBe(wanted[item.text as keyof typeof wanted])
      })
    }
  })

  it("leaves the numbered column in the teacher's own order", () => {
    // Only the letters move. The numbers carry the question's sense.
    for (const id of ['a', 'b', 'c', 'd']) {
      expect(shuffledMatching(matching(id)).items.map((i) => i.text)).toEqual([
        'Text',
        'Image',
        'Video',
        'Audio',
      ])
    }
  })

  it('carries an item linked to more than one option', () => {
    const q = matching('many')
    q.config = {
      ...q.config,
      items: [
        { text: 'Compressed', matches: [3, 1] },
        { text: 'Audio', matches: [0] },
      ],
    }
    const { items, options } = shuffledMatching(q)
    const letters = items[0]?.letters ?? []
    expect(letters).toHaveLength(2)
    expect(letters.map((l) => options[l.charCodeAt(0) - 65]?.text).sort()).toEqual(['SWF', 'ZIP'])
  })

  it('reports links as unknown when none are recorded', () => {
    expect(shuffledMatching(matching('bare', false)).known).toBe(false)
    expect(shuffledMatching(matching('keyed')).known).toBe(true)
  })

  it('is stable across calls, and reorders at least some questions', () => {
    const q = matching('stable')
    expect(shuffledMatching(q).options).toEqual(shuffledMatching(q).options)
    const moved = ['a', 'b', 'c', 'd'].filter(
      (id) => shuffledMatching(matching(id)).options[0]?.text !== 'MP3',
    )
    expect(moved.length).toBeGreaterThan(0)
  })
})

describe('editing', () => {
  it('moves a question and leaves the others in order', () => {
    const { paper } = goodPaper()
    const moved = moveRef(paper, 0, 0, 1)
    expect(moved.sections[0]?.refs.slice(0, 2)).toEqual(['bank/test.json#b', 'bank/test.json#a'])
  })

  it('refuses to move past the ends', () => {
    const { paper } = goodPaper()
    expect(moveRef(paper, 0, 0, -1)).toEqual(paper)
    expect(moveRef(paper, 0, 4, 1)).toEqual(paper)
  })

  it('never mutates the paper it was given', () => {
    const { paper } = goodPaper()
    const snapshot = JSON.stringify(paper)
    addRef(paper, 0, 'bank/test.json#z')
    removeRef(paper, 0, 0)
    moveRef(paper, 0, 0, 1)
    expect(JSON.stringify(paper)).toBe(snapshot)
  })
})

describe('surviving a moved or renamed bank', () => {
  it('recovers a question when the bank moved to another folder', () => {
    const { index, paper } = goodPaper()
    // The teacher reorganised: bank/test.json is now archive/2026/test.json.
    const moved: ContentIndex = {
      ...index,
      banks: [{ path: 'archive/2026/test.json', data: index.banks[0]!.data }],
    }
    const resolved = resolvePaper(moved, paper, profile)
    expect(resolved.missing).toEqual([])
    expect(resolved.totalMarks).toBe(20)
    expect(resolved.relocated.length).toBeGreaterThan(0)
    // Recovered, and said so, rather than silently or not at all.
    const checks = checkPaper(resolved)
    expect(
      checks.some((c) => c.severity === 'warning' && c.message.includes('archive/2026/test.json')),
    ).toBe(true)
    expect(checks.filter((c) => c.severity === 'error')).toEqual([])
  })

  it('recovers by unique question id when the file was renamed too', () => {
    const { index, paper } = goodPaper()
    const renamed: ContentIndex = {
      ...index,
      banks: [{ path: 'banks/design-and-technology.json', data: index.banks[0]!.data }],
    }
    const resolved = resolvePaper(renamed, paper, profile)
    expect(resolved.missing).toEqual([])
    expect(resolved.relocated.length).toBe(6)
  })

  it('refuses to guess when the same id exists in two banks', () => {
    const { index, paper } = goodPaper()
    const ambiguous: ContentIndex = {
      ...index,
      banks: [
        { path: 'one/renamed.json', data: index.banks[0]!.data },
        { path: 'two/renamed.json', data: index.banks[0]!.data },
      ],
    }
    const resolved = resolvePaper(ambiguous, paper, profile)
    // Two banks share the basename and the ids, so there is no single right
    // answer. Reporting it broken beats printing the wrong question.
    expect(resolved.missing.length).toBeGreaterThan(0)
  })

  it('prefers the exact path when it still resolves', () => {
    const { index, paper } = goodPaper()
    const withDecoy: ContentIndex = {
      ...index,
      banks: [...index.banks, { path: 'elsewhere/test.json', data: index.banks[0]!.data }],
    }
    const resolved = resolvePaper(withDecoy, paper, profile)
    expect(resolved.relocated).toEqual([])
    expect(resolved.sections[0]?.questions[0]?.file).toBe('bank/test.json')
  })
})

describe('paperIsDirty', () => {
  /** The folder as it looks once this paper has been written to it. */
  const savedAs = (index: ContentIndex, paper: Paper): ContentIndex => ({
    ...index,
    papers: [{ path: `papers/${paper.id}.json`, data: paper }],
  })

  it('calls a paper that has never been saved changed', () => {
    const { index, paper } = goodPaper()
    expect(paperIsDirty(index, paper)).toBe(true)
    expect(paperIsSaved(index, paper)).toBe(false)
  })

  it('calls a paper that matches the folder unchanged', () => {
    const { index, paper } = goodPaper()
    const after = savedAs(index, paper)
    expect(paperIsDirty(after, paper)).toBe(false)
    expect(paperIsSaved(after, paper)).toBe(true)
  })

  it('notices the status change that makes the reuse warning work', () => {
    const { index, paper } = goodPaper()
    const after = savedAs(index, paper)
    // The case from #11: marking a paper as sat is what warns other papers off
    // its questions, and it does nothing at all until it reaches the file.
    expect(paperIsDirty(after, { ...paper, status: 'used' })).toBe(true)
  })

  it('notices a question added, removed or moved', () => {
    const { index, paper } = goodPaper()
    const after = savedAs(index, paper)
    expect(paperIsDirty(after, addRef(paper, 1, 'bank/test.json#g'))).toBe(true)
    expect(paperIsDirty(after, removeRef(paper, 0, 0))).toBe(true)
    expect(paperIsDirty(after, moveRef(paper, 0, 0, 1))).toBe(true)
  })

  it('survives a file whose keys a teacher reordered by hand', () => {
    const { index, paper } = goodPaper()
    // Nothing stops a teacher opening papers/p1.json in an editor. Key order is
    // not part of what a paper says, so a reordered file is not a change — and
    // an indicator that says otherwise can never be cleared.
    const reordered = Object.fromEntries(Object.entries(paper).reverse()) as unknown as Paper
    expect(paperIsDirty(savedAs(index, reordered), paper)).toBe(false)
  })

  it('does not mistake an absent optional field for a changed one', () => {
    const { index, paper } = goodPaper()
    // In memory an untouched optional is `undefined`; in the file it is absent.
    // JSON.stringify drops it on the way out, so the two must compare equal.
    const onDisk = { ...paper }
    delete (onDisk as { note?: string }).note
    expect(paperIsDirty(savedAs(index, onDisk), { ...paper, note: undefined } as Paper)).toBe(false)
  })

  it('still notices a change buried in a section', () => {
    const { index, paper } = goodPaper()
    const after = savedAs(index, paper)
    const retitled: Paper = {
      ...paper,
      sections: paper.sections.map((s, i) => (i === 1 ? { ...s, title: 'Part B' } : s)),
    }
    expect(paperIsDirty(after, retitled)).toBe(true)
  })
})
