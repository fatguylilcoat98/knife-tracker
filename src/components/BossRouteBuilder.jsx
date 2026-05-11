import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase.js'
import { useAuth } from '../contexts/AuthContext.jsx'
import { todayIso } from '../utils/csv.js'

export default function BossRouteBuilder() {
  const { user } = useAuth()
  const [employees, setEmployees] = useState([])
  const [accounts, setAccounts] = useState([])
  const [employeeId, setEmployeeId] = useState('')
  const [date, setDate] = useState(todayIso())
  const [selected, setSelected] = useState([])  // ordered account ids
  const [existingRoute, setExistingRoute] = useState(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const [info, setInfo] = useState(null)

  useEffect(() => {
    (async () => {
      setLoading(true)
      const [emps, accs] = await Promise.all([
        supabase.from('profiles').select('id, full_name, role').eq('role', 'employee').order('full_name'),
        supabase.from('accounts').select('id, name, address').order('name')
      ])
      if (emps.error) setError(emps.error.message)
      if (accs.error) setError(accs.error.message)
      setEmployees(emps.data || [])
      setAccounts(accs.data || [])
      if (emps.data?.[0]?.id) setEmployeeId(emps.data[0].id)
      setLoading(false)
    })()
  }, [])

  // Load existing route for the picked employee+date so the boss can edit it.
  useEffect(() => {
    (async () => {
      setInfo(null); setError(null); setExistingRoute(null); setSelected([])
      if (!employeeId || !date) return
      const { data: routes, error: e } = await supabase
        .from('routes')
        .select('id, route_date, employee_id, route_accounts(account_id, order_index)')
        .eq('employee_id', employeeId)
        .eq('route_date', date)
        .limit(1)
      if (e) { setError(e.message); return }
      const route = routes?.[0]
      if (route) {
        setExistingRoute(route)
        const ordered = [...(route.route_accounts || [])]
          .sort((a, b) => a.order_index - b.order_index)
          .map((ra) => ra.account_id)
        setSelected(ordered)
      }
    })()
  }, [employeeId, date])

  const toggle = (id) => {
    setSelected((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id])
  }

  const move = (id, dir) => {
    const idx = selected.indexOf(id)
    if (idx === -1) return
    const target = idx + dir
    if (target < 0 || target >= selected.length) return
    const copy = [...selected]
    ;[copy[idx], copy[target]] = [copy[target], copy[idx]]
    setSelected(copy)
  }

  const save = async () => {
    if (!employeeId) { setError('Pick an employee'); return }
    setSaving(true); setError(null); setInfo(null)

    let routeId = existingRoute?.id
    if (!routeId) {
      const { data, error: e } = await supabase
        .from('routes')
        .insert([{ employee_id: employeeId, route_date: date, created_by: user.id }])
        .select()
        .single()
      if (e) { setError(e.message); setSaving(false); return }
      routeId = data.id
    }

    const { error: delErr } = await supabase.from('route_accounts').delete().eq('route_id', routeId)
    if (delErr) { setError(delErr.message); setSaving(false); return }

    if (selected.length) {
      const rows = selected.map((account_id, i) => ({
        route_id: routeId, account_id, order_index: i
      }))
      const { error: insErr } = await supabase.from('route_accounts').insert(rows)
      if (insErr) { setError(insErr.message); setSaving(false); return }
    }

    setSaving(false)
    setInfo('Route saved.')
    setExistingRoute({ id: routeId, route_date: date, employee_id: employeeId })
  }

  const clearRoute = async () => {
    if (!existingRoute) { setSelected([]); return }
    if (!confirm('Delete this route?')) return
    const { error: e } = await supabase.from('routes').delete().eq('id', existingRoute.id)
    if (e) { setError(e.message); return }
    setExistingRoute(null); setSelected([]); setInfo('Route deleted.')
  }

  const accountById = Object.fromEntries(accounts.map((a) => [a.id, a]))

  return (
    <div className="space-y-4">
      <div>
        <h1 className="ae-h1">Route builder</h1>
        <p className="ae-muted text-sm mt-1">
          Pick an employee and a date, then choose accounts and order them.
        </p>
      </div>

      {error && <div className="ae-card p-3 text-sm text-red-600">{error}</div>}
      {info && <div className="ae-card p-3 text-sm text-emerald-700">{info}</div>}

      <div className="ae-card p-4 grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div>
          <label className="ae-label">Employee</label>
          <select className="ae-input" value={employeeId} onChange={(e) => setEmployeeId(e.target.value)}>
            {employees.length === 0 && <option value="">(no employees yet)</option>}
            {employees.map((e) => (
              <option key={e.id} value={e.id}>{e.full_name || e.id}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="ae-label">Date</label>
          <input type="date" className="ae-input" value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
        <div className="flex items-end gap-2">
          <button className="ae-btn flex-1" disabled={saving || !employeeId} onClick={save}>
            {saving ? 'Saving…' : existingRoute ? 'Update route' : 'Save route'}
          </button>
          {existingRoute && (
            <button className="ae-btn-danger" onClick={clearRoute}>Delete</button>
          )}
        </div>
      </div>

      {loading ? (
        <div className="ae-muted">Loading…</div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          <div className="ae-card p-4">
            <h2 className="ae-h2 mb-3">Available accounts</h2>
            {accounts.length === 0 ? (
              <div className="ae-muted text-sm">No accounts. Add some on the Accounts page.</div>
            ) : (
              <div className="space-y-2 max-h-[60vh] overflow-y-auto">
                {accounts.map((a) => {
                  const isOn = selected.includes(a.id)
                  return (
                    <label key={a.id} className={`flex items-center gap-3 p-2 rounded cursor-pointer ${
                      isOn ? 'bg-emerald-50 dark:bg-emerald-900/10' : ''
                    }`}>
                      <input type="checkbox" checked={isOn} onChange={() => toggle(a.id)} className="h-5 w-5" />
                      <div>
                        <div className="font-medium">{a.name}</div>
                        {a.address && <div className="ae-muted text-xs">{a.address}</div>}
                      </div>
                    </label>
                  )
                })}
              </div>
            )}
          </div>

          <div className="ae-card p-4">
            <h2 className="ae-h2 mb-3">Route order ({selected.length})</h2>
            {selected.length === 0 ? (
              <div className="ae-muted text-sm">Pick accounts on the left.</div>
            ) : (
              <ol className="space-y-2">
                {selected.map((id, i) => (
                  <li key={id} className="flex items-center gap-2 p-2 ae-card">
                    <div className="font-mono text-sm w-6">{i + 1}.</div>
                    <div className="flex-1">
                      <div className="font-medium">{accountById[id]?.name || '?'}</div>
                      {accountById[id]?.address && (
                        <div className="ae-muted text-xs">{accountById[id].address}</div>
                      )}
                    </div>
                    <button className="ae-btn-secondary px-2 py-1 text-sm" onClick={() => move(id, -1)} disabled={i === 0}>↑</button>
                    <button className="ae-btn-secondary px-2 py-1 text-sm" onClick={() => move(id, 1)} disabled={i === selected.length - 1}>↓</button>
                    <button className="ae-btn-danger px-2 py-1 text-sm" onClick={() => toggle(id)}>×</button>
                  </li>
                ))}
              </ol>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
