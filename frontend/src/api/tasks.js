import { api, unwrap } from './client'

/** Tasks parents give their kids. */
export const tasksApi = {
  list: (params, signal) => unwrap(api.get('/tasks', { params, signal })),
  create: (payload) => unwrap(api.post('/tasks', payload)),
  update: (id, payload) => unwrap(api.patch(`/tasks/${id}`, payload)),
  archive: (id) => unwrap(api.delete(`/tasks/${id}`)),
}
