import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { FileText, Check, X, Truck, Search, ChevronLeft, ChevronRight } from 'lucide-react'
import Modal from '@/components/ui/Modal'
import { transcriptService, type TranscriptRequest, type TranscriptStatus } from '@/services/transcriptService'

const STATUS_TABS: { label: string; value: TranscriptStatus | '' }[] = [
  { label: 'All',        value: '' },
  { label: 'Pending',    value: 'pending' },
  { label: 'Approved',   value: 'approved' },
  { label: 'Dispatched', value: 'dispatched' },
  { label: 'Rejected',   value: 'rejected' },
]

const STATUS_BADGE: Record<TranscriptStatus, string> = {
  pending:    'bg-yellow-100 text-yellow-800',
  approved:   'bg-green-100 text-green-800',
  dispatched: 'bg-blue-100 text-blue-800',
  rejected:   'bg-red-100 text-red-800',
}

export default function TranscriptRequestsPage() {
  const qc = useQueryClient()
  const [tab, setTab]       = useState<TranscriptStatus | ''>('')
  const [search, setSearch] = useState('')
  const [page, setPage]     = useState(1)

  const [dispatchId, setDispatchId]       = useState<number | null>(null)
  const [dispatchNotes, setDispatchNotes] = useState('')

  const { data: result, isLoading } = useQuery({
    queryKey: ['transcript-requests', tab, search, page],
    queryFn:  () => transcriptService.list({
      status:   tab || undefined,
      search:   search || undefined,
      page,
      per_page: 20,
    }),
  })

  const payload    = result?.data
  const rows: TranscriptRequest[] = payload?.data ?? []
  const total      = payload?.total    ?? 0
  const lastPage   = payload?.last_page ?? 1

  const reviewMut = useMutation({
    mutationFn: ({ id, action }: { id: number; action: 'approve' | 'reject' }) =>
      transcriptService.review(id, { action }),
    onSuccess: (_, { action }) => {
      toast.success(action === 'approve' ? 'Request approved.' : 'Request rejected.')
      qc.invalidateQueries({ queryKey: ['transcript-requests'] })
    },
    onError: () => toast.error('Action failed.'),
  })

  const dispatchMut = useMutation({
    mutationFn: (id: number) => transcriptService.dispatch(id, { dispatch_notes: dispatchNotes }),
    onSuccess: () => {
      toast.success('Marked as dispatched.')
      qc.invalidateQueries({ queryKey: ['transcript-requests'] })
      setDispatchId(null)
      setDispatchNotes('')
    },
    onError: () => toast.error('Dispatch failed.'),
  })

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <FileText className="w-6 h-6 text-blue-600" />
        <div>
          <h1 className="text-xl font-bold text-gray-900">Transcript Requests</h1>
          <p className="text-sm text-gray-500">Review and dispatch student transcript requests.</p>
        </div>
      </div>

      <div className="flex flex-wrap gap-3 mb-4">
        <div className="flex border rounded-lg overflow-hidden text-sm">
          {STATUS_TABS.map((t) => (
            <button key={t.value} onClick={() => { setTab(t.value); setPage(1) }}
              className={`px-4 py-2 ${tab === t.value ? 'bg-blue-600 text-white' : 'text-gray-600 hover:bg-gray-50'}`}>
              {t.label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2 border rounded-lg px-3 py-2 bg-white text-sm">
          <Search className="w-4 h-4 text-gray-400" />
          <input value={search} onChange={(e) => { setSearch(e.target.value); setPage(1) }}
            placeholder="Search by name or reg#…" className="outline-none w-52" />
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
        {isLoading ? (
          <div className="p-8 text-center text-gray-400">Loading…</div>
        ) : rows.length === 0 ? (
          <div className="p-8 text-center text-gray-400">No requests found.</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-4 py-3 text-left font-semibold text-gray-700">Student</th>
                <th className="px-4 py-3 text-left font-semibold text-gray-700">Type</th>
                <th className="px-4 py-3 text-left font-semibold text-gray-700">Academic Year</th>
                <th className="px-4 py-3 text-left font-semibold text-gray-700">Purpose</th>
                <th className="px-4 py-3 text-center font-semibold text-gray-700">Copies</th>
                <th className="px-4 py-3 text-center font-semibold text-gray-700">Status</th>
                <th className="px-4 py-3 text-left font-semibold text-gray-700">Date</th>
                <th className="px-4 py-3 text-center font-semibold text-gray-700">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {rows.map((r) => (
                <tr key={r.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3">
                    <div className="font-medium text-gray-900">{r.lname} {r.fname}</div>
                    <div className="text-xs text-gray-500">{r.regnumber}</div>
                  </td>
                  <td className="px-4 py-3 capitalize">{r.request_type}</td>
                  <td className="px-4 py-3 text-gray-600">{r.year_label ?? '—'}</td>
                  <td className="px-4 py-3 text-gray-600 max-w-[200px] truncate">{r.purpose ?? '—'}</td>
                  <td className="px-4 py-3 text-center">{r.copies}</td>
                  <td className="px-4 py-3 text-center">
                    <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium capitalize ${STATUS_BADGE[r.status]}`}>
                      {r.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-500 text-xs whitespace-nowrap">
                    {new Date(r.created_at).toLocaleDateString()}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex justify-center gap-2">
                      {r.status === 'pending' && (
                        <>
                          <button title="Approve" onClick={() => reviewMut.mutate({ id: r.id, action: 'approve' })}
                            className="p-1.5 rounded text-green-600 hover:bg-green-50">
                            <Check className="w-4 h-4" />
                          </button>
                          <button title="Reject"
                            onClick={() => { if (window.confirm('Reject this request?')) reviewMut.mutate({ id: r.id, action: 'reject' }) }}
                            className="p-1.5 rounded text-red-600 hover:bg-red-50">
                            <X className="w-4 h-4" />
                          </button>
                        </>
                      )}
                      {r.status === 'approved' && (
                        <button title="Mark Dispatched"
                          onClick={() => { setDispatchId(r.id); setDispatchNotes('') }}
                          className="p-1.5 rounded text-blue-600 hover:bg-blue-50">
                          <Truck className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {lastPage > 1 && (
        <div className="flex items-center justify-between mt-4 text-sm text-gray-600">
          <span>{total} request{total !== 1 ? 's' : ''}</span>
          <div className="flex gap-2">
            <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page <= 1}
              className="p-2 border rounded hover:bg-gray-50 disabled:opacity-40">
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="px-3 py-2 border rounded bg-white">{page} / {lastPage}</span>
            <button onClick={() => setPage(p => Math.min(lastPage, p + 1))} disabled={page >= lastPage}
              className="p-2 border rounded hover:bg-gray-50 disabled:opacity-40">
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      <Modal open={dispatchId !== null} title="Mark as Dispatched" onClose={() => setDispatchId(null)}>
        <div className="space-y-4 p-1">
          <p className="text-sm text-gray-600">Add optional dispatch notes (courier reference, collection date, etc.).</p>
          <textarea value={dispatchNotes} onChange={(e) => setDispatchNotes(e.target.value)}
            rows={3} placeholder="Dispatch notes…"
            className="w-full border rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500" />
          <div className="flex justify-end gap-2">
            <button onClick={() => setDispatchId(null)} className="px-4 py-2 text-sm border rounded-lg hover:bg-gray-50">Cancel</button>
            <button onClick={() => dispatchId !== null && dispatchMut.mutate(dispatchId)}
              disabled={dispatchMut.isPending}
              className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50">
              {dispatchMut.isPending ? 'Saving…' : 'Confirm Dispatch'}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
