/**
 * Tests for an exam written out whole and read back.
 *
 * The rule this file exists to hold is that reading a paper back never touches
 * a question that already exists. Everything else here is the reply being wrong
 * in a way a model has actually been wrong: no envelope, sections renamed, a
 * section dropped, an id invented, a question of the type the section does not
 * take. What is tested is not that Klunk copes but that when it copes it says
 * so, and that what it writes is a paper of references rather than a copy.
 *
 * The writing side is tested against what the reading side does with it, not
 * against a string: the two are a pair, and a sample a model cannot answer in
 * the shape the reader wants is the only way this feature fails quietly.
 */

import { describe, expect, it } from 'vitest'
import { asExamJson, examPaper, readExam, type ExamContext } from './exam'
import { emptyManifest } from './manifest'
import { addRef, newPaper, resolvePaper } from './paper'
import type { ContentIndex } from './storage'
import type { Bank, Paper, Profile, Question } from './types'

const profile: Profile = {
  formatVersion: '1',
  type: 'klunk_profile',
  id: 'test',
  name: 'Test paper',
  syllabusId: 'nsw-hsc-design-technology',
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
        questionTypes: ['extended_response'],
        questionCount: 1,
      },
    ],
  },
}

function ctx(over: Partial<ExamContext> = {}): ExamContext {
  return {
    bankPath: 'bank/questions.json',
    inFolder: new Set<string>(),
    inBank: new Set<string>(),
    syllabusId: 'nsw-hsc-design-technology',
    courseId: 'hsc',
    topicIds: ['HSC-01'],
    points: [
      { id: 'HSC-01.06', topicId: 'HSC-01' },
      { id: 'HSC-01.07', topicId: 'HSC-01' },
    ],
    outcomes: ['H1.1'],
    profile,
    ...over,
  }
}

/** A reply of the shape the prompt asks for, with anything overridden. */
function reply(over: Record<string, unknown> = {}): string {
  return JSON.stringify({
    sections: [
      {
        name: 'Section I',
        questions: [
          {
            questionType: 'multiple_choice',
            questionText: 'Which factor matters most when choosing a handle material?',
            marks: 1,
            syllabus: { pointIds: ['HSC-01.06'] },
            config: {
              choices: [
                { text: 'Grip', feedback: 'Correct.' },
                { text: 'Colour', feedback: 'Appearance is not the deciding factor.' },
                { text: 'Price', feedback: 'Cost follows the choice rather than making it.' },
                { text: 'Weight', feedback: 'Relevant but secondary to grip.' },
              ],
              correctAnswer: 0,
            },
          },
        ],
      },
      {
        name: 'Section II',
        questions: [
          {
            questionType: 'extended_response',
            questionText: 'Analyse the effect of material choice on the life of a product.',
            marks: 15,
            syllabus: { pointIds: ['HSC-01.07'] },
            markingGuide: {
              criteria: [
                { marks: 13, marksTo: 15, description: 'Sustains an argument throughout.' },
                { marks: 1, marksTo: 12, description: 'Makes some relevant points.' },
              ],
            },
          },
        ],
      },
    ],
    ...over,
  })
}

/* --------------------------------------------------------------------- writing */

function mc(id: string): Question {
  return {
    id,
    questionType: 'multiple_choice',
    questionText: `Question ${id}`,
    marks: 1,
    syllabus: { syllabusId: 'nsw-hsc-design-technology', courseId: 'hsc', pointIds: ['HSC-01.06'] },
    source: { origin: 'extracted', paper: '2019 HSC', year: 2019, questionNumber: '24' },
    stimulus: [{ kind: 'image', file: 'plates/fig1.png' }],
    config: {
      choices: [{ text: 'a' }, { text: 'b' }, { text: 'c' }, { text: 'd' }],
      correctAnswer: 1,
    },
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

function sample(): { index: ContentIndex; paper: Paper } {
  const index = indexWith([mc('a')])
  const paper = addRef(newPaper(profile, 'p1', 'Trial 2025'), 0, 'bank/test.json#a')
  return { index, paper }
}

describe('asExamJson', () => {
  it('writes the sections and their questions whole', () => {
    const { index, paper } = sample()
    const written = JSON.parse(asExamJson(resolvePaper(index, paper, profile), 'D&T, Year 12'))

    expect(written.title).toBe('Trial 2025')
    expect(written.course).toBe('D&T, Year 12')
    expect(written.sections).toHaveLength(2)
    expect(written.sections[0].name).toBe('Section I')
    expect(written.sections[0].questions[0].questionText).toBe('Question a')
    expect(written.sections[0].questions[0].config.correctAnswer).toBe(1)
  })

  it('sends no provenance, no ids and no picture', () => {
    const { index, paper } = sample()
    const written = JSON.parse(asExamJson(resolvePaper(index, paper, profile)))
    const question = written.sections[0].questions[0]

    // The three the conventions forbid a model to reproduce or invent. A sample
    // carrying "2019 HSC question 24" hands it the one thing it must not copy,
    // and an id it is shown is an id it will send back.
    expect(question.source).toBeUndefined()
    expect(question.id).toBeUndefined()
    expect(question.syllabus.syllabusId).toBeUndefined()
    // An image it cannot fetch, and a sample carrying one teaches it to try.
    expect(question.stimulus).toBeUndefined()
  })

  it('is answerable in the shape the reader wants', () => {
    // The pair, tested as a pair. A sample whose questions do not read back is
    // the failure this whole file is here to catch, and it would be invisible
    // in either half on its own.
    const { index, paper } = sample()
    const written = asExamJson(resolvePaper(index, paper, profile))
    const read = readExam(written, ctx())

    expect(read.failure).toBeUndefined()
    expect(read.sections[0]?.drafts[0]?.question.questionText).toBe('Question a')
    expect(read.sections[0]?.drafts[0]?.question.config?.correctAnswer).toBe(1)
  })
})

/* --------------------------------------------------------------------- reading */

describe('readExam', () => {
  it('reads the sections the prompt asked for', () => {
    const read = readExam(reply(), ctx())
    expect(read.failure).toBeUndefined()
    expect(read.sections.map((s) => s.name)).toEqual(['Section I', 'Section II'])
    expect(read.sections.map((s) => s.profileSectionId)).toEqual(['I', 'II'])
    expect(read.sections[1]?.drafts[0]?.question.marks).toBe(15)
  })

  it('stamps the syllabus and course itself rather than taking them', () => {
    const q = readExam(reply(), ctx()).sections[0]?.drafts[0]?.question
    expect(q?.syllabus?.syllabusId).toBe('nsw-hsc-design-technology')
    expect(q?.syllabus?.courseId).toBe('hsc')
    expect(q?.tags).toContain('ai-drafted')
  })

  it('gives every question an id of its own, whatever the reply claimed', () => {
    const claimed = JSON.parse(reply()) as { sections: { questions: Record<string, unknown>[] }[] }
    for (const section of claimed.sections) {
      for (const q of section.questions) q.id = 'ex-mc-01'
    }
    const read = readExam(JSON.stringify(claimed), ctx({ inFolder: new Set(['ex-mc-01']) }))
    const ids = read.sections.flatMap((s) => s.drafts.map((d) => d.question.id))

    expect(ids).not.toContain('ex-mc-01')
    expect(new Set(ids).size).toBe(ids.length)
    expect(read.sections[0]?.drafts[0]?.repairs.join(' ')).toContain('ex-mc-01')
  })

  it('finds the sections when the model dropped the object around them', () => {
    const bare = JSON.stringify(JSON.parse(reply()).sections)
    const read = readExam(bare, ctx())
    expect(read.sections).toHaveLength(2)
    expect(read.notes.join(' ')).toContain('without an object around them')
  })

  it('says so when the model returned questions and no sections at all', () => {
    const flat = JSON.stringify(JSON.parse(reply()).sections.flatMap((s: any) => s.questions))
    const read = readExam(flat, ctx())
    expect(read.sections).toHaveLength(1)
    expect(read.notes.join(' ')).toContain('no sections')
    // Unmatched, so the checker measures the paper against the profile rather
    // than this section being quietly credited with filling Section I.
    expect(read.sections[0]?.profileSectionId).toBeUndefined()
  })

  it('matches a renamed section by position and keeps the name it was given', () => {
    const renamed = JSON.parse(reply())
    renamed.sections[0].name = 'Part A'
    const read = readExam(JSON.stringify(renamed), ctx())
    expect(read.sections[0]?.name).toBe('Part A')
    expect(read.sections[0]?.profileSectionId).toBe('I')
  })

  it('matches by name before position, so a dropped section does not shift the rest', () => {
    const short = { sections: JSON.parse(reply()).sections.slice(1) }
    const read = readExam(JSON.stringify(short), ctx())
    expect(read.sections[0]?.profileSectionId).toBe('II')
    expect(read.notes.join(' ')).toContain('2 sections and the reply has 1')
  })

  it('reports an entry that is not a question instead of dropping it', () => {
    const broken = JSON.parse(reply())
    broken.sections[0].questions.push({ marks: 1 })
    const read = readExam(JSON.stringify(broken), ctx())
    expect(read.sections[0]?.rejected[0]?.why).toContain('no question text')
    expect(read.sections[0]?.drafts).toHaveLength(1)
  })

  it('notices a question that departs from what its section asked for', () => {
    const wrong = JSON.parse(reply())
    wrong.sections[0].questions[0].marks = 3
    const read = readExam(JSON.stringify(wrong), ctx())
    // The section fixes one mark per question, so three is a departure worth
    // saying. The question is kept at what it says it is worth.
    expect(read.sections[0]?.drafts[0]?.repairs.join(' ')).toMatch(/3|asked/i)
  })

  it('claims no departure where the section fixed nothing to depart from', () => {
    const loose: Profile = {
      ...profile,
      paper: {
        ...profile.paper,
        sections: [
          { id: 'I', name: 'Section I', marks: 5, questionTypes: ['multiple_choice', 'table'] },
          { id: 'II', name: 'Section II', marks: 15 },
        ],
      },
    }
    const wrong = JSON.parse(reply())
    wrong.sections[0].questions[0].marks = 3
    const read = readExam(JSON.stringify(wrong), ctx({ profile: loose }))
    expect(read.sections[0]?.drafts[0]?.question.marks).toBe(3)
    expect(read.sections[0]?.drafts[0]?.repairs.join(' ')).not.toMatch(/asked for/i)
  })

  it('refuses a reply that is not a paper, rather than building an empty one', () => {
    expect(readExam('nothing here', ctx()).failure).toBeTruthy()
    expect(readExam('{"drafts": []}', ctx()).failure).toContain('no "sections"')
    expect(readExam('[]', ctx()).failure).toBeTruthy()
  })

  it('says so when the model wrote its own instructions for a section', () => {
    const withProfileInstructions: Profile = {
      ...profile,
      paper: {
        ...profile.paper,
        sections: profile.paper.sections.map((s, i) =>
          i === 0 ? { ...s, instructions: 'Use the answer sheet.' } : s,
        ),
      },
    }
    const rewritten = JSON.parse(reply())
    rewritten.sections[0].instructions = 'Answer all questions in the booklet.'
    const read = readExam(JSON.stringify(rewritten), ctx({ profile: withProfileInstructions }))
    expect(read.notes.join(' ')).toContain('Use the answer sheet.')
  })

  it('never hands two sections the same id', () => {
    const doubled = JSON.parse(reply())
    doubled.sections[1].questions = [...JSON.parse(reply()).sections[0].questions]
    const read = readExam(JSON.stringify(doubled), ctx())
    const ids = read.sections.flatMap((s) => s.drafts.map((d) => d.question.id))
    expect(new Set(ids).size).toBe(ids.length)
  })
})

/* -------------------------------------------------------------- the paper built */

describe('examPaper', () => {
  it('refers to the questions rather than copying them', () => {
    const read = readExam(reply(), ctx())
    const paper = examPaper(read, {
      id: 'trial-2026',
      title: 'Trial 2026',
      profileId: 'test',
      bankPath: 'bank/questions.json',
      writtenAs: (q) => q.id,
    })

    expect(paper.type).toBe('klunk_paper')
    expect(paper.profileId).toBe('test')
    expect(paper.sections).toHaveLength(2)
    expect(paper.sections[0]?.profileSectionId).toBe('I')
    for (const section of paper.sections) {
      for (const ref of section.refs) {
        expect(typeof ref).toBe('string')
        expect(String(ref).startsWith('bank/questions.json#')).toBe(true)
      }
    }
    // Nothing of the question itself is on the paper. This is the decision the
    // whole format turns on, so it is asserted rather than assumed.
    expect(JSON.stringify(paper)).not.toContain('Analyse the effect')
  })

  it('follows the id a question was actually written under', () => {
    // `saveQuestion` reassigns an id somebody else took while the reply was
    // being read. A paper built on the id Klunk first chose would point at
    // their question, which is the one way this can quietly go wrong.
    const read = readExam(reply(), ctx())
    const paper = examPaper(read, {
      id: 'p',
      title: 'P',
      bankPath: 'bank/questions.json',
      writtenAs: () => 'moved-01',
    })
    expect(paper.sections[0]?.refs).toEqual(['bank/questions.json#moved-01'])
  })

  it('leaves out a question that was not written, rather than referring to it', () => {
    const read = readExam(reply(), ctx())
    const paper = examPaper(read, {
      id: 'p',
      title: 'P',
      bankPath: 'bank/questions.json',
      writtenAs: (q) => (q.questionType === 'multiple_choice' ? undefined : q.id),
    })
    expect(paper.sections[0]?.refs).toEqual([])
    expect(paper.sections[1]?.refs).toHaveLength(1)
  })

  it('leaves a matched section inheriting its instructions from the profile', () => {
    const rewritten = JSON.parse(reply())
    rewritten.sections[0].instructions = 'Answer all questions in the booklet.'
    const read = readExam(JSON.stringify(rewritten), ctx())
    const paper = examPaper(read, {
      id: 'p',
      title: 'P',
      bankPath: 'bank/questions.json',
      writtenAs: (q) => q.id,
    })
    // A paper overrides a profile by stating its own (#106), and a model
    // echoing the instructions back is not the teacher stating anything.
    expect(paper.sections[0]?.instructions).toBeUndefined()
  })

  it('names an unmatched section on the paper, since no profile section will', () => {
    const flat = JSON.stringify(JSON.parse(reply()).sections.flatMap((s: any) => s.questions))
    const read = readExam(flat, ctx())
    const paper = examPaper(read, {
      id: 'p',
      title: 'P',
      bankPath: 'bank/questions.json',
      writtenAs: (q) => q.id,
    })
    expect(paper.sections[0]?.profileSectionId).toBeUndefined()
    expect(paper.sections[0]?.title).toBeTruthy()
  })
})
