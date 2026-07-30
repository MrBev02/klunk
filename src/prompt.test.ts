/**
 * Tests for the prompt the teacher copies out.
 *
 * The prompt is the only thing standing between a syllabus and whatever comes
 * back, so what matters here is that it carries the ids the answer will be
 * checked against, that it never carries a point the teacher did not choose,
 * and that the parts a model reliably gets wrong are stated where it will read
 * them: a zero-based `correctAnswer`, bands rather than components on an
 * extended response, and no `id` at all.
 */

import { describe, expect, it } from 'vitest'
import { buildPrompt, marksGuidance, outcomesFor, plain, type PromptSpec } from './prompt'
import type { Profile, Question, Syllabus, SyllabusCourse } from './types'

const course: SyllabusCourse = {
  id: 'hsc',
  name: 'HSC course',
  outcomes: [
    { code: 'H1.1', text: 'critically analyses the factors affecting design' },
    { code: 'H4.2', text: 'evaluates the impact of design on society' },
    { code: 'H6.1', text: 'justifies a design project' },
  ],
  topics: [
    {
      id: 'HSC-01',
      name: 'factors affecting designing and producing',
      outcomes: ['H1.1'],
      points: [
        { id: 'HSC-01.06', text: 'ergonomics' },
        { id: 'HSC-01.07', text: 'work health and safety' },
        { id: 'HSC-01.08', text: 'quality' },
      ],
    },
    {
      id: 'HSC-13',
      name: 'selection of materials',
      outcomes: ['H4.2'],
      points: [{ id: 'HSC-13.01', text: 'properties of materials' }],
    },
  ],
}

const syllabus: Syllabus = {
  formatVersion: '1',
  type: 'klunk_syllabus',
  id: 'nsw-hsc-design-technology',
  name: 'Design and Technology',
  framework: 'NESA',
  authority: 'NSW Education Standards Authority',
  syllabusVersion: 'Stage 6 (2013)',
  courses: [course],
}

const profile: Profile = {
  formatVersion: '1',
  type: 'klunk_profile',
  id: 'nsw-hsc-design-technology',
  name: 'NSW HSC Design and Technology written examination',
  paper: {
    totalMarks: 40,
    sections: [
      { id: 'I', name: 'Section I', marks: 10, questionTypes: ['multiple_choice'], questionCount: 10 },
      {
        id: 'II',
        name: 'Section II',
        marks: 15,
        questionTypes: ['short_answer', 'table', 'drawing'],
        minQuestions: 2,
        maxQuestions: 4,
      },
    ],
  },
  print: { linesPerMark: 2 },
}

function spec(over: Partial<PromptSpec> = {}): PromptSpec {
  const topic = course.topics[0]
  if (!topic) throw new Error('fixture has no topics')
  return {
    syllabus,
    course,
    topics: [topic],
    pointIds: ['HSC-01.06', 'HSC-01.07'],
    questionType: 'short_answer',
    marks: 4,
    count: 3,
    ...over,
  }
}

/* ------------------------------------------------------------------- context */

describe('buildPrompt', () => {
  it('names the course, the count, the type and the marks in the first breath', () => {
    const text = buildPrompt(spec())
    const opening = text.split('\n')[0] ?? ''
    expect(opening).toContain('3 original examination question')
    expect(opening).toContain('short_answer')
    expect(opening).toContain('4 marks')
    expect(text).toContain('Design and Technology, HSC course (NSW Education Standards Authority)')
  })

  it('carries the chosen content points with their ids, which is what the answer is checked against', () => {
    const text = buildPrompt(spec())
    expect(text).toContain('HSC-01.06  ergonomics')
    expect(text).toContain('HSC-01.07  work health and safety')
  })

  it('leaves out a content point the teacher did not choose', () => {
    const text = buildPrompt(spec())
    expect(text).not.toContain('HSC-01.08')
    expect(text).not.toContain('quality')
  })

  it('offers only the outcomes the chosen topics carry', () => {
    // Scoped to the context block: the worked example further down quotes an
    // outcome too, and that one is substituted rather than offered.
    const context = buildPrompt(spec()).split('## How to write them')[0] ?? ''
    expect(context).toContain('H1.1')
    expect(context).not.toContain('H4.2')
    expect(context).not.toContain('H6.1')
  })

  it('puts the teacher’s own ids in the example, so copying them is harmless', () => {
    const text = buildPrompt(spec())
    expect(text).toContain('"pointIds": ["HSC-01.06"]')
    expect(text).toContain('"outcomes": ["H1.1"]')
    expect(text).not.toContain('HSC-13.01')
  })

  it('falls back to the whole course when no topic maps an outcome', () => {
    const bare = { ...course, topics: course.topics.map((t) => ({ ...t, outcomes: [] })) }
    const codes = outcomesFor({ course: bare, topics: bare.topics }).map((o) => o.code)
    expect(codes).toEqual(['H1.1', 'H4.2', 'H6.1'])
  })

  it('tells the model which fields Klunk fills in itself', () => {
    const text = buildPrompt(spec())
    expect(text).toContain('Leave out "id"')
    expect(text).toContain('Leave out "syllabusId" and "courseId"')
  })

  it('asks for Australian English and original questions', () => {
    const text = buildPrompt(spec())
    expect(text).toContain('Australian English')
    expect(text).toContain('past examination paper')
  })
})

/* --------------------------------------------------------------- per type */

describe('buildPrompt, by question type', () => {
  it('spells out that a multiple choice answer is an index from zero', () => {
    const text = buildPrompt(spec({ questionType: 'multiple_choice', marks: 1 }))
    expect(text).toContain('counting from zero')
    expect(text).toContain('Not a letter, not the option text.')
    expect(text).toContain('"correctAnswer": 0')
  })

  it('says extended response criteria are bands rather than components', () => {
    const text = buildPrompt(spec({ questionType: 'extended_response', marks: 15 }))
    expect(text).toContain('bands, not components')
    expect(text).toContain('they do not add up')
  })

  it('asks a table for two columns, because more than two prints wrong', () => {
    const text = buildPrompt(spec({ questionType: 'table', marks: 3 }))
    expect(text).toContain('Two columns only')
    expect(text).toContain('known fault in the app')
  })

  it('gives a drawing the printable size of an A4 page', () => {
    const text = buildPrompt(spec({ questionType: 'drawing', marks: 4 }))
    expect(text).toContain('180 by 240')
  })

  it('carries a filled example of the type asked for and of no other', () => {
    const text = buildPrompt(spec({ questionType: 'table', marks: 3 }))
    expect(text).toContain('"questionType": "table"')
    expect(text).not.toContain('"questionType": "drawing"')
  })
})

/* ----------------------------------------------------------------- guidance */

describe('marksGuidance', () => {
  it('turns marks into ruled lines using the profile', () => {
    const text = marksGuidance({ questionType: 'short_answer', marks: 6, profile })
    expect(text).toContain('12 ruled lines')
  })

  it('assumes two lines a mark when the folder has no profile', () => {
    const text = marksGuidance({ questionType: 'short_answer', marks: 5, profile: undefined })
    expect(text).toContain('10 ruled lines')
  })

  it('describes what a student does at this mark value', () => {
    expect(marksGuidance({ questionType: 'short_answer', marks: 2 })).toContain('outlines or describes')
    expect(marksGuidance({ questionType: 'extended_response', marks: 15 })).toContain(
      'sustained argument',
    )
  })

  it('says nothing about ruled lines for a multiple choice question', () => {
    const text = marksGuidance({ questionType: 'multiple_choice', marks: 1 })
    expect(text).not.toContain('ruled')
    expect(text).toContain('one decision')
  })
})

describe('paper conventions', () => {
  it('tells the model where this type sits on the real paper', () => {
    const text = buildPrompt(spec({ profile }))
    expect(text).toContain('Section II, worth 15 of 40 marks over 2 to 4 questions')
  })

  it('says nothing about sections when the folder has no profile', () => {
    expect(buildPrompt(spec())).not.toContain('On the real paper')
  })
})

/* ------------------------------------------------------------- the extras */

describe('what the teacher adds', () => {
  it('passes their own instruction through verbatim', () => {
    const text = buildPrompt(spec({ extra: 'Set every question in a school workshop.' }))
    expect(text).toContain('Set every question in a school workshop.')
  })

  it('sends nothing from the existing bank unless asked', () => {
    expect(buildPrompt(spec())).not.toContain('already has')
  })

  it('lists the stems it was given, so the model does not write them again', () => {
    const avoid: Question[] = [
      {
        id: 'ex-sa-01',
        questionType: 'short_answer',
        questionText: 'Explain how a designer establishes the needs of a client.',
        marks: 4,
        markingGuide: { sampleAnswer: 'This must not go out with it.' },
      },
    ]
    const text = buildPrompt(spec({ avoid }))
    expect(text).toContain('Explain how a designer establishes the needs of a client.')
    expect(text).not.toContain('This must not go out with it.')
  })
})

describe('plain', () => {
  it('flattens the non-breaking spaces the NESA document brings with it', () => {
    expect(plain('work health and safety')).toBe('work health and safety')
    expect(plain('  two   words\n')).toBe('two words')
  })
})
