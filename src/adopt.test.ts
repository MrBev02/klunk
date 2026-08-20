/**
 * Putting an AI's reading of a marking guide onto questions already adopted.
 *
 * The tests worth reading twice are the ones where nothing happens. A letter
 * naming an option the paper never printed, two answers on a question with one,
 * a part the question does not have: every one of them leaves the question
 * exactly as it was and says so. #66 was a marking guide that published
 * something false quietly, and a model is a more confident source than the
 * empty file that caused it.
 */

import { describe, expect, it } from 'vitest'
import { applyMarking, NO_ANSWER_KEY, type Adopted } from './adopt'
import { AI_MARKED_TAG, CHECK_THE_ANSWER, type Marking } from './marking'
import type { Question } from './types'
import { blocksSaving, validateQuestion } from './validate'

const CTX = { inBank: new Set<string>(), inFolder: new Set<string>() }

function adopted(question: Question, notes: string[] = []): Adopted {
  return {
    question,
    pictures: [],
    pages: [],
    notes,
    faults: validateQuestion(question, CTX),
  }
}

function marking(entries: Marking['entries'], byAi = true): Marking {
  return { entries, byAi, notes: [], rejected: [] }
}

function choiceQuestion(number: string, answer?: number): Question {
  const question: Question = {
    id: `bank-mc-${number}`,
    questionType: 'multiple_choice',
    questionText: 'Which storage medium has no moving parts?',
    marks: 1,
    source: { questionNumber: number },
    config: {
      choices: [{ text: 'Hard disk' }, { text: 'Solid state' }, { text: 'Optical disc' }],
    },
  }
  if (answer !== undefined) question.config!.correctAnswer = answer
  return question
}

describe('an answer that lands', () => {
  it('resolves the letter against the options this question holds', () => {
    const out = applyMarking(
      [adopted(choiceQuestion('1'))],
      marking([{ number: 1, answers: ['B'] }]),
      CTX,
    )
    expect(out.adopted[0]!.question.config!.correctAnswer).toBe(1)
  })

  it('says a model read it, on the question it marks', () => {
    const out = applyMarking(
      [adopted(choiceQuestion('1'))],
      marking([{ number: 1, answers: ['C'] }]),
      CTX,
    )
    expect(out.adopted[0]!.notes).toContain(CHECK_THE_ANSWER)
  })

  it('takes back the note saying nobody answered this question', () => {
    const stale = `${NO_ANSWER_KEY}. The marking guide will say so rather than print a letter.`
    const out = applyMarking(
      [adopted(choiceQuestion('1', 0), [stale])],
      marking([{ number: 1, answers: ['C'] }]),
      CTX,
    )
    expect(out.adopted[0]!.notes.join(' ')).not.toContain(NO_ANSWER_KEY)
    expect(out.adopted[0]!.question.config!.correctAnswer).toBe(2)
  })

  it('clears the mark saying the question is unfinished', () => {
    // Before #105 this was an error and it blocked the save outright, which is
    // what cost a paper read without its markscheme every objective question.
    // It saves either way now, and what the answer landing changes is whether
    // the question is still waiting on one.
    const before = adopted(choiceQuestion('1'))
    expect(before.faults.some((f) => f.unfinished)).toBe(true)
    expect(blocksSaving(before.faults)).toBe(false)
    const out = applyMarking([before], marking([{ number: 1, answers: ['A'] }]), CTX)
    expect(out.adopted[0]!.faults.some((f) => f.unfinished)).toBe(false)
  })

  it('answers a multiple-response question with every letter given', () => {
    const question: Question = {
      id: 'bank-mr-1',
      questionType: 'multiple_response',
      questionText: 'Which two are video formats?',
      marks: 1,
      source: { questionNumber: '10' },
      config: {
        choices: [{ text: 'MOV' }, { text: 'PNG' }, { text: 'MP4' }, { text: 'CSV' }],
      },
    }
    const out = applyMarking(
      [adopted(question)],
      marking([{ number: 10, answers: ['A', 'C'] }]),
      CTX,
    )
    expect(out.adopted[0]!.question.config!.correctAnswers).toEqual([0, 2])
  })

  it('links a matching question item by item', () => {
    const question: Question = {
      id: 'bank-mat-1',
      questionType: 'matching',
      questionText: 'Match each term to its description.',
      marks: 1,
      source: { questionNumber: '13' },
      config: {
        items: [{ text: 'Enhanced data analysis' }, { text: 'Reduced cost' }],
        options: [{ text: 'A description' }, { text: 'Another' }, { text: 'A third' }],
      },
    }
    const out = applyMarking(
      [adopted(question)],
      marking([
        {
          number: 13,
          links: [
            { item: 1, options: ['C'] },
            { item: 2, options: ['A'] },
          ],
        },
      ]),
      CTX,
    )
    expect(out.adopted[0]!.question.config!.items).toEqual([
      { text: 'Enhanced data analysis', matches: [2] },
      { text: 'Reduced cost', matches: [0] },
    ])
  })

  it('answers a true or false question with a boolean', () => {
    const question: Question = {
      id: 'bank-tf-1',
      questionType: 'true_false',
      questionText: 'A solid state drive has no moving parts.',
      marks: 1,
      source: { questionNumber: '5' },
    }
    const out = applyMarking([adopted(question)], marking([{ number: 5, trueFalse: true }]), CTX)
    expect(out.adopted[0]!.question.config!.correctAnswer).toBe(true)
  })
})

describe('an answer that does not land', () => {
  it('refuses a letter the question does not offer, and names it', () => {
    const out = applyMarking(
      [adopted(choiceQuestion('1'))],
      marking([{ number: 1, answers: ['E'] }]),
      CTX,
    )
    expect(out.adopted[0]!.question.config!.correctAnswer).toBeUndefined()
    expect(out.adopted[0]!.notes.join(' ')).toContain('not one of the 3 options read')
    expect(out.adopted[0]!.notes).not.toContain(CHECK_THE_ANSWER)
  })

  it('refuses to choose between two answers on a question with one', () => {
    const out = applyMarking(
      [adopted(choiceQuestion('1'))],
      marking([{ number: 1, answers: ['A', 'C'] }]),
      CTX,
    )
    expect(out.adopted[0]!.question.config!.correctAnswer).toBeUndefined()
    expect(out.adopted[0]!.notes.join(' ')).toContain('has not chosen between them')
  })

  it('leaves a question the guide says nothing about exactly as it was', () => {
    const before = adopted(choiceQuestion('1'))
    const out = applyMarking([before], marking([{ number: 2, answers: ['A'] }]), CTX)
    expect(out.adopted[0]).toBe(before)
  })

  it('reports an entry for a question that was never read', () => {
    const out = applyMarking(
      [adopted(choiceQuestion('1'))],
      marking([{ number: 40, answers: ['A'] }]),
      CTX,
    )
    expect(out.notes.join(' ')).toContain('Question 40')
  })

  it('says how much of the paper the reply covered', () => {
    const out = applyMarking(
      [adopted(choiceQuestion('1')), adopted(choiceQuestion('2'))],
      marking([{ number: 1, answers: ['A'] }]),
      CTX,
    )
    expect(out.notes.join(' ')).toContain(
      '1 of the 2 questions were marked, 1 of them with an answer',
    )
  })
})

describe('the criteria', () => {
  const written: Question = {
    id: 'bank-sa-1',
    questionType: 'short_answer',
    questionText: 'Outline two benefits of automated backups.',
    marks: 6,
    source: { questionNumber: '21' },
    config: {
      parts: [
        { label: '(a)', text: 'Outline one benefit for data recovery.', marks: 2 },
        { label: '(b)', text: 'Outline one benefit for staff time.', marks: 4 },
      ],
    },
  }

  it('puts a band on the question, top mark and all', () => {
    const question: Question = {
      id: 'bank-er-1',
      questionType: 'extended_response',
      questionText: 'Evaluate the influence of emerging technologies.',
      marks: 15,
      source: { questionNumber: '25' },
    }
    const out = applyMarking(
      [adopted(question)],
      marking([
        {
          number: 25,
          criteria: [{ marks: 13, marksTo: 15, description: 'Sustains a judgement.' }],
          answersCouldInclude: ['Cost of retooling'],
        },
      ]),
      CTX,
    )
    expect(out.adopted[0]!.question.markingGuide!.criteria![0]).toEqual({
      marks: 13,
      marksTo: 15,
      description: 'Sustains a judgement.',
    })
    expect(out.adopted[0]!.question.markingGuide!.answersCouldInclude).toEqual([
      'Cost of retooling',
    ])
  })

  it('marks a part under its own heading, whichever way the label was written', () => {
    const out = applyMarking(
      [adopted(written)],
      marking([
        { number: 21, part: 'a', criteria: [{ marks: 2, description: 'Names two costs.' }] },
        { number: 21, part: 'b', sampleAnswer: 'Staff spend no time on it.' },
      ]),
      CTX,
    )
    const parts = out.adopted[0]!.question.config!.parts!
    expect(parts[0]!.criteria![0]!.description).toBe('Names two costs.')
    expect(parts[1]!.sampleAnswer).toBe('Staff spend no time on it.')
  })

  it('reports a part the question does not have', () => {
    const out = applyMarking(
      [adopted(written)],
      marking([{ number: 21, part: 'c', criteria: [{ marks: 1, description: 'x' }] }]),
      CTX,
    )
    expect(out.adopted[0]!.notes.join(' ')).toContain('a part (c) that is not on this question')
  })

  it('adds the outcomes the guide names to any already there', () => {
    const question = { ...choiceQuestion('1'), outcomes: ['H1.1'] }
    const out = applyMarking(
      [adopted(question)],
      marking([{ number: 1, outcomes: ['H3.2', 'H1.1'] }]),
      CTX,
    )
    expect(out.adopted[0]!.question.outcomes).toEqual(['H1.1', 'H3.2'])
  })

  it('keeps what the model could not read, on the question', () => {
    const out = applyMarking(
      [adopted(choiceQuestion('1'))],
      marking([{ number: 1, unreadable: 'the second line of the criteria' }]),
      CTX,
    )
    expect(out.adopted[0]!.notes.join(' ')).toContain('the second line of the criteria')
  })
})

describe('a reply that marks one question twice', () => {
  it('says so rather than taking the first in silence', () => {
    const out = applyMarking(
      [adopted(choiceQuestion('1'))],
      marking([
        { number: 1, answers: ['B'] },
        { number: 1, answers: ['C'] },
      ]),
      CTX,
    )
    expect(out.adopted[0]!.question.config!.correctAnswer).toBe(1)
    expect(out.adopted[0]!.notes.join(' ')).toContain('marks this question 2 times')
  })
})

describe('who supplied the marking', () => {
  it('tags a question a model answered, because the notes do not survive saving', () => {
    const out = applyMarking(
      [adopted(choiceQuestion('1'))],
      marking([{ number: 1, answers: ['B'] }]),
      CTX,
    )
    expect(out.adopted[0]!.question.tags).toContain(AI_MARKED_TAG)
  })

  /**
   * `markingFromGuide` sends Klunk's own reading through this same function, and
   * saying an AI transcribed it is a false statement about Klunk's own work.
   */
  it("says nothing about an AI when one of Klunk's own readers supplied it", () => {
    const out = applyMarking(
      [adopted(choiceQuestion('1'))],
      marking([{ number: 1, answers: ['B'] }], false),
      CTX,
    )
    expect(out.adopted[0]!.question.config!.correctAnswer).toBe(1)
    expect(out.adopted[0]!.question.tags ?? []).not.toContain(AI_MARKED_TAG)
    expect(out.adopted[0]!.notes).not.toContain(CHECK_THE_ANSWER)
  })

  it('does not tag a question the guide could not answer', () => {
    const out = applyMarking(
      [adopted(choiceQuestion('1'))],
      marking([{ number: 1, answers: ['E'] }]),
      CTX,
    )
    expect(out.adopted[0]!.question.tags ?? []).not.toContain(AI_MARKED_TAG)
  })

  it('keeps the tags a question already had', () => {
    const question = { ...choiceQuestion('1'), tags: ['ai-transcribed'] }
    const out = applyMarking([adopted(question)], marking([{ number: 1, answers: ['B'] }]), CTX)
    expect(out.adopted[0]!.question.tags).toEqual(['ai-transcribed', AI_MARKED_TAG])
  })
})

describe('what actually landed', () => {
  it('counts the questions it changed, not the ones an entry named', () => {
    const out = applyMarking(
      [adopted(choiceQuestion('1')), adopted(choiceQuestion('2'))],
      marking([
        { number: 1, answers: ['B'] },
        { number: 2, outcomes: [] },
      ]),
      CTX,
    )
    expect(out.marked).toBe(1)
    expect(out.notes.join(' ')).toContain('1 of the 2 questions were marked')
  })

  it('reports nothing landed when a reply is for another paper', () => {
    const out = applyMarking(
      [adopted(choiceQuestion('1'))],
      marking([{ number: 40, answers: ['B'] }]),
      CTX,
    )
    expect(out.marked).toBe(0)
  })

  it('does not stack the same note when a second guide is read over the first', () => {
    const once = applyMarking(
      [adopted(choiceQuestion('1'))],
      marking([{ number: 1, answers: ['B'] }]),
      CTX,
    )
    const twice = applyMarking(once.adopted, marking([{ number: 1, answers: ['C'] }]), CTX)
    expect(twice.adopted[0]!.question.config!.correctAnswer).toBe(2)
    expect(twice.adopted[0]!.notes.filter((n) => n === CHECK_THE_ANSWER)).toHaveLength(1)
    expect(twice.adopted[0]!.question.tags).toEqual([AI_MARKED_TAG])
  })
})
