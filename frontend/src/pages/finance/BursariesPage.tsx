import { useEffect, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, Trash2, Loader2, X } from 'lucide-react'
import toast from 'react-hot-toast'
import { bursaryService } from '@/services/financeService'
import { academicService } from '@/services/academicService'
import type { FeeBursary, CreateBursaryPayload } from '@/types/finance'
import Pagination from '@/components/ui/Pagination'
import StudentSearchSelect from '@/components/finance/StudentSearchSelect'
import SearchableSelect from '@/components/ui/SearchableSelect'
import { useSystemStore } from '@/store/systemStore'

import { formatRWF } from '@/utils/formatCurrency'

const BURSARY_TYPES = [
  'Government Scholarship',
  'University Grant',
  'Church/Diocese Sponsorship',
  'Corporate Sponsorship',
  'Merit-Based Award',
  'Hardship Grant',
  'Other',
]

const PER_PAGE = 15

export default function BursariesPage() {
  const qc = useQueryClient()
  const basics = useSystemStore((s) => s.basics)
  const selectedYearLabel = useSystemStore((s) => s.selectedYearLabel)

  const [yearId, setYearId]   = useState<number | string>('')
  const [studentId, setStudentId] = useState('')
  const [page, setPage]       = useState(1)
  const [showForm, setShowForm] = useState(false)
  const [viewingBursary, setViewingBursary] = useState<FeeBursary | null>(null)

  // Sync with global academic year
  useEffect(() => {
    if (selectedYearLabel) {
      const year = basics?.years?.find((y) => y.label === selectedYearLabel);
      if (year) {
        setYearId(year.id);
      }
    } else {
      // Fallback to active year if "All years" is selected but we need a default
      const active = basics?.active_year as any;
      if (active?.id) setYearId(active.id);
    }
  }, [selectedYearLabel, basics?.years]);


  const yearsQ = useQuery({
    queryKey: ['academic-years'],
    queryFn: () => academicService.listYears(),
  })
  const years = yearsQ.data?.data ?? []
  const yearOptions = years.map((y: any) => ({ value: y.id, label: y.label }))

  const bursariesQ = useQuery({
    queryKey: ['finance', 'bursaries', yearId, studentId, page],
    queryFn: () => bursaryService.list({
      ...(yearId  ? { academic_year_id: Number(yearId) } : {}),
      ...(studentId ? { student_id: studentId } : {}),
      page,
      per_page: PER_PAGE,
    }),
  })

  const paginatedData = bursariesQ.data?.data
  const rows: FeeBursary[] = (paginatedData as any)?.data ?? []
  const total     = (paginatedData as any)?.total     ?? 0
  const lastPage  = (paginatedData as any)?.last_page ?? 1
  const currentPg = (paginatedData as any)?.current_page ?? 1

  const deleteMutation = useMutation({
    mutationFn: (id: number) => bursaryService.delete(id),
    onSuccess: () => {
      toast.success('Bursary removed')
      qc.invalidateQueries({ queryKey: ['finance', 'bursaries'] })
    },
    onError: (e: any) => toast.error(e?.response?.data?.message ?? 'Delete failed'),
  })

  const confirmMutation = useMutation({
    mutationFn: (id: number) => bursaryService.confirm(id),
    onSuccess: () => {
      toast.success('Bursary confirmed and applied')
      qc.invalidateQueries({ queryKey: ['finance', 'bursaries'] })
      setViewingBursary(null)
    },
    onError: (e: any) => toast.error(e?.response?.data?.message ?? 'Confirmation failed'),
  })

  const handleStudentChange = (regnum: string) => {
    setStudentId(regnum)
    setPage(1)
  }

  return (
    <div className="space-y-4 animate-fade-in">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-lg font-bold text-ink-900 dark:text-white">Bursary Management</h2>
          <p className="text-[13px] text-ink-500">Allocate scholarships and bursaries to students.</p>
        </div>
        <button className="btn-primary btn-sm" onClick={() => setShowForm(true)}>
          <Plus className="w-3.5 h-3.5" /> Allocate bursary
        </button>
      </div>

      {/* Filters */}
      <div className="card p-3 flex gap-3 items-end flex-wrap">
        <div className="min-w-[180px]">
          <label className="block text-xs text-ink-500 mb-1">Academic Year</label>
          <SearchableSelect
            options={yearOptions}
            value={yearId}
            onChange={v => { setYearId(v); setPage(1) }}
            placeholder="All years"
            allLabel="All years"
          />
        </div>
        <div className="flex-1 min-w-[220px]">
          <label className="block text-xs text-ink-500 mb-1">Student</label>
          <StudentSearchSelect
            value={studentId}
            onChange={handleStudentChange}
            placeholder="Filter by student…"
          />
        </div>
      </div>

      {/* Table */}
      <div className="card overflow-hidden">
        {bursariesQ.isLoading && (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-5 h-5 animate-spin text-brand" />
          </div>
        )}
        {!bursariesQ.isLoading && rows.length === 0 && (
          <p className="text-center py-10 text-ink-400 text-sm">No bursaries found.</p>
        )}
        {rows.length > 0 && (
          <>
            <table className="w-full text-sm">
              <thead className="bg-ink-50 dark:bg-ink-700/50 text-ink-500 text-xs uppercase">
                <tr>
                  <th className="px-4 py-2.5 text-left">Student</th>
                  <th className="px-4 py-2.5 text-left">Bursary Type</th>
                  <th className="px-4 py-2.5 text-left">Academic Year</th>
                  <th className="px-4 py-2.5 text-right">Amount (RWF)</th>
                  <th className="px-4 py-2.5 text-right">Coverage %</th>
                  <th className="px-4 py-2.5 text-left">Approved By</th>
                  <th className="px-4 py-2.5 text-left">Status</th>
                  <th className="px-4 py-2.5 text-left">Date</th>
                  <th className="px-4 py-2.5" />
                </tr>
              </thead>
              <tbody className="divide-y divide-ink-100 dark:divide-ink-700">
                {rows.map((b: FeeBursary) => (
                  <tr
                    key={b.id}
                    className="hover:bg-ink-50/50 dark:hover:bg-ink-700/30 cursor-pointer"
                    onClick={() => setViewingBursary(b)}
                  >
                    <td className="px-4 py-2.5">
                      <p className="font-medium">{b.student_fname} {b.student_lname}</p>
                      <p className="text-xs text-ink-400 font-mono">{b.student_id}</p>
                    </td>
                    <td className="px-4 py-2.5">{b.bursary_type}</td>
                    <td className="px-4 py-2.5 text-ink-500">{b.academic_year_label ?? '—'}</td>
                    <td className="px-4 py-2.5 text-right font-mono font-semibold text-blue-600">{formatRWF(b.amount)}</td>
                    <td className="px-4 py-2.5 text-right">
                      {b.coverage_pct != null ? (
                        <div className="flex items-center justify-end gap-2">
                          <div className="w-16 h-1.5 bg-ink-200 dark:bg-ink-600 rounded-full overflow-hidden shrink-0">
                            <div
                              className="h-full bg-blue-500 rounded-full"
                              style={{ width: `${Math.min(b.coverage_pct, 100)}%` }}
                            />
                          </div>
                          <span className="text-xs font-semibold text-blue-600 tabular-nums w-9 text-right">{b.coverage_pct}%</span>
                        </div>
                      ) : '—'}
                    </td>
                    <td className="px-4 py-2.5 text-ink-500">{b.approved_by_name ?? '—'}</td>
                    <td className="px-4 py-2.5">
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                        b.status === 'confirmed' ? 'bg-green-100 text-green-700' : 
                        b.status === 'pending' ? 'bg-yellow-100 text-yellow-700' : 
                        'bg-red-100 text-red-700'
                      }`}>
                        {b.status}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-ink-500 text-xs">{b.created_at ? new Date(b.created_at).toLocaleDateString() : '—'}</td>
                    <td className="px-4 py-2.5" onClick={e => e.stopPropagation()}>
                      <button
                        className="btn-ghost btn-xs text-red-500"
                        onClick={() => { if (confirm('Remove this bursary?')) deleteMutation.mutate(b.id) }}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {lastPage > 1 && (
              <div className="px-4 py-3 border-t border-ink-100 dark:border-ink-700">
                <Pagination
                  currentPage={currentPg}
                  lastPage={lastPage}
                  total={total}
                  perPage={PER_PAGE}
                  onPageChange={setPage}
                />
              </div>
            )}
          </>
        )}
      </div>

      {showForm && (
        <BursaryModal
          years={years}
          defaultYearId={yearId ? Number(yearId) : (basics?.active_year as any)?.id}

          onClose={() => setShowForm(false)}
          onSaved={() => {
            setShowForm(false)
            qc.invalidateQueries({ queryKey: ['finance', 'bursaries'] })
          }}
        />
      )}

      {viewingBursary && (
        <BursaryDetailModal
          bursary={viewingBursary}
          confirming={confirmMutation.isPending}
          onClose={() => setViewingBursary(null)}
          onConfirm={() => confirmMutation.mutate(viewingBursary.id)}
          onDelete={() => {
            if (confirm('Remove this bursary?')) {
              deleteMutation.mutate(viewingBursary.id)
              setViewingBursary(null)
            }
          }}
        />
      )}
    </div>
  )
}

// ─── Bursary Detail Modal ─────────────────────────────────────────────────────

function BursaryDetailModal({ bursary: b, confirming, onClose, onConfirm, onDelete }: {
  bursary:    FeeBursary
  confirming: boolean
  onClose:   () => void
  onConfirm: () => void
  onDelete:  () => void
}) {
  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black/50">
      <div className="flex min-h-full items-center justify-center p-4">
        <div className="bg-white dark:bg-ink-800 rounded-xl shadow-xl w-full max-w-sm p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-base font-semibold">Bursary Details</h3>
            <button className="btn-ghost btn-xs" onClick={onClose}><X className="w-4 h-4" /></button>
          </div>

          <div className="space-y-2 text-sm">
            <BRow label="Student"       value={<span>{b.student_fname} {b.student_lname}<span className="ml-2 text-xs font-mono text-ink-400">{b.student_id}</span></span>} />
            <BRow label="Bursary Type"  value={b.bursary_type} />
            <BRow label="Academic Year" value={b.academic_year_label ?? '—'} />
            <BRow label="Approved By"   value={b.approved_by_name ?? '—'} />
            <BRow label="Status"        value={
              <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                b.status === 'confirmed' ? 'bg-green-100 text-green-700' : 
                b.status === 'pending' ? 'bg-yellow-100 text-yellow-700' : 
                'bg-red-100 text-red-700'
              }`}>
                {b.status}
              </span>
            } />
            {b.status === 'confirmed' && <BRow label="Confirmed By" value={b.confirmed_by_name ?? '—'} />}
            {b.status === 'confirmed' && <BRow label="Confirmed At" value={b.confirmed_at ? new Date(b.confirmed_at).toLocaleDateString() : '—'} />}
            <BRow label="Created At"    value={b.created_at ? new Date(b.created_at).toLocaleDateString() : '—'} />
            {b.notes && <BRow label="Notes" value={b.notes} />}
          </div>

          <div className="bg-ink-50 dark:bg-ink-700/40 rounded-lg p-3 space-y-1.5 text-sm">
            <div className="flex justify-between">
              <span className="text-ink-500">Amount</span>
              <span className="font-mono font-bold text-blue-600">{formatRWF(b.amount)}</span>
            </div>
            {b.coverage_pct != null && (
              <div className="space-y-1">
                <div className="flex justify-between">
                  <span className="text-ink-500">Coverage</span>
                  <span className="font-semibold text-blue-600">{b.coverage_pct}%</span>
                </div>
                <div className="h-2 bg-ink-200 dark:bg-ink-600 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-blue-500 rounded-full transition-all"
                    style={{ width: `${Math.min(b.coverage_pct, 100)}%` }}
                  />
                </div>
              </div>
            )}
          </div>

          {b.status === 'pending' && (
            <div className="bg-blue-50 dark:bg-blue-900/20 p-3 rounded-lg border border-blue-100 dark:border-blue-800">
              <p className="text-xs text-blue-700 dark:text-blue-400 mb-2">
                This bursary is currently pending. Confirming receipt will apply the credit to the student's invoices.
              </p>
              <button 
                className="btn-primary btn-sm w-full"
                onClick={onConfirm}
                disabled={confirming}
              >
                {confirming ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'Confirm Receipt & Apply'}
              </button>
            </div>
          )}

          <div className="flex gap-2 justify-end pt-1">
            <button className="btn-ghost btn-sm text-red-500" onClick={onDelete}>
              <Trash2 className="w-3.5 h-3.5" /> Remove
            </button>
            <button className="btn-ghost btn-sm" onClick={onClose}>Close</button>
          </div>
        </div>
      </div>
    </div>
  )
}

function BRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-4">
      <span className="text-ink-500 shrink-0">{label}</span>
      <span className="text-right font-medium text-ink-800 dark:text-ink-100">{value}</span>
    </div>
  )
}

// ─── Allocate Modal ───────────────────────────────────────────────────────────

function BursaryModal({ years, defaultYearId, onClose, onSaved }: {
  years:          any[]
  defaultYearId?: number
  onClose:        () => void
  onSaved:        () => void
}) {
  const [form, setForm] = useState<CreateBursaryPayload>({
    student_id:       '',
    academic_year_id: defaultYearId ?? 0,
    bursary_type:     BURSARY_TYPES[0],
    amount:           0,
    coverage_pct:     null,
    notes:            '',
    status:           'pending',
  })

  const yearOptions = years.map((y: any) => ({ value: y.id, label: y.label }))

  const set = (k: keyof typeof form, v: any) => setForm((f: any) => ({ ...f, [k]: v }))

  const mutation = useMutation({
    mutationFn: () => bursaryService.create(form),
    onSuccess: () => {
      toast.success('Bursary allocated')
      onSaved()
    },
    onError: (e: any) => toast.error(e?.response?.data?.message ?? 'Save failed'),
  })

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black/50">
      <div className="flex min-h-full items-center justify-center p-4">
        <div className="bg-white dark:bg-ink-800 rounded-xl shadow-xl w-full max-w-sm p-6 space-y-4">
          <h3 className="text-base font-semibold">Allocate Bursary</h3>

          <div className="space-y-3 text-sm">
            <div>
              <label className="block text-xs text-ink-500 mb-1">Student *</label>
              <StudentSearchSelect
                value={form.student_id}
                onChange={regnum => set('student_id', regnum)}
                placeholder="Search student by name or reg…"
              />
            </div>

            <div>
              <label className="block text-xs text-ink-500 mb-1">Academic Year *</label>
              <SearchableSelect
                options={yearOptions}
                value={form.academic_year_id}
                onChange={v => set('academic_year_id', Number(v))}
                placeholder="Select year…"
              />
            </div>

            <div>
              <label className="block text-xs text-ink-500 mb-1">Bursary Type *</label>
              <SearchableSelect
                options={BURSARY_TYPES.map(t => ({ value: t, label: t }))}
                value={form.bursary_type}
                onChange={v => set('bursary_type', String(v))}
                placeholder="Select type…"
              />
            </div>

            <div>
              <label className="block text-xs text-ink-500 mb-1">Amount (RWF) *</label>
              <input type="number" className="input input-sm w-full" value={form.amount} onChange={e => set('amount', Number(e.target.value))} />
            </div>

            <div>
              <label className="block text-xs text-ink-500 mb-1">Coverage % (optional)</label>
              <input type="number" className="input input-sm w-full" value={form.coverage_pct ?? ''} min={0} max={100} onChange={e => set('coverage_pct', e.target.value ? Number(e.target.value) : null)} placeholder="e.g. 50" />
            </div>

            <div>
              <label className="block text-xs text-ink-500 mb-1">Notes (optional)</label>
              <textarea className="input input-sm w-full resize-none" rows={2} value={form.notes ?? ''} onChange={e => set('notes', e.target.value)} />
            </div>

            <div>
              <label className="block text-xs text-ink-500 mb-1">Status</label>
              <div className="flex gap-2">
                <button 
                  className={`flex-1 btn btn-xs py-2 ${form.status === 'pending' ? 'btn-primary' : 'btn-ghost'}`}
                  onClick={() => set('status', 'pending')}
                >
                  Pending
                </button>
                <button 
                  className={`flex-1 btn btn-xs py-2 ${form.status === 'confirmed' ? 'btn-primary' : 'btn-ghost'}`}
                  onClick={() => set('status', 'confirmed')}
                >
                  Confirmed
                </button>
              </div>
              <p className="text-[10px] text-ink-400 mt-1">
                {form.status === 'pending' 
                  ? 'Will not affect student balance until confirmed.' 
                  : 'Will be applied immediately to student invoices.'}
              </p>
            </div>
          </div>

          <div className="flex gap-2 justify-end pt-2">
            <button className="btn-ghost btn-sm" onClick={onClose}>Cancel</button>
            <button
              className="btn-primary btn-sm"
              onClick={() => mutation.mutate()}
              disabled={mutation.isPending || !form.student_id || !form.academic_year_id || !form.amount}
            >
              {mutation.isPending && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              Allocate
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
