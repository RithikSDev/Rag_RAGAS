import { useEffect, useState } from 'react'
import MetricCard from '../components/MetricCard'
import RagPipelineFlow from '../components/RagPipelineFlow'
import {
  getDocuments,
  getMetricsSummary,
  getRagasRuns,
  getRagasScores,
  getSettings,
} from '../lib/api'
import { METRIC_DESCRIPTIONS } from '../lib/metricDescriptions'

const METRIC_LABELS = {
  faithfulness: 'Faithfulness',
  answer_relevancy: 'Answer Relevancy',
  context_precision: 'Context Precision',
  context_recall: 'Context Recall',
  context_relevance: 'Context Relevance',
  answer_correctness: 'Answer Correctness',
}

function formatMs(value) {
  if (value == null) return '—'
  return value < 1000 ? `${Math.round(value)} ms` : `${(value / 1000).toFixed(2)} s`
}

function OverviewView({ onNavigate }) {
  const [summary, setSummary] = useState(null)
  const [settings, setSettings] = useState(null)
  const [documents, setDocuments] = useState([])
  const [latest, setLatest] = useState(null)
  const [runs, setRuns] = useState([])
  const [error, setError] = useState(null)

  useEffect(() => {
    Promise.all([getMetricsSummary(), getSettings(), getDocuments(), getRagasScores(), getRagasRuns()])
      .then(([summaryResp, settingsResp, documentsResp, scoresResp, runsResp]) => {
        setSummary(summaryResp)
        setSettings(settingsResp)
        setDocuments(documentsResp.documents)
        setLatest(scoresResp)
        setRuns(runsResp.runs.filter((run) => run.status === 'completed'))
      })
      .catch((err) => setError(err.message))
  }, [])

  const [current, previous] = runs

  function trendFor(metric) {
    if (!current || !previous) return null
    const currentValue = current.average?.[metric]
    const previousValue = previous.average?.[metric]

    if (currentValue == null || previousValue == null) return null

    return Math.round((currentValue - previousValue) * 100)
  }

  const pipelineDetails = settings && {
    documents: [['Documents indexed', documents.length]],
    parsing: [
      ['Libraries', 'pymupdf, python-pptx'],
      ['Formats', 'PDF, PPTX, TXT'],
      ['Tables', 'extracted from PDF/PPTX'],
      ['OCR', 'tesseract (scanned pages & embedded images)'],
    ],
    chunking: [
      ['Strategy', settings.chunking_strategy],
      settings.chunking_strategy === 'semantic'
        ? ['Similarity threshold', settings.semantic_threshold]
        : ['Chunk size', `${settings.chunk_size} chars`],
      settings.chunking_strategy === 'fixed' ? ['Overlap', `${settings.chunk_overlap} chars`] : null,
      ['Chunks', summary?.chunks ?? '—'],
    ].filter(Boolean),
    embedding: [['Model', 'BAAI/bge-small-en-v1.5'], ['Dimensions', 384]],
    vector_db: [['Store', 'Qdrant'], ['Vectors', summary?.chunks ?? '—']],
    query: [['Entry point', 'POST /ask or Retrieval Debugger']],
    hybrid_retrieval: [
      ['Vector search', 'cosine similarity'],
      ['Lexical search', 'BM25 (rank_bm25)'],
      ['Fusion', 'weighted min-max'],
      ['Top-K (chat)', settings.top_k],
    ],
    reranking: [['Model', 'cross-encoder/ms-marco-MiniLM-L-6-v2'], ['Used in', 'Retrieval Debugger']],
    context: [['Chunks passed to LLM', settings.top_k]],
    llm: [['Provider', 'Anthropic (Claude)']],
    answer: [['Format', 'Markdown, grounded in retrieved context only']],
    ragas_evaluation: latest?.metrics?.length
      ? latest.metrics.map((metric) => [METRIC_LABELS[metric] ?? metric, `${Math.round(latest.average[metric] * 100)}%`])
      : [['Status', 'No evaluation run yet']],
  }

  return (
    <div className="view">
      <div className="view-header">
        <div>
          <h1>Overview</h1>
          <p>Current health of the RAG system.</p>
        </div>
      </div>

      {error && <div className="error">{error}</div>}

      {summary?.documents === 0 && (
        <div className="getting-started-banner">
          <div>
            <strong>Get started</strong>
            <p>Upload your first document to build the knowledge base this pipeline retrieves from.</p>
          </div>
          <button type="button" className="primary-button" onClick={() => onNavigate?.('knowledge-base')}>
            Upload a document
          </button>
        </div>
      )}

      <div className="kpi-row kpi-row-five">
        <MetricCard label="Documents" value={summary?.documents ?? '—'} />
        <MetricCard label="Chunks" value={summary?.chunks?.toLocaleString() ?? '—'} />
        <MetricCard label="Evaluation Questions" value={summary?.eval_questions ?? '—'} />
        <MetricCard label="Avg Retrieval Latency" value={formatMs(summary?.avg_retrieval_ms)} />
        <MetricCard label="Avg Generation Latency" value={formatMs(summary?.avg_generation_ms)} />
      </div>

      {latest?.metrics?.length > 0 ? (
        <div className="kpi-row kpi-row-six">
          {latest.metrics.map((metric) => (
            <MetricCard
              key={metric}
              label={METRIC_LABELS[metric] ?? metric}
              value={`${(latest.average[metric] * 100).toFixed(2)}%`.replace(/\.00%$/, '%')}
              trend={trendFor(metric)}
              onClick={() => onNavigate?.('evaluation')}
              description={METRIC_DESCRIPTIONS[metric]}
            />
          ))}
        </div>
      ) : (
        <div className="empty-state">
          <p>No RAGAS scores yet.</p>
          <p className="empty-state-hint">
            <button type="button" className="link-button" onClick={() => onNavigate?.('evaluation')}>
              Run an evaluation
            </button>{' '}
            to see quality metrics here.
          </p>
        </div>
      )}

      <div className="section-heading">
        <h2>RAG Pipeline</h2>
        <p>Click any stage to see its current configuration.</p>
      </div>

      {pipelineDetails && <RagPipelineFlow details={pipelineDetails} />}
    </div>
  )
}

export default OverviewView
