import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  getDataset,
  getDocuments,
  getMetricsSummary,
  getRagasRuns,
  getRagasScores,
  getSettings,
} from '../lib/api'
import OverviewView from './OverviewView'

vi.mock('../lib/api')

const SETTINGS = {
  chunk_size: 500,
  chunk_overlap: 50,
  chunking_strategy: 'fixed',
  semantic_threshold: 0.75,
  top_k: 5,
}

function setupMocks({ scores = { metrics: [], average: {}, results: [] }, runs = [], documents = 2 } = {}) {
  getMetricsSummary.mockResolvedValue({
    documents,
    chunks: 40,
    eval_questions: 5,
    avg_retrieval_ms: 12.4,
    avg_generation_ms: 987.6,
  })
  getSettings.mockResolvedValue(SETTINGS)
  getDocuments.mockResolvedValue({ documents: [] })
  getDataset.mockResolvedValue({ questions: [] })
  getRagasScores.mockResolvedValue(scores)
  getRagasRuns.mockResolvedValue({ runs })
}

describe('OverviewView', () => {
  beforeEach(() => {
    vi.resetAllMocks()
  })

  it('renders the KPI row with real summary data', async () => {
    setupMocks()

    render(<OverviewView />)

    expect(await screen.findByText('2')).toBeInTheDocument() // documents
    expect(screen.getByText('40')).toBeInTheDocument() // chunks
    expect(screen.getByText('12 ms')).toBeInTheDocument() // avg retrieval
    expect(screen.getByText('988 ms')).toBeInTheDocument() // avg generation, rounded
  })

  it('shows a getting-started banner and navigates to Knowledge Base when there are zero documents', async () => {
    setupMocks({ documents: 0 })
    const onNavigate = vi.fn()
    const user = userEvent.setup()

    render(<OverviewView onNavigate={onNavigate} />)

    await screen.findByText('Get started')
    await user.click(screen.getByRole('button', { name: 'Upload a document' }))

    expect(onNavigate).toHaveBeenCalledWith('knowledge-base')
  })

  it('does not show the getting-started banner once documents exist', async () => {
    setupMocks() // default documents: 2

    render(<OverviewView />)

    await screen.findByText('Documents')
    expect(screen.queryByText('Get started')).not.toBeInTheDocument()
  })

  it('shows an empty state and a link to Evaluation when no scores exist yet', async () => {
    setupMocks()
    const onNavigate = vi.fn()

    render(<OverviewView onNavigate={onNavigate} />)

    const link = await screen.findByRole('button', { name: 'Run an evaluation' })
    await userEvent.setup().click(link)

    expect(onNavigate).toHaveBeenCalledWith('evaluation')
  })

  it('renders RAGAS score cards and computes a real trend from run history', async () => {
    setupMocks({
      scores: {
        metrics: ['faithfulness'],
        average: { faithfulness: 0.9 },
        results: [{}],
      },
      runs: [
        { id: 'run-2', status: 'completed', average: { faithfulness: 0.9 } },
        { id: 'run-1', status: 'completed', average: { faithfulness: 0.78 } },
      ],
    })

    render(<OverviewView />)

    expect(await screen.findByText('90%')).toBeInTheDocument()
    // 0.90 - 0.78 = 0.12 -> +12%
    expect(screen.getByText('↑ 12%')).toBeInTheDocument()
  })

  it('navigating from a RAGAS card calls onNavigate with evaluation', async () => {
    setupMocks({
      scores: { metrics: ['faithfulness'], average: { faithfulness: 0.9 }, results: [{}] },
    })
    const onNavigate = vi.fn()
    const user = userEvent.setup()

    render(<OverviewView onNavigate={onNavigate} />)

    await user.click(await screen.findByText('90%'))
    expect(onNavigate).toHaveBeenCalledWith('evaluation')
  })

  it('renders the pipeline diagram once settings load', async () => {
    setupMocks()

    render(<OverviewView />)

    expect(await screen.findByText('Chunking')).toBeInTheDocument()
    expect(screen.getByText('RAG Pipeline')).toBeInTheDocument()
  })

  it('surfaces a load error without crashing', async () => {
    getMetricsSummary.mockRejectedValue(new Error('backend unreachable'))
    getSettings.mockResolvedValue(SETTINGS)
    getDocuments.mockResolvedValue({ documents: [] })
    getDataset.mockResolvedValue({ questions: [] })
    getRagasScores.mockResolvedValue({ metrics: [], average: {}, results: [] })
    getRagasRuns.mockResolvedValue({ runs: [] })

    render(<OverviewView />)

    await waitFor(() => expect(screen.getByText('backend unreachable')).toBeInTheDocument())
  })
})
