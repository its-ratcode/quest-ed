import Icon from '../../components/ui/Icon'

/** A badge's picture on its colour. */
export default function BadgeEmblem({ icon, tone, size = 34 }) {
  return (
    <div className={`badge-emblem ${tone || ''}`} aria-hidden="true">
      <Icon name={icon} size={size} />
    </div>
  )
}
