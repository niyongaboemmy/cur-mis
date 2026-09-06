import { useEffect, useRef, useState } from 'react'
import { Search, ChevronDown, X, Loader2 } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { api } from '@/services/api'

interface Props {
  value: string          // regnumber
  onChange: (regnumber: string, name?: string) => void
  placeholder?: string
  className?: string
  disabled?: boolean
}

export default function StudentSearchSelect({ value, onChange, placeholder = 'Search student…', className = '', disabled }: Props) {
  const [open, setOpen]       = useState(false)
  const [keyword, setKeyword] = useState('')
  const ref                   = useRef<HTMLDivElement>(null)
  const inputRef              = useRef<HTMLInputElement>(null)

  const q = useQuery({
    queryKey: ['student-search', keyword],
    queryFn: () => api.get<any>('/students', { search: keyword, per_page: 20 }),
    enabled: keyword.length >= 1,
    staleTime: 30_000,
  })

  const students: any[] = q.data?.data?.data ?? []

  // selected label: show name + reg
  const [selectedLabel, setSelectedLabel] = useState('')
  useEffect(() => {
    if (!value) setSelectedLabel('')
  }, [value])

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

  const handleOpen = () => {
    if (disabled) return
    setOpen(true)
    setKeyword('')
  }

  const handleSelect = (s: any) => {
    const label = `${s.fname} ${s.lname}`
    setSelectedLabel(label)
    onChange(s.regnumber, label)
    setOpen(false)
    setKeyword('')
  }

  const handleClear = (e: React.MouseEvent) => {
    e.stopPropagation()
    setSelectedLabel('')
    onChange('')
    setOpen(false)
  }

  return (
    <div ref={ref} className={`relative ${className}`}>
      <button
        type="button"
        disabled={disabled}
        className="input input-sm w-full text-left flex items-center justify-between gap-1.5 disabled:opacity-60"
        onClick={handleOpen}
      >
        {value ? (
          <span className="flex-1 truncate text-ink-900 dark:text-white text-[12px]">
            {selectedLabel || value}
          </span>
        ) : (
          <span className="flex-1 truncate text-ink-400 text-[12px]">{placeholder}</span>
        )}
        <span className="flex items-center gap-1 shrink-0">
          {value && (
            <X
              className="w-3 h-3 text-ink-400 hover:text-red-500"
              onClick={handleClear}
            />
          )}
          <ChevronDown className={`w-3.5 h-3.5 text-ink-400 transition-transform ${open ? 'rotate-180' : ''}`} />
        </span>
      </button>

      {open && (
        <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-white dark:bg-ink-900 border border-ink-200 dark:border-ink-700 rounded-lg shadow-xl overflow-hidden min-w-[260px]">
          <div className="p-1.5 border-b border-ink-100 dark:border-ink-700">
            <div className="relative">
              <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-400" />
              <input
                ref={inputRef}
                type="text"
                className="input input-xs pl-7 w-full"
                placeholder="Type name or reg. no…"
                value={keyword}
                onChange={e => setKeyword(e.target.value)}
              />
            </div>
          </div>

          <div className="max-h-60 overflow-y-auto">
            {q.isFetching && (
              <div className="flex items-center justify-center py-4 gap-2 text-ink-400 text-xs">
                <Loader2 className="w-3.5 h-3.5 animate-spin" /> Searching…
              </div>
            )}
            {!q.isFetching && keyword.length >= 1 && students.length === 0 && (
              <p className="p-3 text-center text-ink-400 text-[12px]">No students found.</p>
            )}
            {!q.isFetching && keyword.length < 1 && (
              <p className="p-3 text-center text-ink-400 text-[12px]">Type to search…</p>
            )}
            {students.map((s: any) => (
              <button
                key={s.regnumber}
                type="button"
                className="w-full text-left px-3 py-2 text-[12px] hover:bg-ink-50 dark:hover:bg-ink-700/30 flex items-center justify-between gap-2"
                onClick={() => handleSelect(s)}
              >
                <span className="font-medium text-ink-800 dark:text-white truncate">
                  {s.fname} {s.lname}
                </span>
                <span className="text-[10px] font-mono text-ink-400 whitespace-nowrap">
                  {s.regnumber}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
