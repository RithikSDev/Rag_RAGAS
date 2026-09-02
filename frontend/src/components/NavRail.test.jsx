import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import NavRail from './NavRail'

describe('NavRail', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('renders all nine sections and marks the active one', () => {
    render(<NavRail active="overview" onSelect={() => {}} documentCount={0} />)

    expect(screen.getByRole('button', { name: /Overview/ })).toHaveClass('active')

    for (const label of [
      'Knowledge Base',
      'RAG Playground',
      'Evaluation',
      'Retrieval Debugger',
      'Experiments',
      'Dataset',
      'Compare',
      'Settings',
    ]) {
      expect(screen.getByRole('button', { name: new RegExp(label) })).not.toHaveClass('active')
    }
  })

  it('groups sections under labeled headings reflecting the user journey', () => {
    render(<NavRail active="overview" onSelect={() => {}} documentCount={0} />)

    for (const group of ['Monitor', 'Build', 'Interact', 'Evaluate', 'System']) {
      expect(screen.getByText(group)).toBeInTheDocument()
    }
  })

  it('calls onSelect with the clicked item id', async () => {
    const user = userEvent.setup()
    const onSelect = vi.fn()

    render(<NavRail active="overview" onSelect={onSelect} documentCount={0} />)

    await user.click(screen.getByRole('button', { name: /Settings/ }))

    expect(onSelect).toHaveBeenCalledWith('settings')
  })

  it('renders the document count', () => {
    render(<NavRail active="overview" onSelect={() => {}} documentCount={4} />)

    expect(screen.getByText('4 doc(s) indexed')).toBeInTheDocument()
  })

  it('shows the RAGAS LAB brand', () => {
    render(<NavRail active="overview" onSelect={() => {}} documentCount={0} />)

    expect(screen.getByText('RAGAS LAB')).toBeInTheDocument()
  })

  it('collapsing hides labels but keeps items clickable via a title tooltip', async () => {
    const user = userEvent.setup()
    const onSelect = vi.fn()

    render(<NavRail active="overview" onSelect={onSelect} documentCount={0} />)

    await user.click(screen.getByRole('button', { name: 'Collapse navigation' }))

    expect(screen.queryByText('RAG Playground')).not.toBeInTheDocument()
    expect(screen.queryByText('Build')).not.toBeInTheDocument()

    const playgroundButton = screen.getByTitle('RAG Playground')
    await user.click(playgroundButton)
    expect(onSelect).toHaveBeenCalledWith('playground')
  })

  it('persists the collapsed state across remounts', async () => {
    const user = userEvent.setup()
    const { unmount } = render(<NavRail active="overview" onSelect={() => {}} documentCount={0} />)

    await user.click(screen.getByRole('button', { name: 'Collapse navigation' }))
    unmount()

    render(<NavRail active="overview" onSelect={() => {}} documentCount={0} />)
    expect(screen.queryByText('RAG Playground')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Expand navigation' })).toBeInTheDocument()
  })
})
