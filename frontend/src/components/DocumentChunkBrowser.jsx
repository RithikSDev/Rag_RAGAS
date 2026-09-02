import { useEffect, useState } from 'react'
import { getDocumentChunks } from '../lib/api'

function DocumentChunkBrowser({ documentId }) {
  const [chunks, setChunks] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    let cancelled = false
    setChunks(null)
    setError(null)

    getDocumentChunks(documentId)
      .then((data) => !cancelled && setChunks(data.chunks))
      .catch((err) => !cancelled && setError(err.message))

    return () => {
      cancelled = true
    }
  }, [documentId])

  if (error) {
    return <div className="error chunk-browser-error">{error}</div>
  }

  if (chunks === null) {
    return <div className="chunk-browser-loading">Loading chunks…</div>
  }

  if (chunks.length === 0) {
    return (
      <div className="chunk-browser-empty">
        No chunks tagged for this document yet — change a chunking setting (Settings) to trigger a
        re-index, which enables per-document browsing.
      </div>
    )
  }

  return (
    <div className="chunk-browser">
      {chunks.map((chunk) => (
        <div className="chunk-card" key={chunk.id}>
          <span className="chunk-card-page">page {chunk.page}</span>
          <p>{chunk.text}</p>
        </div>
      ))}
    </div>
  )
}

export default DocumentChunkBrowser
