import { describe, expect, it } from 'vitest'
import { cleanCode, codeLines, printedWidth } from './code'

describe('code as it is stored', () => {
  // The case every column-0 example passes and a real extract fails: a program
  // quoted from inside a loop starts indented, and a trim takes that away.
  it('keeps the indentation of the first line', () => {
    expect(cleanCode('    gap = gap * 2\n    print(gap)')).toBe('    gap = gap * 2\n    print(gap)')
  })

  it('takes blank lines off the ends and spaces off the ends of lines', () => {
    expect(cleanCode('\n\n  x = 1   \n\n  y = 2\t\n\n')).toBe('  x = 1\n\n  y = 2')
  })

  it('turns Windows line endings into one kind', () => {
    expect(cleanCode('a = 1\r\n  b = 2\rc = 3')).toBe('a = 1\n  b = 2\nc = 3')
  })

  it('leaves nothing where there was only whitespace', () => {
    expect(cleanCode('  \n\t\n')).toBeUndefined()
    expect(cleanCode(undefined)).toBeUndefined()
  })

  it('splits into the lines a block prints, blank ones kept', () => {
    expect(codeLines('while True:\n\n    wait(1)\n')).toEqual(['while True:', '', '    wait(1)'])
    expect(codeLines('')).toEqual([])
  })
})

describe('how wide a line prints', () => {
  it('counts a tab to the next stop of four', () => {
    expect(printedWidth('abc')).toBe(3)
    expect(printedWidth('\tx')).toBe(5)
    expect(printedWidth('ab\tx')).toBe(5)
    expect(printedWidth('abcd\tx')).toBe(9)
  })
})
