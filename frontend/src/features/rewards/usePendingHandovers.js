import { useEffect, useState } from 'react'
import { useLocation } from 'react-router'
import { rewardsApi } from '../../api/rewards'
import { useApi } from '../../hooks/useApi'

// Told after a reward is handed over or cancelled, so the menu's count updates straight away
// instead of on the next page change.
const HANDOVERS_CHANGED = 'quest-ed:handovers-changed'

export function notifyHandoversChanged() {
  window.dispatchEvent(new Event(HANDOVERS_CHANGED))
}

/**
 * How many rewards kids bought that a parent hasn't handed over yet, for the count in the
 * menu. Checked again on every page change and after each change. Always 0 when `enabled`
 * is false (kids, admins).
 */
export function usePendingHandovers(enabled) {
  const { pathname } = useLocation()
  const [changes, setChanges] = useState(0)
  useEffect(() => {
    const listener = () => setChanges((n) => n + 1)
    window.addEventListener(HANDOVERS_CHANGED, listener)
    return () => window.removeEventListener(HANDOVERS_CHANGED, listener)
  }, [])

  const pending = useApi(
    // Only the total is needed, so ask for the smallest page.
    (signal) => (enabled ? rewardsApi.redemptions({ status: 'pending', per_page: 5 }, signal) : Promise.resolve(null)),
    [enabled, pathname, changes],
  )
  return pending.data?.total ?? 0
}
