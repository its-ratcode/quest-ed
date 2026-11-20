import { api, unwrap } from './client'

/** Tasks parents give their kids, and the "I did it"s kids send back. */
export const tasksApi = {
  list: (params, signal) => unwrap(api.get('/tasks', { params, signal })),
  create: (payload) => unwrap(api.post('/tasks', payload)),
  update: (id, payload) => unwrap(api.patch(`/tasks/${id}`, payload)),
  archive: (id) => unwrap(api.delete(`/tasks/${id}`)),

  /**
   * A kid says "I did it", with an optional note and photo (a File) for their parent.
   * With a photo it's sent as form data; the browser fills in the exact Content-Type.
   */
  submit: (id, note, photo) => {
    if (!photo) return unwrap(api.post(`/tasks/${id}/submit`, { note }))
    const form = new FormData()
    form.append('note', note || '')
    form.append('photo', photo)
    return unwrap(api.post(`/tasks/${id}/submit`, form, {
      headers: { 'Content-Type': 'multipart/form-data' },
      timeout: 60000, // a photo on a slow phone connection takes a while
    }))
  },
  /** Where a submission's photo is shown from (only the family can open it). */
  photoUrl: (submissionId) => `${api.defaults.baseURL}/tasks/submissions/${submissionId}/photo`,
  /** "I did it"s: by default the ones waiting for a parent, oldest first. */
  submissions: (params, signal) => unwrap(api.get('/tasks/submissions', { params, signal })),
  approve: (submissionId, note) => unwrap(api.post(`/tasks/submissions/${submissionId}/approve`, { note })),
  reject: (submissionId, note) => unwrap(api.post(`/tasks/submissions/${submissionId}/reject`, { note })),
}
