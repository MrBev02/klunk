/**
 * Tests for grouping a page's text into lines (#174).
 *
 * Moved from `pastpapers/extract.test.ts` with `toLines`. The pages are built
 * with the same fictional fixtures, for the reason given there: the real
 * papers are NESA's and stay outside this repository.
 */

import { describe, expect, it } from 'vitest'
import { toLines } from './lines'
import { markOnly, marked, page, shuffled } from '../testing/fixtures/page'

describe('toLines', () => {
  it('rebuilds reading order from positions, not from stream order', () => {
    const p = shuffled(page(1, 'First line here', 'Second line here', 'Third line here'))
    expect(toLines(p).map((l) => l.text)).toEqual([
      'First line here',
      'Second line here',
      'Third line here',
    ])
  })

  it('joins columns on one line with a single space', () => {
    const p = page(1, 'Figure 1        Figure 2')
    expect(toLines(p)[0]!.text).toBe('Figure 1 Figure 2')
  })

  it('lifts a bare number in the right margin off the line as its marks', () => {
    const p = page(1, marked('(a)   Describe one benefit of the frame shown.', 2))
    const [line] = toLines(p)
    expect(line!.marginMark).toBe(2)
    expect(line!.text).toBe('(a) Describe one benefit of the frame shown.')
  })

  it('leaves a number in the body alone', () => {
    // "in 200 households" must not be read as a mark just because it is a number.
    const p = page(1, 'A new kettle was trialled in 200 households over 12 weeks.')
    const [line] = toLines(p)
    expect(line!.marginMark).toBeUndefined()
    expect(line!.text).toContain('200 households')
  })

  it('keeps the columns a row was printed in', () => {
    const p = page(1, 'Pine            42          Softwood')
    const [line] = toLines(p)
    expect(line!.cells.map((c) => c.text)).toEqual(['Pine', '42', 'Softwood'])
    // The spans are what a later rule asks about, so they have to be real.
    expect(line!.cells[0]!.left).toBe(0)
    expect(line!.cells[1]!.left).toBe(80)
  })

  it('reads ordinary prose as one cell', () => {
    const p = page(1, 'A designer evaluates a prototype against the design criteria.')
    expect(toLines(p)[0]!.cells).toHaveLength(1)
  })

  it('finds the same columns whatever order the pieces arrive in', () => {
    const p = shuffled(page(1, 'Pine            42          Softwood'))
    expect(toLines(p)[0]!.cells.map((c) => c.text)).toEqual(['Pine', '42', 'Softwood'])
  })

  it('leaves a mark-only line with no cells, because it has no text', () => {
    const p = page(1, markOnly(3))
    const [line] = toLines(p)
    expect(line!.marginMark).toBe(3)
    expect(line!.cells).toEqual([])
  })
})
