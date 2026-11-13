import { useState } from 'react'
import Modal from './Modal'
import Avatar from './Avatar'

export const COLORS = ['#2bb3a3', '#e8875b', '#7c8cf8', '#e45f7a', '#f2c14e', '#5bbf6a', '#b47ce8', '#4aa3df']

function ColorPicker({ value, onChange }) {
  return (
    <div className="color-row" role="radiogroup" aria-label="Color">
      {COLORS.map((c) => (
        <button
          key={c}
          type="button"
          role="radio"
          aria-checked={value === c}
          aria-label={c}
          className={'swatch' + (value === c ? ' on' : '')}
          style={{ background: c }}
          onClick={() => onChange(c)}
        />
      ))}
    </div>
  )
}

// Runs an async action, shows its error, closes on success.
function useSubmit(onClose) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const run = async (fn) => {
    setBusy(true)
    setError('')
    try {
      await fn()
      onClose()
    } catch (e) {
      setError(e.message || 'Something went wrong.')
      setBusy(false)
    }
  }
  return { busy, error, run }
}

export function AddServerDialog({ initialTab = 'create', onClose, actions }) {
  const [tab, setTab] = useState(initialTab)
  const [name, setName] = useState('')
  const [color, setColor] = useState(COLORS[0])
  const [code, setCode] = useState('')
  const { busy, error, run } = useSubmit(onClose)

  const submit = (e) => {
    e.preventDefault()
    if (tab === 'create') run(() => actions.createServer(name.trim(), color))
    else run(() => actions.joinServer(code))
  }

  return (
    <Modal title={tab === 'create' ? 'Create a server' : 'Join a server'} onClose={onClose}>
      <div className="tabs">
        <button className={tab === 'create' ? 'on' : ''} onClick={() => setTab('create')}>
          Create
        </button>
        <button className={tab === 'join' ? 'on' : ''} onClick={() => setTab('join')}>
          Join
        </button>
      </div>
      <form onSubmit={submit} className="stack">
        {tab === 'create' ? (
          <>
            <label>
              Server name
              <input autoFocus required maxLength={50} value={name} onChange={(e) => setName(e.target.value)} />
            </label>
            <div>
              <div className="field-label">Icon color</div>
              <ColorPicker value={color} onChange={setColor} />
            </div>
          </>
        ) : (
          <label>
            Invite link or code
            <input
              autoFocus
              required
              placeholder="e.g. a1b2c3d4"
              value={code}
              onChange={(e) => setCode(e.target.value)}
            />
          </label>
        )}
        {error && <div className="form-error">{error}</div>}
        <button className="btn primary block" disabled={busy || (tab === 'create' ? !name.trim() : !code.trim())}>
          {busy ? 'One sec…' : tab === 'create' ? 'Create server' : 'Join server'}
        </button>
      </form>
    </Modal>
  )
}

export function InviteDialog({ server, isOwner, onClose, actions }) {
  const link = `${window.location.origin}${window.location.pathname}#/invite/${server.invite_code}`
  const [copied, setCopied] = useState('')
  const [error, setError] = useState('')

  const copy = async (text, what) => {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(what)
      setTimeout(() => setCopied(''), 1500)
    } catch {
      setError("Couldn't copy — select it and copy by hand.")
    }
  }

  return (
    <Modal title={`Invite people to ${server.name}`} onClose={onClose}>
      <div className="stack">
        <div>
          <div className="field-label">Invite link</div>
          <div className="copy-row">
            <input readOnly value={link} onFocus={(e) => e.target.select()} />
            <button className="btn primary" onClick={() => copy(link, 'link')}>
              {copied === 'link' ? 'Copied!' : 'Copy'}
            </button>
          </div>
        </div>
        <div>
          <div className="field-label">Or share the code</div>
          <div className="copy-row">
            <input readOnly className="mono" value={server.invite_code} onFocus={(e) => e.target.select()} />
            <button className="btn" onClick={() => copy(server.invite_code, 'code')}>
              {copied === 'code' ? 'Copied!' : 'Copy'}
            </button>
          </div>
        </div>
        {isOwner && (
          <p className="muted small">
            Invite got out?{' '}
            <button
              className="link"
              onClick={() => actions.resetInvite().catch((e) => setError(e.message))}
            >
              Make a new one
            </button>{' '}
            — the old one stops working.
          </p>
        )}
        {error && <div className="form-error">{error}</div>}
      </div>
    </Modal>
  )
}

export function CreateChannelDialog({ onClose, actions }) {
  const [name, setName] = useState('')
  const { busy, error, run } = useSubmit(onClose)
  const preview = name.toLowerCase().trim().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '')
  return (
    <Modal title="Create channel" onClose={onClose}>
      <form
        className="stack"
        onSubmit={(e) => {
          e.preventDefault()
          run(() => actions.createChannel(name))
        }}
      >
        <label>
          Channel name
          <div className="input-prefix">
            <span>#</span>
            <input autoFocus required maxLength={32} placeholder="new-channel" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
        </label>
        {name && preview !== name && <p className="muted small">Will be created as #{preview || '…'}</p>}
        {error && <div className="form-error">{error}</div>}
        <button className="btn primary block" disabled={busy || !preview}>
          {busy ? 'One sec…' : 'Create channel'}
        </button>
      </form>
    </Modal>
  )
}

export function ServerSettingsDialog({ server, onClose, actions, onDelete }) {
  const [name, setName] = useState(server.name)
  const [color, setColor] = useState(server.icon_color)
  const { busy, error, run } = useSubmit(onClose)
  return (
    <Modal title="Server settings" onClose={onClose}>
      <form
        className="stack"
        onSubmit={(e) => {
          e.preventDefault()
          run(() => actions.renameServer(name, color))
        }}
      >
        <label>
          Server name
          <input required maxLength={50} value={name} onChange={(e) => setName(e.target.value)} />
        </label>
        <div>
          <div className="field-label">Icon color</div>
          <ColorPicker value={color} onChange={setColor} />
        </div>
        {error && <div className="form-error">{error}</div>}
        <button className="btn primary block" disabled={busy || !name.trim()}>
          Save changes
        </button>
        <hr />
        <button type="button" className="btn danger block" onClick={onDelete}>
          Delete server
        </button>
      </form>
    </Modal>
  )
}

export function ProfileDialog({ profile, onClose, actions }) {
  const [displayName, setDisplayName] = useState(profile.display_name || '')
  const [color, setColor] = useState(profile.avatar_color)
  const { busy, error, run } = useSubmit(onClose)
  return (
    <Modal title="Your profile" onClose={onClose}>
      <form
        className="stack"
        onSubmit={(e) => {
          e.preventDefault()
          run(() => actions.updateProfile({ display_name: displayName.trim() || null, avatar_color: color }))
        }}
      >
        <div className="profile-preview">
          <Avatar profile={{ ...profile, display_name: displayName, avatar_color: color }} size={64} />
          <div>
            <div className="strong">{displayName.trim() || profile.username}</div>
            <div className="muted small">@{profile.username}</div>
          </div>
        </div>
        <label>
          Display name
          <input maxLength={32} placeholder={profile.username} value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
        </label>
        <div>
          <div className="field-label">Color</div>
          <ColorPicker value={color} onChange={setColor} />
        </div>
        {error && <div className="form-error">{error}</div>}
        <button className="btn primary block" disabled={busy}>
          Save
        </button>
      </form>
    </Modal>
  )
}

export function ConfirmDialog({ title, body, confirmLabel, onConfirm, onClose }) {
  const [busy, setBusy] = useState(false)
  return (
    <Modal
      title={title}
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={onClose}>
            Cancel
          </button>
          <button
            className="btn danger"
            disabled={busy}
            onClick={async () => {
              setBusy(true)
              await onConfirm()
              onClose()
            }}
          >
            {confirmLabel}
          </button>
        </>
      }
    >
      <p>{body}</p>
    </Modal>
  )
}
