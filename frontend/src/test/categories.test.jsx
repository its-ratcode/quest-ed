import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { authApi } from '../api/auth'
import { categoriesApi } from '../api/categories'
import { AppRoutes } from '../App'
import { AuthProvider } from '../auth/AuthProvider'
import { ToastProvider } from '../components/ui/toast/ToastProvider'

vi.mock('../api/auth', () => ({ authApi: { me: vi.fn(), logout: vi.fn() } }))
vi.mock('../api/categories', () => ({
  categoriesApi: { list: vi.fn(), create: vi.fn(), update: vi.fn(), remove: vi.fn(), reorder: vi.fn() },
}))

const PAT = { id: 1, role: 'parent', display_name: 'Pat', avatar: '🙂' }
const cat = (id, key, label, extra = {}) => ({
  id, key, label, icon: 'star', tone: 'mint', position: id, is_active: true, used: 0, ...extra,
})
const CATS = [cat(1, 'chores', 'Chores', { icon: 'broom', used: 3 }), cat(2, 'learning', 'Learning'), cat(3, 'other', 'Other')]

function openCategories(items = CATS, user = PAT) {
  authApi.me.mockResolvedValue({ user, family: { id: 1, name: 'The Testers' } })
  categoriesApi.list.mockResolvedValue({ items })
  return render(
    <MemoryRouter initialEntries={['/dashboard/tasks?view=categories']}>
      <ToastProvider>
        <AuthProvider>
          <AppRoutes />
        </AuthProvider>
      </ToastProvider>
    </MemoryRouter>,
  )
}

beforeEach(() => vi.resetAllMocks())

describe('categories', () => {
  it('lists the family categories with how often each is used', async () => {
    openCategories()
    const list = await screen.findByRole('region', { name: 'Categories' })
    expect(await within(list).findByText('Chores')).toBeInTheDocument()
    expect(within(list).getByText('Used 3 times')).toBeInTheDocument()
    expect(within(list).getAllByText('Not used yet')).toHaveLength(2)
    expect(within(list).getByRole('button', { name: 'Move Chores up' })).toBeDisabled() // already first
  })

  it('adds a category with a picture and colour', async () => {
    const user = userEvent.setup()
    openCategories()
    await user.click(await screen.findByRole('button', { name: 'New category' }))
    const dialog = screen.getByRole('dialog', { name: 'New category' })
    await user.click(within(dialog).getByRole('button', { name: 'Add category' }))
    expect(within(dialog).getByText('Give it a name.')).toBeInTheDocument()

    await user.type(within(dialog).getByLabelText('Name'), 'Music practice')
    await user.click(within(dialog).getByRole('radio', { name: 'music' }))
    await user.click(within(dialog).getByRole('radio', { name: 'sky' }))
    categoriesApi.create.mockResolvedValue({ category: cat(4, 'c123', 'Music practice') })
    await user.click(within(dialog).getByRole('button', { name: 'Add category' }))

    expect(categoriesApi.create).toHaveBeenCalledWith({ label: 'Music practice', icon: 'music', tone: 'sky' })
    expect(await screen.findByText('Category added.')).toBeInTheDocument()
  })

  it('moves a category down, hides one, and confirms before removing', async () => {
    const user = userEvent.setup()
    openCategories()
    categoriesApi.reorder.mockResolvedValue({})
    await user.click(await screen.findByRole('button', { name: 'Move Chores down' }))
    expect(categoriesApi.reorder).toHaveBeenCalledWith([2, 1, 3])

    categoriesApi.update.mockResolvedValue({})
    await user.click(screen.getByRole('button', { name: 'Hide Learning' }))
    expect(categoriesApi.update).toHaveBeenCalledWith(2, { is_active: false })

    await user.click(screen.getByRole('button', { name: 'Remove Chores' }))
    const dialog = screen.getByRole('dialog', { name: 'Remove “Chores”?' })
    expect(within(dialog).getByText(/hidden instead/)).toBeInTheDocument() // it's used, so it's hidden, not deleted
    categoriesApi.remove.mockResolvedValue({ removed: false, hidden: true })
    await user.click(within(dialog).getByRole('button', { name: 'Hide it' }))
    expect(categoriesApi.remove).toHaveBeenCalledWith(1)
    expect(await screen.findByText('Category hidden. Old tasks keep it.')).toBeInTheDocument()
  })

  it("won't hide or remove the last category in use", async () => {
    openCategories([cat(1, 'chores', 'Chores'), cat(2, 'other', 'Other', { is_active: false })])
    expect(await screen.findByRole('button', { name: 'Hide Chores' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Remove Chores' })).toBeDisabled()
    expect(screen.getByText(/hidden from new tasks/)).toBeInTheDocument()
  })

  it('kids see their tasks page without the categories tab', async () => {
    openCategories(CATS, { id: 2, role: 'child', display_name: 'Mia', avatar: '🦄', username: 'mia' })
    expect(await screen.findByRole('heading', { level: 1, name: 'My tasks' })).toBeInTheDocument()
    expect(screen.queryByRole('tab', { name: 'Categories' })).not.toBeInTheDocument()
  })
})
