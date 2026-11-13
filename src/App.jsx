import { useEffect, useState } from 'react'
import { supabase } from './supabase'
import { isConfigured } from './config'
import Auth from './components/Auth'
import Shell from './components/Shell'
import Logo from './components/Logo'
import { load, save } from './storage'

// Invite links look like  https://site/cove/#/invite/abc12345
function readInviteFromHash() {
  const m = window.location.hash.match(/^#\/invite\/([a-z0-9]+)/i)
  if (m) {
    save('cove:pendingInvite', m[1].toLowerCase())
    history.replaceState(null, '', window.location.pathname + window.location.search)
  }
  return load('cove:pendingInvite')
}

export default function App() {
  return isConfigured ? <Main /> : <SetupNeeded />
}

function Main() {
  const [session, setSession] = useState(undefined)
  const [pendingInvite, setPendingInvite] = useState(readInviteFromHash)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session))
    const { data } = supabase.auth.onAuthStateChange((_event, s) => setSession(s))
    return () => data.subscription.unsubscribe()
  }, [])

  useEffect(() => {
    const onHash = () => setPendingInvite(readInviteFromHash())
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])

  if (session === undefined) {
    return (
      <div className="splash">
        <Logo size={56} />
      </div>
    )
  }
  if (!session) return <Auth hasInvite={Boolean(pendingInvite)} />
  return (
    <Shell
      key={session.user.id}
      user={session.user}
      pendingInvite={pendingInvite}
      clearInvite={() => {
        save('cove:pendingInvite', null)
        setPendingInvite(null)
      }}
    />
  )
}

function SetupNeeded() {
  return (
    <div className="auth-page">
      <div className="auth-card">
        <div className="auth-brand">
          <Logo size={44} />
          <h1>Cove</h1>
        </div>
        <h2>Almost there</h2>
        <p className="muted">
          Cove isn't connected to its database yet. Add your Supabase project URL and anon key in{' '}
          <code>src/config.js</code> (or as <code>VITE_SUPABASE_URL</code> /{' '}
          <code>VITE_SUPABASE_ANON_KEY</code>), then rebuild.
        </p>
        <p className="muted">
          See <code>README.md</code> for the full setup steps.
        </p>
      </div>
    </div>
  )
}
