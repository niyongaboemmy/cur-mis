import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { GraduationCap, Plus, Pencil, Trash2, Loader2, AlertTriangle, X, Info } from 'lucide-react'
import { gradeService, type GradingBand, type GradingBandInput } from '@/services/gradeService'

const num = (v: string | number | null | undefined) =>
  v === null || v === undefined || v === '' ? 0 : Number(v)

export default function GradingScalePage() {
  const qc = useQueryClient()
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<GradingBand | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<GradingBand | null>(null)

  const q = useQuery({ queryKey: ['grading-scales'], queryFn: () => gradeService.listScales() })
  const bands = q.data?.data ?? []

  // Detect coverage gaps / overlaps between bands (sorted desc by min).
  const gaps: string[] = []
  const sorted = [...bands].sort((a, b) => num(b.min_marks) - num(a.min_marks))
  for (let i = 0; i < sorted.length - 1; i++) {
    const lowerOfHigher = num(sorted[i].min_marks)
    const upperOfNext = num(sorted[i + 1].max_marks)
    if (upperOfNext < lowerOfHigher - 0.01) {
      gaps.push(`Gap between ${sorted[i + 1].grade} (≤${upperOfNext}) and ${sorted[i].grade} (≥${lowerOfHigher})`)
    } else if (upperOfNext > lowerOfHigher + 0.01) {
      gaps.push(`Overlap between ${sorted[i + 1].grade} and ${sorted[i].grade}`)
    }
  }

  const removeMut = useMutation({
    mutationFn: (id: number) => gradeService.removeScale(id),
    onSuccess: () => { toast.success('Grading band deleted.'); setConfirmDelete(null); qc.invalidateQueries({ queryKey: ['grading-scales'] }) },
    onError: (e: any) => toast.error(e?.response?.data?.message ?? 'Could not delete.'),
  })

  return (
    <div className="max-w-[920px] mx-auto space-y-5">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-brand/10 text-brand grid place-items-center">
          <GraduationCap className="w-5 h-5" />
        </div>
        <div className="flex-1">
          <h1 className="text-lg font-bold text-ink-900 dark:text-ink-50">Grading scale & GPA</h1>
          <p className="text-[13px] text-ink-500">
            Marks bands → letter grade → grade point. These grade points drive student GPA / CGPA.
          </p>
        </div>
        <button className="btn-primary btn-sm" onClick={() => { setEditing(null); setShowForm(true) }}>
          <Plus className="w-4 h-4" /> Add band
        </button>
      </div>

      {gaps.length > 0 && (
        <div className="card p-3 border-l-4 border-l-amber-500 flex items-start gap-2 text-[13px]">
          <Info className="w-4 h-4 text-amber-500 mt-0.5 shrink-0" />
          <div>
            <p className="font-medium text-amber-700 dark:text-amber-300">Scale coverage warnings</p>
            <ul className="list-disc ml-4 text-ink-600 dark:text-ink-300">
              {gaps.map((g, i) => <li key={i}>{g}</li>)}
            </ul>
            <p className="text-ink-400 mt-1">Marks falling in a gap won't receive a grade point and are excluded from GPA.</p>
          </div>
        </div>
      )}

      <div className="card overflow-hidden">
        {q.isLoading ? (
          <div className="p-8 text-center"><Loader2 className="w-6 h-6 animate-spin mx-auto text-brand" /></div>
        ) : bands.length === 0 ? (
          <div className="p-8 text-center text-ink-400">No grading bands configured yet.</div>
        ) : (
          <table className="w-full text-left text-[13px]">
            <thead>
              <tr className="bg-ink-50/60 dark:bg-ink-800/30 border-b border-ink-100 dark:border-ink-700 text-[10px] uppercase text-ink-400">
                <th className="px-3 py-2 font-bold">Grade</th>
                <th className="px-3 py-2 font-bold">Marks range</th>
                <th className="px-3 py-2 font-bold text-center">Grade point</th>
                <th className="px-3 py-2 font-bold">Description</th>
                <th className="px-3 py-2 font-bold text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((b) => (
                <tr key={b.id} className="border-b border-ink-50 dark:border-ink-800/60">
                  <td className="px-3 py-2 font-bold text-ink-900 dark:text-ink-50">{b.grade}</td>
                  <td className="px-3 py-2 font-mono text-ink-600 dark:text-ink-300">{num(b.min_marks)} – {num(b.max_marks)}</td>
                  <td className="px-3 py-2 text-center font-semibold text-brand">{num(b.grade_point).toFixed(1)}</td>
                  <td className="px-3 py-2 text-ink-500">{b.description ?? '—'}</td>
                  <td className="px-3 py-2">
                    <div className="flex items-center justify-end gap-1">
                      <button className="p-1.5 rounded-lg hover:bg-ink-100 dark:hover:bg-ink-700 text-ink-500"
                        onClick={() => { setEditing(b); setShowForm(true) }} title="Edit">
                        <Pencil className="w-4 h-4" />
                      </button>
                      <button className="p-1.5 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/30 text-red-500"
                        onClick={() => setConfirmDelete(b)} title="Delete">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {showForm && (
        <BandForm
          initial={editing}
          onClose={() => setShowForm(false)}
          onSaved={() => { setShowForm(false); qc.invalidateQueries({ queryKey: ['grading-scales'] }) }}
        />
      )}

      {confirmDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink-900/60 backdrop-blur-sm p-4">
          <div className="card p-5 max-w-sm w-full">
            <div className="flex items-center gap-2 text-red-600 mb-2">
              <AlertTriangle className="w-5 h-5" /><h3 className="font-semibold">Delete band {confirmDelete.grade}?</h3>
            </div>
            <p className="text-[13px] text-ink-600 dark:text-ink-300">This grade point will no longer be applied when computing GPA.</p>
            <div className="mt-4 flex justify-end gap-2">
              <button className="btn-ghost btn-sm" onClick={() => setConfirmDelete(null)}>Cancel</button>
              <button className="btn-sm bg-red-600 text-white hover:bg-red-700 rounded-lg px-3 inline-flex items-center gap-1.5"
                disabled={removeMut.isPending} onClick={() => removeMut.mutate(confirmDelete.id)}>
                {removeMut.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />} Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function BandForm({ initial, onClose, onSaved }: { initial: GradingBand | null; onClose: () => void; onSaved: () => void }) {
  const isEdit = !!initial
  const [form, setForm] = useState<GradingBandInput>({
    grade:       initial?.grade ?? '',
    min_marks:   initial ? num(initial.min_marks) : 0,
    max_marks:   initial ? num(initial.max_marks) : 0,
    grade_point: initial ? num(initial.grade_point) : 0,
    description: initial?.description ?? '',
  })
  const valid = form.grade.trim() !== '' && form.max_marks >= form.min_marks

  const saveMut = useMutation({
    mutationFn: () => isEdit ? gradeService.updateScale(initial!.id, form) : gradeService.createScale(form),
    onSuccess: () => { toast.success(isEdit ? 'Band updated.' : 'Band added.'); onSaved() },
    onError: (e: any) => toast.error(e?.response?.data?.message ?? 'Could not save.'),
  })

  const set = <K extends keyof GradingBandInput>(k: K, v: GradingBandInput[K]) => setForm((f) => ({ ...f, [k]: v }))

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink-900/60 backdrop-blur-sm p-4">
      <div className="card w-full max-w-md">
        <div className="flex items-center justify-between px-5 py-3 border-b border-ink-100 dark:border-ink-700">
          <h3 className="font-semibold text-ink-900 dark:text-ink-50">{isEdit ? `Edit band ${initial!.grade}` : 'Add grading band'}</h3>
          <button className="p-1 text-ink-400 hover:text-ink-700" onClick={onClose}><X className="w-5 h-5" /></button>
        </div>
        <div className="p-5 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Grade</label>
              <input className="input" maxLength={5} value={form.grade}
                placeholder="A" onChange={(e) => set('grade', e.target.value.toUpperCase())} />
            </div>
            <div>
              <label className="label">Grade point</label>
              <input type="number" step="0.1" min="0" className="input" value={form.grade_point}
                onChange={(e) => set('grade_point', Number(e.target.value))} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Min marks</label>
              <input type="number" step="0.01" min="0" max="100" className="input" value={form.min_marks}
                onChange={(e) => set('min_marks', Number(e.target.value))} />
            </div>
            <div>
              <label className="label">Max marks</label>
              <input type="number" step="0.01" min="0" max="100" className="input" value={form.max_marks}
                onChange={(e) => set('max_marks', Number(e.target.value))} />
            </div>
          </div>
          <div>
            <label className="label">Description <span className="text-ink-400 font-normal">(optional)</span></label>
            <input className="input" value={form.description ?? ''} placeholder="e.g. Distinction"
              onChange={(e) => set('description', e.target.value)} />
          </div>
          {!valid && form.max_marks < form.min_marks && (
            <p className="text-[12px] text-red-500">Max marks must be greater than or equal to min marks.</p>
          )}
        </div>
        <div className="flex justify-end gap-2 px-5 py-3 border-t border-ink-100 dark:border-ink-700">
          <button className="btn-ghost btn-sm" onClick={onClose}>Cancel</button>
          <button className="btn-primary btn-sm" disabled={!valid || saveMut.isPending} onClick={() => saveMut.mutate()}>
            {saveMut.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <GraduationCap className="w-4 h-4" />}
            {isEdit ? 'Save' : 'Add band'}
          </button>
        </div>
      </div>
    </div>
  )
}
