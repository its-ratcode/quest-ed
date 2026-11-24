import { useMemo, useState } from 'react'
import { Link } from 'react-router'
import { badgesApi } from '../../api/badges'
import { tasksApi } from '../../api/tasks'
import { useAuth } from '../../auth/useAuth'
import { Avatar } from '../../components/ui/Avatar'
import Icon from '../../components/ui/Icon'
import { CategoryTile } from '../../components/ui/LookPicker'
import { ProgressBar } from '../../components/ui/ProgressBar'
import { LoadingState } from '../../components/ui/States'
import { useToast } from '../../components/ui/toast/useToast'
import { useApi } from '../../hooks/useApi'
import { kidTone } from '../../utils/avatars'
import { formatNumber } from '../../utils/format'
import { useCategories } from '../categories/useCategories'
import SubmitTaskModal from '../tasks/SubmitTaskModal'
import { describeWeekdays } from '../tasks/weekdays'
import { currentWeek, localDayOf, todayIso } from './week'

const ORDER = { open: 0, submitted: 1, approved: 2 }

/** The next reward to save for when the kid hasn't picked one: the cheapest they can't afford yet. */
function nextGoal(rewards, balance) {
  return rewards.find((r) => (r.stock === null || r.stock > 0) && r.cost > balance) || null
}

/**
 * A kid's Today page: what's left to do today, their points and what they're saving for,
 * this week's streak, and the badge they're closest to. `data` is the dashboard summary.
 */
export default function KidToday({ data, reload }) {
  const { user } = useAuth()
  const toast = useToast()
  const cats = useCategories()
  const [submitting, setSubmitting] = useState(null)
  const week = useMemo(() => currentWeek(), [])
  const today = todayIso()
  // This week onwards (and anything still open): enough for the checklist and the week, and it
  // stays small however much history there is.
  const tasks = useApi((signal) => tasksApi.list({ status: 'all', since: week[0].iso }, signal), [data])
  const progress = useApi((signal) => badgesApi.progress({}, signal), [data])

  const all = useMemo(() => tasks.data?.items || [], [tasks.data])
  // Today's checklist: what's due or scheduled today (or earlier, still open), and undated open tasks.
  const checklist = useMemo(() => all
    .filter((t) => t.status in ORDER)
    .filter((t) => {
      const day = t.occurrence_date || t.due_date
      return t.status === 'approved' ? day === today : !day || day <= today
    })
    .sort((a, b) => ORDER[a.status] - ORDER[b.status]), [all, today])
  // Days this week with something approved (the day the kid did it).
  const doneDays = useMemo(() => new Set(all
    .filter((t) => t.status === 'approved' && t.latest_submission)
    .map((t) => localDayOf(t.latest_submission.submitted_at))), [all])

  const left = checklist.filter((t) => t.status === 'open').length
  const approvedToday = checklist.filter((t) => t.status === 'approved').length
  const chosenGoal = data.savings_goal
  const goal = chosenGoal || nextGoal(data.reward_highlights, data.balance)
  const streak = progress.data?.streak?.current ?? 0
  const nextBadge = (progress.data?.badges || [])
    .filter((b) => !b.earned_at && !b.manual)
    .sort((a, b) => b.progress / b.target - a.progress / a.target)[0]
  const tone = kidTone(user)
  const dateLabel = new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })

  return (
    <>
      <section className={`child-hero tone-${tone}`} aria-label="Today">
        <div>
          <span className="eyebrow">{dateLabel}</span>
          <h1>
            {left > 0
              ? <>Hi {user.display_name}, {left} {left === 1 ? 'thing' : 'things'}<br />left today!</>
              : <>Hi {user.display_name},<br />you're all done today!</>}
          </h1>
          <p>Take your time. You're doing great, one little win at a time.</p>
        </div>
        <div className="text-center">
          <Avatar emoji={user.avatar} size="xl" tone={tone} />
          <Link to="/dashboard/profile" className="hero-link">Change avatar</Link>
        </div>
      </section>

      {/* Row 1: today's jobs, and what they're saving for. */}
      <div className="widget-grid">
        <section className="card pad widget span-8" aria-labelledby="checklist-title">
          <div className="section-top">
            <div>
              <h2 id="checklist-title" className="section-title">My today checklist</h2>
              <p className="section-sub">
                {approvedToday > 0 ? `${approvedToday} already approved · you've got this!` : 'Pick one and get started.'}
              </p>
            </div>
          </div>
          {tasks.loading && !tasks.data ? (
            <LoadingState rows={3} label="Loading your tasks" />
          ) : checklist.length === 0 ? (
            <div className="empty widget-body">
              <span className="empty-symbol"><Icon name="sparkle" size={30} /></span>
              <h3>Nothing for today</h3>
              <p>New tasks from your parents will show up here.</p>
            </div>
          ) : (
            <div className="widget-body limit">
              {checklist.map((t) => {
                const cat = cats.of(t.category)
                const sentBack = t.status === 'open' && t.latest_submission?.status === 'rejected'
                return (
                  <div key={t.id} className={`child-task${t.status === 'approved' ? ' approved-row' : ''}`}>
                    <CategoryTile category={cat} />
                    <div className="task-text">
                      <div className="task-title">{t.title}</div>
                      <div className="task-detail">
                        {formatNumber(t.points)} points · {cat.label}
                        {t.routine ? ` · ${describeWeekdays(t.routine.weekdays)}` : ''}
                      </div>
                      {sentBack && t.latest_submission.review_note && (
                        <span className="task-note">Needs a little more: {t.latest_submission.review_note}</span>
                      )}
                    </div>
                    {t.status === 'open' && (
                      <button type="button" className="btn primary" onClick={() => setSubmitting(t)}
                        aria-label={`I did it: ${t.title}`}>
                        <Icon name="check" size={16} /> I did it
                      </button>
                    )}
                    {t.status === 'submitted' && <span className="pill pill-warning"><Icon name="clock" size={12} /> Waiting for parent</span>}
                    {t.status === 'approved' && <span className="pill pill-success"><Icon name="check" size={12} /> Approved</span>}
                  </div>
                )
              })}
            </div>
          )}
          <p className="child-footnote widget-foot">Tapping “I did it” sends it to your parent. Points appear after they approve it.</p>
        </section>

        <section className="card pad widget span-4" aria-labelledby="points-title">
          <div className="section-top">
            <div>
              <h2 id="points-title" className="section-title">My points</h2>
              <p className="section-sub">Saved up for something fun</p>
            </div>
          </div>
          <div className="widget-body">
            <div className="d-flex align-items-baseline gap-2 mb-3">
              <span className="big-number">{formatNumber(data.balance)}</span>
              <span className="caption">points to spend</span>
            </div>
            {goal ? (
              <>
                <div className="reward-mini lilac">
                  <span className="reward-art" aria-hidden="true">{goal.emoji}</span>
                  <div className="info">
                    <div className="caption">{chosenGoal ? 'Saving for (your choice)' : 'Next reward'}</div>
                    <strong>{goal.title}</strong>
                    <div className="caption">
                      {goal.cost > data.balance ? `${formatNumber(goal.cost - data.balance)} points to go` : 'You can get it now!'}
                    </div>
                  </div>
                </div>
                <div className="mt-3">
                  <ProgressBar value={Math.min(data.balance, goal.cost)} max={goal.cost} tone="lilac"
                    label={`${data.balance} of ${goal.cost} points saved for ${goal.title}`} />
                  <div className="d-flex justify-content-between caption mt-1">
                    <span>{formatNumber(data.balance)} saved</span><span>{formatNumber(goal.cost)} needed</span>
                  </div>
                </div>
              </>
            ) : (
              <p className="caption">
                {data.reward_highlights.length ? 'You can afford a reward right now.' : 'Ask a parent to add some rewards.'}
              </p>
            )}
            {data.pending_redemptions > 0 && (
              <div className="alert-soft info mt-3 d-flex gap-2 align-items-start">
                <Icon name="gift" size={14} />
                <span>
                  {data.pending_redemptions === 1
                    ? 'A reward you picked is on its way from a parent.'
                    : `${data.pending_redemptions} rewards you picked are on their way from a parent.`}
                </span>
              </div>
            )}
          </div>
          <div className="widget-foot">
            <Link to="/dashboard/rewards" className="btn secondary wide">Visit reward shop <Icon name="arrowRight" size={14} /></Link>
          </div>
        </section>
      </div>

      {/* Row 2: this week, and the next badge. */}
      <div className="widget-grid">
        <section className={`card pad widget ${nextBadge ? 'span-8' : 'span-12'}`} aria-labelledby="week-title">
          <div className="section-top">
            <div>
              <h2 id="week-title" className="section-title">My week, my pace</h2>
              <p className="section-sub">Streaks celebrate showing up, not perfection.</p>
            </div>
          </div>
          <div className="widget-body">
            <div className="streak-days">
              {week.map((d) => {
                const done = doneDays.has(d.iso)
                return (
                  <div key={d.iso} className={`streak-day${done ? ' done' : ''}${d.isToday ? ' today' : ''}`}
                    aria-label={`${d.label}: ${done ? 'something approved' : 'nothing yet'}`}>
                    <strong>{d.label}</strong>
                    <span className="streak-symbol" aria-hidden="true">
                      {done ? <Icon name="check" size={14} /> : <span className="streak-dash" />}
                    </span>
                  </div>
                )
              })}
            </div>
          </div>
          <p className="child-footnote widget-foot">
            {streak > 0
              ? `You have a ${streak}-day streak. A missed day is just a fresh start, not a failure.`
              : 'Get a task approved today to start a streak.'}
          </p>
        </section>

        {nextBadge && (
          <section className="card pad widget span-4" aria-labelledby="badge-title">
            <div className="section-top">
              <div>
                <h2 id="badge-title" className="section-title">Your next badge</h2>
                <p className="section-sub">Keep collecting little wins</p>
              </div>
            </div>
            <div className="widget-body d-flex align-items-center gap-3">
              <span className={`task-icon big ${nextBadge.tone}`} aria-hidden="true"><Icon name={nextBadge.icon} size={26} /></span>
              <div className="flex-grow-1">
                <strong className="next-badge-title">{nextBadge.title}</strong>
                <div className="caption mb-2">{nextBadge.progress} of {nextBadge.target} · {nextBadge.description}</div>
                <ProgressBar value={nextBadge.progress} max={nextBadge.target} tone={nextBadge.tone}
                  label={`${nextBadge.title}: ${nextBadge.progress} of ${nextBadge.target}`} />
              </div>
            </div>
            <div className="widget-foot">
              <Link to="/dashboard/badges" className="text-link">See all badges <Icon name="arrowRight" size={13} /></Link>
            </div>
          </section>
        )}
      </div>

      <SubmitTaskModal task={submitting} onClose={() => setSubmitting(null)}
        onSubmitted={() => {
          toast.success('Sent! Your parent will check it soon.')
          reload()
        }} />
    </>
  )
}
