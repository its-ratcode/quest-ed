// The sparkle, centred on 0,0 and 14 wide, so it can be placed and sized as the Q's tail.
const SPARKLE = 'M0 -7c.6 4.4 2.6 6.4 7 7-4.4.6-6.4 2.6-7 7-.6-4.4-2.6-6.4-7-7 4.4-.6 6.4-2.6 7-7z'

/**
 * The Quest-Ed logo: a "Q" drawn as a ring with the sparkle as its tail.
 * The browser tab's icon in index.html is the same drawing on a mint tile (so it shows
 * on dark tab bars too); change both together.
 */
export default function BrandMark({ size = 26 }) {
  return (
    <span className="brand-mark" aria-hidden="true">
      <svg width={size} height={size} viewBox="0 0 24 24" focusable="false">
        <circle className="brand-q-ring" cx="11" cy="11" r="6.5" />
        <path className="brand-q-tail" d={SPARKLE} transform="translate(17 17) scale(0.6)" />
      </svg>
    </span>
  )
}
