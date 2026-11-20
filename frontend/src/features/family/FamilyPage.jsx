import { useState } from 'react'
import { Link } from 'react-router'
import { familyApi } from '../../api/family'
import { useAuth } from '../../auth/useAuth'
import { Avatar } from '../../components/ui/Avatar'
import Icon from '../../components/ui/Icon'
import { PointsPill } from '../../components/ui/Pills'
import { EmptyState, ErrorState, LoadingState } from '../../components/ui/States'
import { useToast } from '../../components/ui/toast/useToast'
import { useApi } from '../../hooks/useApi'
import { getErrorMessage } from '../../utils/errors'
import { initialsOf } from '../../utils/names'
import ChildFormModal from './ChildFormModal'
import { FamilyName } from './FamilyName'
import { InviteBox } from './InviteBox'
import { TimezoneCard } from './TimezoneCard'

/** The family's people. Parents add kids here, and open a kid to edit them or see their points. */
export default function FamilyPage() {
  const { user, refreshUser } = useAuth()
  const toast = useToast()
  const isParent = user.role === 'parent'
  const family = useApi((signal) => familyApi.get(signal), [])
  const [adding, setAdding] = useState(false)

  if (family.loading && !family.data) return <LoadingState rows={3} label="Loading family" />
  if (family.error) return <ErrorState error={family.error} onRetry={family.reload} />

  const { family: info, members } = family.data
  const kids = members.filter((m) => m.role === 'child')
  const parents = members.filter((m) => m.role === 'parent')
  const openAdd = () => setAdding(true)

  /** Saves a family setting; shows the outcome, and throws on failure so a form can stay open. */
  async function saveSetting(save, success) {
    try {
      await save()
      toast.success(success)
      family.reload()
      refreshUser().catch(() => {}) // other pages show the family name too
    } catch (err) {
      toast.error(getErrorMessage(err))
      throw err
    }
  }

  return (
    <>
      <div className="page-header">
        <div>
          <FamilyName name={info.name} editable={isParent}
            onSave={(name) => saveSetting(() => familyApi.rename(name), 'Family name updated.')} />
          <p>{isParent ? "Your kids' accounts, and how another parent can join." : 'The people in your family.'}</p>
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
                <li key={kid.id}>
                  {isParent ? (
                    // Everything about one kid (editing, points…) is on their own page.
                    <Link to={`/dashboard/family/kids/${kid.id}`} className="list-row kid-link"
                      aria-label={`Open ${kid.display_name}'s page`}>
                      <Avatar emoji={kid.avatar} />
                      <div className="flex-grow-1" style={{ minWidth: 0 }}>
                        <div className="fw-600">{kid.display_name}</div>
                        <div className="small-text text-2 one-line">@{kid.username}</div>
                      </div>
                      <PointsPill value={kid.points_balance} />
                      <span className="text-3" aria-hidden="true"><Icon name="chevronRight" size={16} /></span>
                    </Link>
                  ) : (
                    <div className="list-row">
                      <Avatar emoji={kid.avatar} />
                      <div className="flex-grow-1 fw-600">{kid.display_name}{kid.id === user.id ? ' (you)' : ''}</div>
                      {'points_balance' in kid && <PointsPill value={kid.points_balance} />}
                    </div>
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
              <p className="section-sub">{isParent ? 'Invite another parent with the code below' : 'Who looks after the family'}</p>
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
          {isParent && (
            <div className="widget-foot">
              <InviteBox code={info.invite_code}
                onNewCode={() => saveSetting(() => familyApi.newInviteCode(), 'New invite code ready. The old one no longer works.')} />
            </div>
          )}
        </section>
      </div>

      {/* Family settings. More panels join this row in later steps. */}
      {isParent && (
        <div className="widget-grid thirds">
          <TimezoneCard timezone={info.timezone}
            onChange={(tz) => saveSetting(() => familyApi.setTimezone(tz), `Time zone set to ${tz}.`).catch(() => {})} />
        </div>
      )}

      <ChildFormModal
        open={adding}
        onClose={() => setAdding(false)}
        onSaved={(saved) => {
          toast.success(`${saved.display_name} can now sign in as “${saved.username}”.`)
          family.reload()
        }}
      />
    </>
  )
}
