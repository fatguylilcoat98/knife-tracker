// Serverless function (Vercel-compatible) for invoice OCR using Claude Vision.
// Receives { image_base64, media_type } and returns:
//   { ok: true, data: { name, address, phone, payment_terms, services: [{ service_name, price_per_unit }] } }
//
// To deploy on Vercel: drop this file in /api. The ANTHROPIC_API_KEY env var
// must be set in the project. The function does NOT expose the key to the client.

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

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ ok: false, error: 'Method not allowed' })
    return
  }

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    res.status(500).json({ ok: false, error: 'ANTHROPIC_API_KEY is not set on the server' })
    return
  }

  let body = req.body
  if (typeof body === 'string') {
    try { body = JSON.parse(body) } catch { body = {} }
  }
  const { image_base64, media_type } = body || {}
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
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'image',
                source: {
                  type: 'base64',
                  media_type: media_type || 'image/jpeg',
                  data: image_base64
                }
              },
              {
                type: 'text',
                text: 'Extract the account details from this invoice and return only the JSON described in the system prompt.'
              }
            ]
          }
        ]
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
    } catch (e) {
      res.status(502).json({ ok: false, error: 'Could not parse JSON from Claude', raw })
      return
    }

    res.status(200).json({ ok: true, data: parsed })
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message })
  }
}

function extractJson(text) {
  const fence = text.match(/```json\s*([\s\S]*?)\s*```/i) || text.match(/```\s*([\s\S]*?)\s*```/)
  if (fence) return fence[1]
  const first = text.indexOf('{')
  const last = text.lastIndexOf('}')
  if (first !== -1 && last !== -1 && last > first) return text.slice(first, last + 1)
  return text
}
