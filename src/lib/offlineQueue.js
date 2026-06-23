// A tiny offline queue for stop submissions. When a field submit fails because
// the device is offline, we stash the payload in localStorage and replay it
// when connectivity returns. Keeps the "works in the field" promise honest.
import { submitStopToServer } from './submitStop.js'

const KEY = 'accurate-edges:pending-submissions'

function read() {
  try {
    const raw = localStorage.getItem(KEY)
    return raw ? JSON.parse(raw) : []
  } catch {
    return []
  }
}

function write(items) {
  try {
    localStorage.setItem(KEY, JSON.stringify(items))
  } catch {
    /* storage full or unavailable — nothing else we can do */
  }
}

export function pendingCount() {
  return read().length
}

export function enqueueSubmission(payload) {
  const items = read()
  const id = (globalThis.crypto?.randomUUID?.() || String(Date.now() + Math.random()))
  // De-dupe by stop: a newer entry for the same stop replaces the older one.
  const filtered = items.filter((i) => i.payload.routeAccountId !== payload.routeAccountId)
  filtered.push({ id, payload, queued_at: new Date().toISOString() })
  write(filtered)
  return id
}

// Attempt to send everything queued. Items that succeed are removed; items that
// fail stay for the next attempt. Returns the number successfully flushed.
let flushing = false
export async function flushQueue() {
  if (flushing) return 0
  flushing = true
  let sent = 0
  try {
    let items = read()
    for (const item of items) {
      try {
        await submitStopToServer(item.payload)
        items = items.filter((i) => i.id !== item.id)
        write(items)
        sent += 1
      } catch {
        // Stop on first failure; likely still offline or server down.
        break
      }
    }
  } finally {
    flushing = false
  }
  return sent
}

export function isOffline() {
  return typeof navigator !== 'undefined' && navigator.onLine === false
}
