/**
 * Tests for the prompt that asks for a whole paper.
 *
 * The thing worth holding here is that the ask stays exact. Drafting one type
 * at one mark value is what keeps a reply parseable, and a paper cannot be
 * asked for that way — so what replaces it is the profile, section by section.
 * A prompt that states a rule the profile does not hold, or that offers a type
 * the paper has no room for, has given the guard away without anything failing.
 */

import { describe, expect, it } from 'vitest'
import { buildExamPrompt, typesUsed, type ExamPromptSpec } from './examprompt'
import { readExam } from './exam'
import { emptyManifest } from '../folder/manifest'
import { addRef, newPaper, resolvePaper } from '../papers/paper'
import type { ContentIndex } from '../folder/storage'
import type { Bank, Profile, Question, QuestionType, Syllabus } from '../shared/types'

const syllabus: Syllabus = {
  formatVersion: '1',
  type: 'klunk_syllabus',
  id: 'nsw-hsc-design-technology',
  name: 'Design and Technology',
  framework: 'nsw-stage-6',
  authority: 'NESA',
  courses: [
    {
      id: 'hsc',
      name: 'HSC Course',
      outcomes: [{ code: 'H1.1', text: 'critically analyses design.' }],
      topics: [
        {
          id: 'HSC-01',
          name: 'Designing and producing',
          outcomes: ['H1.1'],
          points: [
            { id: 'HSC-01.06', text: 'the work of designers' },
            { id: 'HSC-01.07', text: 'factors affecting design' },
          ],
        },
      ],
    },
  ],
}

const profile: Profile = {
  formatVersion: '1',
  type: 'klunk_profile',
  id: 'test',
  name: 'Test paper',
  syllabusId: syllabus.id,
  paper: {
    totalMarks: 40,
    sections: [
      {
        id: 'I',
        name: 'Section I',
        marks: 10,
        questionTypes: ['multiple_choice'],
        questionCount: 10,
        marksPerQuestion: 1,
        instructions: 'Use the answer sheet.',
      },
      {
        id: 'II',
        name: 'Section II',
        marks: 30,
        questionTypes: ['short_answer'],
        questionCount: 5,
      },
    ],
  },
}

function spec(over: Partial<ExamPromptSpec> = {}): ExamPromptSpec {
  const course = syllabus.courses[0]!
  return {
    syllabus,
    course,
    topics: course.topics ?? [],
    pointIds: ['HSC-01.06', 'HSC-01.07'],
    profile,
    title: 'Trial Examination',
    ...over,
  }
}

describe('buildExamPrompt', () => {
  it('states each section exactly as the profile holds it', () => {
    const prompt = buildExamPrompt(spec())
    expect(prompt).toContain('Section I')
    expect(prompt).toContain('Exactly 10 questions.')
    expect(prompt).toContain('Every question is worth exactly 1 mark.')
    expect(prompt).toContain('Use the answer sheet.')
    expect(prompt).toContain('40 marks in total, in 2 sections.')
  })

  it('says who chooses the marks where the profile does not fix them', () => {
    const prompt = buildExamPrompt(spec())
    expect(prompt).toContain('Choose the marks for each question yourself')
    expect(prompt).toContain('totals 30 marks')
    // And nowhere claims a per-question value for that section, which is the
    // rule a model would otherwise be held to and the checker would not.
    expect(prompt).not.toContain('their marks must total 30')
    expect(prompt).toContain('their marks must total the marks for the question')
  })

  it('offers only the types this paper has room for', () => {
    const prompt = buildExamPrompt(spec())
    expect(prompt).toContain('### A "multiple_choice" question')
    expect(prompt).toContain('### A "short_answer" question')
    expect(prompt).not.toContain('### A "drawing" question')
    expect(prompt).not.toContain('### A "matching" question')
  })

  it('lists the content point ids and forbids any other', () => {
    const prompt = buildExamPrompt(spec())
    expect(prompt).toContain('HSC-01.06')
    expect(prompt).toContain('Use no id that is not listed above.')
    expect(prompt).toContain('H1.1')
  })

  it('tells the model what Klunk fills in itself', () => {
    const prompt = buildExamPrompt(spec())
    expect(prompt).toContain('Leave out "id"')
    expect(prompt).toContain('Leave out "syllabusId" and "courseId"')
    expect(prompt).toContain('Leave out "title"')
  })

  it('sends no paper of the teacher’s unless one was given', () => {
    expect(buildExamPrompt(spec())).not.toContain("One of this school's own papers")
  })

  it('falls back to the shape of the sample where there is no profile', () => {
    const question: Question = {
      id: 'a',
      questionType: 'multiple_choice',
      questionText: 'Question a',
      marks: 1,
      config: { choices: [{ text: 'a' }, { text: 'b' }], correctAnswer: 0 },
    }
    const bank: Bank = { formatVersion: '1', type: 'klunk_bank', questions: [question] }
    const index: ContentIndex = {
      profiles: [],
      syllabuses: [syllabus].map((data) => ({ path: 'syllabus/s.json', data })),
      banks: [{ path: 'bank/test.json', data: bank }],
      papers: [],
      problems: [],
      scanned: 1,
      pdfs: [],
      docx: [],
      workbooks: [],
      schools: [],
      manifest: emptyManifest(),
      images: new Map(),
    }
    const paper = addRef(newPaper(profile, 'p', 'Last year'), 0, 'bank/test.json#a')
    const sample = resolvePaper(index, paper, undefined)

    const prompt = buildExamPrompt(spec({ profile: undefined, sample }))
    expect(prompt).toContain('There is no stored description of this examination')
    expect(prompt).toContain("One of this school's own papers, Last year")
    // The types come from what the sample actually used, since nothing else
    // says. Offering all eight would invite one the paper has no room for.
    expect(prompt).toContain('### A "multiple_choice" question')
    expect(prompt).not.toContain('### A "table" question')
  })

  it('tells the model the sample is not there to be reused', () => {
    const index: ContentIndex = {
      profiles: [],
      syllabuses: [],
      banks: [],
      papers: [],
      problems: [],
      scanned: 0,
      pdfs: [],
      docx: [],
      workbooks: [],
      schools: [],
      manifest: emptyManifest(),
      images: new Map(),
    }
    const sample = resolvePaper(index, newPaper(profile, 'p', 'Last year'), profile)
    const prompt = buildExamPrompt(spec({ sample }))
    expect(prompt).toContain('Do not reuse, reword or answer any of them')
  })
})

describe('typesUsed', () => {
  it('falls back to the three every examination has when nothing says', () => {
    expect(typesUsed({ profile: undefined, sample: undefined })).toEqual([
      'multiple_choice',
      'short_answer',
      'extended_response',
    ])
  })

  it('takes the profile over the sample, because the profile is what decides', () => {
    expect(typesUsed({ profile, sample: undefined })).toEqual(['multiple_choice', 'short_answer'])
  })
})

/**
 * The examples, read back by the thing that reads a real reply.
 *
 * Every other test here asserts what the prompt *says*. This one asserts that a
 * model doing exactly what it says produces a paper Klunk will accept, which is
 * the only claim that matters and the one #108 found false in the transcription
 * prompt. This prompt sets out several types at once and had no example of any
 * of them, so `table` was described and never demonstrated — the same fault one
 * step further back, since the description alone is what sent every real table
 * into "questionText" with no "columns" at all.
 *
 * It runs `readExam`, so the whole path a reply takes is under the test rather
 * than a literal measured against `validateQuestion`.
 */
describe('a reply that does exactly what the prompt says', () => {
  const everyType: Profile = {
    ...profile,
    paper: {
      totalMarks: 80,
      sections: (
        [
          'multiple_choice',
          'multiple_response',
          'matching',
          'true_false',
          'short_answer',
          'extended_response',
          'table',
          'drawing',
        ] as QuestionType[]
      ).map((type, at) => ({
        id: `S${at}`,
        name: `Section ${at + 1}`,
        marks: 10,
        questionTypes: [type],
        questionCount: 1,
      })),
    },
  }

  const prompt = buildExamPrompt(spec({ profile: everyType }))

  /** The filled-in question of each type, as the shape block prints them. */
  function examples(text: string): string[] {
    const shape = text.split('## The JSON to return')[1] ?? ''
    return shape
      .split('```json')
      .slice(1)
      .map((block) => block.split('```')[0] ?? '')
  }

  function readExamples() {
    const questions = examples(prompt)
    const reply = `{ "sections": [ { "name": "Section 1", "questions": [${questions.join(',')}] } ] }`
    return readExam(reply, {
      bankPath: 'bank/drafted.json',
      inFolder: new Set<string>(),
      inBank: new Set<string>(),
      topicIds: ['HSC-01'],
      points: [
        { id: 'HSC-01.06', topicId: 'HSC-01' },
        { id: 'HSC-01.07', topicId: 'HSC-01' },
      ],
      outcomes: ['H1.1'],
      profile: undefined,
    })
  }

  it('shows one example per type the paper uses, and none of the types it does not', () => {
    expect(examples(prompt)).toHaveLength(8)
    expect(examples(buildExamPrompt(spec())).length).toBe(2)
  })

  it('reads every example, rejecting none', () => {
    const out = readExamples()
    expect(out.failure).toBeUndefined()
    expect(out.sections[0]?.rejected).toEqual([])
    expect(out.sections[0]?.drafts).toHaveLength(8)
  })

  it('leaves no question in error, because an example must be a shape Klunk takes', () => {
    const errors = readExamples().sections.flatMap((s) =>
      s.drafts.flatMap((d) =>
        d.faults
          .filter((f) => f.severity === 'error')
          .map((f) => `${d.question.questionType}: ${f.message}`),
      ),
    )
    expect(errors).toEqual([])
  })

  it('gives the table question its columns and rows, not a stem full of headings (#108)', () => {
    const draft = readExamples().sections[0]?.drafts.find(
      (d) => d.question.questionType === 'table',
    )
    expect(draft, 'the shape block must demonstrate a table').toBeTruthy()

    const cfg = draft!.question.config ?? {}
    expect(cfg.columns).toHaveLength(3)
    expect(cfg.rows).toHaveLength(3)
    expect(cfg.rows?.[0]?.cells).toHaveLength(2)
    expect(draft!.question.questionText).not.toContain('|')
  })

  it('carries the teacher’s own ids, so a model copying the example copies theirs', () => {
    for (const block of examples(prompt)) {
      expect(block).not.toContain('HSC-17.02')
      if (block.includes('"pointIds"')) expect(block).toContain('HSC-01.06')
    }
  })

  it('says the examples are a shape and not a subject or a mark value', () => {
    expect(prompt).toContain('Their subject')
    expect(prompt).toContain('their marks are not the ask')
  })
})
