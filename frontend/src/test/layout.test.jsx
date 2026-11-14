import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router'
import { describe, expect, it, vi } from 'vitest'
import DashboardLayout from '../components/layout/DashboardLayout'
import ConfirmDialog from '../components/ui/ConfirmDialog'
import MorePage from '../pages/MorePage'

const authState = { status: 'authenticated', user: null, logout: vi.fn() }
vi.mock('../auth/useAuth', () => ({ useAuth: () => authState }))

function renderLayout(user, path = '/dashboard') {
  authState.user = user
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/dashboard" element={<DashboardLayout />}>
          <Route index element={<p>overview page</p>} />
          <Route path="more" element={<MorePage />} />
        </Route>
      </Routes>
    </MemoryRouter>,
  )
}

describe('app layout', () => {
  it('shows the page inside a sidebar with the menu and who is signed in', () => {
    renderLayout({ id: 1, role: 'parent', display_name: 'Pat Rivera' })
    expect(screen.getByText('overview page')).toBeInTheDocument()
    const sidebar = screen.getByRole('complementary', { name: 'Main navigation' })
    expect(within(sidebar).getByText('Parent workspace')).toBeInTheDocument()
    expect(within(sidebar).getByRole('link', { name: 'Overview' })).toHaveClass('active')
    expect(within(sidebar).getByText('PR')).toBeInTheDocument() // a grown-up's initials
    expect(within(sidebar).getByText('Family parent')).toBeInTheDocument()
  })

  it('uses the kid menu and their emoji for kids', () => {
    renderLayout({ id: 2, role: 'child', display_name: 'Mia', avatar: '🦄' })
    const sidebar = screen.getByRole('complementary', { name: 'Main navigation' })
    expect(within(sidebar).getByText('My space')).toBeInTheDocument()
    expect(within(sidebar).getByRole('link', { name: 'Today' })).toBeInTheDocument()
    expect(within(sidebar).getByText('🦄')).toBeInTheDocument()
  })

  it('has a phone bar with the main pages and "More", which lists every page', async () => {
    const user = userEvent.setup()
    renderLayout({ id: 1, role: 'parent', display_name: 'Pat' })
    const phoneBar = screen.getByRole('navigation', { name: 'Quick navigation' })
    await user.click(within(phoneBar).getByRole('link', { name: 'More' }))
    expect(screen.getByRole('heading', { name: 'Menu' })).toBeInTheDocument()
    const allPages = screen.getByRole('navigation', { name: 'All pages' })
    expect(within(allPages).getByRole('link', { name: 'Overview' })).toBeInTheDocument()
  })
})

describe('confirm dialog', () => {
  it('closes with Escape or Cancel without confirming', async () => {
    const user = userEvent.setup()
    const onConfirm = vi.fn()
    const onClose = vi.fn()
    render(<ConfirmDialog open title="Sign out?" confirmLabel="Sign out" onConfirm={onConfirm} onClose={onClose} />)
    expect(screen.getByRole('dialog', { name: 'Sign out?' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Sign out' })).toHaveFocus() // ready for Enter
    await user.keyboard('{Escape}')
    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(onClose).toHaveBeenCalledTimes(2)
    expect(onConfirm).not.toHaveBeenCalled()
  })

  it("shows the error and stays open when the action fails", async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    const onConfirm = vi.fn(() => Promise.reject(Object.assign(new Error('x'), { response: { status: 409, data: { message: 'Not now.' } } })))
    render(<ConfirmDialog open title="Delete?" onConfirm={onConfirm} onClose={onClose} />)
    await user.click(screen.getByRole('button', { name: 'Confirm' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Not now.')
    expect(onClose).not.toHaveBeenCalled()
  })
})
