import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { authApi } from '../api/auth'
import { AppRoutes } from '../App'
import { AuthProvider } from '../auth/AuthProvider'
import DashboardLayout from '../components/layout/DashboardLayout'
import ErrorBoundary from '../components/ui/ErrorBoundary'
import { ToastProvider } from '../components/ui/toast/ToastProvider'
import { RequireAuth } from '../routes/guards'

vi.mock('../api/auth', () => ({ authApi: { me: vi.fn(), logout: vi.fn() } }))

const MIA = { id: 2, role: 'child', display_name: 'Mia', username: 'mia', avatar: '🦄', points_balance: 32 }
const FAMILY = { id: 1, name: 'The Testers' }

function Broken() {
  throw new Error('boom')
}

function withProviders(ui, path) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <ToastProvider>
        <AuthProvider>{ui}</AuthProvider>
      </ToastProvider>
    </MemoryRouter>,
  )
}

beforeEach(() => {
  vi.resetAllMocks()
  vi.spyOn(console, 'error').mockImplementation(() => {}) // React and the boundary report the crash
  // The menu's waiting counts load from the API; nothing is waiting here.
  vi.stubGlobal('fetch', vi.fn(() => Promise.resolve({ ok: true, json: () => Promise.resolve({ items: [] }) })))
})
afterEach(() => vi.unstubAllGlobals())

describe('pages that are not there or not allowed', () => {
  it("inside the app, an unknown page says so and keeps the menu", async () => {
    authApi.me.mockResolvedValue({ user: MIA, family: FAMILY })
    withProviders(<AppRoutes />, '/dashboard/nope')
    expect(await screen.findByRole('heading', { name: 'Page not found' })).toBeInTheDocument()
    expect(screen.getByRole('complementary', { name: 'Main navigation' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Back to the start' })).toHaveAttribute('href', '/dashboard')
  })

  it("a page for another kind of account says it isn't for this one", async () => {
    authApi.me.mockResolvedValue({ user: MIA, family: FAMILY })
    withProviders(<AppRoutes />, '/dashboard/admin/users')
    expect(await screen.findByRole('heading', { name: "This page isn't for your account" })).toBeInTheDocument()
    expect(screen.getByRole('complementary', { name: 'Main navigation' })).toBeInTheDocument()
  })
})

describe('when a page crashes', () => {
  it('shows a message with a Reload button instead of a blank screen', () => {
    render(<ErrorBoundary><Broken /></ErrorBoundary>)
    const alert = within(screen.getByRole('alert'))
    expect(alert.getByRole('heading', { name: 'Something broke on this page' })).toBeInTheDocument()
    expect(alert.getByText(/Your tasks and points are saved/)).toBeInTheDocument()
    expect(alert.getByRole('button', { name: 'Reload' })).toBeInTheDocument()
  })

  it('inside the app only the page is replaced, and going to another page clears it', async () => {
    const user = userEvent.setup()
    authApi.me.mockResolvedValue({ user: MIA, family: FAMILY })
    withProviders(
      <Routes>
        <Route element={<RequireAuth />}>
          <Route path="/dashboard" element={<DashboardLayout />}>
            <Route path="broken" element={<Broken />} />
            <Route path="profile" element={<p>All good here</p>} />
          </Route>
        </Route>
      </Routes>,
      '/dashboard/broken',
    )
    expect(await screen.findByRole('heading', { name: 'Something broke on this page' })).toBeInTheDocument()
    const menu = screen.getByRole('complementary', { name: 'Main navigation' })

    await user.click(within(menu).getByRole('link', { name: 'Your profile' }))
    expect(await screen.findByText('All good here')).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Something broke on this page' })).not.toBeInTheDocument()
  })
})
