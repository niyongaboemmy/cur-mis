import { api } from '@/services/api'

export type AnnouncementAudience = 'all' | 'students' | 'staff' | 'faculty' | 'admin'
export type AnnouncementPriority = 'normal' | 'urgent'

export interface Announcement {
  id:              number
  title:           string
  body:            string
  audience:        AnnouncementAudience
  priority:        AnnouncementPriority
  posted_by:       number | null
  posted_by_name:  string | null
  expires_at:      string | null
  is_active:       number | boolean
  is_expired?:     number | boolean
  created_at:      string
}

export interface AnnouncementInput {
  title:       string
  body:        string
  audience:    AnnouncementAudience
  priority:    AnnouncementPriority
  expires_at?: string | null
  is_active?:  boolean
}

export const AUDIENCE_LABELS: Record<AnnouncementAudience, string> = {
  all:      'Everyone',
  students: 'Students',
  staff:    'Staff',
  faculty:  'Faculty',
  admin:    'Administration',
}

export const announcementService = {
  /** Personalised feed for the current user (active, non-expired, audience-matched). */
  feed: (signal?: AbortSignal) =>
    api.get<Announcement[]>('/announcements', {}, signal),

  /** Full management list (requires MANAGE_ANNOUNCEMENTS). */
  list: (params: { audience?: string; is_active?: string | number; q?: string } = {}) =>
    api.get<Announcement[]>('/announcements/manage', params as Record<string, unknown>),

  create: (payload: AnnouncementInput) =>
    api.post<Announcement>('/announcements', payload),

  update: (id: number, payload: AnnouncementInput) =>
    api.put<Announcement>(`/api/announcements/${id}`, payload),

  remove: (id: number) =>
    api.delete<void>(`/api/announcements/${id}`),
}
