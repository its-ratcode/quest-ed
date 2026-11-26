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
  adminApi: {
    stats: vi.fn(), users: vi.fn(), setUserActive: vi.fn(), setUserPassword: vi.fn(), settings: vi.fn(),
    saveSettings: vi.fn(), auditLogs: vi.fn(), notices: vi.fn(), createNotice: vi.fn(), removeNotice: vi.fn(),
  },
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
  siteApi.notices.mockResolvedValue({ items: [] })
  localStorage.clear()
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

  it('Site settings: flipping a switch saves it straight away', async () => {
    const user = userEvent.setup()
    signedInAdmin()
    adminApi.settings.mockResolvedValue({ features: { registration: true }, labels: { registration: 'New parent sign-ups' } })
    renderApp('/dashboard/admin/settings')

    const toggle = await screen.findByRole('switch', { name: 'New parent sign-ups' })
    expect(toggle).toHaveAttribute('aria-checked', 'true')
    expect(toggle).toHaveAccessibleDescription(/Existing families are not affected/)
    adminApi.saveSettings.mockResolvedValue({ features: { registration: false }, labels: { registration: 'New parent sign-ups' } })
    const configCalls = siteApi.config.mock.calls.length
    await user.click(toggle)

    expect(adminApi.saveSettings).toHaveBeenCalledWith({ registration: false })
    expect(await screen.findByText('New parent sign-ups: off.')).toBeInTheDocument()
    expect(toggle).toHaveAttribute('aria-checked', 'false')
    expect(siteApi.config.mock.calls.length).toBeGreaterThan(configCalls) // the app learns sign-ups are closed
  })

  it('Notices: post one, see what each is doing, and take one down', async () => {
    const user = userEvent.setup()
    signedInAdmin()
    const showing = { id: 3, message: 'Back up at 9', level: 'warning', audience: 'parents', is_active: true,
      expires_at: null, created_at: '2026-11-20T10:00:00Z' }
    const ended = { ...showing, id: 2, message: 'Old news', expires_at: '2026-01-01T23:59:59Z' }
    const removed = { ...showing, id: 1, message: 'Gone', is_active: false }
    adminApi.notices.mockResolvedValue({ items: [showing, ended, removed] })
    renderApp('/dashboard/admin/notices')

    const row = (text) => screen.getByText(text).closest('li')
    expect(await screen.findByText('Back up at 9')).toBeInTheDocument()
    expect(within(row('Back up at 9')).getByText('Showing')).toBeInTheDocument()
    expect(within(row('Back up at 9')).getByText(/Parents · Important/)).toBeInTheDocument()
    expect(within(row('Old news')).getByText('Ended')).toBeInTheDocument()
    expect(within(row('Gone')).getByText('Taken down')).toBeInTheDocument()
    expect(within(row('Gone')).queryByRole('button')).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '+ Add notice' }))
    const form = within(screen.getByRole('dialog', { name: 'Add notice' }))
    await user.click(form.getByRole('button', { name: 'Post notice' }))
    expect(form.getByText('Write a message.')).toBeInTheDocument()
    adminApi.createNotice.mockResolvedValue({})
    await user.type(form.getByLabelText('Message'), '  Quiz night on Friday  ')
    await user.selectOptions(form.getByLabelText('Who sees it'), 'children')
    await user.click(form.getByRole('button', { name: 'Post notice' }))
    expect(adminApi.createNotice).toHaveBeenCalledWith({ message: 'Quiz night on Friday', audience: 'children',
      level: 'info', expires_on: null })
    expect(await screen.findByText('Notice posted.')).toBeInTheDocument()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()

    adminApi.removeNotice.mockResolvedValue({})
    await user.click(screen.getByRole('button', { name: 'Take down: Back up at 9' }))
    await user.click(within(screen.getByRole('dialog', { name: 'Take this notice down?' }))
      .getByRole('button', { name: 'Take down' }))
    expect(adminApi.removeNotice).toHaveBeenCalledWith(3)
    expect(await screen.findByText('Notice taken down.')).toBeInTheDocument()
  })

  it('Audit log: what happened, who did it, and a filter', async () => {
    const user = userEvent.setup()
    signedInAdmin()
    adminApi.auditLogs.mockResolvedValue({
      items: [
        { id: 2, action: 'settings.changed', actor: { id: 9, display_name: 'Alex', role: 'admin' },
          target_type: null, target_id: null, details: { registration: false }, created_at: '2026-11-20T10:00:00Z' },
        { id: 1, action: 'task.approved', actor: null, target_type: 'task', target_id: 7,
          details: { child_id: 2, points: 10 }, created_at: '2026-11-19T10:00:00Z' },
      ],
      total: 2, page: 1, per_page: 25,
    })
    renderApp('/dashboard/admin/audit')

    const changed = (await screen.findByText('Changed site settings')).closest('tr')
    expect(within(changed).getByText('registration: off')).toBeInTheDocument()
    expect(within(changed).getByText('Alex (admin)')).toBeInTheDocument()
    const approved = screen.getByText('Approved a task').closest('tr')
    expect(within(approved).getByText('task #7 · child id: 2 · points: 10')).toBeInTheDocument()
    expect(within(approved).getByText('A deleted account')).toBeInTheDocument()

    await user.selectOptions(screen.getByLabelText('Show'), 'task.')
    expect(adminApi.auditLogs).toHaveBeenLastCalledWith({ action: 'task.', page: 1 }, expect.anything())
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

describe('the notice banner', () => {
  it('shows the notices to a signed-in parent, and a dismissed one stays hidden on this device', async () => {
    const user = userEvent.setup()
    authApi.me.mockResolvedValue({ user: { ...PAT, avatar: '🙂' }, family: { id: 1, name: 'The Testers' } })
    siteApi.config.mockResolvedValue(OPEN)
    siteApi.notices.mockResolvedValue({ items: [
      { id: 5, message: 'Down for updates tonight', level: 'warning' },
      { id: 4, message: 'New badges are here', level: 'info' },
    ] })
    const { unmount } = renderApp('/dashboard/profile')

    const warning = await screen.findByText('Down for updates tonight')
    expect(warning.closest('.alert-soft')).toHaveClass('warn')
    expect(screen.getByText('New badges are here').closest('.alert-soft')).toHaveClass('info')
    await user.click(within(warning.closest('.alert-soft')).getByRole('button', { name: 'Dismiss this notice' }))
    expect(screen.queryByText('Down for updates tonight')).not.toBeInTheDocument()
    unmount()

    renderApp('/dashboard/profile')
    expect(await screen.findByText('New badges are here')).toBeInTheDocument()
    expect(screen.queryByText('Down for updates tonight')).not.toBeInTheDocument()
  })
})
