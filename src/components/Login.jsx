import { useState } from 'react'
import { useAuth } from '../contexts/AuthContext.jsx'
import { useTheme } from '../contexts/ThemeContext.jsx'
import { hasSupabaseConfig } from '../lib/supabase.js'

export default function Login() {
  const { signIn, signUp, sendPasswordReset, authError } = useAuth()
  const { theme, toggleTheme } = useTheme()
  const [mode, setMode] = useState('signin')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [fullName, setFullName] = useState('')
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)
  const [info, setInfo] = useState(null)

  const onSubmit = async (e) => {
    e.preventDefault()
    setError(null); setInfo(null); setBusy(true)
    try {
      if (mode === 'signin') {
        await signIn(email, password)
      } else if (mode === 'reset') {
        await sendPasswordReset(email)
        setInfo('If that email has an account, a password reset link is on its way.')
        setMode('signin')
      } else {
        await signUp(email, password, fullName)
        setInfo('Account created. Check your email if confirmation is required, then sign in.')
        setMode('signin')
      }
    } catch (err) {
      setError(err.message || 'Authentication failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="w-full max-w-md ae-card p-6 sm:p-8">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="ae-h1">Accurate Edges</h1>
            <p className="ae-muted text-sm mt-1">
              {theme === 'modern' ? 'Sharper edges. Sharper margins.' : 'Knife route & commission tracker'}
            </p>
          </div>
          <button
            type="button"
            onClick={toggleTheme}
            className="text-xs ae-muted underline"
            aria-label="Toggle theme"
          >
            {theme === 'modern' ? 'Classic' : 'Modern'}
          </button>
        </div>

        {!hasSupabaseConfig && (
          <div className="mb-4 p-3 text-sm rounded border border-amber-400 bg-amber-50 text-amber-900">
            Supabase isn't configured yet. Copy <code>.env.example</code> to
            <code> .env</code> and add your project URL and anon key, then restart the dev server.
          </div>
        )}

        <form onSubmit={onSubmit} className="space-y-4">
          {mode === 'signup' && (
            <div>
              <label className="ae-label" htmlFor="fullName">Full name</label>
              <input
                id="fullName"
                className="ae-input"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                required
              />
            </div>
          )}
          <div>
            <label className="ae-label" htmlFor="email">Email</label>
            <input
              id="email"
              type="email"
              autoComplete="email"
              className="ae-input"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>
          {mode !== 'reset' && (
            <div>
              <div className="flex items-center justify-between">
                <label className="ae-label" htmlFor="password">Password</label>
                {mode === 'signin' && (
                  <button
                    type="button"
                    className="text-xs ae-muted underline"
                    onClick={() => { setMode('reset'); setError(null); setInfo(null) }}
                  >
                    Forgot password?
                  </button>
                )}
              </div>
              <input
                id="password"
                type="password"
                autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
                className="ae-input"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                minLength={6}
                required
              />
            </div>
          )}

          {mode === 'reset' && (
            <p className="ae-muted text-sm">
              Enter your email and we'll send a link to set a new password.
            </p>
          )}

          {error && <div className="text-sm text-red-600">{error}</div>}
          {!error && authError && <div className="text-sm text-amber-600">{authError}</div>}
          {info && <div className="text-sm text-emerald-700">{info}</div>}

          <button type="submit" className="ae-btn w-full" disabled={busy}>
            {busy ? 'Please wait…'
              : mode === 'signin' ? 'Sign in'
              : mode === 'reset' ? 'Send reset link'
              : 'Create account'}
          </button>

          <div className="text-center text-sm ae-muted">
            {mode === 'signin' ? (
              <>
                New here?{' '}
                <button type="button" className="underline" onClick={() => setMode('signup')}>
                  Create an account
                </button>
              </>
            ) : (
              <>
                {mode === 'reset' ? 'Remembered it?' : 'Already registered?'}{' '}
                <button type="button" className="underline" onClick={() => setMode('signin')}>
                  Sign in
                </button>
              </>
            )}
          </div>
        </form>
      </div>
    </div>
  )
}
