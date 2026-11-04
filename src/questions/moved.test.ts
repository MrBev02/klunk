import { describe, expect, it } from 'vitest'
import { moveOwner, removedFrom, unmoved } from './moved'

describe('moving a held picture with the edit (#238)', () => {
  it('keeps each picture on its own option when an earlier one is removed', () => {
    // A to D, each a picture, and B removed: C's picture is now B's, D's is C's.
    const moved = { ...unmoved(4, 0), choices: removedFrom(unmoved(4, 0).choices, 1) }
    const owners = [0, 1, 2, 3].map((choice) => moveOwner({ at: null, choice }, moved))
    expect(owners).toEqual([
      { at: null, choice: 0 },
      { at: null },
      { at: null, choice: 1 },
      { at: null, choice: 2 },
    ])
  })

  it('follows two removals in the order they were made', () => {
    // Removing B and then the new C is removing B and D.
    const choices = removedFrom(removedFrom([0, 1, 2, 3, 4], 1), 2)
    expect(choices).toEqual([0, null, 1, null, 2])
  })

  it('moves a part the same way, and leaves the rest of the picture alone', () => {
    const moved = { choices: [], parts: removedFrom([0, 1, 2], 0) }
    expect(moveOwner({ at: 2, keep: true }, moved)).toEqual({ at: 1, keep: true })
    expect(moveOwner({ at: 0, keep: false }, moved)).toEqual({ at: null, keep: false })
    expect(moveOwner({ at: null, keep: true }, moved)).toEqual({ at: null, keep: true })
  })
})
