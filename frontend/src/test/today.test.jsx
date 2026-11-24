import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { authApi } from '../api/auth'
import { badgesApi } from '../api/badges'
import { categoriesApi } from '../api/categories'
import { dashboardApi } from '../api/dashboard'
import { rewardsApi } from '../api/rewards'
import { tasksApi } from '../api/tasks'
import { AppRoutes } from '../App'
import { AuthProvider } from '../auth/AuthProvider'
import { ToastProvider } from '../components/ui/toast/ToastProvider'
import { currentWeek, isoDate, todayIso } from '../features/dashboard/week'

vi.mock('../api/auth', () => ({ authApi: { me: vi.fn(), logout: vi.fn() } }))
vi.mock('../api/categories', () => ({ categoriesApi: { list: vi.fn() } }))
vi.mock('../api/dashboard', () => ({ dashboardApi: { summary: vi.fn() } }))
vi.mock('../api/badges', () => ({ badgesApi: { progress: vi.fn() } }))
vi.mock('../api/tasks', () => ({ tasksApi: { list: vi.fn(), submit: vi.fn() } }))
vi.mock('../api/rewards', () => ({
  rewardsApi: { list: vi.fn(), redemptions: vi.fn(), setGoal: vi.fn(), clearGoal: vi.fn(), redeem: vi.fn() },
}))

const MIA = { id: 2, role: 'child', display_name: 'Mia', username: 'mia', avatar: '🦄', points_balance: 30 }
const CATS = [{ id: 1, key: 'chores', label: 'Chores', icon: 'broom', tone: 'mint', is_active: true }]
const today = todayIso()
const tomorrow = (() => { const d = new Date(); d.setDate(d.getDate() + 1); return isoDate(d) })()
const task = (id, title, extra = {}) => ({
  id, title, description: '', category: 'chores', points: 10, status: 'open', due_date: null, occurrence_date: null,
  routine: null, latest_submission: null, ...extra,
})
const reward = (id, title, cost, extra = {}) => ({
  id, title, cost, emoji: '🎁', description: '', stock: null, is_active: true, ...extra,
})
const summary = (extra = {}) => ({
  role: 'child', balance: 30, earned_this_week: 30, task_counts: { open: 1, submitted: 0, approved_this_week: 0 },
  next_tasks: [], recent_transactions: [], reward_highlights: [], pending_redemptions: 0, savings_goal: null, ...extra,
})
const badge = (id, title, progress, target, extra = {}) => ({
  id, title, description: `Get ${target}.`, icon: 'star', tone: 'mint', manual: false, earned_at: null, progress,
  target, bonus_points: 0, bonus_reward: null, ...extra,
})

function open(path, { data = summary(), tasks = [], progress = { streak: { current: 0, best: 0 }, badges: [] } } = {}) {
  authApi.me.mockResolvedValue({ user: MIA, family: { id: 1, name: 'The Testers' } })
  categoriesApi.list.mockResolvedValue({ items: CATS })
  dashboardApi.summary.mockResolvedValue(data)
  tasksApi.list.mockResolvedValue({ items: tasks })
  badgesApi.progress.mockResolvedValue(progress)
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

describe("a kid's Today page", () => {
  it("lists today's jobs, says how many are left, and asks only for this week's tasks", async () => {
    open('/dashboard', {
      tasks: [
        task(1, 'Make your bed', { due_date: today, occurrence_date: today, routine: { id: 1, weekdays: [0, 1, 2, 3, 4, 5, 6] } }),
        task(2, 'Read a chapter'), // no date: still something to do
        task(3, 'Feed the cat', { status: 'submitted', due_date: today }),
        task(4, 'Tidy up', { status: 'approved', due_date: today,
          latest_submission: { status: 'approved', submitted_at: new Date().toISOString() } }),
        task(5, 'Pack for the trip', { due_date: tomorrow }), // not today
      ],
    })
    expect(await screen.findByRole('heading', { level: 1, name: /Hi Mia, 2 things/ })).toBeInTheDocument()
    const list = within(screen.getByRole('region', { name: 'My today checklist' }))
    expect(await list.findByRole('button', { name: 'I did it: Make your bed' })).toBeInTheDocument()
    expect(list.getByText('10 points · Chores · Every day')).toBeInTheDocument()
    expect(list.getByText('Waiting for parent')).toBeInTheDocument()
    expect(list.getByText('Approved')).toBeInTheDocument()
    expect(list.getByText('1 already approved · you\'ve got this!')).toBeInTheDocument()
    expect(list.queryByText('Pack for the trip')).not.toBeInTheDocument()
    expect(tasksApi.list).toHaveBeenCalledWith({ status: 'all', since: currentWeek()[0].iso }, expect.anything())
  })

  it("says when everything's done", async () => {
    open('/dashboard', { tasks: [] })
    expect(await screen.findByRole('heading', { level: 1, name: /you're all done today/ })).toBeInTheDocument()
    expect(await screen.findByText('Nothing for today')).toBeInTheDocument()
  })

  it('shows the reward they chose to save for, and how far they are', async () => {
    open('/dashboard', {
      data: summary({ balance: 30, savings_goal: reward(5, 'New bike', 120, { emoji: '🚲' }), pending_redemptions: 1 }),
    })
    const points = within(await screen.findByRole('region', { name: 'My points' }))
    expect(points.getByText('Saving for (your choice)')).toBeInTheDocument()
    expect(points.getByText('New bike')).toBeInTheDocument()
    expect(points.getByText('90 points to go')).toBeInTheDocument()
    expect(points.getByRole('progressbar', { name: '30 of 120 points saved for New bike' })).toHaveAttribute('aria-valuenow', '30')
    expect(points.getByText('A reward you picked is on its way from a parent.')).toBeInTheDocument()
    expect(points.getByRole('link', { name: /Visit reward shop/ })).toHaveAttribute('href', '/dashboard/rewards')
  })

  it("without a chosen goal, suggests the cheapest reward they can't afford yet", async () => {
    open('/dashboard', {
      data: summary({ balance: 30, reward_highlights: [reward(1, 'Sticker', 5), reward(2, 'Ice cream', 40, { stock: 0 }),
        reward(3, 'Movie night', 50)] }),
    })
    const points = within(await screen.findByRole('region', { name: 'My points' }))
    expect(points.getByText('Next reward')).toBeInTheDocument()
    expect(points.getByText('Movie night')).toBeInTheDocument() // the ice cream is sold out
    expect(points.getByText('20 points to go')).toBeInTheDocument()
  })

  it('shows the week, the streak and the badge they are closest to', async () => {
    open('/dashboard', {
      tasks: [task(4, 'Tidy up', { status: 'approved', due_date: today,
        latest_submission: { status: 'approved', submitted_at: new Date().toISOString() } })],
      progress: {
        streak: { current: 2, best: 4 },
        badges: [badge(1, 'Ten done', 4, 10), badge(2, 'Three days running', 2, 3, { tone: 'sky' }),
          badge(3, 'Kind heart', 0, 1, { manual: true }), badge(4, 'First task', 1, 1, { earned_at: '2026-11-20T10:00:00Z' })],
      },
    })
    const week = within(await screen.findByRole('region', { name: 'My week, my pace' }))
    const todayLabel = currentWeek().find((d) => d.isToday).label
    expect(await week.findByLabelText(`${todayLabel}: something approved`)).toBeInTheDocument()
    expect(await week.findByText(/You have a 2-day streak/)).toBeInTheDocument()
    const next = within(screen.getByRole('region', { name: 'Your next badge' }))
    expect(next.getByText('Three days running')).toBeInTheDocument() // 2 of 3 is the closest
    expect(next.getByRole('link', { name: /See all badges/ })).toHaveAttribute('href', '/dashboard/badges')
  })

  it('"I did it" sends the task and reloads the page', async () => {
    const user = userEvent.setup()
    open('/dashboard', { tasks: [task(1, 'Make your bed', { due_date: today })] })
    await user.click(await screen.findByRole('button', { name: 'I did it: Make your bed' }))
    tasksApi.submit.mockResolvedValue({ task: task(1, 'Make your bed', { status: 'submitted' }) })
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Send' }))
    expect(tasksApi.submit).toHaveBeenCalledWith(1, '', undefined)
    expect(await screen.findByText('Sent! Your parent will check it soon.')).toBeInTheDocument()
    expect(dashboardApi.summary).toHaveBeenCalledTimes(2)
  })
})

describe('saving for a reward in the shop', () => {
  it('picks a reward to save for, and stops again', async () => {
    const user = userEvent.setup()
    authApi.me.mockResolvedValue({ user: MIA, family: { id: 1, name: 'The Testers' } })
    categoriesApi.list.mockResolvedValue({ items: CATS })
    rewardsApi.redemptions.mockResolvedValue({ items: [], total: 0, page: 1, per_page: 10 })
    rewardsApi.list.mockResolvedValue({ items: [reward(5, 'New bike', 120), reward(1, 'Sticker', 5)], goal_reward_id: null })
    render(
      <MemoryRouter initialEntries={['/dashboard/rewards']}>
        <ToastProvider><AuthProvider><AppRoutes /></AuthProvider></ToastProvider>
      </MemoryRouter>,
    )
    const bike = await screen.findByRole('article', { name: 'New bike' })
    expect(within(screen.getByRole('article', { name: 'Sticker' })).queryByRole('button', { name: /Save for/ })).not.toBeInTheDocument()
    rewardsApi.setGoal.mockResolvedValue({ goal: reward(5, 'New bike', 120) })
    rewardsApi.list.mockResolvedValue({ items: [reward(5, 'New bike', 120), reward(1, 'Sticker', 5)], goal_reward_id: 5 })
    await user.click(within(bike).getByRole('button', { name: 'Save for New bike' }))
    expect(rewardsApi.setGoal).toHaveBeenCalledWith(5)
    expect(await screen.findByText('Saving for “New bike”. It\'s on your Today page.')).toBeInTheDocument()
    const saving = await within(bike).findByRole('button', { name: 'Save for New bike', pressed: true })
    expect(saving).toHaveTextContent('★ Saving for this')

    rewardsApi.clearGoal.mockResolvedValue({ goal: null })
    await user.click(saving)
    expect(rewardsApi.clearGoal).toHaveBeenCalled()
    expect(await screen.findByText('You\'re not saving for “New bike” any more.')).toBeInTheDocument()
  })
})
