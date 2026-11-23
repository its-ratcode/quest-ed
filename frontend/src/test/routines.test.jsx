import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { authApi } from '../api/auth'
import { categoriesApi } from '../api/categories'
import { familyApi } from '../api/family'
import { routinesApi } from '../api/routines'
import { tasksApi } from '../api/tasks'
import { AppRoutes } from '../App'
import { AuthProvider } from '../auth/AuthProvider'
import { ToastProvider } from '../components/ui/toast/ToastProvider'
import { describeWeekdays } from '../features/tasks/weekdays'

vi.mock('../api/auth', () => ({ authApi: { me: vi.fn(), logout: vi.fn() } }))
vi.mock('../api/family', () => ({ familyApi: { get: vi.fn() } }))
vi.mock('../api/categories', () => ({ categoriesApi: { list: vi.fn() } }))
vi.mock('../api/tasks', () => ({
  tasksApi: { list: vi.fn(), create: vi.fn(), update: vi.fn(), archive: vi.fn(), submissions: vi.fn() },
}))
vi.mock('../api/routines', () => ({
  routinesApi: { list: vi.fn(), create: vi.fn(), update: vi.fn(), remove: vi.fn() },
}))

const PAT = { id: 1, role: 'parent', display_name: 'Pat', avatar: '🙂' }
const MIA = { id: 2, role: 'child', display_name: 'Mia', username: 'mia', avatar: '🦄' }
const LEO = { id: 3, role: 'child', display_name: 'Leo', username: 'leo', avatar: '🦖' }
const CATS = [{ id: 1, key: 'chores', label: 'Chores', icon: 'broom', tone: 'mint', is_active: true }]
const routine = (id, title, extra = {}) => ({
  id, title, description: '', category: 'chores', points: 5, weekdays: [0, 1, 2, 3, 4, 5, 6], status: 'active',
  assigned_to: { id: 2, display_name: 'Mia', avatar: '🦄' }, ...extra,
})
const today = new Date()
const isoDay = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`
const copy = (id, title, extra = {}) => ({
  id, title, description: '', category: 'chores', points: 5, status: 'open', due_date: isoDay,
  occurrence_date: isoDay, routine: { id: 1, weekdays: [0, 1, 2, 3, 4, 5, 6] },
  assigned_to: { id: 2, display_name: 'Mia', avatar: '🦄' }, ...extra,
})

function open(path, { user = PAT, routines = [], tasks = [] } = {}) {
  authApi.me.mockResolvedValue({ user, family: { id: 1, name: 'The Testers' } })
  familyApi.get.mockResolvedValue({ family: { id: 1, name: 'The Testers' }, members: [PAT, MIA, LEO] })
  categoriesApi.list.mockResolvedValue({ items: CATS })
  tasksApi.list.mockResolvedValue({ items: tasks, total: tasks.length, page: 1, per_page: 20 })
  tasksApi.submissions.mockResolvedValue({ items: [] })
  routinesApi.list.mockResolvedValue({ items: routines })
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

describe('routines (parents)', () => {
  it('lists routines with their days and kid, and counts them on the tab', async () => {
    open('/dashboard/tasks?view=routines', {
      routines: [routine(1, 'Make your bed'), routine(2, 'Piano', { weekdays: [0, 2], status: 'paused' })],
    })
    const bed = await screen.findByRole('article', { name: 'Make your bed' })
    expect(within(bed).getByText('Every day')).toBeInTheDocument()
    expect(within(bed).getByText('Mia')).toBeInTheDocument()
    const piano = screen.getByRole('article', { name: 'Piano' })
    expect(within(piano).getByText('Mon, Wed')).toBeInTheDocument()
    expect(within(piano).getByText('Paused')).toBeInTheDocument()
    expect(within(piano).getByRole('button', { name: 'Resume Piano' })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'Routines (2)' })).toHaveAttribute('aria-selected', 'true')
  })

  it('creates a routine for several kids on school days', async () => {
    const user = userEvent.setup()
    open('/dashboard/tasks?view=routines')
    await user.click(await screen.findByRole('button', { name: 'Create a routine' }))
    const dialog = screen.getByRole('dialog', { name: 'New task' })
    expect(within(dialog).getByRole('radio', { name: 'Repeats' })).toHaveAttribute('aria-checked', 'true')
    expect(within(dialog).queryByLabelText('Due date (optional)')).not.toBeInTheDocument()
    await user.type(within(dialog).getByLabelText('What needs doing?'), 'Brush teeth')
    await user.click(within(dialog).getByRole('button', { name: 'School days' }))
    expect(within(dialog).getByRole('button', { name: 'Saturday' })).toHaveAttribute('aria-pressed', 'false')
    await user.click(within(dialog).getByRole('button', { name: 'Everyone' }))
    routinesApi.create.mockResolvedValue({ routine: routine(5, 'Brush teeth'), routines: [routine(5, 'x'), routine(6, 'x')] })
    routinesApi.list.mockResolvedValue({ items: [routine(5, 'Brush teeth', { weekdays: [0, 1, 2, 3, 4] })] })
    await user.click(within(dialog).getByRole('button', { name: 'Create routine' }))

    expect(routinesApi.create).toHaveBeenCalledWith({
      title: 'Brush teeth', description: '', category: 'chores', points: 5, weekdays: [0, 1, 2, 3, 4],
      assigned_to_ids: [2, 3],
    })
    expect(await screen.findByText('Routine created for 2 kids.')).toBeInTheDocument()
    expect(within(await screen.findByRole('article', { name: 'Brush teeth' })).getByText('School days')).toBeInTheDocument()
  })

  it('a task can be made to repeat, and needs at least one day', async () => {
    const user = userEvent.setup()
    open('/dashboard/tasks')
    await user.click(await screen.findByRole('button', { name: '+ New task' }))
    const dialog = screen.getByRole('dialog', { name: 'New task' })
    await user.click(within(dialog).getByRole('radio', { name: 'Repeats' }))
    await user.type(within(dialog).getByLabelText('What needs doing?'), 'Feed the cat')
    for (const day of ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']) {
      await user.click(within(dialog).getByRole('button', { name: day }))
    }
    await user.click(within(dialog).getByRole('button', { name: 'Create routine' }))
    expect(within(dialog).getByText('Pick at least one day.')).toBeInTheDocument()
    expect(routinesApi.create).not.toHaveBeenCalled()

    await user.click(within(dialog).getByRole('button', { name: 'Saturday' }))
    routinesApi.create.mockResolvedValue({ routine: routine(5, 'Feed the cat'), routines: [routine(5, 'Feed the cat')] })
    await user.click(within(dialog).getByRole('button', { name: 'Create routine' }))
    expect(routinesApi.create).toHaveBeenCalledWith(expect.objectContaining({ weekdays: [5], assigned_to_ids: [2] }))
    expect(await screen.findByText('Routine created.')).toBeInTheDocument()
    expect(tasksApi.create).not.toHaveBeenCalled()
  })

  it('edits a routine', async () => {
    const user = userEvent.setup()
    open('/dashboard/tasks?view=routines', { routines: [routine(1, 'Piano', { weekdays: [0, 2] })] })
    await user.click(await screen.findByRole('button', { name: 'Edit Piano' }))
    const dialog = screen.getByRole('dialog', { name: 'Edit routine' })
    expect(within(dialog).queryByRole('radiogroup', { name: 'How often' })).not.toBeInTheDocument()
    expect(within(dialog).getByRole('button', { name: 'Wednesday' })).toHaveAttribute('aria-pressed', 'true')
    await user.click(within(dialog).getByRole('button', { name: 'Friday' }))
    await user.selectOptions(within(dialog).getByLabelText('For'), '3')
    routinesApi.update.mockResolvedValue({ routine: routine(1, 'Piano') })
    await user.click(within(dialog).getByRole('button', { name: 'Save changes' }))
    expect(routinesApi.update).toHaveBeenCalledWith(1, {
      title: 'Piano', description: '', category: 'chores', points: 5, weekdays: [0, 2, 4], assigned_to_id: 3,
    })
    expect(await screen.findByText('Routine saved.')).toBeInTheDocument()
  })

  it('pauses, resumes and deletes after confirming', async () => {
    const user = userEvent.setup()
    open('/dashboard/tasks?view=routines', { routines: [routine(1, 'Make your bed'), routine(2, 'Piano', { status: 'paused' })] })
    routinesApi.update.mockResolvedValue({ routine: {} })
    await user.click(await screen.findByRole('button', { name: 'Pause Make your bed' }))
    expect(routinesApi.update).toHaveBeenCalledWith(1, { status: 'paused' })
    expect(await screen.findByText('“Make your bed” paused.')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Resume Piano' }))
    expect(routinesApi.update).toHaveBeenCalledWith(2, { status: 'active' })

    routinesApi.remove.mockResolvedValue({ routine: {} })
    await user.click(screen.getByRole('button', { name: 'Delete Piano' }))
    const dialog = screen.getByRole('dialog', { name: 'Delete “Piano”?' })
    await user.click(within(dialog).getByRole('button', { name: 'Delete routine' }))
    expect(routinesApi.remove).toHaveBeenCalledWith(2)
    expect(await screen.findByText('Routine deleted.')).toBeInTheDocument()
  })
})

describe("a routine's daily tasks", () => {
  it('say which days they repeat on, without a "Due today" label', async () => {
    open('/dashboard/tasks', { user: MIA, tasks: [copy(7, 'Make your bed')] })
    const card = await screen.findByRole('article', { name: 'Make your bed' })
    expect(within(card).getByText('Repeats every day')).toBeInTheDocument()
    expect(within(card).queryByText('Due today')).not.toBeInTheDocument()
    expect(routinesApi.list).not.toHaveBeenCalled() // kids have no routines tab
  })

  it("editing one copy says it only changes today's", async () => {
    const user = userEvent.setup()
    open('/dashboard/tasks', { tasks: [copy(7, 'Make your bed')] })
    await user.click(await screen.findByRole('button', { name: 'Edit Make your bed' }))
    const dialog = screen.getByRole('dialog', { name: 'Edit task' })
    expect(within(dialog).getByText("This only changes today's copy. To change the other days, edit the routine.")).toBeInTheDocument()
  })

  it('parents find the ones whose day ended under "Day ended"', async () => {
    const user = userEvent.setup()
    open('/dashboard/tasks', { tasks: [] })
    await user.click(await screen.findByRole('tab', { name: 'Day ended' }))
    expect(tasksApi.list).toHaveBeenLastCalledWith(expect.objectContaining({ status: 'expired' }), expect.anything())
    expect(await screen.findByText("Routine tasks that weren't done on their day end up here. It's just a record."))
      .toBeInTheDocument()
  })
})

describe('describeWeekdays', () => {
  it('names common sets of days, and lists the rest', () => {
    expect(describeWeekdays([6, 5])).toBe('Weekends')
    expect(describeWeekdays([4, 0, 1, 2, 3])).toBe('School days')
    expect(describeWeekdays([0, 1, 2, 3, 4, 5, 6])).toBe('Every day')
    expect(describeWeekdays([4, 0, 2])).toBe('Mon, Wed, Fri')
  })
})
