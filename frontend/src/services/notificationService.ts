import { api } from './api'

export interface AppNotification {
  id:         number
  /** Server-defined category, e.g. 'FEE_OVERDUE'. Null on legacy rows. */
  type:       string | null
  message:    string
  /** In-app route to open when the notification is clicked. Null when there's nowhere to go. */
  link:       string | null
  is_read:    boolean
  created_at: string
}

export interface NotificationFeed {
  /** Unread count across ALL notifications, not just the ones in `recent`. */
  total:  number
  recent: AppNotification[]
}

export const notificationService = {
  getFeed: (limit = 10, signal?: AbortSignal) =>
    api.get<NotificationFeed>('/api/notifications', { limit }, signal),

  markRead: (id: number) =>
    api.post<{ id: number }>(`/api/notifications/${id}/read`),

  markAllRead: () =>
    api.post<{ updated: number }>('/api/notifications/read-all'),
}
