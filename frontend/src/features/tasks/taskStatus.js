/** How each task status reads, and its colour. */
export const TASK_STATUS = {
  open: { label: 'To do', tone: 'later' },
  submitted: { label: 'Waiting for parent', tone: 'warning' },
  approved: { label: 'Approved', tone: 'success' },
  archived: { label: 'Archived', tone: 'muted' },
  expired: { label: 'Day ended', tone: 'muted' }, // a routine's copy that wasn't done on its day
}
