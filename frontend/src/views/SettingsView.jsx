import { useEffect, useState } from 'react'
import PipelineTrace from '../components/PipelineTrace'
import UsersPanel from '../components/UsersPanel'
import { getSettings, updateSettings } from '../lib/api'
import { notify } from '../lib/toastStore'

const STAGES = ['Update config', 'Re-chunk documents', 'Re-embed', 'Rebuild index']

function SettingsView({ onDocumentsChanged, currentUser }) {
  const [form, setForm] = useState(null)
  const [loading, setLoading] = useState(true)
  const [applyStatus, setApplyStatus] = useState('idle')
  const [error, setError] = useState(null)
  const [result, setResult] = useState(null)
  const [showUsers, setShowUsers] = useState(false)

  async function load() {
    setLoading(true)
    setError(null)

    try {
      setForm(await getSettings())
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  function set(key, value) {
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  async function handleApply() {
    setApplyStatus('running')
    setError(null)
    setResult(null)

    try {
      const response = await updateSettings(form)
      setForm(response.config)
      setResult(response.documents)
      onDocumentsChanged?.(response.documents.length)
      setApplyStatus('done')
      notify(`Configuration applied — ${response.documents.length} document(s) re-indexed`)
    } catch (err) {
      setError(err.message)
      setApplyStatus('idle')
    }
  }

  if (loading || !form) {
    return (
      <div className="view">
        <div className="view-header">
          <div>
            <h1>Settings</h1>
            <p>Tune retrieval and chunking, then re-run evaluation to trace the effect on RAGAS.</p>
          </div>
        </div>
      </div>
    )
  }

  const isSemantic = form.chunking_strategy === 'semantic'

  return (
    <div className="view">
      <div className="view-header">
        <div>
          <h1>Settings</h1>
          <p>Tune retrieval and chunking, then re-run evaluation to trace the effect on RAGAS.</p>
        </div>
        <div className="view-header-actions">
          {currentUser?.role === 'admin' && (
            <button type="button" className="secondary-button" onClick={() => setShowUsers((prev) => !prev)}>
              {showUsers ? 'Hide users' : 'Manage users'}
            </button>
          )}
          <button type="button" className="primary-button" onClick={handleApply} disabled={applyStatus === 'running'}>
            {applyStatus === 'running' ? 'Applying…' : 'Apply & re-index'}
          </button>
        </div>
      </div>

      {showUsers && currentUser?.role === 'admin' && <UsersPanel currentUserId={currentUser.id} />}

      <div className="settings-form">
        <div className="field-group">
          <div className="field-label">Chunking strategy</div>
          <div className="field-hint">How source pages are split into retrievable chunks.</div>
          <div className="toggle-group">
            <button
              type="button"
              className={'toggle-option' + (!isSemantic ? ' active' : '')}
              onClick={() => set('chunking_strategy', 'fixed')}
            >
              Fixed size
            </button>
            <button
              type="button"
              className={'toggle-option' + (isSemantic ? ' active' : '')}
              onClick={() => set('chunking_strategy', 'semantic')}
            >
              Semantic
            </button>
          </div>
        </div>

        {!isSemantic && (
          <>
            <div className="field-group">
              <div className="field-row">
                <div className="field-label">Chunk size</div>
                <div className="field-value">{form.chunk_size} chars</div>
              </div>
              <div className="field-hint">Characters per chunk before overlap is applied.</div>
              <input
                type="range"
                min="100"
                max="1500"
                step="50"
                value={form.chunk_size}
                onChange={(event) => set('chunk_size', Number(event.target.value))}
              />
            </div>

            <div className="field-group">
              <div className="field-row">
                <div className="field-label">Chunk overlap</div>
                <div className="field-value">{form.chunk_overlap} chars</div>
              </div>
              <div className="field-hint">Characters shared between consecutive chunks, to preserve context across boundaries.</div>
              <input
                type="range"
                min="0"
                max={Math.max(0, form.chunk_size - 50)}
                step="10"
                value={Math.min(form.chunk_overlap, Math.max(0, form.chunk_size - 50))}
                onChange={(event) => set('chunk_overlap', Number(event.target.value))}
              />
            </div>
          </>
        )}

        {isSemantic && (
          <div className="field-group">
            <div className="field-row">
              <div className="field-label">Semantic similarity threshold</div>
              <div className="field-value">{form.semantic_threshold.toFixed(2)}</div>
            </div>
            <div className="field-hint">
              Sentences merge into the same chunk while they stay this similar to the running chunk. Higher = smaller, tighter chunks.
            </div>
            <input
              type="range"
              min="0.3"
              max="0.95"
              step="0.05"
              value={form.semantic_threshold}
              onChange={(event) => set('semantic_threshold', Number(event.target.value))}
            />
          </div>
        )}

        <div className="field-group">
          <div className="field-row">
            <div className="field-label">Retrieved chunks (k)</div>
            <div className="field-value">{form.top_k}</div>
          </div>
          <div className="field-hint">Number of chunks passed to the generator per question.</div>
          <input
            type="range"
            min="1"
            max="20"
            step="1"
            value={form.top_k}
            onChange={(event) => set('top_k', Number(event.target.value))}
          />
        </div>
      </div>

      {applyStatus === 'running' && <PipelineTrace stages={STAGES} status="running" />}

      {error && <div className="error">{error}</div>}

      {result && applyStatus === 'done' && (
        <div className="doc-list">
          {result.map((doc) => (
            <div className="doc-card" key={doc.name}>
              <div className="doc-card-name">{doc.name}</div>
              <div className="doc-card-meta">
                <span>{doc.chunks} chunks</span>
              </div>
            </div>
          ))}
          <p className="empty-state-hint">Re-indexed. Head to Evaluation and run it again to see the RAGAS impact.</p>
        </div>
      )}
    </div>
  )
}

export default SettingsView
