import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Search, ChevronDown, Check } from 'lucide-react'

export interface GroupedOption {
  value: number | string
  label: string
  /** Secondary text shown muted on the right + included in search. */
  sub?: string
  /** Group header this option belongs to. Omitted → "Other". */
  group?: string
}

interface Props {
  value: number | string | ''
  onChange: (value: number | '') => void
  options: GroupedOption[]
  placeholder: string
  /** Label for the "no selection" row at the top (e.g. "— unassigned —"). */
  allLabel?: string
  ariaLabel?: string
  /** Explicit ordering of group headers; unlisted groups follow alphabetically, "Other" last. */
  groupOrder?: string[]
  disabled?: boolean
  className?: string
  /** Show the option's `sub` inline next to the trigger label. */
  showSubOnTrigger?: boolean
}

/**
 * A searchable single-select with sticky group headers, rendered through a
 * body portal so it never gets clipped by a scroll container or a modal's
 * overflow. Positioning mirrors the table pickers used elsewhere: `fixed`
 * coordinates derived from the trigger's bounding box, re-tracked on
 * scroll/resize.
 */
export default function RoleGroupedSelect({
  value, onChange, options, placeholder, allLabel, ariaLabel,
  groupOrder = [], disabled = false, className = '', showSubOnTrigger = false,
}: Props) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [coords, setCoords] = useState<{ left: number; width: number; top?: number; bottom?: number; listMax: number } | null>(null)
  const btnRef = useRef<HTMLButtonElement>(null)
  const popRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const selected = options.find((o) => String(o.value) === String(value))

  useEffect(() => {
    if (!open) return
    const reposition = () => {
      const r = btnRef.current?.getBoundingClientRect()
      if (!r) return
      // Open downward by default; flip upward (anchored to the trigger's TOP
      // edge via `bottom`) only when there isn't room below — so the popover
      // always hugs the trigger regardless of its content height.
      const margin = 8
      const spaceBelow = window.innerHeight - r.bottom - margin
      const spaceAbove = r.top - margin
      const flipUp = spaceBelow < 260 && spaceAbove > spaceBelow
      const space = flipUp ? spaceAbove : spaceBelow
      const listMax = Math.max(140, Math.min(288, space - 52))
      setCoords({
        left: r.left,
        width: Math.max(r.width, 260),
        listMax,
        ...(flipUp ? { bottom: window.innerHeight - r.top + 4 } : { top: r.bottom + 4 }),
      })
    }
    reposition()
    window.addEventListener('scroll', reposition, true)
    window.addEventListener('resize', reposition)
    return () => {
      window.removeEventListener('scroll', reposition, true)
      window.removeEventListener('resize', reposition)
    }
  }, [open])

  useEffect(() => {
    if (!open) return
    const onClick = (e: MouseEvent) => {
      const t = e.target as Node
      if (btnRef.current?.contains(t) || popRef.current?.contains(t)) return
      setOpen(false)
    }
    // Capture-phase + stopPropagation so Esc closes only this popover and
    // doesn't bubble to a parent modal's Esc handler.
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); setOpen(false) } }
    document.addEventListener('mousedown', onClick)
    document.addEventListener('keydown', onKey, true)
    return () => {
      document.removeEventListener('mousedown', onClick)
      document.removeEventListener('keydown', onKey, true)
    }
  }, [open])

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 30)
    else setSearch('')
  }, [open])

  // Filter, then bucket into ordered groups.
  const groups = useMemo(() => {
    const q = search.trim().toLowerCase()
    const matched = q
      ? options.filter((o) =>
          o.label.toLowerCase().includes(q) ||
          (o.sub ?? '').toLowerCase().includes(q) ||
          (o.group ?? '').toLowerCase().includes(q))
      : options
    const byGroup = new Map<string, GroupedOption[]>()
    for (const o of matched) {
      const g = o.group?.trim() || 'Other'
      if (!byGroup.has(g)) byGroup.set(g, [])
      byGroup.get(g)!.push(o)
    }
    const rank = (g: string) => {
      const i = groupOrder.findIndex((x) => x.toLowerCase() === g.toLowerCase())
      if (i !== -1) return i
      if (g === 'Other') return 9999
      return 1000 + g.toLowerCase().charCodeAt(0)
    }
    return [...byGroup.entries()]
      .sort((a, b) => rank(a[0]) - rank(b[0]) || a[0].localeCompare(b[0]))
      .map(([name, opts]) => ({ name, opts }))
  }, [options, search, groupOrder])

  const totalShown = groups.reduce((n, g) => n + g.opts.length, 0)
  const hasGroups = groups.length > 1 || (groups[0]?.name && groups[0].name !== 'Other')

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
        disabled={disabled}
        className={`input input-sm w-full text-left flex items-center justify-between gap-1.5 ${disabled ? 'opacity-50 cursor-not-allowed' : ''} ${className}`}
        onClick={() => !disabled && setOpen((v) => !v)}
      >
        <span className={selected ? 'text-ink-900 dark:text-white truncate' : 'text-ink-400 truncate'}>
          {selected
            ? (showSubOnTrigger && selected.sub ? `${selected.label} · ${selected.sub}` : selected.label)
            : placeholder}
        </span>
        <ChevronDown className={`w-3.5 h-3.5 text-ink-400 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && coords && createPortal(
        <div
          ref={popRef}
          role="listbox"
          style={{ position: 'fixed', left: coords.left, width: coords.width, zIndex: 1100, ...(coords.top != null ? { top: coords.top } : { bottom: coords.bottom }) }}
          className="bg-white dark:bg-ink-900 border border-ink-200 dark:border-ink-700 rounded-lg shadow-2xl overflow-hidden"
        >
          <div className="p-1.5 border-b border-ink-100 dark:border-ink-700">
            <div className="relative">
              <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-400" />
              <input
                ref={inputRef}
                type="text"
                className="input input-sm pl-7 w-full"
                placeholder="Search…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
          </div>

          <div className="overflow-y-auto py-0.5" style={{ maxHeight: coords.listMax }}>
            {allLabel && (
              <button
                type="button"
                className={`w-full text-left px-3 py-1.5 text-[12.5px] transition-colors ${
                  value === '' || value === 0
                    ? 'bg-brand/10 text-brand dark:text-gold-400 font-semibold'
                    : 'hover:bg-ink-50 dark:hover:bg-ink-700/30 text-ink-600 dark:text-ink-300'
                }`}
                onClick={() => { onChange(''); setOpen(false) }}
              >
                {allLabel}
              </button>
            )}

            {totalShown === 0 ? (
              <p className="p-3 text-center text-ink-400 text-[12px]">No matches.</p>
            ) : (
              groups.map((g) => (
                <div key={g.name}>
                  {hasGroups && (
                    <div className="sticky top-0 px-3 py-1 bg-ink-50/95 dark:bg-ink-800/95 backdrop-blur text-[10px] font-bold uppercase tracking-wider text-ink-400 border-y border-ink-100 dark:border-ink-700/60">
                      {g.name}
                      <span className="ml-1.5 font-normal normal-case tracking-normal text-ink-300">{g.opts.length}</span>
                    </div>
                  )}
                  {g.opts.map((o) => {
                    const isSel = String(o.value) === String(value)
                    return (
                      <button
                        key={String(o.value)}
                        type="button"
                        role="option"
                        aria-selected={isSel}
                        className={`w-full text-left px-3 py-1.5 text-[12.5px] flex items-center gap-2 transition-colors ${
                          isSel ? 'bg-brand/10 text-brand dark:text-gold-400 font-semibold' : 'hover:bg-ink-50 dark:hover:bg-ink-700/30'
                        }`}
                        onClick={() => { onChange(typeof o.value === 'number' ? o.value : (Number.isNaN(Number(o.value)) ? '' : Number(o.value))); setOpen(false) }}
                      >
                        <span className="truncate flex-1">{o.label}</span>
                        {o.sub && <span className="text-[10.5px] text-ink-400 whitespace-nowrap">{o.sub}</span>}
                        {isSel && <Check className="w-3.5 h-3.5 shrink-0" />}
                      </button>
                    )
                  })}
                </div>
              ))
            )}
          </div>
        </div>,
        document.body,
      )}
    </>
  )
}
