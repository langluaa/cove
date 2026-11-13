import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '../supabase'
import { load, save } from '../storage'
import ServerRail from './ServerRail'
import ChannelSidebar from './ChannelSidebar'
import Chat from './Chat'
import MemberList from './MemberList'
import Avatar, { displayName } from './Avatar'
import { HomeSidebarList, FriendsPage } from './Home'
import {
  AddServerDialog,
  InviteDialog,
  CreateChannelDialog,
  ServerSettingsDialog,
  ProfileDialog,
  ConfirmDialog,
} from './dialogs'

const HOME = 'home'
const PROFILE_FIELDS = 'id, username, display_name, avatar_color'

export default function Shell({ user, pendingInvite, clearInvite }) {
  const [profile, setProfile] = useState(null)
  const [servers, setServers] = useState(null) // null = loading
  const [activeServerId, setActiveServerId] = useState(() => load('cove:lastServer', HOME))
  const [channels, setChannels] = useState([])
  const [activeChannelId, setActiveChannelId] = useState(null)
  const [members, setMembers] = useState([])
  const [friendships, setFriendships] = useState([])
  const [dms, setDms] = useState([])
  const [dmsReady, setDmsReady] = useState(false)
  const [activeDmId, setActiveDmId] = useState(() => load('cove:lastDm'))
  // null = first time on this device: existing DMs count as already read.
  const [readAt, setReadAt] = useState(() => load('cove:dmRead', null))
  const [online, setOnline] = useState(() => new Set())
  const [modal, setModal] = useState(null) // { type, ...props }
  const [navOpen, setNavOpen] = useState(false)
  const [showMembers, setShowMembers] = useState(() => load('cove:showMembers', true))
  const [toast, setToast] = useState('')

  const isHome = activeServerId === HOME
  const serverId = isHome ? null : activeServerId
  const activeServer = servers?.find((s) => s.id === serverId) || null
  const activeChannel = channels.find((c) => c.id === activeChannelId) || null
  const activeDm = isHome ? dms.find((d) => d.id === activeDmId) || null : null
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

  const loadFriendships = useCallback(async () => {
    const { data, error } = await supabase
      .from('friendships')
      .select(
        `id, status, requester_id, addressee_id, created_at,
         requester:profiles!friendships_requester_id_fkey(${PROFILE_FIELDS}),
         addressee:profiles!friendships_addressee_id_fkey(${PROFILE_FIELDS})`,
      )
    if (error) return // table missing until migration 002 is run
    setFriendships(data)
  }, [])

  const loadDms = useCallback(async () => {
    const { data, error } = await supabase
      .from('dm_channels')
      .select(
        `id, user_a, user_b, created_at, last_message_at,
         a:profiles!dm_channels_user_a_fkey(${PROFILE_FIELDS}),
         b:profiles!dm_channels_user_b_fkey(${PROFILE_FIELDS})`,
      )
      .order('last_message_at', { ascending: false })
    if (error) return
    setDms(data.map((d) => ({ ...d, other: d.user_a === user.id ? d.b : d.a })))
    setDmsReady(true)
  }, [user.id])

  useEffect(() => {
    loadProfile()
    loadServers()
    loadFriendships()
    loadDms()
  }, [loadProfile, loadServers, loadFriendships, loadDms])

  // Keep the selected server valid (fall back to Home).
  useEffect(() => {
    if (!servers || activeServerId === HOME) return
    if (!servers.some((s) => s.id === activeServerId)) setActiveServerId(HOME)
  }, [servers, activeServerId])

  // Keep the selected DM valid once DMs have loaded.
  useEffect(() => {
    if (dmsReady && activeDmId && !dms.some((d) => d.id === activeDmId)) setActiveDmId(null)
  }, [dms, dmsReady, activeDmId])

  useEffect(() => save('cove:lastServer', activeServerId), [activeServerId])
  useEffect(() => save('cove:lastDm', activeDmId), [activeDmId])
  useEffect(() => save('cove:showMembers', showMembers), [showMembers])
  useEffect(() => {
    if (readAt) save('cove:dmRead', readAt)
  }, [readAt])
  useEffect(() => {
    if (readAt === null && dmsReady) {
      setReadAt(Object.fromEntries(dms.map((d) => [d.id, d.last_message_at])))
    }
  }, [readAt, dms, dmsReady])

  // Viewing a DM marks it read (including new messages while it's open).
  useEffect(() => {
    if (!activeDm || !readAt) return
    if (readAt[activeDm.id] !== activeDm.last_message_at) {
      setReadAt((r) => ({ ...r, [activeDm.id]: activeDm.last_message_at }))
    }
  }, [activeDm, readAt])

  const unread = useMemo(() => {
    const s = new Set()
    if (!readAt) return s
    for (const d of dms) {
      const last = new Date(d.last_message_at)
      const seen = readAt[d.id] ? new Date(readAt[d.id]) : new Date(d.created_at)
      if (last - seen > 1000 && d.id !== activeDm?.id) s.add(d.id)
    }
    return s
  }, [dms, readAt, activeDm])

  // When the server changes, load its channels + members.
  useEffect(() => {
    setChannels([])
    setMembers([])
    setActiveChannelId(null)
    loadChannels(serverId)
    loadMembers(serverId)
  }, [serverId, loadChannels, loadMembers])

  // Keep the selected channel valid (remember last channel per server).
  useEffect(() => {
    if (!serverId || channels.length === 0) return
    if (channels.some((c) => c.id === activeChannelId)) return
    const remembered = load('cove:lastChannel:' + serverId)
    const pick = channels.find((c) => c.id === remembered) || channels[0]
    setActiveChannelId(pick.id)
  }, [channels, activeChannelId, serverId])

  useEffect(() => {
    if (serverId && activeChannelId) save('cove:lastChannel:' + serverId, activeChannelId)
  }, [serverId, activeChannelId])

  // ---------- realtime ----------

  const serverRef = useRef(serverId)
  serverRef.current = serverId

  useEffect(() => {
    const ch = supabase
      .channel('cove-global')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'server_members' }, (p) => {
        const row = p.new?.server_id ? p.new : p.old
        if (!row) return
        if (row.user_id === user.id || !row.user_id) loadServers()
        if (row.server_id === serverRef.current) loadMembers(serverRef.current)
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'servers' }, () => loadServers())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'profiles' }, (p) => {
        if (p.new?.id === user.id) setProfile(p.new)
        loadMembers(serverRef.current)
        loadFriendships()
        loadDms()
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'friendships' }, () => loadFriendships())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'dm_channels' }, () => loadDms())
      .subscribe()
    return () => supabase.removeChannel(ch)
  }, [user.id, loadServers, loadMembers, loadFriendships, loadDms])

  useEffect(() => {
    if (!serverId) return
    const sid = serverId
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
  }, [serverId, loadChannels])

  // Who's online anywhere in Cove (Supabase Presence).
  useEffect(() => {
    const ch = supabase.channel('cove-online', { config: { presence: { key: user.id } } })
    ch.on('presence', { event: 'sync' }, () => setOnline(new Set(Object.keys(ch.presenceState()))))
    ch.subscribe(async (status) => {
      if (status === 'SUBSCRIBED') await ch.track({ at: Date.now() })
    })
    return () => supabase.removeChannel(ch)
  }, [user.id])

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
        .insert({ server_id: serverId, name, position })
        .select()
        .single()
      if (error) throw error
      await loadChannels(serverId)
      setActiveChannelId(data.id)
    },
    async deleteChannel(id) {
      const { error } = await supabase.from('channels').delete().eq('id', id)
      if (error) return notify(error.message)
      setChannels((cs) => cs.filter((c) => c.id !== id))
    },
    async renameServer(name, color) {
      const { error } = await supabase.from('servers').update({ name: name.trim(), icon_color: color }).eq('id', serverId)
      if (error) throw error
      await loadServers()
    },
    async deleteServer() {
      const { error } = await supabase.from('servers').delete().eq('id', serverId)
      if (error) return notify(error.message)
      await loadServers()
    },
    async leaveServer() {
      const { error } = await supabase.from('server_members').delete().eq('server_id', serverId).eq('user_id', user.id)
      if (error) return notify(error.message)
      await loadServers()
    },
    async kick(userId) {
      const { error } = await supabase.from('server_members').delete().eq('server_id', serverId).eq('user_id', userId)
      if (error) return notify(error.message)
      loadMembers(serverId)
    },
    async resetInvite() {
      const { error } = await supabase.rpc('reset_invite', { sid: serverId })
      if (error) throw error
      await loadServers()
    },
    async updateProfile(fields) {
      const { data, error } = await supabase.from('profiles').update(fields).eq('id', user.id).select().single()
      if (error) throw error
      setProfile(data)
      loadMembers(serverId)
    },
    async sendFriendRequest(username) {
      const { data, error } = await supabase.rpc('send_friend_request', { target_username: username })
      if (error) throw new Error(migrationHint(error))
      await loadFriendships()
      return data
    },
    async acceptFriend(id) {
      const { error } = await supabase.from('friendships').update({ status: 'accepted' }).eq('id', id)
      if (error) return notify(error.message)
      loadFriendships()
    },
    async removeFriendship(id) {
      const { error } = await supabase.from('friendships').delete().eq('id', id)
      if (error) return notify(error.message)
      setFriendships((fs) => fs.filter((f) => f.id !== id))
    },
    async openDm(otherId) {
      const { data, error } = await supabase.rpc('open_dm', { other: otherId })
      if (error) return notify(migrationHint(error))
      await loadDms()
      setActiveServerId(HOME)
      setActiveDmId(data)
      setNavOpen(false)
    },
    signOut: () => supabase.auth.signOut(),
  }

  // ---------- derived ----------

  const { friends, incoming, outgoing } = useMemo(() => {
    const out = { friends: [], incoming: [], outgoing: [] }
    for (const f of friendships) {
      const mine = f.requester_id === user.id
      const row = { ...f, other: mine ? f.addressee : f.requester }
      if (!row.other) continue
      if (f.status === 'accepted') out.friends.push(row)
      else if (mine) out.outgoing.push(row)
      else out.incoming.push(row)
    }
    out.friends.sort((a, b) => displayName(a.other).localeCompare(displayName(b.other)))
    return out
  }, [friendships, user.id])

  const memberMap = useMemo(() => {
    const m = new Map()
    members.forEach((x) => m.set(x.user.id, { ...x.user, role: x.role }))
    if (activeDm?.other) m.set(activeDm.other.id, activeDm.other)
    if (profile) m.set(profile.id, profile)
    return m
  }, [members, profile, activeDm])

  const closeModal = useCallback(() => setModal(null), [])
  const confirm = (title, body, confirmLabel, onConfirm) =>
    setModal({ type: 'confirm', title, body, confirmLabel, onConfirm })

  const chatSource = useMemo(() => {
    if (activeDm) {
      const name = displayName(activeDm.other)
      return {
        table: 'dm_messages',
        column: 'dm_id',
        id: activeDm.id,
        label: '@' + name,
        introIcon: '@',
        introTitle: name,
        introText: `This is the beginning of your direct messages with @${activeDm.other?.username}.`,
      }
    }
    if (activeChannel) {
      return {
        table: 'messages',
        column: 'channel_id',
        id: activeChannel.id,
        label: '#' + activeChannel.name,
        introIcon: '#',
        introTitle: `Welcome to #${activeChannel.name}`,
        introText: 'This is the very start of the channel.',
      }
    }
    return null
  }, [activeDm, activeChannel])

  // ---------- render ----------

  if (servers === null) {
    return (
      <div className="splash">
        <div className="spinner" />
      </div>
    )
  }

  return (
    <div className={'app' + (navOpen ? ' nav-open' : '')}>
      <div className="nav">
        <ServerRail
          servers={servers}
          activeId={activeServerId}
          homeActive={isHome}
          homeBadge={incoming.length + unread.size}
          onHome={() => setActiveServerId(HOME)}
          onSelect={(id) => setActiveServerId(id)}
          onAdd={() => setModal({ type: 'addServer' })}
        />
        <ChannelSidebar
          server={activeServer}
          channels={channels}
          activeChannelId={activeChannelId}
          isOwner={isOwner}
          profile={profile}
          homeList={
            isHome ? (
              <HomeSidebarList
                dms={dms}
                activeDmId={activeDm ? activeDm.id : null}
                unread={unread}
                online={online}
                incomingCount={incoming.length}
                onFriends={() => {
                  setActiveDmId(null)
                  setNavOpen(false)
                }}
                onSelectDm={(id) => {
                  setActiveDmId(id)
                  setNavOpen(false)
                }}
              />
            ) : null
          }
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
          {isHome && activeDm ? (
            <h2 className="channel-title">
              <Avatar profile={activeDm.other} size={26} online={online.has(activeDm.other?.id)} />
              <span className="truncate">{displayName(activeDm.other)}</span>
            </h2>
          ) : isHome ? (
            <h2 className="channel-title">
              <span aria-hidden="true">👋</span> Friends
            </h2>
          ) : activeChannel ? (
            <h2 className="channel-title">
              <span className="hash">#</span>
              <span className="truncate">{activeChannel.name}</span>
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
          {isHome && !activeDm ? (
            <FriendsPage
              friends={friends}
              incoming={incoming}
              outgoing={outgoing}
              online={online}
              noServers={servers.length === 0}
              actions={actions}
              onCreateServer={() => setModal({ type: 'addServer', tab: 'create' })}
              onJoinServer={() => setModal({ type: 'addServer', tab: 'join' })}
            />
          ) : chatSource ? (
            <Chat
              key={chatSource.table + chatSource.id}
              source={chatSource}
              user={user}
              memberMap={memberMap}
              isOwner={!isHome && isOwner}
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
              onMessage={(id) => actions.openDm(id)}
              onKick={(m) =>
                confirm('Kick member', `Remove ${displayName(m.user)} from the server?`, 'Kick', () =>
                  actions.kick(m.user.id),
                )
              }
            />
          )}
        </div>
      </main>

      {modal?.type === 'addServer' && <AddServerDialog initialTab={modal.tab} onClose={closeModal} actions={actions} />}
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
      {modal?.type === 'profile' && profile && <ProfileDialog profile={profile} onClose={closeModal} actions={actions} />}
      {modal?.type === 'confirm' && <ConfirmDialog {...modal} onClose={closeModal} />}

      {toast && (
        <div className="toast" role="status">
          {toast}
        </div>
      )}
    </div>
  )
}

// If migration 002 hasn't been run, Supabase says the function doesn't exist.
function migrationHint(error) {
  if (/could not find the function|does not exist/i.test(error.message)) {
    return 'Friends & DMs need a quick database update: run supabase/002_friends_dms.sql in Supabase.'
  }
  return error.message
}
