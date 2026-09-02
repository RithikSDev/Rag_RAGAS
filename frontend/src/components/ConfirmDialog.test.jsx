import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it } from 'vitest'
import { _resetForTests, confirm } from '../lib/confirmStore'
import ConfirmDialog from './ConfirmDialog'

describe('ConfirmDialog', () => {
  beforeEach(() => {
    _resetForTests()
  })

  it('renders nothing when there is no pending confirmation', () => {
    const { container } = render(<ConfirmDialog />)
    expect(container).toBeEmptyDOMElement()
  })

  it('shows the title and message, and resolves true on confirm', async () => {
    const user = userEvent.setup()
    render(<ConfirmDialog />)

    const resultPromise = confirm({ title: 'Delete question?', message: 'This cannot be undone.', confirmLabel: 'Delete' })

    expect(await screen.findByText('Delete question?')).toBeInTheDocument()
    expect(screen.getByText('This cannot be undone.')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Delete' }))

    expect(await resultPromise).toBe(true)
    await waitFor(() => expect(screen.queryByText('Delete question?')).not.toBeInTheDocument())
  })

  it('resolves false on cancel', async () => {
    const user = userEvent.setup()
    render(<ConfirmDialog />)

    const resultPromise = confirm({ title: 'Delete user?', message: 'Are you sure?' })
    await screen.findByText('Delete user?')

    await user.click(screen.getByRole('button', { name: 'Cancel' }))

    expect(await resultPromise).toBe(false)
  })

  it('resolves false on backdrop click', async () => {
    const user = userEvent.setup()
    render(<ConfirmDialog />)

    const resultPromise = confirm({ title: 'Delete user?', message: 'Are you sure?' })
    await screen.findByText('Delete user?')

    await user.click(document.querySelector('.confirm-backdrop'))

    expect(await resultPromise).toBe(false)
  })

  it('resolves false on Escape', async () => {
    const user = userEvent.setup()
    render(<ConfirmDialog />)

    const resultPromise = confirm({ title: 'Delete user?', message: 'Are you sure?' })
    await screen.findByText('Delete user?')

    await user.keyboard('{Escape}')

    expect(await resultPromise).toBe(false)
  })

  it('clicking inside the dialog panel does not dismiss it', async () => {
    const user = userEvent.setup()
    render(<ConfirmDialog />)

    confirm({ title: 'Delete user?', message: 'Are you sure?' })
    await screen.findByText('Delete user?')

    await user.click(screen.getByText('Are you sure?'))

    expect(screen.getByText('Delete user?')).toBeInTheDocument()
  })

  it('focuses the confirm button when it opens', async () => {
    render(<ConfirmDialog />)

    confirm({ title: 'Delete user?', message: 'Are you sure?', confirmLabel: 'Delete' })

    await waitFor(() => expect(screen.getByRole('button', { name: 'Delete' })).toHaveFocus())
  })
})
