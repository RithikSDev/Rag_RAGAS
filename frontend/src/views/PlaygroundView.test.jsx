import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { askQuestion } from '../lib/api'
import PlaygroundView from './PlaygroundView'

vi.mock('../lib/api')

describe('PlaygroundView', () => {
  beforeEach(() => {
    vi.resetAllMocks()
  })

  it('shows the empty state before any question is asked', () => {
    render(<PlaygroundView />)

    expect(screen.getByText('No queries yet.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Ask' })).toBeDisabled()
  })

  it('submits a question and renders the answer with its sources and timing', async () => {
    const user = userEvent.setup()

    askQuestion.mockResolvedValue({
      question: 'How many leave days?',
      answer: 'You get **20** days.',
      contexts: [{ page: 1, text: 'Employees receive 20 days of annual leave.', score: 0.873 }],
      timing: { retrieval_ms: 12.5, generation_ms: 980.2 },
    })

    render(<PlaygroundView />)

    await user.type(screen.getByPlaceholderText('Ask a question…'), 'How many leave days?')
    await user.click(screen.getByRole('button', { name: 'Ask' }))

    expect(await screen.findByText('How many leave days?')).toBeInTheDocument()
    expect(await screen.findByText(/You get/)).toBeInTheDocument()
    expect(askQuestion).toHaveBeenCalledWith('How many leave days?')

    expect(screen.getByText('retrieval 13 ms')).toBeInTheDocument()
    expect(screen.getByText('generation 980 ms')).toBeInTheDocument()

    await user.click(screen.getByText('1 retrieved chunk(s)'))
    expect(screen.getByText(/Employees receive 20 days/)).toBeInTheDocument()
    expect(screen.getByText('vector score 0.873')).toBeInTheDocument()
  })

  it('shows an error message when the request fails', async () => {
    const user = userEvent.setup()

    askQuestion.mockRejectedValue(new Error('Generation failed'))

    render(<PlaygroundView />)

    await user.type(screen.getByPlaceholderText('Ask a question…'), 'anything')
    await user.click(screen.getByRole('button', { name: 'Ask' }))

    expect(await screen.findByText('Generation failed')).toBeInTheDocument()
  })

  it('disables the Ask button while a request is pending', async () => {
    const user = userEvent.setup()
    let resolveRequest
    askQuestion.mockReturnValue(new Promise((resolve) => (resolveRequest = resolve)))

    render(<PlaygroundView />)

    await user.type(screen.getByPlaceholderText('Ask a question…'), 'pending question')
    await user.click(screen.getByRole('button', { name: 'Ask' }))

    expect(screen.getByPlaceholderText('Ask a question…')).toBeDisabled()

    resolveRequest({ question: 'pending question', answer: 'done', contexts: [] })
  })
})
