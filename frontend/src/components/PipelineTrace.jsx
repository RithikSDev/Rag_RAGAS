import { useEffect, useRef, useState } from 'react'

function PipelineTrace({ stages, status }) {
  const [activeIndex, setActiveIndex] = useState(-1)
  const intervalRef = useRef(null)

  useEffect(() => {
    clearInterval(intervalRef.current)

    if (status === 'running') {
      let index = 0
      setActiveIndex(0)

      intervalRef.current = setInterval(() => {
        index = Math.min(index + 1, stages.length - 1)
        setActiveIndex(index)
      }, 550)
    } else if (status === 'done') {
      setActiveIndex(stages.length)
    } else {
      setActiveIndex(-1)
    }

    return () => clearInterval(intervalRef.current)
  }, [status, stages.length])

  return (
    <div className="pipeline-trace" data-status={status}>
      {stages.map((stage, index) => (
        <div className="pipeline-stage" key={stage}>
          <div className="pipeline-node-wrap">
            <span
              className={
                'pipeline-dot' +
                (index < activeIndex || status === 'done' ? ' done' : '') +
                (index === activeIndex && status === 'running' ? ' active' : '')
              }
            />
            {index < stages.length - 1 && (
              <span
                className={
                  'pipeline-connector' +
                  (index < activeIndex || status === 'done' ? ' done' : '')
                }
              />
            )}
          </div>
          <span className="pipeline-label">{stage}</span>
        </div>
      ))}
    </div>
  )
}

export default PipelineTrace
