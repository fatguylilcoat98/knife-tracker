import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import { useAuth } from './AuthContext.jsx'
import { supabase } from '../lib/supabase.js'

const ThemeContext = createContext(null)
const STORAGE_KEY = 'accurate-edges:theme'

function defaultThemeForRole(role) {
  return role === 'employee' ? 'modern' : 'classic'
}

export function ThemeProvider({ children }) {
  const { profile, user, role } = useAuth()
  const [theme, setThemeState] = useState(() => {
    if (typeof window === 'undefined') return 'classic'
    return window.localStorage.getItem(STORAGE_KEY) || 'classic'
  })

  // When the user's profile arrives, prefer their saved preference, otherwise
  // fall back to the role default. Local override always wins after explicit toggle.
  useEffect(() => {
    const local = window.localStorage.getItem(STORAGE_KEY)
    if (local) { setThemeState(local); return }
    if (profile?.theme_preference) { setThemeState(profile.theme_preference); return }
    if (role) setThemeState(defaultThemeForRole(role))
  }, [profile, role])

  useEffect(() => {
    document.documentElement.classList.toggle('theme-modern', theme === 'modern')
    document.documentElement.classList.toggle('theme-classic', theme === 'classic')
    document.documentElement.style.colorScheme = theme === 'modern' ? 'dark' : 'light'
    const meta = document.querySelector('meta[name="theme-color"]')
    if (meta) meta.setAttribute('content', theme === 'modern' ? '#0a0c0f' : '#f5f6f8')
  }, [theme])

  const setTheme = async (next) => {
    setThemeState(next)
    window.localStorage.setItem(STORAGE_KEY, next)
    if (user?.id) {
      await supabase.from('profiles').update({ theme_preference: next }).eq('id', user.id)
    }
  }

  const toggleTheme = () => setTheme(theme === 'classic' ? 'modern' : 'classic')

  const value = useMemo(() => ({ theme, setTheme, toggleTheme }), [theme])
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}

export function useTheme() {
  const ctx = useContext(ThemeContext)
  if (!ctx) throw new Error('useTheme must be used inside ThemeProvider')
  return ctx
}
