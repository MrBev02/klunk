/**
 * Where the options and parts of a question went while it was edited (#238).
 *
 * A picture's owner is an index, so a picture held outside the editor, as the
 * pictures kept on a review card are, has to be told what removing an option or
 * a part did to the indices after it. Without that, removing B from A to D puts
 * B's picture beside what was C.
 */

/** What a picture belongs to: a part by index or the question, and perhaps an option. */
export interface Placed {
  at: number | null
  choice?: number
}

/** Each original option and part's new index, or null where the edit removed it. */
export interface Moved {
  choices: (number | null)[]
  parts: (number | null)[]
}

/** Nothing moved yet: every option and part where it started. */
export function unmoved(choices: number, parts: number): Moved {
  return {
    choices: Array.from({ length: choices }, (_, i) => i),
    parts: Array.from({ length: parts }, (_, i) => i),
  }
}

/** The map after the thing at `at` is removed: it goes, and everything after comes down one. */
export function removedFrom(map: (number | null)[], at: number): (number | null)[] {
  return map.map((v) => (v === null || v === at ? null : v > at ? v - 1 : v))
}

/**
 * An owner carried through an edit.
 *
 * A removed part or option leaves its picture to the question, where it is on
 * screen and can be dropped deliberately, as the editor does with its own.
 */
export function moveOwner<T extends Placed>(owner: T, moved: Moved): T {
  const { choice, ...rest } = owner
  const at = owner.at === null ? null : (moved.parts[owner.at] ?? null)
  const to = choice === undefined ? undefined : (moved.choices[choice] ?? undefined)
  return (to === undefined ? { ...rest, at } : { ...rest, at, choice: to }) as T
}
