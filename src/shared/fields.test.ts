import { describe, expect, it } from 'vitest'
import { startingBank } from './fields'

describe('startingBank (#137)', () => {
  const banks = ['bank/a.json', 'bank/y9.json']

  it('starts on the first bank when the folder names no default', () => {
    expect(startingBank(banks, undefined)).toEqual({
      bank: 'bank/a.json',
      newPath: 'bank/questions.json',
    })
    expect(startingBank([], undefined)).toEqual({ bank: null, newPath: 'bank/questions.json' })
  })

  it('starts on the default bank when it is in the folder', () => {
    expect(startingBank(banks, 'bank/y9.json').bank).toBe('bank/y9.json')
    // Written by hand without the extension, it still finds the bank.
    expect(startingBank(banks, 'bank/y9').bank).toBe('bank/y9.json')
  })

  it('offers the default as a new bank when it is not there yet', () => {
    expect(startingBank(banks, 'bank/y10.json')).toEqual({ bank: null, newPath: 'bank/y10.json' })
  })
})
