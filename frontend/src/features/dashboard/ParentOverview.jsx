import { useMemo } from 'react'
import { Link } from 'react-router'
import { dashboardApi } from '../../api/dashboard'
import { rewardsApi } from '../../api/rewards'
import { tasksApi } from '../../api/tasks'
import { useAuth } from '../../auth/useAuth'
import { Avatar } from '../../components/ui/Avatar'
import Icon from '../../components/ui/Icon'
import { ProgressBar } from '../../components/ui/ProgressBar'
import { ErrorState, LoadingState } from '../../components/ui/States'
import { useToast } from '../../components/ui/toast/useToast'
import { useApi } from '../../hooks/useApi'
import { kidTone } from '../../utils/avatars'
import { getErrorMessage } from '../../utils/errors'
import { formatNumber, formatPoints, greeting, relativeTime, signedPoints } from '../../utils/format'
import { notifyHandoversChanged } from '../rewards/usePendingHandovers'
import ApprovalsPanel from '../tasks/ApprovalsPanel'
import { currentWeek, todayIso } from './week'

const KIDS_TODAY = 6 // in a big family, only the kids with the most left to do

/** A drawing for the welcome card (decoration only). */
function WelcomeArt() {
  return (
    <svg className="welcome-art" viewBox="0 0 210 165" aria-hidden="true">
      <rect x="62" y="22" width="112" height="132" rx="16" fill="#fff" opacity="0.9" transform="rotate(6 118 88)" />
      <rect x="82" y="48" width="60" height="7" rx="3.5" fill="#d9e6de" transform="rotate(6 118 88)" />
      <rect x="82" y="64" width="44" height="7" rx="3.5" fill="#e6eee9" transform="rotate(6 118 88)" />
      <circle cx="86" cy="95" r="8" fill="#c8ffe7" stroke="#2e7756" strokeWidth="2" />
      <path d="M82 95l3 3 6-6" stroke="#2e7756" strokeWidth="2.2" fill="none" strokeLinecap="round" />
      <rect x="100" y="91" width="46" height="7" rx="3.5" fill="#d9e6de" />
      <circle cx="84" cy="120" r="8" fill="#c8ffe7" stroke="#2e7756" strokeWidth="2" />
      <path d="M80 120l3 3 6-6" stroke="#2e7756" strokeWidth="2.2" fill="none" strokeLinecap="round" />
      <rect x="98" y="116" width="38" height="7" rx="3.5" fill="#d9e6de" />
      <rect x="18" y="70" width="52" height="52" rx="15" fill="#e9d9ff" />
      <path d="M44 80c1.4 7 4 9.6 11 11-7 1.4-9.6 4-11 11-1.4-7-4-9.6-11-11 7-1.4 9.6-4 11-11z" fill="#8b6cc8" />
      <circle cx="176" cy="34" r="20" fill="#fff1b8" />
      <path d="M176 22c.9 6.4 3.4 9 9.8 9.8-6.4.9-9 3.4-9.8 9.8-.9-6.4-3.4-9-9.8-9.8 6.4-.9 9-3.4 9.8-9.8z" fill="#7a5d12" />
    </svg>
  )
}

/** Rewards kids bought that are waiting to be handed over, with "Given". */
function HandoverPanel({ items, onChanged }) {
  const toast = useToast()

  async function given(redemption) {
    try {
      await rewardsApi.fulfill(redemption.id)
      toast.success(`Marked “${redemption.reward_title}” as given.`)
    } catch (err) {
      toast.error(getErrorMessage(err))
    }
    notifyHandoversChanged()
    onChanged()
  }

  return (
    <section className="card pad widget span-4" aria-labelledby="handover-title">
      <div className="section-top">
        <div>
          <h2 id="handover-title" className="section-title">Rewards to hand over</h2>
          <p className="section-sub">{items.length || 'None'} waiting</p>
        </div>
        <Link to="/dashboard/rewards" className="text-link">Rewards <Icon name="arrowRight" size={13} /></Link>
      </div>
      {items.length === 0 ? (
        <div className="empty widget-body">
          <span className="empty-symbol"><Icon name="gift" size={30} /></span>
          <h3>All handed over</h3>
          <p>No rewards are waiting to be delivered.</p>
        </div>
      ) : (
        <div className="widget-body limit stack-md">
          {items.map((r) => (
            <div key={r.id} className="reward-mini">
              <span className="reward-art" aria-hidden="true">{r.reward_emoji}</span>
              <div className="info">
                <strong>{r.reward_title}</strong>
                <div className="caption">
                  {r.child?.display_name} · {r.cost ? formatPoints(r.cost) : 'badge prize'} · {relativeTime(r.created_at)}
                </div>
              </div>
              <button type="button" className="btn primary small" onClick={() => given(r)}
                aria-label={`Mark ${r.reward_title} for ${r.child?.display_name} as given`}>Given</button>
            </div>
          ))}
        </div>
      )}
    </section>
  )
}

/** How things are going: each kid today, what's due this week, and recent points. */
function HowItsGoing({ data }) {
  const week = useMemo(() => currentWeek(), [])
  const today = todayIso()
  // This week onwards (plus anything still open): all this needs, however long the history.
  const tasks = useApi((signal) => tasksApi.list({ status: 'all', since: week[0].iso }, signal), [data, week])
  const kids = data.children
  const kidsToday = useMemo(() => [...kids]
    .sort((a, b) => (b.today_total - b.today_done) - (a.today_total - a.today_done))
    .slice(0, KIDS_TODAY), [kids])
  // One-off tasks due from today to the end of this week (routines repeat on their own).
  const upcoming = useMemo(() => {
    const days = Object.fromEntries(week.filter((d) => d.iso >= today).map((d) => [d.iso, d]))
    return (tasks.data?.items || [])
      .filter((t) => !t.routine && !['archived', 'expired', 'approved'].includes(t.status) && days[t.due_date])
      .sort((a, b) => a.due_date.localeCompare(b.due_date))
      .slice(0, 5)
      .map((t) => ({ id: t.id, title: t.title, kid: t.assigned_to, day: days[t.due_date] }))
  }, [tasks.data, week, today])

  return (
    <div className="widget-grid thirds">
      <section className="card pad widget span-4" aria-labelledby="glance-title">
        <div className="section-top">
          <div>
            <h2 id="glance-title" className="section-title">Your kids today</h2>
            <p className="section-sub">
              {kids.length > KIDS_TODAY ? `The ${KIDS_TODAY} with the most left to do` : 'Approved today, and points to spend'}
            </p>
          </div>
          {kids.length > KIDS_TODAY && (
            <Link to="/dashboard/family" className="text-link">All {formatNumber(kids.length)} <Icon name="arrowRight" size={13} /></Link>
          )}
        </div>
        <div className="widget-body limit">
          {kidsToday.map((kid) => {
            const total = kid.today_total || 0
            const done = kid.today_done || 0
            const tone = kidTone(kid)
            return (
              <div key={kid.id} className="progress-person">
                <div className="progress-person-head">
                  <Avatar emoji={kid.avatar} tone={tone} />
                  <div>
                    <Link to={`/dashboard/family/kids/${kid.id}`} className="kid-name-link"><strong>{kid.display_name}</strong></Link>
                    <small>{total ? `${done} of ${total} approved today` : 'Nothing due today'}</small>
                  </div>
                  <strong title="Points to spend">{formatPoints(kid.points_balance)}</strong>
                </div>
                {total > 0 && (
                  <ProgressBar value={done} max={total} tone={tone}
                    label={`${kid.display_name}: ${done} of ${total} approved today (${Math.round((done / total) * 100)}%)`} />
                )}
              </div>
            )
          })}
        </div>
      </section>

      <section className="card pad widget span-4" aria-labelledby="week-title">
        <div className="section-top">
          <div>
            <h2 id="week-title" className="section-title">Due this week</h2>
            <p className="section-sub">One-off tasks with a due date</p>
          </div>
          <Link to="/dashboard/tasks" className="text-link">Tasks <Icon name="arrowRight" size={13} /></Link>
        </div>
        <div className="widget-body limit">
          {upcoming.length === 0 ? (
            <p className="caption">No dated tasks left this week. Routines repeat on their own.</p>
          ) : upcoming.map((item) => (
            <div key={item.id} className="week-item">
              <span className="d-flex gap-3"><span className="text-3 week-day">{item.day.label}</span><strong>{item.title}</strong></span>
              <span className="who"><Avatar emoji={item.kid?.avatar} size="sm" tone={kidTone(item.kid)} /> {item.kid?.display_name}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="card pad widget span-4" aria-labelledby="activity-title">
        <div className="section-top">
          <div>
            <h2 id="activity-title" className="section-title">Recent points</h2>
            <p className="section-sub">Every point has a reason</p>
          </div>
        </div>
        <div className="widget-body limit">
          {data.recent_activity.length === 0 ? (
            <p className="caption">No points have changed yet.</p>
          ) : data.recent_activity.map((tx) => (
            <div key={tx.id} className="points-log">
              <div className="min-w-0">
                <div className="task-title">{tx.description}</div>
                <div className="caption">{tx.child?.display_name} · {relativeTime(tx.created_at)}</div>
              </div>
              <span className={tx.amount > 0 ? 'amount-pos' : 'amount-neg'}>{signedPoints(tx.amount)}</span>
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}

/**
 * A parent's Overview: what needs them now (approvals, rewards to hand over), then how things
 * are going. Approvals load on their own, so they show even before the rest is ready.
 */
export default function ParentOverview() {
  const { user } = useAuth()
  const summary = useApi((signal) => dashboardApi.summary(signal), [user.id])
  const firstName = user.display_name.split(' ')[0]
  const data = summary.data
  const noKids = data && data.children.length === 0

  return (
    <>
      <div className="page-header">
        <div>
          <span className="eyebrow">Family overview</span>
          <h1>{greeting()}, {firstName}.</h1>
          <p>{noKids ? "Let's set up your family first." : "Here's what needs a little attention today."}</p>
        </div>
        {!noKids && <Link to="/dashboard/tasks?new=1" className="btn primary"><Icon name="plus" size={16} /> New task</Link>}
      </div>

      {noKids ? (
        <section className="welcome">
          <div className="welcome-copy">
            <span className="eyebrow">First step</span>
            <h2>Add your kids</h2>
            <p>Each kid gets a simple username and password. Then you can give them tasks, routines and rewards.</p>
            <Link to="/dashboard/family" className="btn secondary">Add a kid <Icon name="arrowRight" size={14} /></Link>
          </div>
          <WelcomeArt />
        </section>
      ) : (
        <>
          {/* Row 1: what needs you now. */}
          <div className="widget-grid">
            <ApprovalsPanel onChanged={summary.reload} />
            {data && <HandoverPanel items={data.pending_redemptions} onChanged={summary.reload} />}
          </div>
          {/* Row 2: how things are going. */}
          {summary.loading && !data ? (
            <LoadingState rows={3} label="Loading your family's day" />
          ) : summary.error ? (
            <ErrorState error={summary.error} onRetry={summary.reload} />
          ) : (
            <HowItsGoing data={data} />
          )}
        </>
      )}
    </>
  )
}
