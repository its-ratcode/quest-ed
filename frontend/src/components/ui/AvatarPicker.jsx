import { lastSymbol } from '../../utils/text'

/** Pick one of the suggested emoji, or type or paste any other one into the last box. */
export function AvatarPicker({ value, onChange, options, label = 'Choose an avatar' }) {
  const custom = value && !options.includes(value) ? value : ''
  return (
    <div className="avatar-picker" role="radiogroup" aria-label={label}>
      {options.map((emoji) => (
        <button key={emoji} type="button" role="radio" aria-checked={value === emoji} aria-label={emoji}
          className="avatar-option" onClick={() => onChange(emoji)}>
          {emoji}
        </button>
      ))}
      <label className={`avatar-option avatar-custom${custom ? ' is-on' : ''}`} title="Type or paste any emoji">
        <span className="visually-hidden">Your own emoji</span>
        <input value={custom} placeholder="+" maxLength={16} inputMode="text" autoComplete="off"
          onChange={(e) => {
            // The box may already hold the current custom emoji; the new one is added after it.
            const symbol = lastSymbol(e.target.value)
            if (symbol) onChange(symbol)
          }} />
      </label>
    </div>
  )
}
