import { describe, expect, it } from 'vitest'
import { blocksOf, cellsOf, plainText, runsOf, stripInline } from './richtext'

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

describe('the three inline marks', () => {
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

  it('takes the marks off for a list and a search', () => {
    // `questionLabel` and `questionHaystack` both go through this, so a teacher
    // searching for "TWO" finds the question that emphasises it.
    expect(plainText('Outline **TWO** benefits of *automated* backups.')).toBe(
      'Outline TWO benefits of automated backups.',
    )
  })
})
