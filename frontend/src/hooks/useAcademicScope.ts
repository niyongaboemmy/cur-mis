import { useQuery } from '@tanstack/react-query'
import { api } from '@/services/api'
import { useAuthStore } from '@/store/authStore'

/**
 * Whether the signed-in user is a Dean or Head of Department whose view is
 * limited to their faculty / department. Unscoped users get `scoped: false`.
 */
export interface AcademicScope {
  scoped: boolean
  level: 'faculty' | 'department' | null
  faculty_ids: number[]
  department_ids: number[]
}

const UNSCOPED: AcademicScope = {
  scoped: false,
  level: null,
  faculty_ids: [],
  department_ids: [],
}

export function useAcademicScope() {
  const { isAuthenticated } = useAuthStore()

  const query = useQuery({
    queryKey: ['academic-scope', 'me'],
    queryFn: () => api.get<any>('/academic-scope/me'),
    enabled: isAuthenticated,
    staleTime: 1000 * 60 * 5,
  })

  const payload: any = query.data
  const scope: AcademicScope = (payload?.data ?? payload ?? UNSCOPED) as AcademicScope

  return { scope, isLoading: query.isLoading }
}
