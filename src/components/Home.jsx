import { useEffect, useState } from 'react'
import Avatar, { displayName } from './Avatar'

// ---------- Left sidebar on the Home screen ----------

export function HomeSidebarList({ dms, activeDmId, unread, online, onFriends, onSelectDm, incomingCount }) {
  return (
    <div className="channel-list">
      <div className={'channel' + (activeDmId === null ? ' active' : '')}>
        <button className="channel-btn" onClick={onFriends}>
          <span className="nav-icon" aria-hidden="true">
            👋
          </span>
          <span className="truncate">Friends</span>
          {incomingCount > 0 && <span className="badge">{incomingCount}</span>}
        </button>
      </div>

      <div className="section-label">
        <span>Direct messages</span>
      </div>
      {dms.length === 0 && <p className="muted small side-hint">Your conversations will show up here.</p>}
      {dms.map((dm) => (
        <div
          key={dm.id}
          className={'channel dm' + (dm.id === activeDmId ? ' active' : '') + (unread.has(dm.id) ? ' unread' : '')}
        >
          <button className="channel-btn" onClick={() => onSelectDm(dm.id)}>
            <Avatar profile={dm.other} size={28} online={online.has(dm.other?.id)} />
            <span className="truncate">{displayName(dm.other)}</span>
            {unread.has(dm.id) && <span className="unread-dot" aria-label="Unread" />}
          </button>
        </div>
      ))}
    </div>
  )
}

// ---------- Friends page (Home main area) ----------

export function FriendsPage({ friends, incoming, outgoing, online, noServers, actions, onCreateServer, onJoinServer }) {
  const [tab, setTab] = useState(() => (incoming.length ? 'pending' : 'online'))
  const [picked, setPicked] = useState(false)
  // Requests load after the page mounts: jump to Pending unless the user already chose a tab.
  useEffect(() => {
    if (incoming.length > 0 && !picked) setTab('pending')
  }, [incoming.length, picked])
  const choose = (key) => {
    setPicked(true)
    setTab(key)
  }
  const onlineFriends = friends.filter((f) => online.has(f.other.id))
  const pendingCount = incoming.length + outgoing.length

  const tabs = [
    ['online', 'Online'],
    ['all', 'All'],
    ['pending', 'Pending' + (incoming.length ? ` (${incoming.length})` : '')],
    ['add', 'Add friend'],
  ]

  return (
    <div className="friends-page">
      <div className="friends-tabs" role="tablist">
        {tabs.map(([key, label]) => (
          <button
            key={key}
            role="tab"
            aria-selected={tab === key}
            className={(tab === key ? 'on' : '') + (key === 'add' ? ' add' : '')}
            onClick={() => choose(key)}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="friends-body">
        {noServers && tab !== 'add' && (
          <div className="callout">
            <div>
              <div className="strong">You're not in any servers yet</div>
              <div className="muted small">Start one for your crew, or join with an invite.</div>
            </div>
            <div className="row">
              <button className="btn primary small" onClick={onCreateServer}>
                Create server
              </button>
              <button className="btn small" onClick={onJoinServer}>
                Join
              </button>
            </div>
          </div>
        )}

        {tab === 'add' && <AddFriend actions={actions} />}

        {tab === 'online' && (
          <FriendList
            title={`Online — ${onlineFriends.length}`}
            rows={onlineFriends}
            online={online}
            empty={friends.length ? 'No friends online right now.' : 'No friends yet — add some in the Add friend tab.'}
            actions={actions}
          />
        )}

        {tab === 'all' && (
          <FriendList
            title={`All friends — ${friends.length}`}
            rows={friends}
            online={online}
            empty="No friends yet — add some in the Add friend tab."
            actions={actions}
          />
        )}

        {tab === 'pending' && (
          <>
            <div className="section-label">Pending — {pendingCount}</div>
            {pendingCount === 0 && <p className="muted empty-line">No pending requests.</p>}
            <ul className="friend-list">
              {incoming.map((f) => (
                <li key={f.id} className="friend-row">
                  <Avatar profile={f.other} size={36} />
                  <div className="friend-names">
                    <span className="strong truncate">{displayName(f.other)}</span>
                    <span className="muted small">Wants to be friends</span>
                  </div>
                  <button className="round-btn ok" title="Accept" aria-label="Accept" onClick={() => actions.acceptFriend(f.id)}>
                    ✓
                  </button>
                  <button className="round-btn no" title="Decline" aria-label="Decline" onClick={() => actions.removeFriendship(f.id)}>
                    ✕
                  </button>
                </li>
              ))}
              {outgoing.map((f) => (
                <li key={f.id} className="friend-row">
                  <Avatar profile={f.other} size={36} />
                  <div className="friend-names">
                    <span className="strong truncate">{displayName(f.other)}</span>
                    <span className="muted small">Request sent</span>
                  </div>
                  <button className="round-btn no" title="Cancel" aria-label="Cancel request" onClick={() => actions.removeFriendship(f.id)}>
                    ✕
                  </button>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    </div>
  )
}

function FriendList({ title, rows, online, empty, actions }) {
  const [confirming, setConfirming] = useState(null)
  return (
    <>
      <div className="section-label">{title}</div>
      {rows.length === 0 && <p className="muted empty-line">{empty}</p>}
      <ul className="friend-list">
        {rows.map((f) => (
          <li key={f.id} className="friend-row">
            <Avatar profile={f.other} size={36} online={online.has(f.other.id)} />
            <div className="friend-names">
              <span className="strong truncate">{displayName(f.other)}</span>
              <span className="muted small">
                {online.has(f.other.id) ? 'Online' : 'Offline'} · @{f.other.username}
              </span>
            </div>
            {confirming === f.id ? (
              <>
                <button className="btn danger small" onClick={() => actions.removeFriendship(f.id)}>
                  Remove
                </button>
                <button className="btn small" onClick={() => setConfirming(null)}>
                  Keep
                </button>
              </>
            ) : (
              <>
                <button className="round-btn" title="Message" aria-label="Message" onClick={() => actions.openDm(f.other.id)}>
                  💬
                </button>
                <button className="round-btn no" title="Remove friend" aria-label="Remove friend" onClick={() => setConfirming(f.id)}>
                  ✕
                </button>
              </>
            )}
          </li>
        ))}
      </ul>
    </>
  )
}

function AddFriend({ actions }) {
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState(null) // { ok, text }

  async function submit(e) {
    e.preventDefault()
    setBusy(true)
    setResult(null)
    try {
      const r = await actions.sendFriendRequest(name)
      setResult({ ok: true, text: r === 'accepted' ? `You and ${name} are now friends!` : `Friend request sent to ${name}.` })
      setName('')
    } catch (err) {
      setResult({ ok: false, text: err.message })
    } finally {
      setBusy(false)
    }
  }

  return (
    <form className="add-friend" onSubmit={submit}>
      <h3>Add friend</h3>
      <p className="muted">Type their Cove username. It's the @name under their display name.</p>
      <div className="copy-row">
        <input
          autoFocus
          placeholder="username"
          value={name}
          maxLength={33}
          onChange={(e) => setName(e.target.value)}
          aria-label="Username"
        />
        <button className="btn primary" disabled={busy || !name.trim()}>
          {busy ? 'Sending…' : 'Send request'}
        </button>
      </div>
      {result && <div className={result.ok ? 'form-notice' : 'form-error'}>{result.text}</div>}
    </form>
  )
}
