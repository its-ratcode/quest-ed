/**
 * A round picture: a kid's chosen emoji, or a grown-up's initials.
 * size: sm | md | lg | xl. tone: the background colour (mint, lilac, sky, butter, or "sam" for grey).
 */
export function Avatar({ emoji, size = 'md', label, tone, initials }) {
  const sizeClass = size === 'md' ? '' : ` ${size}`
  return (
    <span className={`avatar${sizeClass}${tone ? ` tone-${tone}` : ''}`} role={label ? 'img' : undefined}
      aria-label={label} aria-hidden={label ? undefined : true}>
      {initials || emoji || '🙂'}
    </span>
  )
}
