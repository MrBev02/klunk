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
import { emptyManifest } from './manifest'
import { addRef, newPaper, resolvePaper } from './paper'
import type { ContentIndex } from './storage'
import type { Bank, Profile, Question, Syllabus } from './types'

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
