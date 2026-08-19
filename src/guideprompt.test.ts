/**
 * The prompt for a marking guide Klunk cannot read.
 *
 * Two of these have a real failure behind them rather than a hypothesis.
 *
 * The example is parsed as JSON and asserted against, for `paperprompt.test.ts`'s
 * reason: two runs over real scans flattened `config` because the prompt
 * described the shape instead of showing it. Here the awkward parts are a band
 * carrying `marksTo`, a part keyed by `number` and `part` together, and a
 * matching question answered by links.
 *
 * And the skeleton is asserted to carry no question text. That is the whole
 * privacy difference between this prompt and the paper's: the teacher attaches
 * the guide either way, and nothing Klunk adds should send the questions after
 * it.
 */

import { describe, expect, it } from 'vitest'
import { buildGuidePrompt, type GuidePromptSpec } from './guideprompt'
import type { MarkingSkeleton } from './marking'
import type { Syllabus, SyllabusCourse } from './types'

const QUESTIONS: MarkingSkeleton[] = [
  { number: 1, questionType: 'multiple_choice', marks: 1, optionCount: 4 },
  { number: 10, questionType: 'multiple_response', marks: 1, optionCount: 6 },
  { number: 13, questionType: 'matching', marks: 1, optionCount: 6, itemCount: 6 },
  {
    number: 21,
    questionType: 'short_answer',
    marks: 6,
    parts: [
      { label: 'a', marks: 2 },
      { label: 'b', marks: 4 },
    ],
  },
  { number: 25, questionType: 'extended_response', marks: 15 },
]

const BASE: GuidePromptSpec = {
  examination: 'Enterprise Computing Year 11',
  year: 2025,
  questions: QUESTIONS,
  scanned: true,
}

/** The ```json block of the built prompt, parsed. */
function exampleIn(prompt: string): Record<string, unknown>[] {
  const block = /```json\n([\s\S]*?)```/.exec(prompt)
  expect(block, 'the prompt must carry a worked JSON example').toBeTruthy()
  return JSON.parse(block![1]!) as Record<string, unknown>[]
}

describe('the worked example', () => {
  const prompt = buildGuidePrompt(BASE)

  it('is valid JSON, so a model has a parseable thing to copy', () => {
    expect(Array.isArray(exampleIn(prompt))).toBe(true)
  })

  it('shows a band as one criterion with marksTo, not three entries', () => {
    const banded = exampleIn(prompt)
      .map((e) => e['criteria'] as { marks: number; marksTo?: number }[] | undefined)
      .find((c) => c?.some((x) => x.marksTo !== undefined))
    expect(banded).toBeTruthy()
    expect(banded![0]).toMatchObject({ marks: 13, marksTo: 15 })
  })

  it('keys a part by number and part together', () => {
    const part = exampleIn(prompt).find((e) => e['part'] !== undefined)
    expect(part).toMatchObject({ number: 21, part: 'a' })
  })

  it('answers a matching question with links rather than a letter', () => {
    const links = exampleIn(prompt).find((e) => e['links'] !== undefined)
    expect(links!['answer']).toBeUndefined()
    expect(links!['links']).toEqual([
      { item: 1, options: ['D'] },
      { item: 2, options: ['A'] },
    ])
  })

  it('shows an entry with criteria and no answer at all', () => {
    const criteriaOnly = exampleIn(prompt).filter(
      (e) => e['criteria'] !== undefined && e['answer'] === undefined && e['answers'] === undefined,
    )
    expect(criteriaOnly.length).toBeGreaterThan(0)
  })
})

describe('the skeleton', () => {
  it('names every question with its marks', () => {
    const prompt = buildGuidePrompt(BASE)
    expect(prompt).toContain('1   1 mark')
    expect(prompt).toContain('21  6 marks')
    expect(prompt).toContain('25  15 marks')
  })

  it('says what there is to choose between, so a letter can be checked', () => {
    const prompt = buildGuidePrompt(BASE)
    expect(prompt).toContain('one answer, options A to D')
    expect(prompt).toContain('more than one answer, options A to F')
    expect(prompt).toContain('items 1 to 6 matched to options A to F')
  })

  it('names each part and its marks', () => {
    expect(buildGuidePrompt(BASE)).toContain('parts (a) 2, (b) 4')
  })

  it('carries no question text, because the teacher attaches the guide already', () => {
    const prompt = buildGuidePrompt({
      ...BASE,
      questions: [{ number: 1, questionType: 'multiple_choice', marks: 1, optionCount: 4 }],
    })
    expect(prompt).not.toContain('Which storage medium')
    // Nothing in the skeleton is prose, so the only sentences in the prompt are
    // Klunk's own instructions.
    expect(prompt.split('\n').filter((l) => l.startsWith('  1 '))).toHaveLength(1)
  })

  it('lists only the range asked for', () => {
    const prompt = buildGuidePrompt({ ...BASE, range: { from: 13, to: 21 } })
    expect(prompt).toContain('13  1 mark')
    expect(prompt).toContain('21  6 marks')
    expect(prompt).not.toContain('25  15 marks')
    expect(prompt).toContain('questions 13 to 21 of the attached marking guide')
  })
})

describe('what it forbids', () => {
  const prompt = buildGuidePrompt(BASE)

  it('tells the model not to work an answer out, which is #66 with confidence', () => {
    expect(prompt).toContain('Do not work out the')
    expect(prompt).toContain('Never give an answer the guide does not print')
  })

  it('refuses a letter the question does not offer', () => {
    expect(prompt).toContain('Never give a letter the question does not offer')
  })

  it('asks for what could not be read rather than a filled gap', () => {
    expect(prompt).toContain('"unreadable"')
    expect(prompt).toContain('unreadablePages')
  })
})

describe('what the document is', () => {
  it('says a scan is a scan', () => {
    expect(buildGuidePrompt(BASE)).toContain('scan with no text in it')
  })

  it('does not call a guide with text a scan', () => {
    const prompt = buildGuidePrompt({ ...BASE, scanned: false })
    expect(prompt).not.toContain('scan with no text in it')
    expect(prompt).toContain('Transcribe the attached marking guide into JSON.')
  })
})

describe('the outcomes', () => {
  const syllabus: Syllabus = {
    formatVersion: '1.0.0',
    type: 'klunk_syllabus',
    id: 'nsw-hsc-dt',
    name: 'Design and Technology',
    framework: 'NESA',
    courses: [],
  }
  const course: SyllabusCourse = {
    id: 'hsc',
    name: 'HSC',
    outcomes: [
      { code: 'H1.1', text: 'critically analyses the factors affecting design' },
      { code: 'H3.2', text: 'evaluates and uses appropriate research methods' },
    ],
    topics: [],
  }

  it('lists the codes a reply may name', () => {
    const prompt = buildGuidePrompt({ ...BASE, syllabus, course })
    expect(prompt).toContain('H1.1  critically analyses')
    expect(prompt).toContain('Use no other code')
  })

  it('says nothing about outcomes when no course was chosen', () => {
    expect(buildGuidePrompt(BASE)).not.toContain('## Outcomes')
  })
})

describe('the house rules', () => {
  it('writes no em dash or en dash outside a mark band', () => {
    const prompt = buildGuidePrompt({ ...BASE, range: { from: 1, to: 25 } })
    // The example prints `13 to 15` as two fields, so nothing here quotes a
    // printed band and neither dash has any business in the prompt.
    expect(prompt).not.toMatch(/[—–]/)
  })
})

describe('the markup', () => {
  it('names the guide\'s own fields, not a question stem', () => {
    const prompt = buildGuidePrompt(BASE)
    expect(prompt).toContain('## Markup')
    expect(prompt).toContain("A criterion's description, a sample answer")
    expect(prompt).toContain('pipe table')
  })
})
