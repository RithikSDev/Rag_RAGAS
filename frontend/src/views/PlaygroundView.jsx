import { useRef, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import PipelineTrace from '../components/PipelineTrace'
import { askQuestion } from '../lib/api'

const STAGES = ['Embed query', 'Retrieve context', 'Generate answer']

function formatMs(value) {
  if (value == null) return '—'
  return value < 1000 ? `${Math.round(value)} ms` : `${(value / 1000).toFixed(2)} s`
}

function PlaygroundView() {
  const [question, setQuestion] = useState('')
  const [pending, setPending] = useState(null)
  const [history, setHistory] = useState([])
  const [error, setError] = useState(null)
  const bottomRef = useRef(null)

  async function handleSubmit(event) {
    event.preventDefault()

    const trimmed = question.trim()

    if (!trimmed || pending) {
      return
    }

    setPending(trimmed)
    setError(null)
    setQuestion('')

    const startedAt = performance.now()

    try {
      const result = await askQuestion(trimmed)
      const totalMs = performance.now() - startedAt

      setHistory((prev) => [...prev, { ...result, totalMs }])
      setPending(null)
      setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 50)
    } catch (err) {
      setError(err.message)
      setPending(null)
    }
  }

  return (
    <div className="view chat-view">
      <div className="view-header">
        <div>
          <h1>RAG Playground</h1>
          <p>Ask the pipeline a question and inspect exactly how the answer was produced.</p>
        </div>
      </div>

      <main className="chat-log">
        {history.length === 0 && !pending && (
          <div className="empty-state">
            <p>No queries yet.</p>
            <p className="empty-state-hint">Ask a question below to trace it through the pipeline.</p>
          </div>
        )}

        {history.map((turn, index) => (
          <div className="turn" key={index}>
            <div className="bubble question">{turn.question}</div>
            <div className="bubble answer">
              <ReactMarkdown>{turn.answer}</ReactMarkdown>
            </div>

            <div className="turn-timing">
              <span>retrieval {formatMs(turn.timing?.retrieval_ms)}</span>
              <span>generation {formatMs(turn.timing?.generation_ms)}</span>
              <span>total {formatMs(turn.totalMs)}</span>
            </div>

            {turn.contexts?.length > 0 && (
              <details className="sources">
                <summary>{turn.contexts.length} retrieved chunk(s)</summary>
                {turn.contexts.map((context, contextIndex) => (
                  <div className="source" key={contextIndex}>
                    <div className="source-meta">
                      <span className="source-page">page {context.page}</span>
                      {typeof context.score === 'number' && (
                        <span className="source-score">vector score {context.score.toFixed(3)}</span>
                      )}
                    </div>
                    <p>{context.text}</p>
                  </div>
                ))}
              </details>
            )}
          </div>
        ))}

        {pending && (
          <div className="turn">
            <div className="bubble question">{pending}</div>
            <PipelineTrace stages={STAGES} status="running" />
          </div>
        )}

        {error && <div className="error">{error}</div>}

        <div ref={bottomRef} />
      </main>

      <form className="composer" onSubmit={handleSubmit}>
        <input
          type="text"
          value={question}
          onChange={(event) => setQuestion(event.target.value)}
          placeholder="Ask a question…"
          disabled={Boolean(pending)}
        />
        <button type="submit" disabled={Boolean(pending) || !question.trim()}>
          Ask
        </button>
      </form>
    </div>
  )
}

export default PlaygroundView
