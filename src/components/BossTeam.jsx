import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase.js'
import { useAuth } from '../contexts/AuthContext.jsx'

const ROLE_OPTIONS = ['employee', 'boss', 'admin']
const ROLE_RANK = { admin: 3, boss: 2, employee: 1 }

export default function BossTeam() {
  const { user, role } = useAuth()
  const isAdmin = role === 'admin'
  const [people, setPeople] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [info, setInfo] = useState(null)

  const load = async () => {
    setLoading(true); setError(null)
    const { data, error: e } = await supabase
      .from('profiles')
      .select('id, full_name, email, role, created_at')
      .order('role', { ascending: true })
      .order('full_name', { ascending: true })
    if (e) { setError(e.message); setLoading(false); return }
    const sorted = (data || []).sort(
      (a, b) => (ROLE_RANK[b.role] || 0) - (ROLE_RANK[a.role] || 0)
    )
    setPeople(sorted)
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  const setRole = async (id, newRole) => {
    setError(null); setInfo(null)
    const { error: e } = await supabase.from('profiles').update({ role: newRole }).eq('id', id)
    if (e) { setError(e.message); return }
    setPeople((prev) => prev.map((p) => p.id === id ? { ...p, role: newRole } : p))
    setInfo('Role updated.')
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="ae-h1">Team</h1>
        <p className="ae-muted text-sm mt-1">
          Everyone who has signed up. {isAdmin
            ? 'As an admin you can set anyone’s role. New sign-ups start as employees.'
            : 'Only admins can change roles.'}
        </p>
      </div>

      {error && <div className="ae-card p-3 text-sm text-red-600">{error}</div>}
      {info && <div className="ae-card p-3 text-sm text-emerald-700">{info}</div>}

      {loading ? (
        <div className="ae-muted">Loading…</div>
      ) : people.length === 0 ? (
        <div className="ae-card p-6 text-center"><p className="ae-muted">No one has signed up yet.</p></div>
      ) : (
        <div className="space-y-2">
          {people.map((p) => (
            <div key={p.id} className="ae-card p-4 flex flex-wrap items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="font-semibold truncate">
                  {p.full_name || p.email || p.id}
                  {p.id === user.id && <span className="ae-muted text-xs"> (you)</span>}
                </div>
                {p.email && <div className="ae-muted text-sm truncate">{p.email}</div>}
              </div>
              <div className="flex items-center gap-2">
                <span className={`ae-chip ${
                  p.role === 'admin' ? '!bg-indigo-100 !text-indigo-800'
                  : p.role === 'boss' ? '!bg-emerald-100 !text-emerald-800'
                  : ''
                }`}>
                  {p.role}
                </span>
                {isAdmin && (
                  <select
                    className="ae-input !py-1.5 !w-auto text-sm"
                    value={p.role}
                    disabled={p.id === user.id}
                    title={p.id === user.id ? "You can't change your own role" : undefined}
                    onChange={(e) => setRole(p.id, e.target.value)}
                  >
                    {ROLE_OPTIONS.map((r) => (
                      <option key={r} value={r}>{r}</option>
                    ))}
                  </select>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
