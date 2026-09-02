import { useEffect, useState } from 'react'
import { createUser, deleteUser, getUsers, updateUser } from '../lib/api'
import { confirm } from '../lib/confirmStore'
import { notify } from '../lib/toastStore'

const EMPTY_FORM = { username: '', password: '', role: 'viewer' }

function formatTimestamp(value) {
  return value ? new Date(value).toLocaleString() : 'never'
}

function UsersPanel({ currentUserId }) {
  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [form, setForm] = useState(EMPTY_FORM)
  const [creating, setCreating] = useState(false)

  async function load() {
    setLoading(true)
    setError(null)

    try {
      const data = await getUsers()
      setUsers(data.users)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  async function handleCreate(event) {
    event.preventDefault()

    if (!form.username.trim() || form.password.length < 8 || creating) {
      return
    }

    setCreating(true)
    setError(null)

    try {
      const created = await createUser({ username: form.username.trim(), password: form.password, role: form.role })
      setForm(EMPTY_FORM)
      await load()
      notify(`User "${created.username}" created`)
    } catch (err) {
      setError(err.message)
    } finally {
      setCreating(false)
    }
  }

  async function handleToggleActive(user) {
    setError(null)

    try {
      await updateUser(user.id, { is_active: !user.is_active })
      await load()
      notify(`${user.username} ${user.is_active ? 'deactivated' : 'reactivated'}`)
    } catch (err) {
      setError(err.message)
    }
  }

  async function handleToggleRole(user) {
    setError(null)

    try {
      const nextRole = user.role === 'admin' ? 'viewer' : 'admin'
      await updateUser(user.id, { role: nextRole })
      await load()
      notify(`${user.username} is now ${nextRole}`)
    } catch (err) {
      setError(err.message)
    }
  }

  async function handleDelete(user) {
    const confirmed = await confirm({
      title: `Delete ${user.username}?`,
      message: 'They will lose access immediately. This cannot be undone.',
      confirmLabel: 'Delete',
    })

    if (!confirmed) return

    setError(null)

    try {
      await deleteUser(user.id)
      await load()
      notify(`User "${user.username}" deleted`)
    } catch (err) {
      setError(err.message)
    }
  }

  return (
    <div className="users-panel">
      <div className="users-panel-header">
        <div>
          <h3>User accounts</h3>
          <p>Admins can create accounts, change roles, and deactivate or remove access.</p>
        </div>
      </div>

      {error && <div className="error">{error}</div>}

      <form className="users-add-form" onSubmit={handleCreate}>
        <input
          type="text"
          placeholder="Username"
          value={form.username}
          onChange={(event) => setForm((prev) => ({ ...prev, username: event.target.value }))}
          autoComplete="off"
        />
        <input
          type="password"
          placeholder="Password (min 8 characters)"
          autoComplete="new-password"
          value={form.password}
          onChange={(event) => setForm((prev) => ({ ...prev, password: event.target.value }))}
        />
        <div className="toggle-group users-role-toggle">
          <button
            type="button"
            className={'toggle-option' + (form.role === 'viewer' ? ' active' : '')}
            onClick={() => setForm((prev) => ({ ...prev, role: 'viewer' }))}
          >
            Viewer
          </button>
          <button
            type="button"
            className={'toggle-option' + (form.role === 'admin' ? ' active' : '')}
            onClick={() => setForm((prev) => ({ ...prev, role: 'admin' }))}
          >
            Admin
          </button>
        </div>
        <button
          type="submit"
          className="primary-button"
          disabled={creating || !form.username.trim() || form.password.length < 8}
        >
          {creating ? 'Adding…' : 'Add user'}
        </button>
      </form>

      {!loading && (
        <div className="users-list">
          {users.map((user) => {
            const isSelf = user.id === currentUserId

            return (
              <div className="users-row" key={user.id}>
                <div className="users-row-identity">
                  <span className="users-row-username">
                    {user.username}
                    {isSelf && <span className="users-row-you">(you)</span>}
                  </span>
                  <span className="users-row-meta">
                    created by {user.created_by} · last login {formatTimestamp(user.last_login_at)}
                  </span>
                </div>

                <span className={`status-chip ${user.is_active ? 'status-good' : 'status-critical'}`}>
                  <span className="status-dot-sm" />
                  {user.is_active ? 'active' : 'deactivated'}
                </span>

                <span className="users-row-role">{user.role}</span>

                <div className="users-row-actions">
                  <button
                    type="button"
                    className="secondary-button"
                    onClick={() => handleToggleRole(user)}
                    disabled={isSelf}
                    title={isSelf ? "You can't change your own role" : undefined}
                  >
                    Make {user.role === 'admin' ? 'viewer' : 'admin'}
                  </button>
                  <button
                    type="button"
                    className="secondary-button"
                    onClick={() => handleToggleActive(user)}
                    disabled={isSelf}
                    title={isSelf ? "You can't deactivate your own account" : undefined}
                  >
                    {user.is_active ? 'Deactivate' : 'Reactivate'}
                  </button>
                  <button
                    type="button"
                    className="retry-button"
                    onClick={() => handleDelete(user)}
                    disabled={isSelf}
                    title={isSelf ? "You can't delete your own account" : undefined}
                  >
                    Delete
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

export default UsersPanel
