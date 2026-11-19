import { useEffect, useState } from 'react'
import { useLocation } from 'react-router'
import { tasksApi } from '../../api/tasks'
import { useApi } from '../../hooks/useApi'
import { onApprovalsChanged } from './approvalsEvents'

/**
 * How many "I did it"s are waiting for a parent, for the count in the menu. Checked again on
 * every page change and after each approval. Always 0 when `enabled` is false (kids, admins).
 */
export function usePendingApprovals(enabled) {
  const { pathname } = useLocation()
  const [changes, setChanges] = useState(0)
  useEffect(() => onApprovalsChanged(() => setChanges((n) => n + 1)), [])

  const pending = useApi(
    (signal) => (enabled ? tasksApi.submissions({ status: 'pending', limit: 200 }, signal) : Promise.resolve(null)),
    [enabled, pathname, changes],
  )
  return pending.data?.items?.length ?? 0
}
