import { useEffect, useRef, useState } from 'react'
import PipelineTrace from '../components/PipelineTrace'
import { getDocuments, uploadDocument } from '../lib/api'

const STAGES = ['Load PDF', 'Chunk text', 'Embed chunks', 'Write to index']

function formatTimestamp(value) {
  return new Date(value).toLocaleString()
}

function DocumentsView({ onDocumentsChanged }) {
  const [documents, setDocuments] = useState([])
  const [loading, setLoading] = useState(true)
  const [uploadStatus, setUploadStatus] = useState('idle')
  const [error, setError] = useState(null)
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

  async function handleFileChange(event) {
    const file = event.target.files?.[0]

    if (!file) {
      return
    }

    setUploadStatus('running')
    setError(null)

    try {
      await uploadDocument(file)
      setUploadStatus('done')
      await load()
    } catch (err) {
      setError(err.message)
      setUploadStatus('idle')
    } finally {
      if (fileInputRef.current) {
        fileInputRef.current.value = ''
      }
    }
  }

  return (
    <div className="view">
      <div className="view-header">
        <div>
          <h1>Documents</h1>
          <p>The corpus this pipeline retrieves from.</p>
        </div>
        <label className="primary-button upload-button">
          {uploadStatus === 'running' ? 'Ingesting…' : 'Upload PDF'}
          <input
            ref={fileInputRef}
            type="file"
            accept="application/pdf"
            onChange={handleFileChange}
            disabled={uploadStatus === 'running'}
            hidden
          />
        </label>
      </div>

      {uploadStatus !== 'idle' && <PipelineTrace stages={STAGES} status={uploadStatus} />}

      {error && <div className="error">{error}</div>}

      {!loading && documents.length === 0 && (
        <div className="empty-state">
          <p>No documents indexed.</p>
          <p className="empty-state-hint">Upload a PDF to add it to the retrieval index.</p>
        </div>
      )}

      {documents.length > 0 && (
        <div className="doc-list">
          {documents.map((doc) => (
            <div className="doc-card" key={doc.name}>
              <div className="doc-card-name">{doc.name}</div>
              <div className="doc-card-meta">
                <span>{doc.chunks} chunks</span>
                <span>{formatTimestamp(doc.ingested_at)}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export default DocumentsView
