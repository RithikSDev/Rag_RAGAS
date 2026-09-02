import { useState } from 'react'

const GROUPS = {
  ingestion: { label: 'Ingestion', accent: '#3987e5' },
  retrieval: { label: 'Retrieval', accent: '#14b8a6' },
  generation: { label: 'Generation & Evaluation', accent: '#8b5cf6' },
}

// Icons echo the NavRail glyphs for the stages that map onto a nav section
// (Documents/Query/Hybrid Retrieval/RAGAS Evaluation), so the diagram reads
// as a map of the same app rather than a disconnected illustration.
const STAGES = [
  { id: 'documents', label: 'Documents', icon: '▤', group: 'ingestion' },
  { id: 'parsing', label: 'Parsing', icon: '▥', group: 'ingestion' },
  { id: 'chunking', label: 'Chunking', icon: '▦', group: 'ingestion' },
  { id: 'embedding', label: 'Embedding', icon: '⬡', group: 'ingestion' },
  { id: 'vector_db', label: 'Vector DB', icon: '◍', group: 'retrieval' },
  { id: 'query', label: 'Query', icon: '◆', group: 'retrieval' },
  { id: 'hybrid_retrieval', label: 'Hybrid Retrieval', icon: '◎', group: 'retrieval' },
  { id: 'reranking', label: 'Reranking', icon: '⇅', group: 'retrieval' },
  { id: 'context', label: 'Context', icon: '▭', group: 'generation' },
  { id: 'llm', label: 'LLM', icon: '✦', group: 'generation' },
  { id: 'answer', label: 'Answer', icon: '✓', group: 'generation' },
  { id: 'ragas_evaluation', label: 'RAGAS Evaluation', icon: '▲', group: 'generation' },
]

const COLUMNS = 4

function toRows(stages, columns) {
  const rows = []
  for (let i = 0; i < stages.length; i += columns) {
    rows.push(stages.slice(i, i + columns))
  }
  return rows
}

const ROWS = toRows(STAGES, COLUMNS)

function RagPipelineFlow({ details }) {
  const [activeId, setActiveId] = useState(null)

  function toggle(id) {
    setActiveId((prev) => (prev === id ? null : id))
  }

  const activeStage = STAGES.find((stage) => stage.id === activeId)
  const activeDetail = activeId ? details?.[activeId] : null

  return (
    <div className="pipeline-flow-wrap">
      <div className="pipeline-blueprint">
        {ROWS.map((row, rowIndex) => {
          const group = GROUPS[row[0].group]

          return (
            <div className="blueprint-row" key={rowIndex} style={{ '--group-accent': group.accent }}>
              <div className="blueprint-row-label">
                <span className="blueprint-row-dot" />
                {group.label}
              </div>

              <div className="blueprint-row-nodes">
                {row.map((stage, stageIndex) => (
                  <div className="blueprint-node-group" key={stage.id}>
                    <button
                      type="button"
                      className={'blueprint-node' + (activeId === stage.id ? ' active' : '')}
                      onClick={() => toggle(stage.id)}
                    >
                      <span className="blueprint-node-icon" aria-hidden="true">
                        {stage.icon}
                      </span>
                      <span className="blueprint-node-label">{stage.label}</span>
                    </button>
                    {stageIndex < row.length - 1 && (
                      <span className="blueprint-arrow" aria-hidden="true">
                        →
                      </span>
                    )}
                  </div>
                ))}
              </div>

              {rowIndex < ROWS.length - 1 && (
                <div className="blueprint-row-connector" aria-hidden="true">
                  ↓
                </div>
              )}
            </div>
          )
        })}
      </div>

      <div className="pipeline-flow-detail">
        {activeDetail ? (
          <>
            <h3>{activeStage?.label}</h3>
            <dl>
              {activeDetail.map(([key, value]) => (
                <div className="pipeline-detail-row" key={key}>
                  <dt>{key}</dt>
                  <dd>{value}</dd>
                </div>
              ))}
            </dl>
          </>
        ) : (
          <p className="empty-state-hint">Click a stage to see its current configuration.</p>
        )}
      </div>
    </div>
  )
}

export default RagPipelineFlow
