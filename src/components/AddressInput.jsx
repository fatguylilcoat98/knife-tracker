import { useEffect, useRef } from 'react'
import { hasPlacesConfig, loadPlaces } from '../lib/places.js'

// A text input that upgrades to Google Places autocomplete when a Maps API key
// is configured. Falls back to a plain controlled input otherwise. The parent
// always receives the final string via onChange.
export default function AddressInput({ value, onChange, placeholder, className = 'ae-input', id }) {
  const inputRef = useRef(null)
  const onChangeRef = useRef(onChange)
  onChangeRef.current = onChange

  useEffect(() => {
    if (!hasPlacesConfig || !inputRef.current) return
    let autocomplete
    let cancelled = false
    loadPlaces()
      .then((places) => {
        if (cancelled || !inputRef.current) return
        autocomplete = new places.Autocomplete(inputRef.current, {
          types: ['address'],
          fields: ['formatted_address']
        })
        autocomplete.addListener('place_changed', () => {
          const place = autocomplete.getPlace()
          if (place?.formatted_address) onChangeRef.current(place.formatted_address)
        })
      })
      .catch(() => { /* fall back silently to plain text entry */ })
    return () => { cancelled = true }
  }, [])

  return (
    <input
      id={id}
      ref={inputRef}
      className={className}
      value={value}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
    />
  )
}
