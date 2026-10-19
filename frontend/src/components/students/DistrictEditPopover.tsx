import { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { Loader2, Check } from 'lucide-react'
import { studentService } from '@/services/studentService'
import { DISTRICTS, PROVINCES } from '@/data/rwandaLocations'

/**
 * Inline district picker, opened from the District cell in the students table.
 * Lists the 30 districts grouped by province. Picking one saves straight away
 * and also sets the province, so the two columns never disagree.
 */

interface Props {
  studentId: number
  currentDistrict: string | null | undefined
  anchorRect: DOMRect
  onClose: () => void
}

export default function DistrictEditPopover({ studentId, currentDistrict, anchorRect, onClose }: Props) {
  const qc = useQueryClient()
  const popRef = useRef<HTMLDivElement>(null)
  const current = (currentDistrict ?? '').trim().toLowerCase()

  const save = useMutation({
    mutationFn: (district: string) => {
      const province = PROVINCES.find((p) => DISTRICTS[p].includes(district)) ?? null
      return studentService.update(studentId, { district, province })
    },
    onSuccess: (_data, district) => {
      toast.success(`District set to ${district}.`)
      qc.invalidateQueries({ queryKey: ['students'] })
      onClose()
    },
    onError: (e: any) => {
      const errs = e?.response?.data?.errors as Record<string, string[]> | undefined
      const first = errs ? Object.values(errs)[0]?.[0] : undefined
      toast.error(first ?? e?.response?.data?.message ?? 'Could not update district.')
    },
  })

  // Close on outside click / Escape.
  useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      if (popRef.current && !popRef.current.contains(e.target as Node)) onClose()
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('mousedown', onDocClick)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDocClick)
      document.removeEventListener('keydown', onKey)
    }
  }, [onClose])

  const top = anchorRect.bottom + 6 + window.scrollY
  const left = Math.min(anchorRect.left + window.scrollX, window.innerWidth - 232)

  return createPortal(
    <div
      ref={popRef}
      style={{ position: 'absolute', top, left }}
      className="z-50 w-56 rounded-xl border border-ink-100 dark:border-ink-800 bg-white dark:bg-ink-900 shadow-xl py-1.5 animate-in fade-in zoom-in-95 duration-100"
      role="menu"
    >
      <p className="px-3 pb-1 pt-0.5 text-[10.5px] font-semibold uppercase tracking-wide text-ink-400">
        Set district
      </p>
      <div className="max-h-72 overflow-y-auto">
        {PROVINCES.map((province) => (
          <div key={province}>
            <p className="px-3 pt-2 pb-0.5 text-[10.5px] font-semibold uppercase tracking-wide text-ink-400">
              {province}
            </p>
            {DISTRICTS[province].map((district) => {
              const active = district.toLowerCase() === current
              const saving = save.isPending && save.variables === district
              return (
                <button
                  key={district}
                  type="button"
                  role="menuitem"
                  disabled={save.isPending}
                  onClick={() => !active && save.mutate(district)}
                  className="w-full flex items-center justify-between gap-2 px-3 py-1.5 text-[13px] text-ink-700 dark:text-ink-200 hover:bg-ink-50 dark:hover:bg-ink-800/60 disabled:cursor-default transition-colors"
                >
                  <span>{district}</span>
                  {saving && <Loader2 className="w-3.5 h-3.5 animate-spin text-brand" />}
                  {!saving && active && <Check className="w-3.5 h-3.5 text-brand" />}
                </button>
              )
            })}
          </div>
        ))}
      </div>
    </div>,
    document.body,
  )
}
