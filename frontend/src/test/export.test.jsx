import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { authApi } from '../api/auth'
import { familyApi } from '../api/family'
import { AppRoutes } from '../App'
import { AuthProvider } from '../auth/AuthProvider'
import { ToastProvider } from '../components/ui/toast/ToastProvider'

vi.mock('../api/auth', () => ({ authApi: { me: vi.fn(), logout: vi.fn() } }))
vi.mock('../api/family', () => ({ familyApi: { get: vi.fn(), downloadExport: vi.fn() } }))

const PAT = { id: 1, role: 'parent', display_name: 'Pat', avatar: '🙂', email: 'pat@example.test' }
const MIA = { id: 2, role: 'child', display_name: 'Mia', username: 'mia', avatar: '🦄', points_balance: 32 }
const LEO = { id: 3, role: 'child', display_name: 'Leo', username: 'leo', avatar: '🦖', points_balance: 4 }
const FAMILY = { id: 1, name: 'The Testers', timezone: 'UTC', invite_code: 'abcd2345' }

function open(path, members = [PAT, MIA, LEO]) {
  authApi.me.mockResolvedValue({ user: PAT, family: FAMILY })
  familyApi.get.mockResolvedValue({ family: FAMILY, members })
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

describe('exporting the family data', () => {
  it('downloads the whole family, or one kid for a recent period', async () => {
    const user = userEvent.setup()
    open('/dashboard/family')
    const card = within(await screen.findByRole('region', { name: 'Export your data' }))
    await user.click(card.getByRole('button', { name: 'Export…' }))
    let dialog = screen.getByRole('dialog', { name: "Export your family's data" })
    expect(within(dialog).getByText(/No emails, usernames or passwords/)).toBeInTheDocument()
    familyApi.downloadExport.mockResolvedValue('quest-ed-the-testers-2026-11-25.json')
    await user.click(within(dialog).getByRole('button', { name: 'Download' }))
    expect(familyApi.downloadExport).toHaveBeenCalledWith({})
    expect(await screen.findByText('Downloaded quest-ed-the-testers-2026-11-25.json.')).toBeInTheDocument()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()

    await user.click(card.getByRole('button', { name: 'Export…' }))
    dialog = screen.getByRole('dialog', { name: "Export your family's data" })
    await user.selectOptions(within(dialog).getByLabelText('Who'), '3')
    await user.selectOptions(within(dialog).getByLabelText('Period'), '30')
    await user.click(within(dialog).getByRole('button', { name: 'Download' }))
    expect(familyApi.downloadExport).toHaveBeenLastCalledWith({ child_id: 3, days: 30 })
  })

  it('shows the error when the download fails, and keeps the dialog open', async () => {
    const user = userEvent.setup()
    open('/dashboard/family')
    await user.click(await screen.findByRole('button', { name: 'Export…' }))
    familyApi.downloadExport.mockRejectedValue({ isAxiosError: true, response: { status: 500, data: { message: 'Something went wrong.' } } })
    await user.click(screen.getByRole('button', { name: 'Download' }))
    expect(await screen.findByText('The server had a problem. Please try again in a moment.')).toBeInTheDocument()
    expect(screen.getByRole('dialog', { name: "Export your family's data" })).toBeInTheDocument()
  })

  it("can't export before there are kids", async () => {
    open('/dashboard/family', [PAT])
    expect(await screen.findByRole('button', { name: 'Export…' })).toBeDisabled()
  })

  it("exports one kid's data from their page", async () => {
    const user = userEvent.setup()
    open('/dashboard/family/kids/2')
    await user.click(await screen.findByRole('button', { name: 'Export' }))
    const dialog = screen.getByRole('dialog', { name: "Export Mia's data" })
    expect(within(dialog).queryByLabelText('Who')).not.toBeInTheDocument()
    familyApi.downloadExport.mockResolvedValue('quest-ed-mia-2026-11-25.json')
    await user.click(within(dialog).getByRole('button', { name: 'Download' }))
    expect(familyApi.downloadExport).toHaveBeenCalledWith({ child_id: 2 })
  })
})
