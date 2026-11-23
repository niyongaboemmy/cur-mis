import { api, apiClient } from '@/services/api'

export interface UserActivityRow {
  id: number
  full_name: string
  email: string
  role_name: string | null
  is_active: boolean
  is_online: boolean
  login_count: number
  total_seconds: number
  last_login: string | null
  last_seen: string | null
  last_page_at: string | null
  status: 'online' | 'offline' | 'never'
}

export interface UserActivityPage {
  data: UserActivityRow[]
  pagination: { page: number; per_page: number; total: number; total_pages: number }
}

export interface UserActivityStats {
  total_users: number
  ever_logged_in: number
  online_now: number
  logins_today: number
  logins_7_days: number
  hours_7_days: number
  page_views_7_days: number
}

export interface UserSessionRow {
  id: number
  login_at: string
  logout_at: string | null
  last_seen_at: string
  ip_address: string
  user_agent: string
  duration_seconds: number
  status: 'active' | 'logged_out' | 'timed_out'
}

export interface UserActivityItem {
  type: 'action' | 'page'
  at: string
  module: string
  action: string
  description?: string
  path?: string
  entity_type?: string | null
  entity_id?: number | null
}

export interface UserActivityDetail {
  user: {
    id: number
    full_name: string
    email: string
    role_name: string | null
    is_active: boolean
  }
  summary: { sessions: number; total_seconds: number; last_login: string | null }
  sessions: UserSessionRow[]
  activity: UserActivityItem[]
  top_modules: { module: string; views: number }[]
}

export interface UserActivityFilters {
  page?: number
  per_page?: number
  search?: string
  online?: boolean
}

export const userActivityService = {
  listUsers: (f: UserActivityFilters) =>
    api.get<UserActivityPage>('/user-activity/users', {
      page: f.page ?? 1,
      per_page: f.per_page ?? 25,
      search: f.search || undefined,
      online: f.online ? 1 : undefined,
    }),

  stats: () => api.get<UserActivityStats>('/user-activity/stats'),

  userDetail: (id: number) => api.get<UserActivityDetail>(`/user-activity/users/${id}`),

  // The PDF is binary, so it bypasses the JSON wrapper and comes back as a Blob.
  downloadPdf: async (id: number): Promise<Blob> => {
    const res = await apiClient.get(`/user-activity/users/${id}/pdf`, { responseType: 'blob' })
    return res.data as Blob
  },

  heartbeat: () => api.post('/activity/heartbeat'),

  pageView: (path: string) => api.post('/activity/page-view', { path }),
}
