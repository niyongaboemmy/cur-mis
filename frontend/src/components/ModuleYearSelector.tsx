import { useModuleYear, useAcademicYears } from '@/hooks/useModuleYear'
import { ChevronDown, RotateCcw, Loader2 } from 'lucide-react'

interface ModuleYearSelectorProps {
  moduleName: string
  showResetButton?: boolean
  className?: string
}

/**
 * Module-level academic year selector
 * Allows independent year selection per module (Finance, Academic, HR, etc)
 *
 * @param moduleName - Name of the module
 * @param showResetButton - Show reset to current year button
 * @param className - Additional CSS classes
 */
export default function ModuleYearSelector({
  moduleName,
  showResetButton = true,
  className = '',
}: ModuleYearSelectorProps) {
  const { selectedYearId, currentYearId, isLoading, isSetting, isResetting, setYear, resetYear, isUsingCurrentYear } = useModuleYear(moduleName)
  const { data: yearsData, isLoading: yearsLoading } = useAcademicYears()

  const years = yearsData?.data || []
  const isDisabled = isLoading || isSetting || isResetting || yearsLoading

  if (isLoading) {
    return (
      <div className={`flex items-center gap-2 ${className}`}>
        <Loader2 className="w-4 h-4 animate-spin" />
        <span className="text-sm text-ink-500">Loading year...</span>
      </div>
    )
  }

  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <label className="text-sm font-medium text-ink-700 dark:text-ink-300 whitespace-nowrap">
        Academic Year:
      </label>

      <div className="relative flex-1 min-w-max">
        <select
          value={selectedYearId || ''}
          onChange={(e) => setYear(e.target.value ? parseInt(e.target.value) : null)}
          disabled={isDisabled}
          className={`input pr-8 text-sm appearance-none cursor-pointer ${isDisabled ? 'opacity-60 cursor-not-allowed' : ''}`}
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

      {showResetButton && !isUsingCurrentYear && (
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

      {isSetting && (
        <div className="text-xs text-ink-500 flex items-center gap-1">
          <Loader2 className="w-3 h-3 animate-spin" />
          Updating...
        </div>
      )}
    </div>
  )
}

/**
 * Compact version of ModuleYearSelector for header/toolbar placement
 */
export function CompactModuleYearSelector({
  moduleName,
  className = '',
}: Omit<ModuleYearSelectorProps, 'showResetButton'>) {
  const { selectedYear, currentYear, isLoading, isSetting, isUsingCurrentYear, setYear, resetYear } = useModuleYear(moduleName)
  const { data: yearsData } = useAcademicYears()

  const years = yearsData?.data || []

  if (isLoading) {
    return <span className="text-xs text-ink-500">Loading...</span>
  }

  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <select
        value={selectedYear?.id || ''}
        onChange={(e) => setYear(e.target.value ? parseInt(e.target.value) : null)}
        disabled={isSetting}
        className={`input input-sm text-xs ${isSetting ? 'opacity-60' : ''}`}
        title={`${moduleName} academic year`}
      >
        {years.map((year: any) => (
          <option key={year.id} value={year.id}>
            {year.name}
            {year.id === currentYear?.id ? ' ✓' : ''}
          </option>
        ))}
      </select>

      {!isUsingCurrentYear && (
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
