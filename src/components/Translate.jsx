import { useRef, useState } from 'react'
import { translateText } from '../lib/claude.js'

const SpeechRecognition = typeof window !== 'undefined'
  ? (window.SpeechRecognition || window.webkitSpeechRecognition)
  : null

// EN↔ES translator for the field, backed by Claude via the server proxy.
// Voice input/output use the browser's Web Speech API when available and
// degrade gracefully to typing/reading when not.
export default function Translate() {
  const [source, setSource] = useState('')
  const [result, setResult] = useState('')
  const [target, setTarget] = useState('es') // 'es' = EN→ES, 'en' = ES→EN
  const [busy, setBusy] = useState(false)
  const [listening, setListening] = useState(false)
  const [error, setError] = useState(null)
  const recognitionRef = useRef(null)

  const runTranslate = async (text, tgt) => {
    if (!text.trim()) return
    setBusy(true); setError(null); setResult('')
    const res = await translateText(text, tgt)
    setBusy(false)
    if (!res.ok) { setError(res.error || 'Translation failed'); return }
    setResult(res.translation || '')
    speak(res.translation, tgt)
  }

  const speak = (text, tgt) => {
    if (!text || typeof window === 'undefined' || !window.speechSynthesis) return
    const utter = new SpeechSynthesisUtterance(text)
    utter.lang = tgt === 'en' ? 'en-US' : 'es-ES'
    window.speechSynthesis.cancel()
    window.speechSynthesis.speak(utter)
  }

  const startVoice = (tgt) => {
    if (!SpeechRecognition) { setError('Voice input is not supported in this browser.'); return }
    setError(null)
    setTarget(tgt)
    // When translating to Spanish we listen in English, and vice versa.
    const rec = new SpeechRecognition()
    rec.lang = tgt === 'es' ? 'en-US' : 'es-ES'
    rec.interimResults = false
    rec.maxAlternatives = 1
    rec.onresult = (e) => {
      const text = e.results[0][0].transcript
      setSource(text)
      runTranslate(text, tgt)
    }
    rec.onerror = (e) => setError(`Voice error: ${e.error}`)
    rec.onend = () => setListening(false)
    recognitionRef.current = rec
    setListening(true)
    rec.start()
  }

  const stopVoice = () => {
    recognitionRef.current?.stop()
    setListening(false)
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="ae-h1">Translate</h1>
        <p className="ae-muted text-sm mt-1">
          English ↔ Spanish for talking with customers. Tap a mic to speak, or type below.
        </p>
      </div>

      {error && <div className="ae-card p-3 text-sm text-amber-600">{error}</div>}

      <div className="ae-card p-4 space-y-3">
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            className={`ae-btn ${listening && target === 'es' ? '' : 'opacity-95'}`}
            disabled={busy || listening}
            onClick={() => startVoice('es')}
          >
            🎤 EN → ES
          </button>
          <button
            type="button"
            className={`ae-btn-secondary ${listening && target === 'en' ? '' : ''}`}
            disabled={busy || listening}
            onClick={() => startVoice('en')}
          >
            🎤 ES → EN
          </button>
        </div>

        {listening && (
          <button type="button" className="ae-btn-danger w-full" onClick={stopVoice}>
            Stop listening…
          </button>
        )}

        <div>
          <label className="ae-label">Text to translate</label>
          <textarea
            className="ae-input"
            rows={3}
            value={source}
            onChange={(e) => setSource(e.target.value)}
            placeholder="Type or speak…"
          />
        </div>

        <div className="flex items-center gap-2">
          <select className="ae-input flex-1" value={target} onChange={(e) => setTarget(e.target.value)}>
            <option value="es">English → Spanish</option>
            <option value="en">Spanish → English</option>
          </select>
          <button
            type="button"
            className="ae-btn whitespace-nowrap"
            disabled={busy || !source.trim()}
            onClick={() => runTranslate(source, target)}
          >
            {busy ? 'Translating…' : 'Translate'}
          </button>
        </div>
      </div>

      {result && (
        <div className="ae-card p-4">
          <div className="flex items-center justify-between mb-1">
            <label className="ae-label mb-0">Translation</label>
            <button type="button" className="text-xs ae-muted underline" onClick={() => speak(result, target)}>
              🔊 Play
            </button>
          </div>
          <p className="text-lg">{result}</p>
        </div>
      )}
    </div>
  )
}
