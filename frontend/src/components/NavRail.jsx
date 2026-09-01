const NAV_ITEMS = [
  { id: 'chat', label: 'Chat', glyph: '◆' },
  { id: 'evaluation', label: 'Evaluation', glyph: '▲' },
  { id: 'documents', label: 'Documents', glyph: '▤' },
  { id: 'settings', label: 'Settings', glyph: '⚙' },
]

function NavRail({ active, onSelect, documentCount }) {
  return (
    <nav className="nav-rail">
      <div className="nav-brand">
        <span className="nav-brand-mark">⌁</span>
        <div>
          <div className="nav-brand-title">RAG OPS</div>
          <div className="nav-brand-subtitle">console</div>
        </div>
      </div>

      <div className="nav-items">
        {NAV_ITEMS.map((item) => (
          <button
            type="button"
            key={item.id}
            className={'nav-item' + (active === item.id ? ' active' : '')}
            onClick={() => onSelect(item.id)}
          >
            <span className="nav-item-glyph">{item.glyph}</span>
            {item.label}
          </button>
        ))}
      </div>

      <div className="nav-status">
        <span className="status-dot" />
        <div>
          <div className="nav-status-label">pipeline online</div>
          <div className="nav-status-meta">{documentCount} doc(s) indexed</div>
        </div>
      </div>
    </nav>
  )
}

export default NavRail
