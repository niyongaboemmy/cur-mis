import { useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useAuthStore } from '@/store/authStore'
import { useSystemStore } from '@/store/systemStore'
import { systemService } from '@/services/systemService'

/**
 * Loads /api/system/basics once per authenticated session, mirrors the
 * response into the zustand `systemStore`, and returns a standard react-query
 * result so callers can gate on `isLoading` / `isError`.
 */
export function useSystemBasics() {
  const { isAuthenticated, user } = useAuthStore()
  const setBasics  = useSystemStore((s) => s.setBasics)
  const setLoading = useSystemStore((s) => s.setLoading)
  const setError   = useSystemStore((s) => s.setError)

  // Skip the call entirely for roles that don't have VIEW_SYSTEM_BASICS
  // (e.g. applicants). The backend gates the endpoint with that permission
  // and a 403 would otherwise spam the console + ErrorBoundary on every
  // applicant page load.
  const canView = !!user?.permissions?.includes('VIEW_SYSTEM_BASICS')

  const query = useQuery({
    queryKey: ['system', 'basics'],
    queryFn:  () => systemService.getBasics(),
    enabled:  isAuthenticated && canView,
    staleTime: 1000 * 60 * 10, // 10 min — rarely changes during a session
  })

  useEffect(() => {
    setLoading(query.isLoading)
  }, [query.isLoading, setLoading])

  useEffect(() => {
    if (query.data?.success && query.data.data) {
      setBasics(query.data.data)
    }
  }, [query.data, setBasics])

  useEffect(() => {
    if (query.isError) {
      setError((query.error as Error)?.message ?? 'Failed to load system basics.')
    }
  }, [query.isError, query.error, setError])

  return query
}
