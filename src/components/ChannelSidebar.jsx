import { useEffect, useRef, useState } from 'react'
import Avatar, { displayName } from './Avatar'

export default function ChannelSidebar({
  server,
  channels,
  activeChannelId,
  isOwner,
  profile,
  onSelectChannel,
  onInvite,
  onCreateChannel,
  onDeleteChannel,
  onServerSettings,
  onLeave,
  onProfile,
  onSignOut,
}) {
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef(null)

  useEffect(() => {
    if (!menuOpen) return
    const close = (e) => !menuRef.current?.contains(e.target) && setMenuOpen(false)
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [menuOpen])

  const pick = (fn) => () => {
    setMenuOpen(false)
    fn()
  }

  return (
    <aside className="sidebar">
      {server ? (
        <div className="server-head" ref={menuRef}>
          <button className="server-name" onClick={() => setMenuOpen((v) => !v)} aria-expanded={menuOpen}>
            <span className="truncate">{server.name}</span>
            <span className="chev">{menuOpen ? '✕' : '▾'}</span>
          </button>
          {menuOpen && (
            <div className="menu" role="menu">
              <button role="menuitem" className="accent" onClick={pick(onInvite)}>
                Invite people
              </button>
              {isOwner && (
                <>
                  <button role="menuitem" onClick={pick(onCreateChannel)}>
                    Create channel
                  </button>
                  <button role="menuitem" onClick={pick(onServerSettings)}>
                    Server settings
                  </button>
                </>
              )}
              {!isOwner && (
                <button role="menuitem" className="danger" onClick={pick(onLeave)}>
                  Leave server
                </button>
              )}
            </div>
          )}
        </div>
      ) : (
        <div className="server-head">
          <div className="server-name static">Cove</div>
        </div>
      )}

      <div className="channel-list">
        {server && (
          <div className="section-label">
            <span>Text channels</span>
            {isOwner && (
              <button className="icon-btn tiny" onClick={onCreateChannel} title="Create channel" aria-label="Create channel">
                +
              </button>
            )}
          </div>
        )}
        {channels.map((c) => (
          <div key={c.id} className={'channel' + (c.id === activeChannelId ? ' active' : '')}>
            <button className="channel-btn" onClick={() => onSelectChannel(c.id)}>
              <span className="hash">#</span>
              <span className="truncate">{c.name}</span>
            </button>
            {isOwner && (
              <button
                className="icon-btn tiny channel-del"
                onClick={() => onDeleteChannel(c)}
                title="Delete channel"
                aria-label={`Delete ${c.name}`}
              >
                ✕
              </button>
            )}
          </div>
        ))}
      </div>

      <div className="user-panel">
        <button className="user-chip" onClick={onProfile} title="Edit profile">
          <Avatar profile={profile} size={32} />
          <span className="user-names">
            <span className="truncate strong">{displayName(profile)}</span>
            <span className="truncate muted small">@{profile?.username}</span>
          </span>
        </button>
        <button className="icon-btn" onClick={onSignOut} title="Log out" aria-label="Log out">
          ⏻
        </button>
      </div>
    </aside>
  )
}
