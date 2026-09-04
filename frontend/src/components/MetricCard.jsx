function MetricCard({ label, value, trend, onClick, description }) {
  const clickable = typeof onClick === 'function'
  const hasTrend = typeof trend === 'number' && !Number.isNaN(trend)

  const content = (
    <>
      <div className="metric-card-label">
        {label}
        {description && (
          <span className="kpi-info" tabIndex={0} title={description} onClick={(event) => event.stopPropagation()}>
            i
            <span className="kpi-tooltip" role="tooltip">
              {description}
            </span>
          </span>
        )}
      </div>
      <div className="metric-card-value">
        {value}
        {hasTrend && trend !== 0 && (
          <span className={'metric-card-trend ' + (trend > 0 ? 'trend-up' : 'trend-down')}>
            {trend > 0 ? '↑' : '↓'} {Math.abs(trend)}%
          </span>
        )}
      </div>
    </>
  )

  if (clickable) {
    return (
      <button type="button" className="metric-card metric-card-button" onClick={onClick}>
        {content}
      </button>
    )
  }

  return <div className="metric-card">{content}</div>
}

export default MetricCard
