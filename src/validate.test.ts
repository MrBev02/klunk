/**
 * Tests for question validation and cleaning.
 *
 * These stand in for a JSON Schema validator the app deliberately does not
 * bundle, so they are the only thing keeping `validate.ts` and
 * `schemas/bank.schema.json` saying the same thing. The cases that matter are
 * the ones a form makes easy to produce and a teacher cannot see: config left
 * behind by a change of question type, parts whose marks do not add up, and an
 * id that quietly collides with one already in the folder.
 */

import { describe, expect, it } from 'vitest'
import type { Question, QuestionConfig, QuestionType } from './types'
import {
  cleanQuestion,
  emptyIdContext,
  suggestQuestionId,
  validateQuestion,
  type IdContext,
} from './validate'

function question(over: Partial<Question> = {}): Question {
  return {
    id: 'bank-sa-01',
    questionType: 'short_answer',
    questionText: 'Explain how a designer establishes the needs of a client.',
    marks: 4,
    ...over,
  }
}

function errors(q: Question, ids: IdContext = emptyIdContext()): string[] {
  return validateQuestion(q, ids)
    .filter((c) => c.severity === 'error')
    .map((c) => `${c.where ?? ''}: ${c.message}`)
}

function warnings(q: Question, ids: IdContext = emptyIdContext()): string[] {
  return validateQuestion(q, ids)
    .filter((c) => c.severity === 'warning')
    .map((c) => `${c.where ?? ''}: ${c.message}`)
}

/* ------------------------------------------------------------------ the basics */

describe('validateQuestion', () => {
  it('passes a plain question that a teacher would call finished', () => {
    expect(
      errors(
        question({
          markingGuide: { sampleAnswer: 'Interviews the client and records the brief.' },
        }),
      ),
    ).toEqual([])
  })

  it('refuses a question with nothing in it', () => {
    expect(errors(question({ questionText: '   ' }))).toContain(
      'Question: A question needs something to ask.',
    )
  })

  it('refuses marks that are not a number above zero', () => {
    expect(errors(question({ marks: 0 }))).toHaveLength(1)
    expect(errors(question({ marks: -2 }))).toHaveLength(1)
    expect(errors(question({ marks: Number.NaN }))).toHaveLength(1)
  })

  it('allows a half mark but says most papers will not', () => {
    expect(errors(question({ marks: 2.5 }))).toEqual([])
    expect(warnings(question({ marks: 2.5 })).join(' ')).toContain('not a whole number')
  })

  it('keeps difficulty inside the range the schema sets', () => {
    expect(errors(question({ difficulty: 3 }))).toEqual([])
    expect(errors(question({ difficulty: 6 }))).toHaveLength(1)
    expect(errors(question({ difficulty: 2.5 }))).toHaveLength(1)
  })
})

/* ---------------------------------------------------------------------- ids */

describe('question ids', () => {
  it('refuses an id holding a character that would break a paper reference', () => {
    // A paper stores `bank.json#id`, so a hash in the id makes it unparseable.
    expect(errors(question({ id: 'bank#01' }))).toHaveLength(1)
    expect(errors(question({ id: 'bank/01' }))).toHaveLength(1)
    expect(errors(question({ id: 'has a space' }))).toHaveLength(1)
    expect(errors(question({ id: 'HSC-01.07_a' }))).toEqual([])
  })

  it('refuses an id the target bank already uses, because saving would replace it', () => {
    const ids: IdContext = {
      inBank: new Set(['bank-sa-01']),
      inFolder: new Set(['bank-sa-01']),
    }
    expect(errors(question(), ids).join(' ')).toContain('already has a question with that id')
  })

  it('lets a question keep its own id when it is being edited', () => {
    const ids: IdContext = {
      inBank: new Set(['bank-sa-01']),
      inFolder: new Set(['bank-sa-01']),
      originalId: 'bank-sa-01',
    }
    expect(errors(question(), ids)).toEqual([])
    expect(validateQuestion(question(), ids).filter((c) => c.where === 'Id')).toEqual([])
  })

  it('only warns when the clash is in a different bank', () => {
    const ids: IdContext = { inBank: new Set(), inFolder: new Set(['bank-sa-01']) }
    expect(errors(question(), ids)).toEqual([])
    expect(warnings(question(), ids).join(' ')).toContain('Another bank')
  })
})

describe('suggestQuestionId', () => {
  it('names an id after its bank and type', () => {
    expect(suggestQuestionId('bank/design.json', 'multiple_choice', new Set())).toBe(
      'design-mc-01',
    )
    expect(suggestQuestionId('preliminary.json', 'extended_response', new Set())).toBe(
      'preliminary-er-01',
    )
  })

  it('takes the first free number rather than one past the highest', () => {
    const taken = new Set(['design-mc-01', 'design-mc-03'])
    expect(suggestQuestionId('bank/design.json', 'multiple_choice', taken)).toBe('design-mc-02')
  })

  it('survives a bank filename that is nothing but punctuation', () => {
    expect(suggestQuestionId('!!!.json', 'table', new Set())).toBe('bank-tbl-01')
  })
})

/* --------------------------------------------------------------- by question type */

describe('multiple choice', () => {
  const mc = (config: QuestionConfig): Question =>
    question({ questionType: 'multiple_choice', marks: 1, config })

  it('needs at least two options and one of them marked correct', () => {
    expect(errors(mc({ choices: [{ text: 'Only one' }], correctAnswer: 0 })).join(' ')).toContain(
      'at least two options',
    )
    expect(
      errors(mc({ choices: [{ text: 'a' }, { text: 'b' }] })).join(' '),
    ).toContain('Mark one option')
  })

  it('refuses a correct answer that is not one of the options', () => {
    // The schema only requires a non-negative integer, so nothing but this
    // stops a marking guide printing with no answer on it.
    expect(
      errors(mc({ choices: [{ text: 'a' }, { text: 'b' }], correctAnswer: 4 })).join(' '),
    ).toContain('not one of the options')
  })

  it('refuses an empty option', () => {
    expect(
      errors(mc({ choices: [{ text: 'a' }, { text: '  ' }], correctAnswer: 0 })).join(' '),
    ).toContain('Option B')
  })
})

describe('written questions with parts', () => {
  it('refuses parts whose marks do not add up to the question', () => {
    const q = question({
      marks: 5,
      config: {
        parts: [
          { label: '(a)', text: 'Identify two criteria.', marks: 2 },
          { label: '(b)', text: 'Explain the consequences.', marks: 2 },
        ],
      },
    })
    expect(errors(q).join(' ')).toContain('The parts total 4 marks')
  })

  it('accepts parts that do add up', () => {
    const q = question({
      marks: 5,
      config: {
        parts: [
          { label: '(a)', text: 'Identify two criteria.', marks: 2, sampleAnswer: 'Durability.' },
          { label: '(b)', text: 'Explain the consequences.', marks: 3 },
        ],
      },
    })
    expect(errors(q)).toEqual([])
  })
})

describe('tables', () => {
  const table = (config: QuestionConfig): Question =>
    question({ questionType: 'table', marks: 2, config })

  it('needs a heading on every column', () => {
    expect(
      errors(table({ columns: ['Purpose', ''], rows: [{ label: 'A', marks: 2 }] })).join(' '),
    ).toContain('Column 2 has no heading')
  })

  it('says so when a third column will print the same answers as the second', () => {
    const q = table({
      columns: ['Material', 'Property', 'Use'],
      rows: [{ label: 'Steel', answers: ['Hard'], marks: 2 }],
    })
    expect(errors(q)).toEqual([])
    expect(warnings(q).join(' ')).toContain('more than two columns')
  })

  it('notices rows whose marks do not reach the question total', () => {
    const q = table({
      columns: ['Purpose', 'Method'],
      rows: [
        { label: 'A', marks: 1 },
        { label: 'B', marks: 1 },
      ],
    })
    expect(warnings(question({ ...q, marks: 4 })).join(' ')).toContain('The rows total 2 marks')
  })
})

describe('drawing', () => {
  it('refuses a drawing space with no size to it', () => {
    const q = question({ questionType: 'drawing', marks: 6, config: { spaceMm: [0, 90] } })
    expect(errors(q).join(' ')).toContain('above zero')
  })

  it('warns about a space too big for an A4 page', () => {
    const q = question({ questionType: 'drawing', marks: 6, config: { spaceMm: [250, 90] } })
    expect(errors(q)).toEqual([])
    expect(warnings(q).join(' ')).toContain('printable area')
  })
})

describe('stimulus', () => {
  it('refuses an image with no file, and warns about one with no alt text', () => {
    expect(errors(question({ stimulus: [{ kind: 'image' }] })).join(' ')).toContain('needs a file')
    expect(
      warnings(question({ stimulus: [{ kind: 'image', file: 'stimulus/a.png' }] })).join(' '),
    ).toContain('screen reader')
  })
})

describe('marking guide', () => {
  it('treats descending criteria as bands rather than components', () => {
    const banded = question({
      questionType: 'extended_response',
      marks: 15,
      markingGuide: {
        criteria: [
          { marks: 15, description: 'Sustained and thorough.' },
          { marks: 11, description: 'Thorough.' },
          { marks: 7, description: 'Sound.' },
        ],
      },
    })
    expect(warnings(banded).join(' ')).not.toContain('criteria total')
  })

  it('adds up criteria that read as components', () => {
    const q = question({
      marks: 5,
      markingGuide: {
        criteria: [
          { marks: 2, description: 'Identifies two criteria.' },
          { marks: 2, description: 'Explains the consequences.' },
        ],
      },
    })
    expect(warnings(q).join(' ')).toContain('The criteria total 4')
  })

  it('says a question needing judgement has nothing to mark it against', () => {
    expect(warnings(question()).join(' ')).toContain('Two markers will not agree')
    // Sample answers on the parts count as a guide.
    const withParts = question({
      config: { parts: [{ label: '(a)', text: 'Explain.', marks: 4, sampleAnswer: 'Because.' }] },
    })
    expect(warnings(withParts).join(' ')).not.toContain('Two markers')
  })

  it('does not ask a multiple choice question for a marking guide', () => {
    const mc = question({
      questionType: 'multiple_choice',
      marks: 1,
      config: { choices: [{ text: 'a' }, { text: 'b' }], correctAnswer: 0 },
    })
    expect(warnings(mc)).toEqual([])
  })
})

/* ------------------------------------------------------------------ cleaning */

describe('cleanQuestion', () => {
  it('drops the config left behind when the question type changed', () => {
    // The form keeps a draft as the teacher switches type. Every per-type config
    // is additionalProperties: false, so writing the leftovers produces a bank
    // that fails validation.
    const switched = question({
      questionType: 'short_answer',
      config: {
        choices: [{ text: 'a' }, { text: 'b' }],
        correctAnswer: 0,
        shuffle: true,
        answerLines: 6,
      },
    })
    expect(cleanQuestion(switched).config).toEqual({ answerLines: 6 })
  })

  it('keeps a multiple choice config even when nothing else survives', () => {
    const mc = question({
      questionType: 'multiple_choice',
      marks: 1,
      config: { choices: [{ text: 'a' }, { text: 'b' }], correctAnswer: 1, shuffle: false },
    })
    expect(cleanQuestion(mc).config).toEqual({
      choices: [{ text: 'a' }, { text: 'b' }],
      correctAnswer: 1,
      shuffle: false,
    })
  })

  it('leaves out every field the teacher did not fill in', () => {
    const sparse = question({
      questionText: '  Explain.  ',
      tags: ['', '  '],
      outcomes: [],
      syllabus: { syllabusId: '', topicIds: [] },
      markingGuide: { sampleAnswer: '   ', criteria: [] },
      source: { paper: '' },
      stimulus: [{ kind: 'text', text: '  ', caption: 'nothing' }],
      config: {},
    })
    const cleaned = cleanQuestion(sparse)

    expect(cleaned).toEqual({
      id: 'bank-sa-01',
      questionType: 'short_answer',
      questionText: 'Explain.',
      marks: 4,
    })
    expect(Object.keys(cleaned)).not.toContain('stimulus')
  })

  it('keeps what the teacher did fill in, trimmed', () => {
    const full = question({
      tags: [' ergonomics ', 'safety'],
      outcomes: ['H1.1'],
      syllabus: { syllabusId: 's', courseId: 'hsc', topicIds: ['HSC-01'], pointIds: ['HSC-01.07'] },
      markingGuide: { sampleAnswer: ' Because. ', criteria: [{ marks: 4, description: ' Says why. ' }] },
      source: { origin: 'adapted', paper: 'NSW HSC Design and Technology', year: 2019 },
      stimulus: [{ kind: 'image', file: 'stimulus/handle.png', alt: 'A handle', caption: 'Figure 1' }],
    })
    const cleaned = cleanQuestion(full)

    expect(cleaned.tags).toEqual(['ergonomics', 'safety'])
    expect(cleaned.markingGuide).toEqual({
      sampleAnswer: 'Because.',
      criteria: [{ marks: 4, description: 'Says why.' }],
    })
    expect(cleaned.source).toEqual({
      origin: 'adapted',
      paper: 'NSW HSC Design and Technology',
      year: 2019,
    })
    expect(cleaned.stimulus).toEqual([
      { kind: 'image', file: 'stimulus/handle.png', alt: 'A handle', caption: 'Figure 1' },
    ])
  })

  it('drops a stimulus row that was added and never filled in', () => {
    const q = question({ stimulus: [{ kind: 'text' }, { kind: 'image' }] })
    expect(cleanQuestion(q).stimulus).toBeUndefined()
  })

  it('writes a config for every type that the schema requires one for', () => {
    const required: QuestionType[] = ['multiple_choice', 'true_false', 'table']
    for (const questionType of required) {
      const cleaned = cleanQuestion(question({ questionType, config: {} }))
      expect(cleaned.config, questionType).toBeDefined()
    }
  })
})
