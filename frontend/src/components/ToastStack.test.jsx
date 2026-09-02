import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it } from 'vitest'
import { _resetForTests, notify } from '../lib/toastStore'
import ToastStack from './ToastStack'

describe('ToastStack', () => {
  beforeEach(() => {
    _resetForTests()
  })

  it('renders nothing when there are no toasts', () => {
    const { container } = render(<ToastStack />)
    expect(container).toBeEmptyDOMElement()
  })

  it('shows a toast pushed via notify()', async () => {
    render(<ToastStack />)

    notify('Thresholds updated', 'success', 60000)

    expect(await screen.findByText('Thresholds updated')).toBeInTheDocument()
    expect(document.querySelector('.toast-success')).toBeInTheDocument()
  })

  it('renders an error toast with the error styling', async () => {
    render(<ToastStack />)

    notify('Could not save settings', 'error', 60000)

    expect(await screen.findByText('Could not save settings')).toBeInTheDocument()
    expect(document.querySelector('.toast-error')).toBeInTheDocument()
  })

  it('dismisses a toast when its close button is clicked', async () => {
    const user = userEvent.setup()
    render(<ToastStack />)

    notify('Dismiss me', 'success', 60000)
    await screen.findByText('Dismiss me')

    await user.click(screen.getByRole('button', { name: 'Dismiss notification' }))

    await waitFor(() => expect(screen.queryByText('Dismiss me')).not.toBeInTheDocument())
  })

  it('auto-dismisses after its duration elapses', async () => {
    render(<ToastStack />)

    notify('Auto-dismiss me', 'success', 50)

    await screen.findByText('Auto-dismiss me')
    await waitFor(() => expect(screen.queryByText('Auto-dismiss me')).not.toBeInTheDocument())
  })

  it('shows multiple simultaneous toasts', async () => {
    render(<ToastStack />)

    notify('First', 'success', 60000)
    notify('Second', 'success', 60000)

    expect(await screen.findByText('First')).toBeInTheDocument()
    expect(screen.getByText('Second')).toBeInTheDocument()
  })
})
