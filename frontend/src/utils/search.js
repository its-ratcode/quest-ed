/** Does `name` contain the search text, in any letter case? An empty search matches everything. */
export function matches(name, query) {
  const q = (query || '').trim().toLowerCase()
  return !q || (name || '').toLowerCase().includes(q)
}
