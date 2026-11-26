import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { adminApi } from '../api/admin'
import { authApi } from '../api/auth'
import { siteApi } from '../api/site'
import { AppRoutes } from '../App'
import { AuthProvider } from '../auth/AuthProvider'
import { SiteConfigProvider } from '../auth/SiteConfigProvider'
import { ToastProvider } from '../components/ui/toast/ToastProvider'
import { SetupGate } from '../routes/guards'

vi.mock('../api/auth', () => ({
  authApi: { me: vi.fn(), login: vi.fn(), register: vi.fn(), logout: vi.fn(), setup: vi.fn() },
}))
vi.mock('../api/site', () => ({ siteApi: { config: vi.fn(), notices: vi.fn() } }))
vi.mock('../api/admin', () => ({
  adminApi: { stats: vi.fn(), users: vi.fn(), setUserActive: vi.fn(), setUserPassword: vi.fn() },
}))

const ALEX = { id: 9, role: 'admin', display_name: 'Alex', avatar: '🛡️', email: 'alex@example.test' }
const OPEN = { features: { registration: true }, needs_setup: false }

function apiError(status, data) {
  return Object.assign(new Error('Request failed'), { response: { status, data } })
}

/** The whole app, the way App puts it together (with the site's settings and the setup gate). */
function renderApp(path) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <ToastProvider>
        <AuthProvider>
          <SiteConfigProvider>
            <SetupGate>
              <AppRoutes />
            </SetupGate>
          </SiteConfigProvider>
        </AuthProvider>
      </ToastProvider>
    </MemoryRouter>,
  )
}

function signedOut() {
  authApi.me.mockRejectedValue(apiError(401, { error: 'unauthorized' }))
}

const STATS = {
  users: { admin: 1, parent: 12, child: 30 }, inactive_users: 2, families: 9, tasks: 410,
  approved_submissions: 1234, redemptions: 57,
}

function people(items, total = items.length) {
  return { items, total, page: 1, per_page: 25 }
}

const PAT = {
  id: 1, role: 'parent', display_name: 'Pat', email: 'pat@example.test', username: null, is_active: true,
  family_name: 'The Testers', last_login_at: null,
}
const MIA = {
  id: 2, role: 'child', display_name: 'Mia', email: null, username: 'mia', is_active: false,
  family_name: 'The Testers', last_login_at: null,
}

beforeEach(() => {
  vi.resetAllMocks()
  vi.stubGlobal('fetch', vi.fn(() => Promise.resolve({ ok: true, json: () => Promise.resolve({ status: 'ok' }) })))
})

describe('first-run setup', () => {
  it('sends every page to setup on a new site, then makes the admin and opens the Overview', async () => {
    const user = userEvent.setup()
    signedOut()
    siteApi.config.mockResolvedValueOnce({ ...OPEN, needs_setup: true }).mockResolvedValue(OPEN)
    renderApp('/login')

    expect(await screen.findByRole('heading', { name: 'Create the admin account' })).toBeInTheDocument()
    await user.type(screen.getByLabelText('Your name'), 'Alex')
    await user.type(screen.getByLabelText('Admin email'), 'alex@example.test')
    await user.type(screen.getByLabelText('Password'), 'too-short')
    await user.click(screen.getByRole('button', { name: 'Create admin and finish setup' }))
    expect(screen.getByText('Use at least 12 characters.')).toBeInTheDocument()
    expect(authApi.setup).not.toHaveBeenCalled()

    await user.type(screen.getByLabelText('Password'), '-but-now-long')
    await user.type(screen.getByLabelText('Type the password again'), 'too-short-but-now-long')
    authApi.setup.mockResolvedValue({ user: ALEX })
    authApi.me.mockResolvedValue({ user: ALEX, family: null })
    adminApi.stats.mockResolvedValue(STATS)
    await user.click(screen.getByRole('button', { name: 'Create admin and finish setup' }))

    expect(authApi.setup).toHaveBeenCalledWith({ display_name: 'Alex', email: 'alex@example.test',
      password: 'too-short-but-now-long' })
    expect(await screen.findByRole('heading', { name: 'Overview' })).toBeInTheDocument()
    expect(screen.getByText('1,234')).toBeInTheDocument()
  })

  it('a site that is set up sends /setup to sign in', async () => {
    signedOut()
    siteApi.config.mockResolvedValue(OPEN)
    renderApp('/setup')
    expect(await screen.findByRole('heading', { name: 'Sign in' })).toBeInTheDocument()
  })
})

describe('closed sign-ups', () => {
  it('says so instead of showing the form, and the sign-in page stops offering it', async () => {
    signedOut()
    siteApi.config.mockResolvedValue({ ...OPEN, features: { registration: false } })
    const { unmount } = renderApp('/register')
    expect(await screen.findByRole('heading', { name: 'Sign-ups are closed' })).toBeInTheDocument()
    expect(screen.queryByLabelText('Email')).not.toBeInTheDocument()
    unmount()

    renderApp('/login')
    expect(await screen.findByRole('heading', { name: 'Sign in' })).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Create one for your family' })).not.toBeInTheDocument()
  })
})

describe('the admin pages', () => {
  function signedInAdmin() {
    authApi.me.mockResolvedValue({ user: ALEX, family: null })
    siteApi.config.mockResolvedValue(OPEN)
  }

  it("Overview shows the site's totals", async () => {
    signedInAdmin()
    adminApi.stats.mockResolvedValue(STATS)
    renderApp('/dashboard')
    expect(await screen.findByText('410')).toBeInTheDocument()
    expect(screen.getByText('Switched off').previousSibling).toHaveTextContent('2')
    const sidebar = screen.getByRole('complementary', { name: 'Main navigation' })
    expect(within(sidebar).getByRole('link', { name: /Users/ })).toHaveAttribute('href', '/dashboard/admin/users')
  })

  it('Users: search, switch an account off, and set a parent a new password', async () => {
    const user = userEvent.setup()
    signedInAdmin()
    adminApi.users.mockResolvedValue(people([PAT, MIA, { ...ALEX, family_name: null, is_active: true }]))
    renderApp('/dashboard/admin/users')

    const pat = (await screen.findByText('pat@example.test')).closest('tr')
    expect(within(pat).getByText('The Testers')).toBeInTheDocument()
    expect(within(pat).getByText('Never')).toBeInTheDocument()
    const mia = screen.getByText('mia').closest('tr')
    expect(within(mia).getByText('Switched off', { selector: '.pill' })).toBeInTheDocument()
    expect(within(mia).queryByRole('button', { name: /password/ })).not.toBeInTheDocument() // kids: their parents
    const me = screen.getByText('Alex (you)').closest('tr')
    expect(within(me).queryByRole('button', { name: /Switch/ })).not.toBeInTheDocument()

    await user.type(screen.getByLabelText('Search users'), 'pat')
    await vi.waitFor(() => expect(adminApi.users).toHaveBeenLastCalledWith(
      { q: 'pat', role: undefined, status: undefined, page: 1 }, expect.anything()))
    await user.selectOptions(screen.getByLabelText('Role'), 'parent')
    expect(adminApi.users).toHaveBeenLastCalledWith({ q: 'pat', role: 'parent', status: undefined, page: 1 },
      expect.anything())

    adminApi.setUserActive.mockResolvedValue({})
    await user.click(screen.getByRole('button', { name: 'Switch off Pat' }))
    const confirm = within(screen.getByRole('dialog', { name: 'Switch off Pat?' }))
    expect(confirm.getByText(/Nothing is deleted/)).toBeInTheDocument()
    await user.click(confirm.getByRole('button', { name: 'Switch off' }))
    expect(adminApi.setUserActive).toHaveBeenCalledWith(1, false)
    expect(await screen.findByText('Account switched off.')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Set a new password for Pat' }))
    const dialog = within(screen.getByRole('dialog', { name: 'New password for Pat' }))
    await user.type(dialog.getByLabelText('New password'), 'short')
    await user.click(dialog.getByRole('button', { name: 'Save password' }))
    expect(dialog.getByText('Use at least 8 characters.')).toBeInTheDocument()
    adminApi.setUserPassword.mockResolvedValue({})
    await user.type(dialog.getByLabelText('New password'), '-but-longer')
    await user.click(dialog.getByRole('button', { name: 'Save password' }))
    expect(adminApi.setUserPassword).toHaveBeenCalledWith(1, 'short-but-longer')
    expect(await screen.findByText('New password saved for Pat. Give it to them privately.')).toBeInTheDocument()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it("parents can't open the admin pages", async () => {
    authApi.me.mockResolvedValue({ user: { ...PAT, avatar: '🙂' }, family: { id: 1, name: 'The Testers' } })
    siteApi.config.mockResolvedValue(OPEN)
    renderApp('/dashboard/admin/users')
    expect(await screen.findByRole('complementary', { name: 'Main navigation' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Users' })).not.toBeInTheDocument()
    expect(adminApi.users).not.toHaveBeenCalled()
  })
})
