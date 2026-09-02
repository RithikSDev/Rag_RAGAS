import { useState } from 'react'
import { login, setToken } from '../lib/api'

function LoginView({ onLoggedIn }) {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(event) {
    event.preventDefault()

    if (!username.trim() || !password || loading) {
      return
    }

    setLoading(true)
    setError(null)

    try {
      const response = await login(username.trim(), password)
      setToken(response.access_token)
      onLoggedIn(response.user)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="login-screen">
      <form className="login-card" onSubmit={handleSubmit}>
        <div className="login-brand">
          <span className="nav-brand-mark">⌁</span>
          <div>
            <div className="nav-brand-title">RAGAS LAB</div>
            <div className="nav-brand-subtitle">evaluation &amp; optimization</div>
          </div>
        </div>

        <h1>Sign in</h1>

        {error && <div className="error">{error}</div>}

        <label className="login-field">
          <span>Username</span>
          <input
            type="text"
            value={username}
            onChange={(event) => setUsername(event.target.value)}
            autoFocus
            autoComplete="username"
          />
        </label>

        <label className="login-field">
          <span>Password</span>
          <input
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            autoComplete="current-password"
          />
        </label>

        <button
          type="submit"
          className="primary-button login-submit"
          disabled={loading || !username.trim() || !password}
        >
          {loading ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
    </div>
  )
}

export default LoginView
