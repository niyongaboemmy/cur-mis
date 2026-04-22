import { api } from '@/services/api'
import type { SystemBasics } from '@/types/academic'

export const systemService = {
  getBasics: (signal?: AbortSignal) =>
    api.get<SystemBasics>('/api/system/basics', {}, signal),
}
