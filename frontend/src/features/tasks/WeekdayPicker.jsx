import { WEEKDAY_PRESETS, WEEKDAYS } from './weekdays'

/** Pick weekdays (Mon = 0 … Sun = 6) one by one, or with a quick choice like "School days". */
export default function WeekdayPicker({ value, onChange, labelledBy }) {
  const selected = [...value].sort((a, b) => a - b)
  const toggle = (day) => onChange(
    (selected.includes(day) ? selected.filter((d) => d !== day) : [...selected, day]).sort((a, b) => a - b),
  )

  return (
    <div className="stack-sm">
      <div className="chip-row" role="group" aria-labelledby={labelledBy}>
        {WEEKDAYS.map((day) => (
          <button key={day.value} type="button" className="chip day-chip" aria-pressed={selected.includes(day.value)}
            aria-label={day.long} onClick={() => toggle(day.value)}>
            {day.short}
          </button>
        ))}
      </div>
      <div className="chip-row">
        {WEEKDAY_PRESETS.map(([label, days]) => (
          <button key={label} type="button" className="btn secondary small preset-btn"
            aria-pressed={selected.join() === days.join()} onClick={() => onChange(days)}>
            {label}
          </button>
        ))}
      </div>
    </div>
  )
}
