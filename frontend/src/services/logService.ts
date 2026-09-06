import { api } from '@/services/api'
import type { PaginatedResponse, SystemLog, SystemLogFilters, SystemLogStats } from '@/types'

const AUTH_KEY = import.meta.env.VITE_AUTH_STORAGE_KEY ?? 'cur-mis-auth'

function getToken(): string {
  try {
    const raw = localStorage.getItem(AUTH_KEY) ?? '{}'
    return (JSON.parse(raw)?.state?.token as string) ?? ''
  } catch {
    return ''
  }
}

export const logService = {
  getLogs: (params: SystemLogFilters, signal?: AbortSignal) =>
    api.get<PaginatedResponse<SystemLog>>(
      '/logs',
      params as Record<string, unknown>,
      signal
    ),

  getStats: (signal?: AbortSignal) =>
    api.get<SystemLogStats>('/logs/stats', undefined, signal),

  getModules: (signal?: AbortSignal) =>
    api.get<string[]>('/logs/modules', undefined, signal),

  exportUrl: (filters: SystemLogFilters): string => {
    const base   = (import.meta.env.VITE_API_URL ?? '') + '/logs/export'
    const params = new URLSearchParams()
    const token  = getToken()

    Object.entries(filters).forEach(([k, v]) => {
      if (v !== undefined && v !== '') params.set(k, String(v))
    })
    if (token) params.set('token', token)

    return `${base}?${params.toString()}`
  },
}
