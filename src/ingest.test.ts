/**
 * Tests for reading back whatever the AI returned.
 *
 * Every case here is something a model has actually done to structured output:
 * wrapped it in prose, fenced it, answered with one object instead of a list,
 * written the correct answer as a letter, invented a syllabus id. The rule
 * being tested is not that Klunk copes, but that when it copes it says so.
 * A silent repair is the failure mode this whole module exists to prevent.
 */

import { describe, expect, it } from 'vitest'
import {
  AI_TAG,
  AI_TRANSCRIBED_TAG,
  extractJson,
  ingestQuestions,
  type IngestContext,
} from './ingest'

function ctx(over: Partial<IngestContext> = {}): IngestContext {
  return {
    bankPath: 'bank/questions.json',
    inFolder: new Set<string>(),
    inBank: new Set<string>(),
    syllabusId: 'nsw-hsc-design-technology',
    courseId: 'hsc',
    topicIds: ['HSC-01', 'HSC-13'],
    points: [
      { id: 'HSC-01.06', topicId: 'HSC-01' },
      { id: 'HSC-01.07', topicId: 'HSC-01' },
      { id: 'HSC-13.01', topicId: 'HSC-13' },
    ],
    outcomes: ['H1.1', 'H4.2'],
    expected: { questionType: 'short_answer', marks: 4 },
    ...over,
  }
}

/**
 * One good short answer question, as JSON, with anything overridden.
 *
 * Built rather than edited with string replacement: a `.replace` that quietly
 * matches nothing turns a test of the repair into a test of the happy path,
 * and passes.
 */
function answer(over: Record<string, unknown> = {}): string {
  return JSON.stringify([
    {
      questionType: 'short_answer',
      questionText: 'Explain how ergonomics shapes the handle of a garden tool.',
      marks: 4,
      syllabus: { pointIds: ['HSC-01.06'] },
      outcomes: ['H1.1'],
      markingGuide: { sampleAnswer: 'The grip diameter follows the span of an adult hand.' },
      config: { answerLines: 8 },
      ...over,
    },
  ])
}

const ONE_SHORT_ANSWER = answer()

function first(pasted: string, context: IngestContext = ctx()) {
  const result = ingestQuestions(pasted, context)
  const draft = result.drafts[0]
  if (!draft) throw new Error(`nothing ingested: ${result.failure ?? 'no failure given'}`)
  return { result, draft }
}

/* ------------------------------------------------------------ finding the JSON */

describe('extractJson', () => {
  it('takes bare JSON as it stands', () => {
    const found = extractJson('[{"a":1}]')
    expect(found).toEqual({ json: '[{"a":1}]' })
  })

  it('reads it out of a fenced code block and says it did', () => {
    const found = extractJson('Here you go:\n\n```json\n[{"a":1}]\n```\n\nHope that helps!')
    expect(found).toMatchObject({ json: '[{"a":1}]\n' })
    expect((found as { note: string }).note).toContain('code block')
  })

  it('carves it out of surrounding prose with no fence at all', () => {
    const found = extractJson('Sure. [{"a":1}] Let me know if you want more.')
    expect(found).toMatchObject({ json: '[{"a":1}]' })
    expect((found as { note: string }).note).toContain('Ignored the writing')
  })

  it('refuses an empty paste rather than guessing', () => {
    expect(extractJson('   \n ')).toEqual({ failure: 'Nothing pasted yet.' })
  })

  it('hands back the likeliest candidate when nothing parses, so the error is about the JSON', () => {
    const found = extractJson('Here:\n```json\n[{"a":1,}\n```')
    expect(found).toHaveProperty('json')
    expect((found as { json: string }).json).toContain('"a":1,')
  })
})

/* ------------------------------------------------------------------ the shapes */

describe('what came back', () => {
  it('reads a plain array', () => {
    expect(ingestQuestions(ONE_SHORT_ANSWER, ctx()).drafts).toHaveLength(1)
  })

  it('reads an object wrapped around the list and says it unwrapped it', () => {
    const result = ingestQuestions(`{"questions": ${ONE_SHORT_ANSWER}}`, ctx())
    expect(result.drafts).toHaveLength(1)
    expect(result.notes.join(' ')).toContain('wrapped around them')
  })

  it('reads a whole bank file and takes only the questions', () => {
    const bank = `{"formatVersion":"1","type":"klunk_bank","questions": ${ONE_SHORT_ANSWER}}`
    const result = ingestQuestions(bank, ctx())
    expect(result.drafts).toHaveLength(1)
    expect(result.notes.join(' ')).toContain('whole bank file')
  })

  it('reads a single question given on its own', () => {
    const one = JSON.parse(ONE_SHORT_ANSWER) as unknown[]
    const result = ingestQuestions(JSON.stringify(one[0]), ctx())
    expect(result.drafts).toHaveLength(1)
    expect(result.notes.join(' ')).toContain('single question')
  })

  it('explains itself when the JSON is not questions at all', () => {
    const result = ingestQuestions('{"summary":"I wrote three questions","topic":"ergonomics"}', ctx())
    expect(result.drafts).toEqual([])
    expect(result.failure).toContain('summary, topic')
  })

  it('names the JSON error rather than complaining about the prose around it', () => {
    const result = ingestQuestions('Here you are:\n```json\n[{"questionText": "x",}]\n```', ctx())
    expect(result.drafts).toEqual([])
    expect(result.failure).toContain('not valid JSON')
    expect(result.failure).toContain('fewer questions')
  })

  it('rejects an entry that is not a question and keeps the ones that are', () => {
    const mixed = `[${ONE_SHORT_ANSWER.slice(1, -1)}, "just a string"]`
    const result = ingestQuestions(mixed, ctx())
    expect(result.drafts).toHaveLength(1)
    expect(result.rejected).toEqual([{ at: 1, why: 'expected a question object, got string' }])
  })

  it('rejects a question with no text, because there is nothing to ask', () => {
    const result = ingestQuestions('[{"questionType":"short_answer","marks":4}]', ctx())
    expect(result.drafts).toEqual([])
    expect(result.rejected[0]?.why).toContain('no question text')
  })
})

/* ------------------------------------------------------------- what Klunk owns */

describe('the fields Klunk keeps for itself', () => {
  it('assigns its own id and says whose it replaced', () => {
    const { draft } = first(answer({ id: 'q1' }))
    expect(draft.question.id).toBe('questions-sa-01')
    expect(draft.repairs.join(' ')).toContain('Replaced the id "q1"')
  })

  it('gives every question in one batch a different id', () => {
    const two = `[${ONE_SHORT_ANSWER.slice(1, -1)}, ${ONE_SHORT_ANSWER.slice(1, -1)}]`
    const ids = ingestQuestions(two, ctx()).drafts.map((d) => d.question.id)
    expect(ids).toEqual(['questions-sa-01', 'questions-sa-02'])
  })

  it('avoids an id already in the folder', () => {
    const { draft } = first(ONE_SHORT_ANSWER, ctx({ inFolder: new Set(['questions-sa-01']) }))
    expect(draft.question.id).toBe('questions-sa-02')
    expect(draft.faults.filter((f) => f.severity === 'error')).toEqual([])
  })

  it('stamps the syllabus and course from the prompt, not from the answer', () => {
    const claimed = answer({
      syllabus: { syllabusId: 'invented', courseId: 'invented', pointIds: ['HSC-01.06'] },
    })
    const { draft } = first(claimed)
    expect(draft.question.syllabus?.syllabusId).toBe('nsw-hsc-design-technology')
    expect(draft.question.syllabus?.courseId).toBe('hsc')
  })

  it('tags a question the model wrote as drafted by a model', () => {
    const { draft } = first(ONE_SHORT_ANSWER)
    expect(draft.question.tags).toContain(AI_TAG)
    expect(draft.question.tags).not.toContain(AI_TRANSCRIBED_TAG)
  })

  /**
   * The distinction a teacher asks about later is where a question came from,
   * and a transcription wearing the drafting tag loses it: the wording, the
   * marks and the options are the examination's, and the model read a picture
   * of them.
   */
  it('tags a question transcribed off a paper as transcribed, not drafted', () => {
    const { draft } = first(
      ONE_SHORT_ANSWER,
      ctx({ paper: { examination: 'Enterprise Computing Year 11', year: 2025 } }),
    )
    expect(draft.question.tags).toContain(AI_TRANSCRIBED_TAG)
    expect(draft.question.tags).not.toContain(AI_TAG)
  })

  it('refuses the model its own claim about which of the two it is', () => {
    const { draft } = first(
      answer({ tags: ['ai-drafted', 'ergonomics'] }),
      ctx({ paper: { examination: 'Enterprise Computing Year 11' } }),
    )
    expect(draft.question.tags).toEqual(['ergonomics', AI_TRANSCRIBED_TAG])
  })

  it('keeps the model\'s other tags either way', () => {
    const { draft } = first(answer({ tags: ['ergonomics', 'year-11'] }))
    expect(draft.question.tags).toEqual(['ergonomics', 'year-11', AI_TAG])
  })

  it('throws away a provenance the model made up, and says so', () => {
    const { draft } = first(answer({ source: { origin: 'extracted', year: 2019 } }))
    expect(draft.question.source).toBeUndefined()
    expect(draft.repairs.join(' ')).toContain('Dropped the source')
  })
})

/* ------------------------------------------------------------------- tagging */

describe('syllabus tagging', () => {
  it('keeps only the ids the prompt offered', () => {
    const { draft } = first(answer({ syllabus: { pointIds: ['HSC-01.06', 'HSC-99.99'] } }))
    expect(draft.question.syllabus?.pointIds).toEqual(['HSC-01.06'])
    expect(draft.repairs.join(' ')).toContain('HSC-99.99')
  })

  it('tags the topic a named point belongs to', () => {
    const { draft } = first(ONE_SHORT_ANSWER)
    expect(draft.question.syllabus?.topicIds).toEqual(['HSC-01'])
  })

  it('drops an outcome code the course does not have', () => {
    const { draft } = first(answer({ outcomes: ['H1.1', 'H9.9'] }))
    expect(draft.question.outcomes).toEqual(['H1.1'])
    // "a outcome code" is what a teacher reads on the screen, so the article
    // has to follow the noun rather than be baked into the sentence.
    expect(draft.repairs.join(' ')).toContain('Dropped an outcome code the prompt did not offer: H9.9.')
  })

  it('says a question came back untagged rather than guessing a topic for it', () => {
    const { draft } = first(answer({ syllabus: undefined }))
    expect(draft.question.syllabus?.pointIds).toBeUndefined()
    expect(draft.repairs.join(' ')).toContain('untagged')
  })

  it('tags the only point there was when the prompt offered exactly one', () => {
    const { draft } = first(
      answer({ syllabus: undefined }),
      ctx({ topicIds: ['HSC-01'], points: [{ id: 'HSC-01.06', topicId: 'HSC-01' }] }),
    )
    expect(draft.question.syllabus?.pointIds).toEqual(['HSC-01.06'])
    expect(draft.repairs.join(' ')).toContain('the only content point')
  })
})

/* --------------------------------------------------------------- the stem */

describe('the type and the marks', () => {
  it('reads a type written the way a person would write it', () => {
    const { draft } = first(answer({ questionType: 'Multiple Choice', config: {} }))
    expect(draft.question.questionType).toBe('multiple_choice')
  })

  it('falls back to the type asked for when the answer names one Klunk has not got', () => {
    const { draft } = first(answer({ questionType: 'fill_in_the_blank' }))
    expect(draft.question.questionType).toBe('short_answer')
    expect(draft.repairs.join(' ')).toContain('not a question type Klunk has')
  })

  it('reads marks out of a string', () => {
    const { draft } = first(answer({ marks: '4 marks' }))
    expect(draft.question.marks).toBe(4)
    expect(draft.repairs.join(' ')).toContain('Read the marks')
  })

  it('says when the answer is worth something other than what was asked for', () => {
    const { draft } = first(answer({ marks: 6 }))
    expect(draft.question.marks).toBe(6)
    expect(draft.repairs.join(' ')).toContain('worth 6 marks, not the 4')
  })

  it('drops a difficulty outside the scale', () => {
    const { draft } = first(answer({ difficulty: 8 }))
    expect(draft.question.difficulty).toBeUndefined()
    expect(draft.repairs.join(' ')).toContain('difficulty runs from 1 to 5')
  })

  it('lists the fields it did not store', () => {
    const { draft } = first(answer({ timeMinutes: 6, rubric: 'x' }))
    expect(draft.repairs.join(' ')).toContain('timeMinutes, rubric')
  })
})

/* -------------------------------------------------------------- multiple choice */

const MC = (correct: string) => `[{
  "questionType": "multiple_choice",
  "questionText": "Which property matters most to the safety of a kettle handle?",
  "marks": 1,
  "syllabus": { "pointIds": ["HSC-01.07"] },
  "config": {
    "choices": [
      { "text": "Thermal conductivity", "feedback": "Correct." },
      { "text": "Density" },
      { "text": "Surface finish" },
      { "text": "Recyclability" }
    ],
    "correctAnswer": ${correct}
  }
}]`

describe('multiple choice, where a model most often goes wrong', () => {
  const mcCtx = ctx({ expected: { questionType: 'multiple_choice', marks: 1 } })

  it('takes a proper index as given', () => {
    const { draft } = first(MC('0'), mcCtx)
    expect(draft.question.config?.correctAnswer).toBe(0)
    expect(draft.repairs).toEqual([])
  })

  it('turns a letter into an index and names the option it landed on', () => {
    const { draft } = first(MC('"B"'), mcCtx)
    expect(draft.question.config?.correctAnswer).toBe(1)
    expect(draft.repairs.join(' ')).toContain('option B, "Density"')
  })

  it('matches the answer by its wording when it repeats the option', () => {
    const { draft } = first(MC('"Surface finish"'), mcCtx)
    expect(draft.question.config?.correctAnswer).toBe(2)
    expect(draft.repairs.join(' ')).toContain('by its wording')
  })

  it('warns rather than assumes when the index arrives as a string', () => {
    const { draft } = first(MC('"2"'), mcCtx)
    expect(draft.question.config?.correctAnswer).toBe(2)
    expect(draft.repairs.join(' ')).toContain('counting from zero')
  })

  it('takes the correct option off a flag on the option itself', () => {
    const flagged = `[{
      "questionType": "multiple_choice",
      "questionText": "Which property matters most?",
      "marks": 1,
      "config": { "choices": [
        { "text": "Density" },
        { "text": "Thermal conductivity", "correct": true }
      ] }
    }]`
    const { draft } = first(flagged, mcCtx)
    expect(draft.question.config?.correctAnswer).toBe(1)
    expect(draft.repairs.join(' ')).toContain('"correct" flag')
  })

  it('turns a list of plain strings into options', () => {
    const bare = `[{
      "questionType": "multiple_choice",
      "questionText": "Which property matters most?",
      "marks": 1,
      "config": { "choices": ["Density", "Thermal conductivity"], "correctAnswer": 1 }
    }]`
    const { draft } = first(bare, mcCtx)
    expect(draft.question.config?.choices).toEqual([
      { text: 'Density' },
      { text: 'Thermal conductivity' },
    ])
  })

  it('leaves no answer marked, and lets validation say so, when it cannot tell', () => {
    const { draft } = first(MC('"the first one"'), mcCtx)
    expect(draft.question.config?.correctAnswer).toBeUndefined()
    expect(draft.repairs.join(' ')).toContain('no answer is marked')
    expect(draft.faults.map((f) => f.message)).toContain('Mark one option as the correct answer.')
  })

  it('errors on an index that is past the end of the options', () => {
    const { draft } = first(MC('7'), mcCtx)
    expect(draft.faults.map((f) => f.message)).toContain(
      'The correct option is not one of the options listed.',
    )
  })
})

describe('multiple response', () => {
  const mrCtx = ctx({ expected: { questionType: 'multiple_response', marks: 1 } })

  const MR = (config: string) => `[{
    "questionType": "multiple_response",
    "questionText": "Which of the following are video file formats?",
    "marks": 1,
    "config": ${config}
  }]`

  const six = `[
    { "text": "WAV" }, { "text": "MOV" }, { "text": "PNG" },
    { "text": "MP3" }, { "text": "MP4" }, { "text": "MIDI" }
  ]`

  it('takes a list of indices as given', () => {
    const { draft } = first(MR(`{ "choices": ${six}, "correctAnswers": [1, 4] }`), mrCtx)
    expect(draft.question.config?.correctAnswers).toEqual([1, 4])
    // The only repair is about the missing tagging, not about the answers: a
    // reply in the shape the prompt asked for is taken silently.
    expect(draft.repairs.join(' ')).not.toContain('answer')
  })

  it('takes the answers from flags on the options, which is what a model usually does', () => {
    const flagged = MR(`{ "choices": [
      { "text": "WAV" },
      { "text": "MOV", "correct": true },
      { "text": "PNG" },
      { "text": "MP4", "correct": true }
    ] }`)
    const { draft } = first(flagged, mrCtx)
    expect(draft.question.config?.correctAnswers).toEqual([1, 3])
    expect(draft.repairs.join(' ')).toContain('"correct" flag')
  })

  it('turns a list of letters into indices', () => {
    const { draft } = first(MR(`{ "choices": ${six}, "correctAnswers": ["B", "E"] }`), mrCtx)
    expect(draft.question.config?.correctAnswers).toEqual([1, 4])
  })

  it('sorts and deduplicates what it was given', () => {
    const { draft } = first(MR(`{ "choices": ${six}, "correctAnswers": [4, 1, 4] }`), mrCtx)
    expect(draft.question.config?.correctAnswers).toEqual([1, 4])
  })

  it('leaves the answers absent rather than empty when none are stated', () => {
    // A transcribed paper states no answers, and `[]` would say every option is
    // wrong. Validation warns; it must not error, or the paper cannot be saved.
    const { draft } = first(MR(`{ "choices": ${six} }`), mrCtx)
    expect(draft.question.config?.correctAnswers).toBeUndefined()
    expect(draft.faults.filter((f) => f.severity === 'error')).toEqual([])
  })
})

describe('matching', () => {
  const matchCtx = ctx({ expected: { questionType: 'matching', marks: 1 } })

  const MATCH = (config: string) => `[{
    "questionType": "matching",
    "questionText": "Match the media type with its file format.",
    "marks": 1,
    "config": ${config}
  }]`

  it('reads two columns of plain strings and the links between them', () => {
    const { draft } = first(
      MATCH(`{
        "items": [ { "text": "Video", "matches": [1] }, { "text": "Audio", "matches": [0] } ],
        "options": ["MP3", "MP4"]
      }`),
      matchCtx,
    )
    expect(draft.question.config?.options).toEqual([{ text: 'MP3' }, { text: 'MP4' }])
    expect(draft.question.config?.items?.[0]?.matches).toEqual([1])
  })

  it('reads pairs given by wording, building the lettered column as it goes', () => {
    const { draft } = first(
      MATCH(`{ "pairs": [
        { "left": "Video", "right": "MP4" },
        { "left": "Audio", "right": "MP3" }
      ] }`),
      matchCtx,
    )
    expect(draft.question.config?.options).toEqual([{ text: 'MP4' }, { text: 'MP3' }])
    expect(draft.question.config?.items?.map((i) => i.matches)).toEqual([[0], [1]])
    expect(draft.repairs.join(' ')).toContain('Added "MP4"')
  })

  it('leaves an item unlinked rather than guessing, and does not error for it', () => {
    const { draft } = first(
      MATCH(`{
        "items": [ { "text": "Video" }, { "text": "Audio" } ],
        "options": ["MP3", "MP4"]
      }`),
      matchCtx,
    )
    expect(draft.question.config?.items?.[0]?.matches).toBeUndefined()
    expect(draft.faults.filter((f) => f.severity === 'error')).toEqual([])
  })

  it('drops a link to an option that does not exist', () => {
    // Better an unlinked item than a link into nothing: the second prints a
    // letter on the guide that is on no paper.
    const { draft } = first(
      MATCH(`{
        "items": [ { "text": "Video", "matches": [9] } ],
        "options": ["MP3", "MP4"]
      }`),
      matchCtx,
    )
    expect(draft.question.config?.items?.[0]?.matches).toBeUndefined()
  })
})

/* -------------------------------------------------------------- the other types */

describe('the other types', () => {
  it('reads true or false written as a word', () => {
    const tf = `[{"questionType":"true_false","questionText":"A Gantt chart shows duration.","marks":1,"config":{"correctAnswer":"True"}}]`
    const { draft } = first(tf, ctx({ expected: { questionType: 'true_false', marks: 1 } }))
    expect(draft.question.config?.correctAnswer).toBe(true)
    expect(draft.repairs.join(' ')).toContain('as true')
  })

  it('labels unlabelled parts in the order they came back', () => {
    const parts = `[{"questionType":"short_answer","questionText":"A designer selects a finish.","marks":4,
      "config":{"parts":[{"text":"Identify TWO criteria.","marks":2},{"text":"Explain one consequence.","marks":2}]}}]`
    const { draft } = first(parts)
    expect(draft.question.config?.parts?.map((p) => p.label)).toEqual(['(a)', '(b)'])
    expect(draft.repairs.join(' ')).toContain('Labelled 2 parts')
  })

  it('reads a cell per column, keeping each column its own accepted answers', () => {
    const table = `[{"questionType":"table","questionText":"Complete the table.","marks":3,
      "config":{"columns":["Purpose","Method","Why"],"rows":[{"label":"Timing a task",
      "cells":[{"answers":["Observation","Time study"]},{"answers":["It records what people do rather than what they say"]}],"marks":1}]}}]`
    const { draft } = first(table, ctx({ expected: { questionType: 'table', marks: 3 } }))
    expect(draft.question.config?.rows?.[0]?.cells).toEqual([
      { answers: ['Observation', 'Time study'] },
      { answers: ['It records what people do rather than what they say'] },
    ])
    expect(draft.repairs.join(' ')).not.toContain('flat list')
  })

  it('reads a flat list of answers into the first answer column and says so', () => {
    const table = `[{"questionType":"table","questionText":"Complete the table.","marks":3,
      "config":{"columns":["Purpose","Method","Why"],"rows":[{"label":"Timing a task","answers":["Observation"],"marks":1}]}}]`
    const { draft } = first(table, ctx({ expected: { questionType: 'table', marks: 3 } }))
    // Read into one column, not spread across all of them: spreading it is the
    // bug this shape replaced.
    expect(draft.question.config?.rows?.[0]?.cells).toEqual([{ answers: ['Observation'] }])
    expect(draft.repairs.join(' ')).toContain('one flat list of answers')
  })

  it('reads a drawing space given as width and height', () => {
    const drawing = `[{"questionType":"drawing","questionText":"Sketch a bracket.","marks":4,
      "config":{"subtype":"sketch","space":{"width":160,"height":110}}}]`
    const { draft } = first(drawing, ctx({ expected: { questionType: 'drawing', marks: 4 } }))
    expect(draft.question.config?.spaceMm).toEqual([160, 110])
  })

  it('drops a kind of drawing Klunk cannot print', () => {
    const drawing = `[{"questionType":"drawing","questionText":"Sketch a bracket.","marks":4,
      "config":{"subtype":"isometric"}}]`
    const { draft } = first(drawing, ctx({ expected: { questionType: 'drawing', marks: 4 } }))
    expect(draft.question.config?.subtype).toBeUndefined()
    expect(draft.repairs.join(' ')).toContain('"isometric"')
  })

  it('drops an image stimulus, because Klunk cannot fetch a picture a model names', () => {
    const { draft } = first(
      answer({
        stimulus: [
          { kind: 'image', file: 'bracket.png', alt: 'a bracket' },
          { kind: 'text', text: 'A workshop brief.' },
        ],
      }),
    )
    expect(draft.question.stimulus).toEqual([{ kind: 'text', text: 'A workshop brief.' }])
    expect(draft.repairs.join(' ')).toContain('cannot fetch a picture')
  })

  it('drops a marking criterion with nothing in it', () => {
    const guide = answer({
      markingGuide: { criteria: [{ marks: 2, description: 'Names the property.' }, { marks: 2 }] },
    })
    const { draft } = first(guide)
    expect(draft.question.markingGuide?.criteria).toHaveLength(1)
    expect(draft.repairs.join(' ')).toContain('no marks or no description')
  })

  it('ignores a config setting the type does not have', () => {
    const { draft } = first(answer({ config: { answerLines: 8, choices: [] } }))
    expect(draft.repairs.join(' ')).toContain('does not have: choices')
  })
})

/* ---------------------------------------------------------------- end to end */

describe('a clean answer', () => {
  it('needs no repairs and raises no errors', () => {
    const { draft } = first(ONE_SHORT_ANSWER)
    expect(draft.repairs).toEqual([])
    expect(draft.faults.filter((f) => f.severity === 'error')).toEqual([])
  })

  it('survives being fenced, prefaced and followed by chatter', () => {
    const messy = `Certainly! Here are three questions.\n\n\`\`\`json\n${ONE_SHORT_ANSWER}\n\`\`\`\n\nLet me know if you would like more.`
    const { draft, result } = first(messy)
    expect(result.notes).toHaveLength(1)
    expect(draft.question.questionText).toContain('ergonomics')
  })
})

/* ------------------------------------------------- transcribing a past paper */

/**
 * The extraction side, all of it established by two real runs over scanned Year
 * 11 Enterprise Computing papers (#89) rather than imagined.
 */
describe('reading back a paper somebody transcribed', () => {
  const paper = { examination: 'Enterprise Computing Year 11', year: 2025 }

  /** A multiple choice question shaped as both real runs actually returned one. */
  function flattened(over: Record<string, unknown> = {}): string {
    return JSON.stringify([
      {
        number: 7,
        questionType: 'multiple_choice',
        questionText: 'What is the purpose of a firewall in a cybersecurity system?',
        marks: 1,
        section: 'I',
        // Beside "config", not inside it, which is what cost every option.
        choices: [
          { text: 'To detect and remove viruses' },
          { text: 'To manage user authentication' },
          { text: 'To encrypt data being transmitted' },
          { text: 'To monitor and control incoming and outgoing network traffic' },
        ],
        ...over,
      },
    ])
  }

  it('recovers options the model left beside config instead of inside it', () => {
    const { draft } = first(flattened(), ctx({ expected: undefined }))

    expect(draft.question.config?.choices).toHaveLength(4)
    expect(draft.question.config?.choices?.[3]?.text).toContain('incoming and outgoing')
    expect(draft.repairs.join(' ')).toContain('Moved choices')
    // The fault this replaced: options dropped, then reported as missing.
    expect(draft.faults.map((f) => f.message).join(' ')).not.toContain('at least two options')
  })

  it('prefers what was nested, where a reply gives both', () => {
    const { draft } = first(
      flattened({ config: { choices: [{ text: 'The nested one' }, { text: 'And its pair' }] } }),
      ctx({ expected: undefined }),
    )

    expect(draft.question.config?.choices).toHaveLength(2)
    expect(draft.question.config?.choices?.[0]?.text).toBe('The nested one')
  })

  it('still reports a top-level field that is not this type of question\'s', () => {
    const { draft } = first(flattened({ spaceMm: [180, 240] }), ctx({ expected: undefined }))

    expect(draft.repairs.join(' ')).toContain('spaceMm')
  })

  it('takes the marks the paper printed, without calling them a departure', () => {
    const { draft } = first(flattened({ marks: 5 }), ctx({ expected: undefined }))

    expect(draft.question.marks).toBe(5)
    expect(draft.repairs.join(' ')).not.toMatch(/asked for/)
  })

  it('refuses to invent marks when there is nothing to work them out from', () => {
    const { draft } = first(flattened({ marks: undefined }), ctx({ expected: undefined }))

    expect(draft.question.marks).toBe(0)
    expect(draft.repairs.join(' ')).toContain('nothing to work them out from')
    expect(draft.faults.some((f) => f.severity === 'error')).toBe(true)
  })

  it('keeps the question number as provenance, which a model can know', () => {
    const { draft } = first(flattened(), ctx({ expected: undefined, paper }))

    expect(draft.question.source).toEqual({
      origin: 'extracted',
      paper: 'Enterprise Computing Year 11',
      year: 2025,
      questionNumber: '7',
    })
  })

  it('leaves the number alone, and says so, when nothing came off a paper', () => {
    const { draft } = first(flattened(), ctx({ expected: undefined }))

    expect(draft.question.source).toBeUndefined()
    expect(draft.repairs.join(' ')).toContain('number')
  })

  it('carries what could not be read through as a warning, never dropping it', () => {
    const { draft } = first(
      flattened({ unreadable: 'The router labels could not be made out.' }),
      ctx({ expected: undefined, paper }),
    )

    const warnings = draft.faults.filter((f) => f.severity === 'warning').map((f) => f.message)
    expect(warnings.join(' ')).toContain('The router labels could not be made out.')
    expect(draft.repairs.join(' ')).not.toContain('unreadable')
  })

  it('turns a described picture into the warning that one has to be added', () => {
    const { draft } = first(
      flattened({ stimulusNote: 'A diagram of a small office network.' }),
      ctx({ expected: undefined, paper }),
    )

    const warnings = draft.faults.filter((f) => f.severity === 'warning').map((f) => f.message)
    expect(warnings.join(' ')).toContain('A diagram of a small office network.')
    expect(warnings.join(' ')).toContain('add one yourself')
  })

  it('says once that sections were dropped, rather than on every question', () => {
    const two = JSON.parse(flattened()) as Record<string, unknown>[]
    const out = ingestQuestions(JSON.stringify([two[0], { ...two[0], number: 8 }]), ctx({
      expected: undefined,
      paper,
    }))

    expect(out.notes.filter((n) => n.includes('section'))).toHaveLength(1)
    for (const draft of out.drafts) expect(draft.repairs.join(' ')).not.toContain('section')
  })
})
