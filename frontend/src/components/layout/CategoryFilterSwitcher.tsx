import { useQueryClient } from '@tanstack/react-query'
import { Check, ChevronDown, GraduationCap } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useAuthStore } from '@/store/authStore'
import {
  useCategoryFilterStore,
  type StudentCategory,
} from '@/store/categoryFilterStore'

/**
 * Topbar pill that scopes the entire app to a single student category
 * (Undergraduate or Postgraduate) drawn from `student.category`. When
 * no category is selected the value is `null` = "All categories" and
 * pages render the unscoped aggregate.
 *
 * Hidden for applicants and students (their views are self-scoped).
 */
const OPTIONS: { value: StudentCategory; label: string }[] = [
  { value: 'undergraduate', label: 'Undergraduate' },
  { value: 'postgraduate', label: 'Postgraduate' },
]

export default function CategoryFilterSwitcher() {
  const { user } = useAuthStore()
  const { selectedCategory, setSelectedCategory } = useCategoryFilterStore()
  const queryClient = useQueryClient()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!open) return
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    window.addEventListener('mousedown', onClick)
    return () => window.removeEventListener('mousedown', onClick)
  }, [open])

  const role = (user?.role ?? '').toLowerCase()
  if (!user || role === 'applicant' || role === 'student') return null

  const selectedLabel =
    OPTIONS.find((o) => o.value === selectedCategory)?.label ?? 'All categories'

  /** Refetch every category-aware page so the UI flips immediately. */
  const setScope = (cat: StudentCategory | null) => {
    setSelectedCategory(cat)
    setOpen(false)
    queryClient.invalidateQueries({ queryKey: ['students'] })
    queryClient.invalidateQueries({ queryKey: ['student-stats'] })
    queryClient.invalidateQueries({ queryKey: ['admin', 'dashboard'] })
  }

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-1.5 h-9 px-3 rounded-full border border-ink-200 dark:border-ink-700 bg-white dark:bg-ink-800 hover:bg-ink-50 dark:hover:bg-ink-700/60 text-[12.5px] font-medium text-ink-700 dark:text-ink-200 transition-colors"
        title="Scope every page to a student category"
      >
        <GraduationCap className="w-3.5 h-3.5 text-brand" />
        <span className="max-w-[140px] truncate">{selectedLabel}</span>
        <ChevronDown className="w-3 h-3 text-ink-400" />
      </button>

      {open && (
        <div className="absolute top-full right-0 mt-1.5 w-56 rounded-xl border border-ink-100 dark:border-ink-700 bg-white dark:bg-ink-900 shadow-xl ring-1 ring-black/[0.03] z-50 overflow-hidden animate-in fade-in slide-in-from-top-1">
          <p className="px-3 py-2 text-[10.5px] uppercase tracking-wider font-bold text-ink-400 border-b border-ink-100 dark:border-ink-800">
            Scope every page to
          </p>

          <button
            type="button"
            onClick={() => setScope(null)}
            className={
              'w-full flex items-center justify-between px-3 py-2 text-[12.5px] transition-colors ' +
              (selectedCategory == null
                ? 'bg-primary-50 dark:bg-primary-900/30 text-primary-700 dark:text-primary-200 font-semibold'
                : 'text-ink-700 dark:text-ink-200 hover:bg-ink-50 dark:hover:bg-ink-800')
            }
          >
            <span>All categories</span>
            {selectedCategory == null && <Check className="w-3.5 h-3.5" />}
          </button>

          {OPTIONS.map((o) => {
            const isActive = selectedCategory === o.value
            return (
              <button
                key={o.value}
                type="button"
                onClick={() => setScope(o.value)}
                className={
                  'w-full flex items-center justify-between gap-2 px-3 py-2 text-[12.5px] transition-colors text-left ' +
                  (isActive
                    ? 'bg-primary-50 dark:bg-primary-900/30 text-primary-700 dark:text-primary-200 font-semibold'
                    : 'text-ink-700 dark:text-ink-200 hover:bg-ink-50 dark:hover:bg-ink-800')
                }
              >
                <span>{o.label}</span>
                {isActive && <Check className="w-3.5 h-3.5 shrink-0" />}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
