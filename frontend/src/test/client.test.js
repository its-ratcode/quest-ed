import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { api, setSessionExpiredHandler } from '../api/client'

function response(config, status, data = {}) {
  const res = { data, status, statusText: String(status), headers: {}, config }
  if (status >= 400) {
    const error = new Error(`Request failed with status ${status}`)
    error.config = config
    error.response = res
    error.isAxiosError = true
    return Promise.reject(error)
  }
  return Promise.resolve(res)
}

describe('api client', () => {
  let originalAdapter
  beforeEach(() => {
    originalAdapter = api.defaults.adapter
  })
  afterEach(() => {
    api.defaults.adapter = originalAdapter
    setSessionExpiredHandler(null)
    document.cookie = 'csrf_access_token=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/'
    document.cookie = 'csrf_refresh_token=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/'
  })

  it('sends the CSRF header on writes but not reads', async () => {
    document.cookie = 'csrf_access_token=abc123; path=/'
    const seen = []
    api.defaults.adapter = (config) => {
      seen.push({ method: config.method, csrf: config.headers['X-CSRF-TOKEN'] })
      return response(config, 200)
    }
    await api.get('/tasks')
    await api.post('/tasks', {})
    expect(seen).toEqual([
      { method: 'get', csrf: undefined },
      { method: 'post', csrf: 'abc123' },
    ])
  })

  it('uses the refresh CSRF cookie for the refresh endpoint', async () => {
    document.cookie = 'csrf_access_token=access; path=/'
    document.cookie = 'csrf_refresh_token=refresh; path=/'
    let header
    api.defaults.adapter = (config) => {
      header = config.headers['X-CSRF-TOKEN']
      return response(config, 200)
    }
    await api.post('/auth/refresh')
    expect(header).toBe('refresh')
  })

  it('refreshes once for requests that expire together, and retries each once', async () => {
    let refreshed = false
    let refreshCalls = 0
    const calls = []
    api.defaults.adapter = (config) => {
      calls.push(config.url)
      if (config.url === '/auth/refresh') {
        refreshCalls += 1
        return new Promise((resolve) => setTimeout(() => {
          refreshed = true
          resolve({ data: {}, status: 200, statusText: 'OK', headers: {}, config })
        }, 10))
      }
      if (!refreshed) return response(config, 401, { error: 'token_expired' })
      return response(config, 200, { url: config.url })
    }

    const [a, b] = await Promise.all([api.get('/tasks'), api.get('/rewards')])
    expect(a.data.url).toBe('/tasks')
    expect(b.data.url).toBe('/rewards')
    expect(refreshCalls).toBe(1)
    expect(calls.filter((u) => u === '/tasks')).toHaveLength(2)
  })

  it('reports an ended session when refreshing fails, without looping', async () => {
    const expired = vi.fn()
    setSessionExpiredHandler(expired)
    let count = 0
    api.defaults.adapter = (config) => {
      count += 1
      return response(config, 401, { error: config.url === '/auth/refresh' ? 'unauthorized' : 'token_expired' })
    }
    await expect(api.get('/auth/me')).rejects.toBeTruthy()
    expect(expired).toHaveBeenCalledTimes(1)
    expect(count).toBe(2) // the request, plus one refresh attempt
  })

  it('does not try to refresh after a failed sign-in', async () => {
    let count = 0
    api.defaults.adapter = (config) => {
      count += 1
      return response(config, 401, { error: 'invalid_credentials' })
    }
    await expect(api.post('/auth/login', {})).rejects.toBeTruthy()
    expect(count).toBe(1)
  })
})
