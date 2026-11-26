import { useState } from 'react'
import { adminApi } from '../../api/admin'
import Pager from '../../components/ui/Pager'
import { EmptyState, ErrorState, LoadingState } from '../../components/ui/States'
import { useApi } from '../../hooks/useApi'

// What to show: each value is the start of the action names it covers.
const FILTERS = [
  ['', 'Everything'],
  ['auth.', 'Sign-ins'],
  ['account.', 'Sign-ups'],
  ['child.', 'Kid accounts'],
  ['task.', 'Approvals'],
  ['points.', 'Point changes'],
  ['reward.', 'Rewards'],
  ['badge.', 'Badges'],
  ['family.', 'Families'],
  ['user.', 'Account changes'],
  ['settings.', 'Site settings'],
  ['notice.', 'Notices'],
  ['site.', 'Setup'],
]

const ACTION_TEXT = {
  'site.setup': 'Set up the site',
  'auth.login': 'Signed in',
  'account.registered': 'Created a parent account',
  'child.created': 'Added a kid account',
  'child.password_reset': "Reset a kid's password",
  'child.deleted': 'Removed a kid account',
  'task.approved': 'Approved a task',
  'task.sent_back': 'Sent a task back',
  'points.adjusted': 'Changed points by hand',
  'reward.given': 'Handed over a reward',
  'reward.cancelled': 'Cancelled a reward and refunded it',
  'badge.given': 'Gave a badge',
  'family.exported': "Exported the family's data",
  'family.deleted': 'Deleted a family',
  'family.leaderboard_on': 'Turned the family leaderboard on',
  'family.leaderboard_off': 'Turned the family leaderboard off',
  'user.activated': 'Switched an account back on',
  'user.deactivated': 'Switched off an account',
  'user.password_set': "Set a parent's password",
  'settings.changed': 'Changed site settings',
  'notice.created': 'Posted a notice',
  'notice.removed': 'Took down a notice',
}

const ROLE = { parent: 'parent', child: 'kid', admin: 'admin' }

const WHEN = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })

/** The log stores ids and numbers only, never names: "registration: off · child id: 4". */
function describeDetails(row) {
  const onOff = row.action.startsWith('settings.')
  const parts = Object.entries(row.details || {}).map(([key, value]) => {
    const shown = typeof value === 'boolean' ? (onOff ? (value ? 'on' : 'off') : (value ? 'yes' : 'no')) : value
    return `${key.replace(/_/g, ' ')}: ${shown}`
  })
  if (row.target_type && row.target_id != null) parts.unshift(`${row.target_type} #${row.target_id}`)
  return parts.join(' · ')
}

/** A record of important actions across the site, newest first. */
export default function AdminAuditPage() {
  const [action, setAction] = useState('')
  const [page, setPage] = useState(1)
  const logs = useApi(
    (signal) => adminApi.auditLogs({ action: action || undefined, page }, signal),
    [action, page],
  )
  const items = logs.data?.items || []

  return (
    <>
      <div className="page-header">
        <div>
          <h1>Audit log</h1>
          <p>A record of important actions, newest first.</p>
        </div>
      </div>

      <div className="filter-bar">
        <select className="form-select" aria-label="Show" value={action}
          onChange={(e) => { setAction(e.target.value); setPage(1) }}>
          {FILTERS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select>
      </div>

      {logs.loading && !logs.data ? (
        <LoadingState label="Loading the log" />
      ) : logs.error ? (
        <ErrorState error={logs.error} onRetry={logs.reload} />
      ) : items.length === 0 ? (
        <EmptyState title="Nothing recorded yet" />
      ) : (
        <>
          <div className="card-soft table-scroll" style={{ padding: 0 }}>
            <table className="table-plain">
              <thead>
                <tr>
                  <th scope="col">Event</th>
                  <th scope="col">Who</th>
                  <th scope="col">When</th>
                </tr>
              </thead>
              <tbody>
                {items.map((row) => {
                  const details = describeDetails(row)
                  return (
                    <tr key={row.id}>
                      <td>
                        <div className="fw-600">{ACTION_TEXT[row.action] || row.action}</div>
                        {details && <div className="small-text text-3">{details}</div>}
                      </td>
                      <td>{row.actor ? `${row.actor.display_name} (${ROLE[row.actor.role] || row.actor.role})` : 'A deleted account'}</td>
                      <td className="text-nowrap">
                        <time dateTime={row.created_at}>{WHEN.format(new Date(row.created_at))}</time>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          <Pager page={page} perPage={logs.data.per_page} total={logs.data.total} onChange={setPage} label="Log pages" />
        </>
      )}
    </>
  )
}
