import { useMemo, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, Pencil, Trash2, Loader2, Search } from 'lucide-react'
import toast from 'react-hot-toast'
import { moduleCatalogService } from '@/services/modulesService'
import { academicsMgmtService } from '@/services/academicsMgmtService'
import type { Module } from '@/types/modules'
import ModuleFormModal from './ModuleFormModal'
import { PERMISSIONS } from '@/constants'
import { usePermission } from '@/utils/permissions'
import { useLevels } from '@/hooks/useLevels'

type Status = '' | 'draft' | 'active' | 'archived'

export default function ModulesCatalogPage() {
  const canManage = usePermission(PERMISSIONS.MANAGE_MODULES)
  const qc = useQueryClient()
  const [filters, setFilters] = useState<{ q: string; status: Status; level: string; department: string }>({
    q: '', status: '', level: '', department: '',
  })
  const [page, setPage] = useState(1)
  const perPage = 20
  const { levels, levelName } = useLevels()

  // Load departments for the filter dropdown and for mapping dep_id → dep_name
  const deptsQ = useQuery({
    queryKey: ['academics', 'departments'],
    queryFn: () => academicsMgmtService.list<any>('departments', { per_page: 100 }),
  })
  const departments = deptsQ.data?.data?.data ?? []
  const deptMap = useMemo(() => {
    const m = new Map<number, string>()
    departments.forEach((d: any) => m.set(Number(d.dep_id), d.dep_name))
    return m
  }, [departments])

  const q = useQuery({
    queryKey: ['modules', 'catalog', filters, page],
    queryFn: () =>
      moduleCatalogService.list({
        page,
        per_page: perPage,
        q: filters.q || undefined,
        status: (filters.status || undefined) as any,
        level: filters.level ? Number(filters.level) : undefined,
        department: filters.department ? Number(filters.department) : undefined,
      }),
  })

  const [editing, setEditing] = useState<Partial<Module> | null>(null)

  const remove = useMutation({
    mutationFn: (id: number) => moduleCatalogService.remove(id),
    onSuccess: () => {
      toast.success('Module deleted')
      qc.invalidateQueries({ queryKey: ['modules', 'catalog'] })
    },
    onError: (e: any) => toast.error(e?.response?.data?.message ?? 'Delete failed'),
  })

  const rows = q.data?.data?.data ?? []
  const total = q.data?.data?.total ?? 0
  const lastPage = q.data?.data?.last_page ?? 1

  return (
    <div className="space-y-4 animate-fade-in">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-lg font-bold text-ink-900 dark:text-white">Modules Catalog</h2>
          <p className="text-[13px] text-ink-500">The full list of modules offered across departments.</p>
        </div>
        {canManage && (
          <button className="btn-primary btn-sm" onClick={() => setEditing({})}>
            <Plus className="w-3.5 h-3.5" /> New module
          </button>
        )}
      </div>

      {/* Filters */}
      <div className="card p-3 flex gap-2 flex-wrap items-end">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-ink-400" />
          <input
            type="text"
            placeholder="Search code or title…"
            className="input input-sm pl-8 w-full"
            value={filters.q}
            onChange={(e) => { setFilters({ ...filters, q: e.target.value }); setPage(1) }}
          />
        </div>
        {/* Picks by name, still filters by `levels.id` — the backend compares ids. */}
        <select
          className="input input-sm w-40"
          value={filters.level}
          onChange={(e) => { setFilters({ ...filters, level: e.target.value }); setPage(1) }}
        >
          <option value="">All levels</option>
          {levels.map((l) => (
            <option key={l.id} value={String(l.id)}>{l.name}</option>
          ))}
        </select>
        <select
          className="input input-sm w-48"
          value={filters.department}
          onChange={(e) => { setFilters({ ...filters, department: e.target.value }); setPage(1) }}
        >
          <option value="">All departments</option>
          {departments.map((d: any) => (
            <option key={d.dep_id} value={d.dep_id}>{d.dep_name}</option>
          ))}
        </select>
        <select
          className="input input-sm w-32"
          value={filters.status}
          onChange={(e) => { setFilters({ ...filters, status: e.target.value as Status }); setPage(1) }}
        >
          <option value="">Any status</option>
          <option value="active">Active</option>
          <option value="draft">Draft</option>
          <option value="archived">Archived</option>
        </select>
      </div>

      <div className="card overflow-hidden">
        <table className="w-full text-left text-[13px]">
          <thead>
            <tr className="bg-ink-50 dark:bg-ink-800/50 border-b border-ink-100 dark:border-ink-700">
              <th className="px-4 py-2.5 font-bold text-ink-400 uppercase tracking-wider text-[10px]">Code</th>
              <th className="px-4 py-2.5 font-bold text-ink-400 uppercase tracking-wider text-[10px]">Title</th>
              <th className="px-4 py-2.5 font-bold text-ink-400 uppercase tracking-wider text-[10px]">Credits</th>
              <th className="px-4 py-2.5 font-bold text-ink-400 uppercase tracking-wider text-[10px]">Level</th>
              <th className="px-4 py-2.5 font-bold text-ink-400 uppercase tracking-wider text-[10px]">Department</th>
              <th className="px-4 py-2.5 font-bold text-ink-400 uppercase tracking-wider text-[10px]">Learning Mode</th>
              <th className="px-4 py-2.5 font-bold text-ink-400 uppercase tracking-wider text-[10px]">Prereqs</th>
              <th className="px-4 py-2.5 font-bold text-ink-400 uppercase tracking-wider text-[10px]">Status</th>
              <th className="px-4 py-2.5 font-bold text-ink-400 uppercase tracking-wider text-[10px] text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-ink-100 dark:divide-ink-700">
            {q.isLoading ? (
              <tr><td colSpan={9} className="p-8 text-center">
                <Loader2 className="w-6 h-6 animate-spin mx-auto text-brand" />
              </td></tr>
            ) : rows.length === 0 ? (
              <tr><td colSpan={9} className="p-8 text-center text-ink-400">No modules match the filter.</td></tr>
            ) : rows.map((m) => (
              <tr key={m.module_id} className="hover:bg-ink-50/50 dark:hover:bg-ink-700/20">
                <td className="px-4 py-3 font-mono text-ink-900 dark:text-white">{m.module_code}</td>
                <td className="px-4 py-3 font-semibold">{m.module_name}</td>
                <td className="px-4 py-3">{String(m.module_credits)}</td>
                <td className="px-4 py-3">{(m as any).level_name ?? levelName(m.level)}</td>
                <td className="px-4 py-3 text-ink-500">
                  {deptMap.get(Number(m.department)) ?? `#${m.department}`}
                </td>
                <td className="px-4 py-3">
                  <span className={`chip-xs ${
                    m.learning_mode === 'weekend' ? 'bg-orange-100 text-orange-700 dark:bg-orange-500/20 dark:text-orange-400'
                    : m.learning_mode === 'holiday' ? 'bg-blue-100 text-blue-700 dark:bg-blue-500/20 dark:text-blue-400'
                    : 'bg-slate-100 text-slate-700 dark:bg-slate-500/20 dark:text-slate-400'
                  }`}>
                    {m.learning_mode ? m.learning_mode.charAt(0).toUpperCase() + m.learning_mode.slice(1) : 'Day'}
                  </span>
                </td>
                <td className="px-4 py-3 text-ink-500">
                  {(m.prerequisites ?? []).length === 0
                    ? '—'
                    : (m.prerequisites ?? []).map((p) => p.module_code).join(', ')}
                </td>
                <td className="px-4 py-3">
                  <span className={`chip-xs ${m.status === 'active'
                    ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-400'
                    : m.status === 'draft'
                      ? 'bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-400'
                      : 'bg-ink-100 text-ink-600 dark:bg-ink-700 dark:text-ink-400'}`}>
                    {m.status}
                  </span>
                </td>
                <td className="px-4 py-3 text-right">
                  {canManage && (
                    <div className="flex items-center justify-end gap-1">
                      <button className="icon-btn" onClick={() => setEditing(m)}>
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                      <button
                        className="icon-btn text-red-500 hover:bg-red-50"
                        onClick={() => confirm(`Delete module ${m.module_code}?`) && remove.mutate(m.module_id)}
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

      {/* Pagination */}
      {lastPage > 1 && (
        <div className="flex items-center justify-between text-[13px]">
          <span className="text-ink-500">{total} module{total === 1 ? '' : 's'}</span>
          <div className="flex items-center gap-2">
            <button className="btn-ghost btn-sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Prev</button>
            <span className="text-ink-500">{page} / {lastPage}</span>
            <button className="btn-ghost btn-sm" disabled={page >= lastPage} onClick={() => setPage((p) => p + 1)}>Next</button>
          </div>
        </div>
      )}

      {editing !== null && (
        <ModuleFormModal
          module={editing}
          onClose={() => setEditing(null)}
          onSuccess={() => {
            setEditing(null)
            qc.invalidateQueries({ queryKey: ['modules', 'catalog'] })
          }}
        />
      )}
    </div>
  )
}
