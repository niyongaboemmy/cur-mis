import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Building2, Check, ChevronDown } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import userService from '@/services/userService'
import { useAuthStore } from '@/store/authStore'
import { useCampusFilterStore } from '@/store/campusFilterStore'

/**
 * Topbar pill that lets a registry staffer scope the entire app to a
 * single campus they're assigned to. Admins / superadmins can pick any
 * active campus. Renders nothing for applicants and for users with zero
 * campus assignments who aren't admins (one-campus implicit default).
 */
export default function CampusFilterSwitcher() {
  const { user } = useAuthStore()
  const { selectedCampusId, setSelectedCampusId } = useCampusFilterStore()
  const queryClient = useQueryClient()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement | null>(null)

  /** Called whenever the scope changes — refetch every page that reads
   *  campus-aware data so the UI flips immediately. We invalidate the
   *  top-level service prefixes rather than naming individual queries,
   *  so future pages benefit too. */
  const setScope = (id: number | null) => {
    setSelectedCampusId(id)
    setOpen(false)
    queryClient.invalidateQueries({ queryKey: ['admin', 'applications'] })
    queryClient.invalidateQueries({ queryKey: ['admin', 'verifications'] })
    queryClient.invalidateQueries({ queryKey: ['admin', 'admissions'] })
    queryClient.invalidateQueries({ queryKey: ['students'] })
  }

  // Click-away to close.
  useEffect(() => {
    if (!open) return
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    window.addEventListener('mousedown', onClick)
    return () => window.removeEventListener('mousedown', onClick)
  }, [open])

  const role = (user?.role ?? '').toLowerCase()
  const isPriviledged = role === 'admin' || role === 'superadmin'
  const isScopeLocked = !!user?.enforce_campus_scope

  // Catalog of every active campus — used when admins want to drill into
  // a campus they aren't formally assigned to. Skipped (and harmless 403'd)
  // for users without MANAGE_USERS; we fall back to the my-assignments
  // list below. Scope-locked users never need the catalog.
  const canSeeCatalog = !!user?.permissions?.includes('MANAGE_USERS') && !isScopeLocked
  const catalogQ = useQuery({
    queryKey: ['users', 'campuses-catalog'],
    queryFn:  () => userService.listAllCampuses(),
    enabled:  canSeeCatalog,
    staleTime: 1000 * 60 * 30,
  })

  // Pick the right source:
  //   scope-locked → only the user's assigned_campuses (no choices outside)
  //   admin / catalog-aware → full active-campus catalog
  //   everyone else → assignments from the auth payload (no extra request)
  const my = isScopeLocked
    ? (user?.assigned_campuses ?? [])
    : ((canSeeCatalog ? catalogQ.data?.data?.campuses : null) ?? (user?.assigned_campuses ?? []))

  // Hide entirely if the user has nothing meaningful to pick from.
  if (!user || role === 'applicant') return null
  if (my.length <= 1) return null
  if (isPriviledged && !isScopeLocked && my.length === 0) return null

  const selected = my.find((c: any) => Number(c.id) === selectedCampusId) ?? null
  const label = selected
    ? selected.name
    : isScopeLocked
      ? 'My campuses'
      : isPriviledged
        ? 'All campuses'
        : 'My campuses'

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
            <span>{isScopeLocked || !isPriviledged ? 'All my campuses' : 'All campuses'}</span>
            {selectedCampusId == null && <Check className="w-3.5 h-3.5" />}
          </button>

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
