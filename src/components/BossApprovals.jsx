import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase.js'
import { downloadCsv, formatMoney } from '../utils/csv.js'

const STATUS_LABEL = { pending: 'Pending', approved: 'Approved', flagged: 'Flagged' }

export default function BossApprovals() {
  const [submissions, setSubmissions] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [filter, setFilter] = useState('pending')

  const load = async () => {
    setLoading(true); setError(null)
    const { data, error: e } = await supabase
      .from('submissions')
      .select(`
        id, status, submitted_at, total_amount, notes, employee_id,
        employee:profiles!submissions_employee_id_fkey(id, full_name),
        route_account:route_accounts(
          id, order_index,
          account:accounts(id, name, address),
          route:routes(id, route_date)
        ),
        items:submission_items(id, service_name, quantity, unit_price, line_total)
      `)
      .order('submitted_at', { ascending: false })
    if (e) { setError(e.message); setLoading(false); return }
    setSubmissions(data || [])
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  const setStatus = async (id, status) => {
    const { error: e } = await supabase.from('submissions').update({ status }).eq('id', id)
    if (e) { setError(e.message); return }
    setSubmissions((prev) => prev.map((s) => s.id === id ? { ...s, status } : s))
  }

  const filtered = useMemo(
    () => filter === 'all' ? submissions : submissions.filter((s) => s.status === filter),
    [submissions, filter]
  )

  const exportCsv = () => {
    const rows = []
    for (const s of filtered) {
      const acct = s.route_account?.account
      const route = s.route_account?.route
      for (const item of (s.items || [])) {
        rows.push({
          submission_id: s.id,
          status: s.status,
          submitted_at: s.submitted_at,
          route_date: route?.route_date || '',
          employee: s.employee?.full_name || s.employee_id,
          account: acct?.name || '',
          address: acct?.address || '',
          service: item.service_name,
          quantity: item.quantity,
          unit_price: item.unit_price,
          line_total: item.line_total,
          submission_total: s.total_amount,
          notes: s.notes || ''
        })
      }
      if (!s.items?.length) {
        rows.push({
          submission_id: s.id,
          status: s.status,
          submitted_at: s.submitted_at,
          route_date: route?.route_date || '',
          employee: s.employee?.full_name || s.employee_id,
          account: acct?.name || '',
          address: acct?.address || '',
          service: '',
          quantity: '',
          unit_price: '',
          line_total: '',
          submission_total: s.total_amount,
          notes: s.notes || ''
        })
      }
    }
    if (!rows.length) { alert('Nothing to export'); return }
    downloadCsv(`accurate-edges-${filter}-${new Date().toISOString().slice(0,10)}.csv`, rows)
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-2 no-print">
        <div>
          <h1 className="ae-h1">Approvals</h1>
          <p className="ae-muted text-sm mt-1">Review employee submissions, approve, or flag.</p>
        </div>
        <div className="flex gap-2">
          <select className="ae-input" value={filter} onChange={(e) => setFilter(e.target.value)}>
            <option value="pending">Pending</option>
            <option value="approved">Approved</option>
            <option value="flagged">Flagged</option>
            <option value="all">All</option>
          </select>
          <button className="ae-btn-secondary" onClick={() => window.print()}>Print</button>
          <button className="ae-btn" onClick={exportCsv}>Export CSV</button>
        </div>
      </div>

      {error && <div className="ae-card p-3 text-sm text-red-600">{error}</div>}

      {loading ? (
        <div className="ae-muted">Loading submissions…</div>
      ) : filtered.length === 0 ? (
        <div className="ae-card p-6 text-center">
          <p className="ae-muted">Nothing here.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((s) => {
            const acct = s.route_account?.account
            const route = s.route_account?.route
            return (
              <div key={s.id} className="ae-card p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <div className="font-semibold">{acct?.name || 'Unknown account'}</div>
                    <div className="ae-muted text-sm">
                      {s.employee?.full_name || s.employee_id} · {new Date(s.submitted_at).toLocaleString()}
                      {route?.route_date ? ` · route ${route.route_date}` : ''}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`ae-chip ${
                      s.status === 'approved' ? '!bg-emerald-100 !text-emerald-800'
                      : s.status === 'flagged' ? '!bg-amber-100 !text-amber-800'
                      : ''
                    }`}>
                      {STATUS_LABEL[s.status]}
                    </span>
                    <span className="font-mono font-bold">{formatMoney(s.total_amount)}</span>
                  </div>
                </div>

                {s.items?.length > 0 && (
                  <table className="w-full mt-3 text-sm">
                    <thead>
                      <tr className="ae-muted text-left">
                        <th className="font-normal py-1">Service</th>
                        <th className="font-normal py-1 text-right">Qty</th>
                        <th className="font-normal py-1 text-right">Unit</th>
                        <th className="font-normal py-1 text-right">Line total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {s.items.map((it) => (
                        <tr key={it.id} className="border-t border-classic-border/40">
                          <td className="py-1">{it.service_name}</td>
                          <td className="py-1 text-right font-mono">{it.quantity}</td>
                          <td className="py-1 text-right font-mono">{formatMoney(it.unit_price)}</td>
                          <td className="py-1 text-right font-mono">{formatMoney(it.line_total)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}

                {s.notes && <div className="ae-muted text-sm mt-2">Note: {s.notes}</div>}

                <div className="mt-3 flex flex-wrap gap-2 no-print">
                  {s.status !== 'approved' && (
                    <button className="ae-btn" onClick={() => setStatus(s.id, 'approved')}>Approve</button>
                  )}
                  {s.status !== 'flagged' && (
                    <button className="ae-btn-danger" onClick={() => setStatus(s.id, 'flagged')}>Flag</button>
                  )}
                  {s.status !== 'pending' && (
                    <button className="ae-btn-secondary" onClick={() => setStatus(s.id, 'pending')}>Reset to pending</button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
