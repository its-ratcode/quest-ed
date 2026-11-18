import { formatNumber } from '../../utils/format'

/** Page numbers to show: the first, the last, and the ones around the current page, with gaps. */
function pageList(page, pages) {
  const wanted = new Set([1, pages, page - 1, page, page + 1])
  const list = []
  for (let p = 1; p <= pages; p += 1) {
    if (wanted.has(p)) list.push(p)
    else if (list[list.length - 1] !== '…') list.push('…')
  }
  return list
}

/** Numbered pages for long lists: "‹ 1 … 4 5 6 … 20 ›" plus "41–60 of 400". */
export default function Pager({ page, perPage, total, onChange, label = 'Pages' }) {
  const pages = Math.max(1, Math.ceil(total / perPage))
  const from = total === 0 ? 0 : (page - 1) * perPage + 1
  const to = Math.min(total, page * perPage)
  return (
    <nav className="pager" aria-label={label}>
      <span className="pager-count">
        {total === 0 ? 'Nothing yet' : `${formatNumber(from)}–${formatNumber(to)} of ${formatNumber(total)}`}
      </span>
      {pages > 1 && (
        <div className="pager-pages">
          <button type="button" className="pager-btn" disabled={page <= 1} onClick={() => onChange(page - 1)}
            aria-label="Previous page">‹</button>
          {pageList(page, pages).map((p, i) => (p === '…'
            ? <span key={`gap${i}`} className="pager-gap" aria-hidden="true">…</span>
            : (
              <button key={p} type="button" className="pager-btn" aria-current={p === page ? 'page' : undefined}
                aria-label={`Page ${p}`} onClick={() => onChange(p)}>{formatNumber(p)}</button>
            )))}
          <button type="button" className="pager-btn" disabled={page >= pages} onClick={() => onChange(page + 1)}
            aria-label="Next page">›</button>
        </div>
      )}
    </nav>
  )
}
