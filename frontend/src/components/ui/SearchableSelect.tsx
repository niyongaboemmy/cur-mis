import { useEffect, useRef, useState, useMemo } from 'react'
import { Search, ChevronDown, X } from 'lucide-react'

export interface SelectOption {
  value: number | string
  label: string
  sub?: string
}

interface Props {
  options:      SelectOption[]
  value:        number | string
  onChange:     (value: number | string) => void
  placeholder?: string
  allLabel?:    string
  className?:   string
}

export default function SearchableSelect({
  options, value, onChange, placeholder = 'Select…', allLabel, className = '',
}: Props) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const ref = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const filtered = useMemo(() => {
    if (!search.trim()) return options
    const q = search.toLowerCase()
    return options.filter((o) => o.label.toLowerCase().includes(q) || (o.sub ?? '').toLowerCase().includes(q))
  }, [options, search])

  const selected = options.find((o) => String(o.value) === String(value))

  // Close on outside click
  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  // Autofocus search on open
  useEffect(() => { if (open) setTimeout(() => inputRef.current?.focus(), 50) }, [open])

  return (
    <div ref={ref} className={`relative ${className}`}>
      <button
        type="button"
        className="input input-sm w-full text-left flex items-center justify-between gap-1.5"
        onClick={() => { setOpen(!open); setSearch('') }}
      >
        <span className={selected ? 'text-ink-900 dark:text-white truncate' : 'text-ink-400 truncate'}>
          {selected ? selected.label : (allLabel ?? placeholder)}
        </span>
        <ChevronDown className={`w-3.5 h-3.5 text-ink-400 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="absolute z-40 top-full left-0 right-0 mt-1 bg-white dark:bg-ink-900 border border-ink-200 dark:border-ink-700 rounded-lg shadow-xl overflow-hidden min-w-[220px]">
          {/* Search */}
          <div className="p-1.5 border-b border-ink-100 dark:border-ink-700">
            <div className="relative">
              <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-400" />
              <input
                ref={inputRef}
                type="text"
                className="input input-xs pl-7 w-full"
                placeholder="Search…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
          </div>

          <div className="max-h-52 overflow-y-auto">
            {/* "All" option */}
            {allLabel && (
              <button
                type="button"
                className={`w-full text-left px-3 py-1.5 text-[12px] transition-colors ${
                  !value || value === 0 || value === '' ? 'bg-brand/10 text-brand font-semibold' : 'hover:bg-ink-50 dark:hover:bg-ink-700/30 text-ink-600 dark:text-ink-300'
                }`}
                onClick={() => { onChange(0); setOpen(false) }}
              >
                {allLabel}
              </button>
            )}
            {filtered.length === 0 ? (
              <p className="p-3 text-center text-ink-400 text-[12px]">No results.</p>
            ) : filtered.map((o) => (
              <button
                key={o.value}
                type="button"
                className={`w-full text-left px-3 py-1.5 text-[12px] flex items-center gap-2 transition-colors ${
                  String(o.value) === String(value) ? 'bg-brand/10 text-brand font-semibold' : 'hover:bg-ink-50 dark:hover:bg-ink-700/30'
                }`}
                onClick={() => { onChange(o.value); setOpen(false) }}
              >
                <span className="truncate">{o.label}</span>
                {o.sub && <span className="ml-auto text-[10px] text-ink-400 whitespace-nowrap">{o.sub}</span>}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
