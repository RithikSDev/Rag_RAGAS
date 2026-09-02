import { useEffect, useState } from 'react'

// Grouped by what the user is actually doing, not spec order - mirrors the
// Build → Interact → Evaluate flow the RAG Pipeline diagram on Overview shows.
const NAV_GROUPS = [
  {
    label: 'Monitor',
    items: [{ id: 'overview', label: 'Overview', glyph: '◈' }],
  },
  {
    label: 'Build',
    items: [
      { id: 'knowledge-base', label: 'Knowledge Base', glyph: '▤' },
      { id: 'dataset', label: 'Dataset', glyph: '☰' },
    ],
  },
  {
    label: 'Interact',
    items: [
      { id: 'playground', label: 'RAG Playground', glyph: '◆' },
      { id: 'retrieval-debugger', label: 'Retrieval Debugger', glyph: '◎' },
    ],
  },
  {
    label: 'Evaluate',
    items: [
      { id: 'evaluation', label: 'Evaluation', glyph: '▲' },
      { id: 'experiments', label: 'Experiments', glyph: '⚗' },
      { id: 'compare', label: 'Compare', glyph: '⇄' },
    ],
  },
  {
    label: 'System',
    items: [{ id: 'settings', label: 'Settings', glyph: '⚙' }],
  },
]

const COLLAPSE_KEY = 'ragas-lab-nav-collapsed'

function readStoredCollapsed() {
  try {
    return localStorage.getItem(COLLAPSE_KEY) === 'true'
  } catch {
    return false
  }
}

const NARROW_QUERY = '(max-width: 900px)'

function NavRail({ active, onSelect, documentCount }) {
  const [collapsed, setCollapsed] = useState(readStoredCollapsed)
  const [narrowViewport, setNarrowViewport] = useState(
    () => typeof window !== 'undefined' && window.matchMedia(NARROW_QUERY).matches
  )

  useEffect(() => {
    const mediaQuery = window.matchMedia(NARROW_QUERY)
    const handleChange = (event) => setNarrowViewport(event.matches)

    mediaQuery.addEventListener('change', handleChange)
    return () => mediaQuery.removeEventListener('change', handleChange)
  }, [])

  // A narrow viewport forces the icon-only rail regardless of the user's
  // manual preference - there's no room for a full drawer here (out of
  // scope, see the plan), but the rail shouldn't crush the content area.
  const effectiveCollapsed = collapsed || narrowViewport

  function toggleCollapsed() {
    setCollapsed((prev) => {
      const next = !prev

      try {
        localStorage.setItem(COLLAPSE_KEY, String(next))
      } catch {
        // localStorage may be unavailable - the toggle still works for this session
      }

      return next
    })
  }

  return (
    <nav className={'nav-rail' + (effectiveCollapsed ? ' collapsed' : '')}>
      <div className="nav-brand">
        <span className="nav-brand-mark">⌁</span>
        {!effectiveCollapsed && (
          <div>
            <div className="nav-brand-title">RAGAS LAB</div>
            <div className="nav-brand-subtitle">evaluation &amp; optimization</div>
          </div>
        )}
      </div>

      <div className="nav-groups">
        {NAV_GROUPS.map((group) => (
          <div className="nav-group" key={group.label}>
            {!effectiveCollapsed && <div className="nav-group-label">{group.label}</div>}
            <div className="nav-items">
              {group.items.map((item) => (
                <button
                  type="button"
                  key={item.id}
                  className={'nav-item' + (active === item.id ? ' active' : '')}
                  onClick={() => onSelect(item.id)}
                  title={effectiveCollapsed ? item.label : undefined}
                >
                  <span className="nav-item-glyph">{item.glyph}</span>
                  {!effectiveCollapsed && item.label}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>

      <button
        type="button"
        className="nav-collapse-toggle"
        onClick={toggleCollapsed}
        aria-label={collapsed ? 'Expand navigation' : 'Collapse navigation'}
        title={collapsed ? 'Expand navigation' : 'Collapse navigation'}
      >
        {effectiveCollapsed ? '»' : '« Collapse'}
      </button>

      <div className="nav-status">
        <span className="status-dot" />
        {!effectiveCollapsed && (
          <div>
            <div className="nav-status-label">pipeline online</div>
            <div className="nav-status-meta">{documentCount} doc(s) indexed</div>
          </div>
        )}
      </div>
    </nav>
  )
}

export default NavRail
