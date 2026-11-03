/**
 * The formula palette's buttons, what a click on one inserts, and the rows of
 * the help page's "Writing formulas" table (#209).
 *
 * **Why so few buttons.** A teacher who has never written LaTeX learns it by
 * watching what a click types, and after a while stops needing the button. A
 * palette of every command teaches nothing. The set was counted, not
 * imagined: the 907 equations in Mathematics Advanced 11–12 (2024) are mostly
 * delimiters (271), powers (136), functions (136: sin, cos, tan, log, ln),
 * fractions (126) and subscripts (84), then integrals and sums (23) and roots
 * (15). Their commonest symbols are θ, ≤, ∫, °, ≠, ≥, μ, Δ, ∞, σ, ± and π.
 * The faculty's Year 8 task (#201) used only powers, fractions and brackets.
 *
 * **A template has two kinds of slot.** `@` is an empty slot, and the cursor
 * lands in the first one. `#` is what a power, a subscript or a degree sign
 * applies to: whatever was selected, or nothing inside a formula, where the
 * teacher has usually just typed the `x` it applies to, or an empty slot when
 * the click starts a new formula, which would otherwise print a power of
 * nothing. Text selected before a click goes into the first slot of either
 * kind, so selecting `x + 1` and clicking the fraction gives `\frac{x + 1}{}`.
 *
 * A command written as a word, `\theta` or `\times`, is inserted with a space
 * after it, because `\thetax` is not `\theta` and an `x`.
 */

import { insideFormula } from '../shared/richtext'

export interface PaletteButton {
  /** What the button does, in a teacher's words: its tooltip and its name. */
  name: string
  /** The LaTeX the button shows, set by KaTeX. */
  shows: string
  /** What a click inserts, with its slots. */
  inserts: string
}

export interface PaletteGroup {
  title: string
  buttons: PaletteButton[]
}

export const PALETTE: PaletteGroup[] = [
  {
    title: 'Fractions, indices and roots',
    buttons: [
      { name: 'Fraction', shows: '\\frac{a}{b}', inserts: '\\frac{@}{@}' },
      { name: 'Power', shows: 'x^{2}', inserts: '#^{@}' },
      { name: 'Subscript', shows: 'x_{1}', inserts: '#_{@}' },
      { name: 'Square root', shows: '\\sqrt{x}', inserts: '\\sqrt{@}' },
      { name: 'Cube root or other root', shows: '\\sqrt[3]{x}', inserts: '\\sqrt[@]{@}' },
    ],
  },
  {
    title: 'Brackets',
    buttons: [
      {
        name: 'Brackets that grow to fit',
        shows: '\\left(\\frac{a}{b}\\right)',
        inserts: '\\left( @ \\right)',
      },
      { name: 'Absolute value', shows: '\\left| x \\right|', inserts: '\\left| @ \\right|' },
    ],
  },
  {
    title: 'Signs',
    buttons: [
      { name: 'Multiply', shows: '\\times', inserts: '\\times ' },
      { name: 'Divide', shows: '\\div', inserts: '\\div ' },
      { name: 'Plus or minus', shows: '\\pm', inserts: '\\pm ' },
      { name: 'Not equal to', shows: '\\neq', inserts: '\\neq ' },
      { name: 'Less than or equal to', shows: '\\le', inserts: '\\le ' },
      { name: 'Greater than or equal to', shows: '\\ge', inserts: '\\ge ' },
      { name: 'Approximately equal to', shows: '\\approx', inserts: '\\approx ' },
      { name: 'Degrees', shows: '30^{\\circ}', inserts: '#^{\\circ}' },
      { name: 'Per cent', shows: '50\\%', inserts: '\\%' },
    ],
  },
  {
    title: 'Greek letters',
    buttons: [
      { name: 'Theta', shows: '\\theta', inserts: '\\theta ' },
      { name: 'Pi', shows: '\\pi', inserts: '\\pi ' },
      { name: 'Mu', shows: '\\mu', inserts: '\\mu ' },
      { name: 'Sigma', shows: '\\sigma', inserts: '\\sigma ' },
      { name: 'Capital delta', shows: '\\Delta', inserts: '\\Delta ' },
    ],
  },
  {
    title: 'Trigonometry and logarithms',
    buttons: [
      { name: 'Sine', shows: '\\sin\\theta', inserts: '\\sin ' },
      { name: 'Cosine', shows: '\\cos\\theta', inserts: '\\cos ' },
      { name: 'Tangent', shows: '\\tan\\theta', inserts: '\\tan ' },
      { name: 'Logarithm to a base', shows: '\\log_{a} x', inserts: '\\log_{@} ' },
      { name: 'Natural logarithm', shows: '\\ln x', inserts: '\\ln ' },
      { name: 'e to a power', shows: 'e^{x}', inserts: 'e^{@}' },
    ],
  },
  {
    title: 'Calculus',
    buttons: [
      { name: 'Derivative', shows: '\\frac{dy}{dx}', inserts: '\\frac{dy}{dx}' },
      { name: 'Derivative of', shows: '\\frac{d}{dx}', inserts: '\\frac{d}{dx}' },
      { name: 'Integral with limits', shows: '\\int_{a}^{b}', inserts: '\\int_{@}^{@} @ \\, dx' },
      { name: 'Integral', shows: '\\int', inserts: '\\int @ \\, dx' },
      { name: 'Limit', shows: '\\lim_{x \\to a}', inserts: '\\lim_{x \\to @} ' },
      { name: 'Infinity', shows: '\\infty', inserts: '\\infty ' },
      { name: 'Sum', shows: '\\sum_{k=1}^{n}', inserts: '\\sum_{@}^{@} ' },
    ],
  },
  {
    title: 'Units',
    buttons: [
      { name: 'Square centimetres', shows: '\\text{cm}^{2}', inserts: '\\text{ cm}^{2}' },
      { name: 'Cubic centimetres', shows: '\\text{cm}^{3}', inserts: '\\text{ cm}^{3}' },
      { name: 'Any other unit', shows: '\\text{kg}', inserts: '\\text{ @}' },
    ],
  },
]

/** One edit to a text box: replace `from`–`to` with `text`, then put the cursor at `cursor`. */
export interface Insertion {
  from: number
  to: number
  text: string
  cursor: number
}

/** What a click on a button inserts into `value`, whose selection runs `start`–`end`. */
export function insertion(value: string, start: number, end: number, inserts: string): Insertion {
  const selected = value.slice(start, end)
  const inside = insideFormula(value, start)
  let body = ''
  let used = selected === ''
  const slots: number[] = []
  for (const ch of inserts) {
    if (ch !== '@' && ch !== '#') {
      body += ch
    } else if (!used) {
      body += selected
      used = true
    } else if (ch === '@' || !inside) {
      slots.push(body.length)
    }
  }
  const at = slots[0] ?? body.length
  return inside
    ? { from: start, to: end, text: body, cursor: start + at }
    : { from: start, to: end, text: `\\(${body}\\)`, cursor: start + 2 + at }
}

/**
 * The help page's table: what a teacher wants, and what to type for it.
 *
 * The third column, what it looks like, is drawn from the second by the same
 * code that prints a question, so the table cannot drift from the paper. The
 * rows are what the Year 8 task and the Advanced syllabus actually write, plus
 * what goes wrong for someone new to it: a power longer than one character,
 * a per cent sign, and working over several lines. No row shows a formula
 * that will not set, because that prints red, and red is for a fault.
 */
export const FORMULA_EXAMPLES: { want: string; type: string }[] = [
  { want: 'A formula inside a sentence', type: 'Solve \\(2x + 3 = 11\\).' },
  { want: 'A formula on a line of its own', type: '\\[y = mx + c\\]' },
  { want: 'A fraction', type: '\\(\\frac{3}{4}\\)' },
  { want: 'An algebraic fraction', type: '\\(\\frac{x + 1}{2x - 3}\\)' },
  { want: 'A power', type: '\\(x^{2}\\)' },
  { want: 'A power of more than one character', type: '\\(2^{10}\\), not \\(2^10\\)' },
  { want: 'An index law', type: '\\(a^{m} \\times a^{n} = a^{m + n}\\)' },
  { want: 'A negative or fractional index', type: '\\(x^{-2}\\) and \\(x^{\\frac{1}{2}}\\)' },
  { want: 'A surd', type: '\\(3\\sqrt{2}\\) and \\(\\sqrt[3]{27}\\)' },
  { want: 'Expanding brackets', type: '\\(3(2x - 5) = 6x - 15\\)' },
  { want: 'Factorising', type: '\\(x^{2} - 5x + 6 = (x - 2)(x - 3)\\)' },
  { want: 'Brackets around a fraction', type: '\\(\\left(\\frac{2}{3}\\right)^{2}\\)' },
  { want: 'Multiply and divide', type: '\\(4 \\times 3 \\div 6\\)' },
  { want: 'An inequality', type: '\\(x \\le 5\\) and \\(x \\neq 0\\)' },
  { want: 'An angle', type: '\\(\\sin 30^{\\circ} = \\frac{1}{2}\\)' },
  { want: 'A Greek letter', type: '\\(2\\pi r\\)' },
  { want: 'A logarithm', type: '\\(\\log_{2} 8 = 3\\)' },
  { want: 'A derivative', type: '\\(\\frac{dy}{dx} = 3x^{2}\\)' },
  { want: 'An integral', type: '\\(\\int_{0}^{2} x^{2} \\, dx\\)' },
  { want: 'A percentage', type: '\\(15\\%\\) of $80' },
  { want: 'A unit', type: '\\(12\\text{ cm}^{2}\\)' },
  {
    want: 'Working over several lines, lined up on the equals signs',
    type: '\\[\\begin{aligned} A &= \\pi r^{2} \\\\ &= \\pi \\times 5^{2} \\\\ &\\approx 78.5\\text{ cm}^{2} \\end{aligned}\\]',
  },
]
