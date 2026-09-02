import { useEffect, useState } from 'react'
import { getHealth } from '../lib/api'

const THEME_KEY = 'ragas-lab-theme'

function readStoredTheme() {
  try {
    return localStorage.getItem(THEME_KEY)
  } catch {
    return null
  }
}

function applyTheme(theme) {
  if (theme === 'light' || theme === 'dark') {
    document.documentElement.setAttribute('data-theme', theme)
  } else {
    document.documentElement.removeAttribute('data-theme')
  }
}

function StatusDot({ state, label }) {
  return (
    <span className={`top-status-item top-status-${state}`}>
      <span className="top-status-dot" />
      {label}
    </span>
  )
}

function TopHeader({ title, documentCount, datasetCount, user, onLogout }) {
  const [theme, setTheme] = useState(() => readStoredTheme())
  const [healthy, setHealthy] = useState(null)

  useEffect(() => {
    applyTheme(theme)
  }, [theme])

  useEffect(() => {
    let cancelled = false

    getHealth()
      .then(() => !cancelled && setHealthy(true))
      .catch(() => !cancelled && setHealthy(false))

    return () => {
      cancelled = true
    }
  }, [])

  function toggleTheme() {
    setTheme((prev) => {
      const next = prev === 'light' ? 'dark' : 'light'

      try {
        localStorage.setItem(THEME_KEY, next)
      } catch {
        // localStorage may be unavailable (private browsing, etc.) - the
        // toggle still works for this session, it just won't persist.
      }

      return next
    })
  }

  // /health checks both the DB and the vector store together - we don't
  // have independent signals for these two, so both dots reflect the same
  // underlying check rather than fabricating a distinction that isn't real.
  const connectivityState = healthy === null ? 'pending' : healthy ? 'ok' : 'down'
  const readyState = documentCount > 0 && datasetCount > 0 ? 'ok' : 'pending'

  return (
    <header className="top-header">
      <div className="top-header-title">{title}</div>

      <div className="top-header-status">
        <StatusDot state={connectivityState} label="RAG System Online" />
        <StatusDot state={connectivityState} label="Vector DB Connected" />
        <StatusDot state={readyState} label="Evaluation Ready" />
      </div>

      <button type="button" className="theme-toggle" onClick={toggleTheme} aria-label="Toggle color theme">
        {theme === 'light' ? '☾' : '☀'}
      </button>

      {user && (
        <div className="top-header-user">
          <span className="top-header-username">{user.username}</span>
          <span className="top-header-role">{user.role}</span>
          <button type="button" className="secondary-button top-header-logout" onClick={onLogout}>
            Log out
          </button>
        </div>
      )}
    </header>
  )
}

export default TopHeader
