// Production Node server for Accurate Edges.
// Serves the built Vite SPA from ./dist and hosts /api/extract-invoice, which
// proxies invoice photos to Claude Vision. Designed for a Render Web Service.
//
// Required env vars at runtime:
//   PORT                  (Render sets this)
//   ANTHROPIC_API_KEY     (only required if you want the OCR endpoint to work)

import express from 'express'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DIST_DIR = path.join(__dirname, 'dist')

const SYSTEM_PROMPT = `You are an invoice parser for a knife sharpening business called Accurate Edges.
Given a photo of a paper invoice or business intake form, extract:
- The customer's business/account name
- Full mailing address
- Phone number (digits only when possible)
- Payment terms (e.g., "Net 30", "Due on receipt")
- Each service line item with its unit price (e.g., "Knife sharpening — $4.00 each")

Return STRICT JSON with this shape and nothing else:
{
  "name": string | null,
  "address": string | null,
  "phone": string | null,
  "payment_terms": string | null,
  "services": [ { "service_name": string, "price_per_unit": number } ]
}
If a field is unreadable, return null. Never invent prices.`

const TRANSLATE_SYSTEM_PROMPT = `You are a translator for Accurate Edges, a knife sharpening business.
Translate the user's text between English and Spanish. Use correct trade terms
for blades, knives, scissors, and sharpening. Output ONLY the translation —
no quotes, no notes, no explanation.`

const app = express()
app.disable('x-powered-by')
app.use(express.json({ limit: '12mb' }))

app.get('/healthz', (_req, res) => res.json({ ok: true }))

app.post('/api/translate', async (req, res) => {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    res.status(503).json({ ok: false, error: 'ANTHROPIC_API_KEY is not set on the server' })
    return
  }
  const { text, target } = req.body || {}
  if (!text || !String(text).trim()) {
    res.status(400).json({ ok: false, error: 'Missing text' })
    return
  }
  const direction = target === 'en'
    ? 'Translate this Spanish text to English.'
    : 'Translate this English text to Spanish.'

  try {
    const anthropicRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 1024,
        system: TRANSLATE_SYSTEM_PROMPT,
        messages: [{ role: 'user', content: `${direction}\n\n${text}` }]
      })
    })
    if (!anthropicRes.ok) {
      const errText = await anthropicRes.text()
      res.status(502).json({ ok: false, error: `Claude API error: ${errText}` })
      return
    }
    const payload = await anthropicRes.json()
    const textBlock = (payload?.content || []).find((b) => b.type === 'text')
    const translation = (textBlock?.text || '').trim()
    res.status(200).json({ ok: true, translation })
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message })
  }
})

app.post('/api/extract-invoice', async (req, res) => {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    res.status(503).json({ ok: false, error: 'ANTHROPIC_API_KEY is not set on the server' })
    return
  }
  const { image_base64, media_type } = req.body || {}
  if (!image_base64) {
    res.status(400).json({ ok: false, error: 'Missing image_base64' })
    return
  }

  try {
    const anthropicRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 1024,
        system: SYSTEM_PROMPT,
        messages: [{
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: media_type || 'image/jpeg', data: image_base64 } },
            { type: 'text', text: 'Extract the account details from this invoice and return only the JSON described in the system prompt.' }
          ]
        }]
      })
    })

    if (!anthropicRes.ok) {
      const errText = await anthropicRes.text()
      res.status(502).json({ ok: false, error: `Claude API error: ${errText}` })
      return
    }

    const payload = await anthropicRes.json()
    const textBlock = (payload?.content || []).find((b) => b.type === 'text')
    const raw = textBlock?.text || ''
    const jsonText = extractJson(raw)
    let parsed
    try {
      parsed = JSON.parse(jsonText)
    } catch {
      res.status(502).json({ ok: false, error: 'Could not parse JSON from Claude', raw })
      return
    }
    res.status(200).json({ ok: true, data: parsed })
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message })
  }
})

// Static assets — long cache for hashed files in /assets, no-cache for the shell.
app.use('/assets', express.static(path.join(DIST_DIR, 'assets'), {
  immutable: true,
  maxAge: '1y',
  fallthrough: true
}))
app.use(express.static(DIST_DIR, {
  setHeaders: (res, filePath) => {
    const name = path.basename(filePath)
    if (['index.html', 'manifest.webmanifest', 'sw.js', 'registerSW.js', 'workbox-e4022e15.js'].includes(name)) {
      res.setHeader('Cache-Control', 'no-cache')
    }
  }
}))

// SPA fallback for everything that's not an /api/* or static file.
app.get(/^\/(?!api(\/|$)).*/, (_req, res) => {
  res.sendFile(path.join(DIST_DIR, 'index.html'))
})

function extractJson(text) {
  const fence = text.match(/```json\s*([\s\S]*?)\s*```/i) || text.match(/```\s*([\s\S]*?)\s*```/)
  if (fence) return fence[1]
  const first = text.indexOf('{')
  const last = text.lastIndexOf('}')
  if (first !== -1 && last !== -1 && last > first) return text.slice(first, last + 1)
  return text
}

const port = process.env.PORT || 8080
app.listen(port, '0.0.0.0', () => {
  console.log(`Accurate Edges listening on :${port}`)
})
