// Pure commission math, shared by the boss Payroll page and the employee
// earnings summary. Kept dependency-free so it is easy to unit test.

// Given the configured tiers and a period sales total, return the tier that
// applies: the highest tier whose min_sales threshold the sales meet.
// Returns null when there are no tiers configured.
export function tierForSales(tiers, sales) {
  if (!Array.isArray(tiers) || tiers.length === 0) return null
  const amount = Number(sales) || 0
  const eligible = tiers
    .filter((t) => amount >= Number(t.min_sales || 0))
    .sort((a, b) => Number(b.min_sales || 0) - Number(a.min_sales || 0))
  // If sales fall below every threshold, use the lowest tier as the floor.
  if (eligible.length === 0) {
    return [...tiers].sort((a, b) => Number(a.min_sales || 0) - Number(b.min_sales || 0))[0]
  }
  return eligible[0]
}

// Commission earned on a period's sales given the configured tiers.
export function commissionForSales(tiers, sales) {
  const tier = tierForSales(tiers, sales)
  const rate = tier ? Number(tier.rate_percent || 0) : 0
  const amount = Number(sales) || 0
  return Math.round(amount * rate) / 100
}

// Roll up approved submissions into per-employee sales + commission. Each
// submission is expected to carry { employee_id, total_amount } and (optionally)
// an employee display name. Returns an array sorted by sales descending.
export function summarizePayroll(submissions, tiers, nameById = {}) {
  const byEmployee = new Map()
  for (const s of submissions || []) {
    const id = s.employee_id
    if (!id) continue
    const prev = byEmployee.get(id) || { employee_id: id, name: nameById[id] || id, sales: 0, stops: 0 }
    prev.sales += Number(s.total_amount || 0)
    prev.stops += 1
    byEmployee.set(id, prev)
  }
  const rows = [...byEmployee.values()].map((row) => {
    const tier = tierForSales(tiers, row.sales)
    return {
      ...row,
      rate_percent: tier ? Number(tier.rate_percent || 0) : 0,
      commission: commissionForSales(tiers, row.sales)
    }
  })
  rows.sort((a, b) => b.sales - a.sales)
  return rows
}
