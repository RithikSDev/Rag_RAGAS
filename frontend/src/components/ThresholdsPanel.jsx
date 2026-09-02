import { useEffect, useState } from 'react'
import { getThresholds, updateThresholds } from '../lib/api'
import { notify } from '../lib/toastStore'

const METRIC_LABELS = {
  faithfulness: 'Faithfulness',
  answer_relevancy: 'Answer Relevancy',
  context_precision: 'Context Precision',
  context_recall: 'Context Recall',
}

function pct(value) {
  return `${Math.round(value * 100)}%`
}

function ThresholdRow({ metric, entry, currentAverage, onChange }) {
  const { good, warning } = entry

  const gradient = `linear-gradient(to right,
    var(--critical) 0%, var(--critical) ${warning * 100}%,
    var(--warning) ${warning * 100}%, var(--warning) ${good * 100}%,
    var(--good) ${good * 100}%, var(--good) 100%)`

  return (
    <div className="threshold-row">
      <div className="threshold-row-header">
        <span className="threshold-metric-name">{METRIC_LABELS[metric] ?? metric}</span>
        {typeof currentAverage === 'number' && (
          <span className="threshold-current-score">current avg: {pct(currentAverage)}</span>
        )}
      </div>

      <div className="threshold-gradient-track">
        <div className="threshold-gradient-fill" style={{ background: gradient }} />
        {typeof currentAverage === 'number' && (
          <div
            className="threshold-marker"
            style={{ left: `${currentAverage * 100}%` }}
            title={`current average: ${pct(currentAverage)}`}
          />
        )}
      </div>

      <div className="threshold-sliders">
        <label className="threshold-slider">
          <span>
            Needs review below <strong>{pct(warning)}</strong>
          </span>
          <input
            type="range"
            min="0"
            max={Math.max(0, good - 0.01)}
            step="0.01"
            value={warning}
            onChange={(event) => onChange(metric, { good, warning: Number(event.target.value) })}
          />
        </label>
        <label className="threshold-slider">
          <span>
            Good at or above <strong>{pct(good)}</strong>
          </span>
          <input
            type="range"
            min={Math.min(1, warning + 0.01)}
            max="1"
            step="0.01"
            value={good}
            onChange={(event) => onChange(metric, { good: Number(event.target.value), warning })}
          />
        </label>
      </div>
    </div>
  )
}

function ThresholdsPanel({ currentAverages, onSaved }) {
  const [thresholds, setThresholds] = useState(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const [dirty, setDirty] = useState(false)

  async function load() {
    setLoading(true)
    setError(null)

    try {
      const response = await getThresholds()
      setThresholds(response.thresholds)
      setDirty(false)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  function handleChange(metric, entry) {
    setThresholds((prev) => ({ ...prev, [metric]: entry }))
    setDirty(true)
  }

  async function handleSave() {
    setSaving(true)
    setError(null)

    try {
      const response = await updateThresholds(thresholds)
      setThresholds(response.thresholds)
      setDirty(false)
      onSaved?.(response.thresholds)
      notify('Thresholds updated')
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  if (loading || !thresholds) {
    return <div className="thresholds-panel">Loading thresholds…</div>
  }

  return (
    <div className="thresholds-panel">
      <div className="thresholds-panel-header">
        <div>
          <h3>Quality thresholds</h3>
          <p>Drag to set where each metric counts as Good, Needs review, or Poor. Saved and applied everywhere this score is shown.</p>
        </div>
        <button type="button" className="primary-button" onClick={handleSave} disabled={!dirty || saving}>
          {saving ? 'Saving…' : 'Save thresholds'}
        </button>
      </div>

      {error && <div className="error">{error}</div>}

      <div className="threshold-rows">
        {Object.entries(thresholds).map(([metric, entry]) => (
          <ThresholdRow
            key={metric}
            metric={metric}
            entry={entry}
            currentAverage={currentAverages?.[metric]}
            onChange={handleChange}
          />
        ))}
      </div>
    </div>
  )
}

export default ThresholdsPanel
