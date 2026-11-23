import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { authApi } from '../api/auth'
import { badgesApi } from '../api/badges'
import { categoriesApi } from '../api/categories'
import { familyApi } from '../api/family'
import { rewardsApi } from '../api/rewards'
import { AppRoutes } from '../App'
import { AuthProvider } from '../auth/AuthProvider'
import { ToastProvider } from '../components/ui/toast/ToastProvider'

vi.mock('../api/auth', () => ({ authApi: { me: vi.fn(), logout: vi.fn() } }))
vi.mock('../api/family', () => ({ familyApi: { get: vi.fn() } }))
vi.mock('../api/categories', () => ({ categoriesApi: { list: vi.fn() } }))
vi.mock('../api/rewards', () => ({ rewardsApi: { list: vi.fn(), redemptions: vi.fn() } }))
vi.mock('../api/badges', () => ({
  badgesApi: {
    progress: vi.fn(), list: vi.fn(), create: vi.fn(), update: vi.fn(), remove: vi.fn(),
    restoreStarters: vi.fn(), award: vi.fn(),
  },
}))

const PAT = { id: 1, role: 'parent', display_name: 'Pat', avatar: '🙂' }
const MIA = { id: 2, role: 'child', display_name: 'Mia', username: 'mia', avatar: '🦄', points_balance: 12 }
const LEO = { id: 3, role: 'child', display_name: 'Leo', username: 'leo', avatar: '🦖' }
const CATS = [
  { id: 1, key: 'chores', label: 'Chores', icon: 'broom', tone: 'mint', is_active: true },
  { id: 2, key: 'learning', label: 'Learning', icon: 'pencil', tone: 'lilac', is_active: true },
]
const mine = (id, title, extra = {}) => ({
  id, title, description: '', icon: 'star', tone: 'mint', manual: false, earned_at: null, progress: 0, target: 1,
  bonus_points: 0, bonus_reward: null, ...extra,
})
const familyBadge = (id, title, extra = {}) => ({
  id, title, description: '', icon: 'star', tone: 'mint', rule: 'tasks', category: null, target: 10, child: null,
  bonus_points: 0, bonus_reward: null, earned_count: 0, starter: true, ...extra,
})

function open(user, { progress, badges = [] } = {}) {
  authApi.me.mockResolvedValue({ user, family: { id: 1, name: 'The Testers' } })
  familyApi.get.mockResolvedValue({ family: { id: 1, name: 'The Testers' }, members: [PAT, MIA, LEO] })
  categoriesApi.list.mockResolvedValue({ items: CATS })
  rewardsApi.list.mockResolvedValue({ items: [{ id: 7, title: 'Pizza night', emoji: '🍕', is_active: true },
    { id: 8, title: 'Old toy', emoji: '🧸', is_active: false }] })
  rewardsApi.redemptions.mockResolvedValue({ items: [], total: 0 })
  badgesApi.progress.mockResolvedValue(progress)
  badgesApi.list.mockResolvedValue({ items: badges })
  return render(
    <MemoryRouter initialEntries={['/dashboard/badges']}>
      <ToastProvider>
        <AuthProvider>
          <AppRoutes />
        </AuthProvider>
      </ToastProvider>
    </MemoryRouter>,
  )
}

beforeEach(() => vi.resetAllMocks())

describe('my badges (kids)', () => {
  it('shows the streak, what is earned and how far along the rest are', async () => {
    open(MIA, {
      progress: {
        streak: { current: 3, best: 4 }, earned_count: 1,
        badges: [
          mine(1, 'First task', { earned_at: '2026-11-20T10:00:00Z', progress: 1, bonus_points: 5 }),
          mine(2, 'Ten done', { progress: 4, target: 10, tone: 'lilac', description: 'Had 10 tasks approved.' }),
          mine(3, 'Kind heart', { manual: true, bonus_reward: { title: 'Pizza night', emoji: '🍕' } }),
        ],
      },
    })
    expect(await screen.findByRole('heading', { level: 1, name: 'Badges' })).toBeInTheDocument()
    expect(await screen.findByText('Days in a row')).toBeInTheDocument()
    expect(screen.getByText('1 / 3')).toBeInTheDocument()

    const earned = within(screen.getByRole('region', { name: 'Earned' }))
    expect(earned.getByText(/^Earned /)).toBeInTheDocument()
    expect(earned.getByText(/Came with \+5 points/)).toBeInTheDocument()

    const locked = within(screen.getByRole('region', { name: 'Still to get' }))
    expect(locked.getByRole('progressbar', { name: 'Ten done: 4 of 10' })).toHaveAttribute('aria-valuenow', '4')
    expect(locked.getByText('4 / 10')).toBeInTheDocument()
    expect(locked.getByText('A parent gives this one')).toBeInTheDocument()
    expect(locked.getByText(/Comes with 🍕 Pizza night/)).toBeInTheDocument()
    expect(badgesApi.progress).toHaveBeenCalledWith({}, expect.anything())
  })

  it('says how to get the first one, and the menu leads here', async () => {
    open(MIA, { progress: { streak: { current: 0, best: 0 }, earned_count: 0, badges: [mine(1, 'First task')] } })
    expect(await screen.findByText('None yet. Your first one comes with your first approved task.')).toBeInTheDocument()
    const menu = screen.getByRole('complementary', { name: 'Main navigation' })
    expect(within(menu).getByRole('link', { name: 'Badges' })).toHaveAttribute('href', '/dashboard/badges')
  })
})

describe('badges (parents)', () => {
  it('lists the family badges with their goal, who can earn them, and prizes', async () => {
    open(PAT, {
      badges: [
        familyBadge(1, 'Ten done', { earned_count: 2 }),
        familyBadge(2, 'Bookworm', { rule: 'category_tasks', category: 'learning', target: 3, child: { id: 2, display_name: 'Mia' },
          bonus_points: 20, bonus_reward: { id: 7, title: 'Pizza night', emoji: '🍕' } }),
        familyBadge(3, 'Kind heart', { rule: 'manual', target: null }),
      ],
    })
    const list = await screen.findByRole('region', { name: 'Your badges' })
    expect(within(list).getByText('10 tasks approved · every kid · earned by 2 kids')).toBeInTheDocument()
    // The category's name comes from the family's categories, which load alongside.
    expect(await within(list).findByText(/3 “Learning” tasks approved · only Mia · not earned yet/)).toBeInTheDocument()
    expect(within(list).getByText('Prize: +20 points and 🍕 Pizza night')).toBeInTheDocument()
    expect(within(list).getByText(/You give it yourself/)).toBeInTheDocument()
    expect(within(list).getAllByRole('button', { name: /^Give/ })).toHaveLength(1) // only manual ones
    expect(badgesApi.progress).not.toHaveBeenCalled()
  })

  it('makes a badge for one category with a prize', async () => {
    const user = userEvent.setup()
    open(PAT)
    await user.click(await screen.findByRole('button', { name: 'Make a badge' }))
    const dialog = screen.getByRole('dialog', { name: 'Make a badge' })
    await user.type(within(dialog).getByLabelText('Badge name'), 'Bookworm')
    await user.selectOptions(within(dialog).getByLabelText('Earned by'), 'category_tasks')
    await user.click(within(dialog).getByRole('radio', { name: 'Learning' }))
    await user.clear(within(dialog).getByLabelText('Goal: how many tasks approved?'))
    await user.type(within(dialog).getByLabelText('Goal: how many tasks approved?'), '3')
    await user.selectOptions(within(dialog).getByLabelText('Who can earn it?'), '2')
    await user.clear(within(dialog).getByLabelText('Bonus points'))
    await user.type(within(dialog).getByLabelText('Bonus points'), '20')
    const rewardSelect = within(dialog).getByLabelText('A free reward')
    expect(within(rewardSelect).queryByText(/Old toy/)).not.toBeInTheDocument() // hidden rewards aren't offered
    await user.selectOptions(rewardSelect, '7')
    badgesApi.create.mockResolvedValue({ badge: familyBadge(9, 'Bookworm') })
    await user.click(within(dialog).getByRole('button', { name: 'Create badge' }))

    expect(badgesApi.create).toHaveBeenCalledWith({
      title: 'Bookworm', description: '', icon: 'star', tone: 'mint', rule: 'category_tasks', category: 'learning',
      target: 3, child_id: 2, bonus_points: 20, bonus_reward_id: 7,
    })
    expect(await screen.findByText('“Bookworm” badge created.')).toBeInTheDocument()
  })

  it('a manual badge needs no goal, and fields are checked first', async () => {
    const user = userEvent.setup()
    open(PAT)
    await user.click(await screen.findByRole('button', { name: 'Make a badge' }))
    const dialog = screen.getByRole('dialog', { name: 'Make a badge' })
    await user.clear(within(dialog).getByLabelText('Goal: how many tasks approved?'))
    await user.click(within(dialog).getByRole('button', { name: 'Create badge' }))
    expect(within(dialog).getByText('Give the badge a name.')).toBeInTheDocument()
    expect(within(dialog).getByText('Use a whole number from 1 to 10,000.')).toBeInTheDocument()

    await user.type(within(dialog).getByLabelText('Badge name'), 'Kind heart')
    await user.selectOptions(within(dialog).getByLabelText('Earned by'), 'manual')
    expect(within(dialog).queryByLabelText(/Goal/)).not.toBeInTheDocument()
    badgesApi.create.mockResolvedValue({ badge: familyBadge(9, 'Kind heart', { rule: 'manual' }) })
    await user.click(within(dialog).getByRole('button', { name: 'Create badge' }))
    expect(badgesApi.create).toHaveBeenCalledWith(expect.not.objectContaining({ target: expect.anything() }))
    expect(badgesApi.create.mock.calls[0][0].rule).toBe('manual')
  })

  it('edits a badge', async () => {
    const user = userEvent.setup()
    open(PAT, { badges: [familyBadge(1, 'Ten done')] })
    await user.click(await screen.findByRole('button', { name: 'Edit Ten done' }))
    const dialog = screen.getByRole('dialog', { name: 'Edit badge' })
    expect(within(dialog).getByLabelText('Badge name')).toHaveValue('Ten done')
    await user.clear(within(dialog).getByLabelText('Goal: how many tasks approved?'))
    await user.type(within(dialog).getByLabelText('Goal: how many tasks approved?'), '12')
    badgesApi.update.mockResolvedValue({ badge: familyBadge(1, 'Ten done') })
    await user.click(within(dialog).getByRole('button', { name: 'Save changes' }))
    expect(badgesApi.update).toHaveBeenCalledWith(1, expect.objectContaining({ target: 12, rule: 'tasks' }))
    expect(await screen.findByText('Badge saved.')).toBeInTheDocument()
  })

  it('gives a manual badge to a kid, and shows when they have it already', async () => {
    const user = userEvent.setup()
    open(PAT, { badges: [familyBadge(3, 'Kind heart', { rule: 'manual', target: null })] })
    await user.click(await screen.findByRole('button', { name: 'Give Kind heart' }))
    const dialog = screen.getByRole('dialog', { name: 'Give “Kind heart”' })
    badgesApi.award.mockResolvedValue({ badge: {}, balance: 5 })
    await user.click(within(dialog).getByRole('button', { name: /Mia/ }))
    expect(badgesApi.award).toHaveBeenCalledWith(3, 2)
    expect(await screen.findByText('Mia got the “Kind heart” badge.')).toBeInTheDocument()

    badgesApi.award.mockRejectedValue({
      isAxiosError: true, response: { status: 409, data: { message: 'Mia already has this badge.', error: 'already_earned' } },
    })
    await user.click(screen.getByRole('button', { name: 'Give Kind heart' }))
    await user.click(within(screen.getByRole('dialog', { name: 'Give “Kind heart”' })).getByRole('button', { name: /Mia/ }))
    expect(await screen.findByText('Mia already has this badge.')).toBeInTheDocument()
  })

  it('removes a badge after confirming, and brings the starters back', async () => {
    const user = userEvent.setup()
    open(PAT, { badges: [familyBadge(1, 'Ten done')] })
    await user.click(await screen.findByRole('button', { name: 'Remove Ten done' }))
    badgesApi.remove.mockResolvedValue({ badge: {} })
    await user.click(within(screen.getByRole('dialog', { name: 'Remove this badge?' })).getByRole('button', { name: 'Remove badge' }))
    expect(badgesApi.remove).toHaveBeenCalledWith(1)
    expect(await screen.findByText('Badge removed.')).toBeInTheDocument()

    badgesApi.restoreStarters.mockResolvedValue({ added: [familyBadge(1, 'Ten done'), familyBadge(2, 'First task')] })
    await user.click(screen.getByRole('button', { name: 'Add the starter badges back' }))
    expect(await screen.findByText('Added 2 starter badges back.')).toBeInTheDocument()
  })
})
