import { useAuth } from '../auth/useAuth'

/** Temporary overview, inside the app layout. Replaced by the real dashboards later. */
export default function DashboardPage() {
  const { user, family } = useAuth()

  return (
    <>
      <div className="page-header">
        <div>
          <h1>Hi {user.display_name}</h1>
          <p>You're signed in{family ? ` to ${family.name}` : ''}.</p>
        </div>
      </div>
      <div className="card-soft">
        <p className="text-2">Your dashboard comes in a later step.</p>
      </div>
    </>
  )
}
