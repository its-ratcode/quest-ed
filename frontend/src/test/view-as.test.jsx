import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { authApi } from '../api/auth'
import { AppRoutes } from '../App'
import { AuthProvider } from '../auth/AuthProvider'
import { ToastProvider } from '../components/ui/toast/ToastProvider'

vi.mock('../api/auth', () => ({ authApi: { me: vi.fn(), logout: vi.fn(), switchBack: vi.fn() } }))

const PAT = { id: 1, role: 'parent', display_name: 'Pat Tester', avatar: '🙂', email: 'pat@example.test' }
const MIA = { id: 2, role: 'child', display_name: 'Mia', username: 'mia', avatar: '🦄', points_balance: 32 }
const FAMILY = { id: 1, name: 'The Testers' }

function open(me) {
  authApi.me.mockResolvedValue(me)
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

beforeEach(() => {
  vi.resetAllMocks()
  vi.stubGlobal('fetch', vi.fn(() => Promise.resolve({ ok: true, json: () => Promise.resolve({ status: 'ok' }) })))
})

function apiError(status, data) {
  return Object.assign(new Error('Request failed'), { response: { status, data } })
}

describe("a parent using a kid's account", () => {
  it('shows whose account it is, and switching back needs the parent password', async () => {
    const user = userEvent.setup()
    open({ user: MIA, family: FAMILY, acting_parent: { id: 1, display_name: 'Pat Tester', avatar: '🙂' } })

    expect(await screen.findByText(/Anything you do here is done as Mia/)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Back to Pat' }))
    const dialog = within(screen.getByRole('dialog', { name: 'Back to Pat' }))
    expect(dialog.getByRole('button', { name: 'Switch back' })).toBeDisabled() // nothing typed yet

    authApi.switchBack.mockRejectedValueOnce(apiError(400, { errors: { password: "That password isn't right." } }))
    await user.type(dialog.getByLabelText("Pat's password"), 'guess')
    await user.click(dialog.getByRole('button', { name: 'Switch back' }))
    expect(await dialog.findByText("That password isn't right.")).toBeInTheDocument()

    authApi.switchBack.mockResolvedValue({ user: PAT })
    authApi.me.mockResolvedValue({ user: PAT, family: FAMILY, acting_parent: null })
    await user.clear(dialog.getByLabelText("Pat's password"))
    await user.type(dialog.getByLabelText("Pat's password"), 'parent-pass-123')
    await user.click(dialog.getByRole('button', { name: 'Switch back' }))
    expect(authApi.switchBack).toHaveBeenLastCalledWith('parent-pass-123')
    expect(await screen.findByText('Welcome back, Pat.')).toBeInTheDocument()
    expect(screen.queryByText(/Anything you do here is done as Mia/)).not.toBeInTheDocument()
  })

  it('a kid signed in normally sees no banner', async () => {
    open({ user: MIA, family: FAMILY, acting_parent: null })
    expect(await screen.findByRole('complementary', { name: 'Main navigation' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Back to/ })).not.toBeInTheDocument()
  })
})
