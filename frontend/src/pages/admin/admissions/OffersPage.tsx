import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import {
  Handshake, Loader2, Send, Layers, Download, Mail,
  MailCheck, FileText,
} from 'lucide-react'
import Modal from '@/components/ui/Modal'
import { offerService, intakeService } from '@/services/admissionService'
import { academicService } from '@/services/academicService'
import { academicsMgmtService } from '@/services/academicsMgmtService'
import AdmissionLetter from '@/components/admission/AdmissionLetter'

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
  const [bulkSendOpen, setBulkSendOpen] = useState(false)
  const [viewingOffer, setViewingOffer] = useState<any>(null)
  const [bulkForm, setBulkForm] = useState({ department_id: '', intake: '', academic_year_id: '', expires_at: '' })
  const [bulkSendForm, setBulkSendForm] = useState({ department_id: '', intake: '', academic_year_id: '' })
  const [newOffer, setNewOffer] = useState({ application_id: '', expires_at: '' })

  const deptsQ = useQuery({
    queryKey: ['admin', 'departments'],
    queryFn:  () => academicsMgmtService.list('departments', { per_page: 500 }),
    enabled:  bulkOpen || bulkSendOpen,
  })
  const yearsQ = useQuery({
    queryKey: ['admin', 'years'],
    queryFn:  () => academicService.listYears(),
    enabled:  bulkOpen || bulkSendOpen,
  })
  const intakesQ = useQuery({
    queryKey: ['admin', 'intakes'],
    queryFn:  () => intakeService.list(),
    enabled:  bulkOpen || bulkSendOpen,
  })

  const listQ = useQuery({
    queryKey: ['admin', 'offers', status],
    queryFn:  () => offerService.list({ 
        status: status || undefined, 
        enrolled_only: '1' 
    }),
  })

  const enroll = useMutation({
    mutationFn: (id: number) => offerService.initiateEnrollment(id),
    onSuccess:  () => { toast.success('Enrollment initiated — student record created'); qc.invalidateQueries({ queryKey: ['admin', 'offers'] }) },
    onError:    (e: any) => toast.error(e?.response?.data?.message ?? 'Failed'),
  })

  const sendLetter = useMutation({
    mutationFn: (offerId: number) => offerService.sendLetter(offerId),
    onSuccess:  () => { toast.success('Admission letter sent successfully'); qc.invalidateQueries({ queryKey: ['admin', 'offers'] }) },
    onError:    (e: any) => toast.error(e?.response?.data?.message ?? 'Failed to send letter'),
  })

  const create = useMutation({
    mutationFn: () => offerService.create({ application_id: Number(newOffer.application_id), expires_at: newOffer.expires_at }),
    onSuccess:  (r) => {
      toast.success(`Offer ${r.data?.offer_letter_reference} created`)
      setNewOpen(false)
      setNewOffer({ application_id: '', expires_at: '' })
      qc.invalidateQueries({ queryKey: ['admin', 'offers'] })
    },
    onError: (e: any) => toast.error(e?.response?.data?.message ?? 'Failed'),
  })

  const bulkCreate = useMutation({
    mutationFn: () => offerService.bulkCreate({
      department_id:    Number(bulkForm.department_id),
      intake:           bulkForm.intake,
      academic_year_id: Number(bulkForm.academic_year_id),
      expires_at:       bulkForm.expires_at,
    }),
    onSuccess: (r) => {
      toast.success(`${r.data?.created ?? 0} offers created`)
      setBulkOpen(false)
      setBulkForm({ department_id: '', intake: '', academic_year_id: '', expires_at: '' })
      qc.invalidateQueries({ queryKey: ['admin', 'offers'] })
    },
    onError: (e: any) => toast.error(e?.response?.data?.message ?? 'Failed'),
  })

  const bulkSend = useMutation({
    mutationFn: () => offerService.bulkSendLetters({
      department_id:    Number(bulkSendForm.department_id),
      intake:           bulkSendForm.intake,
      academic_year_id: Number(bulkSendForm.academic_year_id),
    }),
    onSuccess: (r: any) => {
      const d = r.data
      if (d.errors?.length) {
        toast.error(`${d.sent}/${d.total} sent. ${d.errors.length} error(s).`)
      } else {
        toast.success(`${d.sent} admission letters sent successfully`)
      }
      setBulkSendOpen(false)
      setBulkSendForm({ department_id: '', intake: '', academic_year_id: '' })
      qc.invalidateQueries({ queryKey: ['admin', 'offers'] })
    },
    onError: (e: any) => toast.error(e?.response?.data?.message ?? 'Bulk send failed'),
  })

  const rows = listQ.data?.data?.data ?? []


  return (
    <section className="space-y-4">
      {/* Header */}
      <div className="card p-4 flex items-center gap-3 flex-wrap">
        <Handshake className="w-5 h-5 text-brand" />
        <div>
          <h2 className="section-title">Registered Applications</h2>
          <p className="section-sub">{rows.length} registered student{rows.length === 1 ? '' : 's'}</p>
        </div>
        <div className="flex-1" />

        {/* Filter */}
        <select className="input w-40" value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">All statuses</option>
          <option value="accepted">Accepted</option>
          <option value="enrolled">Enrolled</option>
        </select>

        {/* Bulk Send Letters */}
        <button className="btn-secondary btn-sm border-emerald-300 text-emerald-700 dark:text-emerald-400" onClick={() => setBulkSendOpen(true)}>
          <MailCheck className="w-3.5 h-3.5" /> Bulk Send Letters
        </button>

        <button className="btn-secondary btn-sm" onClick={() => setBulkOpen(true)}>
          <Layers className="w-3.5 h-3.5" /> Bulk Offer
        </button>
      </div>

      {/* Table */}
      <div className="card p-0 overflow-hidden">
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
                  <th>Letter</th>
                  <th>Status</th>
                  <th className="text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((o: any) => (
                  <tr key={o.id}>
                    <td className="font-mono text-[12px]">{o.offer_letter_reference}</td>
                    <td>
                      <p className="font-medium text-ink-900 dark:text-ink-100">{o.first_name} {o.last_name}</p>
                      <p className="text-[11px] text-ink-500">{o.email}</p>
                    </td>
                    <td className="text-[13px]">{o.department_name ?? '—'}</td>
                    <td className="text-[12px]">{fmt(o.offered_at)}</td>
                    <td className="text-[12px]">
                      <span className={isExpiringSoon(o.expires_at) ? 'text-amber-600 font-bold' : ''}>{fmt(o.expires_at)}</span>
                    </td>
                    <td>
                      {o.letter_sent_at ? (
                        <span className="inline-flex items-center gap-1 text-[11px] text-emerald-600 font-bold">
                          <MailCheck className="w-3.5 h-3.5" /> Sent {fmt(o.letter_sent_at)}
                        </span>
                      ) : (
                        <span className="text-[11px] text-ink-400">Not sent</span>
                      )}
                    </td>
                    <td>
                      <span className={STATUS_TONE[o.status] ?? 'chip-soft'}>{o.status.replace(/_/g, ' ')}</span>
                    </td>
                    <td className="text-right">
                      <div className="flex items-center justify-end gap-1.5 flex-wrap">

                        {/* View Letter */}
                        <button className="btn-secondary btn-sm" onClick={() => setViewingOffer(o)}>
                          <FileText className="w-3 h-3" /> Letter
                        </button>

                        {/* Download PDF */}
                        <a
                          href={offerService.letterPdfUrl(o.id)}
                          target="_blank"
                          rel="noreferrer"
                          className="btn-secondary btn-sm"
                          title="Download PDF"
                        >
                          <Download className="w-3 h-3" />
                        </a>

                        {/* Send Letter */}
                        {['pending', 'accepted'].includes(o.status) && (
                          <button
                            className="btn-secondary btn-sm border-emerald-300 text-emerald-700 dark:text-emerald-400"
                            title={o.letter_sent_at ? 'Resend Letter' : 'Send Letter'}
                            disabled={sendLetter.isPending && sendLetter.variables === o.id}
                            onClick={() => sendLetter.mutate(o.id)}
                          >
                            {sendLetter.isPending && sendLetter.variables === o.id
                              ? <Loader2 className="w-3 h-3 animate-spin" />
                              : <Mail className="w-3 h-3" />
                            }
                            {o.letter_sent_at ? 'Resend' : 'Send'}
                          </button>
                        )}

                        {/* Enroll */}
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
                        {o.enrollment_initiated && <span className="chip-success">Enrolled</span>}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* View Letter Modal */}
      <Modal
        open={!!viewingOffer}
        onClose={() => setViewingOffer(null)}
        title="Admission Letter Preview"
        size="lg"
        footer={
          <>
            <button className="btn-secondary" onClick={() => setViewingOffer(null)}>Close</button>
            <a
              href={viewingOffer ? offerService.letterPdfUrl(viewingOffer.id) : '#'}
              target="_blank"
              rel="noreferrer"
              className="btn-primary flex items-center gap-2"
            >
              <Download className="w-4 h-4" /> Download PDF
            </a>
            <button className="btn-secondary" onClick={() => window.print()}>
              Print
            </button>
          </>
        }
      >
        {viewingOffer && (
          <div className="bg-slate-100 p-6 rounded-xl overflow-y-auto max-h-[70vh]">
            <AdmissionLetter offer={viewingOffer} />
          </div>
        )}
      </Modal>

      {/* New Offer Modal */}
      <Modal
        open={newOpen}
        onClose={() => setNewOpen(false)}
        title="Create Admission Offer"
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
            <input className="input" placeholder="e.g. 42" value={newOffer.application_id}
              onChange={(e) => setNewOffer({ ...newOffer, application_id: e.target.value })} />
            <p className="text-[11.5px] text-ink-500 mt-1">Find the ID in the Applications list.</p>
          </div>
          <div>
            <label className="label">Offer Expiry</label>
            <input type="date" className="input" value={newOffer.expires_at}
              onChange={(e) => setNewOffer({ ...newOffer, expires_at: e.target.value })} />
          </div>
        </div>
      </Modal>

      {/* Bulk Offer Modal */}
      <Modal
        open={bulkOpen}
        onClose={() => setBulkOpen(false)}
        title="Bulk Create Offers"
        footer={
          <>
            <button className="btn-secondary" onClick={() => setBulkOpen(false)}>Cancel</button>
            <button
              className="btn-primary"
              disabled={bulkCreate.isPending || !bulkForm.department_id || !bulkForm.intake || !bulkForm.academic_year_id || !bulkForm.expires_at}
              onClick={() => bulkCreate.mutate()}
            >
              {bulkCreate.isPending && <Loader2 className="w-3.5 h-3.5 animate-spin" />} Create Offers
            </button>
          </>
        }
      >
        <BulkFormFields
          form={bulkForm}
          setForm={setBulkForm}
          depts={deptsQ.data?.data?.data ?? []}
          years={yearsQ.data?.data ?? []}
          intakes={intakesQ.data?.data ?? []}
          showExpiry
        />
      </Modal>

      {/* Bulk Send Letters Modal */}
      <Modal
        open={bulkSendOpen}
        onClose={() => setBulkSendOpen(false)}
        title="Bulk Send Admission Letters"
        footer={
          <>
            <button className="btn-secondary" onClick={() => setBulkSendOpen(false)}>Cancel</button>
            <button
              className="btn-primary"
              disabled={bulkSend.isPending || !bulkSendForm.department_id || !bulkSendForm.intake || !bulkSendForm.academic_year_id}
              onClick={() => bulkSend.mutate()}
            >
              {bulkSend.isPending && <Loader2 className="w-3.5 h-3.5 animate-spin" />} Send Letters
            </button>
          </>
        }
      >
        <div className="space-y-4">
          <div className="p-4 bg-emerald-50 dark:bg-emerald-900/10 border border-emerald-100 dark:border-emerald-900/40 rounded-xl text-[13px] text-emerald-800 dark:text-emerald-300 flex items-start gap-3">
            <MailCheck className="w-5 h-5 shrink-0 mt-0.5" />
            <p>Sends admission letters (with PDF attachments) to all offered applicants in the selected department who haven't received a letter yet.</p>
          </div>
          <BulkFormFields
            form={bulkSendForm}
            setForm={setBulkSendForm}
            depts={deptsQ.data?.data?.data ?? []}
            years={yearsQ.data?.data ?? []}
            intakes={intakesQ.data?.data ?? []}
            showExpiry={false}
          />
        </div>
      </Modal>
    </section>
  )
}

function BulkFormFields({
  form, setForm, depts, years, intakes, showExpiry,
}: {
  form: any; setForm: (f: any) => void
  depts: any[]; years: any[]; intakes: any[]
  showExpiry: boolean
}) {
  return (
    <div className="space-y-4">
      <div>
        <label className="label">Department</label>
        <select className="input" value={form.department_id} onChange={(e) => setForm({ ...form, department_id: e.target.value })}>
          <option value="">— Select —</option>
          {depts.map((d: any) => (
            <option key={d.dep_id ?? d.id} value={d.dep_id ?? d.id}>{d.dep_name ?? d.name}</option>
          ))}
        </select>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="label">Intake</label>
          <select className="input" value={form.intake} onChange={(e) => setForm({ ...form, intake: e.target.value })}>
            <option value="">— Select —</option>
            {intakes.map((i: any) => (
              <option key={i.id} value={i.name}>{i.name}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="label">Academic Year</label>
          <select className="input" value={form.academic_year_id} onChange={(e) => setForm({ ...form, academic_year_id: e.target.value })}>
            <option value="">— Select —</option>
            {years.map((y: any) => (
              <option key={y.id} value={y.id}>{y.label}</option>
            ))}
          </select>
        </div>
      </div>
      {showExpiry && (
        <div>
          <label className="label">Offer Expiry</label>
          <input type="date" className="input" value={form.expires_at}
            onChange={(e) => setForm({ ...form, expires_at: e.target.value })} />
        </div>
      )}
    </div>
  )
}

function fmt(v: string | null | undefined) {
  if (!v) return '—'
  try { return new Date(v.replace(' ', 'T')).toLocaleDateString() } catch { return v }
}

function isExpiringSoon(v: string | null | undefined): boolean {
  if (!v) return false
  try {
    const diff = new Date(v).getTime() - Date.now()
    return diff > 0 && diff < 3 * 24 * 60 * 60 * 1000 // within 3 days
  } catch { return false }
}
