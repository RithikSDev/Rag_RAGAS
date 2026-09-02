import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createUser, deleteUser, getUsers, updateUser } from '../lib/api'
import ConfirmDialog from './ConfirmDialog'
import UsersPanel from './UsersPanel'

vi.mock('../lib/api')

const ADMIN = {
  id: 'u1',
  username: 'admin',
  role: 'admin',
  is_active: true,
  created_at: '2026-01-01T00:00:00Z',
  created_by: 'system',
  last_login_at: '2026-01-02T00:00:00Z',
}

const VIEWER = {
  id: 'u2',
  username: 'alice',
  role: 'viewer',
  is_active: true,
  created_at: '2026-01-01T00:00:00Z',
  created_by: 'admin',
  last_login_at: null,
}

describe('UsersPanel', () => {
  beforeEach(() => {
    vi.resetAllMocks()
  })

  it('renders the user list with roles and status', async () => {
    getUsers.mockResolvedValue({ users: [ADMIN, VIEWER] })

    render(<UsersPanel currentUserId="u1" />)

    expect(await screen.findByText('alice')).toBeInTheDocument()
    // "created by ... · last login ..." renders as one text node - match the
    // whole meta line rather than trying to isolate "never" as its own node.
    expect(screen.getByText(/last login never/)).toBeInTheDocument()
    const rows = document.querySelectorAll('.users-row')
    expect(rows).toHaveLength(2)
  })

  it("marks the current user's own row and disables its action buttons", async () => {
    getUsers.mockResolvedValue({ users: [ADMIN, VIEWER] })

    render(<UsersPanel currentUserId="u1" />)
    await screen.findByText('alice')

    // "admin" is ambiguous (username AND role text, and the username span
    // also renders "(you)" adjacent with no separating whitespace) - find
    // the row by its .users-row-username content instead of getByText.
    const usernameSpans = document.querySelectorAll('.users-row-username')
    const adminRow = Array.from(usernameSpans)
      .find((el) => el.textContent.startsWith('admin'))
      .closest('.users-row')
    expect(adminRow.querySelector('.users-row-you')).toBeInTheDocument()
    for (const button of adminRow.querySelectorAll('.users-row-actions button')) {
      expect(button).toBeDisabled()
    }

    const aliceRow = screen.getByText('alice').closest('.users-row')
    for (const button of aliceRow.querySelectorAll('.users-row-actions button')) {
      expect(button).not.toBeDisabled()
    }
  })

  it('creates a new user', async () => {
    const user = userEvent.setup()
    getUsers.mockResolvedValue({ users: [ADMIN] })
    createUser.mockResolvedValue({ ...VIEWER })

    render(<UsersPanel currentUserId="u1" />)
    await waitFor(() => expect(document.querySelector('.users-row-username')).toHaveTextContent('admin'))

    await user.type(screen.getByPlaceholderText('Username'), 'alice')
    await user.type(screen.getByPlaceholderText('Password (min 8 characters)'), 'password123')
    await user.click(screen.getByRole('button', { name: 'Admin' }))
    await user.click(screen.getByRole('button', { name: 'Viewer' }))
    await user.click(screen.getByRole('button', { name: 'Add user' }))

    await waitFor(() =>
      expect(createUser).toHaveBeenCalledWith({ username: 'alice', password: 'password123', role: 'viewer' })
    )
  })

  it('toggles a role', async () => {
    const user = userEvent.setup()
    getUsers.mockResolvedValue({ users: [ADMIN, VIEWER] })
    updateUser.mockResolvedValue({ ...VIEWER, role: 'admin' })

    render(<UsersPanel currentUserId="u1" />)
    await screen.findByText('alice')

    const aliceRow = screen.getByText('alice').closest('.users-row')
    await user.click(within(aliceRow).getByRole('button', { name: 'Make admin' }))

    await waitFor(() => expect(updateUser).toHaveBeenCalledWith('u2', { role: 'admin' }))
  })

  it('deactivates a user', async () => {
    const user = userEvent.setup()
    getUsers.mockResolvedValue({ users: [ADMIN, VIEWER] })
    updateUser.mockResolvedValue({ ...VIEWER, is_active: false })

    render(<UsersPanel currentUserId="u1" />)
    await screen.findByText('alice')

    const aliceRow = screen.getByText('alice').closest('.users-row')
    await user.click(within(aliceRow).getByRole('button', { name: 'Deactivate' }))

    await waitFor(() => expect(updateUser).toHaveBeenCalledWith('u2', { is_active: false }))
  })

  it('asks for confirmation before deleting a user, and does nothing on cancel', async () => {
    const user = userEvent.setup()
    getUsers.mockResolvedValue({ users: [ADMIN, VIEWER] })

    render(
      <>
        <UsersPanel currentUserId="u1" />
        <ConfirmDialog />
      </>
    )
    await screen.findByText('alice')

    const aliceRow = screen.getByText('alice').closest('.users-row')
    await user.click(within(aliceRow).getByRole('button', { name: 'Delete' }))

    const dialog = await screen.findByText('Delete alice?')
    await user.click(within(dialog.closest('.confirm-dialog')).getByRole('button', { name: 'Cancel' }))

    expect(deleteUser).not.toHaveBeenCalled()
  })

  it('deletes a user once confirmed', async () => {
    const user = userEvent.setup()
    getUsers.mockResolvedValue({ users: [ADMIN, VIEWER] })
    deleteUser.mockResolvedValue({ deleted: 'u2' })

    render(
      <>
        <UsersPanel currentUserId="u1" />
        <ConfirmDialog />
      </>
    )
    await screen.findByText('alice')

    const aliceRow = screen.getByText('alice').closest('.users-row')
    await user.click(within(aliceRow).getByRole('button', { name: 'Delete' }))

    const dialog = await screen.findByText('Delete alice?')
    await user.click(within(dialog.closest('.confirm-dialog')).getByRole('button', { name: 'Delete' }))

    await waitFor(() => expect(deleteUser).toHaveBeenCalledWith('u2'))
  })

  it('surfaces an error from a failed action', async () => {
    const user = userEvent.setup()
    getUsers.mockResolvedValue({ users: [ADMIN, VIEWER] })
    updateUser.mockRejectedValue(new Error('cannot remove the last active admin'))

    render(<UsersPanel currentUserId="u1" />)
    await screen.findByText('alice')

    const aliceRow = screen.getByText('alice').closest('.users-row')
    await user.click(within(aliceRow).getByRole('button', { name: 'Deactivate' }))

    expect(await screen.findByText('cannot remove the last active admin')).toBeInTheDocument()
  })
})
