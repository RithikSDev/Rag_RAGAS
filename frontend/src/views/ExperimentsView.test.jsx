import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  getEvaluationProgress,
  getRagasRun,
  getRagasRuns,
  getSettings,
  labelRun,
  runEvaluation,
  updateSettings,
} from '../lib/api'
import ExperimentsView from './ExperimentsView'

vi.mock('../lib/api')

const SETTINGS = {
  chunk_size: 500,
  chunk_overlap: 50,
  chunking_strategy: 'fixed',
  semantic_threshold: 0.75,
  top_k: 5,
}

const RUN_DETAIL = {
  id: 'run-1',
  status: 'completed',
  label: null,
  metrics: ['faithfulness'],
  average: { faithfulness: 0.87 },
  results: [],
}

describe('ExperimentsView', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    getSettings.mockResolvedValue(SETTINGS)
    getRagasRuns.mockResolvedValue({ runs: [] })
  })

  it('renders the current config controls', async () => {
    render(<ExperimentsView />)

    expect(await screen.findByText('500 chars')).toBeInTheDocument()
  })

  it('runs an experiment end to end: apply config, run eval, show result', async () => {
    const user = userEvent.setup()
    updateSettings.mockResolvedValue({ config: SETTINGS, documents: [] })
    runEvaluation.mockResolvedValue({ run_id: 'run-1', status: 'running' })
    getEvaluationProgress.mockResolvedValueOnce({
      status: 'completed',
      total_questions: 1,
      completed_questions: 1,
      current_question: null,
    })
    getRagasRun.mockResolvedValue(RUN_DETAIL)

    render(<ExperimentsView />)
    await screen.findByText('500 chars')

    await user.click(screen.getByRole('button', { name: 'Run experiment' }))

    expect(await screen.findByText('Experiment result')).toBeInTheDocument()
    expect(screen.getByText('87%')).toBeInTheDocument()
    expect(updateSettings).toHaveBeenCalled()
    expect(runEvaluation).toHaveBeenCalled()
  })

  it('labels a completed run', async () => {
    const user = userEvent.setup()
    updateSettings.mockResolvedValue({ config: SETTINGS, documents: [] })
    runEvaluation.mockResolvedValue({ run_id: 'run-1', status: 'running' })
    getEvaluationProgress.mockResolvedValueOnce({
      status: 'completed',
      total_questions: 1,
      completed_questions: 1,
      current_question: null,
    })
    getRagasRun.mockResolvedValue(RUN_DETAIL)
    labelRun.mockResolvedValue({ ...RUN_DETAIL, label: 'baseline' })

    render(<ExperimentsView />)
    await screen.findByText('500 chars')
    await user.click(screen.getByRole('button', { name: 'Run experiment' }))
    await screen.findByText('Experiment result')

    await user.type(screen.getByPlaceholderText(/Label this run/), 'baseline')
    await user.click(screen.getByRole('button', { name: 'Save label' }))

    await waitFor(() => expect(labelRun).toHaveBeenCalledWith('run-1', { label: 'baseline' }))
    expect(await screen.findByText('Currently labeled: baseline')).toBeInTheDocument()
  })

  it('shows a failed experiment without crashing', async () => {
    const user = userEvent.setup()
    updateSettings.mockResolvedValue({ config: SETTINGS, documents: [] })
    runEvaluation.mockResolvedValue({ run_id: 'run-1', status: 'running' })
    getEvaluationProgress.mockResolvedValue({
      status: 'failed',
      total_questions: 1,
      completed_questions: 0,
      current_question: null,
      error_message: 'no evaluation questions in the dataset',
    })

    render(<ExperimentsView />)
    await screen.findByText('500 chars')
    await user.click(screen.getByRole('button', { name: 'Run experiment' }))

    expect(await screen.findByText('no evaluation questions in the dataset')).toBeInTheDocument()
  })

  it('renders experiment history from past runs', async () => {
    getRagasRuns.mockResolvedValue({
      runs: [{ id: 'run-0', status: 'completed', label: 'baseline', started_at: '2026-01-01T00:00:00Z' }],
    })

    render(<ExperimentsView />)

    expect(await screen.findByText('Experiment history')).toBeInTheDocument()
    expect(screen.getByText('baseline')).toBeInTheDocument()
  })
})
