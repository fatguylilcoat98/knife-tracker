import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase.js'
import { useAuth } from '../contexts/AuthContext.jsx'
import { formatMoney } from '../utils/csv.js'
import { commissionForSales, tierForSales } from '../lib/commission.js'

export default function EmployeeHistory() {
  const { user } = useAuth()
  const [submissions, setSubmissions] = useState([])
  const [tiers, setTiers] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    (async () => {
      setLoading(true); setError(null)
      const [subsRes, tiersRes] = await Promise.all([
        supabase
          .from('submissions')
          .select(`
            id, status, submitted_at, total_amount,
            route_account:route_accounts(account:accounts(name), route:routes(route_date))
          `)
          .eq('employee_id', user.id)
          .order('submitted_at', { ascending: false })
          .limit(100),
        supabase.from('commission_tiers').select('*')
      ])
      if (subsRes.error) setError(subsRes.error.message)
      setSubmissions(subsRes.data || [])
      setTiers(tiersRes.data || [])
      setLoading(false)
    })()
  }, [user.id])

  // Month-to-date earnings estimate from approved sales.
  const earnings = useMemo(() => {
    const monthStart = new Date()
    monthStart.setDate(1); monthStart.setHours(0, 0, 0, 0)
    const sales = submissions
      .filter((s) => s.status === 'approved' && new Date(s.submitted_at) >= monthStart)
      .reduce((sum, s) => sum + Number(s.total_amount || 0), 0)
    const tier = tierForSales(tiers, sales)
    return { sales, rate: tier ? Number(tier.rate_percent || 0) : 0, commission: commissionForSales(tiers, sales) }
  }, [submissions, tiers])

  return (
    <div className="space-y-4">
      <div>
        <h1 className="ae-h1">History</h1>
        <p className="ae-muted text-sm mt-1">Your last 100 submissions.</p>
      </div>

      {!loading && (
        <div className="ae-card p-4 grid grid-cols-3 gap-2 text-center">
          <div>
            <div className="ae-muted text-xs uppercase tracking-wider">MTD sales</div>
            <div className="font-mono text-lg font-bold">{formatMoney(earnings.sales)}</div>
          </div>
          <div>
            <div className="ae-muted text-xs uppercase tracking-wider">Rate</div>
            <div className="font-mono text-lg font-bold">{earnings.rate}%</div>
          </div>
          <div>
            <div className="ae-muted text-xs uppercase tracking-wider">Est. commission</div>
            <div className="font-mono text-lg font-bold">{formatMoney(earnings.commission)}</div>
          </div>
        </div>
      )}

      {error && <div className="ae-card p-3 text-sm text-red-600">{error}</div>}
      {loading ? (
        <div className="ae-muted">Loading…</div>
      ) : submissions.length === 0 ? (
        <div className="ae-card p-6 text-center"><p className="ae-muted">Nothing yet.</p></div>
      ) : (
        <div className="space-y-2">
          {submissions.map((s) => (
            <div key={s.id} className="ae-card p-3 flex items-center justify-between">
              <div className="min-w-0">
                <div className="font-medium truncate">{s.route_account?.account?.name || 'Unknown'}</div>
                <div className="ae-muted text-xs">
                  {s.route_account?.route?.route_date || ''} · {new Date(s.submitted_at).toLocaleString()}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className={`ae-chip ${
                  s.status === 'approved' ? '!bg-emerald-100 !text-emerald-800'
                  : s.status === 'flagged' ? '!bg-amber-100 !text-amber-800' : ''
                }`}>{s.status}</span>
                <span className="font-mono font-bold">{formatMoney(s.total_amount)}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
