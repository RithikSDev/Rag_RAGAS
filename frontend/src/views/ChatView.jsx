import { useRef, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import PipelineTrace from '../components/PipelineTrace'
import { askQuestion } from '../lib/api'

const STAGES = ['Embed query', 'Retrieve context', 'Generate answer']

function ChatView() {
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

    try {
      const result = await askQuestion(trimmed)

      setHistory((prev) => [...prev, result])
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
          <h1>Chat</h1>
          <p>Ask the pipeline a question about the ingested documents.</p>
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

            {turn.contexts?.length > 0 && (
              <details className="sources">
                <summary>{turn.contexts.length} retrieved chunk(s)</summary>
                {turn.contexts.map((context, contextIndex) => (
                  <div className="source" key={contextIndex}>
                    <span className="source-page">page {context.page}</span>
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

export default ChatView
