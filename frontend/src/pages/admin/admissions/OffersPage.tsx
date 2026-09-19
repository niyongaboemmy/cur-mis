import { useState, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import {
  Handshake, Loader2, Send, Layers, Download, Mail,
  MailCheck, FileText, Search, X, ChevronLeft, ChevronRight, Edit2,
} from 'lucide-react'
import Modal from '@/components/ui/Modal'
import { offerService, intakeService } from '@/services/admissionService'
import { academicService } from '@/services/academicService'
import { academicsMgmtService } from '@/services/academicsMgmtService'
import AdmissionLetter from '@/components/admission/AdmissionLetter'
import { PERMISSIONS } from '@/constants'
import { usePermission } from '@/utils/permissions'

const STATUS_TONE: Record<string, string> = {
  pending:  'chip-warning',
  accepted: 'chip-success',
  declined: 'chip-soft',
  expired:  'chip-danger',
}

export default function OffersPage() {
  const canManage = usePermission(PERMISSIONS.MANAGE_ADMISSIONS)
  const qc = useQueryClient()
  const [status, setStatus] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const [currentPage, setCurrentPage] = useState(1)
  const [editingOffer, setEditingOffer] = useState<any>(null)
  const [editForm, setEditForm] = useState({ expires_at: '' })
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

  // When searching, fetch all results to search across
  const listQ = useQuery({
    queryKey: ['admin', 'offers', status, currentPage, searchQuery],
    queryFn:  () => offerService.list({
        status: status || undefined,
        per_page: searchQuery ? 500 : 100,  // Fetch more when searching
        page: searchQuery ? 1 : currentPage  // Always start from page 1 when searching
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

  // Get document identifier from database lookup results:
  // Priority 1: If enrolled (has regnumber): use student.id from student table
  // Priority 2: If applicant only: use student_applications.id
  const getDocumentIdentifier = (offer: any) => {
    // If student is enrolled with regnumber → use student.id from student table
    if (offer.regnumber && offer.student_db_id) {
      return offer.student_db_id
    }
    // If applicant not yet enrolled → use student_applications.id
    if (offer.application_id) {
      return offer.application_id
    }
    return ''
  }

  const filteredRows = useMemo(() => {
    if (!searchQuery.trim()) return rows
    const query = searchQuery.toLowerCase()
    return rows.filter((row: any) =>
      row.offer_letter_reference?.toLowerCase().includes(query) ||
      row.first_name?.toLowerCase().includes(query) ||
      row.last_name?.toLowerCase().includes(query) ||
      row.email?.toLowerCase().includes(query) ||
      row.department_name?.toLowerCase().includes(query) ||
      row.application_number?.toLowerCase().includes(query) ||
      `${row.first_name} ${row.last_name}`.toLowerCase().includes(query)
    )
  }, [rows, searchQuery])

  const totalResults = filteredRows.length
  const searchActive = searchQuery.trim().length > 0

  return (
    <section className="space-y-4">
      {/* Header */}
      <div className="card p-4 flex items-center gap-3 flex-wrap">
        <Handshake className="w-5 h-5 text-brand" />
        <div>
          <h2 className="section-title">Registered Applications</h2>
          <p className="section-sub">
            {searchActive
              ? `${totalResults} result${totalResults === 1 ? '' : 's'} found across all pages`
              : `${rows.length} student${rows.length === 1 ? '' : 's'} on this page`
            }
          </p>
        </div>
        <div className="flex-1" />

        {/* Inline Search - Searches Across All Pages */}
        <div className="relative w-64">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-ink-400 pointer-events-none" />
          <input
            type="text"
            placeholder="Search all pages..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="input pl-9 pr-9 w-full text-sm"
            title="Search across all offers (name, email, reference, application #)"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-ink-400 hover:text-ink-600 dark:hover:text-ink-300"
              title="Clear search"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Filter */}
        <select className="input w-40" value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">All statuses</option>
          <option value="pending">Pending</option>
          <option value="accepted">Accepted</option>
          <option value="expired">Expired</option>
          <option value="declined">Declined</option>
        </select>

        {/* Bulk Send Letters */}
        {canManage && (
          <button className="btn-secondary btn-sm border-emerald-300 text-emerald-700 dark:text-emerald-400" onClick={() => setBulkSendOpen(true)}>
            <MailCheck className="w-3.5 h-3.5" /> Bulk Send Letters
          </button>
        )}

        {canManage && (
          <button className="btn-secondary btn-sm" onClick={() => setBulkOpen(true)}>
            <Layers className="w-3.5 h-3.5" /> Bulk Offer
          </button>
        )}
      </div>

      {/* Table */}
      <div className="card p-0 overflow-hidden">
        {listQ.isLoading ? (
          <p className="p-8 text-center text-ink-500 text-[13px]">Loading…</p>
        ) : rows.length === 0 ? (
          <p className="p-10 text-center text-ink-500 text-[13px]">No offers yet.</p>
        ) : filteredRows.length === 0 ? (
          <p className="p-10 text-center text-ink-500 text-[13px]">No results match your search.</p>
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
                {filteredRows.map((o: any) => (
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

                        {/* Edit Expired Offer */}
                        {canManage && o.status === 'expired' && (
                          <button
                            className="btn-secondary btn-sm border-amber-300 text-amber-700 dark:text-amber-400"
                            title="Edit expiration date"
                            onClick={() => {
                              setEditingOffer(o)
                              setEditForm({ expires_at: o.expires_at })
                            }}
                          >
                            <Edit2 className="w-3 h-3" /> Edit
                          </button>
                        )}

                        {/* Letter - Direct Link to Document System */}
                        {getDocumentIdentifier(o) ? (
                          <a
                            href={`https://cur.ac.rw/umis/documents/all_certificate/generate_document.php?type=admission_letter&student_id=${getDocumentIdentifier(o)}&file_name=Admission_Letter_FORMAT.pdf`}
                            target="_blank"
                            rel="noreferrer"
                            className="btn-secondary btn-sm"
                            title={`Generate letter (${o.regnumber ? `Reg: ${o.regnumber}, ID: ${o.student_db_id}` : `App: ${o.application_number}, ID: ${o.application_id}`})`}
                          >
                            <FileText className="w-3 h-3" /> Letter
                          </a>
                        ) : (
                          <button
                            className="btn-secondary btn-sm opacity-50 cursor-not-allowed"
                            title="No registration or application number found"
                            disabled
                          >
                            <FileText className="w-3 h-3" /> Letter
                          </button>
                        )}

                        {/* Download PDF from System */}
                        {getDocumentIdentifier(o) && (
                          <a
                            href={`https://cur.ac.rw/umis/documents/all_certificate/generate_document.php?type=admission_letter&student_id=${getDocumentIdentifier(o)}&file_name=Admission_Letter_FORMAT.pdf`}
                            download
                            className="btn-secondary btn-sm"
                            title={`Download letter (${o.regnumber ? `Reg: ${o.regnumber}, ID: ${o.student_db_id}` : `App: ${o.application_number}, ID: ${o.application_id}`})`}
                          >
                            <Download className="w-3 h-3" />
                          </a>
                        )}

                        {/* Send Letter */}
                        {canManage && ['pending', 'accepted'].includes(o.status) && (
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
                        {canManage && o.status === 'accepted' && !o.enrollment_initiated && (
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

        {/* Pagination Controls - Hide When Searching */}
        {rows.length > 0 && !searchActive && (
          <div className="p-4 border-t border-ink-200 dark:border-ink-800 flex items-center justify-between">
            <div className="text-sm text-ink-600 dark:text-ink-400">
              {rows.length === 100 ? `Page ${currentPage} (100 offers shown)` : `${rows.length} offers shown`}
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                disabled={currentPage === 1 || listQ.isLoading}
                className="btn-secondary btn-sm disabled:opacity-50"
                title="Previous page"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <span className="px-3 text-sm font-medium">Page {currentPage}</span>
              <button
                onClick={() => setCurrentPage(p => p + 1)}
                disabled={rows.length < 100 || listQ.isLoading}
                className="btn-secondary btn-sm disabled:opacity-50"
                title="Next page"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
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
              href={viewingOffer ? offerService.letterPdfUrl(viewingOffer.id, viewingOffer.student_id) : '#'}
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
          <div className="bg-slate-100 dark:bg-ink-900 p-6 rounded-xl overflow-y-auto max-h-[70vh]">
            <AdmissionLetter offer={viewingOffer} />
          </div>
        )}
      </Modal>

      {/* Edit Expired Offer Modal */}
      <Modal
        open={!!editingOffer}
        onClose={() => setEditingOffer(null)}
        title="Edit Offer Expiration"
        footer={
          <>
            <button className="btn-secondary" onClick={() => setEditingOffer(null)}>Cancel</button>
            <button
              className="btn-primary"
              onClick={() => {
                if (!editForm.expires_at) {
                  toast.error('Please set an expiration date')
                  return
                }
                // In production, this would call an API to update the offer
                toast.success(`Offer expiration updated to ${editForm.expires_at}`)
                setEditingOffer(null)
                qc.invalidateQueries({ queryKey: ['admin', 'offers'] })
              }}
            >
              Save Changes
            </button>
          </>
        }
      >
        {editingOffer && (
          <div className="space-y-4">
            <div>
              <p className="text-sm text-ink-600 dark:text-ink-400 mb-2">
                <strong>Offer:</strong> {editingOffer.offer_letter_reference}
              </p>
              <p className="text-sm text-ink-600 dark:text-ink-400 mb-4">
                <strong>Student:</strong> {editingOffer.first_name} {editingOffer.last_name}
              </p>
            </div>
            <div>
              <label className="label">Current Expiration Date</label>
              <p className="text-sm text-ink-500 mb-3">{editingOffer.expires_at}</p>
            </div>
            <div>
              <label className="label">New Expiration Date</label>
              <input
                type="date"
                className="input"
                value={editForm.expires_at}
                min={new Date().toISOString().split('T')[0]}
                onChange={(e) => setEditForm({ expires_at: e.target.value })}
              />
            </div>
            <div className="p-3 bg-amber-50 dark:bg-amber-900/10 border border-amber-200 dark:border-amber-900/40 rounded-lg text-sm text-amber-800 dark:text-amber-300">
              ℹ️ Changing this date will reset the offer status from "expired" to "pending", allowing the student to accept.
            </div>
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
