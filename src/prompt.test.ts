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
import {
  asPromptJson,
  buildPrompt,
  marksGuidance,
  outcomesFor,
  pickExample,
  plain,
  type PromptSpec,
} from './prompt'
import { ingestQuestions } from './ingest'
import type { Profile, Question, QuestionType, Syllabus, SyllabusCourse } from './types'

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
      {
        id: 'I',
        name: 'Section I',
        marks: 10,
        questionTypes: ['multiple_choice'],
        questionCount: 10,
      },
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

/** Just the questions-already-written block, which several fields also appear outside. */
function avoidBlock(text: string): string {
  return (text.split('## Questions this course already has')[1] ?? '').split('## The JSON')[0] ?? ''
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

  it('asks a table for one cell per column rather than one list per row', () => {
    const text = buildPrompt(spec({ questionType: 'table', marks: 3 }))
    expect(text).toContain('"cells"')
    expect(text).toContain('entry per column after the first')
    // The old shape printed the row's answers into every column, so nothing
    // should invite a model back towards it.
    expect(text).not.toContain('Two columns only')
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
    expect(marksGuidance({ questionType: 'short_answer', marks: 2 })).toContain(
      'outlines or describes',
    )
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

  // This used to assert the opposite: a stem went out and its marking guide
  // stayed behind. The stem alone answered neither question the teacher had, so
  // the whole question goes now, and the reversal is left visible rather than
  // deleted.
  it('sends the whole question it was given, marking guide and all', () => {
    const avoid: Question[] = [
      {
        id: 'ex-sa-01',
        questionType: 'short_answer',
        questionText: 'Explain how a designer establishes the needs of a client.',
        marks: 4,
        markingGuide: { sampleAnswer: 'The designer interviews the client and observes the site.' },
      },
    ]
    const text = buildPrompt(spec({ avoid }))
    expect(text).toContain('Explain how a designer establishes the needs of a client.')
    expect(text).toContain('The designer interviews the client and observes the site.')
  })

  it('leaves out what Klunk fills in itself, so an avoided question is not a template for one', () => {
    const avoid: Question[] = [
      {
        id: 'ex-sa-01',
        questionType: 'short_answer',
        questionText: 'Explain how a designer establishes the needs of a client.',
        marks: 4,
        syllabus: {
          syllabusId: 'nsw-hsc-design-technology',
          courseId: 'hsc',
          pointIds: ['HSC-01.06'],
        },
        source: { origin: 'extracted', paper: 'HSC', year: 2019, questionNumber: '24' },
      },
    ]
    // Scoped to the block: the shape section further down names these fields on
    // purpose, to say they are Klunk's to fill in.
    const block = avoidBlock(buildPrompt(spec({ avoid })))
    expect(block).toContain('"questionText"')
    expect(block).not.toContain('"id"')
    expect(block).not.toContain('"syllabusId"')
    expect(block).not.toContain('"courseId"')
    expect(block).not.toContain('"source"')
    // Provenance is the one thing the conventions above forbid reproducing, so
    // a model must not be handed the paper and the number it came from.
    expect(block).not.toContain('2019')
  })

  it('says how many it left out, because a cut list reads as the whole one', () => {
    const avoid = Array.from({ length: 45 }, (_, i) => ({
      id: `ex-sa-${String(i).padStart(2, '0')}`,
      questionType: 'short_answer' as const,
      questionText: `Question number ${i} about designing.`,
      marks: 4,
    }))
    const text = buildPrompt(spec({ avoid }))
    expect(text).toContain('Those are the 40 of 45 questions')
    expect(text).toContain('Another 5')
    // Forty listed and no more, counted off the fences inside the block. Counted
    // over the whole prompt this is 42: the opening asks for one ```json block
    // back and the example is in another.
    expect(avoidBlock(text).split('```json').length - 1).toBe(40)
  })
})

/* ------------------------------------------------------------- the example */

/**
 * The example is the strongest signal in the prompt, so both paths are covered:
 * the one where the teacher's own question arrives, and the one where the
 * built-in is invented. Three faults have shipped green through exactly that
 * gap (#64, #105, #106).
 */
describe('the worked example', () => {
  const own: Question = {
    id: 'dt-sa-04',
    questionType: 'short_answer',
    questionText: 'Explain how a school uniform supplier tests a fabric for colourfastness.',
    marks: 4,
    syllabus: { pointIds: ['HSC-01.06'] },
    outcomes: ['H1.1'],
    markingGuide: {
      sampleAnswer: 'Samples are washed at 40 degrees and compared to a grey scale.',
    },
  }

  it('uses the teacher’s own question, and drops the built-in with it', () => {
    const text = buildPrompt(spec({ example: own }))
    expect(text).toContain('### One of your own questions, dt-sa-04')
    expect(text).toContain('colourfastness')
    expect(text).toContain('Copy the shape and the pitch')
    // The built-in short answer example is about a bamboo laminate.
    expect(text).not.toContain('bamboo')
  })

  it('says the built-in subject is not a hint, since it is D&T whatever is loaded', () => {
    const text = buildPrompt(spec())
    expect(text).toContain('### One object, filled in')
    expect(text).toContain('Its subject matter is not a hint')
  })

  it('sends nothing of the teacher’s when they have opted out', () => {
    // Not merely "the example changed": the whole point of the opt-out is that
    // no text of theirs is anywhere in what gets copied.
    const text = buildPrompt(spec({ example: undefined }))
    expect(text).not.toContain('colourfastness')
    expect(text).not.toContain('grey scale')
    expect(text).not.toContain('dt-sa-04')
  })

  it('does not hand the model an id or a provenance to copy', () => {
    const carried: Question = {
      ...own,
      syllabus: {
        syllabusId: 'nsw-hsc-design-technology',
        courseId: 'hsc',
        pointIds: ['HSC-01.06'],
      },
      source: { origin: 'extracted', paper: 'HSC', year: 2019, questionNumber: '24' },
    }
    const block = buildPrompt(spec({ example: carried })).split('### One of your own')[1] ?? ''
    expect(block).not.toContain('"id"')
    expect(block).not.toContain('"courseId"')
    expect(block).not.toContain('"source"')
  })

  it('drops an image the model cannot fetch and keeps a text stimulus', () => {
    const withPictures: Question = {
      ...own,
      stimulus: [
        { kind: 'image', file: 'stimulus/kettle.png', caption: 'Figure 1' },
        { kind: 'text', text: 'A supplier washes 20 samples a week.' },
      ],
    }
    const json = asPromptJson(withPictures)
    expect(json).toContain('A supplier washes 20 samples a week.')
    expect(json).not.toContain('kettle.png')
  })

  // A teacher's own computing question is the best example a computing prompt
  // can carry, and its code has to go out exactly as the bank holds it.
  it('keeps a code stimulus, indentation and switched-off numbers included', () => {
    const withCode: Question = {
      ...own,
      stimulus: [
        { kind: 'code', text: '    gap = gap * 2\n    print(gap)' },
        { kind: 'code', text: 'wait(1)', lineNumbers: false },
      ],
    }
    const parsed = JSON.parse(asPromptJson(withCode)) as { stimulus: unknown }
    expect(parsed.stimulus).toEqual([
      { kind: 'code', text: '    gap = gap * 2\n    print(gap)' },
      { kind: 'code', text: 'wait(1)', lineNumbers: false },
    ])
  })

  it('is JSON, because a malformed example is worse than no example', () => {
    expect(() => JSON.parse(asPromptJson(own))).not.toThrow()
    const parsed = JSON.parse(asPromptJson(own)) as Record<string, unknown>
    expect(Object.keys(parsed)[0]).toBe('questionType')
    expect(parsed.marks).toBe(4)
  })
})

/* ------------------------------------------------------------- which example */

describe('pickExample', () => {
  const base = {
    questionType: 'short_answer' as const,
    marks: 4,
    pointIds: ['HSC-01.06'],
    topicIds: ['HSC-01'],
  }

  function q(over: Partial<Question> & { id: string }): Question {
    return {
      questionType: 'short_answer',
      questionText: `Question ${over.id}.`,
      marks: 4,
      ...over,
    }
  }

  it('takes only the type that was asked for, since the wrong type teaches the wrong JSON', () => {
    const pool = [q({ id: 'a', questionType: 'multiple_choice', marks: 1 }), q({ id: 'b' })]
    expect(pickExample(pool, base)?.id).toBe('b')
  })

  it('has nothing to offer when the bank holds none of that type', () => {
    const pool = [q({ id: 'a', questionType: 'drawing' })]
    expect(pickExample(pool, base)).toBeUndefined()
  })

  it('prefers a question no AI wrote, so the model is not shown its own drift', () => {
    const pool = [q({ id: 'a', tags: ['ai-drafted'] }), q({ id: 'b' })]
    expect(pickExample(pool, base)?.id).toBe('b')
  })

  it('prefers one on a content point the teacher chose', () => {
    const pool = [
      q({ id: 'a', syllabus: { pointIds: ['HSC-13.01'] } }),
      q({ id: 'b', syllabus: { pointIds: ['HSC-01.06'] } }),
    ]
    expect(pickExample(pool, base)?.id).toBe('b')
  })

  it('prefers one carrying a marking guide, which is the part models get wrong', () => {
    const pool = [q({ id: 'a' }), q({ id: 'b', markingGuide: { sampleAnswer: 'Two reasons.' } })]
    expect(pickExample(pool, base)?.id).toBe('b')
  })

  it('prefers the marks nearest the ones asked for', () => {
    const pool = [q({ id: 'a', marks: 12 }), q({ id: 'b', marks: 5 })]
    expect(pickExample(pool, base)?.id).toBe('b')
  })

  it('picks the same one every time, so re-reading the prompt shows the same question', () => {
    const pool = [q({ id: 'zeta' }), q({ id: 'alpha' }), q({ id: 'mid' })]
    expect(pickExample(pool, base)?.id).toBe('alpha')
    expect(pickExample([...pool].reverse(), base)?.id).toBe('alpha')
  })
})

describe('plain', () => {
  it('flattens the non-breaking spaces the NESA document brings with it', () => {
    expect(plain('work health and safety')).toBe('work health and safety')
    expect(plain('  two   words\n')).toBe('two words')
  })
})

describe('a syllabus that nests its content (#78)', () => {
  const nested: SyllabusCourse = {
    id: 'y11',
    name: 'Year 11',
    outcomes: [{ code: 'BIO11-8', text: 'describes single cells' }],
    topics: [
      {
        id: 'Y11-01',
        name: 'Evolution',
        outcomes: ['BIO11-8'],
        inquiryQuestion: 'What is the evidence for evolution?',
        points: [
          { id: 'Y11-01.01', text: 'explain modern-day examples, for example:' },
          { id: 'Y11-01.02', text: 'the cane toad', parent: 'Y11-01.01' },
        ],
      },
    ],
  }

  const build = (pointIds: string[]) =>
    buildPrompt({
      syllabus: { ...syllabus, courses: [nested] },
      course: nested,
      topics: nested.topics,
      pointIds,
      questionType: 'short_answer',
      marks: 3,
      count: 1,
      extra: '',
    })

  it('gives a sub-item the item above it, when that item was not chosen', () => {
    // "the cane toad" on its own is not something anyone can write a question
    // from: the verb is on the item above it.
    const text = build(['Y11-01.02'])
    expect(text).toContain('Under: explain modern-day examples, for example:')
    expect(text).toContain('Y11-01.02  the cane toad')
    // Context, not a target: the id of an unchosen point is never offered, or
    // the reply could tag itself against something nobody asked for.
    expect(text).not.toContain('Y11-01.01')
  })

  it('does not repeat the item when it was chosen too', () => {
    const text = build(['Y11-01.01', 'Y11-01.02'])
    expect(text).not.toContain('Under:')
    expect(text).toContain('Y11-01.01  explain modern-day examples, for example:')
    expect(text).toContain('Y11-01.02  the cane toad')
  })

  it("states the topic's inquiry question, which says what the topic is for", () => {
    expect(build(['Y11-01.01'])).toContain('Inquiry question: What is the evidence for evolution?')
  })
})

describe('the markup', () => {
  // One copy of these rules serves all three prompts, so each one is checked to
  // be carrying it rather than trusted to (#101).
  it('is in the drafting prompt, naming the fields it applies to', () => {
    const prompt = buildPrompt(spec())
    expect(prompt).toContain('## Markup')
    expect(prompt).toContain("A question's text, a part's text and an option's text")
    expect(prompt).toContain('pipe table')
    expect(prompt).toContain('**bold**, *italic* and <u>underline</u>')
  })
})

/**
 * The built-in example of every type, read back by what reads a real reply.
 *
 * The examples are the strongest thing in the prompt and now serve two prompts,
 * so an example teaching a shape the reader refuses is a fault in both. That is
 * exactly what #108 was: a `table` described but never shown came back as a stem
 * full of headings and no `columns`, and nothing failed until a teacher tried to
 * save it. Asserting what the prompt *says* cannot see this; only running the
 * example through `ingestQuestions` can.
 */
describe('every built-in example is a question Klunk takes', () => {
  const types: QuestionType[] = [
    'multiple_choice',
    'multiple_response',
    'matching',
    'true_false',
    'short_answer',
    'extended_response',
    'table',
    'drawing',
  ]

  function exampleOf(type: QuestionType, marks: number): string {
    const text = buildPrompt(spec({ questionType: type, marks, count: 1 }))
    const block = text.split('### One object, filled in')[1] ?? ''
    return block.split('```json')[1]?.split('```')[0] ?? ''
  }

  for (const type of types) {
    it(`reads the ${type} example with nothing in error`, () => {
      const json = exampleOf(type, type === 'extended_response' ? 15 : 4)
      const out = ingestQuestions(`[${json}]`, {
        bankPath: 'bank/drafted.json',
        inFolder: new Set<string>(),
        inBank: new Set<string>(),
        topicIds: ['HSC-01'],
        points: [
          { id: 'HSC-01.06', topicId: 'HSC-01' },
          { id: 'HSC-01.07', topicId: 'HSC-01' },
        ],
        outcomes: ['H1.1', 'H4.2', 'H6.1'],
      })
      expect(out.failure).toBeUndefined()
      expect(out.rejected).toEqual([])
      expect(out.drafts).toHaveLength(1)

      const draft = out.drafts[0]!
      expect(draft.question.questionType).toBe(type)
      expect(draft.faults.filter((f) => f.severity === 'error').map((f) => f.message)).toEqual([])
    })
  }

  it('shows the table as columns and rows rather than as a pipe table (#108)', () => {
    const out = ingestQuestions(`[${exampleOf('table', 3)}]`, {
      bankPath: 'bank/drafted.json',
      inFolder: new Set<string>(),
      inBank: new Set<string>(),
      topicIds: ['HSC-01'],
      points: [{ id: 'HSC-01.06', topicId: 'HSC-01' }],
      outcomes: [],
    })
    const cfg = out.drafts[0]?.question.config ?? {}
    expect(cfg.columns).toHaveLength(3)
    expect(cfg.rows).toHaveLength(3)
    expect(out.drafts[0]?.question.questionText).not.toContain('|')
  })

  it('tells a table not to write itself into the stem, since the markup offers one', () => {
    const text = buildPrompt(spec({ questionType: 'table', marks: 3 }))
    expect(text).toContain('Never write the')
    expect(text).toContain('every column heading, in the order printed')
  })
})
