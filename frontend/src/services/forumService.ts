import { api } from '@/services/api'

export type ForumAudience = 'all' | 'students' | 'staff' | 'faculty' | 'admin'

export interface ForumCategory {
  id:            number
  name:          string
  slug:          string
  description:   string | null
  audience:      ForumAudience
  is_active:     number | boolean
  sort_order:    number
  thread_count?: number
  post_count?:   number
  last_activity?: string | null
}

export interface ForumThread {
  id:            number
  category_id:   number
  title:         string
  created_by:    number | null
  author_name:   string | null
  is_pinned:     number | boolean
  is_locked:     number | boolean
  is_deleted:    number | boolean
  views:         number
  reply_count?:  number
  last_post_at:  string | null
  created_at:    string
  category_name?: string
  category_audience?: ForumAudience
}

export interface ForumPost {
  id:           number
  thread_id:    number
  body:         string
  created_by:   number | null
  author_name:  string | null
  author_photo: string | null
  author_role:  string | null
  is_deleted:   number | boolean
  created_at:   string
  updated_at:   string
}

export interface CategoryInput {
  name:         string
  description?: string | null
  audience:     ForumAudience
  is_active?:   boolean
  sort_order?:  number
}

export const FORUM_AUDIENCE_LABELS: Record<ForumAudience, string> = {
  all: 'Everyone', students: 'Students', staff: 'Staff', faculty: 'Faculty', admin: 'Administration',
}

export const forumService = {
  categories: () => api.get<ForumCategory[]>('/api/forums/categories'),
  createCategory: (payload: CategoryInput) => api.post<ForumCategory>('/api/forums/categories', payload),
  updateCategory: (id: number, payload: Partial<CategoryInput>) => api.put<ForumCategory>(`/api/forums/categories/${id}`, payload),
  deleteCategory: (id: number) => api.delete<void>(`/api/forums/categories/${id}`),

  threads: (categoryId: number) =>
    api.get<{ category: ForumCategory; threads: ForumThread[] }>(`/api/forums/categories/${categoryId}/threads`),
  createThread: (categoryId: number, title: string, body: string) =>
    api.post<ForumThread>(`/api/forums/categories/${categoryId}/threads`, { title, body }),

  thread: (id: number) =>
    api.get<{ thread: ForumThread; posts: ForumPost[]; can_moderate: boolean }>(`/api/forums/threads/${id}`),
  updateThread: (id: number, payload: { is_pinned?: boolean; is_locked?: boolean }) =>
    api.put<ForumThread>(`/api/forums/threads/${id}`, payload),
  deleteThread: (id: number) => api.delete<void>(`/api/forums/threads/${id}`),

  reply: (threadId: number, body: string) =>
    api.post<ForumPost>(`/api/forums/threads/${threadId}/posts`, { body }),
  deletePost: (id: number) => api.delete<void>(`/api/forums/posts/${id}`),
}
