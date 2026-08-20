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
import type { Profile, Question, QuestionConfig, QuestionType, School, Syllabus } from './types'
import {
  blocksSaving,
  cleanProfile,
  cleanQuestion,
  cleanSchool,
  emptyIdContext,
  hasGuide,
  isUnfinished,
  unfinishedReasons,
  suggestQuestionId,
  validateProfile,
  validateQuestion,
  validateSchool,
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
      'Question: A question needs something to ask, either its own text or parts that ask it.',
    )
  })

  it('allows a question with no stem when its parts do the asking', () => {
    // 2016, 2018 and 2019 each print a Section II question this way: the heading
    // is followed straight by (a). Demanding a stem there means inventing words
    // the examination never printed.
    expect(
      errors(
        question({
          questionText: '',
          marks: 5,
          config: {
            parts: [
              { label: 'a', text: 'Outline one benefit.', marks: 2 },
              { label: 'b', text: 'Explain how it is tested.', marks: 3 },
            ],
          },
        }),
      ),
    ).toEqual([])
  })

  it('still refuses a question with no stem and parts that ask nothing', () => {
    expect(
      errors(
        question({
          questionText: '',
          marks: 2,
          config: { parts: [{ label: 'a', text: '  ', marks: 2 }] },
        }),
      ).join(' '),
    ).toMatch(/needs something to ask/)
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
    expect(suggestQuestionId('bank/design.json', 'multiple_choice', new Set())).toBe('design-mc-01')
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

  it('needs at least two options', () => {
    expect(errors(mc({ choices: [{ text: 'Only one' }], correctAnswer: 0 })).join(' ')).toContain(
      'at least two options',
    )
  })

  it('warns rather than blocks when no answer is recorded, as the other two types do', () => {
    // The schema stopped requiring `correctAnswer` in #105. A paper read or
    // transcribed without its markscheme does not state the answer, and the
    // student paper is correct either way.
    const checks = validateQuestion(
      mc({ choices: [{ text: 'a' }, { text: 'b' }] }),
      emptyIdContext(),
    )
    const said = checks.find((c) => c.message.startsWith('No answer is marked'))
    expect(said?.severity).toBe('warning')
    expect(said?.unfinished).toBe(true)
    expect(blocksSaving(checks)).toBe(false)
  })

  it('still refuses an answer the schema itself could not hold', () => {
    // `minimum: 0`, so a negative index is a file that does not validate.
    expect(
      errors(mc({ choices: [{ text: 'a' }, { text: 'b' }], correctAnswer: -1 })).join(' '),
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

/*
 * The two types the Enterprise Computing Year 11 papers print and the other six
 * could not say (#32). Both hold an answer key that may honestly be absent, and
 * telling "not recorded" from "none" is most of what is tested here: multiple
 * choice cannot make that distinction, and #64 is what it cost.
 */
describe('multiple response', () => {
  const mr = (config: QuestionConfig): Question =>
    question({ questionType: 'multiple_response', marks: 1, config })

  const six = [
    { text: 'a' },
    { text: 'b' },
    { text: 'c' },
    { text: 'd' },
    { text: 'e' },
    { text: 'f' },
  ]

  it('needs at least three options', () => {
    expect(
      errors(mr({ choices: [{ text: 'a' }, { text: 'b' }], correctAnswers: [0] })).join(' '),
    ).toContain('at least three options')
  })

  it('warns rather than refuses when no answers are recorded', () => {
    // The whole reason `correctAnswers` is optional where multiple choice's
    // `correctAnswer` is required. A paper transcribed without its markscheme
    // still prints correctly, so this must not stop it being saved.
    const q = mr({ choices: six })
    expect(errors(q)).toEqual([])
    expect(warnings(q).join(' ')).toContain('No answers are marked')
  })

  it('refuses an empty answer list, which says none of them are answers', () => {
    expect(errors(mr({ choices: six, correctAnswers: [] })).join(' ')).toContain(
      'Mark the options that are answers',
    )
  })

  it('refuses an answer that is not one of the options, and a repeated one', () => {
    expect(errors(mr({ choices: six, correctAnswers: [0, 9] })).join(' ')).toContain(
      'not one of the options',
    )
    expect(errors(mr({ choices: six, correctAnswers: [2, 2] })).join(' ')).toContain(
      'more than once',
    )
  })

  it('says so when only one option is an answer', () => {
    expect(warnings(mr({ choices: six, correctAnswers: [3] })).join(' ')).toContain(
      'multiple choice question',
    )
  })

  it('sorts the answers and drops an empty option when cleaned', () => {
    const cleaned = cleanQuestion(
      mr({ choices: [...six, { text: '   ' }], correctAnswers: [4, 0, 2], shuffle: true }),
    )
    expect(cleaned.config?.choices).toHaveLength(6)
    expect(cleaned.config?.correctAnswers).toEqual([0, 2, 4])
  })

  it('never writes an answer list the question did not state', () => {
    // `[]` would mean "none of these", which is a different claim from silence.
    const cleaned = cleanQuestion(mr({ choices: six }))
    expect('correctAnswers' in (cleaned.config ?? {})).toBe(false)
  })
})

describe('matching', () => {
  const match = (config: QuestionConfig): Question =>
    question({ questionType: 'matching', marks: 1, config })

  const twoByTwo: QuestionConfig = {
    items: [
      { text: 'Video', matches: [1] },
      { text: 'Audio', matches: [0] },
    ],
    options: [{ text: 'MP3' }, { text: 'MP4' }],
  }

  it('needs two of each column', () => {
    expect(
      errors(
        match({ items: [{ text: 'only one' }], options: [{ text: 'a' }, { text: 'b' }] }),
      ).join(' '),
    ).toContain('at least two numbered items')
    expect(
      errors(match({ items: [{ text: 'a' }, { text: 'b' }], options: [{ text: 'a' }] })).join(' '),
    ).toContain('at least two lettered options')
  })

  it('refuses a link to an option that is not listed', () => {
    expect(
      errors(
        match({ ...twoByTwo, items: [{ text: 'Video', matches: [7] }, { text: 'Audio' }] }),
      ).join(' '),
    ).toContain('not listed')
  })

  it('warns rather than refuses when nothing is linked', () => {
    const q = match({
      items: [{ text: 'Video' }, { text: 'Audio' }],
      options: [{ text: 'MP3' }, { text: 'MP4' }],
    })
    expect(errors(q)).toEqual([])
    expect(warnings(q).join(' ')).toContain('Nothing is linked')
  })

  it('names the items left unlinked when others are linked', () => {
    // Half a key is far more likely to be unfinished than deliberate, but the
    // 2024 paper's own rubric permits an item to link to nothing, so it is not
    // an error.
    const q = match({
      items: [{ text: 'Video', matches: [1] }, { text: 'Audio' }, { text: 'Text' }],
      options: [{ text: 'MP3' }, { text: 'MP4' }],
    })
    expect(errors(q)).toEqual([])
    expect(warnings(q).join(' ')).toContain('Items 2, 3')
  })

  it('keeps an item linked to more than one option', () => {
    // "Multiple lines can start and end from any item", printed on the 2024
    // paper. Nothing here may treat the columns as a bijection.
    const q = match({
      items: [
        { text: 'Cheap to run', matches: [0, 1] },
        { text: 'Quiet', matches: [1] },
      ],
      options: [{ text: 'Electric' }, { text: 'Hybrid' }],
    })
    expect(errors(q)).toEqual([])
    expect(cleanQuestion(q).config?.items?.[0]?.matches).toEqual([0, 1])
  })

  it('drops an empty row and keeps the rest', () => {
    const cleaned = cleanQuestion(
      match({ ...twoByTwo, items: [...(twoByTwo.items ?? []), { text: '  ' }] }),
    )
    expect(cleaned.config?.items).toHaveLength(2)
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

  it('accepts a third column with its own answers', () => {
    const q = table({
      columns: ['Material', 'Property', 'Use'],
      rows: [
        {
          label: 'Steel',
          cells: [{ answers: ['Hard'] }, { answers: ['Structural framing'] }],
          marks: 2,
        },
      ],
    })
    expect(errors(q)).toEqual([])
    expect(warnings(q)).toEqual([])
  })

  it('rejects a row carrying answers for a column that does not exist', () => {
    const q = table({
      columns: ['Purpose', 'Method'],
      rows: [
        {
          label: 'A',
          cells: [{ answers: ['Survey'] }, { answers: ['Never printed'] }],
          marks: 2,
        },
      ],
    })
    expect(errors(q).join(' ')).toContain('would not print')
  })

  it('says so when no row has an expected answer at all', () => {
    const q = table({
      columns: ['Purpose', 'Method'],
      rows: [{ label: 'A', marks: 2 }],
    })
    expect(errors(q)).toEqual([])
    expect(warnings(q).join(' ')).toContain('marking guide prints an empty table')
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

  // Only a hand-edited file can hold one, since the editor offers a list of
  // three. Silence would read as Klunk ignoring the field altogether.
  it('names an alignment that is not one of the three', () => {
    const q = question({
      stimulus: [{ kind: 'image', file: 'a.png', align: 'middle' as never }],
    })
    expect(errors(q).join(' ')).toContain('not left, centre or right')
  })

  it('takes all three, and centre with them', () => {
    for (const align of ['left', 'centre', 'right'] as const) {
      const q = question({ stimulus: [{ kind: 'image', file: 'a.png', alt: 'A', align }] })
      expect(errors(q)).toEqual([])
    }
  })

  // A picture can hang off a part, and the same rules have to reach it there:
  // the whole point of #100 is that a part's picture is one Klunk prints.
  it("holds a part's pictures to the same rules", () => {
    const q = question({
      marks: 4,
      config: {
        parts: [
          { label: '(a)', text: 'Name the joint shown.', marks: 1 },
          {
            label: '(b)',
            text: 'Evaluate it.',
            marks: 3,
            stimulus: [{ kind: 'image' }, { kind: 'text', text: '' }],
          },
        ],
      },
    })
    expect(errors(q).join(' ')).toContain('needs a file')
    expect(errors(q).join(' ')).toContain('needs some text')
  })

  // "Stimulus 2 has no alt text" is no help on a question carrying six pictures
  // across three parts.
  it('names the part a fault is on', () => {
    const q = question({
      marks: 4,
      config: {
        parts: [
          { label: '(a)', text: 'Name it.', marks: 2 },
          {
            label: '(b)',
            text: 'Evaluate it.',
            marks: 2,
            stimulus: [{ kind: 'image', file: 'stimulus/joint.png' }],
          },
        ],
      },
    })
    expect(warnings(q).join(' ')).toContain('Part (b), stimulus 1')
  })
})

describe('bands', () => {
  it('takes a recorded band as a band without having to infer it from the shape', () => {
    // Two bands in ascending order would fail the descending-marks guess, which
    // is exactly why a band is now recorded rather than inferred.
    const q = question({
      questionType: 'extended_response',
      marks: 15,
      markingGuide: {
        criteria: [
          { marks: 1, marksTo: 7, description: 'Some understanding.' },
          { marks: 8, marksTo: 15, description: 'Thorough understanding.' },
        ],
      },
    })
    expect(errors(q)).toEqual([])
    expect(warnings(q).join(' ')).not.toContain('criteria total')
  })

  it('refuses a band that runs backwards', () => {
    expect(
      errors(
        question({ markingGuide: { criteria: [{ marks: 15, marksTo: 13, description: 'Top.' }] } }),
      ).join(' '),
    ).toMatch(/15–13 is backwards/)
  })

  it('keeps the band when cleaning, and drops it when it is not one', () => {
    const cleaned = cleanQuestion(
      question({
        markingGuide: {
          criteria: [
            { marks: 13, marksTo: 15, description: '  Comprehensive.  ' },
            { marks: 2, marksTo: 2, description: 'Sound.' },
          ],
        },
      }),
    )
    expect(cleaned.markingGuide?.criteria).toEqual([
      { marks: 13, marksTo: 15, description: 'Comprehensive.' },
      { marks: 2, description: 'Sound.' },
    ])
  })
})

describe('criteria on a part', () => {
  it('validates and keeps criteria recorded against a part', () => {
    const q = question({
      marks: 5,
      config: {
        parts: [
          {
            label: 'a',
            text: 'Outline one benefit.',
            marks: 2,
            criteria: [{ marks: 2, description: 'Outlines a benefit.' }],
          },
          {
            label: 'b',
            text: 'Explain how it is tested.',
            marks: 3,
            criteria: [{ marks: 3, description: 'Explains a test.' }],
          },
        ],
      },
    })
    expect(errors(q)).toEqual([])
    // A question marked part by part has a guide, so it must not be nagged for
    // one it does not need.
    expect(warnings(q).join(' ')).not.toContain('Two markers will not agree')
    expect(cleanQuestion(q).config?.parts?.[0]?.criteria).toEqual([
      { marks: 2, description: 'Outlines a benefit.' },
    ])
  })

  it('refuses a criterion on a part that says nothing', () => {
    expect(
      errors(
        question({
          marks: 2,
          config: {
            parts: [
              {
                label: 'a',
                text: 'Outline one.',
                marks: 2,
                criteria: [{ marks: 2, description: ' ' }],
              },
            ],
          },
        }),
      ).join(' '),
    ).toMatch(/Part a, criterion 1: A criterion needs a description/)
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

/* ------------------------------------------------- what blocks, and what waits */

/**
 * The classification of #105, executable.
 *
 * `validate.ts`'s header sets four tests and the first that answers wins: the
 * schema refuses it, the value is actively wrong, cleaning erases it, or it is
 * unfinished. Nothing in vitest can prove the first against
 * `schemas/bank.schema.json`, because the app carries no JSON Schema validator
 * by design, so that half stays where CLAUDE.md puts it: a `uv run --with
 * jsonschema` pass over a real folder. What is pinned here is the verdict per
 * rule, so an edit that flips one has to say so.
 */
describe('what blocks a save and what is saved unfinished', () => {
  const blocked = (q: Question, ids: IdContext = emptyIdContext()): boolean =>
    blocksSaving(validateQuestion(q, ids))

  const waits = (q: Question): string[] =>
    validateQuestion(q, emptyIdContext())
      .filter((c) => c.unfinished)
      .map((c) => c.message)

  /* The schema refuses these, so the file could not be written at all. */

  it('blocks what the bank file itself could not hold', () => {
    // id.minLength: 1
    expect(blocked(question({ id: '  ' }))).toBe(true)
    // the question-level anyOf: text, or parts that ask
    expect(blocked(question({ questionText: '' }))).toBe(true)
    // marks.exclusiveMinimum: 0
    expect(blocked(question({ marks: 0 }))).toBe(true)
    // difficulty: integer 1 to 5
    expect(blocked(question({ difficulty: 9 }))).toBe(true)
    // tags.maxItems: 20
    expect(blocked(question({ tags: Array.from({ length: 21 }, (_, i) => `t${i}`) }))).toBe(true)
    // choices.minItems: 2
    expect(
      blocked(
        question({
          questionType: 'multiple_choice',
          marks: 1,
          config: { choices: [{ text: 'only one' }], correctAnswer: 0 },
        }),
      ),
    ).toBe(true)
    // parts[].marks.exclusiveMinimum: 0
    expect(
      blocked(question({ config: { parts: [{ label: '(a)', text: 'Explain.', marks: 0 }] } })),
    ).toBe(true)
  })

  it('blocks a reference that could not be resolved or would overwrite another question', () => {
    // Beyond the schema. A `#` makes `bank.json#id` unparseable.
    expect(blocked(question({ id: 'bank#sa#01' }))).toBe(true)
    // Saving would replace somebody else's question.
    expect(
      blocked(question({ id: 'taken' }), { inBank: new Set(['taken']), inFolder: new Set() }),
    ).toBe(true)
  })

  it('blocks a fault that cleaning would erase, because nothing would be left to come back to', () => {
    // cleanStimuli drops an entry with neither a file nor any text, so a
    // question tagged for this would carry no recoverable reason.
    const fileless = question({ stimulus: [{ kind: 'image' }] })
    expect(blocked(fileless)).toBe(true)
    expect(
      cleanQuestion({ ...fileless, markingGuide: { sampleAnswer: 'x' } }).stimulus,
    ).toBeUndefined()

    // cleanCriteria drops a row with a blank description, and its marks with it.
    const blank = question({ markingGuide: { criteria: [{ marks: 2, description: '  ' }] } })
    expect(blocked(blank)).toBe(true)
    expect(cleanQuestion(blank).markingGuide?.criteria).toBeUndefined()
  })

  /* These save, and say what is owed on them. */

  it('saves a question whose parts do not add up, and says so', () => {
    // The one that arrives from real papers: the 2025 Biology copyright line
    // took seven marks of an eleven-mark question with it, leaving a question
    // whose parts did not total. Half a question is worth keeping.
    const q = question({
      marks: 10,
      config: {
        parts: [
          { label: '(a)', text: 'Outline one.', marks: 2 },
          { label: '(b)', text: 'Explain another.', marks: 3 },
        ],
      },
    })
    expect(blocked(q)).toBe(false)
    expect(waits(q).join(' ')).toContain('The parts total 5 marks')
  })

  it('saves a table with a blank heading or a blank row label, both of which survive cleaning', () => {
    const q = question({
      questionType: 'table',
      marks: 4,
      config: { columns: ['Material', ''], rows: [{ label: 'Steel' }, { label: '  ' }] },
    })
    expect(blocked(q)).toBe(false)
    expect(waits(q).join(' ')).toContain('has no heading')
    expect(waits(q).join(' ')).toContain('has no label')
    const cleaned = cleanQuestion(q)
    expect(cleaned.config?.columns).toEqual(['Material', ''])
    expect(cleaned.config?.rows?.[1]?.label).toBe('')
  })

  it('saves a part missing its label or its text', () => {
    const q = question({
      marks: 5,
      config: {
        parts: [
          { label: '', text: 'Explain.', marks: 2 },
          { label: '(b)', text: '', marks: 3 },
        ],
      },
    })
    expect(blocked(q)).toBe(false)
    expect(waits(q).join(' ')).toContain('A part needs a label')
    expect(waits(q).join(' ')).toContain('A part needs something to ask')
  })

  it('counts every unfinished state as unfinished and none of them as blocking', () => {
    // The ten states, each on its own, so a rule that stops setting the flag
    // fails here rather than going quiet on the library filter.
    const cases: [string, Question][] = [
      [
        'no answer on multiple choice',
        question({
          questionType: 'multiple_choice',
          marks: 1,
          config: { choices: [{ text: 'a' }, { text: 'b' }] },
        }),
      ],
      [
        'no answers on multiple response',
        question({
          questionType: 'multiple_response',
          marks: 1,
          config: { choices: [{ text: 'a' }, { text: 'b' }, { text: 'c' }] },
        }),
      ],
      [
        'nothing linked on matching',
        question({
          questionType: 'matching',
          marks: 2,
          config: {
            items: [{ text: '1' }, { text: '2' }],
            options: [{ text: 'A' }, { text: 'B' }],
          },
        }),
      ],
      ['no marking guide where one is needed', question()],
      [
        'a table whose guide would print empty',
        question({
          questionType: 'table',
          marks: 2,
          config: { columns: ['Material', 'Property'], rows: [{ label: 'Steel' }] },
        }),
      ],
    ]

    for (const [name, q] of cases) {
      expect(blocksSaving(validateQuestion(q, emptyIdContext())), name).toBe(false)
      expect(isUnfinished(q), name).toBe(true)
      expect(unfinishedReasons(q).length, name).toBeGreaterThan(0)
    }
  })

  it('survives cleaning, so a saved question still knows what it is waiting for', () => {
    // The invariant behind the tag. If cleaning ever removed the fault, the
    // question would be written carrying `needs-finishing` and no reason
    // anybody could recover, which is why a fault cleaning erases blocks
    // instead.
    const unfinishedOnes = [
      question(),
      question({
        questionType: 'multiple_choice',
        marks: 1,
        config: { choices: [{ text: 'a' }, { text: 'b' }] },
      }),
      question({
        marks: 10,
        config: { parts: [{ label: '(a)', text: 'Outline one.', marks: 2 }] },
      }),
    ]
    for (const q of unfinishedOnes) {
      expect(isUnfinished(cleanQuestion(q))).toBe(true)
      expect(cleanQuestion(q).tags).toContain('needs-finishing')
    }
  })

  it("takes the mark off again when the question is finished, and keeps the teacher's own tags", () => {
    const done = question({
      tags: ['ergonomics', 'needs-finishing'],
      markingGuide: { sampleAnswer: 'Interviews the client and records the brief.' },
    })
    expect(cleanQuestion(done).tags).toEqual(['ergonomics'])
  })

  it("keeps Klunk's own mark when the teacher already has twenty tags", () => {
    // `withTag` in adopt.ts and `readTags` in ingest.ts push and then slice to
    // twenty, which drops Klunk's tag at exactly twenty. This cuts first.
    const many = question({ tags: Array.from({ length: 20 }, (_, i) => `t${i}`) })
    const tags = cleanQuestion(many).tags ?? []
    expect(tags).toHaveLength(20)
    expect(tags).toContain('needs-finishing')
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
      // Stamped by cleaning: a short answer with no sample answer and no
      // criteria is saved and is not finished, and the file has to say so
      // because the notice on screen is gone the moment it is written.
      tags: ['needs-finishing'],
    })
    expect(Object.keys(cleaned)).not.toContain('stimulus')
  })

  it('keeps what the teacher did fill in, trimmed', () => {
    const full = question({
      tags: [' ergonomics ', 'safety'],
      outcomes: ['H1.1'],
      syllabus: { syllabusId: 's', courseId: 'hsc', topicIds: ['HSC-01'], pointIds: ['HSC-01.07'] },
      markingGuide: {
        sampleAnswer: ' Because. ',
        criteria: [{ marks: 4, description: ' Says why. ' }],
      },
      source: { origin: 'adapted', paper: 'NSW HSC Design and Technology', year: 2019 },
      stimulus: [
        { kind: 'image', file: 'stimulus/handle.png', alt: 'A handle', caption: 'Figure 1' },
      ],
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

  // Centre is what absence means, so writing it would put a field saying the
  // default into every bank, and every bank written before the field existed
  // would then disagree with every bank written after it about nothing.
  it('writes an alignment only where it is not the default', () => {
    const centred = question({ stimulus: [{ kind: 'image', file: 'a.png', align: 'centre' }] })
    expect(cleanQuestion(centred).stimulus).toEqual([{ kind: 'image', file: 'a.png' }])

    const right = question({ stimulus: [{ kind: 'image', file: 'a.png', align: 'right' }] })
    expect(cleanQuestion(right).stimulus).toEqual([
      { kind: 'image', file: 'a.png', align: 'right' },
    ])
  })

  it("cleans a part's pictures exactly as it cleans the question's", () => {
    const q = question({
      marks: 3,
      config: {
        parts: [
          {
            label: '(a)',
            text: 'Evaluate the joint shown.',
            marks: 3,
            stimulus: [
              { kind: 'image', file: ' stimulus/joint.png ', alt: ' A joint ', align: 'centre' },
              // Added and never filled in, so it never reaches the bank.
              { kind: 'image' },
            ],
          },
        ],
      },
    })
    expect(cleanQuestion(q).config?.parts?.[0]?.stimulus).toEqual([
      { kind: 'image', file: 'stimulus/joint.png', alt: 'A joint' },
    ])
  })

  it('drops an alignment off a text stimulus, which does not move', () => {
    const q = question({
      stimulus: [{ kind: 'text', text: 'Read this.', align: 'right' }],
    })
    expect(cleanQuestion(q).stimulus).toEqual([{ kind: 'text', text: 'Read this.' }])
  })

  it('writes a config for every type that the schema requires one for', () => {
    const required: QuestionType[] = ['multiple_choice', 'true_false', 'table']
    for (const questionType of required) {
      const cleaned = cleanQuestion(question({ questionType, config: {} }))
      expect(cleaned.config, questionType).toBeDefined()
    }
  })
})

/**
 * Profile validation, which stands in for `schemas/profile.schema.json` the same
 * way the tests above stand in for the bank schema.
 *
 * The cases worth having are the ones that produce a profile which looks fine
 * and rejects every paper built against it, because that fault is discovered
 * from the wrong end: the paper checker complains about the paper.
 */
function profile(over: Partial<Profile> = {}): Profile {
  return {
    formatVersion: '1',
    type: 'klunk_profile',
    id: 'nsw-hsc-english-advanced-1',
    name: 'NSW HSC English Advanced Paper 1',
    paper: {
      totalMarks: 20,
      sections: [{ id: 'I', name: 'Section I', marks: 20, questionTypes: ['short_answer'] }],
    },
    ...over,
  }
}

const messages = (p: Profile, taken = new Set<string>()) =>
  validateProfile(p, taken).map((c) => c.message)
const errorsOf = (p: Profile, taken = new Set<string>()) =>
  validateProfile(p, taken).filter((c) => c.severity === 'error')

describe('validateProfile', () => {
  it('passes a profile that describes a real paper', () => {
    expect(errorsOf(profile())).toEqual([])
  })

  it('rejects an id that could not be a filename', () => {
    for (const id of ['', 'Has Capitals', 'trailing-', 'under_score']) {
      expect(errorsOf(profile({ id })), id).not.toEqual([])
    }
  })

  it('rejects an id another profile in the folder already uses', () => {
    const taken = new Set(['nsw-hsc-design-technology'])
    expect(errorsOf(profile({ id: 'nsw-hsc-design-technology' }), taken)).not.toEqual([])
    expect(errorsOf(profile(), taken)).toEqual([])
  })

  it('catches sections that do not add up to the paper', () => {
    const p = profile({
      paper: {
        totalMarks: 40,
        sections: [
          { id: 'I', name: 'Section I', marks: 10 },
          { id: 'II', name: 'Section II', marks: 15 },
        ],
      },
    })
    // 25 against 40. The paper checker would otherwise report this as a fault
    // of every paper built against the profile, which is the wrong end.
    expect(messages(p).some((m) => m.includes('25') && m.includes('40'))).toBe(true)
  })

  it('catches two sections sharing an id', () => {
    const p = profile({
      paper: {
        totalMarks: 20,
        sections: [
          { id: 'I', name: 'Section I', marks: 10 },
          { id: 'I', name: 'Section II', marks: 10 },
        ],
      },
    })
    // A saved paper records `profileSectionId`, so it could not say which it filled.
    expect(messages(p).some((m) => m.includes('share the id'))).toBe(true)
  })

  it('catches a count and a range set at once', () => {
    const p = profile({
      paper: {
        totalMarks: 20,
        sections: [{ id: 'I', name: 'Section I', marks: 20, questionCount: 4, minQuestions: 2 }],
      },
    })
    // The schema permits both. checkPaper reads questionCount first, so the
    // range would be ignored without a word.
    expect(messages(p).some((m) => m.includes('one or the other'))).toBe(true)
  })

  it('catches a count and marks-each that contradict the section total', () => {
    const p = profile({
      paper: {
        totalMarks: 20,
        sections: [
          { id: 'I', name: 'Section I', marks: 20, questionCount: 10, marksPerQuestion: 1 },
        ],
      },
    })
    // Ten at one mark is ten, not twenty: the section could never be filled.
    expect(messages(p).some((m) => m.includes('is 10, but this section is worth 20'))).toBe(true)
  })

  it('accepts the shape of the real HSC Design and Technology paper', () => {
    const p = profile({
      paper: {
        totalMarks: 40,
        sections: [
          {
            id: 'I',
            name: 'Section I',
            marks: 10,
            questionCount: 10,
            marksPerQuestion: 1,
            questionTypes: ['multiple_choice'],
          },
          { id: 'II', name: 'Section II', marks: 15, minQuestions: 2, maxQuestions: 4 },
          { id: 'III', name: 'Section III', marks: 15, questionCount: 1 },
        ],
      },
    })
    expect(errorsOf(p)).toEqual([])
  })

  it('catches a range the wrong way round', () => {
    const p = profile({
      paper: {
        totalMarks: 20,
        sections: [{ id: 'I', name: 'Section I', marks: 20, minQuestions: 4, maxQuestions: 2 }],
      },
    })
    expect(errorsOf(p)).not.toEqual([])
  })

  it('warns rather than blocks when no question type is ticked', () => {
    const p = profile({
      paper: {
        totalMarks: 20,
        sections: [{ id: 'I', name: 'Section I', marks: 20, questionTypes: [] }],
      },
    })
    const checks = validateProfile(p, new Set())
    expect(checks.filter((c) => c.severity === 'error')).toEqual([])
    // An empty list and an absent one both mean "anything goes" to isTypeAllowed,
    // which is the opposite of what unticking everything looks like.
    expect(checks.some((c) => c.severity === 'warning')).toBe(true)
  })

  /**
   * A course id that names nothing filters every question away, so the builder
   * shows an empty rail and the profile is what is wrong. That is a miserable
   * thing to debug from the far end, which is the same argument as the sections
   * adding up.
   */
  describe('a marking guide in the shape NESA prints one', () => {
    it('keeps a band that is several points, and the answers-could-include list', () => {
      // 2025 HSC Visual Arts Question 1: two points in the top band, and a
      // ten-point list of what a marker should accept.
      const cleaned = cleanQuestion(
        question({
          questionType: 'extended_response',
          marks: 5,
          markingGuide: {
            criteria: [
              {
                marks: 5,
                description:
                  'Provides a thorough description of Paula Rego’s artmaking practice\n' +
                  'Uses the source material in a well-reasoned way',
              },
            ],
            answersCouldInclude: [
              'Uses acrylic paint on paper laid on a large canvas',
              '   ',
              'Subject matter includes figures in the landscape',
            ],
          },
        }),
      )

      expect(cleaned.markingGuide?.criteria?.[0]?.description).toContain('\n')
      // The blank a half-filled list leaves behind goes; the rest stays in order.
      expect(cleaned.markingGuide?.answersCouldInclude).toEqual([
        'Uses acrylic paint on paper laid on a large canvas',
        'Subject matter includes figures in the landscape',
      ])
    })

    it('counts an answers list as a marking guide, so it is not reported as missing', () => {
      const q = question({
        questionType: 'extended_response',
        marks: 5,
        markingGuide: { answersCouldInclude: ['Something a marker should accept'] },
      })
      expect(hasGuide(q)).toBe(true)
    })

    it('drops the list entirely when nothing is left in it', () => {
      const cleaned = cleanQuestion(
        question({
          questionType: 'extended_response',
          marks: 5,
          markingGuide: { sampleAnswer: 'A response.', answersCouldInclude: ['', '  '] },
        }),
      )
      expect(cleaned.markingGuide?.answersCouldInclude).toBeUndefined()
      expect(cleaned.markingGuide?.sampleAnswer).toBe('A response.')
    })
  })

  describe('a section a student chooses from', () => {
    const choice = (over: Partial<Profile['paper']['sections'][number]> = {}) =>
      profile({
        paper: {
          totalMarks: 25,
          sections: [
            {
              id: 'II',
              name: 'Section II',
              marks: 25,
              questionCount: 6,
              chooseCount: 1,
              marksPerQuestion: 25,
              ...over,
            },
          ],
        },
      })

    it('accepts the Visual Arts shape: six offered, one answered, worth 25', () => {
      expect(errorsOf(choice())).toEqual([])
    })

    it('counts the implied marks against what is answered, not what is printed', () => {
      // Before this the rule read the printed count and made the section 150,
      // rejecting a section that is exactly what the examination prints.
      expect(messages(choice()).some((m) => m.includes('150'))).toBe(false)
      expect(
        messages(choice({ chooseCount: 2 })).some((m) =>
          m.includes('2 questions at 25 marks is 50'),
        ),
      ).toBe(true)
    })

    it('rejects answering more than are printed', () => {
      expect(
        errorsOf(choice({ chooseCount: 7 })).some((c) => c.message.includes('only 6 are printed')),
      ).toBe(true)
    })

    it('warns when the choice is not a choice', () => {
      const checks = validateProfile(choice({ chooseCount: 6, marks: 150 }), new Set())
      expect(checks.some((c) => c.severity === 'warning' && c.message.includes('no choice'))).toBe(
        true,
      )
    })

    it('rejects a fractional or zero count', () => {
      for (const n of [0, 1.5]) {
        expect(errorsOf(choice({ chooseCount: n })).length).toBeGreaterThan(0)
      }
    })

    it('keeps the old rule for a section that is not a choice', () => {
      const p = profile({
        paper: {
          totalMarks: 10,
          sections: [
            { id: 'I', name: 'Section I', marks: 10, questionCount: 6, marksPerQuestion: 25 },
          ],
        },
      })
      expect(messages(p).some((m) => m.includes('6 questions at 25 marks is 150'))).toBe(true)
    })
  })

  describe('the course a profile names', () => {
    const model: Syllabus = {
      formatVersion: '1',
      type: 'klunk_syllabus',
      id: 'nsw-science-7-10',
      name: 'Science 7-10',
      framework: 'nsw',
      courses: [
        { id: 'y9', name: 'Year 9', topics: [] },
        { id: 'y10', name: 'Year 10', topics: [] },
      ],
    }
    // `null` and not `undefined` for "names no syllabus". A default parameter
    // takes over when the argument is `undefined`, so a helper written the
    // obvious way checks the default instead of the case the test is named for,
    // and passes. That is the test bug #44 turned up, repeated here at once.
    const withCourse = (courseId: string, syllabusId: string | null = 'nsw-science-7-10') =>
      profile({ ...(syllabusId === null ? {} : { syllabusId }), courseId })

    it('passes a course the model has', () => {
      expect(validateProfile(withCourse('y9'), new Set(), [model])).toEqual([])
    })

    it('rejects a course the model does not have, and lists the ones it does', () => {
      const [first] = validateProfile(withCourse('y7'), new Set(), [model])
      expect(first?.severity).toBe('error')
      expect(first?.message).toBe(
        'Science 7-10 has no course called "y7". Choose "Year 9" or "Year 10".',
      )
    })

    it('rejects a course with no syllabus, because it could belong to any model', () => {
      const errors = validateProfile(withCourse('y9', null), new Set(), [model]).filter(
        (c) => c.severity === 'error',
      )
      expect(errors).toHaveLength(1)
      expect(errors[0]?.message).toContain('no syllabus')
    })

    it('says nothing when the model is not in the folder', () => {
      // Klunk ships no syllabus model, so a profile naming one the teacher has
      // yet to generate is ordinary rather than a fault. Same reading as
      // modelcheck.ts takes.
      expect(validateProfile(withCourse('y7'), new Set(), [])).toEqual([])
      expect(validateProfile(withCourse('y7'), new Set())).toEqual([])
    })
  })
})

describe('cleanProfile', () => {
  it('drops the empty strings and empty lists a half-filled form leaves', () => {
    const cleaned = cleanProfile(
      profile({
        syllabusId: '',
        questionTypes: [],
        paper: {
          totalMarks: 20,
          instructions: ['', '  '],
          sections: [{ id: ' I ', name: ' Section I ', marks: 20, questionTypes: [] }],
        },
      }),
    )
    expect('syllabusId' in cleaned).toBe(false)
    expect('questionTypes' in cleaned).toBe(false)
    expect('instructions' in cleaned.paper).toBe(false)
    expect(cleaned.paper.sections[0]).toEqual({ id: 'I', name: 'Section I', marks: 20 })
  })

  it('keeps every optional field a teacher actually filled in', () => {
    const cleaned = cleanProfile(
      profile({
        syllabusId: 'nsw-hsc-english',
        paper: {
          totalMarks: 20,
          readingMinutes: 5,
          workingMinutes: 90,
          instructions: ['Write using black pen'],
          sections: [
            {
              id: 'I',
              name: 'Section I',
              marks: 20,
              suggestedMinutes: 45,
              instructions: 'Attempt Question 1',
              questionTypes: ['extended_response'],
              questionCount: 1,
              marksPerQuestion: 20,
            },
          ],
        },
        print: { linesPerMark: 3 },
      }),
    )
    expect(cleaned.syllabusId).toBe('nsw-hsc-english')
    expect(cleaned.paper.readingMinutes).toBe(5)
    expect(cleaned.paper.instructions).toEqual(['Write using black pen'])
    expect(cleaned.print?.linesPerMark).toBe(3)
    expect(cleaned.paper.sections[0]?.suggestedMinutes).toBe(45)
    expect(cleaned.paper.sections[0]?.questionTypes).toEqual(['extended_response'])
  })
})

/* --------------------------------------------------------------------- school */

function school(over: Partial<School> = {}): School {
  return { formatVersion: '1', type: 'klunk_school', name: 'Redlands', ...over }
}

function errorsIn(checks: ReturnType<typeof validateSchool>): string[] {
  return checks.filter((c) => c.severity === 'error').map((c) => c.message)
}

describe('validateSchool', () => {
  it('accepts the branding both example covers describe', () => {
    expect(
      validateSchool(
        school({
          logoFile: 'logo.png',
          logoWidthMm: 85,
          identification: [
            { label: 'Name', kind: 'write' },
            { label: 'Student number', kind: 'boxes', boxes: 8, onEveryPage: true },
          ],
        }),
      ),
    ).toEqual([])
  })

  it('needs a name', () => {
    expect(errorsIn(validateSchool(school({ name: '   ' })))).toEqual(['The school needs a name'])
  })

  it('rejects a logo width of nothing, which prints a logo of nothing', () => {
    expect(errorsIn(validateSchool(school({ logoWidthMm: 0 })))).toHaveLength(1)
  })

  it('rejects a logo wider than the printable width of A4', () => {
    expect(errorsIn(validateSchool(school({ logoWidthMm: 200 })))[0]).toContain('180 mm')
  })

  it('needs a label on every field, because the label is what prints', () => {
    const checks = validateSchool(school({ identification: [{ label: '', kind: 'write' }] }))
    expect(errorsIn(checks)).toHaveLength(1)
    // Named by position, since there is no label to name it by.
    expect(checks[0]?.where).toBe('Box 1')
  })

  it('holds the box count to a whole number within what fits', () => {
    expect(
      errorsIn(
        validateSchool(school({ identification: [{ label: 'N', kind: 'boxes', boxes: 0 }] })),
      ),
    ).toHaveLength(1)
    expect(
      errorsIn(
        validateSchool(school({ identification: [{ label: 'N', kind: 'boxes', boxes: 21 }] })),
      ),
    ).toHaveLength(1)
    expect(
      errorsIn(
        validateSchool(school({ identification: [{ label: 'N', kind: 'boxes', boxes: 2.5 }] })),
      ),
    ).toHaveLength(1)
  })

  it('ignores a box count on writing space, which never reads it', () => {
    expect(
      validateSchool(school({ identification: [{ label: 'Name', kind: 'write', boxes: 99 }] })),
    ).toEqual([])
  })

  it('warns rather than blocks on two fields with the same label', () => {
    const checks = validateSchool(
      school({
        identification: [
          { label: 'Name', kind: 'write' },
          { label: 'Name', kind: 'write' },
        ],
      }),
    )
    expect(errorsIn(checks)).toEqual([])
    expect(checks.filter((c) => c.severity === 'warning')).toHaveLength(1)
  })
})

describe('cleanSchool', () => {
  it('drops the empty fields a half-filled form leaves behind', () => {
    const cleaned = cleanSchool(
      school({
        name: '  Redlands  ',
        logoFile: '   ',
        identification: [
          { label: '  Name  ', kind: 'write' },
          { label: '   ', kind: 'write' },
        ],
      }),
    )
    expect(cleaned).toEqual({
      formatVersion: '1',
      type: 'klunk_school',
      name: 'Redlands',
      identification: [{ label: 'Name', kind: 'write' }],
    })
  })

  it('drops a logo width left behind after the logo was removed', () => {
    const cleaned = cleanSchool(school({ logoWidthMm: 85 }))
    expect(cleaned.logoWidthMm).toBeUndefined()
    expect(cleanSchool(school({ logoFile: 'logo.png', logoWidthMm: 85 })).logoWidthMm).toBe(85)
  })

  it('drops a box count from a field switched to writing space', () => {
    const cleaned = cleanSchool(
      school({ identification: [{ label: 'Name', kind: 'write', boxes: 8 }] }),
    )
    expect(cleaned.identification?.[0]).toEqual({ label: 'Name', kind: 'write' })
  })

  it('writes onEveryPage only when it is on, so an off one is not a line in the file', () => {
    expect(
      cleanSchool(school({ identification: [{ label: 'N', kind: 'write', onEveryPage: false }] }))
        .identification?.[0],
    ).toEqual({ label: 'N', kind: 'write' })
  })

  it('leaves an already-clean school untouched, so opening one does not edit it', () => {
    const tidy = school({
      logoFile: 'logo.png',
      logoWidthMm: 85,
      identification: [{ label: 'Student number', kind: 'boxes', boxes: 8, onEveryPage: true }],
    })
    expect(cleanSchool(tidy)).toEqual(tidy)
  })
})

describe('a profile that overrides the identification fields', () => {
  it('is held to the same rules as school.json, not to looser ones', () => {
    const p = profile({
      paper: {
        totalMarks: 10,
        cover: { identification: [{ label: '', kind: 'write' }] },
        sections: [{ id: 'I', name: 'Section I', marks: 10 }],
      },
    })
    expect(validateProfile(p, new Set()).some((c) => c.severity === 'error')).toBe(true)
  })

  it('survives cleaning with the column flag only where it is on', () => {
    const base = {
      totalMarks: 10,
      sections: [{ id: 'I', name: 'Section I', marks: 10 }],
    }
    expect(
      cleanProfile(profile({ paper: { ...base, cover: { marksAwardedColumn: false } } })).paper
        .cover,
    ).toBeUndefined()
    expect(
      cleanProfile(profile({ paper: { ...base, cover: { marksAwardedColumn: true } } })).paper
        .cover,
    ).toEqual({ marksAwardedColumn: true })
  })
})

describe('the profiles Klunk ships', () => {
  it('pass their own validator', async () => {
    // The one piece of real data available to this test. A validator that
    // rejects the profile the app installs is wrong about the schema, and that
    // would otherwise only show up as a teacher unable to save an edit to it.
    const bundled = import.meta.glob('../profiles/*.json', { eager: true, import: 'default' })
    const profiles = Object.values(bundled) as Profile[]
    expect(profiles.length).toBeGreaterThan(0)
    for (const p of profiles) {
      expect(
        validateProfile(p, new Set()).filter((c) => c.severity === 'error'),
        p.id,
      ).toEqual([])
    }
  })

  it('survive a round trip through the editor untouched', () => {
    const bundled = import.meta.glob('../profiles/*.json', { eager: true, import: 'default' })
    for (const p of Object.values(bundled) as Profile[]) {
      // Opening a shipped profile and saving it without changing anything must
      // not rewrite it, or every teacher who looks at one silently edits it.
      expect(cleanProfile(p), p.id).toEqual(p)
    }
  })
})
