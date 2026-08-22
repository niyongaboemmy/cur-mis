import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { Search, X, Check } from 'lucide-react'
import Modal from '@/components/ui/Modal'
import { moduleCatalogService } from '@/services/modulesService'
import { academicsMgmtService } from '@/services/academicsMgmtService'
import type { Module, CreateModulePayload } from '@/types/modules'
import { useLevels } from '@/hooks/useLevels'

interface Props {
  module:    Partial<Module>
  onClose:   () => void
  onSuccess: () => void
}

const EMPTY: CreateModulePayload = {
  module_name: '', module_code: '', module_credits: 0,
  department: 0, level: 1,
  description: '', status: 'active', learning_mode: 'day',
  prerequisite_ids: [],
}

export default function ModuleFormModal({ module, onClose, onSuccess }: Props) {
  const isEdit = Boolean(module.module_id)
  const { levels } = useLevels()
  const [form, setForm] = useState<CreateModulePayload>({
    ...EMPTY,
    module_name:    module.module_name    ?? '',
    module_code:    module.module_code    ?? '',
    module_credits: Number(module.module_credits ?? 0),
    department:     Number(module.department ?? 0),
    level:          Number(module.level ?? 1),
    description:    module.description ?? '',
    status:         module.status ?? 'active',
    prerequisite_ids: (module.prerequisites ?? []).map((p) => p.id),
  })
  const [prereqSearch, setPrereqSearch] = useState('')

  // Load departments for dropdown
  const deptsQ = useQuery({
    queryKey: ['academics', 'departments'],
    queryFn: () => academicsMgmtService.list<any>('departments', { per_page: 100 }),
  })
  const departments = deptsQ.data?.data?.data ?? []

  // Load modules for prereqs picker
  const catalogQ = useQuery({
    queryKey: ['modules', 'catalog-for-prereqs', prereqSearch],
    queryFn: () => moduleCatalogService.list({ per_page: 50, q: prereqSearch || undefined }),
  })

  useEffect(() => {
    setForm((f) => ({
      ...f,
      module_name:      module.module_name      ?? f.module_name ?? '',
      module_code:      module.module_code      ?? f.module_code ?? '',
      description:      module.description      ?? f.description ?? '',
      status:           module.status            ?? f.status ?? 'active',
      learning_mode:    module.learning_mode    ?? f.learning_mode ?? 'day',
      module_credits:   Number(module.module_credits ?? f.module_credits ?? 0),
      department:       Number(module.department     ?? f.department     ?? 0),
      level:            Number(module.level          ?? f.level          ?? 1),
      prerequisite_ids: (module.prerequisites ?? []).map((p) => p.id),
    }))
  }, [module])

  const save = useMutation({
    mutationFn: () => isEdit
      ? moduleCatalogService.update(module.module_id!, form)
      : moduleCatalogService.create(form),
    onSuccess: () => {
      toast.success(isEdit ? 'Module updated' : 'Module created')
      onSuccess()
    },
    onError: (e: any) => {
      const msg = e?.response?.data?.message ?? 'Save failed'
      const errs = e?.response?.data?.errors
      if (errs) {
        toast.error(msg + ': ' + Object.values(errs).flat().join(', '))
      } else {
        toast.error(msg)
      }
    },
  })

  const availablePrereqs = useMemo(
    () => (catalogQ.data?.data?.data ?? []).filter((m) => m.module_id !== module.module_id),
    [catalogQ.data, module.module_id],
  )

  // Selected prereqs (for display)
  const selectedPrereqs = useMemo(() => {
    const ids = new Set(form.prerequisite_ids ?? [])
    // Merge from available list + original module prereqs
    const all = [...availablePrereqs, ...(module.prerequisites ?? []).map(p => ({
      module_id: p.id,
      module_code: p.module_code,
      module_name: p.module_name,
    }))]
    const map = new Map<number, { module_id: number; module_code: string; module_name: string }>()
    all.forEach(m => { if (ids.has(m.module_id)) map.set(m.module_id, m) })
    return Array.from(map.values())
  }, [form.prerequisite_ids, availablePrereqs, module.prerequisites])

  const togglePrereq = (id: number) => {
    setForm((f) => {
      const set = new Set(f.prerequisite_ids ?? [])
      if (set.has(id)) set.delete(id)
      else set.add(id)
      return { ...f, prerequisite_ids: Array.from(set) }
    })
  }

  const canSubmit =
    form.module_name.trim().length >= 3 &&
    form.module_code.trim().length >= 1 &&
    Number(form.module_credits) > 0 &&
    Number(form.department) > 0 &&
    Number(form.level) > 0

  return (
    <Modal
      open
      onClose={onClose}
      title={isEdit ? `Edit ${module.module_code}` : 'New module'}
      size="lg"
      footer={
        <>
          <button className="btn-ghost btn-sm" onClick={onClose}>Cancel</button>
          <button
            className="btn-primary btn-sm"
            disabled={!canSubmit || save.isPending}
            onClick={() => save.mutate()}
          >
            {save.isPending ? 'Saving…' : isEdit ? 'Save changes' : 'Create module'}
          </button>
        </>
      }
    >
      <div className="grid grid-cols-2 gap-3">
        <label className="text-[13px]">
          <span className="text-ink-600 block mb-1">Code</span>
          <input className="input input-sm w-full" value={form.module_code}
            onChange={(e) => setForm({ ...form, module_code: e.target.value })} />
        </label>
        <label className="text-[13px]">
          <span className="text-ink-600 block mb-1">Title</span>
          <input className="input input-sm w-full" value={form.module_name}
            onChange={(e) => setForm({ ...form, module_name: e.target.value })} />
        </label>
        <label className="text-[13px]">
          <span className="text-ink-600 block mb-1">Credit hours</span>
          <input type="number" className="input input-sm w-full" value={form.module_credits}
            onChange={(e) => setForm({ ...form, module_credits: Number(e.target.value) })} />
        </label>
        <label className="text-[13px]">
          <span className="text-ink-600 block mb-1">Department</span>
          <select
            className="input input-sm w-full"
            value={form.department || ''}
            onChange={(e) => setForm({ ...form, department: Number(e.target.value) })}
          >
            <option value="" disabled>Select department…</option>
            {departments.map((d: any) => (
              <option key={d.dep_id} value={d.dep_id}>
                {d.dep_name}
              </option>
            ))}
          </select>
        </label>
        <label className="text-[13px]">
          <span className="text-ink-600 block mb-1">Level (year)</span>
          {/* `modules.level` is a `levels.id`, so this picks by name and still
              stores the id — a free number field let anyone type a level that
              matches no catalogue row. */}
          <select className="input input-sm w-full" value={form.level}
            onChange={(e) => setForm({ ...form, level: Number(e.target.value) })}>
            {levels.map((l) => (
              <option key={l.id} value={l.id}>{l.name}</option>
            ))}
          </select>
        </label>
        <label className="text-[13px]">
          <span className="text-ink-600 block mb-1">Status</span>
          <select className="input input-sm w-full" value={form.status}
            onChange={(e) => setForm({ ...form, status: e.target.value as any })}>
            <option value="draft">Draft</option>
            <option value="active">Active</option>
            <option value="archived">Archived</option>
          </select>
        </label>
        <label className="text-[13px]">
          <span className="text-ink-600 block mb-1">Learning Mode</span>
          <select className="input input-sm w-full" value={form.learning_mode || 'day'}
            onChange={(e) => setForm({ ...form, learning_mode: e.target.value as any })}>
            <option value="day">Day (Weekday)</option>
            <option value="evening">Evening</option>
            <option value="weekend">Weekend</option>
            <option value="holiday">Holiday</option>
          </select>
        </label>
        <label className="text-[13px] col-span-2">
          <span className="text-ink-600 block mb-1">Description</span>
          <textarea
            rows={3}
            className="input input-sm w-full"
            value={form.description ?? ''}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
          />
        </label>
      </div>

      {/* Prerequisites */}
      <div className="mt-4 border-t border-ink-100 dark:border-ink-700 pt-3">
        <div className="flex items-center justify-between mb-2">
          <span className="font-semibold text-[13px] text-ink-800 dark:text-white">Prerequisites</span>
          <span className="text-[11px] text-ink-500">
            {(form.prerequisite_ids ?? []).length} selected
          </span>
        </div>

        {/* Selected prereqs tags */}
        {selectedPrereqs.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mb-2">
            {selectedPrereqs.map((p) => (
              <span
                key={p.module_id}
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-brand/10 text-brand text-[12px] font-medium"
              >
                {p.module_code}
                <button
                  type="button"
                  onClick={() => togglePrereq(p.module_id)}
                  className="hover:text-red-500 transition-colors"
                >
                  <X className="w-3 h-3" />
                </button>
              </span>
            ))}
          </div>
        )}

        {/* Search */}
        <div className="relative mb-2">
          <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-ink-400" />
          <input
            className="input input-sm w-full pl-8"
            placeholder="Search modules by code or name…"
            value={prereqSearch}
            onChange={(e) => setPrereqSearch(e.target.value)}
          />
        </div>

        {/* Available modules list */}
        <div className="max-h-48 overflow-y-auto border border-ink-100 dark:border-ink-700 rounded">
          {catalogQ.isLoading ? (
            <p className="p-3 text-[12px] text-ink-400 text-center">Loading modules…</p>
          ) : availablePrereqs.length === 0 ? (
            <p className="p-3 text-[12px] text-ink-400 text-center">
              {prereqSearch ? 'No modules match your search.' : 'No other modules available.'}
            </p>
          ) : availablePrereqs.map((m) => {
            const isSelected = (form.prerequisite_ids ?? []).includes(m.module_id)
            return (
              <button
                type="button"
                key={m.module_id}
                className={`flex items-center gap-2 px-3 py-1.5 text-[13px] w-full text-left transition-colors ${
                  isSelected
                    ? 'bg-brand/5 dark:bg-brand/10'
                    : 'hover:bg-ink-50 dark:hover:bg-ink-700/30'
                }`}
                onClick={() => togglePrereq(m.module_id)}
              >
                <span className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 transition-colors ${
                  isSelected
                    ? 'bg-brand border-brand text-white'
                    : 'border-ink-300 dark:border-ink-600'
                }`}>
                  {isSelected && <Check className="w-3 h-3" />}
                </span>
                <span className="font-mono text-ink-900 dark:text-white">{m.module_code}</span>
                <span className="text-ink-500 truncate">— {m.module_name}</span>
              </button>
            )
          })}
        </div>
      </div>
    </Modal>
  )
}
