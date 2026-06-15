import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Building2, Check, ChevronDown, Lock } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import userService from '@/services/userService'
import { useAuthStore } from '@/store/authStore'
import { useCampusFilterStore } from '@/store/campusFilterStore'

/**
 * Topbar pill that lets a registry staffer scope the entire app to a
 * single campus they're assigned to. Admins / superadmins can pick any
 * active campus. Renders nothing for applicants and for users with zero
 * campus assignments who aren't admins (one-campus implicit default).
 *
 * Auto-select rules:
 *   • exactly 1 assigned campus → it's picked + the pill is rendered as
 *     a read-only lock-icon pill (no dropdown, can't be cleared).
 *   • scope-locked + multiple    → dropdown limited to the user's set,
 *     first one auto-selected, no "All campuses" escape hatch.
 *   • free / admin               → full catalog or assignments dropdown;
 *     first assignment is the default landing pick instead of "All".
 *
 * Lock state is derived from `user.assigned_campuses` synchronously so the
 * pill renders correctly on the very first paint — no flash of "nothing"
 * waiting for an effect to fire.
 */
export default function CampusFilterSwitcher() {
  const { user } = useAuthStore()
  const { selectedCampusId, setSelectedCampusId, syncFromUser } =
    useCampusFilterStore()
  const queryClient = useQueryClient()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement | null>(null)

  // Keep the persisted scope id in sync with the authenticated user (so a
  // server-side change to their assignments propagates without needing a
  // page refresh). The store action is idempotent.
  useEffect(() => {
    syncFromUser(user as any)
  }, [user, syncFromUser])

  // Click-away to close (no-op when there's no dropdown).
  useEffect(() => {
    if (!open) return
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    window.addEventListener('mousedown', onClick)
    return () => window.removeEventListener('mousedown', onClick)
  }, [open])

  const role            = (user?.role ?? '').toLowerCase()
  const isPriviledged   = role === 'admin' || role === 'superadmin'
  const isScopeLocked   = !!user?.enforce_campus_scope
  const assignments     = (user?.assigned_campuses ?? []) as Array<{ id: number | string; name: string; code?: string | null; location?: string | null }>
  // Lock the pill whenever the user has exactly one assignment — the
  // scope is unambiguous and they have nothing to switch to. Computed
  // synchronously from the auth payload (not from the store) so the
  // first render is always correct.
  const isLockedToOne   = assignments.length === 1

  // Catalog of every active campus — admins / superadmins with MANAGE_USERS
  // can drill into any campus, not just their own assignments. Scope-locked
  // users never need the catalog (they can't reach outside their set).
  const canSeeCatalog = !!user?.permissions?.includes('MANAGE_USERS') && !isScopeLocked && !isLockedToOne
  const catalogQ = useQuery({
    queryKey: ['users', 'campuses-catalog'],
    queryFn:  () => userService.listAllCampuses(),
    enabled:  canSeeCatalog,
    staleTime: 1000 * 60 * 30,
  })

  // Pick the right source for the dropdown:
  //   locked / scope-locked → only the user's assignments
  //   catalog-capable       → full active-campus catalog (fallback to assignments while loading)
  //   everyone else         → assignments from the auth payload
  const my = (isScopeLocked || isLockedToOne)
    ? assignments
    : ((canSeeCatalog ? catalogQ.data?.data?.campuses : null) ?? assignments)

  // Self-heal a STALE persisted scope: if the saved campus id no longer
  // exists in the authoritative list (e.g. campuses were re-created with new
  // ids), the pill silently shows "All" while the store still injects the
  // dead id into every request — zeroing every list. Reset it to null ("All")
  // once we actually have the real list. Skip while a catalog-capable user's
  // catalog is still loading so we don't clobber a valid pick mid-fetch.
  useEffect(() => {
    if (isScopeLocked || isLockedToOne) return            // store sync owns these
    if (selectedCampusId == null) return                  // already "All"
    if (canSeeCatalog && !catalogQ.data) return            // catalog still loading
    const validIds = (my as Array<{ id: number | string }>).map((c) => Number(c.id))
    if (!validIds.includes(Number(selectedCampusId))) {
      setSelectedCampusId(null)
    }
  }, [selectedCampusId, my, canSeeCatalog, catalogQ.data, isScopeLocked, isLockedToOne, setSelectedCampusId])

  // Applicants don't get a campus scope at all.
  if (!user || role === 'applicant') return null

  // No campuses anywhere → nothing meaningful to render.
  if (my.length === 0) return null

  // Effective selection — prefer the persisted store pick, but fall back
  // to the user's first assignment so the FIRST render already shows a
  // sensible default. `syncFromUser` will persist this on the next tick.
  //
  // For users with zero assignments (admins with full catalog access),
  // we deliberately do NOT fall back to the first catalog entry — the
  // correct default for them is `null` = "All campuses".
  const storeSelected     = my.find((c: any) => Number(c.id) === selectedCampusId) ?? null
  const fallbackSelected  = assignments[0] ?? null
  const selected          = storeSelected ?? fallbackSelected

  // ── Locked single-campus mode ───────────────────────────────────────
  // Exactly one assignment → render a read-only pill with a lock icon.
  // No dropdown — the user can SEE the campus they're scoped to but
  // can't drift off it.
  if (isLockedToOne && selected) {
    return (
      <div
        className="inline-flex items-center gap-1.5 h-9 px-3 rounded-full border border-ink-200 dark:border-ink-700 bg-ink-50 dark:bg-ink-800/60 text-[12.5px] font-medium text-ink-600 dark:text-ink-300 cursor-not-allowed"
        title={`Scope is locked to ${selected.name}`}
      >
        <Building2 className="w-3.5 h-3.5 text-brand" />
        <span className="max-w-[160px] truncate">{selected.name}</span>
        <Lock className="w-3 h-3 text-ink-400" />
      </div>
    )
  }

  const label = selected
    ? selected.name
    : isScopeLocked
      ? 'My campuses'
      : isPriviledged
        ? 'All campuses'
        : 'My campuses'

  /** Refetch every page that reads campus-aware data so the UI flips
   *  immediately. We invalidate top-level service prefixes rather than
   *  naming individual queries, so future pages benefit too. */
  const setScope = (id: number | null) => {
    setSelectedCampusId(id)
    setOpen(false)
    queryClient.invalidateQueries({ queryKey: ['admin', 'applications'] })
    queryClient.invalidateQueries({ queryKey: ['admin', 'verifications'] })
    queryClient.invalidateQueries({ queryKey: ['admin', 'admissions'] })
    queryClient.invalidateQueries({ queryKey: ['students'] })
    queryClient.invalidateQueries({ queryKey: ['student-stats'] })
  }

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-1.5 h-9 px-3 rounded-full border border-ink-200 dark:border-ink-700 bg-white dark:bg-ink-800 hover:bg-ink-50 dark:hover:bg-ink-700/60 text-[12.5px] font-medium text-ink-700 dark:text-ink-200 transition-colors"
        title="Scope every page to a specific campus"
      >
        <Building2 className="w-3.5 h-3.5 text-brand" />
        <span className="max-w-[140px] truncate">{label}</span>
        <ChevronDown className="w-3 h-3 text-ink-400" />
      </button>

      {open && (
        <div className="absolute top-full right-0 mt-1.5 w-60 rounded-xl border border-ink-100 dark:border-ink-700 bg-white dark:bg-ink-900 shadow-xl ring-1 ring-black/[0.03] z-50 overflow-hidden animate-in fade-in slide-in-from-top-1">
          <p className="px-3 py-2 text-[10.5px] uppercase tracking-wider font-bold text-ink-400 border-b border-ink-100 dark:border-ink-800">
            Scope every page to
          </p>

          {/* Scope-locked users can pick any of their campuses but cannot
              opt out into "all campuses". Hide the All option for them. */}
          {!isScopeLocked && (
            <button
              type="button"
              onClick={() => setScope(null)}
              className={
                'w-full flex items-center justify-between px-3 py-2 text-[12.5px] transition-colors ' +
                (selectedCampusId == null
                  ? 'bg-primary-50 dark:bg-primary-900/30 text-primary-700 dark:text-primary-200 font-semibold'
                  : 'text-ink-700 dark:text-ink-200 hover:bg-ink-50 dark:hover:bg-ink-800')
              }
            >
              <span>{isPriviledged ? 'All campuses' : 'All my campuses'}</span>
              {selectedCampusId == null && <Check className="w-3.5 h-3.5" />}
            </button>
          )}

          <div className="max-h-72 overflow-y-auto">
            {my.map((c: any) => {
              const id = Number(c.id)
              const isActive = selectedCampusId === id
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => setScope(id)}
                  className={
                    'w-full flex items-center justify-between gap-2 px-3 py-2 text-[12.5px] transition-colors text-left ' +
                    (isActive
                      ? 'bg-primary-50 dark:bg-primary-900/30 text-primary-700 dark:text-primary-200 font-semibold'
                      : 'text-ink-700 dark:text-ink-200 hover:bg-ink-50 dark:hover:bg-ink-800')
                  }
                >
                  <span className="min-w-0">
                    <span className="block truncate">{c.name}</span>
                    {c.location && (
                      <span className="block text-[10.5px] text-ink-400 truncate">{c.location}</span>
                    )}
                  </span>
                  {isActive && <Check className="w-3.5 h-3.5 shrink-0" />}
                </button>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
