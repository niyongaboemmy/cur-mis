import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'

export interface AdminYearData {
  success: boolean
  selected_academic_year_id: number | null
  selected_academic_year: {
    id: number
    name: string
    start_date?: string
    end_date?: string
    is_current?: number
  } | null
  current_academic_year_id: number | null
  current_academic_year: {
    id: number
    name: string
  } | null
  is_admin: boolean
  is_viewing_current: boolean
}

/**
 * Hook for admin-only academic year selection
 * Allows admins to view any historical year without affecting other users
 * Stored in session (per-browser) rather than database
 *
 * This is DIFFERENT from module-level selection:
 * - Module selection: Finance, Academic, HR each have independent years
 * - Admin selection: Single global view for admin dashboard only
 */
export function useAdminYearSelection() {
  const qc = useQueryClient()

  // Fetch admin's current year selection
  const yearQuery = useQuery<AdminYearData>({
    queryKey: ['admin-selected-year'],
    queryFn: async () => {
      const res = await fetch(`/api/admin/me/selected-year`)
      if (!res.ok) throw new Error('Failed to fetch admin year')
      return res.json()
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
    retry: 2,
  })

  // Mutation to set admin year
  const setYearMutation = useMutation({
    mutationFn: async (academicYearId: number | null) => {
      const res = await fetch(`/api/admin/me/selected-year`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ academic_year_id: academicYearId }),
      })
      if (!res.ok) throw new Error('Failed to set admin year')
      const data = await res.json()
      return data
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-selected-year'] })
      qc.invalidateQueries({ queryKey: ['admin-dashboard-stats'] })
      toast.success(`Admin view switched to selected year`)
    },
    onError: () => {
      toast.error('Failed to update admin year')
    },
  })

  // Mutation to reset to current year
  const resetYearMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/admin/me/selected-year`, {
        method: 'DELETE',
      })
      if (!res.ok) throw new Error('Failed to reset admin year')
      return res.json()
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-selected-year'] })
      qc.invalidateQueries({ queryKey: ['admin-dashboard-stats'] })
      toast.success('Reset to current year')
    },
    onError: () => {
      toast.error('Failed to reset admin year')
    },
  })

  return {
    // Data
    selectedYearId: yearQuery.data?.selected_academic_year_id,
    selectedYear: yearQuery.data?.selected_academic_year,
    currentYearId: yearQuery.data?.current_academic_year_id,
    currentYear: yearQuery.data?.current_academic_year,
    isViewingCurrent: yearQuery.data?.is_viewing_current ?? true,
    isAdmin: yearQuery.data?.is_admin ?? false,

    // State
    isLoading: yearQuery.isLoading,
    isSetting: setYearMutation.isPending,
    isResetting: resetYearMutation.isPending,
    error: yearQuery.error,

    // Actions
    setYear: (yearId: number | null) => setYearMutation.mutate(yearId),
    resetYear: () => resetYearMutation.mutate(),

    // Refetch
    refetch: yearQuery.refetch,
  }
}

/**
 * Hook to fetch all academic years for admin dropdown
 */
export function useAdminAcademicYears() {
  return useQuery({
    queryKey: ['admin-academic-years'],
    queryFn: async () => {
      const res = await fetch('/admin/academic-years')
      if (!res.ok) throw new Error('Failed to fetch academic years')
      return res.json()
    },
    staleTime: 60 * 60 * 1000, // 1 hour
    retry: 2,
  })
}

/**
 * Hook to get dashboard stats for admin's selected year
 */
export function useAdminDashboardStats() {
  const { selectedYearId } = useAdminYearSelection()

  return useQuery({
    queryKey: ['admin-dashboard-stats', selectedYearId],
    queryFn: async () => {
      const res = await fetch(`/api/admin/dashboard-stats`)
      if (!res.ok) throw new Error('Failed to fetch stats')
      return res.json()
    },
    enabled: !!selectedYearId,
    staleTime: 10 * 60 * 1000, // 10 minutes
  })
}
