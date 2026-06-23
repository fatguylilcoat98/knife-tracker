import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase.js'
import { downloadCsv, formatMoney, todayIso } from '../utils/csv.js'
import { summarizePayroll } from '../lib/commission.js'

function startOfMonthIso() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`
}

// The work date a submission belongs to: prefer the route date, fall back to
// the submitted timestamp's calendar day.
function submissionDate(s) {
  const routeDate = s.route_account?.route?.route_date
  if (routeDate) return routeDate
  return s.submitted_at ? s.submitted_at.slice(0, 10) : ''
}

export default function BossPayroll() {
  const [from, setFrom] = useState(startOfMonthIso())
  const [to, setTo] = useState(todayIso())
  const [includePending, setIncludePending] = useState(false)
  const [submissions, setSubmissions] = useState([])
  const [tiers, setTiers] = useState([])
  const [tierDraft, setTierDraft] = useState([])
  const [loading, setLoading] = useState(true)
  const [savingTiers, setSavingTiers] = useState(false)
  const [error, setError] = useState(null)
  const [info, setInfo] = useState(null)

  const loadTiers = async () => {
    const { data, error: e } = await supabase
      .from('commission_tiers')
      .select('*')
      .order('min_sales', { ascending: true })
    if (e) { setError(e.message); return }
    setTiers(data || [])
    setTierDraft((data || []).map((t) => ({
      min_sales: String(t.min_sales), rate_percent: String(t.rate_percent)
    })))
  }

  const loadSubmissions = async () => {
    setLoading(true); setError(null)
    const { data, error: e } = await supabase
      .from('submissions')
      .select(`
        id, status, submitted_at, total_amount, employee_id,
        employee:profiles!submissions_employee_id_fkey(id, full_name, email),
        route_account:route_accounts(route:routes(route_date))
      `)
      .order('submitted_at', { ascending: false })
    if (e) { setError(e.message); setLoading(false); return }
    setSubmissions(data || [])
    setLoading(false)
  }

  useEffect(() => { loadTiers(); loadSubmissions() }, [])

  const { rows, totals } = useMemo(() => {
    const inRange = submissions.filter((s) => {
      const d = submissionDate(s)
      if (from && d < from) return false
      if (to && d > to) return false
      if (!includePending && s.status !== 'approved') return false
      if (includePending && s.status === 'flagged') return false
      return true
    })
    const nameById = {}
    for (const s of inRange) {
      nameById[s.employee_id] = s.employee?.full_name || s.employee?.email || s.employee_id
    }
    const rows = summarizePayroll(inRange, tiers, nameById)
    const totals = rows.reduce(
      (acc, r) => ({ sales: acc.sales + r.sales, commission: acc.commission + r.commission, stops: acc.stops + r.stops }),
      { sales: 0, commission: 0, stops: 0 }
    )
    return { rows, totals }
  }, [submissions, tiers, from, to, includePending])

  const exportCsv = () => {
    if (!rows.length) { alert('Nothing to export'); return }
    downloadCsv(
      `accurate-edges-payroll-${from}_to_${to}.csv`,
      rows.map((r) => ({
        employee: r.name,
        stops: r.stops,
        sales: r.sales.toFixed(2),
        rate_percent: r.rate_percent,
        commission: r.commission.toFixed(2)
      }))
    )
  }

  const addTier = () => setTierDraft([...tierDraft, { min_sales: '', rate_percent: '' }])
  const removeTier = (i) => setTierDraft(tierDraft.filter((_, j) => j !== i))
  const updateTier = (i, field, value) => {
    const copy = [...tierDraft]
    copy[i] = { ...copy[i], [field]: value }
    setTierDraft(copy)
  }

  const saveTiers = async () => {
    setSavingTiers(true); setError(null); setInfo(null)
    const rowsToSave = tierDraft
      .filter((t) => t.min_sales !== '' && t.rate_percent !== '')
      .map((t) => ({ min_sales: Number(t.min_sales), rate_percent: Number(t.rate_percent) }))
    // Replace the whole schedule. delete-all needs a where clause in PostgREST.
    const { error: delErr } = await supabase
      .from('commission_tiers')
      .delete()
      .gte('min_sales', -1)
    if (delErr) { setError(delErr.message); setSavingTiers(false); return }
    if (rowsToSave.length) {
      const { error: insErr } = await supabase.from('commission_tiers').insert(rowsToSave)
      if (insErr) { setError(insErr.message); setSavingTiers(false); return }
    }
    setSavingTiers(false)
    setInfo('Commission schedule saved.')
    await loadTiers()
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-2 no-print">
        <div>
          <h1 className="ae-h1">Payroll</h1>
          <p className="ae-muted text-sm mt-1">
            Commission per employee for the selected period. Approved sales only,
            unless you include pending.
          </p>
        </div>
        <div className="flex gap-2">
          <button className="ae-btn-secondary" onClick={() => window.print()}>Print</button>
          <button className="ae-btn" onClick={exportCsv}>Export CSV</button>
        </div>
      </div>

      {error && <div className="ae-card p-3 text-sm text-red-600">{error}</div>}
      {info && <div className="ae-card p-3 text-sm text-emerald-700">{info}</div>}

      <div className="ae-card p-4 grid grid-cols-1 sm:grid-cols-3 gap-3 no-print">
        <div>
          <label className="ae-label">From</label>
          <input type="date" className="ae-input" value={from} onChange={(e) => setFrom(e.target.value)} />
        </div>
        <div>
          <label className="ae-label">To</label>
          <input type="date" className="ae-input" value={to} onChange={(e) => setTo(e.target.value)} />
        </div>
        <label className="flex items-end gap-2 pb-2">
          <input type="checkbox" className="h-5 w-5" checked={includePending} onChange={(e) => setIncludePending(e.target.checked)} />
          <span className="text-sm">Include pending (not flagged)</span>
        </label>
      </div>

      {loading ? (
        <div className="ae-muted">Loading…</div>
      ) : rows.length === 0 ? (
        <div className="ae-card p-6 text-center"><p className="ae-muted">No sales in this period.</p></div>
      ) : (
        <div className="ae-card p-4 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="ae-muted text-left">
                <th className="font-normal py-1">Employee</th>
                <th className="font-normal py-1 text-right">Stops</th>
                <th className="font-normal py-1 text-right">Sales</th>
                <th className="font-normal py-1 text-right">Rate</th>
                <th className="font-normal py-1 text-right">Commission</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.employee_id} className="border-t border-classic-border/40">
                  <td className="py-1.5">{r.name}</td>
                  <td className="py-1.5 text-right font-mono">{r.stops}</td>
                  <td className="py-1.5 text-right font-mono">{formatMoney(r.sales)}</td>
                  <td className="py-1.5 text-right font-mono">{r.rate_percent}%</td>
                  <td className="py-1.5 text-right font-mono font-bold">{formatMoney(r.commission)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-classic-border/60 font-bold">
                <td className="py-1.5">Total</td>
                <td className="py-1.5 text-right font-mono">{totals.stops}</td>
                <td className="py-1.5 text-right font-mono">{formatMoney(totals.sales)}</td>
                <td></td>
                <td className="py-1.5 text-right font-mono">{formatMoney(totals.commission)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      <div className="ae-card p-4 no-print">
        <h2 className="ae-h2 mb-1">Commission schedule</h2>
        <p className="ae-muted text-sm mb-3">
          The employee earns the rate of the highest tier their period sales reach.
        </p>
        <div className="space-y-2">
          <div className="flex gap-2 text-xs ae-muted">
            <div className="flex-1">Sales at or above ($)</div>
            <div className="w-28">Rate (%)</div>
            <div className="w-10" />
          </div>
          {tierDraft.map((t, i) => (
            <div key={i} className="flex gap-2">
              <input
                className="ae-input flex-1"
                inputMode="decimal"
                placeholder="0"
                value={t.min_sales}
                onChange={(e) => updateTier(i, 'min_sales', e.target.value)}
              />
              <input
                className="ae-input w-28"
                inputMode="decimal"
                placeholder="25"
                value={t.rate_percent}
                onChange={(e) => updateTier(i, 'rate_percent', e.target.value)}
              />
              <button type="button" className="ae-btn-danger px-3" onClick={() => removeTier(i)}>×</button>
            </div>
          ))}
          <div className="flex gap-2 pt-1">
            <button type="button" className="ae-btn-secondary text-sm" onClick={addTier}>+ Add tier</button>
            <button type="button" className="ae-btn text-sm" disabled={savingTiers} onClick={saveTiers}>
              {savingTiers ? 'Saving…' : 'Save schedule'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
