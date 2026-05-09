import { useEffect, useMemo, useRef, useState } from 'react'
import { Search, ChevronDown, Globe2 } from 'lucide-react'
import {
  COUNTRIES,
  COUNTRY_BY_NAME,
  COUNTRY_BY_NATIONALITY,
  countryFlag,
  type Country,
} from '@/data/countries'

interface Props {
  /** Either a country *name* (for residence) or a *nationality demonym* (for nationality). */
  value: string
  onChange: (value: string) => void
  /** When true, the select stores the demonym (e.g. "Rwandan") instead of the country name. */
  mode?: 'country' | 'nationality'
  placeholder?: string
  disabled?: boolean
  className?: string
}

export default function CountrySelect({
  value,
  onChange,
  mode = 'country',
  placeholder = 'Select country',
  disabled = false,
  className = '',
}: Props) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const ref = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const selected: Country | undefined = useMemo(() => {
    if (!value) return undefined
    const v = value.toLowerCase()
    return mode === 'nationality' ? COUNTRY_BY_NATIONALITY[v] : COUNTRY_BY_NAME[v]
  }, [value, mode])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return COUNTRIES
    return COUNTRIES.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        c.code.toLowerCase().includes(q) ||
        c.nationality.toLowerCase().includes(q),
    )
  }, [query])

  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 50)
  }, [open])

  const displayLabel = selected
    ? mode === 'nationality' ? selected.nationality : selected.name
    : ''

  return (
    <div ref={ref} className={`relative ${className}`}>
      <button
        type="button"
        className={`input w-full text-left flex items-center gap-2 ${disabled ? 'opacity-50 cursor-not-allowed bg-ink-50 dark:bg-ink-800' : ''}`}
        onClick={() => { if (!disabled) { setOpen(!open); setQuery('') } }}
        disabled={disabled}
      >
        {selected ? (
          <span className="text-[18px] leading-none" aria-hidden>{countryFlag(selected.code)}</span>
        ) : (
          <Globe2 className="w-4 h-4 text-ink-400" />
        )}
        <span className={`flex-1 truncate ${selected ? 'text-ink-900 dark:text-white' : 'text-ink-400'}`}>
          {displayLabel || placeholder}
        </span>
        <ChevronDown className={`w-3.5 h-3.5 text-ink-400 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-white dark:bg-ink-900 border border-ink-200 dark:border-ink-700 rounded-lg shadow-xl overflow-hidden">
          <div className="p-2 border-b border-ink-100 dark:border-ink-700">
            <div className="relative">
              <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-400" />
              <input
                ref={inputRef}
                type="text"
                className="input pl-8 w-full"
                placeholder="Search by country, code or nationality"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </div>
          </div>

          <div className="max-h-72 overflow-y-auto">
            {filtered.length === 0 ? (
              <p className="p-4 text-center text-ink-400 text-[12px]">No countries match.</p>
            ) : (
              filtered.map((c) => {
                const isSel = selected?.code === c.code
                return (
                  <button
                    key={c.code}
                    type="button"
                    className={`w-full text-left px-3 py-2 flex items-center gap-3 transition-colors ${
                      isSel ? 'bg-brand/10 text-brand font-semibold'
                            : 'hover:bg-ink-50 dark:hover:bg-ink-700/30'
                    }`}
                    onClick={() => {
                      onChange(mode === 'nationality' ? c.nationality : c.name)
                      setOpen(false)
                      setQuery('')
                    }}
                  >
                    <span className="text-[20px] leading-none shrink-0" aria-hidden>{countryFlag(c.code)}</span>
                    <span className="flex-1 min-w-0">
                      <span className="block text-[13px] truncate">{c.name}</span>
                      {mode === 'nationality' && (
                        <span className="block text-[11px] text-ink-400 truncate">{c.nationality}</span>
                      )}
                    </span>
                    <span className="text-[10.5px] font-mono text-ink-400 shrink-0">{c.code}</span>
                  </button>
                )
              })
            )}
          </div>
        </div>
      )}
    </div>
  )
}
