import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { authApi } from '../api/auth'
import { AppRoutes } from '../App'
import { AuthProvider } from '../auth/AuthProvider'
import { ToastProvider } from '../components/ui/toast/ToastProvider'

vi.mock('../api/auth', () => ({
  authApi: { me: vi.fn(), updateMe: vi.fn(), changePassword: vi.fn(), logout: vi.fn() },
}))

const PARENT = { id: 1, role: 'parent', display_name: 'Pat', avatar: '🙂', email: 'pat@example.test' }

/** Opens the profile page the way the app does: after the session has loaded. */
function openProfile(user = PARENT) {
  authApi.me.mockResolvedValue({ user, family: { id: 1, name: 'The Testers' } })
  return render(
    <MemoryRouter initialEntries={['/dashboard/profile']}>
      <ToastProvider>
        <AuthProvider>
          <AppRoutes />
        </AuthProvider>
      </ToastProvider>
    </MemoryRouter>,
  )
}

beforeEach(() => vi.resetAllMocks())

describe('profile page', () => {
  it('saves a new name and an emoji typed in by hand', async () => {
    const user = userEvent.setup()
    openProfile()
    const name = await screen.findByLabelText('Display name')
    expect(screen.getByRole('button', { name: 'Save profile' })).toBeDisabled() // nothing changed yet

    await user.clear(name)
    await user.type(name, 'Pat Rivera')
    await user.type(screen.getByLabelText('Your own emoji'), '🦦')
    authApi.updateMe.mockResolvedValue({})
    authApi.me.mockResolvedValue({ user: { ...PARENT, display_name: 'Pat Rivera', avatar: '🦦' }, family: null })
    await user.click(screen.getByRole('button', { name: 'Save profile' }))

    expect(authApi.updateMe).toHaveBeenCalledWith({ display_name: 'Pat Rivera', avatar: '🦦' })
    expect(await screen.findByText('Profile saved.')).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 1, name: 'Pat Rivera' })).toBeInTheDocument()
  })

  it('checks the new password before sending it', async () => {
    const user = userEvent.setup()
    openProfile()
    await user.type(await screen.findByLabelText('Current password'), 'parent-pass-123')
    await user.type(screen.getByLabelText('New password'), 'a-new-pass-1')
    await user.type(screen.getByLabelText('Confirm new password'), 'something-else')
    await user.click(screen.getByRole('button', { name: 'Update password' }))
    expect(screen.getByText("The passwords don't match.")).toBeInTheDocument()
    expect(authApi.changePassword).not.toHaveBeenCalled()
  })

  it('shows a wrong current password next to that field', async () => {
    const user = userEvent.setup()
    openProfile()
    authApi.changePassword.mockRejectedValue(Object.assign(new Error('x'), {
      response: { status: 400, data: { errors: { current_password: 'Your current password is incorrect.' } } },
    }))
    await user.type(await screen.findByLabelText('Current password'), 'wrong')
    await user.type(screen.getByLabelText('New password'), 'a-new-pass-1')
    await user.type(screen.getByLabelText('Confirm new password'), 'a-new-pass-1')
    await user.click(screen.getByRole('button', { name: 'Update password' }))
    expect(await screen.findByLabelText('Current password')).toHaveAccessibleDescription('Your current password is incorrect.')
  })

  it('tells kids to ask a parent instead of showing the password form', async () => {
    openProfile({ id: 2, role: 'child', display_name: 'Mia', avatar: '🦄', username: 'mia' })
    expect(await screen.findByText('Need a new password?')).toBeInTheDocument()
    expect(screen.getByText(/@mia/)).toBeInTheDocument()
    expect(screen.queryByLabelText('Current password')).not.toBeInTheDocument()
  })
})
