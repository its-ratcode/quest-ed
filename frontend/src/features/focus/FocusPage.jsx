import { useCallback, useEffect, useRef, useState } from 'react'
import { focusApi } from '../../api/focus'
import { useSiteConfig } from '../../auth/useSiteConfig'
import ConfirmDialog from '../../components/ui/ConfirmDialog'
import Icon from '../../components/ui/Icon'
import { EmptyState, ErrorState, LoadingState } from '../../components/ui/States'
import { useToast } from '../../components/ui/toast/useToast'
import { useApi } from '../../hooks/useApi'
import { getErrorMessage } from '../../utils/errors'
import { relativeTime } from '../../utils/format'

const PRESETS = [10, 15, 25, 45]
const MIN_MINUTES = 5
const MAX_MINUTES = 120

function formatClock(totalSeconds) {
  const s = Math.max(0, Math.ceil(totalSeconds))
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`
}

/** This device's time, ticking twice a second while a session runs. */
function useTicker(running) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (!running) return undefined
    const id = setInterval(() => setNow(Date.now()), 500)
    return () => clearInterval(id)
  }, [running])
  return now
}

/** The kid's focus timer: pick how long, then work on one thing until it rings. */
export default function FocusPage() {
  const { features } = useSiteConfig()
  if (!features.focus_mode) {
    return (
      <>
        <div className="page-header"><div><h1>Focus timer</h1></div></div>
        <EmptyState title="The focus timer is turned off" message="It's switched off on this site for now." />
      </>
    )
  }
  return <FocusTimer />
}

function FocusTimer() {
  const toast = useToast()
  const loaded = useApi((signal) => focusApi.get({}, signal), [])
  const [latest, setLatest] = useState(null) // the state after starting, finishing or stopping
  const [minutes, setMinutes] = useState(15)
  const [custom, setCustom] = useState(false)
  const [label, setLabel] = useState('')
  const [busy, setBusy] = useState(false)
  const [confirmStop, setConfirmStop] = useState(false)
  const [retryIn, setRetryIn] = useState(null) // the server said "not yet": try again after this many ms
  const finishing = useRef(false)

  const data = latest || loaded.data
  const active = data?.active
  const offsetMs = data?.offsetMs || 0
  const now = useTicker(Boolean(active))
  const left = active ? (new Date(active.ends_at).getTime() - (now + offsetMs)) / 1000 : null

  const finish = useCallback(async () => {
    if (!active || finishing.current) return
    finishing.current = true
    try {
      const result = await focusApi.finish(active.id)
      setRetryIn(null)
      setLatest(result)
      toast.success(`Done! ${active.minutes} minutes of focus.`)
      if (result.new_badges?.length) toast.success('You earned a new badge. Have a look on the Badges page.')
    } catch (err) {
      const answer = err?.response?.data
      if (answer?.error === 'too_early') setRetryIn(((answer.seconds_left || 0) + 1) * 1000)
      else toast.error(getErrorMessage(err))
    } finally {
      finishing.current = false
    }
  }, [active, toast])

  // When the time is up, the session is sent as finished (the server checks its own clock).
  useEffect(() => {
    if (!active) return undefined
    const wait = retryIn ?? new Date(active.ends_at).getTime() - (Date.now() + offsetMs)
    const id = setTimeout(finish, Math.max(0, wait))
    return () => clearTimeout(id)
  }, [active, offsetMs, retryIn, finish])

  async function start(event) {
    event.preventDefault()
    const m = Number(minutes)
    if (!Number.isInteger(m) || m < MIN_MINUTES || m > MAX_MINUTES) {
      toast.error(`Pick between ${MIN_MINUTES} and ${MAX_MINUTES} minutes.`)
      return
    }
    setBusy(true)
    try {
      setLatest(await focusApi.start(m, label.trim()))
      setLabel('')
    } catch (err) {
      toast.error(getErrorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  if (loaded.loading && !data) return <LoadingState label="Loading the focus timer" />
  if (loaded.error && !data) return <ErrorState error={loaded.error} onRetry={loaded.reload} />

  const total = (active ? active.minutes : Number(minutes) || 0) * 60
  const shown = active ? left ?? total : total
  const done = active && total ? Math.min(100, Math.max(0, 100 - (shown / total) * 100)) : 0

  return (
    <>
      <div className="page-header">
        <div>
          <h1>Focus timer</h1>
          <p>Pick how long, then work on one thing until the timer rings.</p>
        </div>
      </div>

      <div className="widget-grid">
        <section className="card pad widget span-6 focus-card" aria-label="Focus timer">
          {active ? (
            <p className="small-text text-2 mb-0">{active.label || 'Focusing'} · {active.minutes} minute session</p>
          ) : (
            <form id="focus-form" onSubmit={start} className="focus-setup" noValidate>
              <span className="form-label d-block" id="minutes-label">Choose your focus time</span>
              <div className="chip-row justify-content-center" role="group" aria-labelledby="minutes-label">
                {PRESETS.map((m) => (
                  <button key={m} type="button" className="chip" aria-pressed={!custom && Number(minutes) === m}
                    onClick={() => { setCustom(false); setMinutes(m) }}>
                    {m} min
                  </button>
                ))}
                <button type="button" className="chip" aria-pressed={custom} onClick={() => setCustom(true)}>Custom</button>
              </div>
              {custom && (
                <div className="focus-custom">
                  <label htmlFor="focus-minutes" className="form-label">Minutes ({MIN_MINUTES}–{MAX_MINUTES})</label>
                  <input id="focus-minutes" type="number" inputMode="numeric" className="form-control" min={MIN_MINUTES}
                    max={MAX_MINUTES} value={minutes} onChange={(e) => setMinutes(e.target.value)} />
                </div>
              )}
              <div className="focus-custom">
                <label htmlFor="focus-label" className="form-label">What are you working on? (optional)</label>
                <input id="focus-label" className="form-control" maxLength={80} value={label}
                  onChange={(e) => setLabel(e.target.value)} placeholder="Reading, homework, practice…" />
              </div>
            </form>
          )}

          <div className="timer-ring" style={{ '--timer-progress': `${done}%` }}>
            <div className="timer-inner">
              <strong className="timer-time" role="timer" aria-live="off"
                aria-label={`${formatClock(shown)} ${active ? 'left' : 'minutes'}`}>{formatClock(shown)}</strong>
              <span className="caption">{active ? "You're focusing" : 'Ready when you are'}</span>
            </div>
          </div>

          <div className="d-flex justify-content-center">
            {active ? (
              <button type="button" className="btn secondary" onClick={() => setConfirmStop(true)}>Stop early</button>
            ) : (
              <button type="submit" form="focus-form" className="btn primary" disabled={busy}>
                <Icon name="timer" size={16} /> {busy ? 'Starting…' : 'Start focusing'}
              </button>
            )}
          </div>
          <p className="caption text-center mt-3 mb-0">
            Taking a break is always okay. Stopping early never costs points or breaks a streak.
          </p>
        </section>

        <section className="card pad widget span-6" aria-labelledby="recent-focus">
          <div className="section-top">
            <div>
              <h2 id="recent-focus" className="section-title">Recent sessions</h2>
              <p className="section-sub">
                {data.completed_count} finished · {data.total_minutes} {data.total_minutes === 1 ? 'minute' : 'minutes'} in total
              </p>
            </div>
          </div>
          {data.recent.length === 0 ? (
            <EmptyState title="Your first focus session awaits" message="Press start when you're ready." />
          ) : (
            <ul className="list-plain widget-body">
              {data.recent.map((s) => (
                <li key={s.id} className="list-row">
                  <Icon name="clock" size={16} />
                  <div className="flex-grow-1 min-w-0">
                    <div className="fw-600 small-text">{s.minutes} minute session</div>
                    <div className="tiny-text text-3">
                      {s.label || 'Focus'}{s.status === 'cancelled' ? ' · stopped early' : ''}
                    </div>
                  </div>
                  <span className="caption text-nowrap">{relativeTime(s.started_at)}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      {confirmStop && (
        <ConfirmDialog
          open
          title="Stop early?"
          message="This session won't count towards your focus time. You can start a new one any time."
          confirmLabel="Stop"
          onConfirm={async () => setLatest(await focusApi.cancel(active.id))}
          onClose={() => setConfirmStop(false)}
        />
      )}
    </>
  )
}
