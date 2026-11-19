// Told after a parent approves or sends something back, so the menu's "waiting" count
// updates straight away instead of on the next page change.
const APPROVALS_CHANGED = 'quest-ed:approvals-changed'

export function notifyApprovalsChanged() {
  window.dispatchEvent(new Event(APPROVALS_CHANGED))
}

/** Calls `listener` after every change; returns a function that stops listening. */
export function onApprovalsChanged(listener) {
  window.addEventListener(APPROVALS_CHANGED, listener)
  return () => window.removeEventListener(APPROVALS_CHANGED, listener)
}
