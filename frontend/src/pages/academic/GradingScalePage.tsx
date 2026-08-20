import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { Scale, Save, RotateCcw, Pencil, X } from 'lucide-react'
import { gradingScaleService, type GradingScaleRow } from '@/services/gradingScaleService'
import { PERMISSIONS } from '@/constants/permissions'
import { useAuthStore } from '@/store/authStore'

export default function GradingScalePage() {
  const authUser = useAuthStore((s) => s.user)
  const canEdit  = authUser?.permissions?.includes(PERMISSIONS.MANAGE_GRADING_SCALES)
                || authUser?.role === 'superadmin'

  const qc = useQueryClient()

  const { data: result, isLoading } = useQuery({
    queryKey: ['grading-scales'],
    queryFn:  () => gradingScaleService.list(),
  })
  const rows: GradingScaleRow[] = result?.data ?? []

  const [editing, setEditing] = useState<GradingScaleRow[] | null>(null)

  const saveMut = useMutation({
    mutationFn: () => gradingScaleService.upsert({ scales: editing ?? [] }),
    onSuccess: () => {
      toast.success('Grading scale saved.')
      qc.invalidateQueries({ queryKey: ['grading-scales'] })
      setEditing(null)
    },
    onError: () => toast.error('Failed to save grading scale.'),
  })

  const resetMut = useMutation({
    mutationFn: gradingScaleService.reset,
    onSuccess: () => {
      toast.success('Reset to CUR defaults.')
      qc.invalidateQueries({ queryKey: ['grading-scales'] })
      setEditing(null)
    },
    onError: () => toast.error('Reset failed.'),
  })

  const startEdit  = () => setEditing(rows.map((r) => ({ ...r })))
  const cancelEdit = () => setEditing(null)

  const handleCell = (idx: number, field: keyof GradingScaleRow, value: string) => {
    if (!editing) return
    const copy = [...editing]
    copy[idx] = {
      ...copy[idx],
      [field]: field === 'grade' || field === 'description' ? value : Number(value),
    }
    setEditing(copy)
  }

  const display = editing ?? rows

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <Scale className="w-6 h-6 text-blue-600" />
          <div>
            <h1 className="text-xl font-bold text-gray-900 dark:text-white">Grading Scale</h1>
            <p className="text-sm text-gray-500 dark:text-ink-400">Define the percentage bands and GPA points used across the institution.</p>
          </div>
        </div>
        {canEdit && (
          <div className="flex gap-2">
            {editing ? (
              <>
                <button onClick={cancelEdit}
                  className="flex items-center gap-1 px-3 py-2 text-sm border rounded-lg text-gray-700 hover:bg-gray-50 dark:border-ink-700 dark:text-ink-200 dark:hover:bg-ink-700/50">
                  <X className="w-4 h-4" /> Cancel
                </button>
                <button onClick={() => saveMut.mutate()} disabled={saveMut.isPending}
                  className="flex items-center gap-1 px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50">
                  <Save className="w-4 h-4" />
                  {saveMut.isPending ? 'Saving…' : 'Save'}
                </button>
              </>
            ) : (
              <>
                <button onClick={() => { if (window.confirm('Reset to CUR default grading scale?')) resetMut.mutate() }}
                  disabled={resetMut.isPending}
                  className="flex items-center gap-1 px-3 py-2 text-sm border rounded-lg text-gray-700 hover:bg-gray-50 disabled:opacity-50 dark:border-ink-700 dark:text-ink-200 dark:hover:bg-ink-700/50">
                  <RotateCcw className="w-4 h-4" />
                  {resetMut.isPending ? 'Resetting…' : 'Reset to CUR Defaults'}
                </button>
                <button onClick={startEdit}
                  className="flex items-center gap-1 px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700">
                  <Pencil className="w-4 h-4" /> Edit Scale
                </button>
              </>
            )}
          </div>
        )}
      </div>

      {isLoading ? (
        <p className="text-gray-500 text-sm dark:text-ink-400">Loading…</p>
      ) : (
        <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm dark:border-ink-700 dark:bg-ink-800">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200 dark:bg-ink-900/40 dark:border-ink-700">
              <tr>
                <th className="px-4 py-3 text-left font-semibold text-gray-700 dark:text-ink-200">Grade</th>
                <th className="px-4 py-3 text-center font-semibold text-gray-700 dark:text-ink-200">Min %</th>
                <th className="px-4 py-3 text-center font-semibold text-gray-700 dark:text-ink-200">Max %</th>
                <th className="px-4 py-3 text-center font-semibold text-gray-700 dark:text-ink-200">GPA Point</th>
                <th className="px-4 py-3 text-left font-semibold text-gray-700 dark:text-ink-200">Description</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-ink-700">
              {display.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-gray-400 dark:text-ink-500">
                    No grading scale configured. Click "Reset to CUR Defaults" to seed the standard scale.
                  </td>
                </tr>
              )}
              {display.map((row, idx) => (
                <tr key={row.id ?? idx} className="hover:bg-gray-50 dark:hover:bg-ink-700/50">
                  <td className="px-4 py-3 font-bold text-blue-700 dark:text-blue-400">
                    {editing
                      ? <input value={editing[idx].grade} onChange={(e) => handleCell(idx, 'grade', e.target.value)}
                          className="w-12 text-center border rounded px-1 py-0.5 font-bold dark:border-ink-700 dark:bg-ink-900 dark:text-white" />
                      : row.grade}
                  </td>
                  <td className="px-4 py-3 text-center">
                    {editing
                      ? <input type="number" value={editing[idx].min_marks} onChange={(e) => handleCell(idx, 'min_marks', e.target.value)}
                          className="w-16 text-center border rounded px-1 py-0.5 dark:border-ink-700 dark:bg-ink-900 dark:text-white" />
                      : row.min_marks}
                  </td>
                  <td className="px-4 py-3 text-center">
                    {editing
                      ? <input type="number" value={editing[idx].max_marks} onChange={(e) => handleCell(idx, 'max_marks', e.target.value)}
                          className="w-16 text-center border rounded px-1 py-0.5 dark:border-ink-700 dark:bg-ink-900 dark:text-white" />
                      : row.max_marks}
                  </td>
                  <td className="px-4 py-3 text-center">
                    {editing
                      ? <input type="number" step="0.1" value={editing[idx].grade_point} onChange={(e) => handleCell(idx, 'grade_point', e.target.value)}
                          className="w-16 text-center border rounded px-1 py-0.5 dark:border-ink-700 dark:bg-ink-900 dark:text-white" />
                      : row.grade_point}
                  </td>
                  <td className="px-4 py-3 text-gray-600 dark:text-ink-300">
                    {editing
                      ? <input value={editing[idx].description ?? ''} onChange={(e) => handleCell(idx, 'description', e.target.value)}
                          className="w-full border rounded px-2 py-0.5 dark:border-ink-700 dark:bg-ink-900 dark:text-white" />
                      : row.description ?? '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="mt-4 text-xs text-gray-400 dark:text-ink-500">
        Grading scale applies institution-wide. Changes take effect for new GPA computations only — historical marks are not retroactively recalculated.
      </p>
    </div>
  )
}
