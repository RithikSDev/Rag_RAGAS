import { useEffect, useRef, useState } from 'react'
import DocumentChunkBrowser from '../components/DocumentChunkBrowser'
import { getDocuments, uploadDocument } from '../lib/api'

function formatTimestamp(value) {
  return new Date(value).toLocaleString()
}

const STATUS_ICON = {
  queued: '…',
  processing: '●',
  completed: '✓',
  failed: '⚠',
}

function KnowledgeBaseView({ onDocumentsChanged }) {
  const [documents, setDocuments] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [uploads, setUploads] = useState([])
  const [expandedId, setExpandedId] = useState(null)
  const fileInputRef = useRef(null)

  async function load() {
    setLoading(true)
    setError(null)

    try {
      const data = await getDocuments()
      setDocuments(data.documents)
      onDocumentsChanged?.(data.documents.length)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  function setUploadStatus(name, patch) {
    setUploads((prev) => prev.map((upload) => (upload.name === name ? { ...upload, ...patch } : upload)))
  }

  async function uploadOne(file) {
    setUploadStatus(file.name, { status: 'processing', error: null })

    try {
      await uploadDocument(file)
      setUploadStatus(file.name, { status: 'completed' })
    } catch (err) {
      setUploadStatus(file.name, { status: 'failed', error: err.message })
    }
  }

  async function handleFileChange(event) {
    const files = Array.from(event.target.files || [])

    if (files.length === 0) {
      return
    }

    setUploads(files.map((file) => ({ name: file.name, status: 'queued', file, error: null })))

    // Sequential, not parallel: each upload triggers real embedding work on
    // the backend, and this keeps per-file progress legible in the UI.
    for (const file of files) {
      await uploadOne(file)
    }

    await load()

    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  async function handleRetry(name) {
    const upload = uploads.find((item) => item.name === name)

    if (!upload?.file) {
      return
    }

    await uploadOne(upload.file)
    await load()
  }

  return (
    <div className="view">
      <div className="view-header">
        <div>
          <h1>Knowledge Base</h1>
          <p>The corpus this pipeline retrieves from.</p>
        </div>
        <label className="primary-button upload-button">
          Upload documents
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf,.pptx,.txt,application/pdf,application/vnd.openxmlformats-officedocument.presentationml.presentation,text/plain"
            multiple
            onChange={handleFileChange}
            hidden
          />
        </label>
      </div>

      {uploads.length > 0 && (
        <div className="ingestion-progress-list">
          {uploads.map((upload) => (
            <div className="ingestion-progress-row" key={upload.name}>
              <span className="ingestion-progress-name">{upload.name}</span>
              <span className={`ingestion-status ingestion-status-${upload.status}`}>
                {STATUS_ICON[upload.status]} {upload.status}
              </span>
              {upload.status === 'failed' && (
                <>
                  <span className="ingestion-error">{upload.error}</span>
                  <button
                    type="button"
                    className="retry-button"
                    onClick={() => handleRetry(upload.name)}
                  >
                    ↻ retry
                  </button>
                </>
              )}
            </div>
          ))}
        </div>
      )}

      {error && <div className="error">{error}</div>}

      {!loading && documents.length === 0 && (
        <div className="empty-state">
          <p>No documents indexed.</p>
          <p className="empty-state-hint">
            Upload PDF, PPTX, or TXT files to add them to the retrieval index.
          </p>
        </div>
      )}

      {documents.length > 0 && (
        <div className="doc-list">
          {documents.map((doc) => (
            <div className="doc-card-wrap" key={doc.id}>
              <button
                type="button"
                className={'doc-card doc-card-button' + (expandedId === doc.id ? ' active' : '')}
                onClick={() => setExpandedId(expandedId === doc.id ? null : doc.id)}
              >
                <div className="doc-card-name">{doc.name}</div>
                <div className="doc-card-meta">
                  <span>{doc.chunks} chunks</span>
                  <span>{formatTimestamp(doc.ingested_at)}</span>
                </div>
              </button>

              {expandedId === doc.id && <DocumentChunkBrowser documentId={doc.id} />}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export default KnowledgeBaseView
