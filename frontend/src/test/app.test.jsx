import { render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { describe, expect, it, vi } from 'vitest'
import { AppRoutes } from '../App'

const authState = { status: 'anonymous', user: null }
vi.mock('../auth/useAuth', () => ({ useAuth: () => authState }))

function renderAt(path) {
  return render(<MemoryRouter initialEntries={[path]}><AppRoutes /></MemoryRouter>)
}

describe('welcome page', () => {
  it('says what the app does, how it works, and offers sign-up and sign-in', () => {
    Object.assign(authState, { status: 'anonymous', user: null })
    renderAt('/')
    expect(screen.getByRole('heading', { level: 1, name: /Chores, routines and rewards/ })).toBeInTheDocument()
    expect(screen.getByRole('figure', { name: "Example of a kid's task list" })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'How it works' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Is there a leaderboard?' })).toBeInTheDocument()

    const site = within(screen.getByRole('navigation', { name: 'Site' }))
    expect(site.getByRole('link', { name: 'Sign in' })).toHaveAttribute('href', '/login')
    expect(screen.getByRole('link', { name: 'Create a family account' })).toHaveAttribute('href', '/register')
  })

  it('signed-in people get a way to their dashboard instead', () => {
    Object.assign(authState, { status: 'authenticated', user: { id: 1, role: 'parent' } })
    renderAt('/')
    const site = within(screen.getByRole('navigation', { name: 'Site' }))
    expect(site.getByRole('link', { name: 'Go to dashboard' })).toHaveAttribute('href', '/dashboard')
    expect(site.queryByRole('link', { name: 'Sign in' })).not.toBeInTheDocument()
  })

  it('an address that is not a page says so, with a way back', () => {
    Object.assign(authState, { status: 'anonymous', user: null })
    renderAt('/no-such-page')
    expect(screen.getByRole('heading', { name: 'Page not found' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Back to the start' })).toHaveAttribute('href', '/')
  })
})
