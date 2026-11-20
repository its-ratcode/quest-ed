import { formatNumber } from '../../utils/format'
import Icon from './Icon'

/** One number with what it means, e.g. "32 · Points to spend". tone: mint | sky | lilac | butter. */
export function StatCard({ value, label, tone = 'mint', icon }) {
  return (
    <div className={`stat-card tone-${tone}`}>
      {icon && (
        <span className="stat-icon" aria-hidden="true"><Icon name={icon} size={18} /></span>
      )}
      <span className="stat-value">{typeof value === 'number' ? formatNumber(value) : value}</span>
      <span className="stat-label">{label}</span>
    </div>
  )
}
