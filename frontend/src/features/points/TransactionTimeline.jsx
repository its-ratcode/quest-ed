import { formatNumber, relativeTime, signedPoints } from '../../utils/format'

/** Points history as a plain list: what happened, when, how much, and the balance after it. */
export default function TransactionTimeline({ items }) {
  return (
    <ul className="ledger">
      {items.map((tx) => {
        const earned = tx.amount > 0
        return (
          <li key={tx.id}>
            <div style={{ minWidth: 0 }}>
              <div className="small-text text-break">{tx.description}</div>
              <div className="tiny-text text-3">
                {relativeTime(tx.created_at)} · balance {formatNumber(tx.balance_after)}
              </div>
            </div>
            <span className={`${earned ? 'amount-pos' : 'amount-neg'} small-text`}
              aria-label={`${earned ? 'plus' : 'minus'} ${formatNumber(Math.abs(tx.amount))} points`}>
              {signedPoints(tx.amount)}
            </span>
          </li>
        )
      })}
    </ul>
  )
}
