import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { authApi } from '../api/auth'
import { rewardsApi } from '../api/rewards'
import { AppRoutes } from '../App'
import { AuthProvider } from '../auth/AuthProvider'
import { ToastProvider } from '../components/ui/toast/ToastProvider'

vi.mock('../api/auth', () => ({ authApi: { me: vi.fn(), logout: vi.fn() } }))
vi.mock('../api/rewards', () => ({
  rewardsApi: {
    list: vi.fn(), create: vi.fn(), update: vi.fn(), redeem: vi.fn(),
    redemptions: vi.fn(), fulfill: vi.fn(), cancel: vi.fn(),
  },
}))

const PAT = { id: 1, role: 'parent', display_name: 'Pat', avatar: '🙂' }
const MIA = { id: 2, role: 'child', display_name: 'Mia', username: 'mia', avatar: '🦄', points_balance: 40 }
const FAMILY = { id: 1, name: 'The Testers' }
const reward = (id, title, cost, more = {}) => ({
  id, title, cost, emoji: '🎁', description: '', stock: null, is_active: true, ...more,
})
const SHOP = [
  reward(1, 'Ice cream', 10, { emoji: '🍦', stock: 2 }),
  reward(2, 'Movie night', 30, { emoji: '🎬' }),
  reward(3, 'Zoo trip', 200, { emoji: '🦁' }),
  reward(4, 'Sticker', 5, { stock: 0 }),
]
const bought = (id, title, cost, more = {}) => ({
  id, reward_id: 2, reward_title: title, reward_emoji: '🎬', cost, status: 'pending',
  child: { id: 2, display_name: 'Mia' }, created_at: new Date().toISOString(), ...more,
})

// What the server has: purchases waiting to be handed over, and finished ones (the history).
// Tests change these to say what the next request returns.
let server

function open(user, { rewards = SHOP, waiting = [], done = [], path = '/dashboard/rewards' } = {}) {
  server = { waiting, done }
  authApi.me.mockResolvedValue({ user, family: FAMILY })
  rewardsApi.list.mockResolvedValue({ items: rewards })
  rewardsApi.redemptions.mockImplementation(async ({ status, page = 1, per_page: perPage }) => {
    const all = status === 'pending' ? server.waiting : server.done
    return { items: all.slice((page - 1) * perPage, page * perPage), total: all.length, page, per_page: perPage }
  })
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

const card = (name) => screen.getByRole('article', { name })

beforeEach(() => vi.resetAllMocks())

describe('the reward shop (kids)', () => {
  it('shows what they can get now, how far off the rest is, and what has run out', async () => {
    open(MIA)
    expect(await screen.findByRole('heading', { level: 1, name: 'Reward shop' })).toBeInTheDocument()
    expect(screen.getByText('You have 40 pts to spend.')).toBeInTheDocument()
    await screen.findByRole('article', { name: 'Ice cream' })
    expect(within(card('Ice cream')).getByRole('button', { name: 'Get Ice cream' })).toBeInTheDocument()
    expect(within(card('Ice cream')).getByText('2 left')).toBeInTheDocument()
    expect(within(card('Zoo trip')).getByLabelText('You need 160 more points')).toHaveTextContent('160 more to go')
    expect(within(card('Sticker')).queryByRole('button')).not.toBeInTheDocument()
    expect(within(card('Sticker')).getAllByText('None left')).toHaveLength(2)
    expect(rewardsApi.redemptions).toHaveBeenCalledWith({ status: 'pending', per_page: 100 }, expect.anything())
  })

  it('buying shows the price and what is left, then a short "done"', async () => {
    const user = userEvent.setup()
    open(MIA)
    rewardsApi.redeem.mockResolvedValue({ redemption: bought(9, 'Movie night', 30), reward: SHOP[1], balance: 10 })
    await user.click(await screen.findByRole('button', { name: 'Get Movie night' }))
    const dialog = screen.getByRole('dialog', { name: 'Get “Movie night”?' })
    expect(within(dialog).getByText('40 pts')).toBeInTheDocument()
    expect(within(dialog).getByText('10 pts')).toBeInTheDocument() // left after

    authApi.me.mockResolvedValue({ user: { ...MIA, points_balance: 10 }, family: FAMILY })
    server.waiting = [bought(9, 'Movie night', 30)]
    await user.click(within(dialog).getByRole('button', { name: 'Spend 30 pts' }))
    expect(rewardsApi.redeem).toHaveBeenCalledWith(2)
    const done = await screen.findByRole('dialog', { name: 'Done' })
    expect(within(done).getByText('You have 10 pts left.')).toBeInTheDocument()
    await user.click(within(done).getByRole('button', { name: 'OK' }))
    expect(await screen.findByText('You have 10 pts to spend.')).toBeInTheDocument()
    expect(within(screen.getByRole('region', { name: 'Waiting to be given' })).getByText(/Movie night/)).toBeInTheDocument()
  })

  it("shows the server's reason when buying doesn't work", async () => {
    const user = userEvent.setup()
    open(MIA)
    rewardsApi.redeem.mockRejectedValue({
      isAxiosError: true, response: { status: 409, data: { message: 'None left. Ask a parent.', error: 'out_of_stock' } },
    })
    await user.click(await screen.findByRole('button', { name: 'Get Ice cream' }))
    await user.click(screen.getByRole('button', { name: 'Spend 10 pts' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('None left. Ask a parent.')
    expect(screen.getByRole('dialog', { name: 'Get “Ice cream”?' })).toBeInTheDocument()
  })

  it('a kid can cancel something not handed over yet and gets the points back', async () => {
    const user = userEvent.setup()
    open(MIA, { waiting: [bought(9, 'Movie night', 30)] })
    const waiting = await screen.findByRole('region', { name: 'Waiting to be given' })
    expect(within(waiting).getByText('On its way')).toBeInTheDocument()
    rewardsApi.cancel.mockResolvedValue({ redemption: { ...bought(9, 'Movie night', 30), status: 'cancelled' }, balance: 70 })
    server.waiting = []
    server.done = [bought(9, 'Movie night', 30, { status: 'cancelled' })]
    await user.click(within(waiting).getByRole('button', { name: 'Cancel Movie night' }))
    const dialog = screen.getByRole('dialog', { name: 'Cancel this?' })
    expect(within(dialog).getByText('You get your 30 pts back.')).toBeInTheDocument()
    expect(within(dialog).getByRole('button', { name: 'Keep it' })).toBeInTheDocument()
    await user.click(within(dialog).getByRole('button', { name: 'Cancel and get points back' }))
    expect(rewardsApi.cancel).toHaveBeenCalledWith(9)
    expect(await screen.findByText('Cancelled. Your points are back.')).toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'Waiting to be given' })).not.toBeInTheDocument()
    const history = await screen.findByRole('region', { name: 'History' })
    expect(within(history).getByText('Cancelled')).toBeInTheDocument()
  })

  it('says to ask a parent when the shop is empty, and the menu leads here', async () => {
    open(MIA, { rewards: [] })
    expect(await screen.findByText('No rewards yet')).toBeInTheDocument()
    expect(screen.getByText('Ask a parent to add some.')).toBeInTheDocument()
    const menu = screen.getByRole('complementary', { name: 'Main navigation' })
    expect(within(menu).getByRole('link', { name: 'Reward shop' })).toHaveAttribute('href', '/dashboard/rewards')
  })
})

describe('rewards (parents)', () => {
  it('adds a reward, checking the fields first', async () => {
    const user = userEvent.setup()
    open(PAT, { rewards: [] })
    expect(await screen.findByRole('heading', { level: 1, name: 'Rewards' })).toBeInTheDocument()
    await user.click(await screen.findByRole('button', { name: 'Add your first reward' }))
    const dialog = screen.getByRole('dialog', { name: 'New reward' })
    await user.clear(within(dialog).getByLabelText('Cost in points'))
    await user.click(within(dialog).getByRole('button', { name: 'Add reward' }))
    expect(within(dialog).getByText('Name the reward.')).toBeInTheDocument()
    expect(within(dialog).getByText('Use a whole number from 1 to 100,000.')).toBeInTheDocument()
    expect(rewardsApi.create).not.toHaveBeenCalled()

    await user.type(within(dialog).getByLabelText('Reward'), '  Pick dinner ')
    await user.type(within(dialog).getByLabelText('Cost in points'), '25')
    await user.click(within(dialog).getByRole('radio', { name: '🍕' }))
    await user.click(within(dialog).getByLabelText('Limited quantity'))
    await user.clear(within(dialog).getByLabelText('How many available'))
    await user.type(within(dialog).getByLabelText('How many available'), '3')
    rewardsApi.create.mockResolvedValue({ reward: reward(5, 'Pick dinner', 25) })
    rewardsApi.list.mockResolvedValue({ items: [reward(5, 'Pick dinner', 25, { emoji: '🍕', stock: 3 })] })
    await user.click(within(dialog).getByRole('button', { name: 'Add reward' }))
    expect(rewardsApi.create).toHaveBeenCalledWith({
      title: 'Pick dinner', description: '', emoji: '🍕', cost: 25, stock: 3,
    })
    expect(await screen.findByText('Reward added.')).toBeInTheDocument()
    expect(await screen.findByRole('article', { name: 'Pick dinner' })).toBeInTheDocument()
  })

  it('edits a reward and can take its limit off', async () => {
    const user = userEvent.setup()
    open(PAT)
    await user.click(await screen.findByRole('button', { name: 'Edit Ice cream' }))
    const dialog = screen.getByRole('dialog', { name: 'Edit reward' })
    expect(within(dialog).getByLabelText('Reward')).toHaveValue('Ice cream')
    expect(within(dialog).getByLabelText('How many available')).toHaveValue(2)
    await user.click(within(dialog).getByLabelText('Limited quantity'))
    rewardsApi.update.mockResolvedValue({ reward: SHOP[0] })
    await user.click(within(dialog).getByRole('button', { name: 'Save changes' }))
    expect(rewardsApi.update).toHaveBeenCalledWith(1, {
      title: 'Ice cream', description: '', emoji: '🍦', cost: 10, stock: null,
    })
    expect(await screen.findByText('Reward updated.')).toBeInTheDocument()
  })

  it('shows field errors from the server', async () => {
    const user = userEvent.setup()
    open(PAT)
    rewardsApi.update.mockRejectedValue({
      isAxiosError: true,
      response: { status: 400, data: { message: 'Please check the form.', errors: { title: 'That name is too long.' } } },
    })
    await user.click(await screen.findByRole('button', { name: 'Edit Movie night' }))
    await user.click(screen.getByRole('button', { name: 'Save changes' }))
    expect(await screen.findByText('That name is too long.')).toBeInTheDocument()
  })

  it('hides a reward from the kids and shows it again', async () => {
    const user = userEvent.setup()
    open(PAT, { rewards: [reward(1, 'Ice cream', 10), reward(2, 'Old toy', 5, { is_active: false })] })
    expect(await screen.findByText('Hidden from kids')).toBeInTheDocument()
    rewardsApi.update.mockResolvedValue({ reward: {} })
    await user.click(screen.getByRole('button', { name: 'Hide Ice cream' }))
    expect(rewardsApi.update).toHaveBeenCalledWith(1, { is_active: false })
    expect(await screen.findByText('Hidden from your kids.')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Show Old toy' }))
    expect(rewardsApi.update).toHaveBeenCalledWith(2, { is_active: true })
    expect(await screen.findByText('Your kids can see it again.')).toBeInTheDocument()
  })

  it('searches once there are many rewards', async () => {
    const user = userEvent.setup()
    const many = Array.from({ length: 8 }, (_, i) => reward(i + 1, i === 3 ? 'Zoo trip' : `Treat ${i + 1}`, 10))
    open(PAT, { rewards: many })
    await user.type(await screen.findByRole('searchbox', { name: 'Search rewards' }), 'zoo')
    expect(screen.getByText('1 of 8')).toBeInTheDocument()
    expect(screen.getAllByRole('article')).toHaveLength(1)
    await user.type(screen.getByRole('searchbox', { name: 'Search rewards' }), 'x')
    expect(screen.getByText('No rewards match “zoox”')).toBeInTheDocument()
  })
})

describe('handing rewards over (parents)', () => {
  const LEOS = bought(8, 'Ice cream', 10, { child: { id: 3, display_name: 'Leo' }, reward_emoji: '🍦' })
  const MIAS = bought(9, 'Movie night', 30)

  it('lists what is waiting, with a count in the menu', async () => {
    open(PAT, { waiting: [LEOS, MIAS] })
    const list = await screen.findByRole('region', { name: 'To hand over' })
    expect(within(list).getByLabelText('2 waiting')).toHaveTextContent('2')
    expect(within(list).getByText(/^Leo ·/)).toBeInTheDocument()
    expect(within(list).getByRole('button', { name: 'Mark Movie night for Mia as given' })).toBeInTheDocument()
    const menu = screen.getByRole('complementary', { name: 'Main navigation' })
    expect(await within(within(menu).getByRole('link', { name: /Rewards/ })).findByLabelText('2 waiting')).toBeInTheDocument()
    expect(rewardsApi.redemptions).toHaveBeenCalledWith({ status: 'pending', per_page: 5 }, expect.anything())
  })

  it('marking one as given moves it to the history and lowers the count', async () => {
    const user = userEvent.setup()
    open(PAT, { waiting: [LEOS, MIAS] })
    rewardsApi.fulfill.mockImplementation(async () => {
      server.waiting = [LEOS]
      server.done = [{ ...MIAS, status: 'fulfilled' }]
      return { redemption: server.done[0] }
    })
    await user.click(await screen.findByRole('button', { name: 'Mark Movie night for Mia as given' }))
    expect(rewardsApi.fulfill).toHaveBeenCalledWith(9)
    expect(await screen.findByText('Marked “Movie night” as given.')).toBeInTheDocument()
    const history = await screen.findByRole('region', { name: 'History' })
    expect(within(history).getByText('Received')).toBeInTheDocument()
    const menu = screen.getByRole('complementary', { name: 'Main navigation' })
    expect(await within(menu).findByLabelText('1 waiting')).toBeInTheDocument()
  })

  it('cancelling gives the kid their points back', async () => {
    const user = userEvent.setup()
    open(PAT, { waiting: [MIAS] })
    rewardsApi.cancel.mockImplementation(async () => {
      server.waiting = []
      return { redemption: { ...MIAS, status: 'cancelled' }, balance: 70 }
    })
    await user.click(await screen.findByRole('button', { name: 'Cancel Movie night for Mia and refund' }))
    const dialog = screen.getByRole('dialog', { name: 'Cancel this?' })
    expect(within(dialog).getByText('30 pts go back to Mia.')).toBeInTheDocument()
    await user.click(within(dialog).getByRole('button', { name: 'Cancel and refund' }))
    expect(rewardsApi.cancel).toHaveBeenCalledWith(9)
    expect(await screen.findByText('Cancelled. The points went back.')).toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'To hand over' })).not.toBeInTheDocument()
  })

  it('shows why when it was already handed over or cancelled', async () => {
    const user = userEvent.setup()
    open(PAT, { waiting: [MIAS] })
    rewardsApi.fulfill.mockRejectedValue({
      isAxiosError: true, response: { status: 409, data: { message: 'This has already been handed over or cancelled.' } },
    })
    await user.click(await screen.findByRole('button', { name: 'Mark Movie night for Mia as given' }))
    expect(await screen.findByText('This has already been handed over or cancelled.')).toBeInTheDocument()
  })

  it('pages through a long history, newest first', async () => {
    const user = userEvent.setup()
    const done = Array.from({ length: 12 }, (_, i) => bought(100 - i, `Treat ${i + 1}`, 5, { status: 'fulfilled' }))
    open(PAT, { done })
    const history = await screen.findByRole('region', { name: 'History' })
    expect(within(history).getByText('1–10 of 12')).toBeInTheDocument()
    expect(within(history).getByText(/Treat 1$/)).toBeInTheDocument()
    await user.click(within(history).getByRole('button', { name: 'Next page' }))
    expect(await within(history).findByText(/Treat 12$/)).toBeInTheDocument()
    expect(rewardsApi.redemptions).toHaveBeenCalledWith({ status: 'done', page: 2, per_page: 10 }, expect.anything())
  })
})
