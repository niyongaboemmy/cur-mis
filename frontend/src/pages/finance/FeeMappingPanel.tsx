import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Settings2, Info, Save, ToggleLeft, ToggleRight, AlertCircle, CheckCircle2 } from 'lucide-react'
import toast from 'react-hot-toast'
import { systemService, type FeeStructureOption } from '@/services/systemService'
import { formatRWF } from '@/utils/formatCurrency'

// ── FeeMappingPanel ────────────────────────────────────────────────────────────
//
// Admin panel: pick a fee structure (which already has type + amount) to map
// application fee payments to. Rendered at the top of FeeTypesPage.

interface FormState {
  application_fee_mapped_fee_structure_id: number   // 0 = no mapping
  application_fee_credit_on_enrollment:    boolean
}

export default function FeeMappingPanel() {
  const qc = useQueryClient()

  const { data: res, isLoading, isError } = useQuery({
    queryKey: ['system', 'fee-mapping'],
    queryFn:  ({ signal }) => systemService.getFeeMappingSettings(signal),
  })

  const settings      = res?.data?.settings
  const feeStructures = res?.data?.fee_structures ?? []

  const [form, setForm] = useState<FormState>({
    application_fee_mapped_fee_structure_id: 0,
    application_fee_credit_on_enrollment:    true,
  })
  const [dirty, setDirty] = useState(false)

  useEffect(() => {
    if (!settings) return
    setForm({
      application_fee_mapped_fee_structure_id: Number(settings.application_fee_mapped_fee_structure_id) || 0,
      application_fee_credit_on_enrollment:    settings.application_fee_credit_on_enrollment === '1',
    })
    setDirty(false)
  }, [settings])

  const saveMut = useMutation({
    mutationFn: () =>
      systemService.saveFeeMappingSettings({
        application_fee_mapped_fee_structure_id: form.application_fee_mapped_fee_structure_id,
        application_fee_credit_on_enrollment:    form.application_fee_credit_on_enrollment ? 1 : 0,
      }),
    onSuccess: () => {
      toast.success('Fee mapping settings saved.')
      qc.invalidateQueries({ queryKey: ['system', 'fee-mapping'] })
      qc.invalidateQueries({ queryKey: ['portal', 'application-fee'] })
      setDirty(false)
    },
    onError: (e: any) => {
      toast.error(e?.response?.data?.message ?? 'Failed to save settings.')
    },
  })

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((f) => ({ ...f, [key]: value }))
    setDirty(true)
  }

  // Group structures by academic year for <optgroup>
  const yearGroups: Record<string, FeeStructureOption[]> = {}
  for (const fs of feeStructures) {
    if (!yearGroups[fs.year_label]) yearGroups[fs.year_label] = []
    yearGroups[fs.year_label].push(fs)
  }

  // Selected structure details
  const selectedStructure = feeStructures.find(
    (fs) => fs.id === form.application_fee_mapped_fee_structure_id
  )

  return (
    <div className="card p-5 space-y-5">
      {/* Header */}
      <div className="flex items-start gap-3">
        <div className="w-9 h-9 rounded-lg bg-brand/10 flex items-center justify-center flex-shrink-0">
          <Settings2 className="w-4.5 h-4.5 text-brand" />
        </div>
        <div>
          <h3 className="font-semibold text-ink-900 dark:text-ink-100 text-sm">
            Application Fee Mapping
          </h3>
          <p className="text-xs text-ink-500 dark:text-ink-400 mt-0.5">
            Select a fee structure to receive application fee payments when an applicant enrolls.
            The amount is taken directly from the chosen structure.
          </p>
        </div>
      </div>

      {isLoading && (
        <div className="text-xs text-ink-400 animate-pulse py-2">Loading settings…</div>
      )}

      {isError && (
        <div className="flex items-center gap-2 text-red-500 text-xs">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          Failed to load fee mapping settings.
        </div>
      )}

      {!isLoading && !isError && (
        <div className="space-y-4">
          {/* Fee Structure Dropdown */}
          <div className="space-y-1.5">
            <label className="block text-xs font-medium text-ink-700 dark:text-ink-300">
              Mapped Fee Structure
            </label>
            <select
              value={form.application_fee_mapped_fee_structure_id}
              onChange={(e) => set('application_fee_mapped_fee_structure_id', Number(e.target.value))}
              className="input w-full text-sm"
            >
              <option value={0}>— No mapping (disable auto-credit) —</option>
              {Object.entries(yearGroups).map(([yearLabel, structs]) => (
                <optgroup key={yearLabel} label={yearLabel}>
                  {structs.map((fs) => (
                    <option key={fs.id} value={fs.id}>
                      {fs.label || (fs.fee_type_label ?? fs.fee_type)}
                      {' — '}
                      {new Intl.NumberFormat('en-US').format(Number(fs.amount))} RWF
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
            <p className="flex items-start gap-1.5 text-[11px] text-ink-400 dark:text-ink-500">
              <Info className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
              The application fee payment will be credited to the student invoice matching this
              fee structure when they enroll. Leave blank to disable automatic crediting.
            </p>
          </div>

          {/* Selected structure preview */}
          {selectedStructure ? (
            <div className="flex items-start gap-3 rounded-lg border border-emerald-200 dark:border-emerald-800
                            bg-emerald-50 dark:bg-emerald-900/20 px-4 py-3">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 mt-0.5 flex-shrink-0" />
              <div className="text-[12px] leading-relaxed text-emerald-800 dark:text-emerald-300 space-y-0.5">
                <p className="font-semibold">
                  {selectedStructure.label || selectedStructure.fee_type_label || selectedStructure.fee_type}
                  {' · '}
                  {selectedStructure.year_label}
                </p>
                <p>
                  Fee type: <strong>{selectedStructure.fee_type_label ?? selectedStructure.fee_type}</strong>
                  {' · '}
                  Amount charged to applicants:{' '}
                  <strong>{formatRWF(Number(selectedStructure.amount))}</strong>
                </p>
                <p className="text-emerald-600 dark:text-emerald-400 text-[11px]">
                  This amount is taken directly from the fee structure — no manual input needed.
                  Update it in <strong>Fee Rates</strong> to change what applicants are charged.
                </p>
              </div>
            </div>
          ) : (
            form.application_fee_mapped_fee_structure_id === 0 && !isLoading && (
              <div className="flex items-start gap-2 rounded-lg border border-amber-200 dark:border-amber-800
                              bg-amber-50 dark:bg-amber-900/20 px-4 py-3 text-[11px] text-amber-700 dark:text-amber-400">
                <AlertCircle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
                No fee structure mapped. Application fees will not be automatically credited to
                student invoices. Select a fee structure above to enable auto-crediting.
              </div>
            )
          )}

          {/* Auto-credit toggle */}
          <div className="flex items-start justify-between gap-4 rounded-lg border border-ink-200 dark:border-ink-700 p-3">
            <div className="space-y-0.5">
              <p className="text-sm font-medium text-ink-800 dark:text-ink-200">
                Auto-credit on enrollment
              </p>
              <p className="text-[11px] text-ink-500 dark:text-ink-400 leading-snug max-w-md">
                When <strong>ON</strong>, the application fee is automatically credited to the
                student's{' '}
                {selectedStructure
                  ? <><strong>{selectedStructure.fee_type_label ?? selectedStructure.fee_type}</strong> invoice</>
                  : 'mapped fee invoice'
                }{' '}
                the moment they enroll.
                When <strong>OFF</strong>, the payment is recorded for reporting only.
              </p>
            </div>
            <button
              type="button"
              onClick={() => set('application_fee_credit_on_enrollment', !form.application_fee_credit_on_enrollment)}
              className={`flex-shrink-0 transition-colors ${form.application_fee_credit_on_enrollment ? 'text-brand' : 'text-ink-400'}`}
            >
              {form.application_fee_credit_on_enrollment
                ? <ToggleRight className="w-8 h-8" />
                : <ToggleLeft  className="w-8 h-8" />
              }
            </button>
          </div>

          {/* Save button */}
          <div className="flex justify-end pt-1">
            <button
              onClick={() => saveMut.mutate()}
              disabled={!dirty || saveMut.isPending}
              className="btn-primary flex items-center gap-2 text-sm px-4 py-2 disabled:opacity-50"
            >
              <Save className="w-3.5 h-3.5" />
              {saveMut.isPending ? 'Saving…' : 'Save Settings'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
