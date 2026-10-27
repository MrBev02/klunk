/**
 * The routing between a question and its parts, which nothing on screen shows.
 *
 * A picture attached to the wrong part still prints, still validates and still
 * reads plausibly: the fault is a diagram under part (c) that the examination
 * printed under part (b). Both routes into a bank go through `placeStimulus`,
 * so this is where that cannot drift.
 */

import { describe, expect, it } from 'vitest'
import { everyStimulus, hasSample, placeStimulus, stimulusList, type Question } from './types'

function withParts(): Question {
  return {
    id: 'q1',
    questionType: 'short_answer',
    questionText: 'Look at the two chairs.',
    marks: 6,
    config: {
      parts: [
        { label: '(a)', text: 'Name the joint.', marks: 2 },
        { label: '(b)', text: 'Evaluate it.', marks: 4 },
      ],
    },
  }
}

const chairs = { kind: 'image' as const, file: 'stimulus/chairs.png' }
const joint = { kind: 'image' as const, file: 'stimulus/joint.png' }

describe('placeStimulus', () => {
  it('puts each picture where its owner says', () => {
    const q = placeStimulus(withParts(), [
      { item: chairs, at: null },
      { item: joint, at: 1 },
    ])

    expect(q.stimulus).toEqual([chairs])
    expect(q.config?.parts?.[0]?.stimulus).toBeUndefined()
    expect(q.config?.parts?.[1]?.stimulus).toEqual([joint])
  })

  it('takes a picture off a part it has been moved away from', () => {
    const on = placeStimulus(withParts(), [{ item: joint, at: 1 }])
    const off = placeStimulus(on, [{ item: joint, at: null }])

    expect(off.config?.parts?.[1]?.stimulus).toBeUndefined()
    expect(off.stimulus).toEqual([joint])
  })

  // The question type can change away from a written one at any moment, and the
  // parts go with it. Falling back to the question keeps the picture on screen;
  // dropping it would lose a file the teacher attached, silently.
  it('gives a picture back to the question when its part is not there', () => {
    const noParts: Question = { ...withParts(), config: {} }
    const q = placeStimulus(noParts, [{ item: joint, at: 1 }])

    expect(q.stimulus).toEqual([joint])
  })

  it('survives a round trip through stimulusList', () => {
    const q = placeStimulus(withParts(), [
      { item: chairs, at: null },
      { item: joint, at: 1 },
    ])
    expect(placeStimulus(q, stimulusList(q))).toEqual(q)
  })

  it('writes no empty stimulus key where a question has none', () => {
    const q = placeStimulus(withParts(), [])
    expect('stimulus' in q).toBe(false)
    expect(q.config?.parts?.every((p) => !('stimulus' in p))).toBe(true)
  })
})

describe('everyStimulus', () => {
  it("finds a part's pictures as well as the question's", () => {
    const q = placeStimulus(withParts(), [
      { item: chairs, at: null },
      { item: joint, at: 1 },
    ])
    expect(everyStimulus(q)).toEqual([chairs, joint])
  })
})

/*
 * A model drawing hangs off the guide rather than the paper (#142). The fault to
 * guard against is the quiet one: a model answer routed to `stimulus` prints on
 * the student paper, and one routed nowhere is lost on save.
 */
describe('a model answer on the guide', () => {
  const flowchart = { kind: 'image' as const, file: 'stimulus/flowchart.png' }
  const program = { kind: 'code' as const, text: 'if gap < 500:\n    slow()' }

  it('goes to the guide and the part guide, never to what the paper prints', () => {
    const q = placeStimulus(withParts(), [
      { item: chairs, at: null },
      { item: flowchart, at: null, guide: true },
      { item: program, at: 1, guide: true },
    ])
    expect(q.stimulus).toEqual([chairs])
    expect(q.markingGuide?.sampleStimulus).toEqual([flowchart])
    expect(q.config?.parts?.[1]?.sampleStimulus).toEqual([program])
    expect(q.config?.parts?.every((p) => !('stimulus' in p))).toBe(true)
  })

  it('survives a round trip through stimulusList', () => {
    const q = placeStimulus(withParts(), [
      { item: flowchart, at: null, guide: true },
      { item: program, at: 0, guide: true },
      { item: joint, at: 0 },
    ])
    expect(placeStimulus(q, stimulusList(q))).toEqual(q)
  })

  it('leaves no empty guide behind when the last model drawing is removed', () => {
    const on = placeStimulus(withParts(), [{ item: flowchart, at: null, guide: true }])
    const off = placeStimulus(on, [])
    expect('markingGuide' in off).toBe(false)
  })

  it('keeps the rest of the guide when a model drawing is removed', () => {
    const on = placeStimulus(
      { ...withParts(), markingGuide: { sampleAnswer: 'Start, then a decision.' } },
      [{ item: flowchart, at: null, guide: true }],
    )
    expect(placeStimulus(on, []).markingGuide).toEqual({ sampleAnswer: 'Start, then a decision.' })
  })

  it("goes to the question's guide when its part is gone", () => {
    const q = placeStimulus({ ...withParts(), config: {} }, [{ item: program, at: 1, guide: true }])
    expect(q.markingGuide?.sampleStimulus).toEqual([program])
  })

  // `scanFolder` loads only what `everyStimulus` names, so a model drawing
  // missing from it prints as a grey box over a file that is in the folder.
  it('is found by everyStimulus, so its file is loaded', () => {
    const q = placeStimulus(withParts(), [
      { item: flowchart, at: null, guide: true },
      { item: program, at: 1, guide: true },
    ])
    expect(everyStimulus(q)).toEqual([flowchart, program])
  })
})

describe('hasSample', () => {
  it('counts a drawing or program as a sample answer, as well as words', () => {
    expect(hasSample({ sampleStimulus: [{ kind: 'image', file: 'a.png' }] })).toBe(true)
    expect(hasSample({ sampleAnswer: 'Words.' })).toBe(true)
    expect(hasSample({ sampleAnswer: '  ', sampleStimulus: [] })).toBe(false)
    expect(hasSample(undefined)).toBe(false)
  })
})
