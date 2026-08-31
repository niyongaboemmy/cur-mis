import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'

export interface ModuleYearData {
  success: boolean
  module_name: string
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
    start_date?: string
    end_date?: string
    is_current?: number
  } | null
  is_using_current_year?: boolean
}

/**
 * Hook for managing per-module academic year selection
 * Allows each module (Finance, Academic, HR, etc) to independently track different years
 *
 * @param moduleName - Name of the module (finance, academic, hr, registry, admissions, etc)
 * @returns Object with selected year info and mutation functions
 */
export function useModuleYear(moduleName: string) {
  const qc = useQueryClient()

  // Fetch current module's year preference
  const yearQuery = useQuery<ModuleYearData>({
    queryKey: ['module-year', moduleName],
    queryFn: async () => {
      const res = await fetch(`/api/users/me/module-preferences/${moduleName}`)
      if (!res.ok) throw new Error('Failed to fetch module year')
      return res.json()
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
    retry: 2,
  })

  // Mutation to set module year
  const setYearMutation = useMutation({
    mutationFn: async (academicYearId: number | null) => {
      const res = await fetch(`/api/users/me/module-preferences/${moduleName}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ academic_year_id: academicYearId }),
      })
      if (!res.ok) throw new Error('Failed to set module year')
      return res.json()
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ['module-year', moduleName] })
      toast.success(`${moduleName} year updated to ${data.selected_academic_year?.name || 'current'}`)
    },
    onError: () => {
      toast.error('Failed to update module year')
    },
  })

  // Mutation to reset to current year
  const resetYearMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/users/me/module-preferences/${moduleName}`, {
        method: 'DELETE',
      })
      if (!res.ok) throw new Error('Failed to reset module year')
      return res.json()
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['module-year', moduleName] })
      toast.success('Reset to current year')
    },
    onError: () => {
      toast.error('Failed to reset module year')
    },
  })

  return {
    // Data
    selectedYearId: yearQuery.data?.selected_academic_year_id,
    selectedYear: yearQuery.data?.selected_academic_year,
    currentYearId: yearQuery.data?.current_academic_year_id,
    currentYear: yearQuery.data?.current_academic_year,
    isUsingCurrentYear: yearQuery.data?.is_using_current_year ?? true,

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
 * Hook to fetch all academic years for dropdown selection
 */
export function useAcademicYears() {
  return useQuery({
    queryKey: ['academic-years'],
    queryFn: async () => {
      const res = await fetch('/api/academic-years')
      if (!res.ok) throw new Error('Failed to fetch academic years')
      return res.json()
    },
    staleTime: 60 * 60 * 1000, // 1 hour (rarely changes)
    retry: 2,
  })
}
