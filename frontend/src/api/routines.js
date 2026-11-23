import { api, unwrap } from './client'

/** Routines: tasks that come back on chosen weekdays. Parents only. */
export const routinesApi = {
  /** { items }: active and paused ones. Pass { status: 'archived' } for deleted ones. */
  list: (params, signal) => unwrap(api.get('/routines', { params, signal })),
  /** One kid ("assigned_to_id") or several ("assigned_to_ids"): { routine, routines }. */
  create: (payload) => unwrap(api.post('/routines', payload)),
  /** Change it, or pause ({ status: 'paused' }) and resume ({ status: 'active' }) it. */
  update: (id, payload) => unwrap(api.patch(`/routines/${id}`, payload)),
  /** Delete it. Past tasks and their points are kept. */
  remove: (id) => unwrap(api.delete(`/routines/${id}`)),
}
