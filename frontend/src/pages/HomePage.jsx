import { useEffect, useState } from 'react'
import { Link } from 'react-router'
import { useAuth } from '../auth/useAuth'
import Icon from '../components/ui/Icon'

const STATUS = {
  checking: { tone: 'info', text: 'Checking…' },
  up: { tone: 'success', text: 'API is up' },
  down: { tone: 'error', text: 'API is not reachable' },
}

/** Temporary home page: the API status, and the way in. Replaced by the real welcome page later. */
export default function HomePage() {
  const { status } = useAuth()
  const [api, setApi] = useState('checking')

  useEffect(() => {
    const controller = new AbortController()
    fetch('/api/v1/health', { signal: controller.signal })
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error(res.statusText))))
      .then((data) => setApi(data.status === 'ok' ? 'up' : 'down'))
      .catch((err) => {
        if (err.name !== 'AbortError') setApi('down')
      })
    return () => controller.abort()
  }, [])

  return (
    <main className="full-center">
      <div style={{ width: 'min(100%, 420px)' }}>
        <div className="brand" style={{ padding: 0, marginBottom: 16 }}>
          <span className="brand-mark" aria-hidden="true"><Icon name="sparkle" size={18} /></span>
          Quest-Ed
        </div>
        <div className="card-soft">
          <h1 className="h3 mb-1">Welcome</h1>
          <p className="text-2 small-text mb-3">Chores, routines and rewards for families.</p>
          <div className={`alert-soft ${STATUS[api].tone} mb-3`} role="status">{STATUS[api].text}</div>
          {status === 'authenticated' ? (
            <Link to="/dashboard" className="btn primary wide">Go to dashboard</Link>
          ) : (
            <div className="d-flex gap-2">
              <Link to="/login" className="btn secondary wide">Sign in</Link>
              <Link to="/register" className="btn primary wide">Create an account</Link>
            </div>
          )}
        </div>
      </div>
    </main>
  )
}
