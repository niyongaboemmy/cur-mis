import { useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/services/api'
import { useAuthStore } from '@/store/authStore'
import type { ScopeRequest } from '@/services/academicScopeService'

/**
 * Whether the signed-in user is a Dean or Head of Department whose view is
 * limited to their faculty / department. Unscoped users get `scoped: false`.
 *
 * `needs_choice` — a Dean / HOD account that has not chosen a faculty or
 * department yet (or whose request was rejected).
 * `waiting` — a request is pending admin approval.
 */
export interface AcademicScope {
  scoped: boolean
  level: 'faculty' | 'department' | 'none' | null
  faculty_ids: number[]
  department_ids: number[]
  needs_choice: boolean
  waiting: boolean
  request: ScopeRequest | null
}

const UNSCOPED: AcademicScope = {
  scoped: false,
  level: null,
  faculty_ids: [],
  department_ids: [],
  needs_choice: false,
  waiting: false,
  request: null,
}

export function useAcademicScope() {
  const { isAuthenticated } = useAuthStore()
  const qc = useQueryClient()

  const query = useQuery({
    queryKey: ['academic-scope', 'me'],
    queryFn: () => api.get<any>('/academic-scope/me'),
    enabled: isAuthenticated,
    staleTime: 1000 * 60 * 5,
    // While waiting for approval, check every 30 s so the account opens as soon as it is approved.
    refetchInterval: (q) => {
      const d: any = q.state.data
      return (d?.data ?? d)?.waiting ? 30_000 : false
    },
  })

  const payload: any = query.data
  const scope: AcademicScope = { ...UNSCOPED, ...(payload?.data ?? payload ?? {}) }

  const refresh = () => qc.invalidateQueries({ queryKey: ['academic-scope', 'me'] })

  return { scope, isLoading: query.isLoading, refresh }
}
