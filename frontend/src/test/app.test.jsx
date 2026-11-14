import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'
import HomePage from '../pages/HomePage'

const authState = { status: 'anonymous' }
vi.mock('../auth/useAuth', () => ({ useAuth: () => authState }))

afterEach(() => vi.unstubAllGlobals())

function renderHome() {
  return render(<MemoryRouter><HomePage /></MemoryRouter>)
}

describe('home page', () => {
  it('says the API is up and offers sign-in and sign-up', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve({ ok: true, json: () => Promise.resolve({ status: 'ok' }) })))
    renderHome()
    expect(await screen.findByText('API is up')).toHaveClass('alert-soft', 'success')
    expect(screen.getByRole('link', { name: 'Sign in' })).toHaveAttribute('href', '/login')
    expect(screen.getByRole('link', { name: 'Create an account' })).toHaveAttribute('href', '/register')
  })

  it('says so when the API is not reachable', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new TypeError('Failed to fetch'))))
    renderHome()
    expect(await screen.findByText('API is not reachable')).toHaveClass('alert-soft', 'error')
  })
})
