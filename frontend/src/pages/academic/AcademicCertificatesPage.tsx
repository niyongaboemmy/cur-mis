import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { Award, Plus, Truck, Ban, Trash2, Search, ChevronLeft, ChevronRight } from 'lucide-react'
import Modal from '@/components/ui/Modal'
import {
  academicCertificateService,
  type AcademicCertificate,
  type CertificateStatus,
  type CertificateType,
  type CertificateIssuePayload,
} from '@/services/academicCertificateService'
import { apiClient } from '@/services/api'

const CERT_TYPES: CertificateType[] = ['degree', 'diploma', 'certificate', 'provisional']
const DEGREE_CLASSES = ['First Class', 'Upper Second', 'Lower Second', 'Pass', 'Distinction']

const STATUS_BADGE: Record<CertificateStatus, string> = {
  draft:      'bg-gray-100 text-gray-700',
  issued:     'bg-green-100 text-green-800',
  dispatched: 'bg-blue-100 text-blue-800',
  revoked:    'bg-red-100 text-red-800',
}

const EMPTY_FORM: CertificateIssuePayload & { regnumber: string } = {
  student_id:       0,
  certificate_type: 'degree',
  degree_class:     'Pass',
  issue_date:       new Date().toISOString().slice(0, 10),
  is_replacement:   false,
  regnumber:        '',
}

export default function AcademicCertificatesPage() {
  const qc = useQueryClient()
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState<CertificateStatus | ''>('')
  const [type, setType]     = useState<CertificateType | ''>('')
  const [page, setPage]     = useState(1)

  const [issueOpen, setIssueOpen]         = useState(false)
  const [dispatchId, setDispatchId]       = useState<number | null>(null)
  const [dispatchDate, setDispatchDate]   = useState(new Date().toISOString().slice(0, 10))
  const [dispatchNotes, setDispatchNotes] = useState('')

  const [form, setForm] = useState<CertificateIssuePayload & { regnumber: string }>({ ...EMPTY_FORM })

  const { data: result, isLoading } = useQuery({
    queryKey: ['academic-certificates', status, type, search, page],
    queryFn:  () => academicCertificateService.list({
      status:           status || undefined,
      certificate_type: type   || undefined,
      search:           search || undefined,
      page,
      per_page: 20,
    }),
  })
  const payload  = result?.data
  const rows: AcademicCertificate[] = payload?.data ?? []
  const total    = payload?.total    ?? 0
  const lastPage = payload?.last_page ?? 1

  const issueMut = useMutation({
    mutationFn: () => academicCertificateService.issue(form),
    onSuccess: (res) => {
      const certNum = res?.data?.certificate_number ?? ''
      toast.success(`Certificate issued: ${certNum}`)
      qc.invalidateQueries({ queryKey: ['academic-certificates'] })
      setIssueOpen(false)
      setForm({ ...EMPTY_FORM })
    },
    onError: (e: any) => toast.error(e?.response?.data?.message ?? 'Failed to issue certificate.'),
  })

  const dispatchMut = useMutation({
    mutationFn: (id: number) => academicCertificateService.dispatch(id, { dispatch_date: dispatchDate, dispatch_notes: dispatchNotes }),
    onSuccess: () => {
      toast.success('Certificate dispatched.')
      qc.invalidateQueries({ queryKey: ['academic-certificates'] })
      setDispatchId(null)
    },
    onError: () => toast.error('Dispatch failed.'),
  })

  const revokeMut = useMutation({
    mutationFn: academicCertificateService.revoke,
    onSuccess: () => { toast.success('Certificate revoked.'); qc.invalidateQueries({ queryKey: ['academic-certificates'] }) },
    onError: () => toast.error('Revoke failed.'),
  })

  const deleteMut = useMutation({
    mutationFn: academicCertificateService.delete,
    onSuccess: () => { toast.success('Certificate deleted.'); qc.invalidateQueries({ queryKey: ['academic-certificates'] }) },
    onError: (e: any) => toast.error(e?.response?.data?.message ?? 'Delete failed.'),
  })

  const findStudent = async () => {
    try {
      const res = await apiClient.get(`/api/students?regnumber=${encodeURIComponent(form.regnumber.trim())}&per_page=1`)
      const student = res.data?.data?.data?.[0] ?? res.data?.data?.[0]
      if (!student?.id) { toast.error('Student not found.'); return }
      setForm((f) => ({ ...f, student_id: student.id }))
      toast.success(`Found: ${student.lname} ${student.fname}`)
    } catch {
      toast.error('Could not look up student.')
    }
  }

  const handleIssue = () => {
    if (!form.regnumber.trim())  { toast.error('Enter a registration number.'); return }
    if (form.student_id === 0)   { toast.error('Student not resolved. Click "Find" first.'); return }
    issueMut.mutate()
  }

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <Award className="w-6 h-6 text-blue-600" />
          <div>
            <h1 className="text-xl font-bold text-gray-900">Academic Certificates</h1>
            <p className="text-sm text-gray-500">Issue, track, and dispatch degrees, diplomas, and certificates.</p>
          </div>
        </div>
        <button onClick={() => setIssueOpen(true)}
          className="flex items-center gap-2 px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700">
          <Plus className="w-4 h-4" /> Issue Certificate
        </button>
      </div>

      <div className="flex flex-wrap gap-3 mb-4">
        <div className="flex items-center gap-2 border rounded-lg px-3 py-2 bg-white text-sm">
          <Search className="w-4 h-4 text-gray-400" />
          <input value={search} onChange={(e) => { setSearch(e.target.value); setPage(1) }}
            placeholder="Name, reg# or cert#…" className="outline-none w-48" />
        </div>
        <select value={status} onChange={(e) => { setStatus(e.target.value as CertificateStatus | ''); setPage(1) }}
          className="border rounded-lg px-3 py-2 text-sm bg-white outline-none">
          <option value="">All Statuses</option>
          {(['draft', 'issued', 'dispatched', 'revoked'] as CertificateStatus[]).map((s) => (
            <option key={s} value={s} className="capitalize">{s}</option>
          ))}
        </select>
        <select value={type} onChange={(e) => { setType(e.target.value as CertificateType | ''); setPage(1) }}
          className="border rounded-lg px-3 py-2 text-sm bg-white outline-none">
          <option value="">All Types</option>
          {CERT_TYPES.map((t) => <option key={t} value={t} className="capitalize">{t}</option>)}
        </select>
      </div>

      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
        {isLoading ? (
          <div className="p-8 text-center text-gray-400">Loading…</div>
        ) : rows.length === 0 ? (
          <div className="p-8 text-center text-gray-400">No certificates found.</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-4 py-3 text-left font-semibold text-gray-700">Student</th>
                <th className="px-4 py-3 text-left font-semibold text-gray-700">Certificate #</th>
                <th className="px-4 py-3 text-left font-semibold text-gray-700">Type</th>
                <th className="px-4 py-3 text-left font-semibold text-gray-700">Degree Class</th>
                <th className="px-4 py-3 text-left font-semibold text-gray-700">Issue Date</th>
                <th className="px-4 py-3 text-center font-semibold text-gray-700">Status</th>
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
                  <td className="px-4 py-3 font-mono text-xs text-gray-700">{r.certificate_number ?? '—'}</td>
                  <td className="px-4 py-3 capitalize text-gray-700">{r.certificate_type}</td>
                  <td className="px-4 py-3 text-gray-700">{r.degree_class ?? '—'}</td>
                  <td className="px-4 py-3 text-gray-500 text-xs">{r.issue_date ?? '—'}</td>
                  <td className="px-4 py-3 text-center">
                    <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium capitalize ${STATUS_BADGE[r.status]}`}>
                      {r.status}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex justify-center gap-1">
                      {r.status === 'issued' && (
                        <button title="Dispatch"
                          onClick={() => { setDispatchId(r.id); setDispatchDate(new Date().toISOString().slice(0, 10)); setDispatchNotes('') }}
                          className="p-1.5 rounded text-blue-600 hover:bg-blue-50">
                          <Truck className="w-4 h-4" />
                        </button>
                      )}
                      {['issued', 'dispatched'].includes(r.status) && (
                        <button title="Revoke"
                          onClick={() => { if (window.confirm('Revoke this certificate?')) revokeMut.mutate(r.id) }}
                          className="p-1.5 rounded text-orange-500 hover:bg-orange-50">
                          <Ban className="w-4 h-4" />
                        </button>
                      )}
                      {r.status === 'draft' && (
                        <button title="Delete"
                          onClick={() => { if (window.confirm('Delete this draft certificate?')) deleteMut.mutate(r.id) }}
                          className="p-1.5 rounded text-red-500 hover:bg-red-50">
                          <Trash2 className="w-4 h-4" />
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
          <span>{total} certificate{total !== 1 ? 's' : ''}</span>
          <div className="flex gap-2">
            <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page <= 1}
              className="p-2 border rounded hover:bg-gray-50 disabled:opacity-40"><ChevronLeft className="w-4 h-4" /></button>
            <span className="px-3 py-2 border rounded bg-white">{page} / {lastPage}</span>
            <button onClick={() => setPage(p => Math.min(lastPage, p + 1))} disabled={page >= lastPage}
              className="p-2 border rounded hover:bg-gray-50 disabled:opacity-40"><ChevronRight className="w-4 h-4" /></button>
          </div>
        </div>
      )}

      {/* Issue modal */}
      <Modal open={issueOpen} title="Issue Academic Certificate" onClose={() => setIssueOpen(false)}>
        <div className="space-y-4 p-1">
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Student Registration Number</label>
            <div className="flex gap-2">
              <input value={form.regnumber}
                onChange={(e) => setForm(f => ({ ...f, regnumber: e.target.value, student_id: 0 }))}
                placeholder="e.g. STD/2024/001"
                className="flex-1 border rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500" />
              <button onClick={findStudent} className="px-3 py-2 text-sm border rounded-lg hover:bg-gray-50">Find</button>
            </div>
            {form.student_id > 0 && <p className="text-xs text-green-600 mt-1">Student resolved (ID: {form.student_id})</p>}
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Certificate Type</label>
            <select value={form.certificate_type}
              onChange={(e) => setForm(f => ({ ...f, certificate_type: e.target.value as CertificateType }))}
              className="w-full border rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500">
              {CERT_TYPES.map((t) => <option key={t} value={t} className="capitalize">{t.charAt(0).toUpperCase() + t.slice(1)}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Degree Classification</label>
            <select value={form.degree_class ?? ''}
              onChange={(e) => setForm(f => ({ ...f, degree_class: e.target.value }))}
              className="w-full border rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500">
              {DEGREE_CLASSES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Issue Date</label>
            <input type="date" value={form.issue_date ?? ''}
              onChange={(e) => setForm(f => ({ ...f, issue_date: e.target.value }))}
              className="w-full border rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
            <input type="checkbox" checked={form.is_replacement ?? false}
              onChange={(e) => setForm(f => ({ ...f, is_replacement: e.target.checked }))} className="rounded" />
            This is a replacement certificate
          </label>
          {form.is_replacement && (
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Replacement Reason</label>
              <input value={form.replacement_reason ?? ''}
                onChange={(e) => setForm(f => ({ ...f, replacement_reason: e.target.value }))}
                placeholder="e.g. Lost original"
                className="w-full border rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
          )}
          <div className="flex justify-end gap-2 pt-2">
            <button onClick={() => setIssueOpen(false)} className="px-4 py-2 text-sm border rounded-lg hover:bg-gray-50">Cancel</button>
            <button onClick={handleIssue} disabled={issueMut.isPending}
              className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50">
              {issueMut.isPending ? 'Issuing…' : 'Issue Certificate'}
            </button>
          </div>
        </div>
      </Modal>

      {/* Dispatch modal */}
      <Modal open={dispatchId !== null} title="Dispatch Certificate" onClose={() => setDispatchId(null)}>
        <div className="space-y-4 p-1">
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Dispatch Date</label>
            <input type="date" value={dispatchDate} onChange={(e) => setDispatchDate(e.target.value)}
              className="w-full border rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Dispatch Notes (optional)</label>
            <textarea value={dispatchNotes} onChange={(e) => setDispatchNotes(e.target.value)} rows={2}
              placeholder="Courier ref, collection details…"
              className="w-full border rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <div className="flex justify-end gap-2">
            <button onClick={() => setDispatchId(null)} className="px-4 py-2 text-sm border rounded-lg hover:bg-gray-50">Cancel</button>
            <button onClick={() => dispatchId !== null && dispatchMut.mutate(dispatchId)} disabled={dispatchMut.isPending}
              className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50">
              {dispatchMut.isPending ? 'Saving…' : 'Confirm Dispatch'}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
