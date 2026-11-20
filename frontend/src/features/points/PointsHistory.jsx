import { useState } from 'react'
import { pointsApi } from '../../api/points'
import Pager from '../../components/ui/Pager'
import { EmptyState, ErrorState, LoadingState } from '../../components/ui/States'
import { useApi } from '../../hooks/useApi'
import TransactionTimeline from './TransactionTimeline'

/**
 * One kid's points history, a page at a time. `childId` for parents (kids always see their
 * own); `version` reloads it after a change; `empty` is the message when there's nothing yet.
 */
export default function PointsHistory({ childId, version = 0, perPage = 10, empty }) {
  const [page, setPage] = useState(1)
  const history = useApi(
    (signal) => pointsApi.transactions({ child_id: childId, page, per_page: perPage }, signal),
    [childId, page, perPage, version],
  )
  const items = history.data?.items || []

  if (history.loading && !history.data) return <LoadingState rows={3} label="Loading history" />
  if (history.error) return <ErrorState error={history.error} onRetry={history.reload} />
  if (items.length === 0) return <EmptyState title="No points yet" message={empty} />
  return (
    <>
      <div className="widget-body"><TransactionTimeline items={items} /></div>
      <Pager page={page} perPage={perPage} total={history.data.total} onChange={setPage}
        label="Points history pages" />
    </>
  )
}
