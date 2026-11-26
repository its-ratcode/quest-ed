import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { authApi } from '../api/auth'
import { familyApi } from '../api/family'
import { leaderboardApi } from '../api/leaderboard'
import { AppRoutes } from '../App'
import { AuthProvider } from '../auth/AuthProvider'
import { DEFAULT_FEATURES, SiteConfigContext } from '../auth/siteConfigContext'
import { ToastProvider } from '../components/ui/toast/ToastProvider'

vi.mock('../api/auth', () => ({ authApi: { me: vi.fn(), logout: vi.fn() } }))
vi.mock('../api/leaderboard', () => ({ leaderboardApi: { get: vi.fn() } }))
vi.mock('../api/family', () => ({
  familyApi: { get: vi.fn(), setLeaderboard: vi.fn(), rename: vi.fn(), setTimezone: vi.fn() },
}))

const PAT = { id: 1, role: 'parent', display_name: 'Pat', avatar: '🙂', email: 'pat@example.test' }
const MIA = { id: 2, role: 'child', display_name: 'Mia', username: 'mia', avatar: '🦄', points_balance: 32 }
const LEO = { id: 3, role: 'child', display_name: 'Leo', username: 'leo', avatar: '🦖', points_balance: 5 }
const family = (on) => ({ id: 1, name: 'The Testers', timezone: 'UTC', leaderboard_enabled: on, invite_code: 'ABCD2345' })

const BOARD = {
  period: 'week', since: '2026-11-23', enabled: true, team_points: 45,
  items: [
    { rank: 1, child: { id: 3, display_name: 'Leo', avatar: '🦖' }, points: 25, tasks: 3, focus_minutes: 20, is_me: false },
    { rank: 2, child: { id: 2, display_name: 'Mia', avatar: '🦄' }, points: 20, tasks: 1, focus_minutes: 0, is_me: true },
  ],
}

function open(path, user, { on = true, features = DEFAULT_FEATURES } = {}) {
  authApi.me.mockResolvedValue({ user, family: family(on) })
  familyApi.get.mockResolvedValue({ family: family(on), members: [PAT, MIA, LEO] })
  return render(
    <MemoryRouter initialEntries={[path]}>
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

describe('the family leaderboard', () => {
  it("shows kids this week's ranking and the team total, and a month view", async () => {
    const user = userEvent.setup()
    leaderboardApi.get.mockResolvedValue(BOARD)
    open('/dashboard/leaderboard', MIA)

    const ranking = await screen.findByRole('region', { name: 'Points from approved tasks' })
    const rows = within(ranking).getAllByRole('listitem')
    expect(rows[0]).toHaveTextContent('Leo')
    expect(rows[0]).toHaveTextContent('3 approved tasks this week · 20 min of focus')
    expect(within(rows[1]).getByText('Mia (you)')).toBeInTheDocument()
    expect(within(rows[1]).getByLabelText('Place 2')).toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Together this week' })).toHaveTextContent('45 pts')
    const menu = screen.getByRole('complementary', { name: 'Main navigation' })
    expect(within(menu).getByRole('link', { name: 'Leaderboard' })).toHaveAttribute('href', '/dashboard/leaderboard')

    await user.click(screen.getByRole('tab', { name: 'This month' }))
    expect(leaderboardApi.get).toHaveBeenLastCalledWith('month', expect.anything())
  })

  it("kids don't see it until a parent turns it on", async () => {
    open('/dashboard/leaderboard', MIA, { on: false })
    expect(await screen.findByRole('heading', { name: "Your family hasn't turned on the leaderboard" })).toBeInTheDocument()
    const menu = screen.getByRole('complementary', { name: 'Main navigation' })
    expect(within(menu).queryByRole('link', { name: 'Leaderboard' })).not.toBeInTheDocument()
    expect(leaderboardApi.get).not.toHaveBeenCalled()
  })

  it('a parent turns it on in Family, and can look at it before the kids do', async () => {
    const user = userEvent.setup()
    const { unmount } = open('/dashboard/family', PAT, { on: false })
    const toggle = await screen.findByRole('switch', { name: 'Family leaderboard' })
    expect(toggle).toHaveAttribute('aria-checked', 'false')
    familyApi.setLeaderboard.mockResolvedValue({})
    await user.click(toggle)
    expect(familyApi.setLeaderboard).toHaveBeenCalledWith(true)
    expect(await screen.findByText('The kids can see the leaderboard now.')).toBeInTheDocument()
    unmount()

    leaderboardApi.get.mockResolvedValue(BOARD)
    open('/dashboard/leaderboard', PAT, { on: false })
    expect(await screen.findByText(/Only you can see this for now/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Turn it on in Family' })).toHaveAttribute('href', '/dashboard/family')
  })

  it('the site switch hides it everywhere', async () => {
    const off = { ...DEFAULT_FEATURES, leaderboard: false }
    const { unmount } = open('/dashboard/family', PAT, { features: off })
    expect(await screen.findByRole('heading', { name: 'Time zone' })).toBeInTheDocument()
    expect(screen.queryByRole('switch', { name: 'Family leaderboard' })).not.toBeInTheDocument()
    unmount()

    open('/dashboard/leaderboard', MIA, { features: off })
    expect(await screen.findByRole('heading', { name: 'Leaderboards are turned off' })).toBeInTheDocument()
    const menu = screen.getByRole('complementary', { name: 'Main navigation' })
    expect(within(menu).queryByRole('link', { name: 'Leaderboard' })).not.toBeInTheDocument()
  })
})
