import { useMemo, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Link, useSearchParams } from 'react-router-dom'
import toast from 'react-hot-toast'
import {
  Users,
  Search,
  Loader2,
  Mail,
  Phone,
  Calendar,
  BadgeCheck,
  ArrowLeft,
  ArrowRight,
  Plus,
  X,
  Filter,
  Eye,
  UserPlus,
  Pencil,
  Save,
  CreditCard,
} from 'lucide-react'
import {
  hrService,
  type HrEmployeePayload,
  type HrStats,
  type HrListParams,
  type FacetOption,
  type HrBreakdownRow,
} from '@/services/hrService'
import { useDebounce } from '@/hooks/useDebounce'
import { PERMISSIONS } from '@/constants'
import { usePermission, useAnyPermission } from '@/utils/permissions'
import DonutChart from '@/components/dashboard/DonutChart'
import BarChart, { type BarDatum } from '@/components/dashboard/BarChart'
import SearchableSelect from '@/components/ui/SearchableSelect'
import type { HrEmployee } from '@/types/academic'
import ModalPortal from '@/components/ui/ModalPortal'

const PER_PAGE = 15

type Tab = 'active' | 'all'

export default function StaffListPage() {
  const [sp, setSp] = useSearchParams()
  const tab = (sp.get('tab') as Tab) || 'active'
  const [showModal, setShow] = useState(false)

  const canManage = usePermission(PERMISSIONS.MANAGE_HR_EMPLOYEES)

  const statsQ = useQuery({
    queryKey: ['hr-stats'],
    queryFn:  () => hrService.stats(),
    staleTime: 60_000,
  })
  const stats: HrStats | null = statsQ.data?.data ?? null

  const setTab = (next: Tab) => {
    const clone = new URLSearchParams(sp)
    clone.set('tab', next)
    clone.delete('page')
    setSp(clone, { replace: true })
  }

  const drillTo = (filters: Record<string, string | undefined>) => {
    const next = new URLSearchParams()
    next.set('tab', 'all')
    Object.entries(filters).forEach(([k, v]) => { if (v) next.set(k, String(v)) })
    setSp(next, { replace: false })
  }

  return (
    <div className="max-w-[1400px] mx-auto space-y-5">
      {/* ── Tabs + Add staff ── */}
      <section className="card p-1.5 flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-1">
          <TabButton active={tab === 'active'} icon={BadgeCheck} label="Overview" onClick={() => setTab('active')} />
          <TabButton active={tab === 'all'}    icon={Users}      label="Staff list"   onClick={() => setTab('all')} />
        </div>
        {canManage && (
          <button onClick={() => setShow(true)} className="btn-primary btn-sm mr-1">
            <Plus className="w-3.5 h-3.5" />
            Add staff
          </button>
        )}
      </section>

      {tab === 'active'
        ? <ActiveTab stats={stats} loading={statsQ.isLoading} fetching={statsQ.isFetching} onDrill={drillTo} />
        : <AllTab stats={stats} />}

      {showModal && (
        <AddStaffModal
          onClose={() => setShow(false)}
          onSaved={() => {
            setShow(false)
            statsQ.refetch()
          }}
        />
      )}
    </div>
  )
}

/* ─────────────────────────────────────────────────────────────
   Active Staff tab — dashboard matching the Students Active tab.
   Every metric is scoped to status=Active and sums to the active
   total (Unknown buckets included).
   ───────────────────────────────────────────────────────────── */
function ActiveTab({
  stats, loading, fetching, onDrill,
}: {
  stats: HrStats | null
  loading: boolean
  fetching: boolean
  onDrill: (filters: Record<string, string | undefined>) => void
}) {
  const s = stats
  const activeTotal = s?.active ?? 0
  const unknownGender = s?.active_unknown_gender ?? 0

  return (
    <div className="space-y-5">

      {/* ── Status + Gender split — single combined card ── */}
      <section className="card p-5">
        {/* Header */}
        <div className="flex items-center justify-between gap-3 mb-4">
          <div>
            <h2 className="text-[15px] font-semibold text-ink-900 dark:text-white">All staff</h2>
            <p className="text-[12px] text-ink-500 mt-0.5">Click a card or gender segment to view the filtered list.</p>
          </div>
          {(loading || fetching) && <Loader2 className="w-4 h-4 text-ink-400 animate-spin" />}
        </div>

        {/* Status counts */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <StatusSummaryCard label="Total staff" value={s?.total ?? 0} color="#0A2A5E"
            chipLabel="All"        chipCls="bg-brand/10 text-brand dark:bg-brand/20"
            onClick={() => onDrill({})} />
          <StatusSummaryCard label="Active"       value={s?.active ?? 0}     color="#10B981"
            chipLabel="Active"     chipCls="bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400"
            onClick={() => onDrill({ status: 'Active' })} />
          <StatusSummaryCard label="Inactive"     value={s?.inactive ?? 0}   color="#F59E0B"
            chipLabel="Inactive"   chipCls="bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400"
            onClick={() => onDrill({ status: 'Inactive' })} />
          <StatusSummaryCard label="Terminated"   value={s?.terminated ?? 0} color="#EF4444"
            chipLabel="Terminated" chipCls="bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-400"
            onClick={() => onDrill({ status: 'Terminated' })} />
        </div>

        {/* Divider + gender split (shown once data is available) */}
        {s && activeTotal > 0 && (
          <>
            <div className="border-t border-ink-100 dark:border-ink-700 mt-5 mb-5" />
            <div className="flex items-center gap-2 mb-3">
              <span className="chip-success"><BadgeCheck className="w-3 h-3" /> Active staff</span>
              <h3 className="text-[14px] font-semibold text-ink-900 dark:text-white">Gender split</h3>
              <span className="text-[12px] text-ink-400 ml-1">— including those with no recorded gender</span>
            </div>
            <div className="flex flex-col md:flex-row items-center gap-8">
              <DonutChart
                segments={[
                  { label: 'Male',    value: s.active_male,   color: '#0A2A5E' },
                  { label: 'Female',  value: s.active_female, color: '#F5C400' },
                  { label: 'Unknown', value: unknownGender,   color: '#94A3B8' },
                ]}
                centerTop="Active"
                centerBig={activeTotal.toLocaleString()}
              />
              <div className="flex-1 w-full grid grid-cols-1 sm:grid-cols-3 gap-3">
                <LegendCard label="Male"          value={s.active_male}    percent={pct(s.active_male, activeTotal)}    color="#0A2A5E" onClick={() => onDrill({ status: 'Active', gender: 'M' })} />
                <LegendCard label="Female"        value={s.active_female}  percent={pct(s.active_female, activeTotal)}  color="#F5C400" onClick={() => onDrill({ status: 'Active', gender: 'F' })} />
                <LegendCard label="Not specified" value={unknownGender}    percent={pct(unknownGender, activeTotal)}    color="#94A3B8" onClick={() => onDrill({ status: 'Active', gender: 'unknown' })} />
              </div>
            </div>
          </>
        )}
      </section>

      {/* Contract — percentage cards (active-only) */}
      {s && activeTotal > 0 && (
        <section className="card p-6">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="chip-success"><BadgeCheck className="w-3 h-3" /> Active staff</span>
            <h3 className="text-[15px] font-semibold text-ink-900 dark:text-white">Contract type</h3>
          </div>
          <p className="text-[12px] text-ink-500 mt-1">
            Share of active staff by contract type. Click a card to open the filtered list.
          </p>

          <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-4">
            <PercentCard
              label="Permanent"
              value={s.active_permanent}
              percent={pct(s.active_permanent, activeTotal)}
              color="#10B981"
              onClick={() => onDrill({ status: 'Active', contract_type: 'Permanent' })}
            />
            <PercentCard
              label="Temporal"
              value={s.active_temporal}
              percent={pct(s.active_temporal, activeTotal)}
              color="#4FB4FF"
              onClick={() => onDrill({ status: 'Active', contract_type: 'Temporal' })}
            />
            <PercentCard
              label="Part-time"
              value={s.active_part_time}
              percent={pct(s.active_part_time, activeTotal)}
              color="#F59E0B"
              onClick={() => onDrill({ status: 'Active', contract_type: 'Part-time' })}
            />
          </div>
        </section>
      )}

      {/* Active staff — breakdown bar charts */}
      {s && (
        <section className="card p-6 space-y-6">
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="chip-success"><BadgeCheck className="w-3 h-3" /> Active staff</span>
              <h3 className="text-[15px] font-semibold text-ink-900 dark:text-white">Breakdown</h3>
            </div>
            <p className="text-[12px] text-ink-500 mt-1">
              {fmt(activeTotal)} active staff only. Click a bar to open the list pre-filtered.
            </p>
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
            <BreakdownChart
              title="By department"
              rows={s.active_breakdown?.by_department}
              color="#0A2A5E"
              onPick={(r) => onDrill({ status: 'Active', department: r.value })}
            />
            <BreakdownChart
              title="By role"
              rows={s.active_breakdown?.by_position}
              color="#4FB4FF"
              onPick={(r) => onDrill({ status: 'Active', position: r.value })}
            />
            <BreakdownChart
              title="By contract"
              rows={s.active_breakdown?.by_contract}
              color="#F5C400"
              onPick={(r) => onDrill({ status: 'Active', contract_type: r.value })}
            />
          </div>
        </section>
      )}
    </div>
  )
}

function BreakdownChart({
  title, rows, color, onPick,
}: {
  title: string
  rows?: HrBreakdownRow[]
  color: string
  onPick: (row: HrBreakdownRow) => void
}) {
  const data: BarDatum[] = (rows ?? []).map((r) => {
    const text = (r.label && String(r.label).trim()) ? String(r.label) : r.value
    return { value: r.value, label: text, total: Number(r.total) || 0, color }
  })

  return (
    <div className="rounded-lg border border-ink-100 dark:border-ink-700 p-4 bg-white dark:bg-ink-800">
      <h4 className="text-[13px] font-semibold text-ink-700 dark:text-ink-200 mb-3">{title}</h4>
      {data.length === 0 ? (
        <p className="text-[12px] text-ink-400 py-8 text-center">No data.</p>
      ) : (
        <BarChart
          data={data}
          onPick={(d) => {
            const original = (rows ?? []).find((r) => r.value === d.value)
            if (original) onPick(original)
          }}
        />
      )}
    </div>
  )
}

/* ─────────────────────────────────────────────────────────────
   Staff list tab — search + filters + table (unchanged)
   ───────────────────────────────────────────────────────────── */
function AllTab({ stats }: { stats: HrStats | null }) {
  const [sp, setSp] = useSearchParams()
  const facets = stats?.facets

  const q          = sp.get('q') ?? ''
  const status     = sp.get('status') ?? ''
  const gender     = sp.get('gender') ?? ''
  const department = sp.get('department') ?? ''
  const position   = sp.get('position') ?? ''
  const contract   = sp.get('contract_type') ?? ''
  const joined30   = sp.get('joined_last_30d') === '1'
  const sort_by    = sp.get('sort_by') ?? ''
  const sort_dir   = (sp.get('sort_dir') as 'asc' | 'desc') ?? 'desc'
  const page       = Math.max(1, Number(sp.get('page') || 1))

  const debouncedQ = useDebounce(q, 350)

  const update = (patch: Record<string, string | undefined>) => {
    const next = new URLSearchParams(sp)
    Object.entries(patch).forEach(([k, v]) => {
      if (v) next.set(k, v)
      else next.delete(k)
    })
    next.delete('page')
    setSp(next, { replace: false })
  }

  const setPage = (p: number) => {
    const next = new URLSearchParams(sp)
    next.set('page', String(p))
    setSp(next, { replace: false })
  }

  const handleSort = (field: string) => {
    if (sort_by === field) {
      if (sort_dir === 'asc') {
        update({ sort_by: field, sort_dir: 'desc' })
      } else {
        update({ sort_by: '', sort_dir: '' })
      }
    } else {
      update({ sort_by: field, sort_dir: 'asc' })
    }
  }

  const listParams: HrListParams = useMemo(() => ({
    page,
    per_page: PER_PAGE,
    q:               debouncedQ || undefined,
    status:          status || undefined,
    gender:          gender || undefined,
    department:      department || undefined,
    position:        position || undefined,
    contract_type:   contract || undefined,
    joined_last_30d: joined30 ? 1 : undefined,
    sort_by:         sort_by || undefined,
    sort_dir:        sort_dir || undefined,
  }), [page, debouncedQ, status, gender, department, position, contract, joined30, sort_by, sort_dir])

  const listQ = useQuery({
    queryKey: ['hr-employees', listParams],
    queryFn:  () => hrService.listEmployees(listParams),
    placeholderData: (prev) => prev,
  })

  const rows  = listQ.data?.data?.data ?? []
  const total = listQ.data?.data?.total ?? 0
  const last  = listQ.data?.data?.last_page ?? 1

  const activeFilterCount = [status, gender, department, position, contract, joined30 ? '1' : '']
    .filter(Boolean).length

  const clearAll = () => setSp({ tab: 'all' }, { replace: false })

  // Inject "Not specified" option into gender/department/position filter facets
  const withUnknown = (opts?: FacetOption[]): FacetOption[] => {
    const base = opts ?? []
    return [...base, { value: 'unknown', label: 'Not specified' }]
  }

  const STATUS_PILLS = [
    { value: '',           label: 'All',        activeCls: 'bg-brand text-white shadow-sm' },
    { value: 'Active',     label: 'Active',     activeCls: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400' },
    { value: 'Inactive',   label: 'Inactive',   activeCls: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400' },
    { value: 'Terminated', label: 'Terminated', activeCls: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-400' },
  ]

  return (
    <div className="space-y-5">
      <section className="card p-4">
        {/* Status filter pills */}
        <div className="flex items-center gap-1.5 flex-wrap mb-3">
          <span className="text-[11px] uppercase tracking-wider text-ink-400 mr-1">Status</span>
          {STATUS_PILLS.map((pill) => (
            <button
              key={pill.label}
              onClick={() => update({ status: pill.value })}
              className={`px-3 py-1 rounded-full text-[12px] font-medium transition-colors ${
                status === pill.value
                  ? pill.activeCls
                  : 'text-ink-500 dark:text-ink-400 hover:bg-ink-100 dark:hover:bg-ink-700/40'
              }`}
            >
              {pill.label}
            </button>
          ))}
        </div>

        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div className="flex flex-col md:flex-row items-center gap-2 w-full md:w-auto flex-1">
            <div className="relative w-full md:w-80">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-400 pointer-events-none" />
              <input
                value={q}
                onChange={(e) => update({ q: e.target.value })}
                placeholder="Search name, code, email…"
                className="input pl-9"
              />
            </div>
          </div>

          <div className="flex items-center gap-2 text-[12.5px] text-ink-500 shrink-0">
            <Filter className="w-3.5 h-3.5" />
            <span>{total.toLocaleString()} result{total === 1 ? '' : 's'}</span>
            {activeFilterCount > 0 && (
              <button onClick={clearAll} className="btn-secondary btn-sm">
                <X className="w-3 h-3" /> Clear filters
              </button>
            )}
          </div>
        </div>

        <div className="mt-3 grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-2">
          <FilterSelect label="Department"    value={department} onChange={(v) => update({ department:    v })} options={withUnknown(facets?.department)} />
          <FilterSelect label="Position"      value={position}   onChange={(v) => update({ position:      v })} options={withUnknown(facets?.position)} />
          <FilterSelect label="Contract"      value={contract}   onChange={(v) => update({ contract_type: v })} options={facets?.contract_type} />
          <FilterSelect label="Gender"        value={gender}     onChange={(v) => update({ gender:        v })} options={withUnknown(facets?.gender)} />
        </div>

        {joined30 && (
          <div className="mt-3">
            <span className="inline-flex items-center gap-1.5 chip-primary">
              <UserPlus className="w-3 h-3" /> Joined in last 30 days
              <button onClick={() => update({ joined_last_30d: undefined })} className="ml-1">
                <X className="w-3 h-3" />
              </button>
            </span>
          </div>
        )}
      </section>

      <section className="card p-0 overflow-hidden">
        <Header
          title="Staff list"
          sub={`${total.toLocaleString()} employees${activeFilterCount ? ' · filtered' : ''}`}
          loading={listQ.isLoading || listQ.isFetching}
        />

        {listQ.isLoading ? (
          <Skel />
        ) : listQ.isError ? (
          <Empty label="Failed to load staff." />
        ) : rows.length === 0 ? (
          <Empty label={q || activeFilterCount ? 'No staff match your filters.' : 'No staff yet.'} />
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="data-table">
                <thead>
                  <tr>
                    <SortableHeader label="Employee" field="full_name" currentSort={sort_by} currentDir={sort_dir} onSort={handleSort} />
                    <SortableHeader label="Code" field="emp_code" currentSort={sort_by} currentDir={sort_dir} onSort={handleSort} />
                    <SortableHeader label="Department / Role" field="department" currentSort={sort_by} currentDir={sort_dir} onSort={handleSort} />
                    <SortableHeader label="Contract" field="contract_type" currentSort={sort_by} currentDir={sort_dir} onSort={handleSort} />
                    <SortableHeader label="Contact" field="email" currentSort={sort_by} currentDir={sort_dir} onSort={handleSort} />
                    <SortableHeader label="Status" field="status" currentSort={sort_by} currentDir={sort_dir} onSort={handleSort} />
                    <th className="w-20"></th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((e) => <EmployeeRow key={e.id} e={e} />)}
                </tbody>
              </table>
            </div>
            <Pager page={page} last={last} onPage={setPage} />
          </>
        )}
      </section>
    </div>
  )
}

function EmployeeRow({ e }: { e: HrEmployee }) {
  const qc = useQueryClient()
  const canManage = useAnyPermission([PERMISSIONS.MANAGE_HR_EMPLOYEES, PERMISSIONS.VIEW_HR_EMPLOYEES])
  const [editOpen, setEditOpen] = useState(false)

  const isUser = e.source === 'user'
  const initials = e.full_name?.split(' ').map((p) => p[0]).slice(0, 2).join('').toUpperCase() || 'E'
  const currentStatus = e.status || ''
  const isActive = currentStatus.toLowerCase() === 'active'
  const isTerminated = !isActive && currentStatus.toLowerCase() !== 'inactive'

  const statusMut = useMutation({
    mutationFn: (s: string) => hrService.changeEmployeeStatus(e.id, s),
    onSuccess: (_d, s) => {
      toast.success(`Status changed to ${s}`)
      qc.invalidateQueries({ queryKey: ['hr-employees'] })
      qc.invalidateQueries({ queryKey: ['hr-stats'] })
    },
    onError: () => toast.error('Failed to update status'),
  })

  return (
    <tr>
      <td>
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-md bg-brand/10 text-brand dark:bg-brand/25 dark:text-gold-400 flex items-center justify-center font-semibold text-[12px] shrink-0">
            {initials}
          </div>
          <div className="min-w-0">
            <p className="font-semibold text-ink-900 dark:text-ink-100 truncate">{e.full_name}</p>
            <p className="text-[11.5px] text-ink-500 truncate">
              {e.gender === 'M' ? 'Male' : e.gender === 'F' ? 'Female' : '—'}
            </p>
          </div>
        </div>
      </td>
      <td><span className="font-mono text-[12px]">{e.emp_code}</span></td>
      <td>
        <div>
          <p className="text-[13px] text-ink-800 dark:text-ink-100">{e.department || '—'}</p>
          <p className="text-[11.5px] text-ink-500">{e.position || '—'}</p>
        </div>
      </td>
      <td>
        <div className="flex flex-col gap-0.5">
          <span className="text-[12.5px] text-ink-700 dark:text-ink-200">{e.contract_type || '—'}</span>
          <span className="text-[11px] text-ink-500 flex items-center gap-1">
            <Calendar className="w-3 h-3" />
            {e.start_date || '—'} → {e.end_date || 'open'}
          </span>
        </div>
      </td>
      <td>
        <div className="flex flex-col gap-0.5">
          {e.email && <span className="text-[12.5px] flex items-center gap-1 text-ink-700 dark:text-ink-200"><Mail className="w-3 h-3 shrink-0" /> {e.email}</span>}
          {e.phone && <span className="text-[12px] flex items-center gap-1 text-ink-500"><Phone className="w-3 h-3 shrink-0" /> {e.phone}</span>}
          {!e.email && !e.phone && <span className="text-ink-400">—</span>}
        </div>
      </td>
      <td>
        {canManage && !isUser ? (
          <div className="flex items-center gap-1.5">
            {statusMut.isPending
              ? <Loader2 className="w-4 h-4 animate-spin text-ink-400" />
              : isActive
                ? <BadgeCheck className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                : isTerminated
                  ? <span className="w-2 h-2 rounded-full bg-red-400 shrink-0 inline-block" />
                  : <span className="w-2 h-2 rounded-full bg-amber-400 shrink-0 inline-block" />
            }
            <select
              value={currentStatus}
              onChange={(ev) => statusMut.mutate(ev.target.value)}
              disabled={statusMut.isPending}
              className={`input input-sm text-[12px] py-0.5 px-1.5 h-7 cursor-pointer ${
                isActive
                  ? 'text-emerald-700 dark:text-emerald-400'
                  : isTerminated
                    ? 'text-red-700 dark:text-red-400'
                    : 'text-amber-700 dark:text-amber-400'
              }`}
            >
              <option value="">Unknown</option>
              <option value="Active">Active</option>
              <option value="Inactive">Inactive</option>
              <option value="Terminated">Terminated</option>
            </select>
          </div>
        ) : (
          isActive
            ? <span className="chip-success"><BadgeCheck className="w-3 h-3" /> Active</span>
            : <span className="chip-soft">{currentStatus || 'Unknown'}</span>
        )}
      </td>
      <td>
        {isUser ? (
          // User-account row (no HR employee record) — manage it from Users.
          <div className="flex items-center gap-2">
            <span className="chip-soft text-[11px]">User account</span>
            <Link to="/users" className="btn-secondary btn-sm" title="Manage in Users">
              <Eye className="w-3.5 h-3.5" />
            </Link>
          </div>
        ) : (
          <div className="flex items-center gap-1">
            {canManage && (
              <button className="btn-secondary btn-sm" title="Edit" onClick={() => setEditOpen(true)}>
                <Pencil className="w-3.5 h-3.5" />
              </button>
            )}
            <Link to={`/hr/staff/${e.id}`} className="btn-secondary btn-sm" title="View details">
              <Eye className="w-3.5 h-3.5" />
            </Link>
          </div>
        )}
        {editOpen && !isUser && (
          <EditStaffModal
            employee={e}
            onClose={() => setEditOpen(false)}
            onSaved={() => setEditOpen(false)}
          />
        )}
      </td>
    </tr>
  )
}

/* ─────────────────────────────────────────────────────────────
   Edit staff modal
   ───────────────────────────────────────────────────────────── */
function EditStaffModal({ employee, onClose, onSaved }: { employee: HrEmployee; onClose: () => void; onSaved: () => void }) {
  const qc = useQueryClient()
  const e = employee as any
  const [form, setForm] = useState({
    emp_code:      e.emp_code      ?? '',
    first_name:    e.first_name    ?? e.full_name?.split(' ')[0] ?? '',
    last_name:     e.last_name     ?? e.full_name?.split(' ').slice(1).join(' ') ?? '',
    gender:        (e.gender as 'M' | 'F') || 'M',
    department:    e.department    ?? '',
    position:      e.position      ?? '',
    contract_type: (e.contract_type as HrEmployeePayload['contract_type']) || 'Permanent',
    start_date:    e.start_date    ?? '',
    end_date:      e.end_date      ?? '',
    salary:        e.salary        ?? 0,
    phone:         e.phone         ?? '',
    email:         e.email         ?? '',
    status:        ((e.status || 'Active') as HrEmployeePayload['status']),
    bank:          e.bank          ?? '',
    bank_account:  e.bank_account  ?? '',
  })

  const set = <K extends keyof typeof form>(k: K, v: typeof form[K]) =>
    setForm(prev => ({ ...prev, [k]: v }))

  const mut = useMutation({
    mutationFn: () => hrService.updateEmployee(employee.id, {
      ...form,
      salary:   Number(form.salary) || 0,
      end_date: form.end_date || null,
      phone:    form.phone   || null,
      email:    form.email   || null,
    } as any),
    onSuccess: () => {
      toast.success('Staff updated.')
      qc.invalidateQueries({ queryKey: ['hr-employees'] })
      qc.invalidateQueries({ queryKey: ['hr-stats'] })
      onSaved()
    },
    onError: (err: any) => toast.error(err?.response?.data?.message ?? 'Save failed'),
  })

  const F = ({ label, required: req, children }: { label: string; required?: boolean; children: React.ReactNode }) => (
    <label className="block">
      <span className="text-[12px] font-medium text-ink-700 dark:text-ink-300 mb-1 block">
        {label}{req && <span className="text-red-500 ml-1">*</span>}
      </span>
      {children}
    </label>
  )

  return (
    <ModalPortal>
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-ink-900/50 backdrop-blur-sm">
      <div className="bg-white dark:bg-ink-800 rounded-xl shadow-xl w-full max-w-2xl max-h-[92vh] overflow-hidden flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-ink-100 dark:border-ink-700">
          <div>
            <h3 className="text-[15px] font-semibold text-ink-900 dark:text-white">Edit — {employee.full_name}</h3>
            <p className="text-[12px] text-ink-500">Update information or change employment status</p>
          </div>
          <button onClick={onClose} className="icon-btn"><X className="w-4 h-4" /></button>
        </div>
        <form
          onSubmit={e => { e.preventDefault(); mut.mutate() }}
          className="flex-1 overflow-y-auto p-6 grid grid-cols-1 md:grid-cols-2 gap-4"
        >
          <F label="Employee code" required><input required className="input" value={form.emp_code} onChange={e => set('emp_code', e.target.value)} /></F>
          <F label="Gender">
            <select className="input" value={form.gender} onChange={e => set('gender', e.target.value as 'M' | 'F')}>
              <option value="M">Male</option>
              <option value="F">Female</option>
            </select>
          </F>
          <F label="First name (surname)" required><input required className="input" value={form.first_name} onChange={e => set('first_name', e.target.value)} /></F>
          <F label="Last name (given name)" required><input required className="input" value={form.last_name} onChange={e => set('last_name', e.target.value)} /></F>
          <F label="Department" required><input required className="input" value={form.department} onChange={e => set('department', e.target.value)} /></F>
          <F label="Position / Role" required><input required className="input" value={form.position} onChange={e => set('position', e.target.value)} /></F>
          <F label="Contract type">
            <select className="input" value={form.contract_type} onChange={e => set('contract_type', e.target.value as HrEmployeePayload['contract_type'])}>
              <option value="Permanent">Permanent</option>
              <option value="Temporal">Temporal</option>
              <option value="Part-time">Part-time</option>
            </select>
          </F>
          <F label="Start date"><input type="date" className="input" value={form.start_date} onChange={e => set('start_date', e.target.value)} /></F>
          <F label="End date"><input type="date" className="input" value={form.end_date || ''} onChange={e => set('end_date', e.target.value)} /></F>
          <F label="Salary (RWF)"><input type="number" min={0} className="input" value={form.salary} onChange={e => set('salary', Number(e.target.value))} /></F>
          <F label="Status">
            <select className="input" value={form.status} onChange={e => set('status', e.target.value as HrEmployeePayload['status'])}>
              <option value="Active">Active</option>
              <option value="Inactive">Inactive</option>
              <option value="Terminated">Terminated</option>
            </select>
          </F>
          <F label="Phone"><input className="input" placeholder="+250…" value={form.phone} onChange={e => set('phone', e.target.value)} /></F>
          <F label="Email"><input type="email" className="input" value={form.email} onChange={e => set('email', e.target.value)} /></F>

          <div className="md:col-span-2 pt-2 border-t border-ink-100 dark:border-ink-700">
            <p className="text-[11px] font-semibold text-ink-500 uppercase tracking-wider flex items-center gap-1.5 mb-3">
              <CreditCard className="w-3.5 h-3.5" /> Bank / Payment Info
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <F label="Bank name"><input className="input" placeholder="e.g. Bank of Kigali" value={form.bank} onChange={e => set('bank', e.target.value)} /></F>
              <F label="Account number"><input className="input" placeholder="Account #" value={form.bank_account} onChange={e => set('bank_account', e.target.value)} /></F>
            </div>
          </div>

          <div className="md:col-span-2 flex justify-end gap-2 pt-2 border-t border-ink-100 dark:border-ink-700">
            <button type="button" onClick={onClose} className="btn-secondary">Cancel</button>
            <button type="submit" disabled={mut.isPending} className="btn-primary">
              {mut.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              Save changes
            </button>
          </div>
        </form>
      </div>
    </div>
    </ModalPortal>
  )
}

/* ─────────────────────────────────────────────────────────────
   Add staff modal (unchanged)
   ───────────────────────────────────────────────────────────── */
function AddStaffModal({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const qc = useQueryClient()
  const [form, setForm] = useState<HrEmployeePayload>({
    emp_code:      '',
    first_name:    '',
    last_name:     '',
    gender:        'M',
    department:    '',
    position:      '',
    contract_type: 'Permanent',
    start_date:    new Date().toISOString().slice(0, 10),
    end_date:      '',
    salary:        0,
    phone:         '',
    email:         '',
    status:        'Active',
  })

  const mutation = useMutation({
    mutationFn: (payload: HrEmployeePayload) => hrService.createEmployee(payload),
    onSuccess: () => {
      toast.success('Staff member added')
      qc.invalidateQueries({ queryKey: ['hr-employees'] })
      qc.invalidateQueries({ queryKey: ['hr-stats'] })
      onSaved()
    },
    onError: (err: any) => {
      const msg = err?.response?.data?.message || 'Failed to create staff'
      toast.error(msg)
    },
  })

  const update = <K extends keyof HrEmployeePayload>(key: K, value: HrEmployeePayload[K]) =>
    setForm((f) => ({ ...f, [key]: value }))

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    const payload: HrEmployeePayload = {
      ...form,
      salary: Number(form.salary) || 0,
      end_date: form.end_date || null,
      phone: form.phone || null,
      email: form.email || null,
    }
    mutation.mutate(payload)
  }

  return (
    <ModalPortal>
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-ink-900/50 backdrop-blur-sm">
      <div className="bg-white dark:bg-ink-800 rounded-xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-ink-100 dark:border-ink-700">
          <div>
            <h3 className="text-[15px] font-semibold text-ink-900 dark:text-white">Add new staff</h3>
            <p className="text-[12px] text-ink-500">Enter employee details below</p>
          </div>
          <button onClick={onClose} className="icon-btn"><X className="w-4 h-4" /></button>
        </div>

        <form onSubmit={submit} className="flex-1 overflow-y-auto p-6 grid grid-cols-1 md:grid-cols-2 gap-4">
          <Field label="Employee code" required>
            <input required value={form.emp_code} onChange={(e) => update('emp_code', e.target.value)} className="input" placeholder="EMP-001" />
          </Field>
          <Field label="Gender" required>
            <select value={form.gender} onChange={(e) => update('gender', e.target.value as 'M' | 'F')} className="input">
              <option value="M">Male</option>
              <option value="F">Female</option>
            </select>
          </Field>
          <Field label="First name (surname)" required>
            <input required value={form.first_name} onChange={(e) => update('first_name', e.target.value)} className="input" placeholder="NTAGANDA" />
          </Field>
          <Field label="Last name (given name)" required>
            <input required value={form.last_name} onChange={(e) => update('last_name', e.target.value)} className="input" placeholder="Laurent" />
          </Field>

          <Field label="Department" required>
            <input required value={form.department} onChange={(e) => update('department', e.target.value)} className="input" placeholder="Computer Science" />
          </Field>

          <Field label="Position / Role" required>
            <input required value={form.position} onChange={(e) => update('position', e.target.value)} className="input" placeholder="Lecturer" />
          </Field>
          <Field label="Contract type" required>
            <select value={form.contract_type} onChange={(e) => update('contract_type', e.target.value as HrEmployeePayload['contract_type'])} className="input">
              <option value="Permanent">Permanent</option>
              <option value="Temporal">Temporal</option>
              <option value="Part-time">Part-time</option>
            </select>
          </Field>

          <Field label="Start date" required>
            <input required type="date" value={form.start_date} onChange={(e) => update('start_date', e.target.value)} className="input" />
          </Field>
          <Field label="End date">
            <input type="date" value={form.end_date || ''} onChange={(e) => update('end_date', e.target.value)} className="input" />
          </Field>

          <Field label="Salary (RWF)" required>
            <input required type="number" min={0} value={form.salary} onChange={(e) => update('salary', Number(e.target.value))} className="input" />
          </Field>
          <Field label="Status">
            <select value={form.status} onChange={(e) => update('status', e.target.value as HrEmployeePayload['status'])} className="input">
              <option value="Active">Active</option>
              <option value="Inactive">Inactive</option>
              <option value="Terminated">Terminated</option>
            </select>
          </Field>

          <Field label="Phone">
            <input value={form.phone || ''} onChange={(e) => update('phone', e.target.value)} className="input" placeholder="+250…" />
          </Field>
          <Field label="Email">
            <input type="email" value={form.email || ''} onChange={(e) => update('email', e.target.value)} className="input" placeholder="name@cur.ac.rw" />
          </Field>

          <div className="md:col-span-2 flex items-center justify-end gap-2 pt-2 border-t border-ink-100 dark:border-ink-700">
            <button type="button" onClick={onClose} className="btn-secondary">Cancel</button>
            <button type="submit" disabled={mutation.isPending} className="btn-primary">
              {mutation.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
              Save staff
            </button>
          </div>
        </form>
      </div>
    </div>
    </ModalPortal>
  )
}

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-[12px] font-medium text-ink-700 dark:text-ink-300 mb-1 block">
        {label} {required && <span className="text-red-500">*</span>}
      </span>
      {children}
    </label>
  )
}

/* ─────────────────────────────────────────────────────────────
   Shared UI bits
   ───────────────────────────────────────────────────────────── */
function TabButton({
  active, icon: Icon, label, onClick,
}: {
  active: boolean
  icon:   React.ComponentType<{ className?: string }>
  label:  string
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 px-3 py-2 text-[13px] rounded-md transition-colors ${
        active
          ? 'bg-brand text-white font-semibold shadow-sm'
          : 'text-ink-600 dark:text-ink-300 hover:text-ink-900 hover:bg-ink-50 dark:hover:text-white dark:hover:bg-ink-700/40'
      }`}
    >
      <Icon className="w-3.5 h-3.5" />
      {label}
    </button>
  )
}


function LegendCard({
  label, value, percent, color, onClick,
}: {
  label: string
  value: number
  percent: number
  color: string
  onClick?: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!onClick}
      className="text-left rounded-lg border border-ink-100 dark:border-ink-700 px-4 py-3 bg-white dark:bg-ink-800 hover:border-brand/40 hover:bg-brand/5 transition-colors disabled:cursor-default"
    >
      <div className="flex items-center gap-2">
        <span className="w-3 h-3 rounded-full" style={{ backgroundColor: color }} />
        <span className="text-[12.5px] font-medium text-ink-700 dark:text-ink-200">{label}</span>
        <span className="ml-auto text-[11px] text-ink-400 tabular-nums">{percent}%</span>
      </div>
      <p className="text-[22px] font-semibold text-ink-900 dark:text-white tabular-nums mt-1">
        {value.toLocaleString()}
      </p>
    </button>
  )
}

function PercentCard({
  label, value, percent, color, onClick,
}: {
  label: string
  value: number
  percent: number
  color: string
  onClick?: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!onClick}
      className="group relative overflow-hidden text-left w-full rounded-xl border border-ink-100 dark:border-ink-700 bg-white dark:bg-ink-800 p-5 hover:border-brand/40 hover:shadow-sm transition-all disabled:cursor-default"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: color }} />
            <span className="text-[12px] uppercase tracking-wider font-semibold text-ink-500">
              {label}
            </span>
          </div>
          <p className="mt-2 text-[30px] font-semibold text-ink-900 dark:text-white tabular-nums leading-none">
            {value.toLocaleString()}
          </p>
          <p className="text-[12px] text-ink-500 mt-1">active staff</p>
        </div>

        <div
          className="shrink-0 rounded-full px-3 py-1 text-[12px] font-semibold tabular-nums"
          style={{ color, backgroundColor: `${color}1A` }}
        >
          {percent}%
        </div>
      </div>

      <div className="mt-4 h-2 rounded-full bg-ink-100 dark:bg-ink-700/50 overflow-hidden">
        <div
          className="h-full rounded-full transition-[width] duration-500"
          style={{ width: `${percent}%`, backgroundColor: color }}
        />
      </div>
    </button>
  )
}

function StatusSummaryCard({
  label, value, color, chipLabel, chipCls, onClick,
}: {
  label: string
  value: number
  color: string
  chipLabel: string
  chipCls: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="text-left w-full rounded-xl border border-ink-100 dark:border-ink-700 bg-white dark:bg-ink-800 p-4 hover:border-brand/40 hover:shadow-sm hover:-translate-y-0.5 transition-all"
    >
      <div className="flex items-center justify-between gap-2 mb-2">
        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold ${chipCls}`}>
          {chipLabel}
        </span>
        <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: color }} />
      </div>
      <p className="text-[28px] font-bold text-ink-900 dark:text-white tabular-nums leading-none">
        {value.toLocaleString()}
      </p>
      <p className="text-[12px] text-ink-500 mt-1">{label}</p>
    </button>
  )
}

function FilterSelect({
  label, value, onChange, options,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  options?: FacetOption[]
}) {
  return (
    <div className="block">
      <span className="text-[11px] uppercase tracking-wider text-ink-400 block mb-1">{label}</span>
      <SearchableSelect
        options={options ?? []}
        value={value}
        onChange={(v) => onChange(v === 0 || v === '' ? '' : String(v))}
        allLabel="All"
        placeholder="All"
      />
    </div>
  )
}

function Header({ title, sub, loading }: { title: string; sub: string; loading: boolean }) {
  return (
    <div className="flex items-center justify-between gap-4 px-6 pt-5 pb-3 border-b border-ink-100 dark:border-ink-700">
      <div>
        <h2 className="section-title">{title}</h2>
        <p className="section-sub">{sub}</p>
      </div>
      {loading && <Loader2 className="w-4 h-4 text-ink-400 animate-spin" />}
    </div>
  )
}

function Empty({ label }: { label: string }) {
  return <div className="p-10 text-center text-ink-500 text-[13px]">{label}</div>
}

function Skel() {
  return (
    <div className="p-6 space-y-2">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="h-10 rounded-md bg-ink-50 dark:bg-ink-700/30 animate-pulse" />
      ))}
    </div>
  )
}

function SortableHeader({
  label, field, currentSort, currentDir, onSort
}: {
  label: string
  field: string
  currentSort: string
  currentDir: 'asc' | 'desc'
  onSort: (field: string) => void
}) {
  const active = currentSort === field
  return (
    <th 
      onClick={() => onSort(field)}
      className="cursor-pointer group hover:bg-ink-50/50 dark:hover:bg-ink-800/50 transition-colors select-none"
    >
      <div className="flex items-center gap-1.5">
        {label}
        <span className={`flex flex-col text-[8px] leading-[8px] ${active ? 'text-brand' : 'text-ink-300 opacity-0 group-hover:opacity-100'}`}>
          <span className={active && currentDir === 'asc' ? 'text-brand' : 'text-ink-300'}>▲</span>
          <span className={active && currentDir === 'desc' ? 'text-brand' : 'text-ink-300'}>▼</span>
        </span>
      </div>
    </th>
  )
}

function fmt(n?: number | null): string {
  if (n === null || n === undefined) return '—'
  const num = typeof n === 'string' ? Number(n) : n
  if (Number.isNaN(num)) return '—'
  return num.toLocaleString()
}

function Pager({ page, last, onPage }: { page: number; last: number; onPage: (p: number) => void }) {
  if (last <= 1) return null
  return (
    <div className="flex items-center justify-between px-6 py-3 border-t border-ink-100 dark:border-ink-700 text-[12.5px] text-ink-500">
      <span>Page {page} of {last}</span>
      <div className="flex gap-1">
        <button className="btn-secondary btn-sm" onClick={() => onPage(Math.max(1, page - 1))} disabled={page <= 1}>
          <ArrowLeft className="w-3 h-3" /> Prev
        </button>
        <button className="btn-secondary btn-sm" onClick={() => onPage(Math.min(last, page + 1))} disabled={page >= last}>
          Next <ArrowRight className="w-3 h-3" />
        </button>
      </div>
    </div>
  )
}

function pct(part: number, total: number): number {
  if (!total) return 0
  return Math.round((part / total) * 100)
}
