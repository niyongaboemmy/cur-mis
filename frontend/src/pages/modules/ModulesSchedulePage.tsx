import { useEffect, useMemo, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { AlertTriangle, Trash2, Pencil, Plus, Loader2, Search, ChevronDown, X, Filter } from 'lucide-react'
import SearchableSelect from '@/components/ui/SearchableSelect'
import { moduleScheduleService, moduleCatalogService } from '@/services/modulesService'
import { academicService } from '@/services/academicService'
import { academicsMgmtService } from '@/services/academicsMgmtService'
import { portalService } from '@/services/admissionService'
import type { Module, ModuleScheduleRow, ScheduleConflict, SchedulePayload } from '@/types/modules'

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const EMPTY: SchedulePayload = { module_id: 0, academic_term_id: 0, room_id: 0, day_of_week: 1, start_time: '08:00', end_time: '10:00', session_type: 'lecture' }

export default function ModulesSchedulePage() {
  const qc = useQueryClient()

  // ── Data sources ──
  const termsQ = useQuery({ queryKey: ['academic', 'terms'], queryFn: () => academicService.listTerms() })
  const terms = termsQ.data?.data ?? []
  const [termId, setTermId] = useState(0)
  useEffect(() => { if (!termId && terms.length) { setTermId((terms.find((t: any) => t.is_current) ?? terms[0]).id) } }, [terms, termId])

  const modulesQ = useQuery({ queryKey: ['modules', 'catalog-all'], queryFn: () => moduleCatalogService.list({ per_page: 500, status: 'active' }) })
  const allModules: Module[] = modulesQ.data?.data?.data ?? []

  const roomsQ = useQuery({ queryKey: ['facilities'], queryFn: () => academicsMgmtService.list<any>('facility', { per_page: 100 }) })
  const rooms = roomsQ.data?.data?.data ?? []

  const facultiesQ = useQuery({ queryKey: ['portal', 'faculties'], queryFn: () => portalService.getFaculties() })
  const faculties: any[] = facultiesQ.data?.data ?? []

  const deptsQ = useQuery({ queryKey: ['academics', 'departments'], queryFn: () => academicsMgmtService.list<any>('departments', { per_page: 200 }) })
  const departments: any[] = deptsQ.data?.data?.data ?? []

  const deptMap = useMemo(() => { const m = new Map<number, { dep_name: string; fac_id: number }>(); departments.forEach((d: any) => m.set(Number(d.dep_id), { dep_name: d.dep_name, fac_id: Number(d.fac_id) })); return m }, [departments])
  const moduleDeptMap = useMemo(() => { const m = new Map<number, number>(); allModules.forEach((mod) => m.set(mod.module_id, Number(mod.department ?? 0))); return m }, [allModules])

  const schedulesQ = useQuery({ queryKey: ['modules', 'schedules', termId], queryFn: () => moduleScheduleService.list({ term_id: termId }), enabled: !!termId })
  const allSchedules: ModuleScheduleRow[] = schedulesQ.data?.data ?? []

  // ── Global filters ──
  const [gFaculty, setGFaculty] = useState(0)
  const [gDept, setGDept] = useState(0)
  const [gSearch, setGSearch] = useState('')

  const filteredDepts = useMemo(() => gFaculty ? departments.filter((d: any) => Number(d.fac_id) === gFaculty) : departments, [departments, gFaculty])
  const gDeptIds = useMemo(() => {
    if (gDept) return new Set([gDept])
    if (gFaculty) return new Set(filteredDepts.map((d: any) => Number(d.dep_id)))
    return null
  }, [gDept, gFaculty, filteredDepts])

  const filteredModules = useMemo(() => {
    let list = allModules
    if (gDeptIds) list = list.filter((m) => gDeptIds.has(Number(m.department)))
    if (gSearch.trim()) { const q = gSearch.toLowerCase(); list = list.filter((m) => m.module_code.toLowerCase().includes(q) || m.module_name.toLowerCase().includes(q)) }
    return list
  }, [allModules, gDeptIds, gSearch])

  const filteredSchedules = useMemo(() => {
    if (!gDeptIds) return allSchedules
    return allSchedules.filter((s) => gDeptIds.has(moduleDeptMap.get(s.module_id) ?? 0))
  }, [allSchedules, gDeptIds, moduleDeptMap])

  // ── Form state ──
  const [draft, setDraft] = useState<SchedulePayload>(EMPTY)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [conflicts, setConflicts] = useState<ScheduleConflict[]>([])
  const [pickerOpen, setPickerOpen] = useState(false)

  useEffect(() => { if (termId) setDraft((d) => ({ ...d, academic_term_id: termId })) }, [termId])

  useEffect(() => {
    if (!draft.module_id || !draft.room_id || !draft.academic_term_id) { setConflicts([]); return }
    const h = setTimeout(async () => { try { const r = await moduleScheduleService.checkConflicts({ ...draft, ignore_id: editingId ?? undefined }); setConflicts(r.data?.conflicts ?? []) } catch {} }, 400)
    return () => clearTimeout(h)
  }, [draft, editingId])

  const save = useMutation({
    mutationFn: () => (editingId ? moduleScheduleService.update(editingId, draft) : moduleScheduleService.create(draft)) as Promise<any>,
    onSuccess: () => { toast.success(editingId ? 'Schedule updated' : 'Schedule added'); setDraft({ ...EMPTY, academic_term_id: termId }); setEditingId(null); setConflicts([]); qc.invalidateQueries({ queryKey: ['modules', 'schedules', termId] }) },
    onError: (e: any) => { const c = e?.response?.data?.errors?.conflicts; if (c) { setConflicts(c); toast.error('Conflicts detected') } else toast.error(e?.response?.data?.message ?? 'Save failed') },
  })
  const remove = useMutation({ mutationFn: (id: number) => moduleScheduleService.remove(id), onSuccess: () => { toast.success('Removed'); qc.invalidateQueries({ queryKey: ['modules', 'schedules', termId] }) } })

  const editEntry = (row: ModuleScheduleRow) => { setEditingId(row.id); setDraft({ module_id: row.module_id, academic_term_id: row.academic_term_id, room_id: row.room_id, day_of_week: row.day_of_week, start_time: row.start_time.slice(0, 5), end_time: row.end_time.slice(0, 5), session_type: row.session_type, notes: row.notes ?? undefined }) }

  const selectedModule = allModules.find((m) => m.module_id === draft.module_id)
  const canSubmit = draft.module_id > 0 && draft.room_id > 0 && draft.academic_term_id > 0 && draft.start_time < draft.end_time && conflicts.length === 0
  const hasFilters = gFaculty > 0 || gDept > 0 || gSearch.trim().length > 0

  return (
    <div className="space-y-4 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-lg font-bold text-ink-900 dark:text-white">Modules Scheduling</h2>
          <p className="text-[13px] text-ink-500">Weekly timetable with live room conflict detection.</p>
        </div>
        <select className="input input-sm w-56" value={termId || ''} onChange={(e) => setTermId(Number(e.target.value))}>
          <option value="" disabled>Select term…</option>
          {terms.map((t: any) => <option key={t.id} value={t.id}>{t.label}{t.is_current ? ' (current)' : ''}</option>)}
        </select>
      </div>

      {/* ── Global filter bar ── */}
      <div className="card p-3">
        <div className="flex items-center gap-2 flex-wrap">
          <Filter className="w-4 h-4 text-ink-400 shrink-0" />
          <div className="relative flex-1 min-w-[200px]">
            <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-ink-400" />
            <input className="input input-sm pl-8 w-full" placeholder="Search modules by code or name…" value={gSearch} onChange={(e) => setGSearch(e.target.value)} />
          </div>
          <div className="w-56 shrink-0">
            <SearchableSelect
              options={faculties.map((f: any) => ({ value: f.id, label: f.name }))}
              value={gFaculty}
              onChange={(v) => { setGFaculty(Number(v)); setGDept(0) }}
              allLabel="All faculties"
            />
          </div>
          <div className="w-56 shrink-0">
            <SearchableSelect
              options={filteredDepts.map((d: any) => ({ value: d.dep_id, label: d.dep_name }))}
              value={gDept}
              onChange={(v) => setGDept(Number(v))}
              allLabel="All departments"
            />
          </div>
          {hasFilters && (
            <button className="icon-btn text-ink-400 hover:text-red-500" onClick={() => { setGFaculty(0); setGDept(0); setGSearch('') }} title="Clear all filters">
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
        {hasFilters && (
          <p className="text-[11px] text-ink-400 mt-1.5 ml-6">
            Showing {filteredModules.length} module{filteredModules.length !== 1 ? 's' : ''} · {filteredSchedules.length} schedule entr{filteredSchedules.length !== 1 ? 'ies' : 'y'}
          </p>
        )}
      </div>

      {!termId ? (
        <div className="card p-8 text-center text-ink-400">Pick an academic term to begin.</div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
          {/* ── Add/Edit Form ── */}
          <div className="card p-4 lg:col-span-2 space-y-3">
            <h3 className="font-semibold text-[13px] flex items-center gap-1.5">
              <Plus className="w-3.5 h-3.5" />
              {editingId ? 'Edit entry' : 'Add schedule entry'}
            </h3>

            {/* Module picker */}
            <div className="text-[13px]">
              <span className="text-ink-600 block mb-1">Module</span>
              <div className="relative">
                <button type="button" className="input input-sm w-full text-left flex items-center justify-between gap-2" onClick={() => setPickerOpen(!pickerOpen)}>
                  <span className={selectedModule ? 'text-ink-900 dark:text-white truncate' : 'text-ink-400'}>
                    {selectedModule ? `${selectedModule.module_code} — ${selectedModule.module_name}` : 'Pick a module…'}
                  </span>
                  <ChevronDown className={`w-3.5 h-3.5 text-ink-400 shrink-0 transition-transform ${pickerOpen ? 'rotate-180' : ''}`} />
                </button>
                {pickerOpen && (
                  <div className="absolute z-30 top-full left-0 right-0 mt-1 bg-white dark:bg-ink-900 border border-ink-200 dark:border-ink-700 rounded-lg shadow-xl overflow-hidden">
                    <div className="max-h-64 overflow-y-auto">
                      {filteredModules.length === 0 ? (
                        <p className="p-3 text-center text-ink-400 text-[12px]">No modules match filters.</p>
                      ) : filteredModules.map((m) => {
                        const dept = deptMap.get(Number(m.department))
                        return (
                          <button key={m.module_id} type="button"
                            className={`w-full text-left px-3 py-1.5 text-[12px] flex items-center gap-2 transition-colors ${draft.module_id === m.module_id ? 'bg-brand/10 text-brand' : 'hover:bg-ink-50 dark:hover:bg-ink-700/30'}`}
                            onClick={() => { setDraft({ ...draft, module_id: m.module_id }); setPickerOpen(false) }}>
                            <span className="font-mono font-semibold whitespace-nowrap">{m.module_code}</span>
                            <span className="text-ink-600 dark:text-ink-300 truncate flex-1">— {m.module_name}</span>
                            {dept && <span className="text-[10px] text-ink-400 whitespace-nowrap">{dept.dep_name}</span>}
                          </button>
                        )
                      })}
                    </div>
                    <div className="p-1.5 border-t border-ink-100 dark:border-ink-700 text-right">
                      <span className="text-[10px] text-ink-400">{filteredModules.length} modules</span>
                    </div>
                  </div>
                )}
              </div>
            </div>

            <label className="block text-[13px]">
              <span className="text-ink-600 block mb-1">Room</span>
              <select className="input input-sm w-full" value={draft.room_id || ''} onChange={(e) => setDraft({ ...draft, room_id: Number(e.target.value) })}>
                <option value="" disabled>Pick a room</option>
                {rooms.map((r: any) => <option key={r.id} value={r.id}>{r.name} {r.building ? `· ${r.building}` : ''} (cap {r.capacity})</option>)}
              </select>
            </label>

            <div className="grid grid-cols-3 gap-2">
              <label className="block text-[13px]">
                <span className="text-ink-600 block mb-1">Day</span>
                <select className="input input-sm w-full" value={draft.day_of_week} onChange={(e) => setDraft({ ...draft, day_of_week: Number(e.target.value) })}>
                  {DAYS.map((d, i) => <option key={i} value={i + 1}>{d}</option>)}
                </select>
              </label>
              <label className="block text-[13px]">
                <span className="text-ink-600 block mb-1">Start</span>
                <input type="time" className="input input-sm w-full" value={draft.start_time} onChange={(e) => setDraft({ ...draft, start_time: e.target.value })} />
              </label>
              <label className="block text-[13px]">
                <span className="text-ink-600 block mb-1">End</span>
                <input type="time" className="input input-sm w-full" value={draft.end_time} onChange={(e) => setDraft({ ...draft, end_time: e.target.value })} />
              </label>
            </div>

            <label className="block text-[13px]">
              <span className="text-ink-600 block mb-1">Session type</span>
              <select className="input input-sm w-full" value={draft.session_type} onChange={(e) => setDraft({ ...draft, session_type: e.target.value as any })}>
                <option value="lecture">Lecture</option>
                <option value="lab">Lab</option>
                <option value="tutorial">Tutorial</option>
                <option value="seminar">Seminar</option>
                <option value="exam">Exam</option>
              </select>
            </label>

            {conflicts.length > 0 && (
              <div className="border border-amber-200 bg-amber-50 dark:bg-amber-500/10 rounded-md p-3 text-[12.5px]">
                <div className="flex items-center gap-1.5 font-semibold text-amber-700 mb-1">
                  <AlertTriangle className="w-3.5 h-3.5" />
                  {conflicts.length} conflict{conflicts.length > 1 ? 's' : ''} — Save disabled
                </div>
                <ul className="space-y-0.5 text-amber-700">
                  {conflicts.map((c, i) => (
                    <li key={i}>
                      <span className="font-semibold">{c.type}</span>: {c.conflict_with.module_code} · {DAYS[c.conflict_with.day_of_week - 1]} {c.conflict_with.start_time.slice(0, 5)}–{c.conflict_with.end_time.slice(0, 5)}
                      {c.type === 'room' && c.conflict_with.room_name ? ` · ${c.conflict_with.room_name}` : ''}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div className="flex gap-2 pt-1">
              <button className="btn-primary btn-sm flex-1" disabled={!canSubmit || save.isPending} onClick={() => save.mutate()}>
                {save.isPending ? 'Saving…' : editingId ? 'Save changes' : 'Add entry'}
              </button>
              {editingId && <button className="btn-ghost btn-sm" onClick={() => { setEditingId(null); setDraft({ ...EMPTY, academic_term_id: termId }) }}>Cancel</button>}
            </div>
          </div>

          {/* ── Weekly Calendar ── */}
          <div className="card p-3 lg:col-span-3 overflow-x-auto">
            <h3 className="font-semibold text-[13px] mb-3">Weekly view</h3>
            {schedulesQ.isLoading ? (
              <div className="p-8 text-center"><Loader2 className="w-6 h-6 animate-spin mx-auto text-brand" /></div>
            ) : (
              <table className="w-full text-[12px]">
                <thead>
                  <tr>
                    {DAYS.map((d) => <th key={d} className="px-2 py-1.5 text-center font-bold text-ink-400 text-[10px] uppercase">{d}</th>)}
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    {DAYS.map((_, di) => {
                      const dayRows = filteredSchedules.filter((s) => s.day_of_week === di + 1).sort((a, b) => a.start_time.localeCompare(b.start_time))
                      return (
                        <td key={di} className="align-top p-1 border border-ink-100 dark:border-ink-700 min-w-[140px]">
                          {dayRows.length === 0 ? (
                            <span className="text-ink-300 text-[11px] block text-center py-2">—</span>
                          ) : dayRows.map((r) => {
                            const dept = deptMap.get(moduleDeptMap.get(r.module_id) ?? 0)
                            return (
                              <div key={r.id} className="rounded bg-brand/10 text-brand p-1.5 mb-1">
                                <div className="font-bold">{r.module_code}</div>
                                <div className="text-[11px]">{r.start_time.slice(0, 5)}–{r.end_time.slice(0, 5)} · {r.room_name}</div>
                                <div className="text-[10px] text-ink-500 capitalize">{r.session_type}</div>
                                {dept && <div className="text-[9px] text-ink-400 mt-0.5 truncate">{dept.dep_name}</div>}
                                <div className="mt-1 flex justify-end gap-1">
                                  <button className="icon-btn" title="Edit" onClick={() => editEntry(r)}><Pencil className="w-3 h-3" /></button>
                                  <button className="icon-btn text-red-500" onClick={() => confirm('Delete?') && remove.mutate(r.id)}><Trash2 className="w-3 h-3" /></button>
                                </div>
                              </div>
                            )
                          })}
                        </td>
                      )
                    })}
                  </tr>
                </tbody>
              </table>
            )}
          </div>

          {/* ── Schedule List (table view) ── */}
          <div className="card overflow-hidden lg:col-span-5">
            <div className="px-4 py-2.5 border-b border-ink-100 dark:border-ink-700 font-semibold text-[13px]">
              All scheduled entries ({filteredSchedules.length})
            </div>
            <table className="w-full text-left text-[13px]">
              <thead>
                <tr className="bg-ink-50 dark:bg-ink-800/50 border-b border-ink-100 dark:border-ink-700">
                  <th className="px-4 py-2 font-bold text-ink-400 text-[10px] uppercase">Module</th>
                  <th className="px-4 py-2 font-bold text-ink-400 text-[10px] uppercase">Department</th>
                  <th className="px-4 py-2 font-bold text-ink-400 text-[10px] uppercase">Day</th>
                  <th className="px-4 py-2 font-bold text-ink-400 text-[10px] uppercase">Time</th>
                  <th className="px-4 py-2 font-bold text-ink-400 text-[10px] uppercase">Room</th>
                  <th className="px-4 py-2 font-bold text-ink-400 text-[10px] uppercase">Type</th>
                  <th className="px-4 py-2 font-bold text-ink-400 text-[10px] uppercase text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink-100 dark:divide-ink-700">
                {filteredSchedules.length === 0 ? (
                  <tr><td colSpan={7} className="p-6 text-center text-ink-400">No schedule entries{hasFilters ? ' match the filters' : ' yet'}.</td></tr>
                ) : filteredSchedules.sort((a, b) => a.day_of_week - b.day_of_week || a.start_time.localeCompare(b.start_time)).map((r) => {
                  const dept = deptMap.get(moduleDeptMap.get(r.module_id) ?? 0)
                  return (
                    <tr key={r.id} className="hover:bg-ink-50/50 dark:hover:bg-ink-700/20">
                      <td className="px-4 py-2.5"><span className="font-mono">{r.module_code}</span> <span className="text-ink-500">· {r.module_name}</span></td>
                      <td className="px-4 py-2.5 text-ink-500">{dept?.dep_name ?? '—'}</td>
                      <td className="px-4 py-2.5">{DAYS[r.day_of_week - 1]}</td>
                      <td className="px-4 py-2.5 font-mono">{r.start_time.slice(0, 5)}–{r.end_time.slice(0, 5)}</td>
                      <td className="px-4 py-2.5">{r.room_name}</td>
                      <td className="px-4 py-2.5 capitalize">{r.session_type}</td>
                      <td className="px-4 py-2.5 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <button className="icon-btn" onClick={() => editEntry(r)}><Pencil className="w-3.5 h-3.5" /></button>
                          <button className="icon-btn text-red-500" onClick={() => confirm('Delete?') && remove.mutate(r.id)}><Trash2 className="w-3.5 h-3.5" /></button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
