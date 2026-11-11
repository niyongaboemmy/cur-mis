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
interface AssignedCampusLite {
  id: number | string
}

interface AuthUserLite {
  role?: string | null
  enforce_campus_scope?: boolean | number | null
  assigned_campuses?: AssignedCampusLite[] | null
}

interface CampusFilterState {
  selectedCampusId: number | null
  /** True when the active user has exactly one assigned campus (or is
   *  scope-locked to a single one) — in which case the topbar switcher
   *  renders as a read-only pill and the value must not be cleared. */
  isLocked: boolean
  setSelectedCampusId: (id: number | null) => void
  clear: () => void
  /** Reconcile the persisted scope with the authenticated user:
   *   • 1 assigned campus      → force-select it, lock the switcher
   *   • N>1 + scope-locked     → keep the pick if it's in the set, else null
   *                              ("All my campuses" — the server limits it to the set)
   *   • free / admin           → leave the pick alone (null = "all")
   *  Should be called whenever `auth.user` changes (login, refresh, role
   *  edit, campus assignment edit). */
  syncFromUser: (user: AuthUserLite | null | undefined) => void
}

export const useCampusFilterStore = create<CampusFilterState>()(
  persist(
    (set, get) => ({
      selectedCampusId: null,
      isLocked: false,
      setSelectedCampusId: (id) => {
        if (get().isLocked) return
        set({ selectedCampusId: id })
      },
      clear: () => {
        if (get().isLocked) return
        set({ selectedCampusId: null })
      },
      syncFromUser: (user) => {
        if (!user) {
          set({ selectedCampusId: null, isLocked: false })
          return
        }
        const assigned = (user.assigned_campuses ?? [])
          .map((c) => Number(c.id))
          .filter((n) => Number.isFinite(n) && n > 0)
        const scopeLocked = !!user.enforce_campus_scope
        const current     = get().selectedCampusId
        const currentInSet = current != null && assigned.includes(Number(current))

        // 1 assigned campus → force-select + lock (covers both scope-locked
        // single-campus staff and any user with a single posting). The
        // switcher then renders as a read-only pill so the user can SEE
        // which campus they're scoped to but can't drift off it.
        if (assigned.length === 1) {
          set({ selectedCampusId: assigned[0], isLocked: true })
          return
        }

        // Scope-locked → keep the current pick only if it's still in their
        // allowed set, otherwise show all of their campuses at once (null).
        // "All" is safe here: the server limits every campus-aware list to the
        // user's assigned campuses whenever no single campus is picked.
        if (scopeLocked) {
          set({
            selectedCampusId: currentInSet ? current : null,
            isLocked:         false,
          })
          return
        }

        // Free (several assignments, or none) — leave the pick alone; null
        // means "All campuses" and is the default. The switcher drops a saved
        // pick that no longer exists.
        set({ isLocked: false })
      },
    }),
    {
      name: 'cur-mis:campus-filter',
      partialize: (state) => ({ selectedCampusId: state.selectedCampusId }),
      // v1: multi-campus users used to be pinned to their first campus
      // automatically. Drop that saved pick once so they land on all of
      // their campuses; single-campus users are re-pinned by syncFromUser.
      version: 1,
      migrate: () => ({ selectedCampusId: null }),
    },
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
