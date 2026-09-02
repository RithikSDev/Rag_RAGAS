import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getRagasRuns, getRagasScores, getThresholds, runEvaluation } from '../lib/api'
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
        faithfulness: { value: 0.6 },
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

  it('renders run history when past runs exist', async () => {
    getRagasRuns.mockResolvedValue({
      runs: [
        {
          id: 'run-1',
          started_at: '2026-01-01T00:00:00Z',
          average: SCORES.average,
          triggered_by: 'admin (env-seeded)',
        },
      ],
    })

    render(<EvaluationView />)

    expect(await screen.findByText('Run history')).toBeInTheDocument()
    expect(screen.getByText('by admin (env-seeded)')).toBeInTheDocument()
  })

  it('re-runs evaluation and refreshes run history', async () => {
    const user = userEvent.setup()
    runEvaluation.mockResolvedValue(SCORES)

    render(<EvaluationView />)
    await screen.findAllByText('60%') // "wait for loaded" checkpoint; the value legitimately appears in both the KPI tile and the results row

    await user.click(screen.getByRole('button', { name: 'Run evaluation' }))

    await waitFor(() => expect(runEvaluation).toHaveBeenCalled())
    await waitFor(() => expect(getRagasRuns).toHaveBeenCalledTimes(2)) // once on mount, once after run
  })
})
