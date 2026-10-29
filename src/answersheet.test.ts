/**
 * The multiple choice answer sheet's rules (#147).
 *
 * The case worth most here is the letters: the sheet and its key have to agree
 * with the paper for a shuffled question, which is the case a glance at an
 * unshuffled sample would never catch.
 */

import { describe, expect, it } from 'vitest'
import { answerSheetModel } from './answersheet'
import { coverModel } from './cover'
import { shuffledChoices, type ResolvedPaper, type ResolvedQuestion } from './paper'
import type { IdentificationField, Profile, Question } from './types'

function mc(id: string, options: number, correctAnswer?: number): Question {
  return {
    id,
    questionType: 'multiple_choice',
    questionText: 'Which?',
    marks: 1,
    config: {
      choices: Array.from({ length: options }, (_, i) => ({ text: `Option ${i}` })),
      ...(correctAnswer === undefined ? {} : { correctAnswer }),
    },
  }
}

function item(question: Question, number: number): ResolvedQuestion {
  return { question, file: 'bank/b.json', number, marks: question.marks }
}

function profile(answerSheet: boolean | null, identification?: IdentificationField[]): Profile {
  return {
    formatVersion: '1',
    type: 'klunk_profile',
    id: 'p',
    name: 'Profile',
    paper: {
      totalMarks: 10,
      sections: [],
      cover: {
        ...(answerSheet === null ? {} : { answerSheet }),
        ...(identification ? { identification } : {}),
      },
    },
  }
}

function resolved(questions: ResolvedQuestion[], p: Profile | undefined): ResolvedPaper {
  return {
    paper: { formatVersion: '1', type: 'klunk_paper', id: 't', title: 'Trial', sections: [] },
    profile: p,
    sections: [{ title: 'Section I', marks: 10, offeredMarks: 10, questions }],
    totalMarks: 10,
    missing: [],
    relocated: [],
    images: new Map(),
    syllabusNames: new Map(),
    syllabusTags: new Map(),
    courseNames: new Map(),
  }
}

function sheetFor(questions: ResolvedQuestion[], p: Profile | undefined) {
  const r = resolved(questions, p)
  return answerSheetModel(r, coverModel(r))
}

describe('whether a sheet prints', () => {
  it('prints none unless the profile asks for one', () => {
    const qs = [item(mc('a', 4, 0), 1)]
    expect(sheetFor(qs, undefined)).toBeNull()
    expect(sheetFor(qs, profile(null))).toBeNull()
    expect(sheetFor(qs, profile(false))).toBeNull()
    expect(sheetFor(qs, profile(true))).not.toBeNull()
  })

  it('prints none for a paper with no objective question, even when asked', () => {
    const essay: Question = {
      id: 'e',
      questionType: 'extended_response',
      questionText: 'Discuss.',
      marks: 10,
    }
    expect(sheetFor([item(essay, 1)], profile(true))).toBeNull()
  })
})

describe('the rows', () => {
  it('takes the printed numbers, skips written questions, and is as wide as the widest', () => {
    const essay: Question = {
      id: 'e',
      questionType: 'short_answer',
      questionText: 'Why?',
      marks: 3,
    }
    const sheet = sheetFor(
      [item(mc('a', 4, 1), 1), item(essay, 2), item(mc('b', 5, 2), 3)],
      profile(true),
    )
    expect(sheet?.rows.map((r) => [r.number, r.options])).toEqual([
      [1, 4],
      [3, 5],
    ])
    expect(sheet?.columns).toBe(5)
  })

  it('marks the letter the paper prints, not the one the bank stores', () => {
    // Index 0 in the bank. Whatever the shuffle puts it at is what the key has to say.
    const q = mc('shuffled-question', 4, 0)
    const printed = shuffledChoices(q).correctIndex
    // Otherwise this passes for a sheet that ignores the shuffle.
    expect(printed).not.toBe(0)
    expect(sheetFor([item(q, 1)], profile(true))?.rows[0]?.correct).toEqual([printed])
  })

  it('says nothing is recorded where the question does not say, rather than "none"', () => {
    const sheet = sheetFor([item(mc('a', 4), 1)], profile(true))
    expect(sheet?.rows[0]?.correct).toBeUndefined()
  })

  it('lets a multiple response row hold several answers, and says so', () => {
    const q: Question = {
      id: 'mr',
      questionType: 'multiple_response',
      questionText: 'Which?',
      marks: 2,
      config: { choices: [{ text: 'w' }, { text: 'x' }, { text: 'y' }], correctAnswers: [0, 2] },
    }
    const sheet = sheetFor([item(q, 1)], profile(true))
    expect(sheet?.rows[0]?.multiple).toBe(true)
    expect(sheet?.rows[0]?.correct).toHaveLength(2)
    expect(sheet?.anyMultiple).toBe(true)
  })
})

describe('what the sheet asks a student for', () => {
  const qs = [item(mc('a', 4, 0), 1)]

  it('asks what the cover asks', () => {
    const fields: IdentificationField[] = [
      { label: 'Name', kind: 'write' },
      { label: 'Class', kind: 'write' },
    ]
    expect(sheetFor(qs, profile(true, fields))?.identification.map((f) => f.label)).toEqual([
      'Name',
      'Class',
    ])
  })

  it('does not repeat a field the running header already prints on the page', () => {
    const fields: IdentificationField[] = [
      { label: 'Student number', kind: 'boxes', onEveryPage: true },
    ]
    expect(sheetFor(qs, profile(true, fields))?.identification).toEqual([])
  })

  it('asks for a Name where nothing else is asked, since the sheet is marked apart', () => {
    expect(sheetFor(qs, profile(true))?.identification).toEqual([
      { label: 'Name', kind: 'write', boxes: 0 },
    ])
  })
})
