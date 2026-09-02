import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { login, setToken } from '../lib/api'
import LoginView from './LoginView'

vi.mock('../lib/api')

describe('LoginView', () => {
  beforeEach(() => {
    vi.resetAllMocks()
  })

  it('the sign-in button is disabled until both fields are filled', async () => {
    const user = userEvent.setup()
    render(<LoginView onLoggedIn={() => {}} />)

    expect(screen.getByRole('button', { name: 'Sign in' })).toBeDisabled()

    await user.type(screen.getByLabelText('Username'), 'admin')
    expect(screen.getByRole('button', { name: 'Sign in' })).toBeDisabled()

    await user.type(screen.getByLabelText('Password'), 'password123')
    expect(screen.getByRole('button', { name: 'Sign in' })).not.toBeDisabled()
  })

  it('logs in successfully and stores the token', async () => {
    const user = userEvent.setup()
    const onLoggedIn = vi.fn()
    login.mockResolvedValue({
      access_token: 'a-real-token',
      user: { id: 'u1', username: 'admin', role: 'admin' },
    })

    render(<LoginView onLoggedIn={onLoggedIn} />)

    await user.type(screen.getByLabelText('Username'), 'admin')
    await user.type(screen.getByLabelText('Password'), 'password123')
    await user.click(screen.getByRole('button', { name: 'Sign in' }))

    await waitFor(() => expect(login).toHaveBeenCalledWith('admin', 'password123'))
    expect(setToken).toHaveBeenCalledWith('a-real-token')
    expect(onLoggedIn).toHaveBeenCalledWith({ id: 'u1', username: 'admin', role: 'admin' })
  })

  it('shows an error on invalid credentials without calling onLoggedIn', async () => {
    const user = userEvent.setup()
    const onLoggedIn = vi.fn()
    login.mockRejectedValue(new Error('Invalid username or password'))

    render(<LoginView onLoggedIn={onLoggedIn} />)

    await user.type(screen.getByLabelText('Username'), 'admin')
    await user.type(screen.getByLabelText('Password'), 'wrong-password')
    await user.click(screen.getByRole('button', { name: 'Sign in' }))

    expect(await screen.findByText('Invalid username or password')).toBeInTheDocument()
    expect(onLoggedIn).not.toHaveBeenCalled()
    expect(setToken).not.toHaveBeenCalled()
  })

  it('trims whitespace from the username before submitting', async () => {
    const user = userEvent.setup()
    login.mockResolvedValue({ access_token: 't', user: { id: 'u1', username: 'admin', role: 'admin' } })

    render(<LoginView onLoggedIn={() => {}} />)

    await user.type(screen.getByLabelText('Username'), '  admin  ')
    await user.type(screen.getByLabelText('Password'), 'password123')
    await user.click(screen.getByRole('button', { name: 'Sign in' }))

    await waitFor(() => expect(login).toHaveBeenCalledWith('admin', 'password123'))
  })
})
