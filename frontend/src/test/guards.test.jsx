import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router'
import { describe, expect, it, vi } from 'vitest'
import { RedirectIfAuthenticated, RequireAuth } from '../routes/guards'
import { safeReturnPath } from '../routes/safeReturnPath'

const authState = { status: 'anonymous', user: null }
vi.mock('../auth/useAuth', () => ({ useAuth: () => authState }))

function renderAt(path) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/login" element={<RedirectIfAuthenticated><p>login screen</p></RedirectIfAuthenticated>} />
        <Route element={<RequireAuth />}>
          <Route path="/dashboard" element={<p>dashboard</p>} />
        </Route>
      </Routes>
    </MemoryRouter>,
  )
}

describe('route guards', () => {
  it('waits while the session is being checked', () => {
    Object.assign(authState, { status: 'loading', user: null })
    renderAt('/dashboard')
    expect(screen.getByRole('status')).toHaveTextContent('Checking your session')
  })

  it('sends visitors without a session to sign in', () => {
    Object.assign(authState, { status: 'anonymous', user: null })
    renderAt('/dashboard')
    expect(screen.getByText('login screen')).toBeInTheDocument()
  })

  it('after a session runs out, signing in returns to the page; after "Sign out", it starts at home', () => {
    function LoginSpy() {
      return <p>back to: {useLocation().state?.from ?? 'home'}</p>
    }
    const renderGuarded = () => render(
      <MemoryRouter initialEntries={['/dashboard/rewards']}>
        <Routes>
          <Route path="/login" element={<LoginSpy />} />
          <Route element={<RequireAuth />}>
            <Route path="/dashboard/rewards" element={<p>rewards</p>} />
          </Route>
        </Routes>
      </MemoryRouter>,
    )
    Object.assign(authState, { status: 'anonymous', user: null, signedOut: false })
    const { unmount } = renderGuarded()
    expect(screen.getByText('back to: /dashboard/rewards')).toBeInTheDocument()
    unmount()

    Object.assign(authState, { status: 'anonymous', user: null, signedOut: true })
    renderGuarded()
    expect(screen.getByText('back to: home')).toBeInTheDocument()
    authState.signedOut = false
  })

  it('lets signed-in people through, and skips the sign-in page for them', () => {
    Object.assign(authState, { status: 'authenticated', user: { id: 1, role: 'parent' } })
    renderAt('/dashboard')
    expect(screen.getByText('dashboard')).toBeInTheDocument()
    renderAt('/login')
    expect(screen.queryByText('login screen')).not.toBeInTheDocument()
  })

  it('only allows return paths inside the app', () => {
    expect(safeReturnPath('/dashboard/tasks')).toBe('/dashboard/tasks')
    expect(safeReturnPath('//evil.example')).toBe('/dashboard')
    expect(safeReturnPath('/\\evil.example')).toBe('/dashboard')
    expect(safeReturnPath('/\tevil.example')).toBe('/dashboard')
    expect(safeReturnPath('https://evil.example')).toBe('/dashboard')
    expect(safeReturnPath('/login')).toBe('/dashboard')
    expect(safeReturnPath(undefined)).toBe('/dashboard')
  })
})
