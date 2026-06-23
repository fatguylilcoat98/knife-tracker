import { useState } from 'react'
import { useAuth } from '../contexts/AuthContext.jsx'

// Shown after a user opens the password-reset link (Supabase fires
// PASSWORD_RECOVERY). They set a new password and land in the app.
export default function SetNewPassword() {
  const { updatePassword } = useAuth()
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)

  const onSubmit = async (e) => {
    e.preventDefault()
    setError(null)
    if (password !== confirm) { setError('Passwords do not match'); return }
    setBusy(true)
    try {
      await updatePassword(password)
    } catch (err) {
      setError(err.message || 'Could not update password')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <form onSubmit={onSubmit} className="w-full max-w-md ae-card p-6 sm:p-8 space-y-4">
        <h1 className="ae-h1">Set a new password</h1>
        <div>
          <label className="ae-label" htmlFor="new-password">New password</label>
          <input
            id="new-password"
            type="password"
            autoComplete="new-password"
            className="ae-input"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            minLength={6}
            required
          />
        </div>
        <div>
          <label className="ae-label" htmlFor="confirm-password">Confirm password</label>
          <input
            id="confirm-password"
            type="password"
            autoComplete="new-password"
            className="ae-input"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            minLength={6}
            required
          />
        </div>
        {error && <div className="text-sm text-red-600">{error}</div>}
        <button type="submit" className="ae-btn w-full" disabled={busy}>
          {busy ? 'Saving…' : 'Update password'}
        </button>
      </form>
    </div>
  )
}
