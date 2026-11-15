/** Splits text into what people see as single characters (an emoji can be several code points). */
function symbols(text) {
  const value = (text || '').trim()
  if (!value) return []
  if (typeof Intl !== 'undefined' && Intl.Segmenter) {
    return [...new Intl.Segmenter().segment(value)].map((part) => part.segment)
  }
  return Array.from(value)
}

/** The last visible character of some text: in an emoji box, the one just typed or pasted. */
export function lastSymbol(text) {
  const all = symbols(text)
  return all[all.length - 1] || ''
}
