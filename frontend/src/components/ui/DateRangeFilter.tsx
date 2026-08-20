import { useId, useMemo } from 'react'
import { CalendarRange, X } from 'lucide-react'

/**
 * A From/To date-range control shared by every report screen.
 *
 * The August 2026 registry report asked for "filter by Date range (From … to
 * …)" on applications "n'ahandi hakenerwa report" — and on the other screens
 * that produce reports. One component rather than a hand-rolled pair of date
 * inputs per page keeps the presets, the validation and the clear affordance
 * identical everywhere, so a range means the same thing on every report.
 *
 * Values are plain YYYY-MM-DD strings — exactly what `<input type="date">`
 * produces and what the backend's dateRangeBounds() parses. Both bounds are
 * inclusive of their whole day; either may stand alone.
 */

export interface DateRangeValue {
  from: string
  to:   string
}

interface Props {
  value:     DateRangeValue
  onChange:  (v: DateRangeValue) => void
  /** Labels the field on screen and in the presets menu. */
  label?:    string
  /** Hide the preset buttons where a page has no room for them. */
  presets?:  boolean
  className?: string
}

/** Local YYYY-MM-DD. Deliberately not toISOString(), which shifts to UTC and
 *  can land on the previous day for anyone east of Greenwich — Kigali is
 *  UTC+2, so "today" would read as yesterday for the first two hours daily. */
function iso(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

function buildPresets(): { label: string; from: string; to: string }[] {
  const now = new Date()
  const y = now.getFullYear()
  const m = now.getMonth()

  const startOfMonth     = new Date(y, m, 1)
  const startOfLastMonth = new Date(y, m - 1, 1)
  const endOfLastMonth   = new Date(y, m, 0)

  // The CUR academic year starts in August — the same rule
  // StudentIdCardHelper uses to label a card's valid year.
  const acadStart = new Date(m >= 7 ? y : y - 1, 7, 1)

  return [
    { label: 'This month',    from: iso(startOfMonth),     to: iso(now) },
    { label: 'Last month',    from: iso(startOfLastMonth), to: iso(endOfLastMonth) },
    { label: 'Last 90 days',  from: iso(new Date(y, m, now.getDate() - 89)), to: iso(now) },
    { label: 'Academic year', from: iso(acadStart),        to: iso(now) },
  ]
}

export default function DateRangeFilter({
  value,
  onChange,
  label = 'Date range',
  presets = true,
  className = '',
}: Props) {
  const uid    = useId()
  const items  = useMemo(buildPresets, [])
  const active = value.from !== '' || value.to !== ''

  // The browser already refuses out-of-range dates through min/max, but a
  // range typed directly into the field can still arrive reversed. The server
  // swaps them rather than returning nothing; flag it here so the user can see
  // why the results look wider than they expected.
  const reversed = value.from !== '' && value.to !== '' && value.from > value.to

  return (
    <div className={`flex flex-col gap-2 ${className}`}>
      <div className="flex flex-wrap items-end gap-2">
        <div className="flex flex-col gap-1">
          <label
            htmlFor={`${uid}-from`}
            className="text-[11px] font-semibold uppercase tracking-wider text-ink-500"
          >
            {label} — from
          </label>
          <input
            id={`${uid}-from`}
            type="date"
            className="input input-sm bg-white dark:bg-ink-900"
            value={value.from}
            max={value.to || undefined}
            onChange={(e) => onChange({ ...value, from: e.target.value })}
          />
        </div>

        <div className="flex flex-col gap-1">
          <label
            htmlFor={`${uid}-to`}
            className="text-[11px] font-semibold uppercase tracking-wider text-ink-500"
          >
            To
          </label>
          <input
            id={`${uid}-to`}
            type="date"
            className="input input-sm bg-white dark:bg-ink-900"
            value={value.to}
            min={value.from || undefined}
            onChange={(e) => onChange({ ...value, to: e.target.value })}
          />
        </div>

        {active && (
          <button
            type="button"
            onClick={() => onChange({ from: '', to: '' })}
            className="btn-ghost btn-sm h-9"
            title="Clear the date range"
          >
            <X className="w-3.5 h-3.5" /> Clear
          </button>
        )}
      </div>

      {presets && (
        <div className="flex flex-wrap items-center gap-1.5">
          <CalendarRange className="w-3.5 h-3.5 text-ink-400" aria-hidden="true" />
          {items.map((p) => {
            const on = value.from === p.from && value.to === p.to
            return (
              <button
                key={p.label}
                type="button"
                onClick={() => onChange({ from: p.from, to: p.to })}
                aria-pressed={on}
                className={
                  'px-2 py-0.5 rounded-full text-[11px] font-semibold border transition-colors ' +
                  (on
                    ? 'border-brand bg-brand/10 text-brand'
                    : 'border-ink-200 dark:border-ink-700 text-ink-500 hover:text-brand hover:border-brand')
                }
              >
                {p.label}
              </button>
            )
          })}
        </div>
      )}

      {reversed && (
        <p className="text-[11.5px] text-amber-600 dark:text-amber-400">
          The start date is after the end date — showing everything between them instead.
        </p>
      )}
    </div>
  )
}
