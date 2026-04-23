import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { Handshake, Loader2, Plus, Send, Layers } from 'lucide-react'
import Modal from '@/components/ui/Modal'
import { offerService } from '@/services/admissionService'
import { academicService } from '@/services/academicService'
import { academicsMgmtService } from '@/services/academicsMgmtService'

const STATUS_TONE: Record<string, string> = {
  pending:  'chip-warning',
  accepted: 'chip-success',
  declined: 'chip-soft',
  expired:  'chip-danger',
}

export default function OffersPage() {
  const qc = useQueryClient()
  const [status, setStatus] = useState('')
  const [newOpen, setNewOpen] = useState(false)
  const [bulkOpen, setBulkOpen] = useState(false)
  const [bulkForm, setBulkForm] = useState({ department_id: '', intake: '', academic_year_id: '', expires_at: '' })

  const deptsQ = useQuery({ queryKey: ['admin', 'departments'], queryFn: () => academicsMgmtService.list('departments', { per_page: 500 }), enabled: bulkOpen })
  const yearsQ = useQuery({ queryKey: ['admin', 'years'], queryFn: () => academicService.listYears(), enabled: bulkOpen })

  const listQ = useQuery({
    queryKey: ['admin', 'offers', status],
    queryFn:  () => offerService.list(status ? { status } : {}),
  })

  const enroll = useMutation({
    mutationFn: (id: number) => offerService.initiateEnrollment(id),
    onSuccess: () => {
      toast.success('Enrollment initiated — student record created')
      qc.invalidateQueries({ queryKey: ['admin', 'offers'] })
    },
    onError: (e: any) => toast.error(e?.response?.data?.message ?? 'Failed'),
  })

  const [newOffer, setNewOffer] = useState({ application_id: '', expires_at: '' })
  const create = useMutation({
    mutationFn: () => offerService.create({
      application_id: Number(newOffer.application_id),
      expires_at:     newOffer.expires_at,
    }),
    onSuccess: (r) => {
      toast.success(`Offer ${r.data?.offer_letter_reference} created`)
      setNewOpen(false); setNewOffer({ application_id: '', expires_at: '' })
      qc.invalidateQueries({ queryKey: ['admin', 'offers'] })
    },
    onError: (e: any) => toast.error(e?.response?.data?.message ?? 'Failed'),
  })

  const bulkCreate = useMutation({
    mutationFn: () => offerService.bulkCreate({
      department_id: Number(bulkForm.department_id),
      intake: bulkForm.intake,
      academic_year_id: Number(bulkForm.academic_year_id),
      expires_at: bulkForm.expires_at,
    }),
    onSuccess: (r) => {
      toast.success(`${r.data?.created ?? 0} offers created`)
      setBulkOpen(false); setBulkForm({ department_id: '', intake: '', academic_year_id: '', expires_at: '' })
      qc.invalidateQueries({ queryKey: ['admin', 'offers'] })
    },
    onError: (e: any) => toast.error(e?.response?.data?.message ?? 'Failed'),
  })

  const rows = listQ.data?.data?.data ?? []

  return (
    <section className="card p-0 overflow-hidden">
      <div className="flex items-center gap-3 p-4 border-b border-ink-100 flex-wrap">
        <Handshake className="w-5 h-5 text-brand" />
        <div>
          <h2 className="section-title">Admission offers</h2>
          <p className="section-sub">{rows.length} offer{rows.length === 1 ? '' : 's'}</p>
        </div>
        <div className="flex-1" />
        <select className="input w-40" value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">All statuses</option>
          <option value="pending">Pending</option>
          <option value="accepted">Accepted</option>
          <option value="declined">Declined</option>
          <option value="expired">Expired</option>
        </select>
        <button className="btn-secondary btn-sm" onClick={() => setBulkOpen(true)}>
          <Layers className="w-3.5 h-3.5" /> Bulk offer
        </button>
        <button className="btn-primary btn-sm" onClick={() => setNewOpen(true)}>
          <Plus className="w-3.5 h-3.5" /> New offer
        </button>
      </div>

      {listQ.isLoading ? (
        <p className="p-8 text-center text-ink-500 text-[13px]">Loading…</p>
      ) : rows.length === 0 ? (
        <p className="p-10 text-center text-ink-500 text-[13px]">No offers yet.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="data-table">
            <thead>
              <tr>
                <th>Reference</th>
                <th>Applicant</th>
                <th>Program</th>
                <th>Offered</th>
                <th>Expires</th>
                <th>Status</th>
                <th className="text-right">Action</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((o) => (
                <tr key={o.id}>
                  <td className="font-mono text-[12px]">{o.offer_letter_reference}</td>
                  <td>{o.applicant_name ?? `App #${o.application_id}`}</td>
                  <td>{o.department_name ?? '—'}</td>
                  <td>{fmt(o.offered_at)}</td>
                  <td>{o.expires_at}</td>
                  <td><span className={STATUS_TONE[o.status] ?? 'chip-soft'}>{o.status}</span></td>
                  <td className="text-right">
                    {o.status === 'accepted' && !o.enrollment_initiated && (
                      <button
                        className="btn-primary btn-sm"
                        onClick={() => enroll.mutate(o.id)}
                        disabled={enroll.isPending && enroll.variables === o.id}
                      >
                        {enroll.isPending && enroll.variables === o.id
                          ? <Loader2 className="w-3 h-3 animate-spin" />
                          : <Send className="w-3 h-3" />}
                        Enroll
                      </button>
                    )}
                    {o.enrollment_initiated
                      ? <span className="chip-success">Enrolled</span>
                      : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* New offer modal */}
      <Modal
        open={newOpen}
        onClose={() => setNewOpen(false)}
        title="Create admission offer"
        footer={
          <>
            <button className="btn-secondary" onClick={() => setNewOpen(false)}>Cancel</button>
            <button className="btn-primary" disabled={create.isPending} onClick={() => create.mutate()}>
              {create.isPending && <Loader2 className="w-3.5 h-3.5 animate-spin" />} Create
            </button>
          </>
        }
      >
        <div className="space-y-4">
          <div>
            <label className="label">Application ID</label>
            <input className="input" placeholder="e.g. 42"
              value={newOffer.application_id}
              onChange={(e) => setNewOffer({ ...newOffer, application_id: e.target.value })} />
            <p className="text-[11.5px] text-ink-500 mt-1">Find the ID in the applications list.</p>
          </div>
          <div>
            <label className="label">Offer expiry</label>
            <input type="date" className="input"
              value={newOffer.expires_at}
              onChange={(e) => setNewOffer({ ...newOffer, expires_at: e.target.value })} />
          </div>
        </div>
      </Modal>

      {/* Bulk offer modal */}
      <Modal
        open={bulkOpen}
        onClose={() => setBulkOpen(false)}
        title="Bulk create offers"
        footer={
          <>
            <button className="btn-secondary" onClick={() => setBulkOpen(false)}>Cancel</button>
            <button className="btn-primary" disabled={bulkCreate.isPending || !bulkForm.department_id || !bulkForm.intake || !bulkForm.academic_year_id || !bulkForm.expires_at} onClick={() => bulkCreate.mutate()}>
              {bulkCreate.isPending && <Loader2 className="w-3.5 h-3.5 animate-spin" />} Create offers
            </button>
          </>
        }
      >
        <div className="space-y-4">
          <div>
            <label className="label">Department</label>
            <select className="input" value={bulkForm.department_id} onChange={(e) => setBulkForm({ ...bulkForm, department_id: e.target.value })}>
              <option value="">— Select —</option>
              {deptsQ.data?.data?.data?.map((d: any) => (
                <option key={d.id} value={d.id}>{d.name} ({d.code})</option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Intake</label>
              <select className="input" value={bulkForm.intake} onChange={(e) => setBulkForm({ ...bulkForm, intake: e.target.value })}>
                <option value="">— Select —</option>
                <option value="January">January</option>
                <option value="August">August</option>
              </select>
            </div>
            <div>
              <label className="label">Academic Year</label>
              <select className="input" value={bulkForm.academic_year_id} onChange={(e) => setBulkForm({ ...bulkForm, academic_year_id: e.target.value })}>
                <option value="">— Select —</option>
                {yearsQ.data?.data?.map((y: any) => (
                  <option key={y.id} value={y.id}>{y.label}</option>
                ))}
              </select>
            </div>
          </div>
          <div>
            <label className="label">Offer expiry</label>
            <input type="date" className="input"
              value={bulkForm.expires_at}
              onChange={(e) => setBulkForm({ ...bulkForm, expires_at: e.target.value })} />
            <p className="text-[11.5px] text-ink-500 mt-1">Offers will be generated for all "Merit listed" applications in this intake/year.</p>
          </div>
        </div>
      </Modal>
    </section>
  )
}

function fmt(v: string | null | undefined) {
  if (!v) return '—'
  try { return new Date(v.replace(' ', 'T')).toLocaleDateString() } catch { return v }
}
