import { useEffect, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, Pencil, Trash2, Loader2, X, CalendarDays, Layers, SplitSquareHorizontal, Upload, Download, Archive, ArchiveRestore, Copy, ArrowRight, CheckCircle2 } from 'lucide-react'
import toast from 'react-hot-toast'
import * as XLSX from 'xlsx'
import { feeStructureService, feeTypeService } from '@/services/financeService'
import { academicsMgmtService } from '@/services/academicsMgmtService'
import { academicService as academicSvc } from '@/services/academicService'
import type { FeeStructure, CreateFeeStructurePayload, PaymentPlan, FeeTypeRecord, StudentCategory } from '@/types/finance'
import SearchableSelect from '@/components/ui/SearchableSelect'
import Pagination from '@/components/ui/Pagination'
import { useSystemStore } from '@/store/systemStore'
import { formatRWF } from '@/utils/formatCurrency'
import ModalPortal from '@/components/ui/ModalPortal'
import { api, apiClient } from '@/services/api'
import { PERMISSIONS } from '@/constants'
import { usePermission } from '@/utils/permissions'

const PER_PAGE = 15

const STUDENT_CATEGORY_OPTIONS: { value: StudentCategory; label: string }[] = [
  { value: 'local',          label: 'Local' },
  { value: 'international',  label: 'International' },
  { value: 'sponsored',      label: 'Sponsored' },
  { value: 'self_sponsored', label: 'Self-sponsored' },
]

const studentCategoryLabel = (v?: string | null) =>
  STUDENT_CATEGORY_OPTIONS.find((o) => o.value === v)?.label ?? null

export default function FeeStructuresPage() {
  const canManage = usePermission(PERMISSIONS.MANAGE_FINANCE)
  const qc = useQueryClient()
  const basics = useSystemStore((s) => s.basics)
  const selectedYearLabel = useSystemStore((s) => s.selectedYearLabel)

  const [yearId, setYearId]         = useState<number | string>('')
  const [categoryFilter, setCategoryFilter] = useState<StudentCategory | ''>('')
  const [page, setPage]             = useState(1)
  const [showForm, setShowForm]     = useState(false)
  const [showImportModal, setShowImportModal] = useState(false)
  const [showCopyModal, setShowCopyModal] = useState(false)
  const [editing, setEditing]       = useState<FeeStructure | null>(null)

  useEffect(() => {
    if (selectedYearLabel) {
      const year = basics?.years?.find((y) => y.label === selectedYearLabel)
      if (year) setYearId(year.id)
    } else {
      const active = basics?.active_year as any
      if (active?.id) setYearId(active.id)
    }
  }, [selectedYearLabel, basics?.years])

  const yearsQ = useQuery({
    queryKey: ['academic-years'],
    queryFn: () => academicSvc.listYears(),
  })
  const years = yearsQ.data?.data ?? []
  const yearOptions = years.map((y: any) => ({ value: y.id, label: y.label }))

  const deptsQ = useQuery({
    queryKey: ['academics', 'departments'],
    queryFn: () => academicsMgmtService.list<any>('departments', { per_page: 100 }),
  })
  const departments = deptsQ.data?.data?.data ?? []

  const levelsQ = useQuery({
    queryKey: ['academics', 'levels'],
    queryFn: () => academicsMgmtService.list<any>('levels', { per_page: 20 }),
  })
  const levels = levelsQ.data?.data?.data ?? []

  const campusesQ = useQuery({
    queryKey: ['academics', 'campuses'],
    queryFn: () => academicsMgmtService.list<any>('campuses', { per_page: 100 }),
  })
  const campuses = campusesQ.data?.data?.data ?? []

  const facultiesQ = useQuery({
    queryKey: ['academics', 'faculties'],
    queryFn: () => academicsMgmtService.list<any>('faculties', { per_page: 100 }),
  })
  const faculties = facultiesQ.data?.data?.data ?? []

  const optionsQ = useQuery({
    queryKey: ['academics', 'options'],
    queryFn: () => academicsMgmtService.list<any>('options', { per_page: 500 }),
  })
  const options = optionsQ.data?.data?.data ?? []

  const feeTypesQ = useQuery({
    queryKey: ['finance', 'fee-types'],
    queryFn: ({ signal }) => feeTypeService.list(signal),
  })
  const feeTypes: FeeTypeRecord[] = feeTypesQ.data?.data ?? []
  const feeTypeOptions = feeTypes
    .filter((t) => t.is_active && !['ARREARS', 'BURSARY_CREDIT'].includes(t.code))
    .sort((a, b) => a.sort_order - b.sort_order || a.label.localeCompare(b.label))
    .map((t) => ({ value: t.code, label: t.label }))

  const structuresQ = useQuery({
    queryKey: ['finance', 'structures', yearId, categoryFilter],
    queryFn: () => feeStructureService.list({
      ...(yearId ? { academic_year_id: Number(yearId) } : {}),
      ...(categoryFilter ? { student_category: categoryFilter } : {}),
    }),
    enabled: !!yearId,
  })
  const allRows: FeeStructure[] = structuresQ.data?.data ?? []

  const totalRows = allRows.length
  const lastPage  = Math.max(1, Math.ceil(totalRows / PER_PAGE))
  const rows      = allRows.slice((page - 1) * PER_PAGE, page * PER_PAGE)

  const deleteMutation = useMutation({
    mutationFn: (id: number) => feeStructureService.delete(id),
    onSuccess: () => {
      toast.success('Fee structure deleted')
      qc.invalidateQueries({ queryKey: ['finance', 'structures'] })
    },
    onError: (e: any) => toast.error(e?.response?.data?.message ?? 'Delete failed'),
  })

  const archiveMutation = useMutation({
    mutationFn: ({ id, is_active }: { id: number; is_active: 0 | 1 }) =>
      feeStructureService.update(id, { is_active }),
    onSuccess: (_data, vars) => {
      toast.success(vars.is_active ? 'Fee structure restored' : 'Fee structure archived')
      qc.invalidateQueries({ queryKey: ['finance', 'structures'] })
    },
    onError: (e: any) => toast.error(e?.response?.data?.message ?? 'Update failed'),
  })

  const bulkImportMutation = useMutation({
    mutationFn: (rows: any[]) => feeStructureService.bulkImport({ rows }),
    onSuccess: (result: any) => {
      toast.success(`Bulk import complete: ${result.data.created} created, ${result.data.failed?.length ?? 0} failed`)
      qc.invalidateQueries({ queryKey: ['finance', 'structures'] })
      setShowImportModal(false)
    },
    onError: (e: any) => toast.error(e?.response?.data?.message ?? 'Import failed'),
  })

  const planLabel = (row: FeeStructure) => {
    const plan = row.payment_plan ?? 'full_year'
    if (plan === 'per_semester') return '2× semester'
    if (plan === 'per_installment') return `${row.installment_count ?? '?'}× install.`
    return 'Full year'
  }

  const [exportLoading, setExportLoading] = useState(false)

  const handleExportExcel = async () => {
    if (!yearId) {
      toast.error('Select an academic year first')
      return
    }
    try {
      setExportLoading(true)
      const res = await api.get<any>(`/api/finance/structures/schedule-export?academic_year_id=${yearId}`)
      // Backend returns { rows, general_fees } — rows are pivoted directly off
      // fee_structures.department_id (the real, populated linkage); general_fees are
      // fees that apply to every department (department_id IS NULL), listed separately
      // instead of being blended into a bogus "Ungrouped/Unknown" pivot row.
      const rows: any[] = res.data?.rows ?? []
      const generalFees: any[] = res.data?.general_fees ?? []

      if (rows.length === 0 && generalFees.length === 0) {
        toast.error('No fee structures found for this academic year')
        return
      }

      const headerRow = ['S/N', 'Faculty', 'Program', 'Semester', 'Application Fee', 'Registration Fee', 'CURSU Fee', 'Total Tuition', 'Internship Fee', 'Final Project Fee', 'Graduation Fee']

      // Group rows by faculty
      const grouped: Record<string, any[]> = {}
      rows.forEach((row: any) => {
        const fac = row.fac_name || 'General'
        if (!grouped[fac]) grouped[fac] = []
        grouped[fac].push(row)
      })

      const dataRows: any[] = []
      let sn = 1
      Object.entries(grouped).forEach(([facName, facRows]) => {
        dataRows.push([facName])
        facRows.forEach((row: any) => {
          dataRows.push([
            sn,
            row.fac_name || '',
            row.option_name || 'Unnamed Program',
            row.semester ? `Semester ${row.semester}` : 'Full year',
            row.application_fee != null ? Number(row.application_fee) : '',
            row.registration_fee != null ? Number(row.registration_fee) : '',
            row.cursu_fee != null ? Number(row.cursu_fee) : '',
            row.tuition_fee != null ? Number(row.tuition_fee) : '',
            row.internship_fee != null ? Number(row.internship_fee) : '',
            row.final_project_fee != null ? Number(row.final_project_fee) : '',
            row.graduation_fee != null ? Number(row.graduation_fee) : '',
          ])
          sn++
        })
      })

      const generalTitleRow = generalFees.length > 0 ? [[], ['Fees Applying to All Departments']] : []
      const generalRows = generalFees.map((f: any) => [f.label, Number(f.amount)])

      const aoa = [headerRow, ...dataRows, ...generalTitleRow, ...generalRows]
      const ws = XLSX.utils.aoa_to_sheet(aoa)
      ws['!cols'] = [
        { wch: 5 }, { wch: 22 }, { wch: 40 }, { wch: 12 }, { wch: 14 },
        { wch: 16 }, { wch: 12 }, { wch: 14 }, { wch: 14 }, { wch: 14 }, { wch: 14 },
      ]
      // Apply currency number format to fee columns
      for (let r = 1; r < 1 + dataRows.length; r++) {
        for (const c of [4, 5, 6, 7, 8, 9, 10]) {
          const cell = ws[XLSX.utils.encode_cell({ r, c })]
          if (cell && typeof cell.v === 'number') cell.z = '#,##0'
        }
      }

      const wb = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(wb, ws, 'Fee Schedule')

      const year = years.find(y => y.id == yearId)
      const yearLabel = year?.label || 'FeeSchedule'
      XLSX.writeFile(wb, `Fee-Schedule-${yearLabel}.xlsx`)
      toast.success('Fee schedule exported to Excel')
    } catch (e: any) {
      toast.error(e?.response?.data?.message ?? 'Export failed')
    } finally {
      setExportLoading(false)
    }
  }

  const handleExportPdf = async () => {
    if (!yearId) {
      toast.error('Select an academic year first')
      return
    }
    // The PDF is generated entirely server-side (dompdf). Fetch it as an authenticated
    // blob via the shared axios client (same pattern as feeInvoicePdfService.downloadInvoicePdf
    // in financeService.ts) rather than a direct <a href> navigation — a bare navigation can't
    // carry the Authorization header and resolves relative to the wrong origin when
    // VITE_API_URL points elsewhere, silently failing ("Site wasn't available") instead
    // of surfacing an error. The frontend's only job is saving the returned blob.
    try {
      setExportLoading(true)
      const year = years.find(y => y.id == yearId)
      const yearLabel = year?.label || 'FeeSchedule'
      const response = await apiClient.get(
        `/api/finance/structures/schedule-export.pdf?academic_year_id=${yearId}`,
        { responseType: 'blob' },
      )
      const objectUrl = window.URL.createObjectURL(new Blob([response.data]))
      const link = document.createElement('a')
      link.href = objectUrl
      link.download = `Fee-Schedule-${yearLabel}.pdf`
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      window.URL.revokeObjectURL(objectUrl)
      toast.success('Fee schedule exported to PDF')
    } catch (e: any) {
      toast.error(e?.message ?? 'PDF export failed')
    } finally {
      setExportLoading(false)
    }
  }

  return (
    <div className="space-y-4 animate-fade-in">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-lg font-bold text-ink-900 dark:text-white">Fee Structures</h2>
          <p className="text-[13px] text-ink-500">Configure fee amounts per type, department, level and academic year.</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          {canManage && (
            <button className="btn-secondary btn-sm" onClick={() => setShowCopyModal(true)}>
              <Copy className="w-3.5 h-3.5" /> Copy from year
            </button>
          )}
          {canManage && (
            <button className="btn-secondary btn-sm" onClick={() => setShowImportModal(true)}>
              <Upload className="w-3.5 h-3.5" /> Import CSV
            </button>
          )}
          <button className="btn-secondary btn-sm" onClick={handleExportExcel} disabled={exportLoading || !yearId}>
            <Download className="w-3.5 h-3.5" /> {exportLoading ? 'Exporting...' : 'Export Excel'}
          </button>
          <button className="btn-secondary btn-sm" onClick={handleExportPdf} disabled={exportLoading || !yearId}>
            <Download className="w-3.5 h-3.5" /> {exportLoading ? 'Exporting...' : 'Export PDF'}
          </button>
          {canManage && (
            <button className="btn-primary btn-sm" onClick={() => { setEditing(null); setShowForm(true) }}>
              <Plus className="w-3.5 h-3.5" /> New structure
            </button>
          )}
        </div>
      </div>

      {/* Year filter */}
      <div className="card p-3 flex gap-3 items-end flex-wrap">
        <div className="min-w-[200px]">
          <label className="block text-xs text-ink-500 mb-1">Academic Year</label>
          <SearchableSelect
            options={yearOptions}
            value={yearId}
            onChange={v => { setYearId(v); setPage(1) }}
            placeholder="Select year…"
          />
        </div>
        <div className="min-w-[200px]">
          <label className="block text-xs text-ink-500 mb-1">Student Category</label>
          <SearchableSelect
            options={STUDENT_CATEGORY_OPTIONS}
            value={categoryFilter}
            onChange={v => { setCategoryFilter((v ? v : '') as StudentCategory | ''); setPage(1) }}
            placeholder="All categories"
            allLabel="All categories"
          />
        </div>
      </div>

      {/* Table */}
      <div className="card overflow-hidden">
        {structuresQ.isLoading && (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-5 h-5 animate-spin text-brand" />
          </div>
        )}
        {!yearId && !structuresQ.isLoading && (
          <p className="text-center py-10 text-ink-400 text-sm">Select an academic year to view fee structures.</p>
        )}
        {yearId && !structuresQ.isLoading && allRows.length === 0 && (
          <div className="flex flex-col items-center gap-3 py-10">
            <p className="text-center text-ink-400 text-sm">No fee structures configured for this year yet.</p>
            {canManage && (
              <p className="text-center text-xs text-ink-400">
                Fees rarely change year to year —{' '}
                <button
                  type="button"
                  className="font-semibold text-brand hover:underline"
                  onClick={() => setShowCopyModal(true)}
                >
                  copy them from another year
                </button>{' '}
                instead of re-entering everything.
              </p>
            )}
          </div>
        )}
        {rows.length > 0 && (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-ink-50 dark:bg-ink-700/50 text-ink-500 text-xs uppercase">
                  <tr>
                    <th className="px-4 py-2.5 text-left">Label</th>
                    <th className="px-4 py-2.5 text-left">Type</th>
                    <th className="px-4 py-2.5 text-left">Department</th>
                    <th className="px-4 py-2.5 text-left">Level</th>
                    <th className="px-4 py-2.5 text-left">Category</th>
                    <th className="px-4 py-2.5 text-left">Semester</th>
                    <th className="px-4 py-2.5 text-right">Amount</th>
                    <th className="px-4 py-2.5 text-left">Payment Plan</th>
                    <th className="px-4 py-2.5 text-center">Active</th>
                    <th className="px-4 py-2.5" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-ink-100 dark:divide-ink-700">
                  {rows.map((row: FeeStructure) => (
                    <tr
                      key={row.id}
                      className={canManage ? "hover:bg-ink-50/50 dark:hover:bg-ink-700/30 cursor-pointer" : ""}
                      onClick={canManage ? () => { setEditing(row); setShowForm(true) } : undefined}
                    >
                      <td className="px-4 py-2.5 font-medium">{row.label}</td>
                      <td className="px-4 py-2.5 text-ink-500">{feeTypes.find((t) => t.code === row.fee_type)?.label ?? row.fee_type}</td>
                      <td className="px-4 py-2.5 text-ink-500">
                        {row.dept_ids
                          ? (() => {
                              const ids = row.dept_ids.split(',').filter(Boolean)
                              if (ids.length === 1) return row.department_name ?? ids[0]
                              return <span className="text-xs bg-brand/10 text-brand px-1.5 py-0.5 rounded font-medium">{ids.length} depts</span>
                            })()
                          : row.department_name ?? <span className="italic text-ink-300">All</span>}
                      </td>
                      <td className="px-4 py-2.5 text-ink-500">{row.level_name ?? <span className="italic text-ink-300">All</span>}</td>
                      <td className="px-4 py-2.5 text-ink-500">{studentCategoryLabel(row.student_category) ?? <span className="italic text-ink-300">All</span>}</td>
                      <td className="px-4 py-2.5 text-ink-500">{row.semester ? `S${row.semester}` : '—'}</td>
                      <td className="px-4 py-2.5 text-right font-mono font-semibold">
                        {row.currency && row.currency !== 'RWF'
                          ? `${Number(row.amount).toLocaleString('en-US')} ${row.currency}`
                          : formatRWF(row.amount)}
                      </td>
                      <td className="px-4 py-2.5">
                        <span className="text-xs text-ink-500">{planLabel(row)}</span>
                      </td>
                      <td className="px-4 py-2.5 text-center">
                        <span className={`inline-block w-2 h-2 rounded-full ${row.is_active ? 'bg-green-500' : 'bg-ink-300'}`} />
                      </td>
                      <td className="px-4 py-2.5 text-right" onClick={e => e.stopPropagation()}>
                        {canManage && (
                          <div className="flex gap-1 justify-end">
                            <button className="btn-ghost btn-xs" onClick={() => { setEditing(row); setShowForm(true) }}>
                              <Pencil className="w-3.5 h-3.5" />
                            </button>
                            <button
                              className="btn-ghost btn-xs"
                              title={row.is_active ? 'Archive' : 'Restore'}
                              onClick={() => archiveMutation.mutate({ id: row.id, is_active: row.is_active ? 0 : 1 })}
                            >
                              {row.is_active
                                ? <Archive className="w-3.5 h-3.5" />
                                : <ArchiveRestore className="w-3.5 h-3.5 text-green-600" />}
                            </button>
                            <button
                              className="btn-ghost btn-xs text-red-500"
                              onClick={() => { if (confirm('Delete this fee structure?')) deleteMutation.mutate(row.id) }}
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {lastPage > 1 && (
              <div className="px-4 py-3 border-t border-ink-100 dark:border-ink-700">
                <Pagination
                  currentPage={page}
                  lastPage={lastPage}
                  total={totalRows}
                  perPage={PER_PAGE}
                  onPageChange={setPage}
                />
              </div>
            )}
          </>
        )}
      </div>

      {showForm && (
        <FeeStructureModal
          years={years}
          departments={departments}
          levels={levels}
          campuses={campuses}
          faculties={faculties}
          options={options}
          feeTypeOptions={feeTypeOptions}
          initial={editing}
          defaultYearId={yearId ? Number(yearId) : undefined}
          onClose={() => setShowForm(false)}
          onSaved={() => {
            setShowForm(false)
            qc.invalidateQueries({ queryKey: ['finance', 'structures'] })
          }}
        />
      )}

      {showImportModal && (
        <BulkImportModal
          onClose={() => setShowImportModal(false)}
          onImport={(rows) => bulkImportMutation.mutate(rows)}
          isLoading={bulkImportMutation.isPending}
        />
      )}

      {showCopyModal && (
        <CopyFromYearModal
          yearOptions={yearOptions}
          defaultTargetYearId={yearId ? Number(yearId) : undefined}
          onClose={() => setShowCopyModal(false)}
          onCopied={() => qc.invalidateQueries({ queryKey: ['finance', 'structures'] })}
        />
      )}
    </div>
  )
}

// ─── Modal ────────────────────────────────────────────────────────────────────

interface ModalProps {
  years:           any[]
  departments:     any[]
  levels:          any[]
  campuses:        any[]
  faculties:       any[]
  options:         any[]
  feeTypeOptions:  { value: string; label: string }[]
  initial:         FeeStructure | null
  defaultYearId?: number
  onClose:       () => void
  onSaved:       () => void
}

const PLAN_OPTIONS: { value: PaymentPlan; label: string; desc: string; icon: React.ReactNode }[] = [
  {
    value: 'full_year',
    label: 'Full Year',
    desc: 'One payment covers the entire academic year.',
    icon: <CalendarDays className="w-4 h-4" />,
  },
  {
    value: 'per_semester',
    label: 'Per Semester',
    desc: 'Amount split equally across 2 semesters.',
    icon: <Layers className="w-4 h-4" />,
  },
  {
    value: 'per_installment',
    label: 'Installments',
    desc: 'Custom number of payment installments.',
    icon: <SplitSquareHorizontal className="w-4 h-4" />,
  },
]

function planBreakdown(plan: PaymentPlan, amount: number, count: number) {
  if (plan === 'full_year') {
    return [{ label: 'Full year payment', amount }]
  }
  if (plan === 'per_semester') {
    const half = Math.round(amount / 2)
    return [
      { label: 'Semester 1', amount: half },
      { label: 'Semester 2', amount: amount - half },
    ]
  }
  if (plan === 'per_installment' && count >= 2) {
    const base = Math.floor(amount / count)
    const remainder = amount - base * (count - 1)
    return Array.from({ length: count }, (_, i) => ({
      label: `Installment ${i + 1}`,
      amount: i === count - 1 ? remainder : base,
    }))
  }
  return [{ label: 'Full year payment', amount }]
}

function FeeStructureModal({ years, departments, levels, campuses, faculties, options, feeTypeOptions, initial, defaultYearId, onClose, onSaved }: ModalProps) {
  const parseInitialDepts = (): number[] => {
    if (initial?.dept_ids) return initial.dept_ids.split(',').map(Number).filter(Boolean)
    if (initial?.department_id) return [initial.department_id]
    return []
  }

  const parseInitialOptions = (): number[] => {
    if (initial?.option_ids) return initial.option_ids.split(',').map(Number).filter(Boolean)
    return []
  }

  const [selectedDepts, setSelectedDepts] = useState<number[]>(parseInitialDepts)
  const [selectedOptions, setSelectedOptions] = useState<number[]>(parseInitialOptions)
  const [selectedFacultyId, setSelectedFacultyId] = useState<number | null>(null)
  const [form, setForm] = useState<CreateFeeStructurePayload & { is_active: 0 | 1 }>({
    academic_year_id:  initial?.academic_year_id ?? defaultYearId ?? 0,
    department_id:     initial?.department_id ?? null,
    department_ids:    parseInitialDepts(),
    level_id:          initial?.level_id ?? null,
    campus_id:         initial?.campus_id ?? null,
    option_ids:        parseInitialOptions(),
    student_category:  initial?.student_category ?? null,
    fee_type:          (initial?.fee_type ?? 'TUITION') as string,
    label:             initial?.label ?? '',
    amount:            initial?.amount ?? 0,
    currency:          initial?.currency ?? 'RWF',
    semester:          initial?.semester ?? null,
    payment_plan:      initial?.payment_plan ?? 'full_year',
    installment_count: initial?.installment_count ?? 4,
    is_active:         (initial?.is_active ?? 1) as 0 | 1,
  })

  const toggleDept = (deptId: number) => {
    const next = selectedDepts.includes(deptId)
      ? selectedDepts.filter(d => d !== deptId)
      : [...selectedDepts, deptId]
    setSelectedDepts(next)
    setForm(f => ({ ...f, department_ids: next, department_id: next[0] ?? null }))
  }

  const toggleAllDepts = () => {
    const visibleDepts = filteredDepts
    if (selectedDepts.length === visibleDepts.length) {
      setSelectedDepts([])
      setForm(f => ({ ...f, department_ids: [], department_id: null }))
    } else {
      const allIds = visibleDepts.map((d: any) => d.dep_id)
      setSelectedDepts(allIds)
      setForm(f => ({ ...f, department_ids: allIds, department_id: allIds[0] ?? null }))
    }
  }

  const toggleOption = (optionId: number) => {
    const next = selectedOptions.includes(optionId)
      ? selectedOptions.filter(o => o !== optionId)
      : [...selectedOptions, optionId]
    setSelectedOptions(next)
    setForm(f => ({ ...f, option_ids: next }))
  }

  const toggleAllOptions = () => {
    const visibleOptions = filteredOptions
    if (selectedOptions.length === visibleOptions.length) {
      setSelectedOptions([])
      setForm(f => ({ ...f, option_ids: [] }))
    } else {
      const allIds = visibleOptions.map((o: any) => o.id)
      setSelectedOptions(allIds)
      setForm(f => ({ ...f, option_ids: allIds }))
    }
  }

  const set = (k: keyof typeof form, v: any) => setForm(f => ({ ...f, [k]: v }))

  const yearOptions  = years.map((y: any) => ({ value: y.id, label: y.label }))
  const levelOptions = levels.map((l: any) => ({ value: l.id, label: l.name }))
  const campusOptions = campuses.map((c: any) => ({ value: c.id, label: c.name }))
  const facultyOptions = faculties.map((f: any) => ({ value: f.fac_id, label: f.fac_name }))

  const filteredDepts = selectedFacultyId
    ? departments.filter((d: any) => d.fac_id === selectedFacultyId)
    : departments

  const filteredOptions = selectedDepts.length > 0
    ? options.filter((o: any) => selectedDepts.includes(o.department_id))
    : options

  const activePlan    = form.payment_plan ?? 'full_year'
  const installCount  = Math.max(2, Math.min(12, form.installment_count ?? 4))
  const breakdown     = planBreakdown(activePlan, form.amount, installCount)
  const formatAmount  = (n: number) =>
    (form.currency && form.currency !== 'RWF')
      ? `${Number(n).toLocaleString('en-US')} ${form.currency}`
      : formatRWF(n)

  const mutation = useMutation({
    mutationFn: (): Promise<any> =>
      initial
        ? feeStructureService.update(initial.id, { ...form })
        : feeStructureService.create(form),
    onSuccess: () => {
      toast.success(initial ? 'Fee structure updated' : 'Fee structure created')
      onSaved()
    },
    onError: (e: any) => toast.error(e?.response?.data?.message ?? 'Save failed'),
  })

  return (
    <ModalPortal>
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black/50 backdrop-blur-sm">
      <div className="flex min-h-full items-start justify-center p-4 pt-10">
        <div className="bg-white dark:bg-ink-800 rounded-2xl shadow-2xl w-full max-w-5xl overflow-hidden">

          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-ink-100 dark:border-ink-700">
            <div>
              <h3 className="text-base font-semibold text-ink-900 dark:text-white">
                {initial ? 'Edit Fee Structure' : 'New Fee Structure'}
              </h3>
              <p className="text-xs text-ink-400 mt-0.5">
                Define how a fee is charged and how students can pay it.
              </p>
            </div>
            <button
              onClick={onClose}
              className="btn-ghost btn-sm p-1.5 rounded-full"
              aria-label="Close"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Body */}
          <div className="p-6 grid grid-cols-1 lg:grid-cols-2 gap-6">

            {/* ── Left: Basic Details ── */}
            <div className="space-y-4">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-ink-400">Basic Details</p>

              <Field label="Academic Year *">
                <SearchableSelect
                  options={yearOptions}
                  value={form.academic_year_id}
                  onChange={v => set('academic_year_id', Number(v))}
                  placeholder="Select year…"
                />
              </Field>

              <div className="grid grid-cols-2 gap-3">
                <Field label="Fee Type *">
                  <SearchableSelect
                    options={feeTypeOptions}
                    value={form.fee_type}
                    onChange={v => set('fee_type', String(v))}
                    placeholder="Select type…"
                  />
                </Field>
                <Field label="Semester">
                  <SearchableSelect
                    options={[
                      { value: 1, label: 'Semester 1 (Year 1)' },
                      { value: 2, label: 'Semester 2 (Year 1)' },
                      { value: 3, label: 'Semester 3 (Year 2)' },
                      { value: 4, label: 'Semester 4 (Year 2)' },
                      { value: 5, label: 'Semester 5 (Year 3)' },
                      { value: 6, label: 'Semester 6 (Year 3)' },
                      { value: 7, label: 'Semester 7 (Year 4)' },
                      { value: 8, label: 'Semester 8 (Year 4)' },
                    ]}
                    value={form.semester ?? ''}
                    onChange={v => set('semester', v ? Number(v) : null)}
                    placeholder="Full year"
                    allLabel="Full year"
                  />
                </Field>
              </div>

              <Field label="Label *">
                <input
                  className="input input-sm w-full"
                  value={form.label}
                  onChange={e => set('label', e.target.value)}
                  placeholder="e.g. Tuition Y1 S1"
                />
              </Field>

              <div className="grid grid-cols-2 gap-3">
                <Field label="Annual Amount *">
                  <input
                    type="number"
                    className="input input-sm w-full font-mono"
                    value={form.amount}
                    onChange={e => set('amount', Number(e.target.value))}
                    min={0}
                  />
                </Field>
                <Field label="Currency">
                  <input
                    className="input input-sm w-full uppercase"
                    value={form.currency ?? 'RWF'}
                    onChange={e => set('currency', e.target.value.toUpperCase())}
                    placeholder="RWF"
                    maxLength={10}
                  />
                </Field>
              </div>
              {form.amount > 0 && (
                <p className="text-[11px] text-ink-400 -mt-2">
                  = {(form.currency && form.currency !== 'RWF')
                      ? `${Number(form.amount).toLocaleString('en-US')} ${form.currency}`
                      : formatRWF(form.amount)} total per student
                </p>
              )}

              <div className="grid grid-cols-2 gap-3">
                <Field label="Level">
                  <SearchableSelect
                    options={levelOptions}
                    value={form.level_id ?? ''}
                    onChange={v => set('level_id', v ? Number(v) : null)}
                    placeholder="All levels"
                    allLabel="All levels"
                  />
                </Field>
                <Field label="Student Category">
                  <SearchableSelect
                    options={STUDENT_CATEGORY_OPTIONS}
                    value={form.student_category ?? ''}
                    onChange={v => set('student_category', v ? (v as StudentCategory) : null)}
                    placeholder="All categories"
                    allLabel="All categories"
                  />
                </Field>
              </div>

              {initial && (
                <Field label="Status">
                  <label className="flex items-center gap-3 cursor-pointer select-none">
                    <div className="relative">
                      <input
                        type="checkbox"
                        className="sr-only"
                        checked={form.is_active === 1}
                        onChange={e => set('is_active', e.target.checked ? 1 : 0)}
                      />
                      <div className={`w-10 h-5 rounded-full transition-colors ${
                        form.is_active === 1 ? 'bg-green-500' : 'bg-ink-300 dark:bg-ink-600'
                      }`} />
                      <div className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${
                        form.is_active === 1 ? 'translate-x-5' : 'translate-x-0'
                      }`} />
                    </div>
                    <span className={`text-sm font-medium ${form.is_active === 1 ? 'text-green-600' : 'text-ink-400'}`}>
                      {form.is_active === 1 ? 'Active' : 'Inactive'}
                    </span>
                  </label>
                </Field>
              )}
            </div>

            {/* ── Right: Scope + Payment Plan ── */}
            <div className="space-y-4">
              {/* Campus */}
              <Field label="Campus">
                <SearchableSelect
                  options={campusOptions}
                  value={form.campus_id ?? ''}
                  onChange={v => set('campus_id', v ? Number(v) : null)}
                  placeholder="All campuses"
                  allLabel="All campuses"
                />
              </Field>

              {/* Faculty */}
              <Field label="Faculty">
                <SearchableSelect
                  options={facultyOptions}
                  value={selectedFacultyId ?? ''}
                  onChange={v => setSelectedFacultyId(v ? Number(v) : null)}
                  placeholder="All faculties"
                  allLabel="All faculties"
                />
              </Field>

              {/* Departments */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-[11px] font-semibold uppercase tracking-wider text-ink-400">
                    Departments
                    <span className="normal-case font-normal ml-1 text-ink-300">(leave empty = all)</span>
                  </label>
                  {filteredDepts.length > 0 && (
                    <button
                      type="button"
                      className="text-[11px] text-brand hover:underline"
                      onClick={toggleAllDepts}
                    >
                      {selectedDepts.length === filteredDepts.length ? 'Deselect all' : 'Select all'}
                    </button>
                  )}
                </div>
                <div className="border border-ink-200 dark:border-ink-600 rounded-xl p-2 max-h-44 overflow-y-auto space-y-0.5 bg-ink-50/50 dark:bg-ink-900/30">
                  {filteredDepts.length === 0 && (
                    <p className="text-xs text-ink-400 py-1 px-1">{selectedFacultyId ? 'No departments in this faculty' : 'No departments loaded'}</p>
                  )}
                  {filteredDepts.map((d: any) => (
                    <label
                      key={d.dep_id}
                      className={`flex items-center gap-2.5 cursor-pointer rounded-lg px-2 py-1.5 transition-colors ${
                        selectedDepts.includes(d.dep_id)
                          ? 'bg-brand/10 dark:bg-brand/20'
                          : 'hover:bg-ink-100 dark:hover:bg-ink-700/40'
                      }`}
                    >
                      <input
                        type="checkbox"
                        className="rounded accent-brand"
                        checked={selectedDepts.includes(d.dep_id)}
                        onChange={() => toggleDept(d.dep_id)}
                      />
                      <span className="text-xs leading-none">{d.dep_name}</span>
                    </label>
                  ))}
                </div>
                {selectedDepts.length > 0 && (
                  <p className="text-[11px] text-brand mt-1.5 font-medium">
                    {selectedDepts.length} department{selectedDepts.length !== 1 ? 's' : ''} selected
                  </p>
                )}
              </div>

              {/* Options (Programs) */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-[11px] font-semibold uppercase tracking-wider text-ink-400">
                    Programs (Options)
                    <span className="normal-case font-normal ml-1 text-ink-300">(leave empty = all)</span>
                  </label>
                  {filteredOptions.length > 0 && (
                    <button
                      type="button"
                      className="text-[11px] text-brand hover:underline"
                      onClick={toggleAllOptions}
                    >
                      {selectedOptions.length === filteredOptions.length ? 'Deselect all' : 'Select all'}
                    </button>
                  )}
                </div>
                <div className="border border-ink-200 dark:border-ink-600 rounded-xl p-2 max-h-44 overflow-y-auto space-y-0.5 bg-ink-50/50 dark:bg-ink-900/30">
                  {filteredOptions.length === 0 && (
                    <p className="text-xs text-ink-400 py-1 px-1">{selectedDepts.length > 0 ? 'No programs in selected departments' : 'Select departments to see programs'}</p>
                  )}
                  {filteredOptions.map((o: any) => (
                    <label
                      key={o.id}
                      className={`flex items-center gap-2.5 cursor-pointer rounded-lg px-2 py-1.5 transition-colors ${
                        selectedOptions.includes(o.id)
                          ? 'bg-brand/10 dark:bg-brand/20'
                          : 'hover:bg-ink-100 dark:hover:bg-ink-700/40'
                      }`}
                    >
                      <input
                        type="checkbox"
                        className="rounded accent-brand"
                        checked={selectedOptions.includes(o.id)}
                        onChange={() => toggleOption(o.id)}
                      />
                      <span className="text-xs leading-none">{o.name}</span>
                    </label>
                  ))}
                </div>
                {selectedOptions.length > 0 && (
                  <p className="text-[11px] text-brand mt-1.5 font-medium">
                    {selectedOptions.length} program{selectedOptions.length !== 1 ? 's' : ''} selected
                  </p>
                )}
              </div>

              {/* Payment Plan */}
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wider text-ink-400 mb-2">
                  Payment Plan
                  <span className="normal-case font-normal ml-1 text-ink-300">(how students may pay)</span>
                </p>

                <div className="grid grid-cols-3 gap-2 mb-3">
                  {PLAN_OPTIONS.map(opt => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => set('payment_plan', opt.value)}
                      className={`flex flex-col items-center gap-1.5 rounded-xl border-2 px-3 py-3 text-xs font-medium transition-all ${
                        activePlan === opt.value
                          ? 'border-brand bg-brand/10 text-brand dark:bg-brand/20'
                          : 'border-ink-200 dark:border-ink-600 text-ink-500 hover:border-ink-300 dark:hover:border-ink-500'
                      }`}
                    >
                      {opt.icon}
                      <span>{opt.label}</span>
                    </button>
                  ))}
                </div>

                <p className="text-xs text-ink-400 mb-3">
                  {PLAN_OPTIONS.find(o => o.value === activePlan)?.desc}
                </p>

                {activePlan === 'per_installment' && (
                  <div className="mb-3">
                    <label className="block text-xs text-ink-500 mb-1">Number of installments per year</label>
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        min={2}
                        max={12}
                        className="input input-sm w-24 font-mono"
                        value={installCount}
                        onChange={e => set('installment_count', Math.max(2, Math.min(12, Number(e.target.value))))}
                      />
                      <span className="text-xs text-ink-400">payments / year (2–12)</span>
                    </div>
                  </div>
                )}

                {/* Breakdown preview */}
                {form.amount > 0 && (
                  <div className="rounded-xl border border-ink-200 dark:border-ink-600 overflow-hidden">
                    <div className="bg-ink-50 dark:bg-ink-700/40 px-3 py-2 text-[11px] font-semibold uppercase tracking-wider text-ink-500">
                      Payment schedule — {formatAmount(form.amount)} total
                    </div>
                    <div className="divide-y divide-ink-100 dark:divide-ink-700">
                      {breakdown.map((item, i) => (
                        <div key={i} className="flex items-center justify-between px-3 py-2">
                          <span className="text-xs text-ink-500">{item.label}</span>
                          <span className="text-xs font-mono font-semibold text-ink-800 dark:text-ink-100">
                            {formatAmount(item.amount)}
                          </span>
                        </div>
                      ))}
                    </div>
                    {activePlan !== 'full_year' && (
                      <div className="bg-brand/5 px-3 py-2 text-[11px] text-brand font-medium">
                        Each payment: {formatAmount(breakdown[0]?.amount ?? 0)}
                        {activePlan === 'per_semester' && ' · Paid once per semester'}
                        {activePlan === 'per_installment' && ` · ${installCount} installments per year`}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-ink-100 dark:border-ink-700 bg-ink-50/50 dark:bg-ink-900/20">
            <button className="btn-ghost btn-sm" onClick={onClose}>Cancel</button>
            <button
              className="btn-primary btn-sm min-w-[110px]"
              onClick={() => mutation.mutate()}
              disabled={mutation.isPending || !form.academic_year_id || !form.label || !form.amount}
            >
              {mutation.isPending
                ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Saving…</>
                : initial ? 'Save changes' : 'Create structure'
              }
            </button>
          </div>
        </div>
      </div>
    </div>
    </ModalPortal>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs text-ink-500 mb-1">{label}</label>
      {children}
    </div>
  )
}

function BulkImportModal({ onClose, onImport, isLoading }: { onClose: () => void; onImport: (rows: any[]) => void; isLoading: boolean }) {
  const [importFile, setImportFile] = useState<File | null>(null)
  const [parsedRows, setParsedRows] = useState<any[]>([])
  const [errors, setErrors] = useState<any[]>([])

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    setImportFile(file)
    const reader = new FileReader()
    reader.onload = (evt) => {
      try {
        const text = evt.target?.result as string
        const lines = text.split('\n').map(l => l.trim()).filter(l => l)
        if (lines.length < 2) {
          setErrors(['CSV must have at least a header and one data row'])
          setParsedRows([])
          return
        }

        const headers = lines[0].split(',').map(h => h.trim())
        const rows = lines.slice(1).map((line) => {
          const values = line.split(',').map(v => v.trim())
          const row: any = {}
          headers.forEach((h, i) => {
            row[h] = values[i] ?? ''
          })
          return row
        })

        setParsedRows(rows)
        setErrors([])
      } catch (e: any) {
        setErrors([e.message || 'Failed to parse CSV'])
        setParsedRows([])
      }
    }
    reader.readAsText(file)
  }

  return (
    <ModalPortal>
      <div className="fixed inset-0 bg-black/30 flex items-center justify-center p-4 z-50" onClick={onClose}>
        <div className="bg-white dark:bg-ink-800 rounded-lg shadow-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
          <div className="p-6 border-b border-ink-100 dark:border-ink-700 flex items-center justify-between">
            <h3 className="font-bold text-ink-900 dark:text-white">Bulk Import Fee Structures</h3>
            <button onClick={onClose} className="text-ink-400 hover:text-ink-600 dark:hover:text-ink-200">
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="p-6 space-y-4">
            <div>
              <p className="text-sm text-ink-600 dark:text-ink-300 mb-3">
                Upload a CSV file with the following columns:
              </p>
              <div className="text-xs font-mono bg-ink-50 dark:bg-ink-900 p-3 rounded overflow-x-auto">
                academic_year_label, department_name, level_name, fee_type_code, label, amount, semester, payment_plan, installment_count
              </div>
            </div>

            <div className="border-2 border-dashed border-ink-200 dark:border-ink-600 rounded-lg p-6 text-center">
              <input
                type="file"
                accept=".csv"
                onChange={handleFileSelect}
                className="hidden"
                id="csv-upload"
                disabled={isLoading}
              />
              <label htmlFor="csv-upload" className="cursor-pointer">
                <Upload className="w-8 h-8 mx-auto mb-2 text-ink-400" />
                <p className="text-sm font-medium text-ink-900 dark:text-white">
                  {importFile ? importFile.name : 'Click to select CSV or drag and drop'}
                </p>
              </label>
            </div>

            {errors.length > 0 && (
              <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded p-3">
                {errors.map((err, i) => (
                  <p key={i} className="text-xs text-red-700 dark:text-red-400">{err}</p>
                ))}
              </div>
            )}

            {parsedRows.length > 0 && (
              <div>
                <p className="text-sm text-ink-600 dark:text-ink-300 mb-2">
                  {parsedRows.length} row{parsedRows.length !== 1 ? 's' : ''} ready to import
                </p>
                <div className="overflow-x-auto max-h-[200px] border border-ink-100 dark:border-ink-700 rounded">
                  <table className="w-full text-xs">
                    <thead className="bg-ink-50 dark:bg-ink-900 sticky top-0">
                      <tr>
                        <th className="px-2 py-1 text-left text-ink-500">Department</th>
                        <th className="px-2 py-1 text-left text-ink-500">Fee Type</th>
                        <th className="px-2 py-1 text-right text-ink-500">Amount</th>
                        <th className="px-2 py-1 text-left text-ink-500">Semester</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-ink-100 dark:divide-ink-700">
                      {parsedRows.slice(0, 10).map((row) => (
                        <tr key={`${row.department_name}-${row.fee_type_code}`}>
                          <td className="px-2 py-1 truncate">{row.department_name}</td>
                          <td className="px-2 py-1 truncate">{row.fee_type_code}</td>
                          <td className="px-2 py-1 text-right font-mono">{row.amount}</td>
                          <td className="px-2 py-1">{row.semester || '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>

          <div className="p-6 border-t border-ink-100 dark:border-ink-700 flex gap-2 justify-end">
            <button className="btn-ghost btn-sm" onClick={onClose} disabled={isLoading}>
              Cancel
            </button>
            <button
              className="btn-primary btn-sm min-w-[110px]"
              onClick={() => onImport(parsedRows)}
              disabled={isLoading || parsedRows.length === 0 || errors.length > 0}
            >
              {isLoading
                ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Importing…</>
                : `Import ${parsedRows.length} rows`
              }
            </button>
          </div>
        </div>
      </div>
    </ModalPortal>
  )
}

// ─── Copy from year ─────────────────────────────────────────────────────────

function CopyFromYearModal({
  yearOptions,
  defaultTargetYearId,
  onClose,
  onCopied,
}: {
  yearOptions: { value: number; label: string }[]
  defaultTargetYearId?: number
  onClose: () => void
  onCopied: () => void
}) {
  const [sourceYearId, setSourceYearId] = useState<number | ''>('')
  const [targetYearId, setTargetYearId] = useState<number | ''>(defaultTargetYearId ?? '')
  const [category, setCategory] = useState<StudentCategory | ''>('')
  const [result, setResult] = useState<{ created: number; skipped: number; failed: any[] } | null>(null)

  const sourceLabel = yearOptions.find((y) => y.value === sourceYearId)?.label
  const targetLabel = yearOptions.find((y) => y.value === targetYearId)?.label

  const copyMutation = useMutation({
    mutationFn: () =>
      feeStructureService.copyFromYear({
        source_academic_year_id: Number(sourceYearId),
        target_academic_year_id: Number(targetYearId),
        student_category: category || undefined,
      }),
    onSuccess: (res: any) => {
      setResult(res.data)
      onCopied()
      const { created, skipped } = res.data
      toast.success(
        created > 0
          ? `Copied ${created} fee structure${created !== 1 ? 's' : ''}${skipped ? ` (${skipped} already existed, skipped)` : ''}.`
          : `Nothing to copy — all ${skipped} structure${skipped !== 1 ? 's' : ''} already exist in ${targetLabel}.`
      )
    },
    onError: (e: any) => toast.error(e?.response?.data?.message ?? 'Copy failed'),
  })

  const blocker = !sourceYearId
    ? 'Pick the year to copy from.'
    : !targetYearId
    ? 'Pick the year to copy into.'
    : sourceYearId === targetYearId
    ? 'Source and target years must be different.'
    : null

  return (
    <ModalPortal>
      <div className="fixed inset-0 bg-black/30 flex items-center justify-center p-4 z-50" onClick={onClose}>
        <div
          className="bg-white dark:bg-ink-800 rounded-lg shadow-lg max-w-md w-full"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="p-6 border-b border-ink-100 dark:border-ink-700 flex items-center justify-between">
            <div>
              <h3 className="font-bold text-ink-900 dark:text-white flex items-center gap-2">
                <Copy className="w-4 h-4 text-brand" /> Copy fee structures
              </h3>
              <p className="text-[12.5px] text-ink-500 mt-0.5">
                Fee structures rarely change year to year — copy last year's rates instead of re-entering them.
              </p>
            </div>
            <button onClick={onClose} className="text-ink-400 hover:text-ink-600 dark:hover:text-ink-200">
              <X className="w-5 h-5" />
            </button>
          </div>

          {!result ? (
            <>
              <div className="p-6 space-y-4">
                <div className="flex items-end gap-2">
                  <div className="flex-1 min-w-0">
                    <label className="block text-xs text-ink-500 mb-1">Copy from</label>
                    <SearchableSelect
                      options={yearOptions}
                      value={sourceYearId}
                      onChange={(v) => setSourceYearId(v ? Number(v) : '')}
                      placeholder="Source year…"
                    />
                  </div>
                  <ArrowRight className="w-4 h-4 text-ink-300 mb-2.5 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <label className="block text-xs text-ink-500 mb-1">Copy into</label>
                    <SearchableSelect
                      options={yearOptions}
                      value={targetYearId}
                      onChange={(v) => setTargetYearId(v ? Number(v) : '')}
                      placeholder="Target year…"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs text-ink-500 mb-1">Student category (optional)</label>
                  <SearchableSelect
                    options={STUDENT_CATEGORY_OPTIONS}
                    value={category}
                    onChange={(v) => setCategory((v ? v : '') as StudentCategory | '')}
                    placeholder="All categories"
                    allLabel="All categories"
                  />
                  <p className="text-[11px] text-ink-400 mt-1">Leave blank to copy every fee structure, regardless of category.</p>
                </div>

                <p className="text-[11.5px] text-ink-400">
                  Structures already present in {targetLabel || 'the target year'} (matching type, label, department, level and category) are skipped — safe to run more than once.
                </p>
              </div>

              <div className="p-6 pt-0 flex items-center justify-between gap-3">
                <p className="text-[12px] text-ink-500">{blocker ?? `Ready to copy ${sourceLabel ?? ''} → ${targetLabel ?? ''}.`}</p>
                <div className="flex gap-2 shrink-0">
                  <button className="btn-ghost btn-sm" onClick={onClose} disabled={copyMutation.isPending}>Cancel</button>
                  <button
                    className="btn-primary btn-sm min-w-[90px] disabled:opacity-50"
                    disabled={blocker !== null || copyMutation.isPending}
                    onClick={() => copyMutation.mutate()}
                  >
                    {copyMutation.isPending
                      ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Copying…</>
                      : 'Copy'
                    }
                  </button>
                </div>
              </div>
            </>
          ) : (
            <div className="p-6 space-y-4">
              <div className="flex items-start gap-3 rounded-lg bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 p-3.5">
                <CheckCircle2 className="w-5 h-5 text-green-600 shrink-0 mt-0.5" />
                <div className="text-[13px]">
                  <p className="font-semibold text-ink-900 dark:text-white">
                    {result.created} structure{result.created !== 1 ? 's' : ''} copied into {targetLabel}.
                  </p>
                  {result.skipped > 0 && (
                    <p className="text-ink-500 mt-0.5">{result.skipped} already existed and {result.skipped !== 1 ? 'were' : 'was'} skipped.</p>
                  )}
                </div>
              </div>
              <div className="flex justify-end">
                <button className="btn-primary btn-sm" onClick={onClose}>Done</button>
              </div>
            </div>
          )}
        </div>
      </div>
    </ModalPortal>
  )
}
