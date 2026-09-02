import { useEffect, useState } from 'react'
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { getRagasRun, getRagasRuns } from '../lib/api'

const METRIC_LABELS = {
  faithfulness: 'Faithfulness',
  answer_relevancy: 'Answer Relevancy',
  context_precision: 'Context Precision',
  context_recall: 'Context Recall',
  context_relevance: 'Context Relevance',
  answer_correctness: 'Answer Correctness',
}

function formatScore(value) {
  return value == null ? '—' : `${Math.round(value * 100)}%`
}

function runLabel(run) {
  if (!run) return ''
  return run.label || `run ${run.id.slice(0, 8)}`
}

function CompareView() {
  const [runs, setRuns] = useState([])
  const [baselineId, setBaselineId] = useState('')
  const [experimentId, setExperimentId] = useState('')
  const [baseline, setBaseline] = useState(null)
  const [experiment, setExperiment] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    getRagasRuns()
      .then((data) => {
        const completed = data.runs.filter((run) => run.status === 'completed')
        setRuns(completed)

        // Only auto-select once there's an actual pair to compare — with
        // fewer than two completed runs the picker row doesn't render at all.
        if (completed.length >= 2) {
          setBaselineId(completed[1].id)
          setExperimentId(completed[0].id)
        }
      })
      .catch((err) => setError(err.message))
  }, [])

  useEffect(() => {
    if (!baselineId) {
      setBaseline(null)
      return
    }
    getRagasRun(baselineId).then(setBaseline).catch((err) => setError(err.message))
  }, [baselineId])

  useEffect(() => {
    if (!experimentId) {
      setExperiment(null)
      return
    }
    getRagasRun(experimentId).then(setExperiment).catch((err) => setError(err.message))
  }, [experimentId])

  const metrics = experiment?.metrics ?? baseline?.metrics ?? []
  const chartData = metrics.map((metric) => ({
    name: METRIC_LABELS[metric] ?? metric,
    Baseline: baseline ? Math.round((baseline.average[metric] ?? 0) * 100) : 0,
    Experiment: experiment ? Math.round((experiment.average[metric] ?? 0) * 100) : 0,
  }))

  return (
    <div className="view">
      <div className="view-header">
        <div>
          <h1>Compare</h1>
          <p>Compare two evaluation runs side by side.</p>
        </div>
      </div>

      {error && <div className="error">{error}</div>}

      {runs.length < 2 ? (
        <div className="empty-state">
          <p>Not enough completed runs to compare yet.</p>
          <p className="empty-state-hint">Run at least two evaluations (Evaluation or Experiments) first.</p>
        </div>
      ) : (
        <>
          <div className="compare-picker-row">
            <label className="compare-picker">
              <span>Baseline</span>
              <select value={baselineId} onChange={(event) => setBaselineId(event.target.value)}>
                {runs.map((run) => (
                  <option key={run.id} value={run.id}>
                    {runLabel(run)}
                  </option>
                ))}
              </select>
            </label>
            <span className="compare-arrow">⇄</span>
            <label className="compare-picker">
              <span>Experiment</span>
              <select value={experimentId} onChange={(event) => setExperimentId(event.target.value)}>
                {runs.map((run) => (
                  <option key={run.id} value={run.id}>
                    {runLabel(run)}
                  </option>
                ))}
              </select>
            </label>
          </div>

          {baseline && experiment && (
            <>
              <div className="compare-chart-wrap">
                <ResponsiveContainer width="100%" height={260}>
                  <BarChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                    <XAxis dataKey="name" stroke="var(--text-muted)" fontSize={11} />
                    <YAxis stroke="var(--text-muted)" fontSize={11} domain={[0, 100]} />
                    <Tooltip contentStyle={{ background: 'var(--surface-raised)', border: '1px solid var(--border)' }} />
                    <Legend />
                    <Bar dataKey="Baseline" fill="var(--text-muted)" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="Experiment" fill="var(--accent)" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>

              <div className="compare-table">
                <div className="compare-row compare-head">
                  <span>Metric</span>
                  <span>{runLabel(baseline)}</span>
                  <span>{runLabel(experiment)}</span>
                  <span>Δ</span>
                </div>
                {metrics.map((metric) => {
                  const baseValue = baseline.average[metric]
                  const expValue = experiment.average[metric]
                  const delta =
                    baseValue != null && expValue != null ? Math.round((expValue - baseValue) * 100) : null

                  return (
                    <div className="compare-row" key={metric}>
                      <span>{METRIC_LABELS[metric] ?? metric}</span>
                      <span>{formatScore(baseValue)}</span>
                      <span>{formatScore(expValue)}</span>
                      <span className={delta > 0 ? 'trend-up' : delta < 0 ? 'trend-down' : ''}>
                        {delta == null ? '—' : delta === 0 ? '±0%' : `${delta > 0 ? '↑' : '↓'} ${Math.abs(delta)}%`}
                      </span>
                    </div>
                  )
                })}
              </div>

              <div className="compare-config-row">
                <div className="config-strip">
                  <span>baseline: strategy {baseline.config?.chunking_strategy}</span>
                  <span>top-k {baseline.config?.top_k}</span>
                </div>
                <div className="config-strip">
                  <span>experiment: strategy {experiment.config?.chunking_strategy}</span>
                  <span>top-k {experiment.config?.top_k}</span>
                </div>
              </div>
            </>
          )}
        </>
      )}
    </div>
  )
}

export default CompareView
