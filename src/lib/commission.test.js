import { describe, it, expect } from 'vitest'
import { tierForSales, commissionForSales, summarizePayroll } from './commission.js'

const TIERS = [
  { min_sales: 0, rate_percent: 20 },
  { min_sales: 1000, rate_percent: 22.5 },
  { min_sales: 2500, rate_percent: 25 },
  { min_sales: 5000, rate_percent: 30 }
]

describe('tierForSales', () => {
  it('returns the lowest tier below the first threshold', () => {
    expect(tierForSales(TIERS, 0).rate_percent).toBe(20)
    expect(tierForSales(TIERS, 999).rate_percent).toBe(20)
  })

  it('picks the highest tier whose threshold is met', () => {
    expect(tierForSales(TIERS, 1000).rate_percent).toBe(22.5)
    expect(tierForSales(TIERS, 2500).rate_percent).toBe(25)
    expect(tierForSales(TIERS, 9999).rate_percent).toBe(30)
  })

  it('returns null when no tiers configured', () => {
    expect(tierForSales([], 1000)).toBeNull()
    expect(tierForSales(null, 1000)).toBeNull()
  })
})

describe('commissionForSales', () => {
  it('applies the resolved tier rate to the whole period', () => {
    expect(commissionForSales(TIERS, 1000)).toBeCloseTo(225, 2)
    expect(commissionForSales(TIERS, 2500)).toBeCloseTo(625, 2)
  })

  it('rounds to cents', () => {
    expect(commissionForSales(TIERS, 333.33)).toBeCloseTo(66.67, 2)
  })

  it('returns 0 with no tiers', () => {
    expect(commissionForSales([], 5000)).toBe(0)
  })
})

describe('summarizePayroll', () => {
  it('rolls up sales and commission per employee, sorted by sales', () => {
    const subs = [
      { employee_id: 'a', total_amount: 600 },
      { employee_id: 'a', total_amount: 600 },
      { employee_id: 'b', total_amount: 100 }
    ]
    const rows = summarizePayroll(subs, TIERS, { a: 'Alice', b: 'Bob' })
    expect(rows).toHaveLength(2)
    expect(rows[0]).toMatchObject({ employee_id: 'a', name: 'Alice', sales: 1200, stops: 2, rate_percent: 22.5 })
    expect(rows[0].commission).toBeCloseTo(270, 2)
    expect(rows[1]).toMatchObject({ employee_id: 'b', sales: 100, rate_percent: 20 })
  })

  it('ignores rows without an employee id', () => {
    const rows = summarizePayroll([{ total_amount: 50 }], TIERS)
    expect(rows).toHaveLength(0)
  })
})
