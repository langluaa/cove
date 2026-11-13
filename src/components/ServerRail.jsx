import Logo from './Logo'

function initials(name) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 3)
    .map((w) => w[0].toUpperCase())
    .join('')
}

export default function ServerRail({ servers, activeId, onSelect, onAdd }) {
  return (
    <nav className="rail" aria-label="Servers">
      <div className="rail-logo" title="Cove">
        <Logo size={40} />
      </div>
      <div className="rail-sep" />
      <div className="rail-list">
        {servers.map((s) => (
          <button
            key={s.id}
            className={'rail-icon' + (s.id === activeId ? ' active' : '')}
            style={{ '--icon-color': s.icon_color }}
            onClick={() => onSelect(s.id)}
            title={s.name}
            aria-label={s.name}
            aria-current={s.id === activeId ? 'true' : undefined}
          >
            {initials(s.name)}
          </button>
        ))}
        <button className="rail-icon add" onClick={onAdd} title="Add a server" aria-label="Add a server">
          +
        </button>
      </div>
    </nav>
  )
}
