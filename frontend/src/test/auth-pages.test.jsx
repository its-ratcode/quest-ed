import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { authApi } from '../api/auth'
import { familyApi } from '../api/family'
import { AppRoutes } from '../App'
import { AuthProvider } from '../auth/AuthProvider'
import { ToastProvider } from '../components/ui/toast/ToastProvider'

vi.mock('../api/auth', () => ({
  authApi: { me: vi.fn(), login: vi.fn(), register: vi.fn(), logout: vi.fn() },
}))
vi.mock('../api/family', () => ({ familyApi: { get: vi.fn() } }))

const ME = { user: { id: 1, role: 'parent', display_name: 'Pat' }, family: { id: 1, name: 'The Testers' } }

function apiError(status, data) {
  return Object.assign(new Error('Request failed'), { response: { status, data } })
}

function renderApp(path) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <ToastProvider>
        <AuthProvider>
          <AppRoutes />
        </AuthProvider>
      </ToastProvider>
    </MemoryRouter>,
  )
}

beforeEach(() => {
  vi.resetAllMocks()
  vi.stubGlobal('fetch', vi.fn(() => Promise.resolve({ ok: true, json: () => Promise.resolve({ status: 'ok' }) })))
})

describe('signing in', () => {
  it('asks for sign-in first, then goes back to the page that was asked for', async () => {
    const user = userEvent.setup()
    authApi.me.mockRejectedValueOnce(apiError(401, { error: 'unauthorized' })).mockResolvedValue(ME)
    authApi.login.mockResolvedValue({ user: ME.user })
    renderApp('/dashboard/more')

    expect(await screen.findByRole('heading', { name: 'Sign in' })).toBeInTheDocument()
    await user.type(screen.getByLabelText('Email or username'), 'pat@example.test')
    await user.type(screen.getByLabelText('Password'), 'parent-pass-123')
    await user.click(screen.getByRole('button', { name: 'Sign in' }))

    expect(authApi.login).toHaveBeenCalledWith('pat@example.test', 'parent-pass-123')
    // Back on the page that was asked for (the menu), not just the overview.
    expect(await screen.findByRole('heading', { name: 'Menu' })).toBeInTheDocument()
  })

  it('checks empty fields before asking the server', async () => {
    const user = userEvent.setup()
    authApi.me.mockRejectedValue(apiError(401, { error: 'unauthorized' }))
    renderApp('/login')
    await user.click(await screen.findByRole('button', { name: 'Sign in' }))
    expect(screen.getByText('Enter your email or username.')).toBeInTheDocument()
    expect(screen.getByText('Enter your password.')).toBeInTheDocument()
    expect(authApi.login).not.toHaveBeenCalled()
  })

  it("shows the server's message when sign-in fails", async () => {
    const user = userEvent.setup()
    authApi.me.mockRejectedValue(apiError(401, { error: 'unauthorized' }))
    authApi.login.mockRejectedValue(apiError(401, { message: 'Incorrect email/username or password.' }))
    renderApp('/login')
    await user.type(await screen.findByLabelText('Email or username'), 'pat@example.test')
    await user.type(screen.getByLabelText('Password'), 'wrong')
    await user.click(screen.getByRole('button', { name: 'Sign in' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Incorrect email/username or password.')
  })

  it('signs out after confirming, and returns to the sign-in page', async () => {
    const user = userEvent.setup()
    authApi.me.mockResolvedValue(ME)
    authApi.logout.mockResolvedValue({})
    renderApp('/dashboard')
    await user.click(await screen.findByRole('button', { name: 'Sign out' }))
    const dialog = screen.getByRole('dialog', { name: 'Sign out?' })
    expect(authApi.logout).not.toHaveBeenCalled()
    await user.click(within(dialog).getByRole('button', { name: 'Sign out' }))
    expect(authApi.logout).toHaveBeenCalled()
    expect(await screen.findByRole('heading', { name: 'Sign in' })).toBeInTheDocument()
  })
})

describe('signing up', () => {
  it('checks the form, then creates the family and opens its page to add the kids', async () => {
    const user = userEvent.setup()
    authApi.me.mockRejectedValueOnce(apiError(401, { error: 'unauthorized' })).mockResolvedValue(ME)
    authApi.register.mockResolvedValue({ user: ME.user })
    familyApi.get.mockResolvedValue({ family: { ...ME.family, invite_code: 'ABCD2345', timezone: 'UTC' }, members: [ME.user] })
    renderApp('/register')

    await user.click(await screen.findByRole('button', { name: 'Create account' }))
    expect(screen.getByText('Tell us your name.')).toBeInTheDocument()
    expect(screen.getByText('Give your family a name.')).toBeInTheDocument()

    await user.type(screen.getByLabelText('Your name'), 'Pat')
    await user.type(screen.getByLabelText('Email'), 'pat@example.test')
    await user.type(screen.getByLabelText('Password'), 'parent-pass-123')
    await user.type(screen.getByLabelText('Family name'), 'The Testers')
    await user.click(screen.getByRole('button', { name: 'Create account' }))

    expect(authApi.register).toHaveBeenCalledWith({
      display_name: 'Pat', email: 'pat@example.test', password: 'parent-pass-123', family_name: 'The Testers',
      timezone: expect.any(String), // the browser's own time zone
    })
    expect(await screen.findByRole('heading', { name: 'The Testers' })).toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: 'Add a child' }).length).toBeGreaterThan(0)
  })

  it('joins an existing family with an invite code', async () => {
    const user = userEvent.setup()
    authApi.me.mockRejectedValueOnce(apiError(401, { error: 'unauthorized' })).mockResolvedValue(ME)
    authApi.register.mockResolvedValue({ user: ME.user })
    renderApp('/register')

    await user.click(await screen.findByRole('tab', { name: 'Join with a code' }))
    expect(screen.queryByLabelText('Family name')).not.toBeInTheDocument()
    await user.type(screen.getByLabelText('Your name'), 'Sam')
    await user.type(screen.getByLabelText('Email'), 'sam@example.test')
    await user.type(screen.getByLabelText('Password'), 'parent-pass-123')
    await user.click(screen.getByRole('button', { name: 'Create account' }))
    expect(screen.getByText('Enter the invite code.')).toBeInTheDocument()

    await user.type(screen.getByLabelText('Invite code'), 'abcd2345')
    await user.click(screen.getByRole('button', { name: 'Create account' }))
    expect(authApi.register).toHaveBeenCalledWith({
      display_name: 'Sam', email: 'sam@example.test', password: 'parent-pass-123', invite_code: 'abcd2345',
    })
    expect(await screen.findByRole('heading', { name: /^Good (morning|afternoon|evening), Pat\.$/ })).toBeInTheDocument()
  })

  it("shows the server's message next to the field it's about", async () => {
    const user = userEvent.setup()
    authApi.me.mockRejectedValue(apiError(401, { error: 'unauthorized' }))
    authApi.register.mockRejectedValue(apiError(400, {
      message: 'Please check the highlighted fields.',
      errors: { email: 'An account with this email already exists.' },
    }))
    renderApp('/register')
    await user.type(await screen.findByLabelText('Your name'), 'Pat')
    await user.type(screen.getByLabelText('Email'), 'pat@example.test')
    await user.type(screen.getByLabelText('Password'), 'parent-pass-123')
    await user.type(screen.getByLabelText('Family name'), 'The Testers')
    await user.click(screen.getByRole('button', { name: 'Create account' }))
    expect(await screen.findByLabelText('Email')).toHaveAccessibleDescription('An account with this email already exists.')
  })
})
