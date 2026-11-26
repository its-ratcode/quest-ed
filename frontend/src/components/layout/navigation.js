// The menu for each role. A page gets its entry here in the step that builds it.
// Menus only hide what a role can't use; the API enforces the same rules.
const ALL_ITEMS = {
  parent: [
    // badge: a count of what's waiting for the parent ("I did it"s, rewards to hand over).
    { to: '/dashboard', label: 'Overview', icon: 'home', end: true, badge: 'approvals' },
    { to: '/dashboard/tasks', label: 'Tasks & routines', short: 'Tasks', icon: 'tasks' },
    { to: '/dashboard/rewards', label: 'Rewards', icon: 'gift', badge: 'handovers' },
    { to: '/dashboard/badges', label: 'Badges', icon: 'medal' },
    { to: '/dashboard/family', label: 'Family & kids', short: 'Family', icon: 'family' },
  ],
  child: [
    { to: '/dashboard', label: 'Today', icon: 'home', end: true },
    { to: '/dashboard/tasks', label: 'My tasks', short: 'Tasks', icon: 'tasks' },
    { to: '/dashboard/rewards', label: 'Reward shop', short: 'Shop', icon: 'gift' },
    { to: '/dashboard/badges', label: 'Badges', icon: 'star' },
    { to: '/dashboard/focus', label: 'Focus timer', short: 'Focus', icon: 'clock', feature: 'focus_mode' },
    { to: '/dashboard/points', label: 'My points', short: 'Points', icon: 'coins' },
  ],
  admin: [
    { to: '/dashboard', label: 'Overview', icon: 'home', end: true },
    { to: '/dashboard/admin/users', label: 'Users', icon: 'users' },
    { to: '/dashboard/admin/settings', label: 'Site settings', short: 'Settings', icon: 'settings' },
    { to: '/dashboard/admin/notices', label: 'Notices', icon: 'bell' },
    { to: '/dashboard/admin/audit', label: 'Audit log', short: 'Audit', icon: 'log' },
  ],
}

export const NAV_HEADING = { parent: 'Parent workspace', child: 'My space', admin: 'Administration' }

export const ROLE_LABEL = { parent: 'Family parent', child: 'Kid account', admin: 'Administrator' }

/** The menu for this user, leaving out pages the administrator switched off. */
export function navItemsFor(user, features = {}) {
  return (ALL_ITEMS[user.role] || []).filter((item) => !item.feature || features[item.feature] !== false)
}

// Phones: a bottom bar with up to four pages, then "More" for everything else.
const MOBILE_PRIMARY = {
  parent: ['/dashboard', '/dashboard/tasks', '/dashboard/rewards', '/dashboard/family'],
  child: ['/dashboard', '/dashboard/tasks', '/dashboard/rewards', '/dashboard/badges'],
  admin: ['/dashboard', '/dashboard/admin/users', '/dashboard/admin/settings', '/dashboard/admin/audit'],
}

export function mobileItemsFor(role, items) {
  const primary = items.filter((item) => MOBILE_PRIMARY[role]?.includes(item.to))
  return [...primary, { to: '/dashboard/more', label: 'More', icon: 'more' }]
}
