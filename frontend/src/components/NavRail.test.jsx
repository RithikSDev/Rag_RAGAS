import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import NavRail from './NavRail'

describe('NavRail', () => {
  it('renders all nav items and marks the active one', () => {
    render(<NavRail active="chat" onSelect={() => {}} documentCount={0} />)

    expect(screen.getByRole('button', { name: /Chat/ })).toHaveClass('active')
    expect(screen.getByRole('button', { name: /Evaluation/ })).not.toHaveClass('active')
    expect(screen.getByRole('button', { name: /Documents/ })).not.toHaveClass('active')
    expect(screen.getByRole('button', { name: /Settings/ })).not.toHaveClass('active')
  })

  it('calls onSelect with the clicked item id', async () => {
    const user = userEvent.setup()
    const onSelect = vi.fn()

    render(<NavRail active="chat" onSelect={onSelect} documentCount={0} />)

    await user.click(screen.getByRole('button', { name: /Settings/ }))

    expect(onSelect).toHaveBeenCalledWith('settings')
  })

  it('renders the document count', () => {
    render(<NavRail active="chat" onSelect={() => {}} documentCount={4} />)

    expect(screen.getByText('4 doc(s) indexed')).toBeInTheDocument()
  })
})
