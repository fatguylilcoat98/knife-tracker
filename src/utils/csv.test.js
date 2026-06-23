import { describe, it, expect } from 'vitest'
import { toCsv, formatMoney } from './csv.js'

describe('toCsv', () => {
  it('returns empty string for no rows', () => {
    expect(toCsv([])).toBe('')
  })

  it('writes a header row from the first object keys', () => {
    const csv = toCsv([{ a: 1, b: 2 }])
    expect(csv.split('\n')[0]).toBe('a,b')
  })

  it('quotes values containing commas, quotes, or newlines', () => {
    const csv = toCsv([{ name: 'Smith, Inc', note: 'he said "hi"' }])
    const dataLine = csv.split('\n')[1]
    expect(dataLine).toBe('"Smith, Inc","he said ""hi"""')
  })

  it('renders null and undefined as empty cells', () => {
    const csv = toCsv([{ a: null, b: undefined, c: 0 }])
    expect(csv.split('\n')[1]).toBe(',,0')
  })
})

describe('formatMoney', () => {
  it('formats numbers as USD', () => {
    expect(formatMoney(4)).toBe('$4.00')
    expect(formatMoney(1234.5)).toBe('$1,234.50')
  })

  it('treats nullish as zero', () => {
    expect(formatMoney(null)).toBe('$0.00')
    expect(formatMoney(undefined)).toBe('$0.00')
  })
})
