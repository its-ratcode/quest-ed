import { api, unwrap } from './client'

/** Your family, its settings, and your kids' accounts. */
export const familyApi = {
  get: (signal) => unwrap(api.get('/family', { signal })),
  rename: (name) => unwrap(api.patch('/family', { name })),
  setTimezone: (timezone) => unwrap(api.patch('/family', { timezone })),
  /** Show the kids' leaderboard, or hide it. */
  setLeaderboard: (enabled) => unwrap(api.patch('/family', { leaderboard_enabled: enabled })),
  newInviteCode: () => unwrap(api.post('/family/invite-code')),
  createChild: (payload) => unwrap(api.post('/family/children', payload)),
  updateChild: (id, payload) => unwrap(api.patch(`/family/children/${id}`, payload)),
  removeChild: (id, password) => unwrap(api.delete(`/family/children/${id}`, { data: { password } })),
  /** Delete the whole family and every account in it, for good. Needs the parent's password. */
  deleteFamily: (password) => unwrap(api.delete('/family', { data: { password } })),

  /**
   * Download the family's data as a JSON file, saved by the browser. params: { child_id?, days? }.
   * Returns the file's name.
   */
  downloadExport: async (params) => {
    const res = await api.get('/family/export', { params, responseType: 'text', transformResponse: (d) => d })
    const name = /filename="([^"]+)"/.exec(res.headers['content-disposition'] || '')?.[1] || 'quest-ed.json'
    const url = URL.createObjectURL(new Blob([res.data], { type: 'application/json' }))
    const link = Object.assign(document.createElement('a'), { href: url, download: name })
    document.body.appendChild(link)
    link.click()
    link.remove()
    setTimeout(() => URL.revokeObjectURL(url), 1000) // after the browser has started saving it
    return name
  },
}
