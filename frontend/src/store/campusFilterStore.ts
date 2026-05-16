import { create } from 'zustand'
import { persist } from 'zustand/middleware'

/**
 * Globally-selected campus scope. When non-null, every campus-aware
 * service (admissions list, students list, statistics, etc.) merges this
 * id into the request as `campus_id` / `campus` so the whole UI shows
 * data scoped to just that campus.
 *
 * Set to null = "All my assigned campuses" (the backend's auto-scoping
 * for Task 1.1 then governs — registry users still only see their own
 * campuses; admins see everything).
 *
 * Persisted in localStorage so a refresh keeps the user's chosen scope.
 */
interface CampusFilterState {
  selectedCampusId: number | null
  setSelectedCampusId: (id: number | null) => void
  clear: () => void
}

export const useCampusFilterStore = create<CampusFilterState>()(
  persist(
    (set) => ({
      selectedCampusId: null,
      setSelectedCampusId: (id) => set({ selectedCampusId: id }),
      clear: () => set({ selectedCampusId: null }),
    }),
    { name: 'cur-mis:campus-filter' },
  ),
)

/** Helper used inside service calls to inject `campus_id` only when set. */
export function withCampusScope<T extends Record<string, any>>(params: T): T & { campus_id?: number } {
  const id = useCampusFilterStore.getState().selectedCampusId
  if (id == null) return params
  // Caller-supplied campus_id wins (e.g. when an admin drills into a
  // specific campus via a column filter).
  if ((params as any).campus_id != null && (params as any).campus_id !== '') return params
  return { ...params, campus_id: id }
}
