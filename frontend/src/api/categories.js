import { api, unwrap } from './client'

/** The family's task categories. */
export const categoriesApi = {
  list: (signal) => unwrap(api.get('/categories', { signal })),
  create: (payload) => unwrap(api.post('/categories', payload)),
  update: (id, payload) => unwrap(api.patch(`/categories/${id}`, payload)),
  remove: (id) => unwrap(api.delete(`/categories/${id}`)),
  reorder: (ids) => unwrap(api.put('/categories/order', { ids })),
}
