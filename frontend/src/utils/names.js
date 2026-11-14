/** "Pat Rivera" → "PR": the letters shown in a grown-up's avatar. */
export function initialsOf(name = '') {
  return name.split(' ').filter(Boolean).map((part) => part[0]).join('').slice(0, 2).toUpperCase()
}
