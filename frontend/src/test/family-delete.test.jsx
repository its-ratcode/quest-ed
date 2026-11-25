import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { authApi } from '../api/auth'
import { familyApi } from '../api/family'
import { AppRoutes } from '../App'
import { AuthProvider } from '../auth/AuthProvider'
import { ToastProvider } from '../components/ui/toast/ToastProvider'

vi.mock('../api/auth', () => ({ authApi: { me: vi.fn(), logout: vi.fn() } }))
vi.mock('../api/family', () => ({ familyApi: { get: vi.fn(), deleteFamily: vi.fn() } }))

const PAT = { id: 1, role: 'parent', display_name: 'Pat', avatar: '🙂', email: 'pat@example.test' }
const ROBIN = { id: 4, role: 'parent', display_name: 'Robin', avatar: '🙂', email: 'robin@example.test' }
const MIA = { id: 2, role: 'child', display_name: 'Mia', username: 'mia', avatar: '🦄', points_balance: 32 }
const FAMILY = { id: 1, name: 'The Testers', timezone: 'UTC', invite_code: 'abcd2345' }

function open(user = PAT, members = [PAT, ROBIN, MIA]) {
  authApi.me.mockResolvedValue({ user, family: FAMILY })
  authApi.logout.mockResolvedValue({})
  familyApi.get.mockResolvedValue({ family: FAMILY, members })
  return render(
    <MemoryRouter initialEntries={['/dashboard/family']}>
      <ToastProvider>
        <AuthProvider>
          <AppRoutes />
        </AuthProvider>
      </ToastProvider>
    </MemoryRouter>,
  )
}

beforeEach(() => vi.resetAllMocks())

describe('deleting the family', () => {
  it('asks for the password, says what will go, then signs out', async () => {
    const user = userEvent.setup()
    open()
    const zone = within(await screen.findByRole('region', { name: 'Delete this family' }))
    await user.click(zone.getByRole('button', { name: 'Delete family…' }))
    const dialog = within(screen.getByRole('dialog', { name: 'Delete The Testers for good?' }))
    expect(dialog.getByText(/All 3 accounts in The Testers and everything they made will be deleted, including the other parents’ accounts/))
      .toBeInTheDocument()
    expect(dialog.getByText(/Cancel and use Export/)).toBeInTheDocument()

    familyApi.deleteFamily.mockRejectedValueOnce({
      isAxiosError: true,
      response: { status: 400, data: { message: 'Please check the highlighted fields.', errors: { password: "That password isn't right." } } },
    })
    await user.type(dialog.getByLabelText(/password/i), 'wrong')
    await user.click(dialog.getByRole('button', { name: 'Delete everything' }))
    expect(await dialog.findByText("That password isn't right.")).toBeInTheDocument()

    familyApi.deleteFamily.mockResolvedValue({ message: 'Deleted.' })
    await user.clear(dialog.getByLabelText(/password/i))
    await user.type(dialog.getByLabelText(/password/i), 'parent-pass-123')
    await user.click(dialog.getByRole('button', { name: 'Delete everything' }))
    expect(familyApi.deleteFamily).toHaveBeenLastCalledWith('parent-pass-123')
    expect(await screen.findByText('Your family and all its data have been deleted.')).toBeInTheDocument()
    expect(authApi.logout).toHaveBeenCalled()
    expect(screen.queryByRole('complementary', { name: 'Main navigation' })).not.toBeInTheDocument() // signed out
  })

  it('a family of one says "your account"', async () => {
    const user = userEvent.setup()
    open(PAT, [PAT])
    await user.click(await screen.findByRole('button', { name: 'Delete family…' }))
    expect(screen.getByText(/Your account in The Testers and everything in it will be deleted\./)).toBeInTheDocument()
  })

  it("kids don't see it", async () => {
    open(MIA)
    expect(await screen.findByText('Mia')).toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'Delete this family' })).not.toBeInTheDocument()
  })
})
