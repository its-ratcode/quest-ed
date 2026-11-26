import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { authApi } from '../api/auth'
import { focusApi } from '../api/focus'
import { AppRoutes } from '../App'
import { AuthProvider } from '../auth/AuthProvider'
import { DEFAULT_FEATURES, SiteConfigContext } from '../auth/siteConfigContext'
import { ToastProvider } from '../components/ui/toast/ToastProvider'

vi.mock('../api/auth', () => ({ authApi: { me: vi.fn(), logout: vi.fn() } }))
vi.mock('../api/focus', () => ({ focusApi: { get: vi.fn(), start: vi.fn(), finish: vi.fn(), cancel: vi.fn() } }))

const MIA = { id: 2, role: 'child', display_name: 'Mia', username: 'mia', avatar: '🦄', points_balance: 32 }
const FAMILY = { id: 1, name: 'The Testers' }
const IDLE = { active: null, recent: [], completed_count: 0, total_minutes: 0, offsetMs: 0 }

function session(id, minutes, extra = {}) {
  const started = new Date(Date.now() - 60_000)
  return {
    id, minutes, label: '', status: 'active', started_at: started.toISOString(),
    ends_at: new Date(started.getTime() + minutes * 60_000).toISOString(), ended_at: null, ...extra,
  }
}

function open(features = DEFAULT_FEATURES) {
  authApi.me.mockResolvedValue({ user: MIA, family: FAMILY })
  return render(
    <MemoryRouter initialEntries={['/dashboard/focus']}>
      <ToastProvider>
        <AuthProvider>
          <SiteConfigContext.Provider value={{ features, needsSetup: false, loaded: true, refresh: vi.fn() }}>
            <AppRoutes />
          </SiteConfigContext.Provider>
        </AuthProvider>
      </ToastProvider>
    </MemoryRouter>,
  )
}

beforeEach(() => {
  vi.resetAllMocks()
  vi.stubGlobal('fetch', vi.fn(() => Promise.resolve({ ok: true, json: () => Promise.resolve({ status: 'ok' }) })))
})

describe('the focus timer', () => {
  it('starts a session, counts down, and can be stopped early', async () => {
    const user = userEvent.setup()
    focusApi.get.mockResolvedValue(IDLE)
    open()

    expect(await screen.findByRole('heading', { level: 1, name: 'Focus timer' })).toBeInTheDocument()
    expect(screen.getByRole('timer')).toHaveTextContent('15:00')
    expect(screen.getByText('Your first focus session awaits')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '25 min' }))
    expect(screen.getByRole('button', { name: '25 min' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('timer')).toHaveTextContent('25:00')
    await user.type(screen.getByLabelText('What are you working on? (optional)'), ' Piano ')

    const running = session(7, 25, { label: 'Piano' })
    focusApi.start.mockResolvedValue({ ...IDLE, active: running })
    await user.click(screen.getByRole('button', { name: 'Start focusing' }))
    expect(focusApi.start).toHaveBeenCalledWith(25, 'Piano')
    expect(await screen.findByText("You're focusing")).toBeInTheDocument()
    expect(screen.getByText('Piano · 25 minute session')).toBeInTheDocument()
    expect(screen.getByRole('timer').textContent).toMatch(/^2[34]:\d\d$/) // a minute has gone already

    focusApi.cancel.mockResolvedValue({ ...IDLE, recent: [{ ...running, status: 'cancelled' }] })
    await user.click(screen.getByRole('button', { name: 'Stop early' }))
    await user.click(within(screen.getByRole('dialog', { name: 'Stop early?' })).getByRole('button', { name: 'Stop' }))
    expect(focusApi.cancel).toHaveBeenCalledWith(7)
    expect(await screen.findByText(/stopped early/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Start focusing' })).toBeInTheDocument()
  })

  it('finishes by itself once the time is up, and says when a badge was earned', async () => {
    const over = session(8, 10, { ends_at: new Date(Date.now() - 1000).toISOString() })
    focusApi.get.mockResolvedValue({ ...IDLE, active: over })
    focusApi.finish.mockResolvedValue({
      ...IDLE, completed_count: 1, total_minutes: 10, recent: [{ ...over, status: 'completed' }], new_badges: [3],
    })
    open()

    expect(await screen.findByText('Done! 10 minutes of focus.')).toBeInTheDocument()
    expect(focusApi.finish).toHaveBeenCalledWith(8)
    expect(screen.getByText('You earned a new badge. Have a look on the Badges page.')).toBeInTheDocument()
    expect(screen.getByText('1 finished · 10 minutes in total')).toBeInTheDocument()
  })

  it('checks a custom length before starting', async () => {
    const user = userEvent.setup()
    focusApi.get.mockResolvedValue(IDLE)
    open()
    await user.click(await screen.findByRole('button', { name: 'Custom' }))
    const minutes = screen.getByLabelText('Minutes (5–120)')
    await user.clear(minutes)
    await user.type(minutes, '3')
    await user.click(screen.getByRole('button', { name: 'Start focusing' }))
    expect(await screen.findByText('Pick between 5 and 120 minutes.')).toBeInTheDocument()
    expect(focusApi.start).not.toHaveBeenCalled()
  })

  it('is hidden from the menu and says so while the administrator has switched it off', async () => {
    open({ ...DEFAULT_FEATURES, focus_mode: false })
    expect(await screen.findByRole('heading', { name: 'The focus timer is turned off' })).toBeInTheDocument()
    const menu = screen.getByRole('complementary', { name: 'Main navigation' })
    expect(within(menu).queryByRole('link', { name: 'Focus timer' })).not.toBeInTheDocument()
    expect(focusApi.get).not.toHaveBeenCalled()
  })
})
