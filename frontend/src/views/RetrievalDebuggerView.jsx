import { useState } from 'react'
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { debugRetrieval } from '../lib/api'

const STAGES = [
  { id: 'vector_results', label: 'Vector Search', scoreKey: 'score', scoreLabel: 'cosine score' },
  { id: 'bm25_results', label: 'BM25', scoreKey: 'score', scoreLabel: 'BM25 score' },
  { id: 'hybrid_results', label: 'Hybrid Fusion', scoreKey: 'score', scoreLabel: 'fused score' },
  { id: 'reranked_results', label: 'Reranked', scoreKey: 'rerank_score', scoreLabel: 'rerank score' },
  { id: 'final_context', label: 'Final Context', scoreKey: null, scoreLabel: null },
]

function truncate(text, length = 80) {
  if (!text) return ''
  return text.length > length ? `${text.slice(0, length)}…` : text
}

function ResultCard({ item, stage }) {
  return (
    <div className="retrieval-result-card">
      <div className="retrieval-result-meta">
        <span className="source-page">page {item.page}</span>
        {stage.id === 'hybrid_results' && (
          <>
            <span className="source-score">vector {item.vector_score?.toFixed(3)}</span>
            <span className="source-score">bm25 {item.bm25_score?.toFixed(3)}</span>
            {item.in_vector && item.in_bm25 && <span className="retrieval-badge">both</span>}
          </>
        )}
        {stage.id === 'reranked_results' && (
          <span className="source-score">fused {item.score?.toFixed(3)}</span>
        )}
        {stage.scoreKey && typeof item[stage.scoreKey] === 'number' && (
          <span className="source-score retrieval-primary-score">
            {stage.scoreLabel} {item[stage.scoreKey].toFixed(3)}
          </span>
        )}
      </div>
      <p>{truncate(item.text, 220)}</p>
    </div>
  )
}

function RetrievalDebuggerView() {
  const [query, setQuery] = useState('')
  const [topKInitial, setTopKInitial] = useState(50)
  const [topKFinal, setTopKFinal] = useState(5)
  const [vectorWeight, setVectorWeight] = useState(0.7)
  const [useReranker, setUseReranker] = useState(true)
  const [activeStage, setActiveStage] = useState('final_context')
  const [result, setResult] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  const bm25Weight = Math.round((1 - vectorWeight) * 100) / 100

  async function handleSubmit(event) {
    event.preventDefault()

    const trimmed = query.trim()
    if (!trimmed || loading) return

    setLoading(true)
    setError(null)

    try {
      const data = await debugRetrieval({
        query: trimmed,
        top_k_initial: topKInitial,
        top_k_final: topKFinal,
        vector_weight: vectorWeight,
        bm25_weight: bm25Weight,
        use_reranker: useReranker,
      })
      setResult(data)
      setActiveStage(useReranker ? 'reranked_results' : 'final_context')
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const stage = STAGES.find((entry) => entry.id === activeStage)
  const items = result?.[activeStage] ?? []
  const chartData = stage?.scoreKey
    ? items.map((item, index) => ({
        name: `#${index + 1}`,
        score: Number((item[stage.scoreKey] ?? 0).toFixed(4)),
      }))
    : []

  return (
    <div className="view">
      <div className="view-header">
        <div>
          <h1>Retrieval Debugger</h1>
          <p>Inspect vector, BM25, fusion, and reranking stages for a single query.</p>
        </div>
      </div>

      <form className="retrieval-controls" onSubmit={handleSubmit}>
        <input
          type="text"
          className="retrieval-query-input"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Enter a query to debug…"
        />

        <div className="retrieval-control-row">
          <label className="retrieval-control">
            <span>Top-K initial ({topKInitial})</span>
            <input
              type="range"
              min="5"
              max="200"
              step="5"
              value={topKInitial}
              onChange={(event) => setTopKInitial(Number(event.target.value))}
            />
          </label>

          <label className="retrieval-control">
            <span>Top-K final ({topKFinal})</span>
            <input
              type="range"
              min="1"
              max={Math.min(50, topKInitial)}
              step="1"
              value={Math.min(topKFinal, topKInitial)}
              onChange={(event) => setTopKFinal(Number(event.target.value))}
            />
          </label>
        </div>

        <div className="retrieval-control-row">
          <label className="retrieval-control retrieval-control-wide">
            <span>
              Vector {Math.round(vectorWeight * 100)}% / BM25 {Math.round(bm25Weight * 100)}%
            </span>
            <input
              type="range"
              min="0"
              max="1"
              step="0.05"
              value={vectorWeight}
              onChange={(event) => setVectorWeight(Number(event.target.value))}
            />
          </label>

          <label className="retrieval-reranker-toggle">
            <input
              type="checkbox"
              checked={useReranker}
              onChange={(event) => setUseReranker(event.target.checked)}
            />
            Use cross-encoder reranker
          </label>
        </div>

        <button type="submit" className="primary-button" disabled={loading || !query.trim()}>
          {loading ? 'Running…' : 'Run retrieval debug'}
        </button>
      </form>

      {error && <div className="error">{error}</div>}

      {!result && !loading && !error && (
        <div className="empty-state">
          <p>No debug run yet.</p>
          <p className="empty-state-hint">Enter a query above to trace it through every retrieval stage.</p>
        </div>
      )}

      {result && (
        <>
          <div className="retrieval-stage-tabs">
            {STAGES.map((entry) => (
              <button
                type="button"
                key={entry.id}
                className={'retrieval-stage-tab' + (activeStage === entry.id ? ' active' : '')}
                onClick={() => setActiveStage(entry.id)}
              >
                {entry.label}
                <span className="retrieval-stage-count">{(result[entry.id] ?? []).length}</span>
              </button>
            ))}
          </div>

          {stage?.scoreKey && chartData.length > 0 && (
            <div className="retrieval-chart-wrap">
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                  <XAxis dataKey="name" stroke="var(--text-muted)" fontSize={11} />
                  <YAxis stroke="var(--text-muted)" fontSize={11} domain={[0, 'auto']} />
                  <Tooltip
                    contentStyle={{ background: 'var(--surface-raised)', border: '1px solid var(--border)' }}
                  />
                  <Bar dataKey="score" fill="var(--accent)" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}

          <div className="retrieval-result-list">
            {items.length === 0 ? (
              <p className="empty-state-hint">No results at this stage.</p>
            ) : (
              items.map((item) => <ResultCard item={item} stage={stage} key={item.id} />)
            )}
          </div>
        </>
      )}
    </div>
  )
}

export default RetrievalDebuggerView
