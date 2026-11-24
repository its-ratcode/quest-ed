/** Suggested avatars. Anyone can also type or paste any other emoji. */
export const AVATARS = ['🦊', '🦄', '🦖', '🐼', '🐯', '🐸', '🐙', '🦁', '🐨', '🐰', '🚀', '🌟', '🌻', '🎨', '⚽', '🎸']

/** A kid's colour (their Today page, their avatar): lilac or sky, alternating by account. */
export function kidTone(kid) {
  return Number(kid?.id) % 2 === 0 ? 'lilac' : 'sky'
}
