import { useEffect, useRef, useState } from 'react'
import {
  getEvaluationProgress,
  getRagasRun,
  getRagasRuns,
  getSettings,
  labelRun,
  runEvaluation,
  updateSettings,
} from '../lib/api'
import { notify } from '../lib/toastStore'

const METRIC_LABELS = {
  faithfulness: 'Faithfulness',
  answer_relevancy: 'Answer Relevancy',
  context_precision: 'Context Precision',
  context_recall: 'Context Recall',
  context_relevance: 'Context Relevance',
  answer_correctness: 'Answer Correctness',
}

function formatTimestamp(value) {
  return new Date(value).toLocaleString()
}

function formatScore(value) {
  return value == null ? '—' : `${Math.round(value * 100)}%`
}

function ExperimentsView({ onNavigate }) {
  const [form, setForm] = useState(null)
  const [runs, setRuns] = useState([])
  const [status, setStatus] = useState('idle') // idle | applying | running | done
  const [progress, setProgress] = useState(null)
  const [completedRun, setCompletedRun] = useState(null)
  const [labelDraft, setLabelDraft] = useState('')
  const [error, setError] = useState(null)
  const cancelledRef = useRef(false)
  const pollTimeoutRef = useRef(null)

  async function loadSettings() {
    try {
      setForm(await getSettings())
    } catch (err) {
      setError(err.message)
    }
  }

  async function loadRuns() {
    try {
      const data = await getRagasRuns()
      setRuns(data.runs)
    } catch {
      // non-fatal — history is supplementary
    }
  }

  useEffect(() => {
    loadSettings()
    loadRuns()

    return () => {
      cancelledRef.current = true
      clearTimeout(pollTimeoutRef.current)
    }
  }, [])

  function set(key, value) {
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  function pollProgress(runId) {
    return new Promise((resolve, reject) => {
      const poll = async () => {
        if (cancelledRef.current) return resolve()

        try {
          const snapshot = await getEvaluationProgress(runId)
          if (cancelledRef.current) return resolve()

          setProgress(snapshot)

          if (snapshot.status === 'running') {
            pollTimeoutRef.current = setTimeout(poll, 300)
          } else if (snapshot.status === 'completed') {
            resolve()
          } else {
            reject(new Error(snapshot.error_message || 'Evaluation run failed'))
          }
        } catch (err) {
          reject(err)
        }
      }

      poll()
    })
  }

  async function handleRunExperiment() {
    setError(null)
    setCompletedRun(null)
    setProgress(null)
    setStatus('applying')

    try {
      const applied = await updateSettings(form)
      setForm(applied.config)

      setStatus('running')
      const { run_id } = await runEvaluation()
      await pollProgress(run_id)

      if (cancelledRef.current) return

      const run = await getRagasRun(run_id)
      setCompletedRun(run)
      setLabelDraft('')
      setStatus('done')
      loadRuns()
      notify('Experiment completed')
    } catch (err) {
      setError(err.message)
      setStatus('idle')
    }
  }

  async function handleSaveLabel() {
    if (!completedRun || !labelDraft.trim()) return

    try {
      const updated = await labelRun(completedRun.id, { label: labelDraft.trim() })
      setCompletedRun(updated)
      loadRuns()
      notify('Run labeled')
    } catch (err) {
      setError(err.message)
    }
  }

  const busy = status === 'applying' || status === 'running'

  if (!form) {
    return (
      <div className="view">
        <div className="view-header">
          <div>
            <h1>Experiments</h1>
            <p>Tune parameters, run an experiment, and label it for comparison.</p>
          </div>
        </div>
        {error && <div className="error">{error}</div>}
      </div>
    )
  }

  const isSemantic = form.chunking_strategy === 'semantic'

  return (
    <div className="view">
      <div className="view-header">
        <div>
          <h1>Experiments</h1>
          <p>Tune parameters, run an experiment, and label it for comparison.</p>
        </div>
        <button type="button" className="primary-button" onClick={handleRunExperiment} disabled={busy}>
          {status === 'applying' ? 'Applying config…' : status === 'running' ? 'Running…' : 'Run experiment'}
        </button>
      </div>

      {error && <div className="error">{error}</div>}

      <div className="settings-form">
        <div className="field-group">
          <div className="field-label">Chunking strategy</div>
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
          <div className="field-group">
            <div className="field-row">
              <div className="field-label">Chunk size</div>
              <div className="field-value">{form.chunk_size} chars</div>
            </div>
            <input
              type="range"
              min="100"
              max="1500"
              step="50"
              value={form.chunk_size}
              onChange={(event) => set('chunk_size', Number(event.target.value))}
            />
          </div>
        )}

        {isSemantic && (
          <div className="field-group">
            <div className="field-row">
              <div className="field-label">Semantic similarity threshold</div>
              <div className="field-value">{form.semantic_threshold.toFixed(2)}</div>
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

      {busy && (
        <div className="eval-progress">
          <div className="eval-progress-bar">
            <div
              className="eval-progress-fill"
              style={{
                width:
                  status === 'applying' || !progress?.total_questions
                    ? '4%'
                    : `${Math.round((progress.completed_questions / progress.total_questions) * 100)}%`,
              }}
            />
          </div>
          <div className="eval-progress-meta">
            <span>
              {status === 'applying'
                ? 'Applying config & re-indexing…'
                : progress
                  ? `${progress.completed_questions} / ${progress.total_questions} questions`
                  : 'Starting…'}
            </span>
          </div>
        </div>
      )}

      {completedRun && status === 'done' && (
        <div className="experiment-result">
          <div className="section-heading">
            <h2>Experiment result</h2>
            <button type="button" className="link-button" onClick={() => onNavigate?.('compare')}>
              Compare runs
            </button>
          </div>

          <div className="kpi-row kpi-row-six">
            {completedRun.metrics.map((metric) => (
              <div className="kpi-tile" key={metric}>
                <div className="kpi-tile-label">{METRIC_LABELS[metric] ?? metric}</div>
                <div className="kpi-tile-value">{formatScore(completedRun.average[metric])}</div>
              </div>
            ))}
          </div>

          <div className="label-form">
            <input
              type="text"
              placeholder="Label this run (e.g. top_k=10, semantic chunking)…"
              value={labelDraft}
              onChange={(event) => setLabelDraft(event.target.value)}
            />
            <button type="button" className="secondary-button" onClick={handleSaveLabel} disabled={!labelDraft.trim()}>
              Save label
            </button>
          </div>
          {completedRun.label && <p className="empty-state-hint">Currently labeled: {completedRun.label}</p>}
        </div>
      )}

      {runs.length > 0 && (
        <div className="run-history">
          <h3>Experiment history</h3>
          <div className="experiment-history-list">
            {runs.map((run) => (
              <div className="experiment-history-row" key={run.id}>
                <div>
                  <span className="experiment-history-label">{run.label || '(unlabeled run)'}</span>
                  <span className="run-history-by">
                    {formatTimestamp(run.started_at)} · {run.status}
                  </span>
                </div>
                <span className={`status-chip status-${run.status === 'completed' ? 'good' : run.status === 'failed' ? 'critical' : 'warning'}`}>
                  {run.status}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

export default ExperimentsView
