import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase.js'
import { useAuth } from '../contexts/AuthContext.jsx'
import { todayIso, formatMoney } from '../utils/csv.js'

export default function EmployeeToday() {
  const { user } = useAuth()
  const [route, setRoute] = useState(null)
  const [stops, setStops] = useState([])             // [{ ra, account, submission }]
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    let mounted = true
    const load = async () => {
      setLoading(true); setError(null)
      const today = todayIso()
      const { data: routes, error: e } = await supabase
        .from('routes')
        .select('id, route_date, route_accounts(id, order_index, account:accounts(id, name, address))')
        .eq('employee_id', user.id)
        .eq('route_date', today)
        .limit(1)
      if (!mounted) return
      if (e) { setError(e.message); setLoading(false); return }
      const r = routes?.[0] || null
      setRoute(r)
      if (!r) { setStops([]); setLoading(false); return }

      const ras = [...(r.route_accounts || [])].sort((a, b) => a.order_index - b.order_index)
      const raIds = ras.map((x) => x.id)
      let submissionsByRA = {}
      if (raIds.length) {
        const { data: subs, error: e2 } = await supabase
          .from('submissions')
          .select('id, route_account_id, status, total_amount, submitted_at')
          .in('route_account_id', raIds)
          .eq('employee_id', user.id)
        if (e2) { setError(e2.message) }
        for (const s of (subs || [])) submissionsByRA[s.route_account_id] = s
      }
      setStops(ras.map((ra) => ({
        ra,
        account: ra.account,
        submission: submissionsByRA[ra.id] || null
      })))
      setLoading(false)
    }
    load()
    return () => { mounted = false }
  }, [user.id])

  const total = stops.reduce((sum, s) => sum + Number(s.submission?.total_amount || 0), 0)
  const done = stops.filter((s) => s.submission).length

  return (
    <div className="space-y-4">
      <div>
        <h1 className="ae-h1">Today's route</h1>
        <p className="ae-muted text-sm mt-1">{todayIso()}</p>
      </div>

      {error && <div className="ae-card p-3 text-sm text-red-600">{error}</div>}

      {loading ? (
        <div className="ae-muted">Loading…</div>
      ) : !route ? (
        <div className="ae-card p-6 text-center">
          <p className="ae-muted">No route assigned for today. Check back later.</p>
        </div>
      ) : stops.length === 0 ? (
        <div className="ae-card p-6 text-center">
          <p className="ae-muted">Route has no stops yet.</p>
        </div>
      ) : (
        <>
          <div className="ae-card p-4 flex items-center justify-between">
            <div>
              <div className="ae-muted text-xs uppercase tracking-wider">Progress</div>
              <div className="font-mono text-lg">{done} / {stops.length}</div>
            </div>
            <div className="text-right">
              <div className="ae-muted text-xs uppercase tracking-wider">Day total</div>
              <div className="font-mono text-lg font-bold">{formatMoney(total)}</div>
            </div>
          </div>

          <ol className="space-y-2">
            {stops.map(({ ra, account, submission }, i) => (
              <li key={ra.id}>
                <Link to={`/stop/${ra.id}`} className="ae-card p-4 flex items-center gap-3 hover:opacity-90">
                  <div className="font-mono text-lg w-8">{i + 1}.</div>
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold truncate">{account?.name}</div>
                    {account?.address && (
                      <div className="ae-muted text-sm truncate">{account.address}</div>
                    )}
                  </div>
                  {submission ? (
                    <span className={`ae-chip ${
                      submission.status === 'approved' ? '!bg-emerald-100 !text-emerald-800'
                      : submission.status === 'flagged' ? '!bg-amber-100 !text-amber-800'
                      : ''
                    }`}>
                      {submission.status === 'pending' ? 'Submitted' : submission.status}
                    </span>
                  ) : (
                    <span className="ae-muted text-sm">Tap →</span>
                  )}
                </Link>
              </li>
            ))}
          </ol>
        </>
      )}
    </div>
  )
}
