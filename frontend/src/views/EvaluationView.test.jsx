import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  getEvaluationProgress,
  getRagasRuns,
  getRagasScores,
  getThresholds,
  runEvaluation,
} from '../lib/api'
import EvaluationView from './EvaluationView'

vi.mock('../lib/api')

const SCORES = {
  metrics: ['faithfulness', 'answer_relevancy', 'context_precision', 'context_recall'],
  average: { faithfulness: 0.6, answer_relevancy: 0.9, context_precision: 0.9, context_recall: 0.9 },
  config: { chunking_strategy: 'fixed', chunk_size: 500, chunk_overlap: 50, top_k: 5 },
  results: [
    {
      user_input: 'How many annual leave days?',
      response: 'answer',
      reference: 'ref',
      scores: {
        faithfulness: { value: 0.6, reason: 'answer includes an unsupported claim' },
        answer_relevancy: { value: 0.9 },
        context_precision: { value: 0.9 },
        context_recall: { value: 0.9 },
      },
    },
  ],
}

const CUSTOM_THRESHOLDS = {
  faithfulness: { good: 0.95, warning: 0.7 }, // 0.6 now falls to "critical" under a stricter bar
  answer_relevancy: { good: 0.8, warning: 0.5 },
  context_precision: { good: 0.8, warning: 0.5 },
  context_recall: { good: 0.8, warning: 0.5 },
}

describe('EvaluationView', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    getRagasScores.mockResolvedValue(SCORES)
    getThresholds.mockResolvedValue({ thresholds: CUSTOM_THRESHOLDS })
    getRagasRuns.mockResolvedValue({ runs: [] })
  })

  it('classifies scores using fetched thresholds, not hardcoded ones', async () => {
    render(<EvaluationView />)

    // 60% faithfulness would be "Needs review" under the old hardcoded 0.8/0.5
    // bar, but under CUSTOM_THRESHOLDS (good=0.95) it must show as "Poor".
    await screen.findAllByText('60%') // "wait for loaded" checkpoint; the value legitimately appears in both the KPI tile and the results row
    const tiles = document.querySelectorAll('.kpi-tile')
    const faithfulnessTile = Array.from(tiles).find((tile) => tile.textContent.includes('Faithfulness'))
    expect(within(faithfulnessTile).getByText('Poor')).toBeInTheDocument()
  })

  it('toggles the thresholds panel', async () => {
    const user = userEvent.setup()
    render(<EvaluationView />)

    await screen.findAllByText('60%') // "wait for loaded" checkpoint; the value legitimately appears in both the KPI tile and the results row
    expect(screen.queryByText('Quality thresholds')).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Configure thresholds' }))
    expect(await screen.findByText('Quality thresholds')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Hide thresholds' }))
    expect(screen.queryByText('Quality thresholds')).not.toBeInTheDocument()
  })

  it('renders run history for completed runs only', async () => {
    getRagasRuns.mockResolvedValue({
      runs: [
        {
          id: 'run-1',
          status: 'completed',
          started_at: '2026-01-01T00:00:00Z',
          average: SCORES.average,
          triggered_by: 'admin (env-seeded)',
        },
        {
          id: 'run-2',
          status: 'failed',
          started_at: '2026-01-02T00:00:00Z',
          average: null,
          triggered_by: 'admin (env-seeded)',
        },
      ],
    })

    render(<EvaluationView />)

    expect(await screen.findByText('Run history')).toBeInTheDocument()
    expect(screen.getAllByText('by admin (env-seeded)')).toHaveLength(1)
  })

  it('runs evaluation via the async start/poll flow and refreshes run history', async () => {
    const user = userEvent.setup()
    runEvaluation.mockResolvedValue({ run_id: 'run-9', status: 'running' })
    getEvaluationProgress
      .mockResolvedValueOnce({ status: 'running', total_questions: 2, completed_questions: 0, current_question: 'Q1' })
      .mockResolvedValueOnce({ status: 'completed', total_questions: 2, completed_questions: 2, current_question: null })

    render(<EvaluationView />)
    await screen.findAllByText('60%') // "wait for loaded" checkpoint; the value legitimately appears in both the KPI tile and the results row

    await user.click(screen.getByRole('button', { name: 'Run evaluation' }))

    expect(await screen.findByText('scoring: Q1')).toBeInTheDocument()

    await waitFor(() => expect(getEvaluationProgress).toHaveBeenCalledTimes(2))
    await waitFor(() => expect(getRagasRuns).toHaveBeenCalledTimes(2)) // once on mount, once after run
    await waitFor(() => expect(screen.queryByText(/scoring:/)).not.toBeInTheDocument())
  })

  it('surfaces a failed run without crashing', async () => {
    const user = userEvent.setup()
    runEvaluation.mockResolvedValue({ run_id: 'run-9', status: 'running' })
    getEvaluationProgress.mockResolvedValue({
      status: 'failed',
      total_questions: 2,
      completed_questions: 1,
      current_question: null,
      error_message: 'pipeline crashed',
    })

    render(<EvaluationView />)
    await screen.findAllByText('60%')

    await user.click(screen.getByRole('button', { name: 'Run evaluation' }))

    expect(await screen.findByText('pipeline crashed')).toBeInTheDocument()
  })

  it('clicking a metric tile drills down to its failed questions', async () => {
    const user = userEvent.setup()
    render(<EvaluationView />)

    await screen.findAllByText('60%')

    // "Faithfulness" also appears in the Diagnostics panel's recommendation
    // card, so scope the click to the KPI tile specifically.
    const tiles = document.querySelectorAll('.kpi-tile')
    const faithfulnessTile = Array.from(tiles).find((tile) => tile.textContent.includes('Faithfulness'))
    await user.click(faithfulnessTile)

    expect(await screen.findByText('Failed questions — Faithfulness')).toBeInTheDocument()
    // "How many annual leave days?" also appears in the full results table
    // below, so scope these assertions to the focused-results panel.
    const focused = within(document.querySelector('.focused-results'))
    expect(focused.getByText('How many annual leave days?')).toBeInTheDocument()
    expect(focused.getByText('answer includes an unsupported claim')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Clear filter' }))
    expect(screen.queryByText('Failed questions — Faithfulness')).not.toBeInTheDocument()
  })

  it('shows a diagnostic recommendation for a metric below threshold', async () => {
    render(<EvaluationView />)

    expect(await screen.findByText('Diagnostics')).toBeInTheDocument()
    expect(
      screen.getByText('Generated answers include claims not grounded in the retrieved context.')
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Open Settings' })).toBeInTheDocument()
  })
})
