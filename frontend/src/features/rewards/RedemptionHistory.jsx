import { useState } from 'react'
import { rewardsApi } from '../../api/rewards'
import Pager from '../../components/ui/Pager'
import { ErrorState } from '../../components/ui/States'
import { useApi } from '../../hooks/useApi'
import RedemptionList from './RedemptionList'

const PER_PAGE = 10

/**
 * Rewards that were handed over or cancelled, newest first, a page at a time. Hidden until
 * there is something to show. `version` reloads it after a change.
 */
export default function RedemptionHistory({ viewerRole, version = 0 }) {
  const [page, setPage] = useState(1)
  const history = useApi(
    (signal) => rewardsApi.redemptions({ status: 'done', page, per_page: PER_PAGE }, signal),
    [page, version],
  )
  const items = history.data?.items || []
  if (!history.error && items.length === 0) return null

  return (
    <section className="card-soft" aria-labelledby="past-title">
      <h2 id="past-title" className="card-title mb-3">History</h2>
      {history.error ? (
        <ErrorState error={history.error} onRetry={history.reload} />
      ) : (
        <>
          <RedemptionList items={items} viewerRole={viewerRole} />
          <Pager page={page} perPage={PER_PAGE} total={history.data.total} onChange={setPage}
            label="Reward history pages" />
        </>
      )}
    </section>
  )
}
