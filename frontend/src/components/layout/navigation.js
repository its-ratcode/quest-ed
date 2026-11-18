// The menu for each role. A page gets its entry here in the step that builds it.
// Menus only hide what a role can't use; the API enforces the same rules.
const ALL_ITEMS = {
  parent: [
    { to: '/dashboard', label: 'Overview', icon: 'home', end: true },
    { to: '/dashboard/tasks', label: 'Tasks & routines', short: 'Tasks', icon: 'tasks' },
    { to: '/dashboard/family', label: 'Family & kids', short: 'Family', icon: 'family' },
  ],
  child: [
    { to: '/dashboard', label: 'Today', icon: 'home', end: true },
    { to: '/dashboard/tasks', label: 'My tasks', short: 'Tasks', icon: 'tasks' },
  ],
  admin: [
    { to: '/dashboard', label: 'Overview', icon: 'home', end: true },
  ],
}

export const NAV_HEADING = { parent: 'Parent workspace', child: 'My space', admin: 'Administration' }

export const ROLE_LABEL = { parent: 'Family parent', child: 'Kid account', admin: 'Administrator' }

/** The menu for this user. */
export function navItemsFor(user) {
  return ALL_ITEMS[user.role] || []
}

// Phones: a bottom bar with up to four pages, then "More" for everything else.
const MOBILE_PRIMARY = {
  parent: ['/dashboard', '/dashboard/tasks', '/dashboard/family'],
  child: ['/dashboard', '/dashboard/tasks'],
  admin: ['/dashboard'],
}

export function mobileItemsFor(role, items) {
  const primary = items.filter((item) => MOBILE_PRIMARY[role]?.includes(item.to))
  return [...primary, { to: '/dashboard/more', label: 'More', icon: 'more' }]
}
