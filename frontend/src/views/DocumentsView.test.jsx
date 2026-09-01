import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getDocuments, uploadDocument } from '../lib/api'
import DocumentsView from './DocumentsView'

vi.mock('../lib/api')

describe('DocumentsView', () => {
  beforeEach(() => {
    vi.resetAllMocks()
  })

  it('shows the empty state when there are no documents', async () => {
    getDocuments.mockResolvedValue({ documents: [] })

    render(<DocumentsView onDocumentsChanged={() => {}} />)

    expect(await screen.findByText('No documents indexed.')).toBeInTheDocument()
  })

  it('renders a card per ingested document', async () => {
    getDocuments.mockResolvedValue({
      documents: [{ name: 'handbook.pdf', chunks: 3, ingested_at: '2026-01-01T00:00:00Z' }],
    })

    render(<DocumentsView onDocumentsChanged={() => {}} />)

    expect(await screen.findByText('handbook.pdf')).toBeInTheDocument()
    expect(screen.getByText('3 chunks')).toBeInTheDocument()
  })

  it('reports the document count to the parent', async () => {
    const onDocumentsChanged = vi.fn()
    getDocuments.mockResolvedValue({
      documents: [{ name: 'a.pdf', chunks: 1, ingested_at: '2026-01-01T00:00:00Z' }],
    })

    render(<DocumentsView onDocumentsChanged={onDocumentsChanged} />)

    await waitFor(() => expect(onDocumentsChanged).toHaveBeenCalledWith(1))
  })

  it('uploads a file and refreshes the list', async () => {
    const user = userEvent.setup()

    getDocuments
      .mockResolvedValueOnce({ documents: [] })
      .mockResolvedValueOnce({
        documents: [{ name: 'new.pdf', chunks: 2, ingested_at: '2026-01-01T00:00:00Z' }],
      })
    uploadDocument.mockResolvedValue({ name: 'new.pdf', chunks: 2 })

    render(<DocumentsView onDocumentsChanged={() => {}} />)
    await screen.findByText('No documents indexed.')

    const file = new File(['%PDF-1.4'], 'new.pdf', { type: 'application/pdf' })
    const input = document.querySelector('input[type="file"]')

    await user.upload(input, file)

    expect(await screen.findByText('new.pdf')).toBeInTheDocument()
    expect(uploadDocument).toHaveBeenCalledWith(file)
  })

  it('surfaces an upload error without crashing', async () => {
    const user = userEvent.setup()

    getDocuments.mockResolvedValue({ documents: [] })
    // Rejection reason doesn't depend on the file's own name/content here -
    // it's whatever the (mocked) backend call rejects with.
    uploadDocument.mockRejectedValue(new Error('Could not process file as a valid PDF'))

    render(<DocumentsView onDocumentsChanged={() => {}} />)
    await screen.findByText('No documents indexed.')

    // input[accept="application/pdf"] - user-event honors accept when
    // simulating the picker, so the fixture file must carry a pdf MIME type.
    const file = new File(['%PDF-1.4 corrupt'], 'bad.pdf', { type: 'application/pdf' })
    const input = document.querySelector('input[type="file"]')

    await user.upload(input, file)

    expect(await screen.findByText('Could not process file as a valid PDF')).toBeInTheDocument()
  })
})
