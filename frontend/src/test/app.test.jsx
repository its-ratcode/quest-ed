import { render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import App from '../App.jsx'

afterEach(() => vi.unstubAllGlobals())

describe('start page', () => {
  it('says the API is up when the health check answers ok', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve({ ok: true, json: () => Promise.resolve({ status: 'ok' }) })))
    render(<App />)
    expect(screen.getByRole('heading', { name: 'Quest-Ed' })).toBeInTheDocument()
    expect(await screen.findByText('API is up')).toBeInTheDocument()
  })

  it('says so when the API is not reachable', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new TypeError('Failed to fetch'))))
    render(<App />)
    expect(await screen.findByText('API is not reachable')).toBeInTheDocument()
  })
})
