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
vi.mock('../api/tasks', () => ({
  tasksApi: {
    list: vi.fn(), create: vi.fn(), update: vi.fn(), archive: vi.fn(),
    submit: vi.fn(), submissions: vi.fn(), approve: vi.fn(), reject: vi.fn(),
  },
}))

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

const waiting = (id, title, extra = {}) => ({
  id, status: 'pending', note: '', submitted_at: new Date().toISOString(),
  child: { id: 2, display_name: 'Mia', avatar: '🦄' },
  task: { id: 1, title, category: 'chores', points: 10, due_date: null }, ...extra,
})

function openTasks(path = '/dashboard/tasks', user = PAT, items = [task(1, 'Make your bed')], pending = []) {
  authApi.me.mockResolvedValue({ user, family: { id: 1, name: 'The Testers' } })
  familyApi.get.mockResolvedValue({ family: { id: 1, name: 'The Testers' }, members: [PAT, MIA, LEO] })
  categoriesApi.list.mockResolvedValue({ items: CATS })
  tasksApi.list.mockResolvedValue({ items, total: items.length, page: 1, per_page: 20 })
  tasksApi.submissions.mockResolvedValue({ items: pending })
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
    expect(within(card).queryByRole('button', { name: /Edit|Archive/ })).not.toBeInTheDocument()
    expect(within(card).queryByText('Mia')).not.toBeInTheDocument() // no need to show their own name
    expect(screen.queryByRole('button', { name: '+ New task' })).not.toBeInTheDocument()
  })
})

describe('I did it, and the parent checking it', () => {
  it('a kid sends a task with a note', async () => {
    const user = userEvent.setup()
    openTasks('/dashboard/tasks', { ...MIA, points_balance: 0 })
    await user.click(await screen.findByRole('button', { name: 'I did it: Make your bed' }))
    const dialog = screen.getByRole('dialog', { name: 'Done with “Make your bed”?' })
    expect(within(dialog).getByText(/You get 10 pts once it's approved/)).toBeInTheDocument()
    await user.type(within(dialog).getByLabelText('Note for your parent (optional)'), 'All tidy ')
    tasksApi.submit.mockResolvedValue({ task: task(1, 'Make your bed', { status: 'submitted' }) })
    await user.click(within(dialog).getByRole('button', { name: 'Send' }))

    expect(tasksApi.submit).toHaveBeenCalledWith(1, 'All tidy')
    expect(await screen.findByText('Sent to your parent.')).toBeInTheDocument()
    expect(tasksApi.list).toHaveBeenCalledTimes(2) // the list loads again
  })

  it('a kid sees their points, what is waiting, and why something came back', async () => {
    openTasks('/dashboard/tasks', { ...MIA, points_balance: 25 }, [
      task(1, 'Make your bed', { status: 'submitted' }),
      task(2, 'Read a book', { latest_submission: { status: 'rejected', review_note: 'Finish the chapter' } }),
    ])
    expect(await screen.findByText('25 points')).toBeInTheDocument()
    const sent = await screen.findByRole('article', { name: 'Make your bed' })
    expect(within(sent).getByText('Sent. A parent will check it.')).toBeInTheDocument()
    expect(within(sent).queryByRole('button')).not.toBeInTheDocument()
    const back = screen.getByRole('article', { name: 'Read a book' })
    expect(within(back).getByText('Sent back: Finish the chapter')).toBeInTheDocument()
  })

  it('a parent sees what is waiting on the Overview, with a count in the menu', async () => {
    openTasks('/dashboard', PAT, [], [waiting(5, 'Make your bed', { note: 'All done!' }), waiting(6, 'Feed the cat')])
    expect(await screen.findByText('2 completed tasks to review')).toBeInTheDocument()
    expect(screen.getByText('“All done!”')).toBeInTheDocument()
    expect(await screen.findAllByLabelText('2 waiting')).not.toHaveLength(0)
  })

  it('a parent approves, and the kid gets the points', async () => {
    const user = userEvent.setup()
    openTasks('/dashboard', PAT, [], [waiting(5, 'Make your bed')])
    await user.click(await screen.findByRole('button', { name: 'Approve Make your bed from Mia' }))
    const dialog = screen.getByRole('dialog', { name: 'Approve this task?' })
    await user.type(within(dialog).getByLabelText('Note (optional)'), 'Great job')
    tasksApi.approve.mockResolvedValue({
      submission: waiting(5, 'Make your bed', { status: 'approved', points_awarded: 10 }), balance: 10,
    })
    tasksApi.submissions.mockResolvedValue({ items: [] })
    await user.click(within(dialog).getByRole('button', { name: 'Approve (+10 pts)' }))

    expect(tasksApi.approve).toHaveBeenCalledWith(5, 'Great job')
    expect(await screen.findByText('Approved. Mia got 10 points.')).toBeInTheDocument()
    expect(await screen.findByText('Nothing waiting')).toBeInTheDocument()
    expect(screen.queryByLabelText(/waiting$/)).not.toBeInTheDocument() // the menu count is gone too
  })

  it('a parent sends it back with a note', async () => {
    const user = userEvent.setup()
    openTasks('/dashboard', PAT, [], [waiting(5, 'Make your bed')])
    await user.click(await screen.findByRole('button', { name: 'Send back Make your bed to Mia' }))
    const dialog = screen.getByRole('dialog', { name: 'Send it back?' })
    await user.type(within(dialog).getByLabelText('What still needs doing? (optional)'), 'The pillows')
    tasksApi.reject.mockResolvedValue({ submission: waiting(5, 'Make your bed', { status: 'rejected' }) })
    await user.click(within(dialog).getByRole('button', { name: 'Send back' }))

    expect(tasksApi.reject).toHaveBeenCalledWith(5, 'The pillows')
    expect(await screen.findByText('Sent back with your note.')).toBeInTheDocument()
  })

  it('shows the message when someone else already checked it', async () => {
    const user = userEvent.setup()
    openTasks('/dashboard', PAT, [], [waiting(5, 'Make your bed')])
    await user.click(await screen.findByRole('button', { name: 'Approve Make your bed from Mia' }))
    const dialog = screen.getByRole('dialog', { name: 'Approve this task?' })
    tasksApi.approve.mockRejectedValue({ response: { status: 409, data: { message: 'This has already been checked.' } } })
    await user.click(within(dialog).getByRole('button', { name: 'Approve (+10 pts)' }))
    expect(await within(dialog).findByRole('alert')).toHaveTextContent('This has already been checked.')
  })
})
