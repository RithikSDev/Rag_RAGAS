import { useEffect, useState } from 'react'
import ThresholdsPanel from '../components/ThresholdsPanel'
import { getRagasRuns, getRagasScores, getThresholds, runEvaluation } from '../lib/api'

const METRIC_LABELS = {
  faithfulness: 'Faithfulness',
  answer_relevancy: 'Answer Relevancy',
  context_precision: 'Context Precision',
  context_recall: 'Context Recall',
}

const BAND_LABELS = { good: 'Good', warning: 'Needs review', critical: 'Poor' }
const DEFAULT_THRESHOLDS = { good: 0.8, warning: 0.5 }

function band(value, entry = DEFAULT_THRESHOLDS) {
  if (value >= entry.good) return { key: 'good', label: BAND_LABELS.good }
  if (value >= entry.warning) return { key: 'warning', label: BAND_LABELS.warning }
  return { key: 'critical', label: BAND_LABELS.critical }
}

function formatScore(value) {
  return `${Math.round(value * 100)}%`
}

function formatTimestamp(value) {
  return new Date(value).toLocaleString()
}

function EvaluationView() {
  const [data, setData] = useState(null)
  const [thresholds, setThresholds] = useState({})
  const [runs, setRuns] = useState([])
  const [loading, setLoading] = useState(true)
  const [running, setRunning] = useState(false)
  const [error, setError] = useState(null)
  const [openIndex, setOpenIndex] = useState(null)
  const [showThresholds, setShowThresholds] = useState(false)

  async function loadThresholds() {
    try {
      const response = await getThresholds()
      setThresholds(response.thresholds)
    } catch {
      // non-fatal — falls back to DEFAULT_THRESHOLDS per metric
    }
  }

  async function loadRuns() {
    try {
      const response = await getRagasRuns()
      setRuns(response.runs)
    } catch {
      // non-fatal — history is a supplementary view
    }
  }

  async function load() {
    setLoading(true)
    setError(null)

    try {
      setData(await getRagasScores())
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }

    loadThresholds()
    loadRuns()
  }

  async function handleRun() {
    setRunning(true)
    setError(null)

    try {
      setData(await runEvaluation())
      loadRuns()
    } catch (err) {
      setError(err.message)
    } finally {
      setRunning(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  const hasResults = data?.results?.length > 0
  const cfg = data?.config

  return (
    <div className="view">
      <div className="view-header">
        <div>
          <h1>Evaluation</h1>
          <p>RAGAS scores for the pipeline's eval dataset.</p>
        </div>
        <div className="view-header-actions">
          <button
            type="button"
            className="secondary-button"
            onClick={() => setShowThresholds((prev) => !prev)}
          >
            {showThresholds ? 'Hide thresholds' : 'Configure thresholds'}
          </button>
          <button type="button" className="primary-button" onClick={handleRun} disabled={running}>
            {running ? 'Running…' : 'Run evaluation'}
          </button>
        </div>
      </div>

      {error && <div className="error">{error}</div>}

      {showThresholds && (
        <ThresholdsPanel currentAverages={data?.average} onSaved={setThresholds} />
      )}

      {!loading && !hasResults && !error && (
        <div className="empty-state">
          <p>No scores yet.</p>
          <p className="empty-state-hint">Run the evaluation to score the pipeline against its eval set.</p>
        </div>
      )}

      {hasResults && (
        <>
          {cfg && (
            <div className="config-strip">
              <span>strategy: {cfg.chunking_strategy}</span>
              {cfg.chunking_strategy === 'semantic' ? (
                <span>threshold: {cfg.semantic_threshold}</span>
              ) : (
                <>
                  <span>chunk size: {cfg.chunk_size}</span>
                  <span>overlap: {cfg.chunk_overlap}</span>
                </>
              )}
              <span>top-k: {cfg.top_k}</span>
            </div>
          )}

          <div className="kpi-row">
            {data.metrics.map((name) => {
              const value = data.average[name]
              const { key, label } = band(value, thresholds[name])

              return (
                <div className="kpi-tile" key={name}>
                  <div className="kpi-tile-label">{METRIC_LABELS[name] ?? name}</div>
                  <div className="kpi-tile-value">{formatScore(value)}</div>
                  <div className="meter">
                    <div className={`meter-fill meter-${key}`} style={{ width: formatScore(value) }} />
                  </div>
                  <div className={`status-chip status-${key}`}>
                    <span className="status-dot-sm" />
                    {label}
                  </div>
                </div>
              )
            })}
          </div>

          <div className="results-table">
            <div className="results-row results-head">
              <span>Question</span>
              {data.metrics.map((name) => (
                <span key={name}>{METRIC_LABELS[name] ?? name}</span>
              ))}
            </div>

            {data.results.map((sample, index) => (
              <div className="results-group" key={index}>
                <button
                  type="button"
                  className="results-row results-row-button"
                  onClick={() => setOpenIndex(openIndex === index ? null : index)}
                >
                  <span className="results-question">{sample.user_input}</span>
                  {data.metrics.map((name) => {
                    const { key } = band(sample.scores[name].value, thresholds[name])
                    return (
                      <span key={name} className={`results-score status-${key}`}>
                        {formatScore(sample.scores[name].value)}
                      </span>
                    )
                  })}
                </button>

                {openIndex === index && (
                  <div className="results-detail">
                    <div>
                      <span className="detail-label">Response</span>
                      <p>{sample.response}</p>
                    </div>
                    <div>
                      <span className="detail-label">Reference</span>
                      <p>{sample.reference}</p>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>

          {runs.length > 0 && (
            <div className="run-history">
              <h3>Run history</h3>
              <div className="run-history-table">
                <div className="run-history-row run-history-head">
                  <span>Run</span>
                  {data.metrics.map((name) => (
                    <span key={name}>{METRIC_LABELS[name] ?? name}</span>
                  ))}
                </div>
                {runs.map((run) => (
                  <div className="run-history-row" key={run.id}>
                    <span className="run-history-meta">
                      {formatTimestamp(run.started_at)}
                      <span className="run-history-by">by {run.triggered_by}</span>
                    </span>
                    {data.metrics.map((name) => {
                      const value = run.average[name]
                      const { key } = band(value, thresholds[name])
                      return (
                        <span key={name} className={`run-history-score status-${key}`}>
                          {formatScore(value)}
                        </span>
                      )
                    })}
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}

export default EvaluationView
