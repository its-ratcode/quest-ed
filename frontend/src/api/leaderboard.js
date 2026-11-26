import { api, unwrap } from './client'

/** The family leaderboard: points from approved tasks this week or this month. */
export const leaderboardApi = {
  /** period: 'week' (from Monday) or 'month' (from the 1st) */
  get: (period, signal) => unwrap(api.get('/leaderboard', { params: { period }, signal })),
}
