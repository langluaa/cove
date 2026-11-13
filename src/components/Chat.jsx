import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { supabase } from '../supabase'
import Avatar, { displayName } from './Avatar'

const PAGE = 50
const GROUP_GAP_MS = 7 * 60 * 1000
const AUTHOR_FIELDS = 'id, username, display_name, avatar_color'

function dayLabel(d) {
  const today = new Date()
  const yest = new Date()
  yest.setDate(today.getDate() - 1)
  if (d.toDateString() === today.toDateString()) return 'Today'
  if (d.toDateString() === yest.toDateString()) return 'Yesterday'
  return d.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })
}
const timeLabel = (d) => d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })

// source = { table, column, id, label, introTitle, introText, introIcon }
// e.g. server channel: { table: 'messages', column: 'channel_id', ... }
//      DM:             { table: 'dm_messages', column: 'dm_id', ... }
export default function Chat({ source, user, memberMap, isOwner, notify }) {
  const { table, column, id: sourceId } = source
  const [messages, setMessages] = useState([])
  const [loading, setLoading] = useState(true)
  const [hasMore, setHasMore] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const scrollRef = useRef(null)
  const stickToBottom = useRef(true)
  const restoreFrom = useRef(null) // keeps scroll position when older messages load

  // Look up authors we don't already have (e.g. someone who left the server).
  const memberMapRef = useRef(memberMap)
  memberMapRef.current = memberMap
  const withAuthor = useCallback(async (msg) => {
    const known = memberMapRef.current.get(msg.author_id)
    if (known) return { ...msg, author: known }
    const { data } = await supabase.from('profiles').select(AUTHOR_FIELDS).eq('id', msg.author_id).single()
    return { ...msg, author: data }
  }, [])

  // Initial load
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const { data, error } = await supabase
        .from(table)
        .select(`*, author:profiles(${AUTHOR_FIELDS})`)
        .eq(column, sourceId)
        .order('created_at', { ascending: false })
        .limit(PAGE)
      if (cancelled) return
      if (error) notify(error.message)
      setMessages((data || []).reverse())
      setHasMore((data || []).length === PAGE)
      setLoading(false)
      stickToBottom.current = true
    })()
    return () => {
      cancelled = true
    }
  }, [table, column, sourceId, notify])

  // Live updates
  useEffect(() => {
    const ch = supabase
      .channel('cove-' + table + '-' + sourceId)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table, filter: `${column}=eq.${sourceId}` },
        async (p) => {
          const msg = await withAuthor(p.new)
          setMessages((ms) => (ms.some((m) => m.id === msg.id) ? ms : [...ms, msg]))
        },
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table, filter: `${column}=eq.${sourceId}` },
        (p) =>
          setMessages((ms) =>
            ms.map((m) => (m.id === p.new.id ? { ...m, content: p.new.content, edited_at: p.new.edited_at } : m)),
          ),
      )
      // Delete events can't be filtered by column, so match on id.
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table }, (p) =>
        setMessages((ms) => ms.filter((m) => m.id !== p.old.id)),
      )
      .subscribe()
    return () => supabase.removeChannel(ch)
  }, [table, column, sourceId, withAuthor])

  async function loadOlder() {
    if (!messages.length) return
    const el = scrollRef.current
    restoreFrom.current = el ? el.scrollHeight - el.scrollTop : null
    const { data, error } = await supabase
      .from(table)
      .select(`*, author:profiles(${AUTHOR_FIELDS})`)
      .eq(column, sourceId)
      .lt('created_at', messages[0].created_at)
      .order('created_at', { ascending: false })
      .limit(PAGE)
    if (error) return notify(error.message)
    setHasMore(data.length === PAGE)
    setMessages((ms) => [...data.reverse(), ...ms])
  }

  // Scroll handling: stay pinned to the bottom unless the user scrolled up.
  useLayoutEffect(() => {
    const el = scrollRef.current
    if (!el) return
    if (restoreFrom.current !== null) {
      el.scrollTop = el.scrollHeight - restoreFrom.current
      restoreFrom.current = null
    } else if (stickToBottom.current) {
      el.scrollTop = el.scrollHeight
    }
  }, [messages])

  function onScroll() {
    const el = scrollRef.current
    stickToBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80
  }

  async function send(text) {
    stickToBottom.current = true
    const { data, error } = await supabase
      .from(table)
      .insert({ [column]: sourceId, author_id: user.id, content: text })
      .select(`*, author:profiles(${AUTHOR_FIELDS})`)
      .single()
    if (error) {
      notify(error.message)
      return false
    }
    setMessages((ms) => (ms.some((m) => m.id === data.id) ? ms : [...ms, data]))
    return true
  }

  async function saveEdit(id, text) {
    const { data, error } = await supabase
      .from(table)
      .update({ content: text })
      .eq('id', id)
      .select('id, content, edited_at')
      .single()
    if (error) return notify(error.message)
    setMessages((ms) => ms.map((m) => (m.id === id ? { ...m, ...data } : m)))
    setEditingId(null)
  }

  async function remove(id) {
    if (!window.confirm('Delete this message?')) return
    const { error } = await supabase.from(table).delete().eq('id', id)
    if (error) return notify(error.message)
    setMessages((ms) => ms.filter((m) => m.id !== id))
  }

  // Build rows with day dividers and author grouping.
  const rows = []
  let prev = null
  for (const m of messages) {
    const d = new Date(m.created_at)
    const newDay = !prev || new Date(prev.created_at).toDateString() !== d.toDateString()
    if (newDay) rows.push({ type: 'day', key: 'day-' + m.id, label: dayLabel(d) })
    const grouped =
      !newDay && prev && prev.author_id === m.author_id && d - new Date(prev.created_at) < GROUP_GAP_MS
    rows.push({ type: 'msg', key: m.id, m, d, grouped })
    prev = m
  }

  return (
    <section className="chat">
      <div className="messages" ref={scrollRef} onScroll={onScroll}>
        {loading ? (
          <div className="center-pad">
            <div className="spinner" />
          </div>
        ) : (
          <>
            {hasMore ? (
              <div className="center-pad">
                <button className="btn small" onClick={loadOlder}>
                  Load older messages
                </button>
              </div>
            ) : (
              <div className="channel-intro">
                <div className="intro-hash">{source.introIcon}</div>
                <h3>{source.introTitle}</h3>
                <p className="muted">{source.introText}</p>
              </div>
            )}
            {rows.map((r) =>
              r.type === 'day' ? (
                <div key={r.key} className="day-divider">
                  <span>{r.label}</span>
                </div>
              ) : (
                <Message
                  key={r.key}
                  m={r.m}
                  d={r.d}
                  grouped={r.grouped}
                  mine={r.m.author_id === user.id}
                  canDelete={r.m.author_id === user.id || isOwner}
                  editing={editingId === r.m.id}
                  onEdit={() => setEditingId(r.m.id)}
                  onCancelEdit={() => setEditingId(null)}
                  onSaveEdit={(t) => saveEdit(r.m.id, t)}
                  onDelete={() => remove(r.m.id)}
                />
              ),
            )}
          </>
        )}
      </div>
      <Composer label={source.label} onSend={send} />
    </section>
  )
}

function Message({ m, d, grouped, mine, canDelete, editing, onEdit, onCancelEdit, onSaveEdit, onDelete }) {
  return (
    <div className={'msg' + (grouped ? ' grouped' : '') + (editing ? ' editing' : '')}>
      <div className="msg-gutter">
        {grouped ? (
          <time className="msg-hover-time" dateTime={m.created_at}>
            {timeLabel(d)}
          </time>
        ) : (
          <Avatar profile={m.author} size={40} />
        )}
      </div>
      <div className="msg-main">
        {!grouped && (
          <div className="msg-head">
            <span className="msg-author" style={{ color: m.author?.avatar_color }}>
              {displayName(m.author)}
            </span>
            <time className="msg-time" dateTime={m.created_at} title={d.toLocaleString()}>
              {['Today', 'Yesterday'].includes(dayLabel(d))
                ? dayLabel(d) + ' at ' + timeLabel(d)
                : d.toLocaleDateString() + ' ' + timeLabel(d)}
            </time>
          </div>
        )}
        {editing ? (
          <EditBox initial={m.content} onCancel={onCancelEdit} onSave={onSaveEdit} />
        ) : (
          <div className="msg-content">
            {m.content}
            {m.edited_at && (
              <span className="edited" title={new Date(m.edited_at).toLocaleString()}>
                {' '}
                (edited)
              </span>
            )}
          </div>
        )}
      </div>
      {!editing && (mine || canDelete) && (
        <div className="msg-actions">
          {mine && (
            <button className="icon-btn tiny" onClick={onEdit} title="Edit" aria-label="Edit message">
              ✎
            </button>
          )}
          {canDelete && (
            <button className="icon-btn tiny danger" onClick={onDelete} title="Delete" aria-label="Delete message">
              🗑
            </button>
          )}
        </div>
      )}
    </div>
  )
}

function useAutosize(ref, value) {
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = Math.min(el.scrollHeight, 200) + 'px'
  }, [ref, value])
}

function EditBox({ initial, onCancel, onSave }) {
  const [text, setText] = useState(initial)
  const ref = useRef(null)
  useAutosize(ref, text)
  useEffect(() => {
    const el = ref.current
    el.focus()
    el.setSelectionRange(el.value.length, el.value.length)
  }, [])
  const submit = () => {
    const t = text.trim()
    if (!t) return
    if (t === initial) return onCancel()
    onSave(t)
  }
  return (
    <div className="edit-box">
      <textarea
        ref={ref}
        rows={1}
        value={text}
        maxLength={2000}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Escape') onCancel()
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault()
            submit()
          }
        }}
      />
      <div className="muted small">
        Esc to <button className="link" onClick={onCancel}>cancel</button> · Enter to{' '}
        <button className="link" onClick={submit}>save</button>
      </div>
    </div>
  )
}

function Composer({ label, onSend }) {
  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)
  const ref = useRef(null)
  useAutosize(ref, text)

  async function submit() {
    const t = text.trim()
    if (!t || sending) return
    setSending(true)
    const ok = await onSend(t)
    setSending(false)
    if (ok) setText('')
    ref.current?.focus()
  }

  return (
    <div className="composer">
      <textarea
        ref={ref}
        rows={1}
        value={text}
        maxLength={2000}
        placeholder={`Message ${label}`}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
            e.preventDefault()
            submit()
          }
        }}
      />
      <button className="send-btn" onClick={submit} disabled={!text.trim() || sending} aria-label="Send">
        ➤
      </button>
    </div>
  )
}
