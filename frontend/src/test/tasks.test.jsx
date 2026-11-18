import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { authApi } from '../api/auth'
import { categoriesApi } from '../api/categories'
import { familyApi } from '../api/family'
import { tasksApi } from '../api/tasks'
import { AppRoutes } from '../App'
import { AuthProvider } from '../auth/AuthProvider'
import { ToastProvider } from '../components/ui/toast/ToastProvider'

vi.mock('../api/auth', () => ({ authApi: { me: vi.fn(), logout: vi.fn() } }))
vi.mock('../api/family', () => ({ familyApi: { get: vi.fn() } }))
vi.mock('../api/categories', () => ({ categoriesApi: { list: vi.fn(), create: vi.fn() } }))
vi.mock('../api/tasks', () => ({ tasksApi: { list: vi.fn(), create: vi.fn(), update: vi.fn(), archive: vi.fn() } }))

const PAT = { id: 1, role: 'parent', display_name: 'Pat', avatar: '🙂' }
const MIA = { id: 2, role: 'child', display_name: 'Mia', username: 'mia', avatar: '🦄' }
const LEO = { id: 3, role: 'child', display_name: 'Leo', username: 'leo', avatar: '🦖' }
const CATS = [
  { id: 1, key: 'chores', label: 'Chores', icon: 'broom', tone: 'mint', is_active: true },
  { id: 2, key: 'learning', label: 'Learning', icon: 'pencil', tone: 'lilac', is_active: true },
]
const task = (id, title, extra = {}) => ({
  id, title, description: '', category: 'chores', points: 10, status: 'open', due_date: null,
  assigned_to: { id: 2, display_name: 'Mia', avatar: '🦄' }, ...extra,
})

function openTasks(path = '/dashboard/tasks', user = PAT, items = [task(1, 'Make your bed')]) {
  authApi.me.mockResolvedValue({ user, family: { id: 1, name: 'The Testers' } })
  familyApi.get.mockResolvedValue({ family: { id: 1, name: 'The Testers' }, members: [PAT, MIA, LEO] })
  categoriesApi.list.mockResolvedValue({ items: CATS })
  tasksApi.list.mockResolvedValue({ items, total: items.length, page: 1, per_page: 20 })
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

beforeEach(() => vi.resetAllMocks())

describe('tasks page', () => {
  it('lists tasks with their category, kid, points and status', async () => {
    openTasks()
    const card = await screen.findByRole('article', { name: 'Make your bed' })
    expect(within(card).getByText('To do')).toBeInTheDocument()
    expect(within(card).getByText('Chores')).toBeInTheDocument()
    expect(within(card).getByText('Mia')).toBeInTheDocument()
    expect(within(card).getByText('10 pts')).toBeInTheDocument()
  })

  it('creates one task for several kids', async () => {
    const user = userEvent.setup()
    openTasks()
    await user.click(await screen.findByRole('button', { name: '+ New task' }))
    const dialog = screen.getByRole('dialog', { name: 'New task' })
    await user.type(within(dialog).getByLabelText('What needs doing?'), 'Feed the cat')
    await user.click(within(dialog).getByRole('button', { name: 'Everyone' }))
    await user.click(within(dialog).getByRole('radio', { name: 'Learning' }))
    await user.click(within(dialog).getByRole('button', { name: '20' }))
    tasksApi.create.mockResolvedValue({ task: task(9, 'Feed the cat'), tasks: [task(9, 'Feed the cat'), task(10, 'Feed the cat')] })
    await user.click(within(dialog).getByRole('button', { name: 'Create task' }))

    expect(tasksApi.create).toHaveBeenCalledWith({
      title: 'Feed the cat', description: '', category: 'learning', points: 20, due_date: null, assigned_to_ids: [2, 3],
    })
    expect(await screen.findByText('Task created for 2 kids.')).toBeInTheDocument()
  })

  it('needs a title and someone to do it', async () => {
    const user = userEvent.setup()
    openTasks()
    await user.click(await screen.findByRole('button', { name: '+ New task' }))
    const dialog = screen.getByRole('dialog', { name: 'New task' })
    await user.click(within(dialog).getByRole('button', { name: 'Mia' })) // un-choose the pre-chosen kid
    await user.click(within(dialog).getByRole('button', { name: 'Create task' }))
    expect(within(dialog).getByText('Give the task a title.')).toBeInTheDocument()
    expect(within(dialog).getByText('Choose who this is for.')).toBeInTheDocument()
    expect(tasksApi.create).not.toHaveBeenCalled()
  })

  it('filters by status and searches, keeping the filters in the address', async () => {
    const user = userEvent.setup()
    openTasks()
    await screen.findByRole('article', { name: 'Make your bed' })
    await user.click(screen.getByRole('tab', { name: 'Waiting' }))
    expect(tasksApi.list).toHaveBeenLastCalledWith(expect.objectContaining({ status: 'submitted', page: 1 }), expect.anything())
    await user.type(screen.getByLabelText('Search tasks'), 'bed')
    await vi.waitFor(() => expect(tasksApi.list).toHaveBeenLastCalledWith(
      expect.objectContaining({ status: 'submitted', q: 'bed' }), expect.anything()))
  })

  it('edits and archives after confirming', async () => {
    const user = userEvent.setup()
    openTasks()
    await user.click(await screen.findByRole('button', { name: 'Edit Make your bed' }))
    const dialog = screen.getByRole('dialog', { name: 'Edit task' })
    await user.clear(within(dialog).getByLabelText('Points'))
    await user.type(within(dialog).getByLabelText('Points'), '15')
    tasksApi.update.mockResolvedValue({ task: task(1, 'Make your bed', { points: 15 }) })
    await user.click(within(dialog).getByRole('button', { name: 'Save changes' }))
    expect(tasksApi.update).toHaveBeenCalledWith(1, expect.objectContaining({ points: 15, assigned_to_id: 2 }))

    await user.click(screen.getByRole('button', { name: 'Archive Make your bed' }))
    tasksApi.archive.mockResolvedValue({})
    await user.click(within(screen.getByRole('dialog', { name: /Archive/ })).getByRole('button', { name: 'Archive' }))
    expect(tasksApi.archive).toHaveBeenCalledWith(1)
    expect(await screen.findByText('Task archived.')).toBeInTheDocument()
  })

  it('kids see their tasks without editing buttons', async () => {
    openTasks('/dashboard/tasks', MIA)
    const card = await screen.findByRole('article', { name: 'Make your bed' })
    expect(within(card).queryByRole('button')).not.toBeInTheDocument()
    expect(within(card).queryByText('Mia')).not.toBeInTheDocument() // no need to show their own name
    expect(screen.queryByRole('button', { name: '+ New task' })).not.toBeInTheDocument()
  })
})
