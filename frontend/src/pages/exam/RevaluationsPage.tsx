import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { Scale, Loader2, Check, X, Clock } from 'lucide-react'
import {
  revaluationService, STATUS_LABELS,
  type Revaluation, type RevaluationStatus,
} from '@/services/revaluationService'

const FILTERS: Array<{ key: RevaluationStatus | 'all'; label: string }> = [
  { key: 'all', label: 'All' },
  { key: 'pending', label: 'Pending' },
  { key: 'approved', label: 'Approved' },
  { key: 'processed', label: 'Processed' },
  { key: 'rejected', label: 'Rejected' },
]

function statusPill(s: RevaluationStatus) {
  const tone: Record<RevaluationStatus, string> = {
    pending:   'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
    approved:  'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',
    processed: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300',
    rejected:  'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300',
  }
  return <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase ${tone[s]}`}>{STATUS_LABELS[s]}</span>
}

export default function RevaluationsPage() {
  const qc = useQueryClient()
  const [filter, setFilter] = useState<RevaluationStatus | 'all'>('pending')
  const [review, setReview] = useState<Revaluation | null>(null)

  const q = useQuery({
    queryKey: ['revaluations', filter],
    queryFn: () => revaluationService.list(filter === 'all' ? undefined : filter),
  })
  const rows = q.data?.data ?? []

  return (
    <div className="max-w-[1100px] mx-auto space-y-5">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-brand/10 text-brand grid place-items-center">
          <Scale className="w-5 h-5" />
        </div>
        <div className="flex-1">
          <h1 className="text-lg font-bold text-ink-900 dark:text-ink-50">Revaluation requests</h1>
          <p className="text-[13px] text-ink-500">Review and process student requests to re-mark a module result.</p>
        </div>
      </div>

      <div className="flex gap-2 flex-wrap">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            className={`btn-sm rounded-lg px-3 ${filter === f.key ? 'btn-primary' : 'btn-ghost'}`}
            onClick={() => setFilter(f.key)}
          >
            {f.label}
          </button>
        ))}
      </div>

      <div className="card overflow-hidden">
        {q.isLoading ? (
          <div className="p-8 text-center"><Loader2 className="w-6 h-6 animate-spin mx-auto text-brand" /></div>
        ) : rows.length === 0 ? (
          <div className="p-8 text-center text-ink-400">No requests in this view.</div>
        ) : (
          <table className="w-full text-left text-[13px]">
            <thead>
              <tr className="bg-ink-50/60 dark:bg-ink-800/30 border-b border-ink-100 dark:border-ink-700 text-[10px] uppercase text-ink-400">
                <th className="px-3 py-2 font-bold">Student</th>
                <th className="px-3 py-2 font-bold">Module</th>
                <th className="px-3 py-2 font-bold text-center">Current</th>
                <th className="px-3 py-2 font-bold text-center">New</th>
                <th className="px-3 py-2 font-bold">Reason</th>
                <th className="px-3 py-2 font-bold">Status</th>
                <th className="px-3 py-2 font-bold text-right">Action</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-b border-ink-50 dark:border-ink-800/60 align-top">
                  <td className="px-3 py-2">
                    <div className="font-medium text-ink-800 dark:text-ink-100">{r.fname} {r.lname}</div>
                    <div className="font-mono text-[11px] text-ink-400">{r.regnumber}</div>
                  </td>
                  <td className="px-3 py-2">
                    <div className="font-medium">{r.module_code}</div>
                    <div className="text-[11px] text-ink-400 max-w-[180px] truncate">{r.module_name}</div>
                  </td>
                  <td className="px-3 py-2 text-center">
                    {r.current_marks != null ? `${r.current_marks}%` : '—'}
                    {r.current_grade && <div className="text-[10px] text-ink-400">{r.current_grade}</div>}
                  </td>
                  <td className="px-3 py-2 text-center font-semibold text-brand">
                    {r.new_marks != null ? `${r.new_marks}%` : '—'}
                  </td>
                  <td className="px-3 py-2 text-ink-600 dark:text-ink-300 max-w-[220px]">
                    <span className="line-clamp-2">{r.reason}</span>
                  </td>
                  <td className="px-3 py-2">{statusPill(r.status)}</td>
                  <td className="px-3 py-2 text-right">
                    {(r.status === 'pending' || r.status === 'approved') ? (
                      <button className="btn-primary btn-sm" onClick={() => setReview(r)}>Review</button>
                    ) : (
                      <span className="text-[11px] text-ink-400">
                        {r.reviewed_by_name ? `by ${r.reviewed_by_name}` : 'closed'}
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {review && (
        <ReviewModal
          rev={review}
          onClose={() => setReview(null)}
          onDone={() => { setReview(null); qc.invalidateQueries({ queryKey: ['revaluations'] }) }}
        />
      )}
    </div>
  )
}

function ReviewModal({ rev, onClose, onDone }: { rev: Revaluation; onClose: () => void; onDone: () => void }) {
  const [newMarks, setNewMarks] = useState<string>(rev.new_marks != null ? String(rev.new_marks) : '')

  const mut = useMutation({
    mutationFn: (status: RevaluationStatus) =>
      revaluationService.review(rev.id, {
        status,
        new_marks: status === 'processed' ? Number(newMarks) : undefined,
      }),
    onSuccess: () => { toast.success('Request updated.'); onDone() },
    onError: (e: any) => toast.error(e?.response?.data?.message ?? 'Could not update.'),
  })

  const marksValid = newMarks !== '' && Number(newMarks) >= 0 && Number(newMarks) <= 100

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink-900/60 backdrop-blur-sm p-4">
      <div className="card w-full max-w-md">
        <div className="flex items-center justify-between px-5 py-3 border-b border-ink-100 dark:border-ink-700">
          <h3 className="font-semibold text-ink-900 dark:text-ink-50">Review revaluation</h3>
          <button className="p-1 text-ink-400 hover:text-ink-700" onClick={onClose}><X className="w-5 h-5" /></button>
        </div>
        <div className="p-5 space-y-4 text-[13px]">
          <div className="text-ink-600 dark:text-ink-300">
            <div><b>{rev.fname} {rev.lname}</b> <span className="font-mono text-ink-400">({rev.regnumber})</span></div>
            <div className="mt-1">{rev.module_code} — {rev.module_name}</div>
            <div className="mt-1">Current mark: <b>{rev.current_marks != null ? `${rev.current_marks}%` : '—'}</b></div>
          </div>
          <div className="rounded-lg bg-ink-50 dark:bg-ink-800/40 p-3 text-ink-600 dark:text-ink-300">
            <div className="text-[10px] uppercase text-ink-400 font-bold mb-1">Reason</div>
            {rev.reason}
          </div>
          <div>
            <label className="label">Revised marks <span className="text-ink-400 font-normal">(required to process)</span></label>
            <input type="number" step="0.01" min="0" max="100" className="input"
              value={newMarks} onChange={(e) => setNewMarks(e.target.value)} placeholder="e.g. 62.5" />
          </div>
        </div>
        <div className="flex flex-wrap justify-end gap-2 px-5 py-3 border-t border-ink-100 dark:border-ink-700">
          <button className="btn-sm rounded-lg px-3 bg-red-600 text-white hover:bg-red-700 inline-flex items-center gap-1.5"
            disabled={mut.isPending} onClick={() => mut.mutate('rejected')}>
            <X className="w-4 h-4" /> Reject
          </button>
          {rev.status === 'pending' && (
            <button className="btn-ghost btn-sm" disabled={mut.isPending} onClick={() => mut.mutate('approved')}>
              <Clock className="w-4 h-4" /> Approve (await re-mark)
            </button>
          )}
          <button className="btn-primary btn-sm" disabled={mut.isPending || !marksValid} onClick={() => mut.mutate('processed')}
            title={!marksValid ? 'Enter revised marks (0–100) first' : undefined}>
            {mut.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />} Process
          </button>
        </div>
      </div>
    </div>
  )
}
