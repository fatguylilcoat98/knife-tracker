import { NavLink, useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext.jsx'
import { useTheme } from '../contexts/ThemeContext.jsx'

export default function Header({ links }) {
  const { profile, signOut } = useAuth()
  const { theme, toggleTheme } = useTheme()
  const navigate = useNavigate()

  const onSignOut = async () => {
    await signOut()
    navigate('/', { replace: true })
  }

  const linkClass = ({ isActive }) =>
    `px-3 py-2 rounded-md text-sm font-semibold ${
      isActive
        ? theme === 'modern'
          ? 'bg-modern-surface2 text-modern-accent border border-modern-accent/40'
          : 'bg-classic-primary text-white'
        : theme === 'modern'
          ? 'text-modern-silver hover:text-modern-accent'
          : 'text-classic-text hover:bg-classic-bg'
    }`

  return (
    <header className={`no-print sticky top-0 z-30 backdrop-blur ${
      theme === 'modern'
        ? 'bg-modern-bg/85 border-b border-modern-border'
        : 'bg-white/90 border-b border-classic-border'
    }`}>
      <div className="max-w-6xl mx-auto px-3 sm:px-4 py-3 flex items-center gap-3">
        <div className="flex items-center gap-2 mr-2">
          <img src="/icon-192.png" alt="" className="h-8 w-8 rounded" />
          <div className="leading-tight">
            <div className={`text-base sm:text-lg font-bold ${
              theme === 'modern'
                ? 'font-sharp tracking-widest uppercase text-modern-accent'
                : 'text-classic-text'
            }`}>
              Accurate Edges
            </div>
            <div className="text-[10px] sm:text-[11px] ae-muted uppercase tracking-wider">
              {profile?.role === 'boss' ? 'Boss console' : 'Field console'}
            </div>
          </div>
        </div>

        <nav className="flex-1 flex items-center gap-1 overflow-x-auto">
          {links.map((l) => (
            <NavLink key={l.to} to={l.to} className={linkClass} end={l.end}>
              {l.label}
            </NavLink>
          ))}
        </nav>

        <button
          type="button"
          onClick={toggleTheme}
          className="text-xs ae-muted underline whitespace-nowrap"
          aria-label="Toggle theme"
        >
          {theme === 'modern' ? 'Classic' : 'Modern'}
        </button>
        <button
          type="button"
          onClick={onSignOut}
          className="text-xs ae-muted underline whitespace-nowrap"
        >
          Sign out
        </button>
      </div>
    </header>
  )
}
