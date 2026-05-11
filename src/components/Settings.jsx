import { useTheme } from '../contexts/ThemeContext.jsx'
import { useAuth } from '../contexts/AuthContext.jsx'

export default function Settings() {
  const { theme, setTheme } = useTheme()
  const { profile } = useAuth()

  return (
    <div className="space-y-6">
      <div>
        <h1 className="ae-h1">Settings</h1>
        <p className="ae-muted text-sm mt-1">Signed in as {profile?.full_name || profile?.id}</p>
      </div>

      <div className="ae-card p-5">
        <h2 className="ae-h2 mb-3">Theme</h2>
        <p className="ae-muted text-sm mb-4">
          Pick the look that suits how you work. Your choice is saved to this device and your profile.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <button
            type="button"
            onClick={() => setTheme('classic')}
            className={`ae-card p-4 text-left ${
              theme === 'classic'
                ? 'ring-2 ring-classic-primary'
                : 'opacity-80 hover:opacity-100'
            }`}
          >
            <div className="font-semibold">Classic</div>
            <div className="ae-muted text-sm mt-1">
              Clean, simple, navy & gray. Designed for the office desk.
            </div>
          </button>
          <button
            type="button"
            onClick={() => setTheme('modern')}
            className={`ae-card p-4 text-left ${
              theme === 'modern'
                ? 'ring-2 ring-modern-accent'
                : 'opacity-80 hover:opacity-100'
            }`}
          >
            <div className="font-semibold">Modern</div>
            <div className="ae-muted text-sm mt-1">
              Dark, sharp, steel & cyan. Designed for the field.
            </div>
          </button>
        </div>
      </div>

      <div className="ae-card p-5">
        <h2 className="ae-h2 mb-3">About</h2>
        <p className="ae-muted text-sm">
          Accurate Edges — Knife route & commission tracker. Install this app
          to your home screen for an offline-friendly experience.
        </p>
      </div>
    </div>
  )
}
