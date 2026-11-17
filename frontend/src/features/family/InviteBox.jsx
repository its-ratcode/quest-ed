import { useState } from 'react'
import ConfirmDialog from '../../components/ui/ConfirmDialog'
import { useToast } from '../../components/ui/toast/useToast'

/** The code another parent uses to join, with Copy and "Get a new code". */
export function InviteBox({ code, onNewCode }) {
  const toast = useToast()
  const [confirming, setConfirming] = useState(false)

  async function copy() {
    try {
      await navigator.clipboard.writeText(code)
      toast.success('Invite code copied.')
    } catch {
      toast.info(`Invite code: ${code}`) // no clipboard access: show it instead
    }
  }

  return (
    <div className="invite-box">
      <span className="tiny-text text-2">Invite code (they choose “Join with a code” at sign-up)</span>
      <div className="d-flex align-items-center justify-content-between gap-2 mt-1">
        <code className="invite-code">{code}</code>
        <button type="button" className="btn secondary small" onClick={copy}>Copy</button>
      </div>
      <button type="button" className="text-link small-text mt-2" onClick={() => setConfirming(true)}>
        Get a new code
      </button>
      <ConfirmDialog
        open={confirming}
        title="Get a new invite code?"
        message="The current code stops working. Anyone who hasn't joined yet will need the new one."
        confirmLabel="New code"
        onClose={() => setConfirming(false)}
        onConfirm={onNewCode}
      />
    </div>
  )
}
