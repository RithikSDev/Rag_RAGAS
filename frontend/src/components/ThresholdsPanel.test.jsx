import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getThresholds, updateThresholds } from '../lib/api'
import ThresholdsPanel from './ThresholdsPanel'

vi.mock('../lib/api')

const SAMPLE_THRESHOLDS = {
  faithfulness: { good: 0.8, warning: 0.5 },
  answer_relevancy: { good: 0.8, warning: 0.5 },
  context_precision: { good: 0.8, warning: 0.5 },
  context_recall: { good: 0.8, warning: 0.5 },
}

describe('ThresholdsPanel', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    getThresholds.mockResolvedValue({ thresholds: SAMPLE_THRESHOLDS })
  })

  it('loads and renders a row per metric', async () => {
    render(<ThresholdsPanel currentAverages={{}} onSaved={() => {}} />)

    expect(await screen.findByText('Faithfulness')).toBeInTheDocument()
    expect(screen.getByText('Answer Relevancy')).toBeInTheDocument()
    expect(screen.getByText('Context Precision')).toBeInTheDocument()
    expect(screen.getByText('Context Recall')).toBeInTheDocument()
  })

  it('shows the current average score when provided', async () => {
    render(<ThresholdsPanel currentAverages={{ faithfulness: 0.87 }} onSaved={() => {}} />)

    expect(await screen.findByText('current avg: 87%')).toBeInTheDocument()
  })

  it('Save is disabled until a slider changes', async () => {
    render(<ThresholdsPanel currentAverages={{}} onSaved={() => {}} />)

    await screen.findByText('Faithfulness')
    expect(screen.getByRole('button', { name: 'Save thresholds' })).toBeDisabled()
  })

  it('dragging a slider enables Save and persists the change', async () => {
    const user = userEvent.setup()
    updateThresholds.mockResolvedValue({
      thresholds: { ...SAMPLE_THRESHOLDS, faithfulness: { good: 0.9, warning: 0.5 } },
    })

    render(<ThresholdsPanel currentAverages={{}} onSaved={() => {}} />)

    const row = (await screen.findByText('Faithfulness')).closest('.threshold-row')
    const goodSlider = within(row).getByLabelText(/Good at or above/)

    fireEvent.change(goodSlider, { target: { value: '0.9' } })

    const saveButton = screen.getByRole('button', { name: 'Save thresholds' })
    await waitFor(() => expect(saveButton).toBeEnabled())

    await user.click(saveButton)

    await waitFor(() => expect(updateThresholds).toHaveBeenCalled())
    const [payload] = updateThresholds.mock.calls[0]
    expect(payload.faithfulness.good).toBe(0.9)
  })

  it('calls onSaved with the persisted thresholds', async () => {
    const onSaved = vi.fn()
    updateThresholds.mockResolvedValue({
      thresholds: { ...SAMPLE_THRESHOLDS, faithfulness: { good: 0.9, warning: 0.5 } },
    })

    render(<ThresholdsPanel currentAverages={{}} onSaved={onSaved} />)

    const row = (await screen.findByText('Faithfulness')).closest('.threshold-row')
    const goodSlider = within(row).getByLabelText(/Good at or above/)
    fireEvent.change(goodSlider, { target: { value: '0.9' } })

    await waitFor(() => expect(screen.getByRole('button', { name: 'Save thresholds' })).toBeEnabled())
    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: 'Save thresholds' }))

    await waitFor(() =>
      expect(onSaved).toHaveBeenCalledWith(
        expect.objectContaining({ faithfulness: { good: 0.9, warning: 0.5 } })
      )
    )
  })

  it('surfaces a save error without crashing', async () => {
    const user = userEvent.setup()
    updateThresholds.mockRejectedValue(new Error('good threshold must be greater than warning threshold'))

    render(<ThresholdsPanel currentAverages={{}} onSaved={() => {}} />)

    const row = (await screen.findByText('Faithfulness')).closest('.threshold-row')
    const warningSlider = within(row).getByLabelText(/Needs review below/)
    fireEvent.change(warningSlider, { target: { value: '0.51' } })

    await waitFor(() => expect(screen.getByRole('button', { name: 'Save thresholds' })).toBeEnabled())
    await user.click(screen.getByRole('button', { name: 'Save thresholds' }))

    expect(await screen.findByText(/good threshold must be greater/)).toBeInTheDocument()
  })
})
