/**
 * The prompt for a paper Klunk cannot read.
 *
 * The first test is the one with a real failure behind it. Two runs over real
 * scans both flattened `choices` out of `config`, in 9 of 9 multiple-choice
 * questions each time, because the prompt described the nesting instead of
 * showing it. So the example is parsed here as JSON and asserted against: a
 * prompt whose example stops demonstrating `config` would pass every other test
 * in this file and break the thing it exists to fix.
 */

import { describe, expect, it } from 'vitest'
import { ingestQuestions } from './ingest'
import { buildPaperPrompt, type PaperPromptSpec } from './paperprompt'
import { blocksOf } from './richtext'
import type { Profile, Syllabus, SyllabusCourse } from './types'

const BASE: PaperPromptSpec = {
  examination: 'Enterprise Computing Year 11',
  year: 2025,
  scanned: true,
}

/** The ```json block of the built prompt, parsed. */
function exampleIn(prompt: string): unknown {
  const block = /```json\n([\s\S]*?)```/.exec(prompt)
  expect(block, 'the prompt must carry a worked JSON example').toBeTruthy()
  return JSON.parse(block![1]!)
}

const profile: Profile = {
  formatVersion: '1.0.0',
  type: 'klunk_profile',
  id: 'ec-y11',
  name: 'Enterprise Computing Year 11',
  paper: {
    totalMarks: 60,
    sections: [
      { id: 'I', name: 'Section I', marks: 15, questionCount: 15, marksPerQuestion: 1 },
      { id: 'II', name: 'Section II', marks: 45, questionCount: 15 },
    ],
  },
}

describe('the worked example', () => {
  const prompt = buildPaperPrompt(BASE)

  it('is valid JSON, so a model has a parseable thing to copy', () => {
    expect(Array.isArray(exampleIn(prompt))).toBe(true)
  })

  it('nests choices inside config, which is the whole reason it exists', () => {
    const first = (exampleIn(prompt) as Record<string, unknown>[])[0]!
    expect(first['questionType']).toBe('multiple_choice')
    expect(first['choices'], 'choices must not sit at the top level').toBeUndefined()
    const config = first['config'] as Record<string, unknown>
    expect(Array.isArray(config['choices'])).toBe(true)
    expect(config['choices']).toHaveLength(4)
  })

  it('nests parts inside config too', () => {
    const parts = (exampleIn(prompt) as Record<string, unknown>[])
      .map((q) => (q['config'] as Record<string, unknown> | undefined)?.['parts'])
      .find(Boolean) as { marks: number }[]
    expect(parts).toHaveLength(2)
    expect(parts.reduce((n, p) => n + p.marks, 0)).toBe(4)
  })

  it('shows no correctAnswer anywhere, because a question paper prints none', () => {
    for (const q of exampleIn(prompt) as Record<string, unknown>[]) {
      expect(q['correctAnswer']).toBeUndefined()
      expect(
        (q['config'] as Record<string, unknown> | undefined)?.['correctAnswer'],
      ).toBeUndefined()
    }
    expect(prompt).toMatch(/only if the paper states the answer/i)
  })

  it('carries the question number and section, which are the paper talking', () => {
    const first = (exampleIn(prompt) as Record<string, unknown>[])[0]!
    expect(first['number']).toBe(1)
    expect(first['section']).toBe('I')
  })
})

describe('asking for part of a paper', () => {
  it('asks for the whole paper when no range is given', () => {
    expect(buildPaperPrompt(BASE)).toMatch(/every question in the attached examination paper/i)
  })

  it('names the run of questions when one is', () => {
    // The 2024 run stopped inside question 28 of 30, which is an output limit
    // rather than anything about the document.
    const prompt = buildPaperPrompt({ ...BASE, range: { from: 16, to: 30 } })
    expect(prompt).toMatch(/questions 16 to 30/)
    expect(prompt).toMatch(/Return only questions 16 to 30/)
    expect(prompt).not.toMatch(/every question in the attached/i)
  })
})

describe('what the paper is', () => {
  it('states the totals from the profile, and refuses to have them fudged', () => {
    const prompt = buildPaperPrompt({ ...BASE, profile })
    expect(prompt).toContain('60 marks')
    // One mark, not "1 marks each", which the first generated prompt printed.
    expect(prompt).toContain('Section I: 15 questions, 15 marks, 1 mark each')
    expect(prompt).toContain('Section II: 15 questions, 45 marks')
    expect(prompt).toMatch(/Do not\s+adjust a mark to make a total work/)
  })

  it('says nothing about structure when the folder has no profile', () => {
    // Asserted on the sentence the profile block alone contributes. "marks."
    // appears in the field list either way, which is what the first version of
    // this test caught itself on.
    const prompt = buildPaperPrompt(BASE)
    expect(prompt).not.toMatch(/Those totals are what the paper prints/)
    expect(prompt).not.toContain('Section I:')
  })
})

describe('tagging', () => {
  const course: SyllabusCourse = {
    id: 'y11',
    name: 'Year 11',
    topics: [
      { id: 'Y11-01', name: 'Interactive media', group: 'Enterprise systems' },
      { id: 'Y11-02', name: 'Cybersecurity' },
    ],
  } as SyllabusCourse
  const syllabus = { id: 'ec', name: 'Enterprise Computing' } as Syllabus

  it('lists topic ids with their area, and never content points', () => {
    const prompt = buildPaperPrompt({ ...BASE, syllabus, course })
    expect(prompt).toContain('Y11-01  Enterprise systems: Interactive media')
    expect(prompt).toContain('Y11-02  Cybersecurity')
    expect(prompt).toMatch(/Leave "topicIds" out where you are unsure/)
  })

  it('leaves the section out entirely when no course was chosen', () => {
    expect(buildPaperPrompt(BASE)).not.toContain('topicIds"')
  })
})

describe('the copy', () => {
  it('uses no em or en dashes, as every teacher-facing string must', () => {
    const prompt = buildPaperPrompt({ ...BASE, profile })
    expect(prompt).not.toMatch(/[—–]/)
  })

  it('warns that the pages may be upside down or two to an image', () => {
    const prompt = buildPaperPrompt(BASE)
    expect(prompt).toMatch(/upside down/)
    expect(prompt).toMatch(/two pages side by side/)
  })
})

/**
 * The markup, which is the second thing a description alone did not carry.
 *
 * A real import came back with a question's table flattened into a paragraph of
 * values, because no prompt had ever mentioned that Klunk reads a pipe table
 * (#101). The example is checked through `blocksOf` rather than by eye: a
 * prompt teaching a shape the reader does not read is worse than one teaching
 * nothing.
 */
describe('the markup', () => {
  const prompt = buildPaperPrompt(BASE)

  it('asks for a table as a table, and for the three marks', () => {
    expect(prompt).toContain('pipe table')
    expect(prompt).toContain('Never flatten a table into a sentence')
    expect(prompt).toContain('**bold**, *italic* and <u>underline</u>')
  })

  it('says how a line break is written, since the whole table is one JSON string', () => {
    expect(prompt).toContain('\\n inside a JSON string')
  })

  it('shows a table that Klunk itself reads as a table', () => {
    const questions = exampleIn(prompt) as Record<string, string>[]
    const withTable = questions.find((q) => (q['questionText'] ?? '').includes('|'))
    expect(withTable, 'the example must demonstrate a table').toBeTruthy()

    const blocks = blocksOf(withTable!['questionText']!)
    expect(blocks.map((b) => b.kind)).toEqual(['text', 'table', 'text'])
    const table = blocks[1]!
    if (table.kind !== 'table') throw new Error('unreachable')
    expect(table.head).toEqual(['Time', 'Temperature (\u00b0C)'])
    expect(table.rows).toHaveLength(3)
  })

  it('keeps the fill-in table type apart from a table the student only reads', () => {
    expect(prompt).toContain('A table the student only reads is not this')
  })

  it('asks for the fill-in table by its own fields, which is what #108 was', () => {
    expect(prompt).toContain('Put the headings in "columns" and the row labels in "rows"')
    expect(prompt).not.toContain('put the column')
  })
})

/**
 * The example, read back by the thing that reads a real reply.
 *
 * Every other test here asserts what the prompt *says*. This one asserts that a
 * model doing exactly what it says produces a question Klunk will accept, which
 * is the only claim that matters and the one that was false: the prompt offered
 * `table`, described neither `columns` nor `rows`, and told the model to put the
 * headings in `questionText`, so a faithful transcription of the Enterprise
 * Computing 2026 trial's question 11 came back saying *A table needs at least
 * one column.* and could not be saved (#108).
 *
 * It runs `ingestQuestions` rather than `validateQuestion` on a literal, so the
 * whole path the reply takes is under the test: a field the prompt asks for and
 * `ingest.ts` does not read would fail here too.
 */
describe('a reply that does exactly what the prompt says', () => {
  const prompt = buildPaperPrompt(BASE)

  function readExample() {
    return ingestQuestions(JSON.stringify(exampleIn(prompt)), {
      bankPath: 'bank/scan.json',
      inFolder: new Set<string>(),
      inBank: new Set<string>(),
      topicIds: [],
      points: [],
      outcomes: [],
      paper: { examination: 'Enterprise Computing Year 12 Trial', year: 2026 },
    })
  }

  it('reads every question of the example, rejecting none', () => {
    const out = readExample()
    expect(out.failure).toBeUndefined()
    expect(out.rejected).toEqual([])
    expect(out.drafts).toHaveLength((exampleIn(prompt) as unknown[]).length)
  })

  it('leaves no question in error, because the example must be a shape Klunk takes', () => {
    const errors = readExample().drafts.flatMap((d) =>
      d.faults
        .filter((f) => f.severity === 'error')
        .map((f) => `${d.question.questionType}: ${f.message}`),
    )
    expect(errors).toEqual([])
  })

  it('gives the table question its columns and rows, not a stem full of headings', () => {
    const draft = readExample().drafts.find((d) => d.question.questionType === 'table')
    expect(draft, 'the example must demonstrate a fill-in table').toBeTruthy()

    const cfg = draft!.question.config ?? {}
    expect(cfg.columns).toHaveLength(4)
    expect(cfg.columns?.[0]).toBe('Activity')
    expect(cfg.rows).toHaveLength(3)
    expect(draft!.question.questionText).not.toContain('Computational thinking')
  })
})
