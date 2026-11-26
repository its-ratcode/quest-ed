import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { authApi } from '../api/auth'
import { badgesApi } from '../api/badges'
import { categoriesApi } from '../api/categories'
import { familyApi } from '../api/family'
import { pointsApi } from '../api/points'
import { reportApi } from '../api/report'
import { tasksApi } from '../api/tasks'
import { AppRoutes } from '../App'
import { AuthProvider } from '../auth/AuthProvider'
import { ToastProvider } from '../components/ui/toast/ToastProvider'

vi.mock('../api/auth', () => ({ authApi: { me: vi.fn(), logout: vi.fn(), viewAs: vi.fn() } }))
vi.mock('../api/categories', () => ({ categoriesApi: { list: vi.fn() } }))
vi.mock('../api/family', () => ({ familyApi: { get: vi.fn(), removeChild: vi.fn() } }))
vi.mock('../api/points', () => ({ pointsApi: { summary: vi.fn(), transactions: vi.fn(), adjust: vi.fn() } }))
vi.mock('../api/badges', () => ({ badgesApi: { progress: vi.fn(), award: vi.fn() } }))
vi.mock('../api/report', () => ({ reportApi: { get: vi.fn() } }))
vi.mock('../api/tasks', () => ({
  tasksApi: { list: vi.fn(), submissions: vi.fn(), photoUrl: (id) => `/api/v1/tasks/submissions/${id}/photo` },
}))

const PAT = { id: 1, role: 'parent', display_name: 'Pat', avatar: '🙂' }
const MIA = { id: 2, role: 'child', display_name: 'Mia', username: 'mia', avatar: '🦄', points_balance: 32 }
const CATS = [{ id: 1, key: 'chores', label: 'Chores', icon: 'broom', tone: 'mint', is_active: true }]
const badge = (id, title, extra = {}) => ({
  id, title, description: '', icon: 'star', tone: 'mint', manual: false, earned_at: null, progress: 0, target: 1,
  bonus_points: 0, bonus_reward: null, ...extra,
})
const PROGRESS = {
  streak: { current: 3, best: 5 },
  stats: { approved: 12, best_streak: 5 },
  earned_count: 1,
  badges: [
    badge(1, 'First task', { earned_at: '2026-11-20T10:00:00Z', progress: 1 }),
    badge(2, 'Kind heart', { manual: true }),
    badge(3, 'Ten done', { progress: 4, target: 10 }),
  ],
}
const task = (id, title, extra = {}) => ({
  id, title, category: 'chores', points: 10, status: 'open', due_date: null, routine: null, ...extra,
})

function open(progress = PROGRESS) {
  authApi.me.mockResolvedValue({ user: PAT, family: { id: 1, name: 'The Testers' } })
  categoriesApi.list.mockResolvedValue({ items: CATS })
  familyApi.get.mockResolvedValue({ family: { id: 1, name: 'The Testers' }, members: [PAT, MIA] })
  pointsApi.summary.mockResolvedValue({ balance: 32, earned_total: 40, spent_total: 8 })
  reportApi.get.mockResolvedValue({
    days: 30, approved: 9, sent_back: 2, routines_done: 8, routines_missed: 2, routine_rate: 0.8,
    points_earned: 40, points_spent: 8, focus_minutes: 25,
  })
  pointsApi.transactions.mockResolvedValue({ items: [], total: 0, page: 1, per_page: 8 })
  badgesApi.progress.mockResolvedValue(progress)
  tasksApi.list.mockResolvedValue({ items: [
    task(1, 'Make your bed', { routine: { id: 1, weekdays: [0, 1, 2, 3, 4, 5, 6] } }),
    task(2, 'Feed the cat', { status: 'submitted' }),
    task(3, 'Old one', { status: 'approved' }),
  ] })
  tasksApi.submissions.mockResolvedValue({ items: [
    { id: 7, status: 'approved', points_awarded: 10, reviewed_at: '2026-11-21T10:00:00Z', review_note: 'Nice!',
      task: { title: 'Tidy up' }, has_photo: false },
    { id: 8, status: 'rejected', reviewed_at: '2026-11-22T10:00:00Z', review_note: '', task: { title: 'Read' }, has_photo: false },
    { id: 9, status: 'pending', task: { title: 'Still waiting' }, has_photo: false },
  ] })
  return render(
    <MemoryRouter initialEntries={['/dashboard/family/kids/2']}>
      <ToastProvider>
        <AuthProvider>
          <AppRoutes />
        </AuthProvider>
      </ToastProvider>
    </MemoryRouter>,
  )
}

beforeEach(() => vi.resetAllMocks())

describe("a kid's page (parents)", () => {
  it('shows their numbers, what they have to do, their badges and what was reviewed', async () => {
    open()
    expect(await screen.findByRole('heading', { level: 1, name: 'Mia' })).toBeInTheDocument()
    expect(await screen.findByText('9')).toBeInTheDocument() // tasks approved in the last 30 days
    expect(screen.getByText('Tasks approved (30 days)')).toBeInTheDocument()
    expect(screen.getByText('3 days')).toBeInTheDocument()
    expect(screen.getByText('1 / 3')).toBeInTheDocument()
    expect(await screen.findByText('Last 30 days: 2 sent back · 80% of routine tasks done · 40 points earned, '
      + '8 spent or taken away · 25 min of focus · best streak ever 5 days')).toBeInTheDocument()
    expect(reportApi.get).toHaveBeenCalledWith(2, expect.anything())

    const todo = within(screen.getByRole('region', { name: 'To do' }))
    expect(await todo.findByText('1 open · 1 waiting for you')).toBeInTheDocument()
    expect(todo.getByText('10 pts · Every day')).toBeInTheDocument()
    expect(todo.getByText('Waiting for you')).toBeInTheDocument()
    expect(todo.queryByText('Old one')).not.toBeInTheDocument()
    expect(tasksApi.list).toHaveBeenCalledWith({ child_id: 2, status: 'active' }, expect.anything())

    const earned = within(screen.getByRole('region', { name: 'Badges' }))
    expect(earned.getByText('First task')).toBeInTheDocument()
    expect(earned.queryByText('Ten done')).not.toBeInTheDocument()

    const reviewed = within(screen.getByRole('region', { name: 'Recently reviewed' }))
    expect(await reviewed.findByText(/Approved · \+10 pts · .* · “Nice!”/)).toBeInTheDocument()
    expect(reviewed.getByText(/^Sent back/)).toBeInTheDocument()
    expect(reviewed.queryByText('Still waiting')).not.toBeInTheDocument()
    expect(badgesApi.progress).toHaveBeenCalledWith({ child_id: 2 }, expect.anything())
  })

  it('"Give a task" opens the task form for this kid', async () => {
    open()
    expect(await screen.findByRole('link', { name: 'Give a task' })).toHaveAttribute('href', '/dashboard/tasks?child=2&new=1')
  })

  it('gives a hand-out badge, and then shows it', async () => {
    const user = userEvent.setup()
    open()
    await user.click(await screen.findByRole('button', { name: 'Give a badge' }))
    const dialog = screen.getByRole('dialog', { name: 'Give Mia a badge' })
    expect(within(dialog).queryByText('Ten done')).not.toBeInTheDocument() // only hand-out ones
    badgesApi.award.mockResolvedValue({ badge: {}, balance: 32 })
    badgesApi.progress.mockResolvedValue({
      ...PROGRESS, badges: PROGRESS.badges.map((b) => (b.id === 2 ? { ...b, earned_at: '2026-11-24T10:00:00Z' } : b)),
    })
    await user.click(within(dialog).getByRole('button', { name: 'Give Kind heart' }))
    expect(badgesApi.award).toHaveBeenCalledWith(2, 2)
    expect(await screen.findByText('Mia got the “Kind heart” badge.')).toBeInTheDocument()
    expect(await within(screen.getByRole('region', { name: 'Badges' })).findByText('Kind heart')).toBeInTheDocument()
  })

  it('says where to make one when there is no hand-out badge left', async () => {
    const user = userEvent.setup()
    open({ ...PROGRESS, badges: [badge(1, 'First task', { earned_at: '2026-11-20T10:00:00Z' })] })
    await user.click(await screen.findByRole('button', { name: 'Give a badge' }))
    const dialog = screen.getByRole('dialog', { name: 'Give Mia a badge' })
    expect(within(dialog).getByText(/No hand-out badges left for Mia/)).toBeInTheDocument()
    expect(within(dialog).getByRole('link', { name: 'Badges' })).toHaveAttribute('href', '/dashboard/badges')
  })

  it("opens the kid's account after saying what that means, then shows whose account it is", async () => {
    const user = userEvent.setup()
    open()
    await user.click(await screen.findByRole('button', { name: "Open Mia's account" }))
    const dialog = screen.getByRole('dialog', { name: "Open Mia's account?" })
    expect(within(dialog).getByText(/you'll need your password/)).toBeInTheDocument()

    authApi.viewAs.mockResolvedValue({ user: MIA })
    authApi.me.mockResolvedValue({ user: MIA, family: { id: 1, name: 'The Testers' }, acting_parent: PAT })
    await user.click(within(dialog).getByRole('button', { name: "Open Mia's account" }))
    expect(authApi.viewAs).toHaveBeenCalledWith(2)
    expect(await screen.findByText("You're now using Mia's account.")).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Back to Pat' })).toBeInTheDocument()
  })
})
