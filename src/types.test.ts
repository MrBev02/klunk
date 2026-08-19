/**
 * The routing between a question and its parts, which nothing on screen shows.
 *
 * A picture attached to the wrong part still prints, still validates and still
 * reads plausibly: the fault is a diagram under part (c) that the examination
 * printed under part (b). Both routes into a bank go through `placeStimulus`,
 * so this is where that cannot drift.
 */

import { describe, expect, it } from 'vitest'
import { everyStimulus, placeStimulus, stimulusList, type Question } from './types'

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
