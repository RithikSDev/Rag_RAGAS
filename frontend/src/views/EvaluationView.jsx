import { useEffect, useRef, useState } from 'react'
import DiagnosticPanel from '../components/DiagnosticPanel'
import ThresholdsPanel from '../components/ThresholdsPanel'
import {
  getEvaluationProgress,
  getRagasRuns,
  getRagasScores,
  getThresholds,
  runEvaluation,
} from '../lib/api'
import { METRIC_DESCRIPTIONS } from '../lib/metricDescriptions'
import { notify } from '../lib/toastStore'

const METRIC_LABELS = {
  faithfulness: 'Faithfulness',
  answer_relevancy: 'Answer Relevancy',
  context_precision: 'Context Precision',
  context_recall: 'Context Recall',
  context_relevance: 'Context Relevance',
  answer_correctness: 'Answer Correctness',
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

function EvaluationView({ onNavigate }) {
  const [data, setData] = useState(null)
  const [thresholds, setThresholds] = useState({})
  const [runs, setRuns] = useState([])
  const [loading, setLoading] = useState(true)
  const [running, setRunning] = useState(false)
  const [progress, setProgress] = useState(null)
  const [error, setError] = useState(null)
  const [openIndex, setOpenIndex] = useState(null)
  const [showThresholds, setShowThresholds] = useState(false)
  const [focusedMetric, setFocusedMetric] = useState(null)
  const cancelledRef = useRef(false)
  const pollTimeoutRef = useRef(null)

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

  useEffect(() => {
    cancelledRef.current = false
    load()

    return () => {
      cancelledRef.current = true
      clearTimeout(pollTimeoutRef.current)
    }
  }, [])

  function pollProgress(runId) {
    return new Promise((resolve, reject) => {
      const poll = async () => {
        if (cancelledRef.current) {
          resolve()
          return
        }

        try {
          const snapshot = await getEvaluationProgress(runId)
          if (cancelledRef.current) {
            resolve()
            return
          }

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

  async function handleRun() {
    setRunning(true)
    setError(null)
    setProgress(null)
    setFocusedMetric(null)

    try {
      const { run_id } = await runEvaluation()
      await pollProgress(run_id)

      if (!cancelledRef.current) {
        setData(await getRagasScores())
        loadRuns()
        notify('Evaluation completed')
      }
    } catch (err) {
      setError(err.message)
    } finally {
      if (!cancelledRef.current) {
        setRunning(false)
        setProgress(null)
      }
    }
  }

  const hasResults = data?.results?.length > 0
  const cfg = data?.config
  const focusedResults = focusedMetric
    ? (data?.results ?? []).filter(
        (sample) => band(sample.scores[focusedMetric].value, thresholds[focusedMetric]).key !== 'good'
      )
    : []
  const rowTemplate = data?.metrics ? `2fr repeat(${data.metrics.length}, 0.9fr)` : undefined

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

      {running && (
        <div className="eval-progress">
          <div className="eval-progress-bar">
            <div
              className="eval-progress-fill"
              style={{
                width: progress?.total_questions
                  ? `${Math.round((progress.completed_questions / progress.total_questions) * 100)}%`
                  : '4%',
              }}
            />
          </div>
          <div className="eval-progress-meta">
            <span>
              {progress ? `${progress.completed_questions} / ${progress.total_questions} questions` : 'Starting…'}
            </span>
            {progress?.current_question && (
              <span className="eval-progress-current">scoring: {progress.current_question}</span>
            )}
          </div>
        </div>
      )}

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

          <div className="kpi-row kpi-row-six">
            {data.metrics.map((name) => {
              const value = data.average[name]
              const { key, label } = band(value, thresholds[name])

              return (
                <button
                  type="button"
                  className="kpi-tile kpi-tile-button"
                  key={name}
                  onClick={() => setFocusedMetric(focusedMetric === name ? null : name)}
                  aria-pressed={focusedMetric === name}
                >
                  <div className="kpi-tile-label">
                    {METRIC_LABELS[name] ?? name}
                    <span
                      className="kpi-info"
                      tabIndex={0}
                      title={METRIC_DESCRIPTIONS[name]}
                      onClick={(event) => event.stopPropagation()}
                    >
                      i
                      <span className="kpi-tooltip" role="tooltip">
                        {METRIC_DESCRIPTIONS[name]}
                      </span>
                    </span>
                  </div>
                  <div className="kpi-tile-value">{formatScore(value)}</div>
                  <div className="meter">
                    <div className={`meter-fill meter-${key}`} style={{ width: formatScore(value) }} />
                  </div>
                  <div className={`status-chip status-${key}`}>
                    <span className="status-dot-sm" />
                    {label}
                  </div>
                </button>
              )
            })}
          </div>

          <DiagnosticPanel
            metrics={data.metrics}
            average={data.average}
            thresholds={thresholds}
            onNavigate={onNavigate}
          />

          {focusedMetric && (
            <div className="focused-results">
              <div className="section-heading">
                <h2>Failed questions — {METRIC_LABELS[focusedMetric] ?? focusedMetric}</h2>
                <button type="button" className="link-button" onClick={() => setFocusedMetric(null)}>
                  Clear filter
                </button>
              </div>

              {focusedResults.length === 0 ? (
                <p className="empty-state-hint">No questions fell below the target threshold for this metric.</p>
              ) : (
                focusedResults.map((sample, index) => (
                  <div className="failed-question-card" key={index}>
                    <div className="failed-question-score">
                      {formatScore(sample.scores[focusedMetric].value)}
                    </div>
                    <div>
                      <p className="failed-question-text">{sample.user_input}</p>
                      {sample.scores[focusedMetric].reason && (
                        <p className="failed-question-reason">{sample.scores[focusedMetric].reason}</p>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          )}

          <div className="results-table">
            <div className="results-row results-head" style={{ gridTemplateColumns: rowTemplate }}>
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
                  style={{ gridTemplateColumns: rowTemplate }}
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
                <div className="run-history-row run-history-head" style={{ gridTemplateColumns: rowTemplate }}>
                  <span>Run</span>
                  {data.metrics.map((name) => (
                    <span key={name}>{METRIC_LABELS[name] ?? name}</span>
                  ))}
                </div>
                {runs
                  .filter((run) => run.status === 'completed')
                  .map((run) => (
                    <div className="run-history-row" key={run.id} style={{ gridTemplateColumns: rowTemplate }}>
                      <span className="run-history-meta">
                        {run.label && <span className="run-history-label">{run.label}</span>}
                        {formatTimestamp(run.started_at)}
                        <span className="run-history-by">by {run.triggered_by}</span>
                      </span>
                      {data.metrics.map((name) => {
                        const value = run.average?.[name]
                        const { key } = band(value, thresholds[name])
                        return (
                          <span key={name} className={`run-history-score status-${key}`}>
                            {value == null ? '—' : formatScore(value)}
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
