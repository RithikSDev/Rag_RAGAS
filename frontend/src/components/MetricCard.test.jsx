import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import MetricCard from './MetricCard'

describe('MetricCard', () => {
  it('renders a label and value as a plain div when not clickable', () => {
    render(<MetricCard label="Documents" value={42} />)

    expect(screen.getByText('Documents')).toBeInTheDocument()
    expect(screen.getByText('42')).toBeInTheDocument()
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })

  it('renders as a button and fires onClick when clickable', async () => {
    const user = userEvent.setup()
    const onClick = vi.fn()

    render(<MetricCard label="Faithfulness" value="90%" onClick={onClick} />)

    await user.click(screen.getByRole('button'))
    expect(onClick).toHaveBeenCalled()
  })

  it('shows an upward trend', () => {
    render(<MetricCard label="Recall" value="86%" trend={12} />)
    expect(screen.getByText('↑ 12%')).toBeInTheDocument()
  })

  it('shows a downward trend', () => {
    render(<MetricCard label="Recall" value="70%" trend={-8} />)
    expect(screen.getByText('↓ 8%')).toBeInTheDocument()
  })

  it('shows no trend indicator when trend is zero or omitted', () => {
    const { rerender } = render(<MetricCard label="Recall" value="80%" trend={0} />)
    expect(screen.queryByText(/↑|↓/)).not.toBeInTheDocument()

    rerender(<MetricCard label="Recall" value="80%" />)
    expect(screen.queryByText(/↑|↓/)).not.toBeInTheDocument()
  })
})
