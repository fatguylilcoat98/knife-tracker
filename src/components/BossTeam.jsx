import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase.js'
import { useAuth } from '../contexts/AuthContext.jsx'

export default function BossTeam() {
  const { user } = useAuth()
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
    setPeople(data || [])
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  const setRole = async (id, role) => {
    setError(null); setInfo(null)
    const { error: e } = await supabase.from('profiles').update({ role }).eq('id', id)
    if (e) { setError(e.message); return }
    setPeople((prev) => prev.map((p) => p.id === id ? { ...p, role } : p))
    setInfo('Role updated.')
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="ae-h1">Team</h1>
        <p className="ae-muted text-sm mt-1">
          Everyone who has signed up. Promote a teammate to boss, or set them back
          to employee. New sign-ups start as employees.
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
                <span className={`ae-chip ${p.role === 'boss' ? '!bg-emerald-100 !text-emerald-800' : ''}`}>
                  {p.role}
                </span>
                {p.role === 'employee' ? (
                  <button className="ae-btn-secondary text-sm py-1.5 px-3" onClick={() => setRole(p.id, 'boss')}>
                    Make boss
                  </button>
                ) : (
                  <button
                    className="ae-btn-secondary text-sm py-1.5 px-3"
                    disabled={p.id === user.id}
                    title={p.id === user.id ? "You can't demote yourself" : undefined}
                    onClick={() => setRole(p.id, 'employee')}
                  >
                    Make employee
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
