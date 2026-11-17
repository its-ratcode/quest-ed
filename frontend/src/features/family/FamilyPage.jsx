import { useState } from 'react'
import { familyApi } from '../../api/family'
import { useAuth } from '../../auth/useAuth'
import { Avatar } from '../../components/ui/Avatar'
import PasswordConfirmModal from '../../components/ui/PasswordConfirmModal'
import { EmptyState, ErrorState, LoadingState } from '../../components/ui/States'
import { useToast } from '../../components/ui/toast/useToast'
import { useApi } from '../../hooks/useApi'
import { initialsOf } from '../../utils/names'
import ChildFormModal from './ChildFormModal'

const CLOSED = { open: false, child: null }

/** The family's people. Parents add, edit and remove kids here. */
export default function FamilyPage() {
  const { user } = useAuth()
  const toast = useToast()
  const isParent = user.role === 'parent'
  const family = useApi((signal) => familyApi.get(signal), [])
  const [childForm, setChildForm] = useState(CLOSED)
  const [removing, setRemoving] = useState(null)

  if (family.loading && !family.data) return <LoadingState rows={3} label="Loading family" />
  if (family.error) return <ErrorState error={family.error} onRetry={family.reload} />

  const { family: info, members } = family.data
  const kids = members.filter((m) => m.role === 'child')
  const parents = members.filter((m) => m.role === 'parent')
  const openAdd = () => setChildForm({ open: true, child: null })

  return (
    <>
      <div className="page-header">
        <div>
          <h1>{info.name}</h1>
          <p>{isParent ? "Your kids' accounts, and who else is in the family." : 'The people in your family.'}</p>
        </div>
        {isParent && <button type="button" className="btn primary" onClick={openAdd}>Add a child</button>}
      </div>

      <div className="widget-grid">
        <section className="card pad widget span-8" aria-labelledby="kids-title">
          <div className="section-top">
            <div>
              <h2 id="kids-title" className="section-title">Kids</h2>
              <p className="section-sub">
                {kids.length ? `${kids.length} ${kids.length === 1 ? 'kid' : 'kids'}` : 'Nobody yet'}
              </p>
            </div>
          </div>
          {kids.length === 0 ? (
            <EmptyState
              title="No kids added yet"
              message={isParent ? "Each child gets their own username and password. They don't need an email address." : ''}
              action={isParent && <button type="button" className="btn secondary small" onClick={openAdd}>Add a child</button>}
            />
          ) : (
            <ul className="list-plain widget-body limit">
              {kids.map((kid) => (
                <li key={kid.id} className="list-row">
                  <Avatar emoji={kid.avatar} />
                  <div className="flex-grow-1" style={{ minWidth: 0 }}>
                    <div className="fw-600">{kid.display_name}{kid.id === user.id ? ' (you)' : ''}</div>
                    {isParent && <div className="small-text text-2 one-line">@{kid.username}</div>}
                  </div>
                  {isParent && (
                    <button type="button" className="btn secondary small" onClick={() => setChildForm({ open: true, child: kid })}
                      aria-label={`Edit ${kid.display_name}`}>
                      Edit
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="card pad widget span-4" aria-labelledby="parents-title">
          <div className="section-top">
            <div>
              <h2 id="parents-title" className="section-title">Parents</h2>
              <p className="section-sub">Who looks after the family</p>
            </div>
          </div>
          <ul className="list-plain widget-body">
            {parents.map((p) => (
              <li key={p.id} className="list-row">
                <Avatar size="sm" tone="sam" initials={initialsOf(p.display_name)} />
                <span className="fw-600">{p.display_name}{p.id === user.id ? ' (you)' : ''}</span>
              </li>
            ))}
          </ul>
        </section>
      </div>

      <ChildFormModal
        open={childForm.open}
        child={childForm.child}
        onClose={() => setChildForm(CLOSED)}
        onSaved={(saved, edited, newPassword) => {
          toast.success(edited
            ? `${saved.display_name} is updated${newPassword ? ', with the new password' : ''}.`
            : `${saved.display_name} can now sign in as “${saved.username}”.`)
          family.reload()
        }}
        onRemove={() => {
          setRemoving(childForm.child)
          setChildForm(CLOSED)
        }}
      />

      <PasswordConfirmModal
        open={Boolean(removing)}
        title={`Remove ${removing?.display_name}?`}
        confirmLabel="Remove for good"
        onClose={() => setRemoving(null)}
        onConfirm={async (password) => {
          await familyApi.removeChild(removing.id, password)
          toast.success(`${removing.display_name} was removed.`)
          setRemoving(null)
          family.reload()
        }}
      >
        This deletes {removing?.display_name}'s account and everything about them. It can't be undone.
      </PasswordConfirmModal>
    </>
  )
}
