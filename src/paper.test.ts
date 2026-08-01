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
} from './paper'
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
    images: new Map(),
  }
}

/** A paper that satisfies the profile exactly. */
function goodPaper(): { index: ContentIndex; paper: Paper } {
  const questions = [
    ...['a', 'b', 'c', 'd', 'e'].map((id) => mc(id)),
    written('f', 15),
  ]
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
        i === 1 ? { ...s, refs: [{ file: 'bank/test.json', questionId: 'f', marksOverride: 10 }] } : s,
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
  const syllabus = (id: string, name: string): { path: string; data: Syllabus } => ({
    path: `syllabus/${id}.json`,
    data: { formatVersion: '1', type: 'klunk_syllabus', id, name, framework: 'nsw', courses: [] },
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
    images: new Map(),
  }
}

/**
 * Klunk prints whatever a paper references, so this is the one place in the app
 * where offering the wrong subject's question reaches a student.
 */
describe('pickableQuestions', () => {
  const paper = newPaper(designProfile, 'p1', 'Test')

  it('offers only the subject the paper assesses', () => {
    const ids = pickableQuestions(
      twoSubjects(),
      paper,
      written15,
      designProfile.syllabusId,
    ).map((r) => r.question.id)

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
    const ids = pickableQuestions(
      twoSubjects(),
      used,
      written15,
      designProfile.syllabusId,
    ).map((r) => r.question.id)
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

describe('rowAnswers', () => {
  const row = {
    label: 'Chopping board',
    cells: [
      { answers: ['High density polyethylene', 'HDPE'] },
      { answers: ['Non-porous'] },
    ],
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

describe('editing', () => {
  it('moves a question and leaves the others in order', () => {
    const { paper } = goodPaper()
    const moved = moveRef(paper, 0, 0, 1)
    expect(moved.sections[0]?.refs.slice(0, 2)).toEqual([
      'bank/test.json#b',
      'bank/test.json#a',
    ])
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
    expect(checks.some((c) => c.severity === 'warning' && c.message.includes('archive/2026/test.json'))).toBe(true)
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
    const reordered = Object.fromEntries(
      Object.entries(paper).reverse(),
    ) as unknown as Paper
    expect(paperIsDirty(savedAs(index, reordered), paper)).toBe(false)
  })

  it('does not mistake an absent optional field for a changed one', () => {
    const { index, paper } = goodPaper()
    // In memory an untouched optional is `undefined`; in the file it is absent.
    // JSON.stringify drops it on the way out, so the two must compare equal.
    const onDisk = { ...paper }
    delete (onDisk as { note?: string }).note
    expect(paperIsDirty(savedAs(index, onDisk), { ...paper, note: undefined } as Paper)).toBe(
      false,
    )
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
