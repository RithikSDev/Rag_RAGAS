import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getRagasRun, getRagasRuns } from '../lib/api'
import CompareView from './CompareView'

vi.mock('../lib/api')

const RUN_A = {
  id: 'run-aaaaaaaa',
  status: 'completed',
  label: 'baseline',
  metrics: ['faithfulness'],
  average: { faithfulness: 0.7 },
  config: { chunking_strategy: 'fixed', top_k: 5 },
}

const RUN_B = {
  id: 'run-bbbbbbbb',
  status: 'completed',
  label: 'higher top_k',
  metrics: ['faithfulness'],
  average: { faithfulness: 0.85 },
  config: { chunking_strategy: 'fixed', top_k: 10 },
}

describe('CompareView', () => {
  beforeEach(() => {
    vi.resetAllMocks()
  })

  it('shows an empty state with fewer than two completed runs', async () => {
    getRagasRuns.mockResolvedValue({ runs: [{ ...RUN_A }] })

    render(<CompareView />)

    expect(await screen.findByText('Not enough completed runs to compare yet.')).toBeInTheDocument()
  })

  it('auto-selects the two most recent runs and renders the diff table', async () => {
    getRagasRuns.mockResolvedValue({ runs: [RUN_B, RUN_A] }) // most recent first
    getRagasRun.mockImplementation((id) => Promise.resolve(id === RUN_A.id ? RUN_A : RUN_B))

    render(<CompareView />)

    expect(await screen.findByText('70%')).toBeInTheDocument()
    expect(screen.getByText('85%')).toBeInTheDocument()
    expect(screen.getByText('↑ 15%')).toBeInTheDocument()
  })

  it('switching the experiment picker loads a different run', async () => {
    const user = userEvent.setup()
    getRagasRuns.mockResolvedValue({ runs: [RUN_B, RUN_A] })
    getRagasRun.mockImplementation((id) => Promise.resolve(id === RUN_A.id ? RUN_A : RUN_B))

    render(<CompareView />)
    await screen.findByText('↑ 15%')

    const [, experimentSelect] = screen.getAllByRole('combobox')
    await user.selectOptions(experimentSelect, RUN_A.id)

    expect(await screen.findByText('±0%')).toBeInTheDocument()
  })
})
