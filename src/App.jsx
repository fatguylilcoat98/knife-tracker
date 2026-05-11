import { useState, useEffect } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { useAuth } from './contexts/AuthContext.jsx'
import { supabase } from './lib/supabase.js'
import Login from './components/Login.jsx'
import Header from './components/Header.jsx'
import BossAccounts from './components/BossAccounts.jsx'
import BossRouteBuilder from './components/BossRouteBuilder.jsx'
import BossApprovals from './components/BossApprovals.jsx'
import EmployeeToday from './components/EmployeeToday.jsx'
import EmployeeAccount from './components/EmployeeAccount.jsx'
import EmployeeHistory from './components/EmployeeHistory.jsx'
import Settings from './components/Settings.jsx'

const BOSS_LINKS = [
  { to: '/', label: 'Accounts', end: true },
  { to: '/routes', label: 'Route builder' },
  { to: '/approvals', label: 'Approvals' },
  { to: '/settings', label: 'Settings' }
]

const EMPLOYEE_LINKS = [
  { to: '/', label: 'Today', end: true },
  { to: '/history', label: 'History' },
  { to: '/settings', label: 'Settings' }
]

function LoadingSplash() {
  // If the splash sits for more than a few seconds something upstream is wedged
  // (stale JWT, network glitch). Offer a one-tap reset so users aren't trapped.
  const [showReset, setShowReset] = useState(false)
  useEffect(() => {
    const t = setTimeout(() => setShowReset(true), 4000)
    return () => clearTimeout(t)
  }, [])

  const reset = async () => {
    try { await supabase.auth.signOut() } catch {}
    try {
      localStorage.clear()
      sessionStorage.clear()
    } catch {}
    if ('serviceWorker' in navigator) {
      const regs = await navigator.serviceWorker.getRegistrations()
      await Promise.all(regs.map((r) => r.unregister()))
    }
    if (typeof caches !== 'undefined') {
      const keys = await caches.keys()
      await Promise.all(keys.map((k) => caches.delete(k)))
    }
    window.location.replace('/')
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-4 p-6">
      <div className="ae-muted text-sm">Loading…</div>
      {showReset && (
        <button type="button" className="ae-btn-secondary text-sm" onClick={reset}>
          Reset session
        </button>
      )}
    </div>
  )
}

export default function App() {
  const { loading, user, role } = useAuth()

  if (loading) {
    return <LoadingSplash />
  }

  if (!user) return <Login />

  if (!role) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="ae-card p-6 max-w-md">
          <h1 className="ae-h1 mb-2">Profile not found</h1>
          <p className="ae-muted text-sm">
            Your auth user exists but no profile row was created. Ask the boss
            to add you in the team table, or re-run the schema migration.
          </p>
        </div>
      </div>
    )
  }

  if (role === 'boss') {
    return (
      <div className="min-h-screen">
        <Header links={BOSS_LINKS} />
        <main className="max-w-6xl mx-auto p-3 sm:p-6">
          <Routes>
            <Route path="/" element={<BossAccounts />} />
            <Route path="/routes" element={<BossRouteBuilder />} />
            <Route path="/approvals" element={<BossApprovals />} />
            <Route path="/settings" element={<Settings />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </main>
      </div>
    )
  }

  return (
    <div className="min-h-screen">
      <Header links={EMPLOYEE_LINKS} />
      <main className="max-w-3xl mx-auto p-3 sm:p-6">
        <Routes>
          <Route path="/" element={<EmployeeToday />} />
          <Route path="/stop/:routeAccountId" element={<EmployeeAccount />} />
          <Route path="/history" element={<EmployeeHistory />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
    </div>
  )
}
