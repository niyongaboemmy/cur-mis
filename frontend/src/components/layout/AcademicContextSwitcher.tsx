import { useEffect, useRef } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { RotateCcw } from 'lucide-react'
import { useAuthStore } from '@/store/authStore'
import {
  useSystemStore,
  selectSelectedYearId,
  selectIsAcademicContextOverridden,
} from '@/store/systemStore'
import AcademicYearSelector from './AcademicYearSelector'
import AcademicTermSelector from './AcademicTermSelector'

/**
 * Topnav control that scopes the ENTIRE app to a chosen academic year + term.
 *
 * The two selectors write `selectedYearLabel` / `selectedTermId` into
 * `useSystemStore` (persisted to localStorage). The axios interceptor in
 * `services/api.ts` forwards them as `X-Academic-Year-Id` / `X-Academic-Term-Id`
 * on every request, and this component invalidates the whole React Query cache
 * whenever either value changes — so every page refetches against the new
 * context with no manual refresh.
 *
 * Hidden for applicants and students: they always see their real active
 * context and have nothing to switch.
 */
export default function AcademicContextSwitcher() {
  const queryClient = useQueryClient()
  const role = useAuthStore((s) => s.user?.role)

  const selectedYearId = useSystemStore(selectSelectedYearId)
  const selectedTermId = useSystemStore((s) => s.selectedTermId)
  const resetToActive  = useSystemStore((s) => s.resetToActive)
  const isOverridden   = useSystemStore(selectIsAcademicContextOverridden)

  // Refetch everything whenever the effective context (the ids actually sent
  // to the backend) changes. Skip the first run so we don't nuke the cache on
  // mount / hydration.
  const prev = useRef<string | null>(null)
  useEffect(() => {
    const key = `${selectedYearId ?? ''}|${selectedTermId ?? ''}`
    if (prev.current === null) {
      prev.current = key
      return
    }
    if (prev.current === key) return
    const wasSeedingFromEmpty = prev.current === '|'
    prev.current = key
    // The initial empty → active-year seed is not a user switch; don't
    // thrash the cache that pages are already loading for the first time.
    if (wasSeedingFromEmpty) return
    queryClient.invalidateQueries()
  }, [selectedYearId, selectedTermId, queryClient])

  if (!role || role === 'applicant' || role === 'student') return null

  return (
    <div className="hidden lg:flex items-center gap-1.5">
      <AcademicYearSelector />
      <AcademicTermSelector />
      {isOverridden && (
        <button
          type="button"
          onClick={resetToActive}
          title="Reset to the current academic year & term"
          aria-label="Reset academic context to active"
          className="h-10 inline-flex items-center gap-1.5 px-2.5 rounded-full border border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-900/30 text-[12px] font-medium text-amber-700 dark:text-amber-300 hover:bg-amber-100 dark:hover:bg-amber-900/50 transition-colors"
        >
          <RotateCcw className="w-3.5 h-3.5" />
          <span className="hidden xl:inline">Reset</span>
        </button>
      )}
    </div>
  )
}
