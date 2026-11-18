import { createContext } from 'react'

// Until the family's list arrives (or in tests), the starter keys still look right.
const STARTERS = {
  chores: { label: 'Chores', icon: 'broom', tone: 'mint' },
  learning: { label: 'Learning', icon: 'pencil', tone: 'lilac' },
  health: { label: 'Health', icon: 'heart', tone: 'sky' },
  kindness: { label: 'Kindness', icon: 'heart', tone: 'butter' },
  creativity: { label: 'Creativity', icon: 'palette', tone: 'lilac' },
  other: { label: 'Other', icon: 'star', tone: 'butter' },
}
const UNKNOWN = { label: 'Other', icon: 'star', tone: 'butter' }

/** The categories, plus `of(key)`: a task's category by its key, whatever the family calls it. */
export function buildCategories(items, reload) {
  const byKey = Object.fromEntries(items.map((c) => [c.key, c]))
  return {
    items,
    active: items.filter((c) => c.is_active),
    reload,
    of: (key) => byKey[key] || { key, ...(STARTERS[key] || UNKNOWN) },
  }
}

export const CategoriesContext = createContext(buildCategories([], async () => {}))
