import { api, unwrap } from './client'

/** Tasks parents give their kids, and the "I did it"s kids send back. */
export const tasksApi = {
  list: (params, signal) => unwrap(api.get('/tasks', { params, signal })),
  create: (payload) => unwrap(api.post('/tasks', payload)),
  update: (id, payload) => unwrap(api.patch(`/tasks/${id}`, payload)),
  archive: (id) => unwrap(api.delete(`/tasks/${id}`)),

  /** A kid says "I did it", with an optional note for their parent. */
  submit: (id, note) => unwrap(api.post(`/tasks/${id}/submit`, { note })),
  /** "I did it"s: by default the ones waiting for a parent, oldest first. */
  submissions: (params, signal) => unwrap(api.get('/tasks/submissions', { params, signal })),
  approve: (submissionId, note) => unwrap(api.post(`/tasks/submissions/${submissionId}/approve`, { note })),
  reject: (submissionId, note) => unwrap(api.post(`/tasks/submissions/${submissionId}/reject`, { note })),
}
