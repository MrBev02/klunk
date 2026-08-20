/**
 * What Klunk offers a folder as its first step.
 *
 * The rule is pure and takes an index, so all of it is testable without a
 * browser — which matters, because #48 is a fault about what a screen says and
 * the screen said it for months while every function underneath returned
 * exactly what it was asked for.
 */

import { describe, expect, it } from 'vitest'
import { profilesOnOffer } from './setup'
import { emptyIndex, type ContentIndex } from './storage'
import type { Syllabus } from './types'

/** Klunk ships one profile, for this syllabus. */
const SHIPPED_FOR = 'nsw-hsc-design-technology'

function syllabus(id: string): Syllabus {
  return {
    formatVersion: '1',
    type: 'klunk_syllabus',
    framework: 'NESA',
    id,
    name: id,
    courses: [],
  }
}

function folderWith(...syllabusIds: string[]): ContentIndex {
  const index = emptyIndex()
  index.syllabuses = syllabusIds.map((id) => ({
    path: `syllabus/${id}.json`,
    data: syllabus(id),
  })) as ContentIndex['syllabuses']
  return index
}

describe('what a folder is offered', () => {
  it('offers everything to an empty folder, which does not say what it is for', () => {
    const { offered, why } = profilesOnOffer(emptyIndex())
    expect(offered.length).toBeGreaterThan(0)
    expect(why).toBeNull()
  })

  it('offers the matching profile to a folder holding that syllabus', () => {
    const { offered, why } = profilesOnOffer(folderWith(SHIPPED_FOR))
    expect(offered.map((s) => s.profile.syllabusId)).toEqual([SHIPPED_FOR])
    expect(why).toBeNull()
  })

  it('offers nothing to a folder holding another subject, which is #48', () => {
    // The reported case: a folder set up for IB DP Design Technology was being
    // offered NSW HSC Design and Technology in the heading position.
    const { offered, why } = profilesOnOffer(folderWith('ib-dp-design-technology'))
    expect(offered).toEqual([])
    expect(why).toBe('no-profile-for-subject')
  })

  it('offers nothing to a folder holding several syllabuses, rather than picking one', () => {
    const { offered, why } = profilesOnOffer(folderWith('ib-dp-design-technology', SHIPPED_FOR))
    expect(offered).toEqual([])
    // Told apart from the case above, because a teacher can act on the
    // difference: this one is about the folder, not about Klunk's list.
    expect(why).toBe('several-syllabuses')
  })

  it('lets a caller naming a syllabus override an ambiguous folder', () => {
    // The prompt factory is drafting a particular subject and knows better than
    // the folder does.
    const several = folderWith('ib-dp-design-technology', SHIPPED_FOR)
    expect(profilesOnOffer(several, SHIPPED_FOR).offered).toHaveLength(1)
    expect(profilesOnOffer(several, 'ib-dp-design-technology').offered).toEqual([])
  })

  it('does not offer a profile the folder already has', () => {
    const index = folderWith(SHIPPED_FOR)
    index.profiles = [
      { path: `profiles/${SHIPPED_FOR}.json`, data: { id: SHIPPED_FOR } },
    ] as unknown as ContentIndex['profiles']

    const { offered, why } = profilesOnOffer(index)
    expect(offered).toEqual([])
    expect(why).toBe('no-profile-for-subject')
  })
})
