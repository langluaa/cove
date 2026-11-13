import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '../supabase'
import { load, save } from '../storage'
import ServerRail from './ServerRail'
import ChannelSidebar from './ChannelSidebar'
import Chat from './Chat'
import MemberList from './MemberList'
import {
  AddServerDialog,
  InviteDialog,
  CreateChannelDialog,
  ServerSettingsDialog,
  ProfileDialog,
  ConfirmDialog,
} from './dialogs'

export default function Shell({ user, pendingInvite, clearInvite }) {
  const [profile, setProfile] = useState(null)
  const [servers, setServers] = useState(null) // null = loading
  const [activeServerId, setActiveServerId] = useState(() => load('cove:lastServer'))
  const [channels, setChannels] = useState([])
  const [activeChannelId, setActiveChannelId] = useState(null)
  const [members, setMembers] = useState([])
  const [online, setOnline] = useState(() => new Set())
  const [modal, setModal] = useState(null) // { type, ...props }
  const [navOpen, setNavOpen] = useState(false)
  const [showMembers, setShowMembers] = useState(() => load('cove:showMembers', true))
  const [toast, setToast] = useState('')

  const activeServer = servers?.find((s) => s.id === activeServerId) || null
  const activeChannel = channels.find((c) => c.id === activeChannelId) || null
  const isOwner = activeServer?.owner_id === user.id

  const toastTimer = useRef(null)
  const notify = useCallback((msg) => {
    setToast(msg)
    clearTimeout(toastTimer.current)
    toastTimer.current = setTimeout(() => setToast(''), 4000)
  }, [])

  // ---------- data loaders ----------

  const loadProfile = useCallback(async () => {
    const { data } = await supabase.from('profiles').select('*').eq('id', user.id).single()
    if (data) setProfile(data)
  }, [user.id])

  const loadServers = useCallback(async () => {
    const { data, error } = await supabase
      .from('server_members')
      .select('joined_at, server:servers(*)')
      .eq('user_id', user.id)
      .order('joined_at')
    if (error) return notify(error.message)
    setServers(data.map((r) => r.server).filter(Boolean))
  }, [user.id, notify])

  const loadChannels = useCallback(async (sid) => {
    if (!sid) return setChannels([])
    const { data, error } = await supabase
      .from('channels')
      .select('*')
      .eq('server_id', sid)
      .order('position')
      .order('created_at')
    if (!error) setChannels(data)
  }, [])

  const loadMembers = useCallback(async (sid) => {
    if (!sid) return setMembers([])
    const { data, error } = await supabase
      .from('server_members')
      .select('role, joined_at, user:profiles(*)')
      .eq('server_id', sid)
    if (!error) setMembers(data.filter((m) => m.user))
  }, [])

  useEffect(() => {
    loadProfile()
    loadServers()
  }, [loadProfile, loadServers])

  // Keep the selected server valid.
  useEffect(() => {
    if (!servers) return
    if (!servers.some((s) => s.id === activeServerId)) {
      setActiveServerId(servers[0]?.id ?? null)
    }
  }, [servers, activeServerId])

  useEffect(() => save('cove:lastServer', activeServerId), [activeServerId])
  useEffect(() => save('cove:showMembers', showMembers), [showMembers])

  // When the server changes, load its channels + members.
  useEffect(() => {
    setChannels([])
    setMembers([])
    setActiveChannelId(null)
    loadChannels(activeServerId)
    loadMembers(activeServerId)
  }, [activeServerId, loadChannels, loadMembers])

  // Keep the selected channel valid (remember last channel per server).
  useEffect(() => {
    if (!activeServerId || channels.length === 0) return
    if (channels.some((c) => c.id === activeChannelId)) return
    const remembered = load('cove:lastChannel:' + activeServerId)
    const pick = channels.find((c) => c.id === remembered) || channels[0]
    setActiveChannelId(pick.id)
  }, [channels, activeChannelId, activeServerId])

  useEffect(() => {
    if (activeServerId && activeChannelId) save('cove:lastChannel:' + activeServerId, activeChannelId)
  }, [activeServerId, activeChannelId])

  // ---------- realtime ----------

  // Refs so realtime handlers always see current values without resubscribing.
  const activeServerRef = useRef(activeServerId)
  activeServerRef.current = activeServerId

  useEffect(() => {
    const ch = supabase
      .channel('cove-global')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'server_members' }, (p) => {
        const row = p.new?.server_id ? p.new : p.old
        if (!row) return
        if (row.user_id === user.id) loadServers()
        if (row.server_id === activeServerRef.current) loadMembers(activeServerRef.current)
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'servers' }, () => loadServers())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'profiles' }, (p) => {
        if (p.new?.id === user.id) setProfile(p.new)
        loadMembers(activeServerRef.current)
      })
      .subscribe()
    return () => supabase.removeChannel(ch)
  }, [user.id, loadServers, loadMembers])

  useEffect(() => {
    if (!activeServerId) return
    const sid = activeServerId
    const ch = supabase
      .channel('cove-channels-' + sid)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'channels', filter: 'server_id=eq.' + sid },
        () => loadChannels(sid),
      )
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'channels' }, (p) =>
        setChannels((cs) => cs.filter((c) => c.id !== p.old.id)),
      )
      .subscribe()
    return () => supabase.removeChannel(ch)
  }, [activeServerId, loadChannels])

  // Who's online in this server (Supabase Presence).
  useEffect(() => {
    setOnline(new Set())
    if (!activeServerId) return
    const ch = supabase.channel('cove-presence-' + activeServerId, {
      config: { presence: { key: user.id } },
    })
    ch.on('presence', { event: 'sync' }, () => setOnline(new Set(Object.keys(ch.presenceState()))))
    ch.subscribe(async (status) => {
      if (status === 'SUBSCRIBED') await ch.track({ at: Date.now() })
    })
    return () => supabase.removeChannel(ch)
  }, [activeServerId, user.id])

  // ---------- invite links ----------

  useEffect(() => {
    if (!pendingInvite) return
    ;(async () => {
      const { data, error } = await supabase.rpc('join_server', { code: pendingInvite })
      clearInvite()
      if (error) return notify(error.message)
      await loadServers()
      setActiveServerId(data)
    })()
  }, [pendingInvite, clearInvite, loadServers, notify])

  // ---------- actions ----------

  const actions = {
    async createServer(name, color) {
      const { data, error } = await supabase.rpc('create_server', { server_name: name, color })
      if (error) throw error
      await loadServers()
      setActiveServerId(data)
    },
    async joinServer(input) {
      const m = input.match(/invite\/([a-z0-9]+)/i)
      const code = (m ? m[1] : input).trim()
      const { data, error } = await supabase.rpc('join_server', { code })
      if (error) throw error
      await loadServers()
      setActiveServerId(data)
    },
    async createChannel(rawName) {
      const name = rawName
        .toLowerCase()
        .trim()
        .replace(/\s+/g, '-')
        .replace(/[^a-z0-9-]/g, '')
        .slice(0, 32)
      if (!name) throw new Error('Channel names can use letters, numbers and dashes.')
      const position = channels.reduce((max, c) => Math.max(max, c.position), -1) + 1
      const { data, error } = await supabase
        .from('channels')
        .insert({ server_id: activeServerId, name, position })
        .select()
        .single()
      if (error) throw error
      await loadChannels(activeServerId)
      setActiveChannelId(data.id)
    },
    async deleteChannel(id) {
      const { error } = await supabase.from('channels').delete().eq('id', id)
      if (error) return notify(error.message)
      setChannels((cs) => cs.filter((c) => c.id !== id))
    },
    async renameServer(name, color) {
      const { error } = await supabase
        .from('servers')
        .update({ name: name.trim(), icon_color: color })
        .eq('id', activeServerId)
      if (error) throw error
      await loadServers()
    },
    async deleteServer() {
      const { error } = await supabase.from('servers').delete().eq('id', activeServerId)
      if (error) return notify(error.message)
      await loadServers()
    },
    async leaveServer() {
      const { error } = await supabase
        .from('server_members')
        .delete()
        .eq('server_id', activeServerId)
        .eq('user_id', user.id)
      if (error) return notify(error.message)
      await loadServers()
    },
    async kick(userId) {
      const { error } = await supabase
        .from('server_members')
        .delete()
        .eq('server_id', activeServerId)
        .eq('user_id', userId)
      if (error) return notify(error.message)
      loadMembers(activeServerId)
    },
    async resetInvite() {
      const { error } = await supabase.rpc('reset_invite', { sid: activeServerId })
      if (error) throw error
      await loadServers()
    },
    async updateProfile(fields) {
      const { data, error } = await supabase.from('profiles').update(fields).eq('id', user.id).select().single()
      if (error) throw error
      setProfile(data)
      loadMembers(activeServerId)
    },
    signOut: () => supabase.auth.signOut(),
  }

  const memberMap = useMemo(() => {
    const m = new Map()
    members.forEach((x) => m.set(x.user.id, { ...x.user, role: x.role }))
    if (profile && !m.has(profile.id)) m.set(profile.id, profile)
    return m
  }, [members, profile])

  const closeModal = useCallback(() => setModal(null), [])
  const confirm = (title, body, confirmLabel, onConfirm) =>
    setModal({ type: 'confirm', title, body, confirmLabel, onConfirm })

  // ---------- render ----------

  if (servers === null) {
    return <div className="splash"><div className="spinner" /></div>
  }

  return (
    <div className={'app' + (navOpen ? ' nav-open' : '')}>
      <div className="nav">
        <ServerRail
          servers={servers}
          activeId={activeServerId}
          onSelect={(id) => setActiveServerId(id)}
          onAdd={() => setModal({ type: 'addServer' })}
        />
        <ChannelSidebar
          server={activeServer}
          channels={channels}
          activeChannelId={activeChannelId}
          isOwner={isOwner}
          profile={profile}
          onSelectChannel={(id) => {
            setActiveChannelId(id)
            setNavOpen(false)
          }}
          onInvite={() => setModal({ type: 'invite' })}
          onCreateChannel={() => setModal({ type: 'createChannel' })}
          onDeleteChannel={(c) =>
            confirm('Delete channel', `Delete #${c.name}? All its messages will be gone for good.`, 'Delete', () =>
              actions.deleteChannel(c.id),
            )
          }
          onServerSettings={() => setModal({ type: 'serverSettings' })}
          onLeave={() =>
            confirm('Leave server', `Leave ${activeServer?.name}? You'll need a new invite to come back.`, 'Leave', () =>
              actions.leaveServer(),
            )
          }
          onProfile={() => setModal({ type: 'profile' })}
          onSignOut={actions.signOut}
        />
      </div>
      <div className="nav-scrim" onClick={() => setNavOpen(false)} />

      <main className="main">
        <header className="main-head">
          <button className="icon-btn mobile-only" onClick={() => setNavOpen(true)} aria-label="Open menu">
            ☰
          </button>
          {activeChannel ? (
            <h2 className="channel-title">
              <span className="hash">#</span>
              {activeChannel.name}
            </h2>
          ) : (
            <h2 className="channel-title">{activeServer?.name || 'Cove'}</h2>
          )}
          <div className="spacer" />
          {activeServer && (
            <button
              className={'icon-btn' + (showMembers ? ' active' : '')}
              onClick={() => setShowMembers((v) => !v)}
              aria-label="Toggle member list"
              title="Members"
            >
              👥
            </button>
          )}
        </header>

        <div className="main-body">
          {!activeServer ? (
            <Welcome
              onCreate={() => setModal({ type: 'addServer', tab: 'create' })}
              onJoin={() => setModal({ type: 'addServer', tab: 'join' })}
            />
          ) : activeChannel ? (
            <Chat
              key={activeChannel.id}
              channel={activeChannel}
              user={user}
              memberMap={memberMap}
              isOwner={isOwner}
              notify={notify}
            />
          ) : (
            <div className="empty-state">
              <h3>No channels yet</h3>
              {isOwner && (
                <button className="btn primary" onClick={() => setModal({ type: 'createChannel' })}>
                  Create a channel
                </button>
              )}
            </div>
          )}
          {activeServer && showMembers && (
            <MemberList
              members={members}
              online={online}
              ownerId={activeServer.owner_id}
              me={user.id}
              isOwner={isOwner}
              onKick={(m) =>
                confirm('Kick member', `Remove ${m.user.display_name || m.user.username} from the server?`, 'Kick', () =>
                  actions.kick(m.user.id),
                )
              }
            />
          )}
        </div>
      </main>

      {modal?.type === 'addServer' && (
        <AddServerDialog initialTab={modal.tab} onClose={closeModal} actions={actions} />
      )}
      {modal?.type === 'invite' && activeServer && (
        <InviteDialog server={activeServer} isOwner={isOwner} onClose={closeModal} actions={actions} />
      )}
      {modal?.type === 'createChannel' && <CreateChannelDialog onClose={closeModal} actions={actions} />}
      {modal?.type === 'serverSettings' && activeServer && (
        <ServerSettingsDialog
          server={activeServer}
          onClose={closeModal}
          actions={actions}
          onDelete={() =>
            confirm(
              'Delete server',
              `Delete ${activeServer.name}? Every channel and message goes with it. This can't be undone.`,
              'Delete server',
              () => actions.deleteServer(),
            )
          }
        />
      )}
      {modal?.type === 'profile' && profile && (
        <ProfileDialog profile={profile} onClose={closeModal} actions={actions} />
      )}
      {modal?.type === 'confirm' && <ConfirmDialog {...modal} onClose={closeModal} />}

      {toast && <div className="toast" role="status">{toast}</div>}
    </div>
  )
}

function Welcome({ onCreate, onJoin }) {
  return (
    <div className="empty-state welcome">
      <h3>Welcome to Cove</h3>
      <p className="muted">You're not in any servers yet. Start your own, or join one with an invite.</p>
      <div className="row">
        <button className="btn primary" onClick={onCreate}>
          Create a server
        </button>
        <button className="btn" onClick={onJoin}>
          Join with invite
        </button>
      </div>
    </div>
  )
}
