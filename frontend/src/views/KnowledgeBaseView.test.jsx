import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getDocumentChunks, getDocuments, uploadDocument } from '../lib/api'
import KnowledgeBaseView from './KnowledgeBaseView'

vi.mock('../lib/api')

describe('KnowledgeBaseView', () => {
  beforeEach(() => {
    vi.resetAllMocks()
  })

  it('shows the empty state when there are no documents', async () => {
    getDocuments.mockResolvedValue({ documents: [] })

    render(<KnowledgeBaseView onDocumentsChanged={() => {}} />)

    expect(await screen.findByText('No documents indexed.')).toBeInTheDocument()
  })

  it('renders a card per ingested document', async () => {
    getDocuments.mockResolvedValue({
      documents: [{ id: 'doc-1', name: 'handbook.pdf', chunks: 3, ingested_at: '2026-01-01T00:00:00Z' }],
    })

    render(<KnowledgeBaseView onDocumentsChanged={() => {}} />)

    expect(await screen.findByText('handbook.pdf')).toBeInTheDocument()
    expect(screen.getByText('3 chunks')).toBeInTheDocument()
  })

  it('reports the document count to the parent', async () => {
    const onDocumentsChanged = vi.fn()
    getDocuments.mockResolvedValue({
      documents: [{ id: 'doc-1', name: 'a.pdf', chunks: 1, ingested_at: '2026-01-01T00:00:00Z' }],
    })

    render(<KnowledgeBaseView onDocumentsChanged={onDocumentsChanged} />)

    await waitFor(() => expect(onDocumentsChanged).toHaveBeenCalledWith(1))
  })

  it('uploads a file and refreshes the list', async () => {
    const user = userEvent.setup()

    getDocuments
      .mockResolvedValueOnce({ documents: [] })
      .mockResolvedValueOnce({
        documents: [{ id: 'doc-1', name: 'new.pdf', chunks: 2, ingested_at: '2026-01-01T00:00:00Z' }],
      })
    uploadDocument.mockResolvedValue({ id: 'doc-1', name: 'new.pdf', chunks: 2 })

    render(<KnowledgeBaseView onDocumentsChanged={() => {}} />)
    await screen.findByText('No documents indexed.')

    const file = new File(['%PDF-1.4'], 'new.pdf', { type: 'application/pdf' })
    const input = document.querySelector('input[type="file"]')

    await user.upload(input, file)

    // "new.pdf" legitimately appears twice once ingestion completes: once in
    // the upload-progress log, once in the refreshed document card.
    expect(await screen.findByText('✓ completed')).toBeInTheDocument()
    expect(uploadDocument).toHaveBeenCalledWith(file)
    expect(screen.getAllByText('new.pdf')).toHaveLength(2)
  })

  it('uploads multiple files sequentially with per-file status', async () => {
    const user = userEvent.setup()

    getDocuments.mockResolvedValue({ documents: [] })
    uploadDocument.mockResolvedValue({ id: 'doc-x', name: 'x.pdf', chunks: 1 })

    render(<KnowledgeBaseView onDocumentsChanged={() => {}} />)
    await screen.findByText('No documents indexed.')

    const fileA = new File(['%PDF-1.4'], 'a.pdf', { type: 'application/pdf' })
    const fileB = new File(['%PDF-1.4'], 'b.pdf', { type: 'application/pdf' })
    const input = document.querySelector('input[type="file"]')

    await user.upload(input, [fileA, fileB])

    await waitFor(() => expect(uploadDocument).toHaveBeenCalledTimes(2))
    expect(screen.getByText('a.pdf')).toBeInTheDocument()
    expect(screen.getByText('b.pdf')).toBeInTheDocument()
  })

  it('surfaces an upload error and offers retry', async () => {
    const user = userEvent.setup()

    getDocuments.mockResolvedValue({ documents: [] })
    uploadDocument.mockRejectedValue(new Error('Could not process file as a valid PDF'))

    render(<KnowledgeBaseView onDocumentsChanged={() => {}} />)
    await screen.findByText('No documents indexed.')

    const file = new File(['%PDF-1.4 corrupt'], 'bad.pdf', { type: 'application/pdf' })
    const input = document.querySelector('input[type="file"]')

    await user.upload(input, file)

    expect(await screen.findByText('Could not process file as a valid PDF')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '↻ retry' })).toBeInTheDocument()
  })

  it('retrying a failed upload calls uploadDocument again', async () => {
    const user = userEvent.setup()

    getDocuments.mockResolvedValue({ documents: [] })
    uploadDocument.mockRejectedValueOnce(new Error('boom')).mockResolvedValueOnce({
      id: 'doc-1',
      name: 'retry.pdf',
      chunks: 1,
    })

    render(<KnowledgeBaseView onDocumentsChanged={() => {}} />)
    await screen.findByText('No documents indexed.')

    const file = new File(['%PDF-1.4'], 'retry.pdf', { type: 'application/pdf' })
    const input = document.querySelector('input[type="file"]')
    await user.upload(input, file)

    await screen.findByRole('button', { name: '↻ retry' })
    await user.click(screen.getByRole('button', { name: '↻ retry' }))

    await waitFor(() => expect(uploadDocument).toHaveBeenCalledTimes(2))
    expect(await screen.findByText('✓ completed')).toBeInTheDocument()
  })

  it('expands a document to show its chunks', async () => {
    const user = userEvent.setup()

    getDocuments.mockResolvedValue({
      documents: [{ id: 'doc-1', name: 'handbook.pdf', chunks: 2, ingested_at: '2026-01-01T00:00:00Z' }],
    })
    getDocumentChunks.mockResolvedValue({
      chunks: [
        { id: 'c1', text: 'First chunk text', page: 1, document_id: 'doc-1' },
        { id: 'c2', text: 'Second chunk text', page: 2, document_id: 'doc-1' },
      ],
    })

    render(<KnowledgeBaseView onDocumentsChanged={() => {}} />)

    await user.click(await screen.findByText('handbook.pdf'))

    expect(await screen.findByText('First chunk text')).toBeInTheDocument()
    expect(screen.getByText('Second chunk text')).toBeInTheDocument()
    expect(getDocumentChunks).toHaveBeenCalledWith('doc-1')
  })

  it('shows a helpful message when a document has no tagged chunks yet', async () => {
    const user = userEvent.setup()

    getDocuments.mockResolvedValue({
      documents: [{ id: 'doc-1', name: 'old.pdf', chunks: 2, ingested_at: '2026-01-01T00:00:00Z' }],
    })
    getDocumentChunks.mockResolvedValue({ chunks: [] })

    render(<KnowledgeBaseView onDocumentsChanged={() => {}} />)
    await user.click(await screen.findByText('old.pdf'))

    expect(await screen.findByText(/No chunks tagged for this document yet/)).toBeInTheDocument()
  })
})
