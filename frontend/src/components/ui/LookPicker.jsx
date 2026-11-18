import { PICTURES, TONES } from '../../utils/looks'
import Icon from './Icon'

/** Pick a picture from the shared set. */
export function PicturePicker({ value, onChange, labelledBy }) {
  return (
    <div className="icon-choice" role="radiogroup" aria-labelledby={labelledBy}>
      {PICTURES.map((name) => (
        <button key={name} type="button" role="radio" aria-checked={value === name} aria-label={name}
          title={name} onClick={() => onChange(name)}>
          <Icon name={name} size={20} />
        </button>
      ))}
    </div>
  )
}

/** Pick one of the four colours. */
export function TonePicker({ value, onChange, labelledBy }) {
  return (
    <div className="tone-choice" role="radiogroup" aria-labelledby={labelledBy}>
      {TONES.map((tone) => (
        <button key={tone} type="button" role="radio" aria-checked={value === tone} aria-label={tone}
          title={tone} className={`swatch-${tone}`} onClick={() => onChange(tone)} />
      ))}
    </div>
  )
}

/** The square tile a task or category shows: its picture on its colour. */
export function CategoryTile({ category, size = 'md' }) {
  return (
    <span className={`task-icon ${category.tone}${size === 'sm' ? ' sm' : ''}`} aria-hidden="true">
      <Icon name={category.icon} size={size === 'sm' ? 15 : 18} />
    </span>
  )
}
