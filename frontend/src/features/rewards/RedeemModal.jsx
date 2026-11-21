import { useRef, useState } from 'react'
import { rewardsApi } from '../../api/rewards'
import Modal from '../../components/ui/Modal'
import { getErrorMessage } from '../../utils/errors'
import { formatPoints } from '../../utils/format'

/**
 * A kid buys a reward: what it costs and what's left, then a short "done". The server
 * decides whether it works. Shown while `reward` is set; rendered only then, so it starts fresh.
 * onRedeemed({ redemption, reward, balance }).
 */
export default function RedeemModal({ reward, ...props }) {
  if (!reward) return null
  return <RedeemSteps reward={reward} {...props} />
}

function RedeemSteps({ reward, balance, onClose, onRedeemed }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const [done, setDone] = useState(null)
  const inFlight = useRef(false) // a double tap can arrive before the button is disabled

  async function handleRedeem() {
    if (inFlight.current) return
    inFlight.current = true
    setBusy(true)
    setError(null)
    try {
      const result = await rewardsApi.redeem(reward.id)
      setDone(result)
      onRedeemed(result)
    } catch (err) {
      setError(getErrorMessage(err))
    } finally {
      inFlight.current = false
      setBusy(false)
    }
  }

  if (done) {
    return (
      <Modal open title="Done" onClose={onClose}>
        <p>Your parent can see you picked <strong>{reward.title}</strong> and will give it to you.</p>
        <p className="text-2 small-text mt-2 mb-0">You have {formatPoints(done.balance)} left.</p>
        <div className="modal-actions">
          <button type="button" className="btn primary" onClick={onClose} data-autofocus>OK</button>
        </div>
      </Modal>
    )
  }

  return (
    <Modal open title={`Get “${reward.title}”?`} onClose={onClose} busy={busy}>
      <table className="table table-sm mb-0 small-text">
        <tbody>
          <tr><td className="text-2">Your points now</td><td className="text-end">{formatPoints(balance)}</td></tr>
          <tr><td className="text-2">Cost</td><td className="text-end">−{formatPoints(reward.cost)}</td></tr>
          <tr>
            <td className="fw-600">Left after</td>
            <td className="text-end fw-600">{formatPoints(Math.max(balance - reward.cost, 0))}</td>
          </tr>
        </tbody>
      </table>
      {error && <div className="alert-soft error mt-3" role="alert">{error}</div>}
      <div className="modal-actions">
        <button type="button" className="btn secondary" onClick={onClose} disabled={busy}>Not now</button>
        <button type="button" className="btn primary" onClick={handleRedeem} disabled={busy} data-autofocus>
          {busy ? 'Buying…' : `Spend ${formatPoints(reward.cost)}`}
        </button>
      </div>
    </Modal>
  )
}
