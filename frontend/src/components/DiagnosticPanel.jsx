const METRIC_LABELS = {
  faithfulness: 'Faithfulness',
  answer_relevancy: 'Answer Relevancy',
  context_precision: 'Context Precision',
  context_recall: 'Context Recall',
  context_relevance: 'Context Relevance',
  answer_correctness: 'Answer Correctness',
}

const RECOMMENDATIONS = {
  context_recall: {
    cause: 'Retrieval is missing relevant chunks for some questions.',
    action: 'Try a higher Top-K or rebalance the vector/BM25 weights.',
    target: 'retrieval-debugger',
    targetLabel: 'Open Retrieval Debugger',
  },
  context_precision: {
    cause: 'Retrieved context contains too much irrelevant material.',
    action: 'Lower Top-K or enable the reranker to tighten the retrieved set.',
    target: 'retrieval-debugger',
    targetLabel: 'Open Retrieval Debugger',
  },
  context_relevance: {
    cause: 'Retrieved chunks are topically off from the question being asked.',
    action: 'Compare vector vs. BM25 weighting — a lexical-heavy query may need more BM25 weight.',
    target: 'retrieval-debugger',
    targetLabel: 'Open Retrieval Debugger',
  },
  faithfulness: {
    cause: 'Generated answers include claims not grounded in the retrieved context.',
    action: 'Smaller chunks with more overlap often reduce ungrounded claims.',
    target: 'settings',
    targetLabel: 'Open Settings',
  },
  answer_relevancy: {
    cause: 'Answers drift from what was actually asked.',
    action: 'Inspect a few turns in the RAG Playground to see whether retrieval is on-topic.',
    target: 'playground',
    targetLabel: 'Open RAG Playground',
  },
  answer_correctness: {
    cause: 'Answers diverge from the reference answers in the eval set.',
    action: "Verify the eval dataset's reference answers are accurate and current.",
    target: 'dataset',
    targetLabel: 'Open Dataset',
  },
}

const DEFAULT_THRESHOLDS = { good: 0.8, warning: 0.5 }

function band(value, entry = DEFAULT_THRESHOLDS) {
  if (value >= entry.good) return 'good'
  if (value >= entry.warning) return 'warning'
  return 'critical'
}

function DiagnosticPanel({ metrics, average, thresholds, onNavigate }) {
  const flagged = (metrics || []).filter((metric) => {
    const value = average?.[metric]
    return typeof value === 'number' && band(value, thresholds?.[metric]) !== 'good'
  })

  if (flagged.length === 0) {
    return (
      <div className="diagnostic-panel diagnostic-panel-clear">
        <span className="status-dot-sm" />
        All metrics are within their target thresholds.
      </div>
    )
  }

  return (
    <div className="diagnostic-panel">
      <h3>Diagnostics</h3>
      <div className="diagnostic-cards">
        {flagged.map((metric) => {
          const rec = RECOMMENDATIONS[metric]
          const value = average[metric]
          const level = band(value, thresholds?.[metric])

          if (!rec) return null

          return (
            <div className={`diagnostic-card diagnostic-${level}`} key={metric}>
              <div className="diagnostic-card-header">
                <span className="diagnostic-metric-name">{METRIC_LABELS[metric] ?? metric}</span>
                <span className={`status-chip status-${level}`}>
                  {Math.round(value * 100)}%
                </span>
              </div>
              <p className="diagnostic-cause">{rec.cause}</p>
              <p className="diagnostic-action">{rec.action}</p>
              <button type="button" className="link-button" onClick={() => onNavigate?.(rec.target)}>
                {rec.targetLabel}
              </button>
            </div>
          )
        })}
      </div>
    </div>
  )
}

export default DiagnosticPanel
