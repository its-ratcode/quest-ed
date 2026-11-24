import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { authApi } from '../api/auth'
import { categoriesApi } from '../api/categories'
import { dashboardApi } from '../api/dashboard'
import { familyApi } from '../api/family'
import { rewardsApi } from '../api/rewards'
import { routinesApi } from '../api/routines'
import { tasksApi } from '../api/tasks'
import { AppRoutes } from '../App'
import { AuthProvider } from '../auth/AuthProvider'
import { ToastProvider } from '../components/ui/toast/ToastProvider'
import { currentWeek, todayIso } from '../features/dashboard/week'

vi.mock('../api/auth', () => ({ authApi: { me: vi.fn(), logout: vi.fn() } }))
vi.mock('../api/categories', () => ({ categoriesApi: { list: vi.fn() } }))
vi.mock('../api/dashboard', () => ({ dashboardApi: { summary: vi.fn() } }))
vi.mock('../api/family', () => ({ familyApi: { get: vi.fn() } }))
vi.mock('../api/routines', () => ({ routinesApi: { list: vi.fn() } }))
vi.mock('../api/rewards', () => ({ rewardsApi: { fulfill: vi.fn(), redemptions: vi.fn() } }))
vi.mock('../api/tasks', () => ({
  tasksApi: {
    list: vi.fn(), submissions: vi.fn(), approve: vi.fn(),
    photoUrl: (id) => `/api/v1/tasks/submissions/${id}/photo`,
  },
}))

const PAT = { id: 1, role: 'parent', display_name: 'Pat Jones', avatar: '🙂' }
const MIA = { id: 2, role: 'child', display_name: 'Mia', username: 'mia', avatar: '🦄', points_balance: 35 }
const LEO = { id: 3, role: 'child', display_name: 'Leo', username: 'leo', avatar: '🦖', points_balance: 4 }
const CATS = [{ id: 1, key: 'chores', label: 'Chores', icon: 'broom', tone: 'mint', is_active: true }]
const today = todayIso()
const summary = (extra = {}) => ({
  role: 'parent',
  children: [
    { ...MIA, open_tasks: 1, today_total: 2, today_done: 1 },
    { ...LEO, open_tasks: 0, today_total: 0, today_done: 0 },
  ],
  pending_submissions: [], pending_submissions_total: 0,
  pending_redemptions: [{ id: 9, reward_title: 'Ice cream', reward_emoji: '🍦', cost: 8, child: { id: 2, display_name: 'Mia' },
    created_at: new Date().toISOString() }],
  recent_activity: [
    { id: 2, amount: -8, description: 'Bought: Ice cream', child: { id: 2, display_name: 'Mia' }, created_at: new Date().toISOString() },
    { id: 1, amount: 10, description: 'Completed: Tidy up', child: { id: 2, display_name: 'Mia' }, created_at: new Date().toISOString() },
  ],
  approved_this_week: 1,
  ...extra,
})
const task = (id, title, extra = {}) => ({
  id, title, description: '', category: 'chores', points: 10, status: 'open', due_date: null, occurrence_date: null,
  routine: null, assigned_to: { id: 3, display_name: 'Leo', avatar: '🦖' }, latest_submission: null, ...extra,
})
const waiting = (id, title) => ({
  id, status: 'pending', note: '', submitted_at: new Date().toISOString(), has_photo: false,
  child: { id: 2, display_name: 'Mia', avatar: '🦄' },
  task: { id: 1, title, category: 'chores', points: 10, due_date: null },
})

function open(path, { data = summary(), tasks = [], pending = [] } = {}) {
  authApi.me.mockResolvedValue({ user: PAT, family: { id: 1, name: 'The Testers' } })
  categoriesApi.list.mockResolvedValue({ items: CATS })
  familyApi.get.mockResolvedValue({ family: { id: 1, name: 'The Testers' }, members: [PAT, MIA, LEO] })
  routinesApi.list.mockResolvedValue({ items: [] })
  rewardsApi.redemptions.mockResolvedValue({ items: [], total: data.pending_redemptions.length })
  dashboardApi.summary.mockResolvedValue(data)
  tasksApi.list.mockResolvedValue({ items: tasks, total: tasks.length, page: 1, per_page: 20 })
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

describe("a parent's Overview", () => {
  it('greets the parent and shows each kid today', async () => {
    open('/dashboard')
    expect(await screen.findByRole('heading', { level: 1, name: /^Good (morning|afternoon|evening), Pat\.$/ })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'New task' })).toHaveAttribute('href', '/dashboard/tasks?new=1')

    const kids = within(await screen.findByRole('region', { name: 'Your kids today' }))
    expect(kids.getByText('1 of 2 approved today')).toBeInTheDocument()
    expect(kids.getByText('Nothing due today')).toBeInTheDocument()
    expect(kids.getByText('35 pts')).toBeInTheDocument()
    expect(kids.getByRole('progressbar', { name: 'Mia: 1 of 2 approved today (50%)' })).toBeInTheDocument()
    expect(kids.getByRole('link', { name: 'Leo' })).toHaveAttribute('href', '/dashboard/family/kids/3')
  })

  it('shows recent points with their reasons, and one-off tasks due this week', async () => {
    open('/dashboard', {
      tasks: [
        task(1, 'Homework', { due_date: today }),
        task(2, 'Brush teeth', { due_date: today, occurrence_date: today, routine: { id: 1, weekdays: [0] } }),
        task(3, 'Done already', { due_date: today, status: 'approved' }),
      ],
    })
    const recent = within(await screen.findByRole('region', { name: 'Recent points' }))
    expect(recent.getByText('Bought: Ice cream')).toBeInTheDocument()
    expect(recent.getByText('−8')).toBeInTheDocument()
    expect(recent.getByText('+10')).toBeInTheDocument()

    const week = within(screen.getByRole('region', { name: 'Due this week' }))
    expect(await week.findByText('Homework')).toBeInTheDocument()
    expect(week.queryByText('Brush teeth')).not.toBeInTheDocument() // routines repeat on their own
    expect(week.queryByText('Done already')).not.toBeInTheDocument()
    expect(week.getByText(currentWeek().find((d) => d.isToday).label)).toBeInTheDocument()
    expect(tasksApi.list).toHaveBeenCalledWith({ status: 'all', since: currentWeek()[0].iso }, expect.anything())
  })

  it('hands over a reward with "Given"', async () => {
    const user = userEvent.setup()
    open('/dashboard')
    const handover = within(await screen.findByRole('region', { name: 'Rewards to hand over' }))
    expect(handover.getByText('1 waiting')).toBeInTheDocument()
    expect(handover.getByText(/Mia · 8 pts/)).toBeInTheDocument()
    rewardsApi.fulfill.mockResolvedValue({ redemption: {} })
    dashboardApi.summary.mockResolvedValue(summary({ pending_redemptions: [] }))
    await user.click(handover.getByRole('button', { name: 'Mark Ice cream for Mia as given' }))
    expect(rewardsApi.fulfill).toHaveBeenCalledWith(9)
    expect(await screen.findByText('Marked “Ice cream” as given.')).toBeInTheDocument()
    expect(await screen.findByText('All handed over')).toBeInTheDocument()
  })

  it('approving refreshes the rest of the Overview too', async () => {
    const user = userEvent.setup()
    open('/dashboard', { pending: [waiting(5, 'Make your bed')] })
    await user.click(await screen.findByRole('button', { name: 'Approve Make your bed from Mia' }))
    tasksApi.approve.mockResolvedValue({ submission: { ...waiting(5, 'Make your bed'), points_awarded: 10 }, balance: 45 })
    tasksApi.submissions.mockResolvedValue({ items: [] })
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Approve (+10 pts)' }))
    expect(await screen.findByText('Approved. Mia got 10 points.')).toBeInTheDocument()
    expect(dashboardApi.summary).toHaveBeenCalledTimes(2)
  })

  it('a family without kids is asked to add one first', async () => {
    open('/dashboard', { data: summary({ children: [], pending_redemptions: [], recent_activity: [] }) })
    expect(await screen.findByRole('heading', { name: 'Add your kids' })).toBeInTheDocument()
    expect(screen.getByText("Let's set up your family first.")).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Add a kid/ })).toHaveAttribute('href', '/dashboard/family')
    expect(screen.queryByRole('link', { name: 'New task' })).not.toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'Ready for your approval' })).not.toBeInTheDocument()
  })

  it('"New task" opens the task form with the first kid picked', async () => {
    open('/dashboard/tasks?new=1')
    expect(await screen.findByRole('dialog', { name: 'New task' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Mia/, pressed: true })).toBeInTheDocument() // the first kid is picked
  })
})
