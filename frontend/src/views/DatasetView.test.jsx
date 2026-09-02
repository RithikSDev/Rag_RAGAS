import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import ConfirmDialog from '../components/ConfirmDialog'
import {
  createDatasetQuestion,
  deleteDatasetQuestion,
  getDataset,
  importDataset,
  updateDatasetQuestion,
} from '../lib/api'
import DatasetView from './DatasetView'

vi.mock('../lib/api')

const QUESTION = {
  id: 'q1',
  user_input: 'How many annual leave days?',
  reference: '25 days per year.',
  source: 'seed',
  created_at: '2026-01-01T00:00:00Z',
  created_by: 'system',
}

describe('DatasetView', () => {
  beforeEach(() => {
    vi.resetAllMocks()
  })

  it('shows the empty state when there are no questions', async () => {
    getDataset.mockResolvedValue({ questions: [] })

    render(<DatasetView onDatasetChanged={() => {}} />)

    expect(await screen.findByText('No dataset questions yet.')).toBeInTheDocument()
  })

  it('renders a card per question and reports the count', async () => {
    const onDatasetChanged = vi.fn()
    getDataset.mockResolvedValue({ questions: [QUESTION] })

    render(<DatasetView onDatasetChanged={onDatasetChanged} />)

    expect(await screen.findByText('How many annual leave days?')).toBeInTheDocument()
    expect(screen.getByText('25 days per year.')).toBeInTheDocument()
    await waitFor(() => expect(onDatasetChanged).toHaveBeenCalledWith(1))
  })

  it('adds a new question', async () => {
    const user = userEvent.setup()
    getDataset.mockResolvedValue({ questions: [] })
    createDatasetQuestion.mockResolvedValue({ ...QUESTION, id: 'q2' })

    render(<DatasetView onDatasetChanged={() => {}} />)
    await screen.findByText('No dataset questions yet.')

    await user.type(screen.getByPlaceholderText('New question…'), 'What is the notice period?')
    await user.type(screen.getByPlaceholderText('Reference answer…'), '30 days.')
    await user.click(screen.getByRole('button', { name: 'Add question' }))

    await waitFor(() =>
      expect(createDatasetQuestion).toHaveBeenCalledWith({
        user_input: 'What is the notice period?',
        reference: '30 days.',
      })
    )
  })

  it('edits an existing question', async () => {
    const user = userEvent.setup()
    getDataset.mockResolvedValue({ questions: [QUESTION] })
    updateDatasetQuestion.mockResolvedValue({ ...QUESTION, user_input: 'Updated question' })

    render(<DatasetView onDatasetChanged={() => {}} />)
    await screen.findByText('How many annual leave days?')

    await user.click(screen.getByRole('button', { name: 'Edit' }))
    const [textarea] = screen.getAllByDisplayValue('How many annual leave days?')
    await user.clear(textarea)
    await user.type(textarea, 'Updated question')
    await user.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(() => expect(updateDatasetQuestion).toHaveBeenCalledWith('q1', expect.any(Object)))
  })

  it('asks for confirmation before deleting, and does nothing on cancel', async () => {
    const user = userEvent.setup()
    getDataset.mockResolvedValue({ questions: [QUESTION] })

    render(
      <>
        <DatasetView onDatasetChanged={() => {}} />
        <ConfirmDialog />
      </>
    )
    await screen.findByText('How many annual leave days?')

    await user.click(screen.getByRole('button', { name: 'Delete' }))
    expect(await screen.findByText('Delete this question?')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Cancel' }))

    expect(deleteDatasetQuestion).not.toHaveBeenCalled()
  })

  it('deletes a question once confirmed', async () => {
    const user = userEvent.setup()
    getDataset.mockResolvedValue({ questions: [QUESTION] })
    deleteDatasetQuestion.mockResolvedValue({ deleted: 'q1' })

    render(
      <>
        <DatasetView onDatasetChanged={() => {}} />
        <ConfirmDialog />
      </>
    )
    await screen.findByText('How many annual leave days?')

    await user.click(screen.getByRole('button', { name: 'Delete' }))
    const dialog = await screen.findByText('Delete this question?')
    await user.click(within(dialog.closest('.confirm-dialog')).getByRole('button', { name: 'Delete' }))

    await waitFor(() => expect(deleteDatasetQuestion).toHaveBeenCalledWith('q1'))
  })

  it('imports a dataset file and shows the imported count', async () => {
    const user = userEvent.setup()
    getDataset.mockResolvedValue({ questions: [] })
    importDataset.mockResolvedValue({ imported: 3, questions: [] })

    render(<DatasetView onDatasetChanged={() => {}} />)
    await screen.findByText('No dataset questions yet.')

    const file = new File(['user_input,reference\nQ,A'], 'questions.csv', { type: 'text/csv' })
    const input = document.querySelector('input[type="file"]')
    await user.upload(input, file)

    expect(await screen.findByText('Imported 3 question(s).')).toBeInTheDocument()
    expect(importDataset).toHaveBeenCalledWith(file)
  })
})
