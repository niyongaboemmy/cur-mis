import { api } from '@/services/api'

/**
 * In-system notifications for the signed-in user. Always self-scoped — there is
 * no endpoint for reading anyone else's.
 */

export type NotificationSeverity = 'info' | 'success' | 'warning' | 'danger'

export interface AppNotification {
  id:          number
  type:        string | null
  title:       string | null
  message:     string
  link:        string | null
  entity_type: string | null
  entity_id:   number | null
  severity:    NotificationSeverity
  is_read:     number | boolean
  read_at:     string | null
  created_at:  string
}

export interface NotificationPage {
  data:         AppNotification[]
  total:        number
  unread_total: number
  per_page:     number
  current_page: number
  last_page:    number
}

export interface UnreadSummary {
  total:  number
  recent: AppNotification[]
}

export const notificationService = {
  list: (params: { page?: number; per_page?: number; unread?: 1 } = {}, signal?: AbortSignal) =>
    api.get<NotificationPage>('/api/notifications', params as Record<string, unknown>, signal),

  /** Cheap poll for the bell: a count plus a few rows for the dropdown. */
  unreadCount: (signal?: AbortSignal) =>
    api.get<UnreadSummary>('/api/notifications/unread-count', {}, signal),

  markRead: (id: number) =>
    api.post<void>(`/api/notifications/${id}/read`, {}),

  markAllRead: () =>
    api.post<{ marked: number }>('/api/notifications/read-all', {}),

  /**
   * Clear every notification about one record — call it when the user opens the
   * thing the notification pointed at, so the badge does not outlive its reason.
   */
  markEntityRead: (entityType: string, entityId: number) =>
    api.post<{ marked: number }>('/api/notifications/read-entity', {
      entity_type: entityType,
      entity_id:   entityId,
    }),
}
