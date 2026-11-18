import { useEffect, useState } from 'react'
import Icon from './Icon'

/**
 * A search field with a magnifier. `onChange` gets the text; with `delay` (ms) it waits
 * until typing pauses, for searches that ask the server. Escape clears it.
 */
export default function SearchBox({ value, onChange, label, placeholder, delay = 0, className = '' }) {
  const [text, setText] = useState(value || '')
  // Follow changes made from outside (e.g. a "Clear search" button).
  const [seenValue, setSeenValue] = useState(value)
  if (value !== seenValue) {
    setSeenValue(value)
    setText(value || '')
  }

  useEffect(() => {
    if (!delay || text === (value || '')) return undefined
    const timer = setTimeout(() => onChange(text), delay)
    return () => clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text, delay])

  return (
    <label className={`search-box ${className}`}>
      <span className="visually-hidden">{label}</span>
      <Icon name="search" size={15} />
      <input type="search" value={text} placeholder={placeholder} autoComplete="off"
        onChange={(e) => {
          setText(e.target.value)
          if (!delay) onChange(e.target.value)
        }}
        onKeyDown={(e) => {
          if (e.key === 'Escape' && text) {
            e.stopPropagation() // clear the field without closing a dialog
            setText('')
            onChange('')
          }
        }} />
    </label>
  )
}
