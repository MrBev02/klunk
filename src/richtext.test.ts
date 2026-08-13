import { describe, expect, it } from 'vitest'
import { blocksOf, cellsOf, plainText } from './richtext'

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
