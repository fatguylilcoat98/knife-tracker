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

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result)
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(file)
  })
}
