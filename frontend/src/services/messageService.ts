import { api } from './api'
import type {
  Conversation,
  Message,
  MessageAttachment,
  UnreadCountResponse,
  RecipientOption,
  Participant,
  CreateConversationPayload,
  SendMessagePayload,
} from '@/types/messaging'
import type { PaginatedResponse } from '@/types'

export const messageService = {
  getConversations: (page = 1) =>
    api.get<PaginatedResponse<Conversation>>('/api/messages/conversations', { page } as Record<string, unknown>),

  getMessages: (id: number, page = 1) =>
    api.get<PaginatedResponse<Message>>(`/api/messages/conversations/${id}/messages`, { page } as Record<string, unknown>),

  createConversation: (payload: CreateConversationPayload) =>
    api.post<{ conversation: Conversation; existing: boolean }>('/api/messages/conversations', payload),

  sendMessage: (id: number, payload: SendMessagePayload) =>
    api.post<Message>(`/api/messages/conversations/${id}/messages`, payload),

  getUnreadCount: () =>
    api.get<UnreadCountResponse>('/api/messages/unread-count'),

  searchRecipients: (q: string) =>
    api.get<{
      users:       { id: number; full_name: string; email: string; role: string }[]
      role_groups: { id: string; label: string }[]
    }>('/api/messages/recipients/search', { q } as Record<string, unknown>)
    .then(r => {
      const users: RecipientOption[]  = (r.data?.users       ?? []).map(u => ({ id: u.id,    label: u.full_name, type: 'user' as const }))
      const roles: RecipientOption[]  = (r.data?.role_groups ?? []).map(g => ({ id: g.id,    label: g.label,     type: 'role' as const }))
      return { ...r, data: [...users, ...roles] satisfies RecipientOption[] }
    }),

  markRead: (messageId: number) =>
    api.put<void>(`/api/messages/messages/${messageId}/read`),

  deleteConversation: (id: number) =>
    api.delete<void>(`/api/messages/conversations/${id}`),

  getParticipants: (conversationId: number) =>
    api.get<Participant[]>(`/api/messages/conversations/${conversationId}/participants`),

  uploadAttachment: (messageId: number, file: File) => {
    const form = new FormData()
    form.append('file', file)
    form.append('message_id', String(messageId))
    return api.upload<MessageAttachment>('/api/messages/attachments', form)
  },
}
