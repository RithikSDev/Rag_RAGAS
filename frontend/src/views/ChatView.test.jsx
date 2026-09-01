import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { askQuestion } from '../lib/api'
import ChatView from './ChatView'

vi.mock('../lib/api')

describe('ChatView', () => {
  beforeEach(() => {
    vi.resetAllMocks()
  })

  it('shows the empty state before any question is asked', () => {
    render(<ChatView />)

    expect(screen.getByText('No queries yet.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Ask' })).toBeDisabled()
  })

  it('submits a question and renders the answer with its sources', async () => {
    const user = userEvent.setup()

    askQuestion.mockResolvedValue({
      question: 'How many leave days?',
      answer: 'You get **20** days.',
      contexts: [{ page: 1, text: 'Employees receive 20 days of annual leave.' }],
    })

    render(<ChatView />)

    await user.type(screen.getByPlaceholderText('Ask a question…'), 'How many leave days?')
    await user.click(screen.getByRole('button', { name: 'Ask' }))

    expect(await screen.findByText('How many leave days?')).toBeInTheDocument()
    expect(await screen.findByText(/You get/)).toBeInTheDocument()
    expect(askQuestion).toHaveBeenCalledWith('How many leave days?')

    await user.click(screen.getByText('1 retrieved chunk(s)'))
    expect(screen.getByText(/Employees receive 20 days/)).toBeInTheDocument()
  })

  it('shows an error message when the request fails', async () => {
    const user = userEvent.setup()

    askQuestion.mockRejectedValue(new Error('Generation failed'))

    render(<ChatView />)

    await user.type(screen.getByPlaceholderText('Ask a question…'), 'anything')
    await user.click(screen.getByRole('button', { name: 'Ask' }))

    expect(await screen.findByText('Generation failed')).toBeInTheDocument()
  })

  it('disables the Ask button while a request is pending', async () => {
    const user = userEvent.setup()
    let resolveRequest
    askQuestion.mockReturnValue(new Promise((resolve) => (resolveRequest = resolve)))

    render(<ChatView />)

    await user.type(screen.getByPlaceholderText('Ask a question…'), 'pending question')
    await user.click(screen.getByRole('button', { name: 'Ask' }))

    expect(screen.getByPlaceholderText('Ask a question…')).toBeDisabled()

    resolveRequest({ question: 'pending question', answer: 'done', contexts: [] })
  })
})
