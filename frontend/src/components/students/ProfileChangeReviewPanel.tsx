import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { Check, X, Download, Loader2, UserCog } from 'lucide-react'
import { studentService, type ProfileChangeRequest } from '@/services/studentService'
import { usePermission } from '@/utils/permissions'
import { PERMISSIONS } from '@/constants/permissions'
import { apiClient } from '@/services/api'

/**
 * The registry's queue of student-proposed identity corrections
 * (migration 147).
 *
 * Rendered inline on the Students list rather than as its own page: the queue
 * is usually empty, and a nav entry that leads to "nothing to review" on most
 * days is worse than a panel that simply is not there. It appears only when
 * something is waiting.
 *
 * Gated on MANAGE_STUDENTS, mirroring the backend route for /decide.
 */
export default function ProfileChangeReviewPanel() {
  const canManage = usePermission(PERMISSIONS.MANAGE_STUDENTS)
  const qc = useQueryClient()
  const [busyId, setBusyId] = useState<number | null>(null)
  const [notes, setNotes]   = useState<Record<number, string>>({})

  const queueQ = useQuery({
    queryKey: ['students', 'profile-change-requests', 'pending'],
    queryFn:  ({ signal }) => studentService.listProfileChangeRequests('pending', signal),
    enabled:  canManage,
  })

  const rows = (queueQ.data?.data ?? []) as ProfileChangeRequest[]

  const decide = useMutation({
    mutationFn: ({ id, decision }: { id: number; decision: 'approved' | 'rejected' }) =>
      studentService.decideProfileChangeRequest(id, decision, notes[id]),
    onMutate: ({ id }) => setBusyId(id),
    onSuccess: (_res, { decision }) => {
      toast.success(`Request ${decision}.`)
      qc.invalidateQueries({ queryKey: ['students', 'profile-change-requests'] })
      // The student row itself changes on approval.
      qc.invalidateQueries({ queryKey: ['students'] })
    },
    onError: (e: any) => toast.error(e?.response?.data?.message ?? 'Could not record the decision.'),
    onSettled: () => setBusyId(null),
  })

  const openDocument = async (id: number) => {
    try {
      const res  = await apiClient.get(`/api/students/profile-change-requests/${id}/document`, { responseType: 'blob' })
      const blob = res.data instanceof Blob ? res.data : new Blob([res.data])
      const url  = window.URL.createObjectURL(blob)
      window.open(url, '_blank')
      window.setTimeout(() => window.URL.revokeObjectURL(url), 60_000)
    } catch {
      toast.error('Could not open the supporting document.')
    }
  }

  // Absent, not empty — see the note above.
  if (!canManage || rows.length === 0) return null

  return (
    <section className="card p-4 border-amber-200 dark:border-amber-900/40">
      <header className="flex items-center gap-2 mb-3">
        <UserCog className="w-4 h-4 text-amber-600" />
        <h2 className="text-[13.5px] font-bold text-ink-900 dark:text-ink-50">
          Student detail corrections awaiting review
        </h2>
        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400">
          {rows.length}
        </span>
      </header>

      <ul className="divide-y divide-ink-100 dark:divide-ink-800">
        {rows.map((r) => (
          <li key={r.id} className="py-3 flex flex-col lg:flex-row lg:items-start gap-3">
            <div className="min-w-0 flex-1 space-y-1">
              <p className="text-[13px] font-semibold text-ink-900 dark:text-ink-50">
                {`${r.student_fname ?? ''} ${r.student_lname ?? ''}`.trim() || r.regnumber}
                <span className="ml-2 font-mono text-[11px] font-normal text-ink-400">{r.regnumber}</span>
              </p>

              <ul className="text-[12.5px] space-y-0.5">
                {r.changes.map((c) => (
                  <li key={c.field} className="text-ink-700 dark:text-ink-200">
                    <span className="font-medium">{c.label}:</span>{' '}
                    <span className="text-ink-400 line-through">{c.from || '—'}</span>{' '}
                    → <span className="font-semibold">{c.to || '—'}</span>
                  </li>
                ))}
              </ul>

              {r.reason && <p className="text-[12px] text-ink-500 italic">“{r.reason}”</p>}

              {r.has_document ? (
                <button
                  type="button"
                  onClick={() => openDocument(r.id)}
                  className="inline-flex items-center gap-1 text-[12px] font-semibold text-brand hover:underline"
                >
                  <Download className="w-3 h-3" />
                  {r.document_original_name ?? 'Supporting document'}
                </button>
              ) : (
                <p className="text-[12px] text-amber-600 dark:text-amber-400">
                  No supporting document was attached.
                </p>
              )}
            </div>

            <div className="flex flex-col gap-2 lg:w-72 shrink-0">
              <input
                className="input input-sm"
                placeholder="Note to the student (optional)"
                value={notes[r.id] ?? ''}
                onChange={(e) => setNotes((n) => ({ ...n, [r.id]: e.target.value }))}
                aria-label={`Note for request ${r.id}`}
              />
              <div className="flex gap-2">
                <button
                  type="button"
                  className="btn-primary btn-sm flex-1 disabled:opacity-50"
                  disabled={busyId === r.id}
                  onClick={() => decide.mutate({ id: r.id, decision: 'approved' })}
                >
                  {busyId === r.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                  Approve
                </button>
                <button
                  type="button"
                  className="btn-ghost btn-sm flex-1 text-red-600 disabled:opacity-50"
                  disabled={busyId === r.id}
                  onClick={() => decide.mutate({ id: r.id, decision: 'rejected' })}
                >
                  <X className="w-3.5 h-3.5" /> Reject
                </button>
              </div>
            </div>
          </li>
        ))}
      </ul>
    </section>
  )
}
