import { useCallback, useEffect, useRef, useState } from 'react'

const isCancelled = (error) => error?.name === 'CanceledError' || error?.code === 'ERR_CANCELED'

/**
 * Load data when a page opens (and again when `deps` change), and cancel it if the page
 * closes first. `loader(signal)` returns a promise. `deps` are simple values (ids, filters).
 * Old data stays visible while reloading, so screens don't flash.
 *
 *   const family = useApi((signal) => familyApi.get(signal), [])
 *   family.data / family.loading / family.error / family.reload()
 */
export function useApi(loader, deps = []) {
  const [nonce, setNonce] = useState(0)
  // What should be loaded right now; a result counts once it's for this key.
  const key = `${JSON.stringify(deps)}#${nonce}`
  const [result, setResult] = useState({ data: null, error: null, key: null })
  const loaderRef = useRef(loader)
  useEffect(() => {
    loaderRef.current = loader
  })

  useEffect(() => {
    const controller = new AbortController()
    loaderRef.current(controller.signal)
      .then((data) => {
        if (!controller.signal.aborted) setResult({ data, error: null, key })
      })
      .catch((error) => {
        if (controller.signal.aborted || isCancelled(error)) return
        setResult((r) => ({ ...r, error, key }))
      })
    return () => controller.abort()
  }, [key])

  const reload = useCallback(() => setNonce((n) => n + 1), [])
  const done = result.key === key
  return { data: result.data, error: done ? result.error : null, loading: !done, reload }
}
