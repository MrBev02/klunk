/**
 * The wording helpers the review panel and the model viewer share.
 *
 * Small, and here because the fault they exist for is invisible in the code and
 * obvious on screen: reading Textiles through the panel printed "Area of
 * studys" over the three areas it had just found correctly. A syllabus's own
 * word for a division is only worth carrying if it is then written properly.
 */

import { describe, expect, it } from 'vitest'
import { lowerLabel, pluralLabel } from './syllabusreview'

describe('pluralLabel', () => {
  it('pluralises the head noun of a noun phrase, not its tail', () => {
    // The two labels NESA's own documents use. `Area of study` is the one that
    // was wrong: English pluralises the word before `of`.
    expect(pluralLabel('Area of study')).toBe('Areas of study')
    expect(pluralLabel('Focus area')).toBe('Focus areas')
  })

  it('pluralises the other two labels at the end, where their head noun is', () => {
    expect(pluralLabel('Theme')).toBe('Themes')
    expect(pluralLabel('Content area')).toBe('Content areas')
  })

  it('works on the lowercased form, which is how it appears mid-sentence', () => {
    expect(pluralLabel(lowerLabel('Area of study'))).toBe('areas of study')
    expect(pluralLabel(lowerLabel('Focus area'))).toBe('focus areas')
  })
})

describe('lowerLabel', () => {
  it('changes the case of the first letter only', () => {
    expect(lowerLabel('Focus area')).toBe('focus area')
    expect(lowerLabel('Theme')).toBe('theme')
  })
})
