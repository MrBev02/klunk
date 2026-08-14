/**
 * Reading back an AI's transcription of a marking guide.
 *
 * The tests that matter are the ones about answers Klunk was never given. #66
 * was a markscheme that read as empty and left thirty questions all answered A,
 * ready to print, with nothing on the page saying so. A model does not return an
 * empty document: it returns a confident one. So an entry stating no answer has
 * to arrive with no answer, and an empty list is a statement of nothing rather
 * than a statement of none.
 */

import { describe, expect, it } from 'vitest'
import { readMarking } from './guideingest'

const NONE = { outcomes: [] }

describe('finding the JSON', () => {
  it('reads a bare array', () => {
    const out = readMarking('[{"number": 1, "answer": "B"}]', NONE)
    expect(out.entries).toEqual([{ number: 1, answers: ['B'] }])
  })

  it('reads it out of a code block with prose either side', () => {
    const out = readMarking(
      'Here is the marking guide:\n\n```json\n[{"number": 1, "answer": "C"}]\n```\n\nLet me know.',
      NONE,
    )
    expect(out.entries).toHaveLength(1)
    expect(out.notes.join(' ')).toContain('code block')
  })

  it('reads it out of an object wrapped around it', () => {
    const out = readMarking('{"entries": [{"number": 4, "answer": "A"}]}', NONE)
    expect(out.entries[0]).toMatchObject({ number: 4, answers: ['A'] })
  })

  it('reads a single entry that was not put in a list', () => {
    const out = readMarking('{"number": 9, "answer": "D"}', NONE)
    expect(out.entries).toHaveLength(1)
  })

  it('reads a bare answer key written as numbers against letters', () => {
    const out = readMarking('{"1": "D", "2": "B", "3": "B"}', NONE)
    expect(out.entries.map((e) => e.answers?.[0])).toEqual(['D', 'B', 'B'])
    expect(out.notes.join(' ')).toContain('list of question numbers')
  })

  it('refuses something that is not JSON at all', () => {
    const out = readMarking('The answers are B, then C, then A.', NONE)
    expect(out.entries).toHaveLength(0)
    expect(out.failure).toBeTruthy()
  })

  it('says a truncated reply is truncated, in words a teacher can act on', () => {
    const out = readMarking('[{"number": 1, "answer": "B"}, {"number": 2, "crit', NONE)
    expect(out.failure).toContain('ask it for fewer questions')
  })
})

describe('the answers', () => {
  it('keeps a letter as a letter, because the options are not here', () => {
    expect(readMarking('[{"number": 1, "answer": "B"}]', NONE).entries[0]!.answers).toEqual(['B'])
  })

  it('takes the letter out of "B." and "(B)" and "Option B"', () => {
    const out = readMarking(
      '[{"number": 1, "answer": "B."}, {"number": 2, "answer": "(C)"}, {"number": 3, "answer": "Option D"}]',
      NONE,
    )
    expect(out.entries.map((e) => e.answers)).toEqual([['B'], ['C'], ['D']])
  })

  it('reads several letters for a multiple-response question', () => {
    const out = readMarking('[{"number": 10, "answers": ["A", "C"]}]', NONE)
    expect(out.entries[0]!.answers).toEqual(['A', 'C'])
  })

  it('reads a position back into a letter and says so', () => {
    const out = readMarking('[{"number": 1, "answer": 1}]', NONE)
    expect(out.entries[0]!.answers).toEqual(['B'])
    expect(out.notes.join(' ')).toContain('read the answer 1 as option B')
  })

  it('leaves an entry with no answer with no answer', () => {
    const out = readMarking('[{"number": 25, "criteria": [{"marks": 3, "description": "x"}]}]', NONE)
    expect(out.entries[0]!.answers).toBeUndefined()
    expect(out.entries[0]!.criteria).toHaveLength(1)
  })

  it('treats an empty list as nothing stated rather than as none of these', () => {
    const out = readMarking('[{"number": 7, "answers": []}]', NONE)
    expect(out.entries[0]!.answers).toBeUndefined()
  })

  it('drops an answer that names no option, and says so', () => {
    const out = readMarking('[{"number": 7, "answer": "see the criteria"}]', NONE)
    expect(out.entries[0]!.answers).toBeUndefined()
    expect(out.notes.join(' ')).toContain('named no option')
  })

  it('reads true and false rather than turning them into letters', () => {
    const out = readMarking('[{"number": 3, "answer": "True"}, {"number": 4, "answer": false}]', NONE)
    expect(out.entries[0]).toMatchObject({ number: 3, trueFalse: true })
    expect(out.entries[1]).toMatchObject({ number: 4, trueFalse: false })
    expect(out.entries[0]!.answers).toBeUndefined()
  })
})

describe('the links', () => {
  it('reads which option each item links to', () => {
    const out = readMarking(
      '[{"number": 13, "links": [{"item": 1, "options": ["D"]}, {"item": 2, "options": ["A"]}]}]',
      NONE,
    )
    expect(out.entries[0]!.links).toEqual([
      { item: 1, options: ['D'] },
      { item: 2, options: ['A'] },
    ])
  })

  it('takes an item linked to more than one option, because the rubric permits it', () => {
    const out = readMarking('[{"number": 13, "links": [{"item": 1, "options": ["A", "B"]}]}]', NONE)
    expect(out.entries[0]!.links![0]!.options).toEqual(['A', 'B'])
  })

  it('drops a link with no item number and says so', () => {
    const out = readMarking('[{"number": 13, "links": [{"options": ["A"]}]}]', NONE)
    expect(out.entries[0]!.links).toBeUndefined()
    expect(out.notes.join(' ')).toContain('dropped a link')
  })
})

describe('the criteria', () => {
  it('keeps a band as a band', () => {
    const out = readMarking(
      '[{"number": 25, "criteria": [{"marks": 13, "marksTo": 15, "description": "Sustains a judgement."}]}]',
      NONE,
    )
    expect(out.entries[0]!.criteria![0]).toEqual({
      marks: 13,
      marksTo: 15,
      description: 'Sustains a judgement.',
    })
  })

  it('orders a band written the wrong way round', () => {
    const out = readMarking(
      '[{"number": 25, "criteria": [{"marks": 15, "marksTo": 13, "description": "x"}]}]',
      NONE,
    )
    expect(out.entries[0]!.criteria![0]).toMatchObject({ marks: 13, marksTo: 15 })
  })

  it('drops a criterion with no marks and says so', () => {
    const out = readMarking(
      '[{"number": 25, "criteria": [{"description": "x"}, {"marks": 2, "description": "y"}]}]',
      NONE,
    )
    expect(out.entries[0]!.criteria).toHaveLength(1)
    expect(out.notes.join(' ')).toContain('Dropped a marking criterion')
  })

  it('keeps the sample answer and what a marker could accept', () => {
    const out = readMarking(
      '[{"number": 25, "sampleAnswer": "Bamboo renews.", "answersCouldInclude": ["Cost", "Time"]}]',
      NONE,
    )
    expect(out.entries[0]!.sampleAnswer).toBe('Bamboo renews.')
    expect(out.entries[0]!.answersCouldInclude).toEqual(['Cost', 'Time'])
  })
})

describe('the parts', () => {
  it('keys a part alongside its question, however it was written', () => {
    const out = readMarking(
      '[{"number": 21, "part": "(a)"}, {"number": 21, "part": "b)"}, {"number": 21, "part": "C"}]',
      NONE,
    )
    expect(out.entries.map((e) => e.part)).toEqual(['a', 'b', 'c'])
  })
})

describe('the outcomes', () => {
  it('keeps only the codes the prompt offered', () => {
    const out = readMarking('[{"number": 1, "outcomes": ["H1.1", "H9.9"]}]', {
      outcomes: ['H1.1', 'H3.2'],
    })
    expect(out.entries[0]!.outcomes).toEqual(['H1.1'])
    expect(out.notes.join(' ')).toContain('not in this course')
  })

  it('checks nothing when no course was chosen', () => {
    const out = readMarking('[{"number": 1, "outcomes": ["H9.9"]}]', NONE)
    expect(out.entries[0]!.outcomes).toEqual(['H9.9'])
  })
})

describe('what it says about itself', () => {
  it('keeps what the model could not read on that question', () => {
    const out = readMarking('[{"number": 8, "unreadable": "the second criterion"}]', NONE)
    expect(out.entries[0]!.unreadable).toBe('the second criterion')
  })

  it('lifts a final unreadablePages object into a note rather than an entry', () => {
    const out = readMarking(
      '[{"number": 1, "answer": "A"}, {"unreadablePages": "page 4 is blank"}]',
      NONE,
    )
    expect(out.entries).toHaveLength(1)
    expect(out.notes.join(' ')).toContain('page 4 is blank')
  })

  it('reports a field it does not store instead of dropping it silently', () => {
    const out = readMarking('[{"number": 1, "answer": "A", "confidence": "high"}]', NONE)
    expect(out.notes.join(' ')).toContain('confidence')
  })

  it('rejects an entry with no question number, by position', () => {
    const out = readMarking('[{"answer": "A"}, {"number": 2, "answer": "B"}]', NONE)
    expect(out.rejected).toEqual([{ at: 0, why: 'no question number, so there is nothing here to mark' }])
    expect(out.entries).toHaveLength(1)
  })
})
