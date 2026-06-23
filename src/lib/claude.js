// Client-side wrapper around the invoice OCR endpoint.
// The actual Anthropic call lives in /api/extract-invoice (server-side) so the
// API key stays off the client. For local dev without a server, the helper
// returns a structured error and the UI falls back to manual entry.

export async function extractInvoiceFromImage(file) {
  const dataUrl = await fileToDataUrl(file)
  const base64 = dataUrl.split(',')[1]
  const mediaType = file.type || 'image/jpeg'

  try {
    const res = await fetch('/api/extract-invoice', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ image_base64: base64, media_type: mediaType })
    })
    // On a static-only host the SPA rewrite turns missing /api/* paths into the
    // index.html shell with status 200. Sniff the content-type so we surface a
    // clean "endpoint not available" message instead of a JSON parse error.
    const contentType = res.headers.get('content-type') || ''
    if (!contentType.includes('application/json')) {
      return {
        ok: false,
        error: 'Invoice OCR endpoint is not deployed on this host.',
        data: null
      }
    }
    if (!res.ok) {
      const text = await res.text()
      throw new Error(text || `Extraction failed (${res.status})`)
    }
    return await res.json()
  } catch (err) {
    return {
      ok: false,
      error: err.message,
      data: null
    }
  }
}

// Translate text between English and Spanish via the server proxy.
// target: 'es' to translate English→Spanish, 'en' for Spanish→English.
export async function translateText(text, target) {
  try {
    const res = await fetch('/api/translate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, target })
    })
    const contentType = res.headers.get('content-type') || ''
    if (!contentType.includes('application/json')) {
      return { ok: false, error: 'Translation endpoint is not deployed on this host.', translation: null }
    }
    if (!res.ok) {
      const body = await res.json().catch(() => null)
      throw new Error(body?.error || `Translation failed (${res.status})`)
    }
    return await res.json()
  } catch (err) {
    return { ok: false, error: err.message, translation: null }
  }
}

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result)
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(file)
  })
}
