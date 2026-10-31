import { describe, expect, it } from 'vitest'
import { blocksOf, cellsOf, hasMarkup, plainText, runsOf, stripInline } from './richtext'

describe('the markup a question is allowed to carry', () => {
  const table = [
    '| Timber | Hardness | Cost |',
    '| --- | --- | --- |',
    '| Pine | Low | Low |',
    '| Jarrah | High | High |',
  ].join('\n')

  it('reads a pipe table as a table', () => {
    expect(blocksOf(table)).toEqual([
      {
        kind: 'table',
        head: ['Timber', 'Hardness', 'Cost'],
        rows: [
          ['Pine', 'Low', 'Low'],
          ['Jarrah', 'High', 'High'],
        ],
      },
    ])
  })

  it('keeps the prose either side of it', () => {
    const blocks = blocksOf(`The table shows what four timbers cost.\n\n${table}\n\nWhich is best?`)
    expect(blocks.map((b) => b.kind)).toEqual(['text', 'table', 'text'])
  })

  it('needs the separator row, so a sentence with a pipe in it is prose', () => {
    // Without this a stem mentioning `A|B` and wrapping onto a second line that
    // also holds one would be read as a two-row table of nonsense.
    const blocks = blocksOf('| this looks like a row |\n| and so does this |')
    expect(blocks.every((b) => b.kind === 'text')).toBe(true)
  })

  it('reads an escaped pipe as a pipe inside its own cell', () => {
    expect(cellsOf('| Pine | A\\|B | Low |')).toEqual(['Pine', 'A|B', 'Low'])
  })

  it('keeps a row that ends with an escaped pipe whole', () => {
    expect(cellsOf('| Pine | ends with a bar \\| |')).toEqual(['Pine', 'ends with a bar |'])
  })

  it('pads a short row rather than dropping it, so the table stays square', () => {
    const [block] = blocksOf('| A | B | C |\n| --- | --- | --- |\n| one | two |')
    expect(block).toEqual({ kind: 'table', head: ['A', 'B', 'C'], rows: [['one', 'two', '']] })
  })

  it('gives every line its own paragraph, so pressing Enter does something', () => {
    expect(blocksOf('One line.\nAnother line.')).toEqual([
      { kind: 'text', text: 'One line.' },
      { kind: 'text', text: 'Another line.' },
    ])
  })

  it('takes the markup back out for a list, a search and a prompt', () => {
    expect(plainText(`The table shows what four timbers cost.\n\n${table}`)).toBe(
      'The table shows what four timbers cost. Timber Hardness Cost Pine Low Low Jarrah High High',
    )
  })

  it('leaves text with no markup in it exactly as it was', () => {
    expect(plainText('Explain how a designer establishes the needs of a client.')).toBe(
      'Explain how a designer establishes the needs of a client.',
    )
  })
})

describe('the four inline marks', () => {
  it('reads bold, italic and underline', () => {
    expect(runsOf('Outline **TWO** benefits')).toEqual([
      { text: 'Outline ' },
      { text: 'TWO', bold: true },
      { text: ' benefits' },
    ])
    expect(runsOf('the *Acacia* genus')).toEqual([
      { text: 'the ' },
      { text: 'Acacia', italic: true },
      { text: ' genus' },
    ])
    expect(runsOf('Do <u>not</u> write here')).toEqual([
      { text: 'Do ' },
      { text: 'not', underline: true },
      { text: ' write here' },
    ])
  })

  it('nests one inside another', () => {
    expect(runsOf('<u>**both**</u>')).toEqual([{ text: 'both', bold: true, underline: true }])
    expect(runsOf('**bold and *also* italic**')).toEqual([
      { text: 'bold and ', bold: true },
      { text: 'also', bold: true, italic: true },
      { text: ' italic', bold: true },
    ])
  })

  it('leaves arithmetic alone, because a mark never sits against a space', () => {
    // The reason underline is a tag and not `__`: this is the shape that would
    // break, and it is on every junior paper that asks a student to fill a gap.
    expect(stripInline('Calculate 2 * 3 and then 4 * 5.')).toBe('Calculate 2 * 3 and then 4 * 5.')
    expect(runsOf('Calculate 2 * 3 and then 4 * 5.')).toEqual([
      { text: 'Calculate 2 * 3 and then 4 * 5.' },
    ])
    expect(runsOf('The process of ________ is used.')).toEqual([
      { text: 'The process of ________ is used.' },
    ])
  })

  it('prints an unmatched mark as the character it is', () => {
    expect(runsOf('A single * asterisk')).toEqual([{ text: 'A single * asterisk' }])
    expect(runsOf('*never closed')).toEqual([{ text: '*never closed' }])
    expect(runsOf('An <u>unclosed tag')).toEqual([{ text: 'An <u>unclosed tag' }])
  })

  it('honours a backslash, so a question can print the marks themselves', () => {
    expect(runsOf('Multiply with \\*, not x')).toEqual([{ text: 'Multiply with *, not x' }])
    // Escaping the opening angle is enough: `<u>` is a token, not a tag.
    expect(stripInline('Write \\<u> to underline')).toBe('Write <u> to underline')
  })

  it('marks a word inside a table cell', () => {
    const [block] = blocksOf('| Metal | Note |\n| --- | --- |\n| Steel | **hard** |')
    expect(block).toEqual({ kind: 'table', head: ['Metal', 'Note'], rows: [['Steel', '**hard**']] })
    expect(runsOf('**hard**')).toEqual([{ text: 'hard', bold: true }])
  })

  it('reads a code span, and nothing inside it is markup', () => {
    expect(runsOf('Change the value of `gap` on line 2')).toEqual([
      { text: 'Change the value of ' },
      { text: 'gap', code: true },
      { text: ' on line 2' },
    ])
    expect(runsOf('`a **b** <u>c</u> \\* d`')).toEqual([
      { text: 'a **b** <u>c</u> \\* d', code: true },
    ])
  })

  it('keeps every asterisk of a formula written in a code span (#121)', () => {
    // The three rows of #121's table, each of which loses asterisks unprotected.
    for (const formula of ['=B3*C3', '=B3*C3*D3', '=IF(C3>10,B3*0.9*C3,B3*C3)']) {
      expect(runsOf(`Enter \`${formula}\` in E3`)).toEqual([
        { text: 'Enter ' },
        { text: formula, code: true },
        { text: ' in E3' },
      ])
    }
  })

  it('does not let an asterisk inside a span close an italic around it', () => {
    expect(runsOf('*see `x*y` here*')).toEqual([
      { text: 'see ', italic: true },
      { text: 'x*y', italic: true, code: true },
      { text: ' here', italic: true },
    ])
    expect(runsOf('<u>`a</u>b`</u>')).toEqual([{ text: 'a</u>b', underline: true, code: true }])
  })

  it('nests a code span inside the other marks', () => {
    expect(runsOf('**`print()`**')).toEqual([{ text: 'print()', bold: true, code: true }])
  })

  it('prints an unmatched or empty backtick as itself', () => {
    expect(runsOf('A lone ` backtick')).toEqual([{ text: 'A lone ` backtick' }])
    expect(runsOf('Two together `` print')).toEqual([{ text: 'Two together `` print' }])
    expect(runsOf('Escaped \\`not code\\`')).toEqual([{ text: 'Escaped `not code`' }])
  })

  it('keeps the text of a code span for a list and a search', () => {
    expect(plainText('Trace `gap` through the loop')).toBe('Trace gap through the loop')
    expect(hasMarkup('Trace `gap` through the loop')).toBe(false)
  })

  it('takes the marks off for a list and a search', () => {
    // `questionLabel` and `questionHaystack` both go through this, so a teacher
    // searching for "TWO" finds the question that emphasises it.
    expect(plainText('Outline **TWO** benefits of *automated* backups.')).toBe(
      'Outline TWO benefits of automated backups.',
    )
  })
})

describe('mathematics in question text', () => {
  it('leaves prices alone, which is why $ is not a delimiter', () => {
    expect(runsOf('A jacket costs $80 and a hat costs $25.')).toEqual([
      { text: 'A jacket costs $80 and a hat costs $25.' },
    ])
  })

  it('reads an inline formula', () => {
    expect(runsOf('Simplify \\(3x^2 \\times 4x^5\\).')).toEqual([
      { text: 'Simplify ' },
      { text: '3x^2 \\times 4x^5', math: 'inline' },
      { text: '.' },
    ])
  })

  it('reads a display formula', () => {
    expect(runsOf('\\[ x = \\frac{-b}{2a} \\]')).toEqual([
      { text: 'x = \\frac{-b}{2a}', math: 'display' },
    ])
  })

  it('keeps asterisks inside a formula and does not let them close an italic', () => {
    expect(runsOf('*Find \\(a*b\\) here*')).toEqual([
      { text: 'Find ', italic: true },
      { text: 'a*b', italic: true, math: 'inline' },
      { text: ' here', italic: true },
    ])
  })

  it('carries bold onto a formula inside it', () => {
    expect(runsOf('**\\(x = 4\\)**')).toEqual([{ text: 'x = 4', bold: true, math: 'inline' }])
  })

  it('does not let a closing tag inside a formula close the underline around it', () => {
    expect(runsOf('<u>\\(a</u>b\\) end</u>')).toEqual([
      { text: 'a</u>b', underline: true, math: 'inline' },
      { text: ' end', underline: true },
    ])
  })

  it('leaves a formula written inside a code span as code', () => {
    // The span opened first, so its contents are not markup of any kind.
    expect(runsOf('`\\(x\\)`')).toEqual([{ text: '\\(x\\)', code: true }])
  })

  it('keeps two formulas side by side apart', () => {
    expect(runsOf('\\(a\\)\\(b\\)')).toEqual([
      { text: 'a', math: 'inline' },
      { text: 'b', math: 'inline' },
    ])
  })

  it('prints an unclosed or empty opener as itself', () => {
    expect(runsOf('a \\( b')).toEqual([{ text: 'a \\( b' }])
    expect(runsOf('a \\(\\) b')).toEqual([{ text: 'a \\(\\) b' }])
  })

  it('lets an escaped backslash stop a formula opening', () => {
    expect(runsOf('\\\\(x\\)')).toEqual([{ text: '\\(x\\)' }])
  })

  it('keeps a formula inside a table cell', () => {
    const [table] = blocksOf('| Score | Frequency |\n| --- | --- |\n| \\(x\\) | 3 |')
    expect(table).toEqual({ kind: 'table', head: ['Score', 'Frequency'], rows: [['\\(x\\)', '3']] })
  })

  it('counts a formula as markup a one-line summary cannot show, as a table is', () => {
    expect(hasMarkup('Simplify \\(3x^2 \\times 4x^5\\).')).toBe(true)
    expect(hasMarkup('A jacket costs $80 and a hat costs $25.')).toBe(false)
    expect(hasMarkup('Outline **TWO** benefits')).toBe(false)
  })

  it('searches the TeX source, so a student can look for frac', () => {
    expect(plainText('Write \\(\\frac{9}{4}\\) as a mixed numeral.')).toBe(
      'Write \\frac{9}{4} as a mixed numeral.',
    )
  })
})
