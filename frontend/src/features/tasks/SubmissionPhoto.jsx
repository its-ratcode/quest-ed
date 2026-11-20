import { tasksApi } from '../../api/tasks'

/** The photo a kid added with "I did it". Opens full size in a new tab. */
export default function SubmissionPhoto({ submission, size = 120 }) {
  const src = tasksApi.photoUrl(submission.id)
  const who = submission.child?.display_name || 'your kid'
  return (
    <a href={src} target="_blank" rel="noreferrer" className="submission-photo"
      aria-label={`Open the photo ${who} added, full size`}>
      {/* A fixed size keeps the layout steady while the photo loads. */}
      <img src={src} alt={`Photo ${who} added as proof`} width={size} height={Math.round(size * 0.75)} />
    </a>
  )
}
