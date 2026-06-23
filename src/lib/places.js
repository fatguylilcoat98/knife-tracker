// Lazy loader for the Google Maps Places library. Address autocomplete is
// optional: it only activates when VITE_GOOGLE_MAPS_API_KEY is set. Without a
// key the AddressInput component falls back to a plain text field, so nothing
// breaks on hosts that haven't configured Google.

const API_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY

let loadPromise = null

export const hasPlacesConfig = Boolean(API_KEY)

export function loadPlaces() {
  if (!API_KEY) return Promise.reject(new Error('No Google Maps API key configured'))
  if (window.google?.maps?.places) return Promise.resolve(window.google.maps.places)
  if (loadPromise) return loadPromise

  loadPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script')
    script.src = `https://maps.googleapis.com/maps/api/js?key=${API_KEY}&libraries=places`
    script.async = true
    script.defer = true
    script.onload = () => {
      if (window.google?.maps?.places) resolve(window.google.maps.places)
      else reject(new Error('Places library failed to load'))
    }
    script.onerror = () => reject(new Error('Failed to load Google Maps script'))
    document.head.appendChild(script)
  })
  return loadPromise
}
