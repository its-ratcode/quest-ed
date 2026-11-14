import { useEffect, useState } from 'react'
import Icon from './components/ui/Icon.jsx'

const STATUS = {
  checking: { tone: 'info', text: 'Checking…' },
  up: { tone: 'success', text: 'API is up' },
  down: { tone: 'error', text: 'API is not reachable' },
}

/** Temporary start page: shows that the web app runs and can reach the API. */
function App() {
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
          <div className={`alert-soft ${STATUS[api].tone}`} role="status">{STATUS[api].text}</div>
        </div>
      </div>
    </main>
  )
}

export default App
