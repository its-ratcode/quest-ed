import { useAuth } from '../../auth/useAuth'
import ManageBadges from './ManageBadges'
import MyBadges from './MyBadges'

/** Badges: kids see their own collection; parents manage the family's badges. */
export default function BadgesPage() {
  const { user } = useAuth()
  return user.role === 'parent' ? <ManageBadges /> : <MyBadges />
}
