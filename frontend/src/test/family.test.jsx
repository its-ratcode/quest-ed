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
vi.mock('../api/family', () => ({
  familyApi: { get: vi.fn(), createChild: vi.fn(), updateChild: vi.fn(), removeChild: vi.fn() },
}))

const PAT = { id: 1, role: 'parent', display_name: 'Pat Rivera', avatar: '🙂' }
const MIA = { id: 2, role: 'child', display_name: 'Mia', username: 'mia', avatar: '🦄' }
const FAMILY = { id: 1, name: 'The Riveras', invite_code: 'ABCD2345' }

function openFamily(members = [PAT, MIA]) {
  authApi.me.mockResolvedValue({ user: PAT, family: FAMILY })
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

describe('family page', () => {
  it('lists the kids and the parents', async () => {
    openFamily()
    expect(await screen.findByRole('heading', { level: 1, name: 'The Riveras' })).toBeInTheDocument()
    const kids = screen.getByRole('region', { name: 'Kids' })
    expect(within(kids).getByText('Mia')).toBeInTheDocument()
    expect(within(kids).getByText('@mia')).toBeInTheDocument()
    const parents = screen.getByRole('region', { name: 'Parents' })
    expect(within(parents).getByText('Pat Rivera (you)')).toBeInTheDocument()
  })

  it('adds a child after checking the form', async () => {
    const user = userEvent.setup()
    openFamily([PAT])
    expect(await screen.findByText('No kids added yet')).toBeInTheDocument()
    await user.click(screen.getAllByRole('button', { name: 'Add a child' })[0])
    const dialog = screen.getByRole('dialog', { name: 'Add a child' })

    await user.click(within(dialog).getByRole('button', { name: 'Create account' }))
    expect(within(dialog).getByText("Enter your child's name.")).toBeInTheDocument()
    expect(familyApi.createChild).not.toHaveBeenCalled()

    await user.type(within(dialog).getByLabelText('Name'), 'Leo')
    await user.type(within(dialog).getByLabelText('Username'), 'Leo.R')
    await user.type(within(dialog).getByLabelText('Password'), 'kidpass1')
    familyApi.createChild.mockResolvedValue({ child: { id: 3, display_name: 'Leo', username: 'leo.r' } })
    await user.click(within(dialog).getByRole('button', { name: 'Create account' }))

    expect(familyApi.createChild).toHaveBeenCalledWith({
      display_name: 'Leo', username: 'leo.r', password: 'kidpass1', avatar: '🦊',
    })
    expect(await screen.findByText('Leo can now sign in as “leo.r”.')).toBeInTheDocument()
    expect(familyApi.get).toHaveBeenCalledTimes(2) // the list reloads
  })

  it('edits a kid; a blank password keeps the old one', async () => {
    const user = userEvent.setup()
    openFamily()
    await user.click(await screen.findByRole('button', { name: 'Edit Mia' }))
    const dialog = screen.getByRole('dialog', { name: 'Edit Mia' })
    const name = within(dialog).getByLabelText('Name')
    await user.clear(name)
    await user.type(name, 'Mia R.')
    familyApi.updateChild.mockResolvedValue({ child: { ...MIA, display_name: 'Mia R.' } })
    await user.click(within(dialog).getByRole('button', { name: 'Save changes' }))
    expect(familyApi.updateChild).toHaveBeenCalledWith(2, { display_name: 'Mia R.', avatar: '🦄' })
    expect(await screen.findByText('Mia R. is updated.')).toBeInTheDocument()
  })

  it('removes a kid only with the right password', async () => {
    const user = userEvent.setup()
    openFamily()
    await user.click(await screen.findByRole('button', { name: 'Edit Mia' }))
    await user.click(screen.getByRole('button', { name: 'Remove Mia…' }))
    const dialog = screen.getByRole('dialog', { name: 'Remove Mia?' })
    expect(within(dialog).getByRole('button', { name: 'Remove for good' })).toBeDisabled()

    familyApi.removeChild.mockRejectedValueOnce(Object.assign(new Error('x'), {
      response: { status: 400, data: { errors: { password: "That password isn't right." } } },
    }))
    await user.type(within(dialog).getByLabelText('Your password, to confirm'), 'wrong')
    await user.click(within(dialog).getByRole('button', { name: 'Remove for good' }))
    expect(await within(dialog).findByText("That password isn't right.")).toBeInTheDocument()

    familyApi.removeChild.mockResolvedValue({ message: 'Removed.' })
    const field = within(dialog).getByLabelText('Your password, to confirm')
    await user.clear(field)
    await user.type(field, 'parent-pass-123')
    await user.click(within(dialog).getByRole('button', { name: 'Remove for good' }))
    expect(familyApi.removeChild).toHaveBeenLastCalledWith(2, 'parent-pass-123')
    expect(await screen.findByText('Mia was removed.')).toBeInTheDocument()
  })
})
