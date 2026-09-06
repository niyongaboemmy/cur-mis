import { useState, useRef, useEffect, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { CalendarRange, ChevronDown, Check } from 'lucide-react'
import { useSystemStore } from '@/store/systemStore'
import type { AcademicYear } from '@/types/academic'

/**
 * Global academic-year selector — lives in the topnav. Reads/writes
 * `selectedYearLabel` in `useSystemStore`, so any page that consumes
 * that value will re-render and refetch on change. "All years" = empty
 * string.
 */
export default function AcademicYearSelector() {
  const [isOpen, setIsOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)

  const basics            = useSystemStore((s) => s.basics)
  const selectedYearLabel = useSystemStore((s) => s.selectedYearLabel)
  const setSelected       = useSystemStore((s) => s.setSelectedYearLabel)

  const years: AcademicYear[] = useMemo(() => {
    const list = basics?.years ?? []
    // Sort descending by label (label is of the form "2026-2027") so the
    // most recent year sits at the top, mirroring the inline filter.
    return [...list].sort((a, b) => (b.label || '').localeCompare(a.label || ''))
  }, [basics?.years])

  const activeLabel =
    basics?.active_year && typeof basics.active_year === 'object'
      ? (basics.active_year as AcademicYear).label
      : null

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setIsOpen(false)
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [])

  const displayLabel = selectedYearLabel || 'All years'
  const disabled = years.length === 0

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => !disabled && setIsOpen((v) => !v)}
        disabled={disabled}
        title="Academic year"
        aria-label="Select academic year"
        className="h-10 inline-flex items-center gap-2 px-3 rounded-full border border-ink-100 dark:border-ink-700 bg-white dark:bg-ink-800 text-[12.5px] font-medium text-ink-700 dark:text-ink-200 hover:text-primary-700 hover:border-primary-200 dark:hover:bg-ink-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
      >
        <CalendarRange className="w-[16px] h-[16px] text-ink-500" />
        <span className="hidden sm:inline">Academic yr:</span>
        <span className="tabular-nums">{displayLabel}</span>
        <ChevronDown
          className={`w-3.5 h-3.5 text-ink-400 transition-transform ${isOpen ? 'rotate-180' : ''}`}
        />
      </button>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.14 }}
            className="absolute right-0 mt-2 w-56 rounded-lg bg-white dark:bg-ink-800 border border-ink-100 dark:border-ink-700 shadow-lg overflow-hidden z-40"
          >
            <div className="max-h-[320px] overflow-y-auto py-1">
              <YearOption
                label="All years"
                selected={selectedYearLabel === ''}
                onClick={() => { setSelected('', null); setIsOpen(false) }}
              />
              <div className="h-px bg-ink-100 dark:bg-ink-700 my-1" />
              {years.map((y) => (
                <YearOption
                  key={y.id}
                  label={y.label}
                  badge={y.label === activeLabel ? 'Active' : undefined}
                  selected={y.label === selectedYearLabel}
                  onClick={() => { setSelected(y.label, y.id); setIsOpen(false) }}
                />
              ))}
              {years.length === 0 && (
                <p className="px-3 py-4 text-[12px] text-ink-400 text-center">No academic years yet.</p>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

function YearOption({
  label,
  badge,
  selected,
  onClick,
}: {
  label: string
  badge?: string
  selected: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full flex items-center gap-2 px-3 py-2 text-[12.5px] text-left transition-colors ${
        selected
          ? 'bg-primary-50 text-primary-800 dark:bg-primary-900/30 dark:text-primary-100'
          : 'text-ink-700 dark:text-ink-200 hover:bg-ink-50 dark:hover:bg-ink-700/50'
      }`}
    >
      <Check className={`w-3.5 h-3.5 shrink-0 ${selected ? 'text-primary-700 dark:text-primary-200' : 'text-transparent'}`} />
      <span className="flex-1 tabular-nums">{label}</span>
      {badge && (
        <span className="text-[10px] uppercase tracking-wider font-semibold px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300">
          {badge}
        </span>
      )}
    </button>
  )
}
