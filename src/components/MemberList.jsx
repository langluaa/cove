import Avatar, { displayName } from './Avatar'

export default function MemberList({ members, online, ownerId, me, isOwner, onKick }) {
  const sorted = [...members].sort((a, b) => displayName(a.user).localeCompare(displayName(b.user)))
  const on = sorted.filter((m) => online.has(m.user.id))
  const off = sorted.filter((m) => !online.has(m.user.id))

  const row = (m, isOnline) => (
    <li key={m.user.id} className={'member' + (isOnline ? '' : ' offline')}>
      <Avatar profile={m.user} size={32} online={isOnline} />
      <span className="truncate">{displayName(m.user)}</span>
      {m.user.id === ownerId && (
        <span className="crown" title="Server owner">
          ★
        </span>
      )}
      {isOwner && m.user.id !== me && (
        <button className="icon-btn tiny member-kick" onClick={() => onKick(m)} title="Kick" aria-label="Kick member">
          ✕
        </button>
      )}
    </li>
  )

  return (
    <aside className="members" aria-label="Members">
      {on.length > 0 && (
        <>
          <div className="section-label">Online — {on.length}</div>
          <ul>{on.map((m) => row(m, true))}</ul>
        </>
      )}
      {off.length > 0 && (
        <>
          <div className="section-label">Offline — {off.length}</div>
          <ul>{off.map((m) => row(m, false))}</ul>
        </>
      )}
    </aside>
  )
}
