import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { debugRetrieval } from '../lib/api'
import RetrievalDebuggerView from './RetrievalDebuggerView'

vi.mock('../lib/api')

const RESULT = {
  query: 'How many annual leave days?',
  vector_results: [{ id: 'c1', text: 'Employees get 25 days of annual leave.', page: 2, score: 0.91 }],
  bm25_results: [{ id: 'c1', text: 'Employees get 25 days of annual leave.', page: 2, score: 4.2 }],
  hybrid_results: [
    {
      id: 'c1',
      text: 'Employees get 25 days of annual leave.',
      page: 2,
      score: 0.95,
      vector_score: 1.0,
      bm25_score: 1.0,
      in_vector: true,
      in_bm25: true,
    },
  ],
  reranked_results: [
    {
      id: 'c1',
      text: 'Employees get 25 days of annual leave.',
      page: 2,
      score: 0.95,
      rerank_score: 3.8,
    },
  ],
  final_context: [{ id: 'c1', text: 'Employees get 25 days of annual leave.', page: 2, score: 0.95 }],
}

describe('RetrievalDebuggerView', () => {
  beforeEach(() => {
    vi.resetAllMocks()
  })

  it('shows an empty state before any debug run', () => {
    render(<RetrievalDebuggerView />)

    expect(screen.getByText('No debug run yet.')).toBeInTheDocument()
  })

  it('runs a debug search with the current controls and shows reranked results by default', async () => {
    const user = userEvent.setup()
    debugRetrieval.mockResolvedValue(RESULT)

    render(<RetrievalDebuggerView />)

    await user.type(screen.getByPlaceholderText('Enter a query to debug…'), 'How many annual leave days?')
    await user.click(screen.getByRole('button', { name: 'Run retrieval debug' }))

    expect(await screen.findByText('Employees get 25 days of annual leave.')).toBeInTheDocument()
    expect(debugRetrieval).toHaveBeenCalledWith(
      expect.objectContaining({ query: 'How many annual leave days?', use_reranker: true, vector_weight: 0.7 })
    )

    const rerankedTab = screen.getByRole('button', { name: /Reranked/ })
    expect(rerankedTab).toHaveClass('active')
  })

  it('switches stages and shows stage-specific scores', async () => {
    const user = userEvent.setup()
    debugRetrieval.mockResolvedValue(RESULT)

    render(<RetrievalDebuggerView />)
    await user.type(screen.getByPlaceholderText('Enter a query to debug…'), 'q')
    await user.click(screen.getByRole('button', { name: 'Run retrieval debug' }))
    await screen.findByText('Employees get 25 days of annual leave.')

    await user.click(screen.getByRole('button', { name: /Hybrid Fusion/ }))

    expect(screen.getByText('vector 1.000')).toBeInTheDocument()
    expect(screen.getByText('bm25 1.000')).toBeInTheDocument()
    expect(screen.getByText('both')).toBeInTheDocument()
  })

  it('adjusting the vector weight slider keeps vector+BM25 complementary', async () => {
    render(<RetrievalDebuggerView />)

    const slider = screen.getByLabelText(/Vector \d+% \/ BM25 \d+%/)
    fireEvent.change(slider, { target: { value: '0.3' } })

    expect(screen.getByText('Vector 30% / BM25 70%')).toBeInTheDocument()
  })

  it('surfaces a request error', async () => {
    const user = userEvent.setup()
    debugRetrieval.mockRejectedValue(new Error('query must not be empty'))

    render(<RetrievalDebuggerView />)
    await user.type(screen.getByPlaceholderText('Enter a query to debug…'), 'q')
    await user.click(screen.getByRole('button', { name: 'Run retrieval debug' }))

    expect(await screen.findByText('query must not be empty')).toBeInTheDocument()
  })
})
