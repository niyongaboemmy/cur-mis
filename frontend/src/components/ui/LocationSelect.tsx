import { useId } from 'react'
import {
  PROVINCES,
  districtsOf,
  sectorsOf,
  cellsOf,
  villagesOf,
} from '@/data/rwandaLocations'

export interface LocationValue {
  province?: string | null
  district?: string | null
  sector?:   string | null
  cell?:     string | null
  village?:  string | null
}

type Level = keyof LocationValue

interface LocationSelectProps {
  value:    LocationValue
  onChange: (next: LocationValue) => void
  /** Levels to render, outermost first. Defaults to the full hierarchy. */
  levels?:  Level[]
  disabled?: boolean
  /** Render label + control; lets callers reuse their own field wrapper. */
  renderField?: (args: {
    label: string
    control: React.ReactNode
    level: Level
  }) => React.ReactNode
}

const LEVEL_LABELS: Record<Level, string> = {
  province: 'Province',
  district: 'District',
  sector:   'Sector',
  cell:     'Cell',
  village:  'Village',
}

/** Levels below a given one, in cascade order — cleared when a parent changes. */
const DESCENDANTS: Record<Level, Level[]> = {
  province: ['district', 'sector', 'cell', 'village'],
  district: ['sector', 'cell', 'village'],
  sector:   ['cell', 'village'],
  cell:     ['village'],
  village:  [],
}

/**
 * Cascading Rwanda location picker.
 *
 * Each level renders as a <select> when authoritative options exist for the
 * current parent selection, and as a free-text <input> otherwise. Province and
 * district always have data; sector/cell/village become dropdowns automatically
 * once the official dataset is loaded into `@/data/rwandaLocations` — no change
 * needed here.
 *
 * Changing any level clears every level beneath it, so an inconsistent
 * combination (e.g. a district left over from a different province) can't be
 * submitted.
 */
export default function LocationSelect({
  value,
  onChange,
  levels = ['province', 'district', 'sector', 'cell', 'village'],
  disabled = false,
  renderField,
}: LocationSelectProps) {
  const uid = useId()

  const optionsFor = (level: Level): string[] => {
    switch (level) {
      case 'province': return [...PROVINCES]
      case 'district': return districtsOf(value.province)
      case 'sector':   return sectorsOf(value.district)
      case 'cell':     return cellsOf(value.district, value.sector)
      case 'village':  return villagesOf(value.district, value.sector, value.cell)
    }
  }

  const set = (level: Level, next: string) => {
    const patch: LocationValue = { ...value, [level]: next || null }
    // A stale child (e.g. "Gasabo" kept after switching to Northern province)
    // would silently persist an impossible address.
    for (const child of DESCENDANTS[level]) patch[child] = null
    onChange(patch)
  }

  return (
    <>
      {levels.map((level) => {
        const options  = optionsFor(level)
        const current  = value[level] ?? ''
        const label    = LEVEL_LABELS[level]
        const fieldId  = `${uid}-${level}`

        // Disable a level until its parent is chosen — picking a district
        // before a province has no defined set of options.
        const parentIndex = levels.indexOf(level) - 1
        const parent      = parentIndex >= 0 ? levels[parentIndex] : null
        const blocked     = disabled || (!!parent && !value[parent])

        const control = options.length > 0 ? (
          <select
            id={fieldId}
            className="input"
            value={current}
            disabled={blocked}
            onChange={(e) => set(level, e.target.value)}
          >
            <option value="">
              {blocked ? `Select ${LEVEL_LABELS[parent as Level]} first` : `Select ${label}`}
            </option>
            {/* A value saved before this level had a dropdown (or entered via
                another channel) must remain visible rather than silently
                resetting to blank. */}
            {current && !options.includes(current) && (
              <option value={current}>{current}</option>
            )}
            {options.map((o) => (
              <option key={o} value={o}>{o}</option>
            ))}
          </select>
        ) : (
          <input
            id={fieldId}
            className="input"
            type="text"
            value={current}
            disabled={blocked}
            placeholder={
              blocked
                ? `Select ${LEVEL_LABELS[parent as Level]} first`
                : `Enter ${label.toLowerCase()}`
            }
            onChange={(e) => set(level, e.target.value)}
          />
        )

        if (renderField) {
          return (
            <div key={level} className="contents">
              {renderField({ label, control, level })}
            </div>
          )
        }

        return (
          <div key={level}>
            <label
              htmlFor={fieldId}
              className="block text-[11px] font-semibold uppercase tracking-wider text-ink-500 dark:text-ink-400 mb-1"
            >
              {label}
            </label>
            {control}
          </div>
        )
      })}
    </>
  )
}
