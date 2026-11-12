import { useEffect, useState } from 'react'

const LABELS = { checking: 'Checking…', up: 'API is up', down: 'API is not reachable' }

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
    <main style={{ maxWidth: 560, margin: '80px auto', padding: '0 16px' }}>
      <h1>Quest-Ed</h1>
      <p>Chores, routines and rewards for families.</p>
      <p role="status" style={{ marginTop: 16, color: 'var(--muted)' }}>{LABELS[api]}</p>
    </main>
  )
}

export default App
