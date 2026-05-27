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
   *   • N>1 + scope-locked     → if current pick isn't in the set, snap to the first
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

        // Multi-assigned + scope-locked → keep current pick only if it's
        // still in their allowed set, otherwise snap to the first.
        if (scopeLocked && assigned.length > 1) {
          set({
            selectedCampusId: currentInSet ? current : assigned[0],
            isLocked:         false,
          })
          return
        }

        // Multi-assigned + free → default to the user's first assignment
        // when nothing was picked yet (or the saved pick is no longer in
        // their set). Admins can still flip to "All campuses" or to any
        // other catalog entry afterwards, but the page lands scoped to a
        // campus they actually belong to instead of leaking "All".
        if (assigned.length > 1 && !currentInSet) {
          set({ selectedCampusId: assigned[0], isLocked: false })
          return
        }

        // No assignments (admin or unaffiliated) — leave the pick alone
        // (null = "all campuses") and ensure the switcher is unlocked.
        set({ isLocked: false })
      },
    }),
    {
      name: 'cur-mis:campus-filter',
      partialize: (state) => ({ selectedCampusId: state.selectedCampusId }),
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
