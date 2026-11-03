import katex from 'katex'
import { describe, expect, it } from 'vitest'
import { runsOf } from '../shared/richtext'
import { FORMULA_EXAMPLES, PALETTE, insertion } from './formulas'

/** Apply an insertion, and mark where the cursor lands with `|`. */
function click(value: string, inserts: string, start = value.length, end = start): string {
  const ins = insertion(value, start, end, inserts)
  const text = value.slice(0, ins.from) + ins.text + value.slice(ins.to)
  return text.slice(0, ins.cursor) + '|' + text.slice(ins.cursor)
}

const sets = (tex: string) => () => katex.renderToString(tex, { throwOnError: true })

describe('insertion', () => {
  it('starts a formula outside one, with the cursor in the first slot', () => {
    expect(click('Simplify ', '\\frac{@}{@}')).toBe('Simplify \\(\\frac{|}{}\\)')
  })

  it('adds no delimiters inside a formula', () => {
    expect(click('\\(x + \\)', '\\frac{@}{@}', 6)).toBe('\\(x + \\frac{|}{}\\)')
  })

  it('counts an empty pair and an unclosed opener as inside', () => {
    expect(click('\\(\\)', '\\pi ', 2)).toBe('\\(\\pi |\\)')
    expect(click('\\(3', '\\times ')).toBe('\\(3\\times |')
  })

  it('puts the selection in the first slot and the cursor in the next', () => {
    expect(click('Write x + 1 over 2', '\\frac{@}{@}', 6, 11)).toBe(
      'Write \\(\\frac{x + 1}{|}\\) over 2',
    )
  })

  it('applies a power to what was just typed inside a formula', () => {
    expect(click('\\(x\\)', '#^{@}', 3)).toBe('\\(x^{|}\\)')
  })

  it('gives a power a base slot when it starts a formula', () => {
    expect(click('', '#^{@}')).toBe('\\(|^{}\\)')
    expect(click('', '#^{\\circ}')).toBe('\\(|^{\\circ}\\)')
  })

  it('puts the selection under a power as its base', () => {
    expect(click('a', '#^{@}', 0, 1)).toBe('\\(a^{|}\\)')
  })

  it('leaves the cursor after a command with no slot', () => {
    expect(click('', '\\theta ')).toBe('\\(\\theta |\\)')
  })

  it('treats a code span and an escaped backslash as outside a formula', () => {
    expect(click('`\\(x` ', '\\pi ')).toBe('`\\(x` \\(\\pi |\\)')
    expect(click('\\\\( ', '\\pi ')).toBe('\\\\( \\(\\pi |\\)')
  })

  it('treats the text after a closed formula as outside', () => {
    expect(click('\\(x\\) and ', '\\pi ')).toBe('\\(x\\) and \\(\\pi |\\)')
  })
})

describe('the palette', () => {
  const buttons = PALETTE.flatMap((group) => group.buttons)

  it.each(buttons.map((b) => [b.name, b] as const))('%s sets without an error', (_, b) => {
    expect(sets(b.shows)).not.toThrow()
    // What a click leaves behind, with something typed in every slot.
    expect(sets(b.inserts.replace(/[@#]/g, 'x'))).not.toThrow()
  })

  it('has one name per button', () => {
    expect(new Set(buttons.map((b) => b.name)).size).toBe(buttons.length)
  })
})

describe('the help table', () => {
  it.each(FORMULA_EXAMPLES.map((row) => [row.want, row.type] as const))(
    '%s holds formulas that set',
    (_, type) => {
      const maths = runsOf(type).filter((run) => run.math)
      expect(maths.length).toBeGreaterThan(0)
      for (const run of maths) expect(sets(run.text)).not.toThrow()
    },
  )
})
