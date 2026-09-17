import { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { Loader2, Check } from 'lucide-react'
import { studentService } from '@/services/studentService'

/**
 * Quick inline editor for a student's gender, opened by clicking the Gender
 * chip in the students table. Saves immediately on pick (no separate Save
 * step) — the table's `gender` column is a free varchar, so we normalise to
 * single-letter M/F on the way out (StudentController::update accepts both).
 */

const OPTIONS: ReadonlyArray<{ value: string; label: string }> = [
  { value: 'M', label: 'Male' },
  { value: 'F', label: 'Female' },
]

interface Props {
  studentId: number
  currentGender: string | null | undefined
  anchorRect: DOMRect
  onClose: () => void
}

export default function GenderEditPopover({ studentId, currentGender, anchorRect, onClose }: Props) {
  const qc = useQueryClient()
  const popRef = useRef<HTMLDivElement>(null)
  const normalizedCurrent = currentGender ? currentGender.slice(0, 1).toUpperCase() : null

  const save = useMutation({
    mutationFn: (gender: string) => studentService.update(studentId, { gender }),
    onSuccess: (_data, gender) => {
      const label = OPTIONS.find((o) => o.value === gender)?.label ?? gender
      toast.success(`Gender updated to ${label}.`)
      qc.invalidateQueries({ queryKey: ['students'] })
      onClose()
    },
    onError: (e: any) => {
      const errs = e?.response?.data?.errors as Record<string, string[]> | undefined
      const first = errs ? Object.values(errs)[0]?.[0] : undefined
      toast.error(first ?? e?.response?.data?.message ?? 'Could not update gender.')
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
  const left = Math.min(anchorRect.left + window.scrollX, window.innerWidth - 176)

  return createPortal(
    <div
      ref={popRef}
      style={{ position: 'absolute', top, left }}
      className="z-50 w-44 rounded-xl border border-ink-100 dark:border-ink-800 bg-white dark:bg-ink-900 shadow-xl py-1.5 animate-in fade-in zoom-in-95 duration-100"
      role="menu"
    >
      <p className="px-3 pb-1 pt-0.5 text-[10.5px] font-semibold uppercase tracking-wide text-ink-400">
        Set gender
      </p>
      {OPTIONS.map((o) => {
        const active = o.value === normalizedCurrent
        const saving = save.isPending && save.variables === o.value
        return (
          <button
            key={o.value}
            type="button"
            role="menuitem"
            disabled={save.isPending}
            onClick={() => o.value !== normalizedCurrent && save.mutate(o.value)}
            className="w-full flex items-center justify-between gap-2 px-3 py-1.5 text-[13px] text-ink-700 dark:text-ink-200 hover:bg-ink-50 dark:hover:bg-ink-800/60 disabled:cursor-default transition-colors"
          >
            <span className="flex items-center gap-2">
              <span className="chip-soft uppercase w-5 h-5 flex items-center justify-center text-[10.5px]">
                {o.value}
              </span>
              {o.label}
            </span>
            {saving && <Loader2 className="w-3.5 h-3.5 animate-spin text-brand" />}
            {!saving && active && <Check className="w-3.5 h-3.5 text-brand" />}
          </button>
        )
      })}
    </div>,
    document.body,
  )
}
