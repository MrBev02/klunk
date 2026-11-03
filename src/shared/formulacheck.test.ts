/**
 * Tests for the formula check (#210).
 *
 * Each typo is one a teacher learning LaTeX makes, and the expected sentence
 * is the instruction they see. A KaTeX upgrade that rewords a reason fails
 * here rather than quietly falling back to KaTeX's own words.
 */

import { describe, expect, it } from 'vitest'
import { badFormulas, formulaFault, strayFormulas } from './formulacheck'
import { formulaAt, strayOpeners } from './richtext'
import type { Question } from './types'
import { isUnfinished, unfinishedReasons, validateQuestion, emptyIdContext } from './validate'

describe('formulaFault', () => {
  it('passes a formula that sets', () => {
    expect(formulaFault('\\frac{3}{8} + x^{2}', false)).toBeNull()
    expect(formulaFault('\\int_0^1 x\\,dx', true)).toBeNull()
  })

  it.each([
    ['\\fract{1}{2}', 'Check the spelling of \\fract. It is not a command that can be drawn.'],
    ['\\frac{3}{8', 'Add a } to close each {.'],
    ['x^{2', 'Add a } to close each {.'],
    ['\\frac{1}', 'Add the missing part in braces. \\frac needs two, as in \\frac{1}{2}.'],
    ['\\sqrt[3', 'Add a ] to close the [.'],
    ['\\frac{1}{2}}', 'Remove the extra }, or add the { it closes.'],
    ['a & b', 'Use & only inside a matrix or cases.'],
    ['\\left( x', 'Add a \\right to close the \\left.'],
    ['x \\right)', 'Add a \\left before the \\right, or remove the \\right.'],
    ['x^', 'Put the power after the ^, as in x^2 or x^{10}.'],
    ['x_', 'Put something after the _, as in x_1 or x_{10}.'],
    ['\\sqrt', 'Add what \\sqrt applies to in braces, as in \\sqrt{x}.'],
    ['x^2^3', 'Put the whole power in braces, as in x^{2^3}. One letter can take only one ^.'],
    ['x_1_2', 'Put the whole subscript in braces, as in x_{12}. One letter can take only one _.'],
    [
      '\\begin{pmatrix} a \\\\ b \\end{matrix}',
      'Make the names match: \\begin{pmatrix} is closed by \\end{matrix}.',
    ],
    ['\\begin{matrix} a', 'Add an \\end to close the \\begin.'],
    ['x \\( y', 'Remove the \\(. It cannot go inside a formula.'],
  ])('says what to do about %s', (tex, said) => {
    expect(formulaFault(tex, false)).toBe(said)
  })

  it('counts an escaped brace as text, not as an opener', () => {
    expect(formulaFault('\\{ x \\frac{1}', false)).toMatch(/^Add the missing part/)
  })
})

describe('badFormulas', () => {
  it('finds a formula in a paragraph and in a table cell, and none in a code span', () => {
    const text = 'Find \\(x^{2\\).\n\n| a | b |\n|---|---|\n| \\(\\fract{1}{2}\\) | `\\(x^\\)` |'
    expect(badFormulas(text).map((b) => b.tex)).toEqual(['x^{2', '\\fract{1}{2}'])
  })

  it('says a display formula is one', () => {
    expect(badFormulas('\\[x^\\]')).toEqual([
      { tex: 'x^', display: true, fault: 'Put the power after the ^, as in x^2 or x^{10}.' },
    ])
  })
})

describe('formulaAt', () => {
  it('gives the formula the cursor is in, and nothing outside one', () => {
    const text = 'Find \\(x^2\\) and \\[y\\]'
    expect(formulaAt(text, 8)).toEqual({ tex: 'x^2', display: false, closed: true })
    expect(formulaAt(text, 13)).toBeNull()
    expect(formulaAt(text, 20)).toEqual({ tex: 'y', display: true, closed: true })
  })

  it('runs an unclosed formula to the end of its line', () => {
    expect(formulaAt('Find \\(\\frac{3}{8\nnext', 10)).toEqual({
      tex: '\\frac{3}{8',
      display: false,
      closed: false,
    })
    expect(formulaAt('Find \\(x\nnext', 11)).toBeNull()
  })

  it('reads a code span as code', () => {
    expect(formulaAt('`\\(x\\)`', 3)).toBeNull()
  })
})

describe('a formula in the checker', () => {
  function question(over: Partial<Question> = {}): Question {
    return {
      id: 'bank-sa-01',
      questionType: 'short_answer',
      questionText: 'Find \\(\\frac{3}{8\\).',
      marks: 2,
      markingGuide: { sampleAnswer: '\\(x = 1\\)' },
      ...over,
    }
  }
  const formulaChecks = (q: Question) =>
    validateQuestion(q, emptyIdContext()).filter((c) => c.message.startsWith('The formula'))

  it('leaves the question unfinished, saying which formula and what to do', () => {
    const q = question()
    expect(formulaChecks(q)).toEqual([
      {
        severity: 'warning',
        where: 'Question',
        unfinished: true,
        message: 'The formula \\frac{3}{8 cannot be drawn. Add a } to close each {.',
      },
    ])
    expect(isUnfinished(q)).toBe(true)
    expect(unfinishedReasons(q)).toHaveLength(1)
  })

  it('finishes once the formula sets', () => {
    expect(isUnfinished(question({ questionText: 'Find \\(\\frac{3}{8}\\).' }))).toBe(false)
  })

  it('names the part, the option and the marking guide it sits in', () => {
    const q = question({
      questionText: 'Answer the parts.',
      markingGuide: { sampleAnswer: '\\(x^\\)' },
      config: { parts: [{ label: '(b)', text: 'Find \\(y^\\).', marks: 2 }] },
    })
    expect(formulaChecks(q).map((c) => c.where)).toEqual(['Marking guide', 'Part (b)'])
    const mc = question({
      questionType: 'multiple_choice',
      questionText: 'Which?',
      config: { choices: [{ text: '\\(x^\\)' }, { text: 'B' }], correctAnswer: 1 },
    })
    expect(formulaChecks(mc).map((c) => c.where)).toEqual(['Options'])
  })

  it('leaves a code stimulus and the tags alone', () => {
    const q = question({
      questionText: 'Trace the program.',
      tags: ['\\(x^\\)'],
      stimulus: [{ kind: 'code', text: 'print("\\(x^\\)")' }],
    })
    expect(formulaChecks(q)).toEqual([])
  })
})

describe('strayOpeners', () => {
  it('finds an opener with no closer, quoting the rest of the line', () => {
    expect(strayOpeners('Simplify \\(\\frac{3}{8}')).toEqual([
      { display: false, empty: false, from: '\\(\\frac{3}{8}' },
    ])
  })

  it('finds an empty pair, of either kind', () => {
    expect(strayOpeners('Find \\(\\) and \\[ \\]')).toEqual([
      { display: false, empty: true, from: '\\(\\) and \\[ \\]' },
      { display: true, empty: true, from: '\\[ \\]' },
    ])
  })

  it('passes a formula that closes, and finds an opener after it', () => {
    expect(strayOpeners('\\(x\\) and \\(y').map((s) => s.from)).toEqual(['\\(y'])
    expect(strayOpeners('\\(x\\) and \\[y\\]')).toEqual([])
  })

  it('reads an escaped backslash and a code span as the renderer does', () => {
    // `\\(` is how a teacher prints a literal `\(`.
    expect(strayOpeners('Type \\\\( to start one')).toEqual([])
    expect(strayOpeners('Type `\\(` to start one')).toEqual([])
  })

  it('finds an opener inside bold, which holds the same rules', () => {
    expect(strayOpeners('**Find \\(x**').map((s) => s.from)).toEqual(['\\(x**'])
  })
})

describe('strayFormulas', () => {
  it('says where to close an unclosed formula, quoting a long one short', () => {
    expect(strayFormulas('Find \\(x^2')).toEqual([
      'Add \\) where the formula \\(x^2 ends. Until then it prints as typed.',
    ])
    expect(strayFormulas('\\[\\int_0^1 x^2 \\, dx + \\int_1^2 x \\, dx')).toEqual([
      'Add \\] where the formula \\[\\int_0^1 x^2 \\, dx +… ends. Until then it prints as typed.',
    ])
  })

  it('says to fill or remove an empty pair', () => {
    expect(strayFormulas('Find \\(\\).')).toEqual([
      'Type a formula between \\( and \\), or remove them. Empty, they print as typed.',
    ])
  })

  it('reads each line and each table cell on its own', () => {
    // A closer on the next line closes nothing, because a line is a paragraph.
    expect(strayFormulas('Find \\(x\nand y\\)')).toHaveLength(1)
    expect(strayFormulas('| a | b |\n|---|---|\n| \\(x | 2 |')).toHaveLength(1)
  })

  it('finds nothing in prose with no formula', () => {
    expect(strayFormulas('A jacket costs $80 (before GST).')).toEqual([])
  })
})

describe('a stray opener in the checker', () => {
  const question = (questionText: string, over: Partial<Question> = {}): Question => ({
    id: 'bank-sa-01',
    questionType: 'short_answer',
    questionText,
    marks: 2,
    markingGuide: { sampleAnswer: 'Any answer.' },
    ...over,
  })

  it('leaves the question unfinished until the formula is closed', () => {
    const open = question('Simplify \\(\\frac{3}{8}')
    expect(validateQuestion(open, emptyIdContext())).toEqual([
      {
        severity: 'warning',
        where: 'Question',
        unfinished: true,
        message: 'Add \\) where the formula \\(\\frac{3}{8} ends. Until then it prints as typed.',
      },
    ])
    expect(unfinishedReasons(open)).toHaveLength(1)
    expect(isUnfinished(question('Simplify \\(\\frac{3}{8}\\)'))).toBe(false)
  })

  it('names the part it sits in, and leaves a code stimulus alone', () => {
    const q = question('Answer the parts.', {
      config: { parts: [{ label: '(a)', text: 'Find \\(\\).', marks: 2 }] },
      stimulus: [{ kind: 'code', text: 'print("\\(")' }],
    })
    expect(validateQuestion(q, emptyIdContext()).map((c) => c.where)).toEqual(['Part (a)'])
  })
})
