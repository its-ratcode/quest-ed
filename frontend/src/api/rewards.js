import { api, unwrap } from './client'

/** The reward shop: what parents put in it, and what kids buy with their points. */
export const rewardsApi = {
  /** { items }. Kids only get the ones on show; parents get the hidden ones too. */
  list: (signal) => unwrap(api.get('/rewards', { signal })),
  create: (payload) => unwrap(api.post('/rewards', payload)),
  /** Change any of title, description, emoji, cost, stock (null: no limit) or is_active. */
  update: (id, payload) => unwrap(api.patch(`/rewards/${id}`, payload)),
  /** A kid buys it: { redemption, reward, balance }. The points go right away. */
  redeem: (id) => unwrap(api.post(`/rewards/${id}/redeem`)),

  /** What kids bought: { items, total, page, per_page }. Pass { status, child_id, page, per_page }. */
  redemptions: (params, signal) => unwrap(api.get('/rewards/redemptions', { params, signal })),
  /** A parent handed it over. */
  fulfill: (id) => unwrap(api.post(`/rewards/redemptions/${id}/fulfill`)),
  /** Not handed over after all: { redemption, balance }. The points go back. */
  cancel: (id) => unwrap(api.post(`/rewards/redemptions/${id}/cancel`)),
}
