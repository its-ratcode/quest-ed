import { familyApi } from '../../api/family'
import { useApi } from '../../hooks/useApi'

/** The kids in the signed-in parent's family (none for other roles). */
export function useKids(enabled = true) {
  const { data, loading, error, reload } = useApi(
    (signal) => (enabled ? familyApi.get(signal) : Promise.resolve({ members: [] })),
    [enabled],
  )
  const kids = (data?.members || []).filter((m) => m.role === 'child')
  return { kids, loading, error, reload }
}
