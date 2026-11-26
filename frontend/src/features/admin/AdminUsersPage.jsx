import { useState } from 'react'
import { adminApi } from '../../api/admin'
import { useAuth } from '../../auth/useAuth'
import ConfirmDialog from '../../components/ui/ConfirmDialog'
import { Field } from '../../components/ui/Field'
import { fieldProps } from '../../components/ui/fieldProps'
import Modal from '../../components/ui/Modal'
import Pager from '../../components/ui/Pager'
import SearchBox from '../../components/ui/SearchBox'
import { EmptyState, ErrorState, LoadingState } from '../../components/ui/States'
import { useToast } from '../../components/ui/toast/useToast'
import { useApi } from '../../hooks/useApi'
import { getErrorMessage, getFieldErrors } from '../../utils/errors'
import { relativeTime } from '../../utils/format'

const ROLE_LABEL = { parent: 'Parent', child: 'Kid', admin: 'Admin' }

/** Every account on the site: find one, switch it off or back on, or set a forgetful parent a new password. */
export default function AdminUsersPage() {
  const { user: me } = useAuth()
  const toast = useToast()
  const [search, setSearch] = useState('')
  const [role, setRole] = useState('')
  const [status, setStatus] = useState('')
  const [page, setPage] = useState(1)
  const [changing, setChanging] = useState(null)
  const [resetting, setResetting] = useState(null)

  const users = useApi(
    (signal) => adminApi.users({ q: search || undefined, role: role || undefined, status: status || undefined, page }, signal),
    [search, role, status, page],
  )
  const items = users.data?.items || []
  const filter = (set) => (e) => { set(e.target.value); setPage(1) }

  return (
    <>
      <div className="page-header">
        <div>
          <h1>Users</h1>
          <p>Find accounts, switch them off or back on, or set a new password for a parent who forgot theirs.</p>
        </div>
      </div>

      <div className="filter-bar">
        <SearchBox label="Search users" placeholder="Name, email or username" value={search} delay={300}
          onChange={(text) => { setSearch(text.trim()); setPage(1) }} />
        <select className="form-select" aria-label="Role" value={role} onChange={filter(setRole)}>
          <option value="">All roles</option>
          <option value="parent">Parents</option>
          <option value="child">Kids</option>
          <option value="admin">Admins</option>
        </select>
        <select className="form-select" aria-label="Status" value={status} onChange={filter(setStatus)}>
          <option value="">Any status</option>
          <option value="active">Active</option>
          <option value="inactive">Switched off</option>
        </select>
      </div>

      {users.loading && !users.data ? (
        <LoadingState label="Loading users" />
      ) : users.error ? (
        <ErrorState error={users.error} onRetry={users.reload} />
      ) : items.length === 0 ? (
        <EmptyState title="No matching users" />
      ) : (
        <>
          <div className="card-soft table-scroll" style={{ padding: 0 }}>
            <table className="table-plain">
              <thead>
                <tr>
                  <th scope="col">Name</th>
                  <th scope="col">Sign-in</th>
                  <th scope="col">Role</th>
                  <th scope="col">Family</th>
                  <th scope="col">Last sign-in</th>
                  <th scope="col"><span className="visually-hidden">Actions</span></th>
                </tr>
              </thead>
              <tbody>
                {items.map((u) => (
                  <tr key={u.id} className={u.is_active ? undefined : 'row-off'}>
                    <td>
                      {u.display_name}{u.id === me.id ? ' (you)' : ''}
                      {!u.is_active && <span className="pill pill-muted ms-2">Switched off</span>}
                    </td>
                    <td className="text-nowrap">{u.email || u.username}</td>
                    <td>{ROLE_LABEL[u.role]}</td>
                    <td>{u.family_name || '–'}</td>
                    <td>{u.last_login_at ? relativeTime(u.last_login_at) : 'Never'}</td>
                    <td className="num">
                      <div className="d-flex gap-2 justify-content-end flex-wrap">
                        {u.role === 'parent' && (
                          <button type="button" className="btn secondary small" onClick={() => setResetting(u)}
                            aria-label={`Set a new password for ${u.display_name}`}>Set password</button>
                        )}
                        {u.id !== me.id && (
                          <button type="button" className="btn secondary small" onClick={() => setChanging(u)}
                            aria-label={`${u.is_active ? 'Switch off' : 'Switch on'} ${u.display_name}`}>
                            {u.is_active ? 'Switch off' : 'Switch on'}
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pager page={page} perPage={users.data.per_page} total={users.data.total} onChange={setPage} label="User pages" />
        </>
      )}

      {changing && (
        <ConfirmDialog
          open
          title={changing.is_active ? `Switch off ${changing.display_name}?` : `Switch ${changing.display_name} back on?`}
          message={changing.is_active
            ? "They'll be signed out and can't sign in until you switch them back on. Nothing is deleted."
            : 'They will be able to sign in again.'}
          confirmLabel={changing.is_active ? 'Switch off' : 'Switch on'}
          tone={changing.is_active ? 'danger' : 'primary'}
          onConfirm={async () => {
            await adminApi.setUserActive(changing.id, !changing.is_active)
            toast.success(changing.is_active ? 'Account switched off.' : 'Account switched on.')
            users.reload()
          }}
          onClose={() => setChanging(null)}
        />
      )}
      {resetting && (
        <SetPasswordModal user={resetting} onClose={() => setResetting(null)}
          onDone={(u) => toast.success(`New password saved for ${u.display_name}. Give it to them privately.`)} />
      )}
    </>
  )
}

/** For a parent who forgot their password: the admin sets a temporary one and passes it on. */
function SetPasswordModal({ user, onClose, onDone }) {
  const [password, setPassword] = useState('')
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)

  async function submit(event) {
    event.preventDefault()
    if (busy) return
    if (password.length < 8) {
      setError('Use at least 8 characters.')
      return
    }
    setBusy(true)
    try {
      await adminApi.setUserPassword(user.id, password)
      onDone(user)
      onClose()
    } catch (err) {
      setError(getFieldErrors(err).password || getErrorMessage(err))
      setBusy(false)
    }
  }

  return (
    <Modal open title={`New password for ${user.display_name}`} onClose={onClose} busy={busy}
      description="For a parent who forgot theirs. Give it to them in person or in a private message, and ask them to change it on their profile.">
      <form onSubmit={submit} noValidate>
        <Field id="admin-new-password" label="New password" error={error} hint="At least 8 characters.">
          <input {...fieldProps('admin-new-password', error, 'hint')} type="text" autoComplete="off"
            value={password} onChange={(e) => setPassword(e.target.value)} data-autofocus />
        </Field>
        <div className="modal-actions">
          <button type="button" className="btn secondary" onClick={onClose} disabled={busy}>Cancel</button>
          <button type="submit" className="btn primary" disabled={busy}>{busy ? 'Saving…' : 'Save password'}</button>
        </div>
      </form>
    </Modal>
  )
}
