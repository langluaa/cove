import { useState } from 'react'
import { supabase } from '../supabase'
import Logo from './Logo'

export default function Auth({ hasInvite }) {
  const [mode, setMode] = useState('login') // 'login' | 'signup'
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [username, setUsername] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  async function submit(e) {
    e.preventDefault()
    setError('')
    setNotice('')
    if (mode === 'signup' && !/^[a-zA-Z0-9_.]{2,32}$/.test(username)) {
      setError('Usernames are 2–32 characters: letters, numbers, _ and . only.')
      return
    }
    setBusy(true)
    try {
      if (mode === 'login') {
        const { error } = await supabase.auth.signInWithPassword({ email, password })
        if (error) throw error
      } else {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: { username },
            emailRedirectTo: window.location.origin + window.location.pathname,
          },
        })
        if (error) throw error
        if (!data.session) {
          setNotice('Check your email for a confirmation link, then come back and log in.')
          setMode('login')
        }
      }
    } catch (err) {
      setError(err.message || 'Something went wrong.')
    } finally {
      setBusy(false)
    }
  }

  const isLogin = mode === 'login'

  return (
    <div className="auth-page">
      <form className="auth-card" onSubmit={submit}>
        <div className="auth-brand">
          <Logo size={44} />
          <h1>Cove</h1>
        </div>
        <h2>{isLogin ? 'Welcome back' : 'Create your account'}</h2>
        <p className="muted">
          {hasInvite
            ? "You've been invited to a server — log in or sign up to join."
            : isLogin
              ? 'Good to see you again.'
              : 'A place for your people.'}
        </p>

        <label>
          Email
          <input type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </label>
        {!isLogin && (
          <label>
            Username
            <input
              autoComplete="username"
              required
              maxLength={32}
              value={username}
              onChange={(e) => setUsername(e.target.value)}
            />
          </label>
        )}
        <label>
          Password
          <input
            type="password"
            autoComplete={isLogin ? 'current-password' : 'new-password'}
            required
            minLength={6}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </label>

        {error && <div className="form-error">{error}</div>}
        {notice && <div className="form-notice">{notice}</div>}

        <button className="btn primary block" disabled={busy}>
          {busy ? 'One sec…' : isLogin ? 'Log in' : 'Sign up'}
        </button>

        <p className="muted small">
          {isLogin ? 'New here? ' : 'Already have an account? '}
          <button
            type="button"
            className="link"
            onClick={() => {
              setMode(isLogin ? 'signup' : 'login')
              setError('')
            }}
          >
            {isLogin ? 'Create an account' : 'Log in'}
          </button>
        </p>
      </form>
    </div>
  )
}
