import { createContext, useContext, useEffect, useState, useCallback } from 'react'
import { supabase, hasSupabaseConfig } from '../lib/supabase.js'

const AuthContext = createContext(null)

// Hard upper bound so the SPA never gets stuck on the loading splash if a
// Supabase call hangs (e.g. a stale or invalid JWT, network partition, or a
// CORS/credentials hiccup). After this fires we just drop the user back to the
// login screen — they can sign in again, which is a clean recovery path.
const AUTH_TIMEOUT_MS = 8000

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null)
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)
  const [authError, setAuthError] = useState(null)
  const [recovery, setRecovery] = useState(false)

  const loadProfile = useCallback(async (userId) => {
    if (!userId) { setProfile(null); return }
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, full_name, email, role, theme_preference')
        .eq('id', userId)
        .maybeSingle()
      if (error) {
        console.error('[auth] profile fetch error', error)
        setProfile(null)
        return
      }
      setProfile(data ?? null)
    } catch (err) {
      console.error('[auth] profile fetch threw', err)
      setProfile(null)
    }
  }, [])

  useEffect(() => {
    if (!hasSupabaseConfig) { setLoading(false); return }
    let mounted = true
    let settled = false
    const finish = () => {
      if (settled) return
      settled = true
      if (mounted) setLoading(false)
    }
    const timer = setTimeout(() => {
      if (!settled) {
        console.warn('[auth] startup timed out, clearing session and showing login')
        supabase.auth.signOut().catch(() => {})
        setAuthError('Sign-in timed out. Please log in again.')
      }
      finish()
    }, AUTH_TIMEOUT_MS)

    ;(async () => {
      try {
        const { data, error } = await supabase.auth.getSession()
        if (error) console.error('[auth] getSession error', error)
        if (!mounted) return
        setSession(data?.session ?? null)
        if (data?.session?.user?.id) await loadProfile(data.session.user.id)
      } catch (err) {
        console.error('[auth] startup threw', err)
        setAuthError(err?.message || 'Sign-in failed')
      } finally {
        clearTimeout(timer)
        finish()
      }
    })()

    const { data: sub } = supabase.auth.onAuthStateChange(async (event, newSession) => {
      // Supabase fires PASSWORD_RECOVERY when a user opens the reset link. We
      // flag it so the app can show the "set a new password" screen.
      if (event === 'PASSWORD_RECOVERY') setRecovery(true)
      setSession(newSession)
      if (newSession?.user?.id) {
        await loadProfile(newSession.user.id)
      } else {
        setProfile(null)
      }
    })
    return () => {
      mounted = false
      clearTimeout(timer)
      sub.subscription.unsubscribe()
    }
  }, [loadProfile])

  const signIn = async (email, password) => {
    setAuthError(null)
    const { data, error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) throw error
    return data
  }

  const signUp = async (email, password, fullName) => {
    setAuthError(null)
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { full_name: fullName } }
    })
    if (error) throw error
    return data
  }

  const signOut = async () => {
    await supabase.auth.signOut()
    setProfile(null)
    setAuthError(null)
  }

  const refreshProfile = async () => {
    if (session?.user?.id) await loadProfile(session.user.id)
  }

  const sendPasswordReset = async (email) => {
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: window.location.origin
    })
    if (error) throw error
  }

  const updatePassword = async (newPassword) => {
    const { error } = await supabase.auth.updateUser({ password: newPassword })
    if (error) throw error
    setRecovery(false)
  }

  return (
    <AuthContext.Provider value={{
      session,
      user: session?.user ?? null,
      profile,
      role: profile?.role ?? null,
      loading,
      authError,
      recovery,
      signIn,
      signUp,
      signOut,
      refreshProfile,
      sendPasswordReset,
      updatePassword
    }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider')
  return ctx
}
