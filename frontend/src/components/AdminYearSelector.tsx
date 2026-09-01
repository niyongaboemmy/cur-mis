import { useAdminYearSelection, useAdminAcademicYears } from '@/hooks/useAdminYearSelection'
import { ChevronDown, RotateCcw, Loader2, Shield } from 'lucide-react'

interface AdminYearSelectorProps {
  className?: string
  compact?: boolean
}

/**
 * Admin-only academic year selector
 * Allows admins to view any previous year without interrupting other users
 * This is separate from the module-level year selection
 *
 * Features:
 * - Switch to any historical year instantly
 * - View doesn't affect Finance, Academic, or HR modules
 * - Other staff continue working uninterrupted
 * - Session-based (per browser, not saved to database)
 * - Clear indicator when viewing non-current year
 */
export default function AdminYearSelector({
  className = '',
  compact = false,
}: AdminYearSelectorProps) {
  const { selectedYearId, currentYearId, isLoading, isSetting, isResetting, isViewingCurrent, setYear, resetYear } = useAdminYearSelection()
  const { data: yearsData, isLoading: yearsLoading } = useAdminAcademicYears()

  const years = yearsData?.academic_years || []
  const isDisabled = isLoading || isSetting || isResetting || yearsLoading

  if (isLoading) {
    return (
      <div className={`flex items-center gap-2 ${className}`}>
        <Loader2 className="w-4 h-4 animate-spin" />
        <span className="text-sm text-ink-500">Loading...</span>
      </div>
    )
  }

  if (compact) {
    return (
      <div className={`flex items-center gap-2 ${className}`}>
        <Shield className="w-4 h-4 text-primary-600" />
        <select
          value={selectedYearId || ''}
          onChange={(e) => setYear(e.target.value ? parseInt(e.target.value) : null)}
          disabled={isDisabled}
          className={`input input-sm text-xs ${isDisabled ? 'opacity-60' : ''}`}
          title="Admin year selection (doesn't affect other users)"
        >
          {years.map((year: any) => (
            <option key={year.id} value={year.id}>
              {year.name}
              {year.id === currentYearId ? ' ✓' : ''}
            </option>
          ))}
        </select>
        {!isViewingCurrent && (
          <button
            onClick={() => resetYear()}
            className="text-xs text-ink-500 hover:text-ink-700 dark:hover:text-ink-300 underline"
            title="Reset to current year"
          >
            Reset
          </button>
        )}
      </div>
    )
  }

  return (
    <div className={`space-y-3 ${className}`}>
      {/* Header */}
      <div className="flex items-center gap-2">
        <Shield className="w-5 h-5 text-primary-600" />
        <h3 className="text-sm font-semibold text-ink-900 dark:text-white">
          Admin Year Selection
        </h3>
        {!isViewingCurrent && (
          <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300">
            Viewing Historical Year
          </span>
        )}
      </div>

      {/* Info */}
      <p className="text-xs text-ink-500 dark:text-ink-400">
        Switch to any previous year to review historical data. Other staff won't be affected.
      </p>

      {/* Year Selector */}
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <select
            value={selectedYearId || ''}
            onChange={(e) => setYear(e.target.value ? parseInt(e.target.value) : null)}
            disabled={isDisabled}
            className={`input pr-8 text-sm appearance-none cursor-pointer w-full ${isDisabled ? 'opacity-60 cursor-not-allowed' : ''}`}
          >
            {years.map((year: any) => (
              <option key={year.id} value={year.id}>
                {year.name}
                {year.id === currentYearId ? ' (Current)' : ''}
              </option>
            ))}
          </select>
          <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-500 pointer-events-none" />
        </div>

        {!isViewingCurrent && (
          <button
            onClick={() => resetYear()}
            disabled={isResetting}
            title="Reset to current academic year"
            className={`btn-secondary btn-sm px-2.5 py-1.5 flex items-center gap-1.5 whitespace-nowrap ${isResetting ? 'opacity-60 cursor-not-allowed' : ''}`}
          >
            {isResetting ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <RotateCcw className="w-3.5 h-3.5" />
            )}
            <span className="hidden sm:inline text-xs">Reset</span>
          </button>
        )}
      </div>

      {/* Status */}
      <div className="p-3 rounded-lg bg-ink-50 dark:bg-ink-800">
        <p className="text-xs text-ink-600 dark:text-ink-400">
          <strong>Current view:</strong> {years.find((year: any) => year.id === selectedYearId)?.name || 'Loading...'}
        </p>
        {!isViewingCurrent && (
          <p className="text-xs text-amber-600 dark:text-amber-400 mt-1">
            ⚠️ You're viewing a historical year. Finance, Academic, HR modules show their independently selected years.
          </p>
        )}
      </div>

      {/* Show current year info */}
      <div className="text-xs text-ink-500 dark:text-ink-400 pt-2 border-t border-ink-200 dark:border-ink-700">
        <p><strong>Current Academic Year:</strong> {years.find((year: any) => year.id === currentYearId)?.name}</p>
      </div>
    </div>
  )
}

/**
 * Admin Dashboard Header Component
 * Shows admin year selector in header with other dashboard info
 */
export function AdminDashboardHeader() {
  const { selectedYear, isViewingCurrent } = useAdminYearSelection()

  return (
    <div className="bg-gradient-to-r from-primary-50 to-primary-100 dark:from-primary-900/20 dark:to-primary-900/10 border border-primary-200 dark:border-primary-800 rounded-lg p-6 mb-4">
      <div className="flex items-center justify-between gap-6">
        <div className="flex-1">
          <h1 className="text-2xl font-bold text-ink-900 dark:text-white">
            Admin Dashboard
          </h1>
          {!isViewingCurrent && (
            <p className="text-sm text-amber-700 dark:text-amber-300 mt-2">
              🔍 Viewing {selectedYear?.name} (historical data)
            </p>
          )}
        </div>
        <div className="min-w-max">
          <AdminYearSelector compact={true} />
        </div>
      </div>
    </div>
  )
}
