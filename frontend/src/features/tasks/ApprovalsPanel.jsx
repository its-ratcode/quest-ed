import { useState } from 'react'
import { tasksApi } from '../../api/tasks'
import Icon from '../../components/ui/Icon'
import { CategoryTile } from '../../components/ui/LookPicker'
import { ErrorState, LoadingState } from '../../components/ui/States'
import { useToast } from '../../components/ui/toast/useToast'
import { useApi } from '../../hooks/useApi'
import { relativeTime } from '../../utils/format'
import { useCategories } from '../categories/useCategories'
import ReviewModal from './ReviewModal'
import SubmissionPhoto from './SubmissionPhoto'

/**
 * The parent's "Ready for your approval" panel: every "I did it" waiting, oldest first.
 * `onChanged` runs after each approval or send-back (the Overview refreshes its other panels).
 */
export default function ApprovalsPanel({ onChanged }) {
  const toast = useToast()
  const cats = useCategories()
  const [review, setReview] = useState(null)
  const pending = useApi((signal) => tasksApi.submissions({ status: 'pending', limit: 200 }, signal), [])
  const items = pending.data?.items || []

  return (
    <section className="card pad widget span-8" aria-labelledby="approve-title">
      <div className="section-top">
        <div>
          <h2 id="approve-title" className="section-title">Ready for your approval</h2>
          {pending.data && (
            <p className="section-sub">{items.length} completed {items.length === 1 ? 'task' : 'tasks'} to review</p>
          )}
        </div>
      </div>

      {pending.loading && !pending.data ? (
        <LoadingState rows={2} label="Loading what's waiting" />
      ) : pending.error ? (
        <ErrorState error={pending.error} onRetry={pending.reload} />
      ) : items.length === 0 ? (
        <div className="empty widget-body">
          <span className="empty-symbol"><Icon name="check" size={30} /></span>
          <h3>Nothing waiting</h3>
          <p>When one of your kids presses “I did it”, it shows up here.</p>
        </div>
      ) : (
        <div className="widget-body limit" tabIndex={0} aria-label="Tasks waiting for approval">
          {items.map((s) => (
            <div key={s.id} className="task-row">
              <CategoryTile category={cats.of(s.task?.category)} />
              <div className="task-text">
                <div className="task-title">{s.task?.title} · <span className="points-bubble">+{s.task?.points} pts</span></div>
                <div className="task-detail">{s.child?.display_name} submitted · {relativeTime(s.submitted_at)}</div>
                {s.note && <span className="task-note">“{s.note}”</span>}
                {s.has_photo && <SubmissionPhoto submission={s} />}
              </div>
              <div className="task-actions">
                <button type="button" className="btn mint small" onClick={() => setReview({ submission: s, action: 'approve' })}
                  aria-label={`Approve ${s.task?.title} from ${s.child?.display_name}`}>
                  <Icon name="check" size={16} /> Approve
                </button>
                <button type="button" className="btn secondary small" onClick={() => setReview({ submission: s, action: 'reject' })}
                  aria-label={`Send back ${s.task?.title} to ${s.child?.display_name}`}>
                  Send back
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <ReviewModal review={review} onClose={() => setReview(null)}
        onDone={(result, action) => {
          toast.success(action === 'approve'
            ? `Approved. ${result.submission.child?.display_name} got ${result.submission.points_awarded} points.`
            : 'Sent back with your note.')
          pending.reload()
          onChanged?.()
        }} />
    </section>
  )
}
