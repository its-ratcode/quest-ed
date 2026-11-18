import { useCallback, useEffect, useMemo, useState } from 'react'
import { categoriesApi } from '../../api/categories'
import { buildCategories, CategoriesContext } from './categoriesContext'

/** The signed-in family's task categories, loaded once and shared by every page. */
export function CategoriesProvider({ enabled, children }) {
  const [items, setItems] = useState([])

  const reload = useCallback(async () => {
    if (!enabled) return
    try {
      const data = await categoriesApi.list()
      setItems(data.items || [])
    } catch {
      // Pages still work with the starter names; the next reload tries again.
    }
  }, [enabled])

  useEffect(() => {
    let cancelled = false
    if (enabled) {
      categoriesApi.list()
        .then((data) => { if (!cancelled) setItems(data.items || []) })
        .catch(() => {})
    }
    return () => { cancelled = true }
  }, [enabled])

  const value = useMemo(() => buildCategories(items, reload), [items, reload])
  return <CategoriesContext.Provider value={value}>{children}</CategoriesContext.Provider>
}
