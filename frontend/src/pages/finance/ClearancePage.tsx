import { useEffect, useState } from 'react'
import { useQuery, useMutation } from '@tanstack/react-query'
import { ShieldCheck, ShieldX, ShieldAlert, Loader2, Download, RefreshCw } from 'lucide-react'
import toast from 'react-hot-toast'
import { clearanceService } from '@/services/financeService'
import { academicService } from '@/services/academicService'
import type { StudentClearance, ClearanceStatus } from '@/types/finance'
import { CLEARANCE_STATUS_LABELS, CLEARANCE_STATUS_COLORS } from '@/types/finance'
import StudentSearchSelect from '@/components/finance/StudentSearchSelect'
import SearchableSelect from '@/components/ui/SearchableSelect'
import Pagination from '@/components/ui/Pagination'
import { useSystemStore, selectActiveYear } from '@/store/systemStore'
import { formatRWF } from '@/utils/formatCurrency'

const STATUS_ICON: Record<ClearanceStatus, React.FC<{ className?: string }>> = {
  cleared:     ShieldCheck,
  not_cleared: ShieldX,
  conditional: ShieldAlert,
}

export default function ClearancePage() {
  const activeYear = useSystemStore(selectActiveYear)

  const [tab,        setTab]        = useState<'student' | 'bulk'>('student')
  const [studentId,  setStudentId]  = useState('')
  const [yearId,     setYearId]     = useState<number | string>('')
  const [page,       setPage]       = useState(1)
  const [grantNotes, setGrantNotes] = useState('')
  const [showGrant,  setShowGrant]  = useState(false)

  useEffect(() => { if (activeYear?.id && !yearId) setYearId(activeYear.id) }, [activeYear?.id]) // eslint-disable-line

  const yearsQ = useQuery({ queryKey: ['academic-years'], queryFn: () => academicService.listYears() })
  const years  = yearsQ.data?.data ?? []

  // ─── Student tab ──────────────────────────────────────────────────────────
  const studentQ = useQuery({
    queryKey: ['finance', 'clearance', 'student', studentId, yearId],
    queryFn: () => clearanceService.getStatus(studentId, Number(yearId)),
    enabled: !!studentId && !!yearId,
  })
  const clearance = studentQ.data?.data

  const grantMut = useMutation({
    mutationFn: () => clearanceService.grant({
      student_id: studentId,
      academic_year_id: Number(yearId),
      notes: grantNotes,
    }),
    onSuccess: () => { toast.success('Clearance granted'); studentQ.refetch(); setShowGrant(false) },
    onError: (e: any) => toast.error(e?.response?.data?.message ?? 'Failed'),
  })

  // ─── Bulk tab ─────────────────────────────────────────────────────────────
  const bulkQ = useQuery({
    queryKey: ['finance', 'clearance', 'bulk', yearId, page],
    queryFn: () => clearanceService.getBulk(Number(yearId), { page, per_page: 40 }),
    enabled: tab === 'bulk' && !!yearId,
  })
  const bulkData = bulkQ.data?.data
  const records  = bulkData?.data ?? []

  const bulkRunMut = useMutation({
    mutationFn: () => clearanceService.runBulk(Number(yearId)),
    onSuccess: (res) => {
      toast.success(`${res.data?.cleared} students cleared, ${res.data?.not_cleared} pending`)
      bulkQ.refetch()
    },
    onError: (e: any) => toast.error(e?.response?.data?.message ?? 'Failed'),
  })

  const exportBulkCSV = () => {
    if (!records.length) return
    const rows = [
      ['Reg #', 'Name', 'Department', 'Status', 'Balance at Clearance', 'Cleared By', 'Cleared At', 'Notes'],
      ...records.map(r => [
        r.regnumber ?? r.student_id,
        `${r.fname ?? ''} ${r.lname ?? ''}`.trim(),
        r.department_name ?? '',
        CLEARANCE_STATUS_LABELS[r.status],
        r.balance_at_clearance ?? '',
        r.cleared_by_name ?? '',
        r.cleared_at ?? '',
        r.notes ?? '',
      ]),
    ]
    const csv = rows.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url  = URL.createObjectURL(blob)
    const a    = Object.assign(document.createElement('a'), { href: url, download: `clearance-${yearId}.csv` })
    document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url)
  }

  return (
    <div className="space-y-4 animate-fade-in">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-lg font-bold text-ink-900 dark:text-white">Student Clearance</h2>
          <p className="text-[13px] text-ink-500">Check and manage financial clearance status per student and academic year.</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="card p-2 flex gap-1">
        {(['student', 'bulk'] as const).map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-4 py-2 rounded-md text-sm font-medium transition-colors capitalize ${
              tab === t ? 'bg-brand/10 text-brand dark:bg-brand/25 dark:text-gold-400 font-semibold' : 'text-ink-500 hover:bg-ink-50 dark:hover:bg-ink-700/50'
            }`}>
            {t === 'student' ? 'Individual Student' : 'Bulk View'}
          </button>
        ))}
      </div>

      {/* Year selector (shared) */}
      <div className="card p-3 flex gap-3 flex-wrap items-end">
        <div className="min-w-[200px]">
          <label className="block text-xs text-ink-500 mb-1">Academic Year *</label>
          <SearchableSelect
            options={years.map((y: any) => ({ value: y.id, label: y.label }))}
            value={yearId}
            onChange={v => setYearId(v)}
            placeholder="Select year…"
          />
        </div>
        {tab === 'student' && (
          <div className="flex-1 min-w-[260px]">
            <label className="block text-xs text-ink-500 mb-1">Student</label>
            <StudentSearchSelect value={studentId} onChange={(id) => setStudentId(id)} placeholder="Search student…" />
          </div>
        )}
        {tab === 'bulk' && yearId && (
          <button
            className="btn-secondary btn-sm"
            onClick={() => bulkRunMut.mutate()}
            disabled={bulkRunMut.isPending}
          >
            {bulkRunMut.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
            Run Auto-Clearance
          </button>
        )}
        {tab === 'bulk' && records.length > 0 && (
          <button className="btn-ghost btn-sm" onClick={exportBulkCSV}>
            <Download className="w-3.5 h-3.5" /> Export CSV
          </button>
        )}
      </div>

      {/* ── Student tab content ── */}
      {tab === 'student' && studentId && yearId && (
        studentQ.isLoading ? (
          <div className="flex items-center justify-center py-12"><Loader2 className="w-5 h-5 animate-spin text-brand" /></div>
        ) : (clearance) ? (
          (() => {
            const Icon = STATUS_ICON[clearance.status]
            return (
              <>
                <div className="space-y-4 max-w-lg">
                  <div className="card p-6 text-center space-y-4">
                    <div className="flex justify-center">
                      <div className={`w-16 h-16 rounded-full flex items-center justify-center ${CLEARANCE_STATUS_COLORS[clearance.status]}`}>
                        <Icon className="w-8 h-8" />
                      </div>
                    </div>

                    <div>
                      <p className="text-[11px] uppercase tracking-wider font-semibold text-ink-500">Status</p>
                      <p className="text-xl font-bold">{CLEARANCE_STATUS_LABELS[clearance.status]}</p>
                    </div>

                    <div className="grid grid-cols-2 gap-4 pt-2">
                      <div className="p-3 rounded-lg bg-ink-50 dark:bg-ink-900/50">
                        <p className="text-[10px] uppercase text-ink-400 font-medium">Balance</p>
                        <p className="text-lg font-bold text-red-600">{formatRWF(clearance.balance)}</p>
                      </div>
                      <div className="p-3 rounded-lg bg-ink-50 dark:bg-ink-900/50">
                        <p className="text-[10px] uppercase text-ink-400 font-medium">Threshold</p>
                        <p className="text-lg font-bold text-ink-600 dark:text-ink-200">{formatRWF(clearance.threshold)}</p>
                      </div>
                    </div>

                    {clearance.balance > clearance.threshold && clearance.status === 'not_cleared' && (
                      <div className="p-3 rounded-lg bg-amber-50 dark:bg-amber-900/20 text-amber-800 dark:text-amber-400 text-[12px] text-left border border-amber-200 dark:border-amber-800/50">
                        <strong>Notice:</strong> Student balance exceeds the threshold of {formatRWF(clearance.threshold)}. Manual override or full payment required.
                      </div>
                    )}
                    
                    {clearance.balance <= clearance.threshold && clearance.status === 'not_cleared' && (
                      <div className="p-3 rounded-lg bg-blue-50 dark:bg-blue-900/20 text-blue-800 dark:text-blue-400 text-[12px] text-left border border-blue-200 dark:border-blue-800/50">
                        <strong>Notice:</strong> Student is eligible for auto-clearance as balance is within the threshold of {formatRWF(clearance.threshold)}.
                      </div>
                    )}
                  </div>

                  {clearance.record?.cleared_at && (
                    <div className="card p-4 flex justify-between">
                      <span className="text-ink-500">Cleared At</span>
                      <span className="font-medium">{new Date(clearance.record.cleared_at).toLocaleDateString()}</span>
                    </div>
                  )}
                  
                  {clearance.record?.notes && (
                    <div className="mt-2 p-2 bg-orange-50 dark:bg-orange-900/20 rounded text-xs text-orange-700 dark:text-orange-400">
                      Note: {clearance.record.notes}
                    </div>
                  )}

                  {clearance.status !== 'cleared' && !showGrant && (
                    <button className="btn-secondary btn-sm w-full" onClick={() => setShowGrant(true)}>
                      <ShieldCheck className="w-3.5 h-3.5" /> Grant Conditional Clearance
                    </button>
                  )}

                  {showGrant && (
                    <div className="border border-orange-200 dark:border-orange-800 rounded-lg p-3 space-y-2">
                      <p className="text-sm font-medium text-orange-700 dark:text-orange-400">Grant Conditional Clearance</p>
                      <textarea
                        className="input input-sm w-full"
                        rows={2}
                        placeholder="Reason / authorisation notes (required)…"
                        value={grantNotes}
                        onChange={e => setGrantNotes(e.target.value)}
                      />
                      <div className="flex gap-2 justify-end">
                        <button className="btn-ghost btn-xs" onClick={() => setShowGrant(false)}>Cancel</button>
                        <button
                          className="btn-xs bg-orange-500 hover:bg-orange-600 text-white rounded px-3"
                          onClick={() => grantMut.mutate()}
                          disabled={grantMut.isPending || !grantNotes.trim()}
                        >
                          {grantMut.isPending && <Loader2 className="w-3 h-3 animate-spin" />}
                          Confirm
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </>
            )
          })()
        ) : null
      )}

      {/* ── Bulk tab content ── */}
      {tab === 'bulk' && yearId && (
        <div className="space-y-4">
          <div className="p-3 rounded-lg bg-brand/5 border border-brand/10 text-brand dark:text-gold-400 text-[12px] flex items-center gap-2">
            <RefreshCw className="w-3.5 h-3.5" />
            <span>
              <strong>Note:</strong> Auto-clearance uses the threshold defined in Academic Settings. 
              Currently, students with balance ≤ <strong>{formatRWF(years.find((y: any) => y.id === Number(yearId))?.clearance_threshold ?? 0)}</strong> will be cleared.
            </span>
          </div>
          <div className="card overflow-hidden">
          {bulkQ.isLoading ? (
            <div className="flex items-center justify-center py-12"><Loader2 className="w-5 h-5 animate-spin text-brand" /></div>
          ) : records.length === 0 ? (
            <div className="text-center py-12 text-ink-400 text-sm">
              <p>No clearance records yet for this year.</p>
              <p className="text-xs mt-1">Click "Run Auto-Clearance" to compute for all students.</p>
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-ink-50 dark:bg-ink-700/50 text-ink-500 text-xs uppercase">
                    <tr>
                      <th className="px-4 py-2.5 text-left">Reg #</th>
                      <th className="px-4 py-2.5 text-left">Name</th>
                      <th className="px-4 py-2.5 text-left">Department</th>
                      <th className="px-4 py-2.5 text-right">Balance</th>
                      <th className="px-4 py-2.5 text-center">Status</th>
                      <th className="px-4 py-2.5 text-left">Cleared By</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-ink-100 dark:divide-ink-700">
                    {records.map((r: StudentClearance) => (
                      <tr key={`${r.student_id}-${r.academic_year_id}`} className="hover:bg-ink-50/50 dark:hover:bg-ink-700/30">
                        <td className="px-4 py-2.5 font-mono text-xs">{r.regnumber ?? r.student_id}</td>
                        <td className="px-4 py-2.5 font-medium">{`${r.fname ?? ''} ${r.lname ?? ''}`.trim()}</td>
                        <td className="px-4 py-2.5 text-ink-500 text-xs">{r.department_name ?? '—'}</td>
                        <td className="px-4 py-2.5 text-right font-mono">
                          <span className={Number(r.balance_at_clearance ?? 0) > 0 ? 'text-red-600' : 'text-green-600'}>
                            {formatRWF(r.balance_at_clearance ?? 0)}
                          </span>
                        </td>
                        <td className="px-4 py-2.5 text-center">
                          <span className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full ${CLEARANCE_STATUS_COLORS[r.status]}`}>
                            {CLEARANCE_STATUS_LABELS[r.status]}
                          </span>
                        </td>
                        <td className="px-4 py-2.5 text-ink-400 text-xs">{r.cleared_by_name ?? (r.auto_cleared ? 'Auto' : '—')}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {bulkData && bulkData.last_page > 1 && (
                <div className="px-4 py-3 border-t border-ink-100 dark:border-ink-700">
                  <Pagination currentPage={bulkData.current_page} lastPage={bulkData.last_page} total={bulkData.total} perPage={bulkData.per_page} onPageChange={setPage} />
                </div>
              )}
            </>
          )}
          </div>
        </div>
      )}
    </div>
  )
}
