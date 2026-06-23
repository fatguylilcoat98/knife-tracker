import { useEffect, useMemo, useState } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { supabase } from '../lib/supabase.js'
import { useAuth } from '../contexts/AuthContext.jsx'
import { formatMoney } from '../utils/csv.js'
import { submitStopToServer } from '../lib/submitStop.js'
import { enqueueSubmission, isOffline } from '../lib/offlineQueue.js'

export default function EmployeeAccount() {
  const { routeAccountId } = useParams()
  const { user } = useAuth()
  const navigate = useNavigate()

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [stop, setStop] = useState(null)
  const [services, setServices] = useState([])
  const [quantities, setQuantities] = useState({}) // service_name -> qty
  const [notes, setNotes] = useState('')
  const [existing, setExisting] = useState(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let mounted = true
    const load = async () => {
      setLoading(true); setError(null)
      const { data: ra, error: e } = await supabase
        .from('route_accounts')
        .select('id, account:accounts(id, name, address, phone, payment_terms, notes), route:routes(id, route_date, employee_id)')
        .eq('id', routeAccountId)
        .single()
      if (!mounted) return
      if (e) { setError(e.message); setLoading(false); return }
      if (ra.route.employee_id !== user.id) {
        setError('This stop is not on your route.'); setLoading(false); return
      }
      setStop(ra)
      const { data: svc, error: e2 } = await supabase
        .from('services')
        .select('id, service_name, price_per_unit')
        .eq('account_id', ra.account.id)
        .order('service_name')
      if (e2) { setError(e2.message); setLoading(false); return }
      setServices(svc || [])

      const { data: subs } = await supabase
        .from('submissions')
        .select('id, status, total_amount, notes, items:submission_items(id, service_name, quantity, unit_price, line_total)')
        .eq('route_account_id', routeAccountId)
        .eq('employee_id', user.id)
        .limit(1)
      const sub = subs?.[0] || null
      setExisting(sub)
      if (sub) {
        const q = {}
        for (const it of (sub.items || [])) q[it.service_name] = String(it.quantity)
        setQuantities(q)
        setNotes(sub.notes || '')
      }
      setLoading(false)
    }
    load()
    return () => { mounted = false }
  }, [routeAccountId, user.id])

  const total = useMemo(() => {
    return services.reduce((sum, s) => {
      const q = Number(quantities[s.service_name] || 0)
      return sum + q * Number(s.price_per_unit || 0)
    }, 0)
  }, [services, quantities])

  const readOnly = !!existing && existing.status !== 'flagged'

  const submit = async () => {
    if (readOnly) return
    setBusy(true); setError(null)

    const items = services
      .map((s) => {
        const q = Number(quantities[s.service_name] || 0)
        if (!q) return null
        return {
          service_name: s.service_name,
          quantity: q,
          unit_price: Number(s.price_per_unit || 0),
          line_total: q * Number(s.price_per_unit || 0)
        }
      })
      .filter(Boolean)

    const payload = {
      routeAccountId,
      employeeId: user.id,
      total,
      notes: notes || null,
      items
    }

    // Offline (or a failed network write): queue it and let the app replay when
    // connectivity returns, so a field submit is never silently lost.
    if (isOffline()) {
      enqueueSubmission(payload)
      setBusy(false)
      navigate('/')
      return
    }

    try {
      await submitStopToServer(payload)
      navigate('/')
    } catch (err) {
      if (isOffline()) {
        enqueueSubmission(payload)
        navigate('/')
        return
      }
      setError(err.message || 'Submission failed')
    } finally {
      setBusy(false)
    }
  }

  if (loading) return <div className="ae-muted">Loading…</div>
  if (error) return <div className="ae-card p-3 text-sm text-red-600">{error}</div>
  if (!stop) return null

  const a = stop.account

  return (
    <div className="space-y-4">
      <div>
        <Link to="/" className="ae-muted text-sm underline">← Back to route</Link>
      </div>

      <div className="ae-card p-4">
        <h1 className="ae-h1">{a.name}</h1>
        {a.address && (
          <a
            className="ae-muted text-sm underline block mt-1"
            href={`https://maps.google.com/?q=${encodeURIComponent(a.address)}`}
            target="_blank" rel="noreferrer"
          >
            {a.address}
          </a>
        )}
        {a.phone && (
          <a className="ae-muted text-sm underline block" href={`tel:${a.phone}`}>{a.phone}</a>
        )}
        {a.payment_terms && (
          <div className="mt-1"><span className="ae-chip">{a.payment_terms}</span></div>
        )}
        {a.notes && <div className="ae-muted text-sm mt-2 whitespace-pre-line">{a.notes}</div>}
      </div>

      {existing && (
        <div className={`ae-card p-3 text-sm ${
          existing.status === 'approved' ? 'border-emerald-300' :
          existing.status === 'flagged' ? 'border-amber-400' : ''
        }`}>
          Submission status: <strong>{existing.status}</strong>.
          {existing.status === 'flagged' && ' The boss flagged this — you can edit and resubmit.'}
          {existing.status === 'approved' && ' Approved — no further changes allowed.'}
          {existing.status === 'pending' && ' Submitted and waiting on the boss.'}
        </div>
      )}

      <div className="ae-card p-4">
        <h2 className="ae-h2 mb-3">Services</h2>
        {services.length === 0 ? (
          <div className="ae-muted text-sm">No services configured for this account yet.</div>
        ) : (
          <div className="space-y-3">
            {services.map((s) => (
              <div key={s.id} className="flex items-center gap-3">
                <div className="flex-1 min-w-0">
                  <div className="font-medium truncate">{s.service_name}</div>
                  <div className="ae-muted text-xs font-mono">{formatMoney(s.price_per_unit)} each</div>
                </div>
                <input
                  type="number"
                  inputMode="numeric"
                  min="0"
                  className="ae-input w-24 text-right"
                  disabled={readOnly}
                  value={quantities[s.service_name] || ''}
                  onChange={(e) => setQuantities({ ...quantities, [s.service_name]: e.target.value })}
                  placeholder="0"
                />
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="ae-card p-4">
        <label className="ae-label">Notes for the boss (optional)</label>
        <textarea
          className="ae-input"
          rows={2}
          disabled={readOnly}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
        />
      </div>

      <div className="ae-card p-4 flex items-center justify-between">
        <div>
          <div className="ae-muted text-xs uppercase tracking-wider">Total</div>
          <div className="font-mono text-2xl font-bold">{formatMoney(total)}</div>
        </div>
        <button
          className="ae-btn px-6 py-3 text-base"
          onClick={submit}
          disabled={readOnly || busy || total === 0}
        >
          {busy ? 'Submitting…' : existing?.status === 'flagged' ? 'Resubmit' : 'Submit'}
        </button>
      </div>
    </div>
  )
}
