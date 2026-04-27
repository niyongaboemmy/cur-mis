import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { Loader2 } from 'lucide-react'
import toast from 'react-hot-toast'
import { ledgerService } from '@/services/financeService'
import SearchableSelect from '@/components/ui/SearchableSelect'

interface Props {
  studentId:      string
  years:          any[]
  defaultYearId?: number
  onClose:        () => void
  onDone:         () => void
}

export default function GenerateInvoicesModal({ studentId, years, defaultYearId, onClose, onDone }: Props) {
  const [yearId,   setYearId]   = useState(defaultYearId ?? 0)
  const [semester, setSemester] = useState<number | ''>('')

  const yearOptions = years.map((y: any) => ({ value: y.id, label: y.label }))

  const mutation = useMutation({
    mutationFn: () =>
      ledgerService.generateInvoices(studentId, {
        academic_year_id: yearId,
        semester: semester ? (semester as 1 | 2) : undefined,
      }),
    onSuccess: (res) => {
      const r = res.data
      toast.success(`${r?.created ?? 0} invoice(s) created, ${r?.skipped ?? 0} skipped.`)
      onDone()
    },
    onError: (e: any) => toast.error(e?.response?.data?.message ?? 'Generation failed'),
  })

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black/50">
      <div className="flex min-h-full items-center justify-center p-4">
        <div className="bg-white dark:bg-ink-800 rounded-xl shadow-xl w-full max-w-sm p-6 space-y-4">
          <h3 className="text-base font-semibold">Generate Invoices</h3>
          <p className="text-sm text-ink-500">
            Auto-identify all applicable fees for student <span className="font-mono font-semibold">{studentId}</span>.
          </p>

          <div className="space-y-3 text-sm">
            <div>
              <label className="block text-xs text-ink-500 mb-1">Academic Year *</label>
              <SearchableSelect
                options={yearOptions}
                value={yearId}
                onChange={v => setYearId(Number(v))}
                placeholder="Select year…"
              />
            </div>

            <div>
              <label className="block text-xs text-ink-500 mb-1">Semester (optional)</label>
              <SearchableSelect
                options={[
                  { value: 1, label: 'Semester 1' },
                  { value: 2, label: 'Semester 2' },
                ]}
                value={semester}
                onChange={v => setSemester(v ? Number(v) : '')}
                placeholder="Full year"
                allLabel="Full year"
              />
            </div>
          </div>

          <p className="text-xs text-ink-400 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 rounded p-2">
            This will create tuition, registration, repeat-module, and arrears invoices as applicable.
            Existing invoices for the same type/year will be skipped.
          </p>

          <div className="flex gap-2 justify-end">
            <button className="btn-ghost btn-sm" onClick={onClose}>Cancel</button>
            <button
              className="btn-primary btn-sm"
              onClick={() => mutation.mutate()}
              disabled={mutation.isPending || !yearId}
            >
              {mutation.isPending && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              Generate
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
