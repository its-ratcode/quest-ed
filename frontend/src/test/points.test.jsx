import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { authApi } from '../api/auth'
import { familyApi } from '../api/family'
import { pointsApi } from '../api/points'
import { AppRoutes } from '../App'
import { AuthProvider } from '../auth/AuthProvider'
import { ToastProvider } from '../components/ui/toast/ToastProvider'

vi.mock('../api/auth', () => ({ authApi: { me: vi.fn(), logout: vi.fn() } }))
vi.mock('../api/family', () => ({ familyApi: { get: vi.fn(), updateChild: vi.fn(), removeChild: vi.fn() } }))
vi.mock('../api/points', () => ({ pointsApi: { summary: vi.fn(), transactions: vi.fn(), adjust: vi.fn() } }))

const PAT = { id: 1, role: 'parent', display_name: 'Pat', avatar: '🙂' }
const MIA = { id: 2, role: 'child', display_name: 'Mia', username: 'mia', avatar: '🦄', points_balance: 32 }
const FAMILY = { id: 1, name: 'The Testers' }
const tx = (id, amount, description, balance_after) => ({
  id, amount, description, balance_after, kind: 'adjustment', created_at: new Date().toISOString(),
})
const HISTORY = [tx(3, 5, 'Helped with the shopping', 32), tx(2, -3, 'Counted twice', 27), tx(1, 30, 'Completed: Tidy room', 30)]

function open(path, user) {
  authApi.me.mockResolvedValue({ user, family: FAMILY })
  familyApi.get.mockResolvedValue({ family: FAMILY, members: [PAT, MIA] })
  pointsApi.summary.mockResolvedValue({ balance: 32, earned_total: 35, spent_total: 3 })
  pointsApi.transactions.mockResolvedValue({ items: HISTORY, total: 3, page: 1, per_page: 10 })
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

describe('My points (kids)', () => {
  it('shows what they can spend, the totals, and every change with its reason', async () => {
    open('/dashboard/points', MIA)
    expect(await screen.findByRole('heading', { level: 1, name: 'My points' })).toBeInTheDocument()
    expect(await screen.findByText('To spend')).toBeInTheDocument()
    expect(screen.getByText('35')).toBeInTheDocument()
    const history = screen.getByRole('region', { name: 'History' })
    expect(within(history).getByText('Helped with the shopping')).toBeInTheDocument()
    expect(within(history).getByLabelText('plus 5 points')).toHaveTextContent('+5')
    expect(within(history).getByLabelText('minus 3 points')).toHaveTextContent('−3')
    expect(within(history).getByText(/balance 27/)).toBeInTheDocument()
    expect(pointsApi.transactions).toHaveBeenCalledWith({ child_id: undefined, page: 1, per_page: 10 }, expect.anything())
  })

  it('the points in the top bar and the menu lead to the page', async () => {
    open('/dashboard', MIA)
    expect(await screen.findByRole('link', { name: 'Your points: 32. Open My points' })).toHaveAttribute('href', '/dashboard/points')
    const menu = screen.getByRole('complementary', { name: 'Main navigation' })
    expect(within(menu).getByRole('link', { name: 'My points' })).toBeInTheDocument()
  })

  it('says how to get points when there are none yet', async () => {
    open('/dashboard/points', MIA)
    pointsApi.transactions.mockResolvedValue({ items: [], total: 0, page: 1, per_page: 10 })
    expect(await screen.findByText('No points yet')).toBeInTheDocument()
  })

  it("parents don't have a My points page", async () => {
    open('/dashboard/points', PAT)
    expect(await screen.findByRole('heading', { level: 1, name: /, Pat\.$/ })).toBeInTheDocument() // the Overview
  })
})

describe("a kid's page (parents)", () => {
  it("shows the kid's points and history", async () => {
    open('/dashboard/family/kids/2', PAT)
    expect(await screen.findByRole('heading', { level: 1, name: 'Mia' })).toBeInTheDocument()
    expect(screen.getByText('Points to spend')).toBeInTheDocument()
    expect(await screen.findByText('Counted twice')).toBeInTheDocument()
    expect(pointsApi.summary).toHaveBeenCalledWith({ child_id: 2 }, expect.anything())
    expect(pointsApi.transactions).toHaveBeenCalledWith({ child_id: 2, page: 1, per_page: 10 }, expect.anything())
  })

  it('adds points with a reason, then shows the new balance', async () => {
    const user = userEvent.setup()
    open('/dashboard/family/kids/2', PAT)
    await user.click(await screen.findByRole('button', { name: 'Add or take points' }))
    const dialog = screen.getByRole('dialog', { name: 'Points for Mia' })
    expect(within(dialog).getByText(/Mia has 32 points/)).toBeInTheDocument()

    await user.click(within(dialog).getByRole('button', { name: 'Add points' }))
    expect(within(dialog).getByText('Say why, so everyone can see where points come from.')).toBeInTheDocument()
    expect(pointsApi.adjust).not.toHaveBeenCalled()

    await user.clear(within(dialog).getByLabelText('Points'))
    await user.type(within(dialog).getByLabelText('Points'), '15')
    await user.type(within(dialog).getByLabelText('Reason'), 'Helped a neighbour ')
    pointsApi.adjust.mockResolvedValue({ transaction: tx(4, 15, 'Helped a neighbour', 47), balance: 47 })
    await user.click(within(dialog).getByRole('button', { name: 'Add points' }))

    expect(pointsApi.adjust).toHaveBeenCalledWith({ child_id: 2, amount: 15, reason: 'Helped a neighbour' })
    expect(await screen.findByText('Saved. Mia now has 47 points.')).toBeInTheDocument()
    expect(pointsApi.transactions).toHaveBeenCalledTimes(2) // the history loads again
  })

  it("takes points away, but not more than the kid has", async () => {
    const user = userEvent.setup()
    open('/dashboard/family/kids/2', PAT)
    await user.click(await screen.findByRole('button', { name: 'Add or take points' }))
    const dialog = screen.getByRole('dialog', { name: 'Points for Mia' })
    await user.click(within(dialog).getByRole('radio', { name: 'Take points away' }))
    expect(within(dialog).getByRole('radio', { name: 'Take points away' })).toHaveAttribute('aria-checked', 'true')

    await user.clear(within(dialog).getByLabelText('Points'))
    await user.type(within(dialog).getByLabelText('Points'), '40')
    await user.type(within(dialog).getByLabelText('Reason'), 'Counted twice')
    await user.click(within(dialog).getByRole('button', { name: 'Take points away' }))
    expect(within(dialog).getByText('Mia only has 32 points.')).toBeInTheDocument()
    expect(pointsApi.adjust).not.toHaveBeenCalled()

    await user.clear(within(dialog).getByLabelText('Points'))
    await user.type(within(dialog).getByLabelText('Points'), '4')
    pointsApi.adjust.mockResolvedValue({ transaction: tx(4, -4, 'Counted twice', 28), balance: 28 })
    await user.click(within(dialog).getByRole('button', { name: 'Take points away' }))
    expect(pointsApi.adjust).toHaveBeenCalledWith({ child_id: 2, amount: -4, reason: 'Counted twice' })
  })

  it("shows the server's message when the balance changed in the meantime", async () => {
    const user = userEvent.setup()
    open('/dashboard/family/kids/2', PAT)
    await user.click(await screen.findByRole('button', { name: 'Add or take points' }))
    const dialog = screen.getByRole('dialog', { name: 'Points for Mia' })
    await user.click(within(dialog).getByRole('radio', { name: 'Take points away' }))
    await user.type(within(dialog).getByLabelText('Reason'), 'Fixing')
    pointsApi.adjust.mockRejectedValue({
      response: { status: 409, data: { message: "Mia only has 2 points. A balance can't go below zero." } },
    })
    await user.click(within(dialog).getByRole('button', { name: 'Take points away' }))
    expect(await within(dialog).findByRole('alert')).toHaveTextContent('Mia only has 2 points.')
  })

  it("says so when the kid isn't in the family", async () => {
    open('/dashboard/family/kids/99', PAT)
    expect(await screen.findByRole('heading', { name: 'Kid not found' })).toBeInTheDocument()
  })

  it("kids can't open a kid's page", async () => {
    open('/dashboard/family/kids/2', MIA)
    expect(await screen.findByRole('link', { name: /Open My points/ })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { level: 1, name: 'Mia' })).not.toBeInTheDocument()
  })
})
