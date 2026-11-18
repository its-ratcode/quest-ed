import { useContext } from 'react'
import { CategoriesContext } from './categoriesContext'

/** { items, active, of(key), reload() } for the signed-in family. */
export function useCategories() {
  return useContext(CategoriesContext)
}
