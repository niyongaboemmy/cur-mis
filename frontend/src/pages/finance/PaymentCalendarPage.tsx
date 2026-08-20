import { useState, Fragment } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { CalendarClock, Plus, Pencil, Trash2, X, Info, ToggleLeft, ToggleRight, Download, ChevronDown, ChevronUp } from 'lucide-react'
import toast from 'react-hot-toast'
import { paymentCalendarService } from '@/services/financeService'
import { academicService as academicSvc } from '@/services/academicService'
import { academicsMgmtService } from '@/services/academicsMgmtService'
import type {
  PaymentCalendarDocument,
  PaymentCalendarItem,
  PaymentCalendarEventType,
  CreatePaymentCalendarDocumentPayload,
  PaymentCalendarItemPayload,
} from '@/types/finance'
import { PAYMENT_CALENDAR_EVENT_TYPES, PAYMENT_CALENDAR_EVENT_TYPE_LABELS } from '@/types/finance'
import SearchableSelect from '@/components/ui/SearchableSelect'
import ModalPortal from '@/components/ui/ModalPortal'

// ── Types ─────────────────────────────────────────────────────────────────────

interface DocFormState {
  academic_year_id:     number | ''
  faculty_id:            number | ''
  title:                 string
  intake_label:          string
  department_label:      string
  level_label:           string
  notes:                 string
  bank_account_note:     string
  cursu_account_note:    string
  payment_method_note:   string
  fine_notice:           string
  prepared_by_name:      string
  prepared_by_title:     string
  verified_by_name:      string
  verified_by_title:     string
  approved_by_name:      string
  approved_by_title:     string
  is_active:             boolean
}

const EMPTY_DOC: DocFormState = {
  academic_year_id: '', faculty_id: '', title: 'PAYMENT CALENDAR', intake_label: '', department_label: '',
  level_label: '', notes: '', bank_account_note: '', cursu_account_note: '', payment_method_note: '',
  fine_notice: '', prepared_by_name: '', prepared_by_title: '', verified_by_name: '', verified_by_title: '',
  approved_by_name: '', approved_by_title: '', is_active: true,
}

interface ItemFormState {
  group_label:    string
  item_label:     string
  event_type:     PaymentCalendarEventType
  start_date:     string
  deadline_date:  string
  amount:         string
  is_active:      boolean
}

const EMPTY_ITEM: ItemFormState = {
  group_label: '', item_label: '', event_type: 'installment_due', start_date: '', deadline_date: '',
  amount: '', is_active: true,
}

const fmtAmount = (n: string | number | null) =>
  n === null || n === undefined || n === '' ? '—' : `${Number(n).toLocaleString('en-US')} RWF`

const fmtDate = (d: string | null) => (d ? new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—')

// ── PaymentCalendarPage ────────────────────────────────────────────────────────

export default function PaymentCalendarPage() {
  const qc = useQueryClient()
  const [yearId, setYearId] = useState<number | ''>('')
  const [expanded, setExpanded] = useState<Record<number, boolean>>({})

  const [isDocOpen, setIsDocOpen] = useState(false)
  const [isDocEditing, setIsDocEditing] = useState(false)
  const [editingDocId, setEditingDocId] = useState<number | null>(null)
  const [docForm, setDocForm] = useState<DocFormState>(EMPTY_DOC)

  const [itemModal, setItemModal] = useState<{ documentId: number; item?: PaymentCalendarItem } | null>(null)
  const [itemForm, setItemForm] = useState<ItemFormState>(EMPTY_ITEM)

  // ── Data ──────────────────────────────────────────────────────────────────

  const yearsQ = useQuery({
    queryKey: ['academic', 'years'],
    queryFn: ({ signal }) => academicSvc.listYears(signal),
  })
  const years = yearsQ.data?.data ?? []

  const facultiesQ = useQuery({
    queryKey: ['academics', 'faculties'],
    queryFn: () => academicsMgmtService.list<any>('faculties', { per_page: 100 }),
  })
  const faculties = facultiesQ.data?.data?.data ?? []
  const facultyOptions = faculties
    .filter((f: any) => f.fac_id && f.fac_name)
    .map((f: any) => ({ value: f.fac_id, label: f.fac_name }))

  const { data: res, isLoading } = useQuery({
    queryKey: ['finance', 'payment-calendar', yearId],
    queryFn: ({ signal }) =>
      paymentCalendarService.list(yearId ? { academic_year_id: Number(yearId) } : {}, signal),
  })
  const documents: PaymentCalendarDocument[] = res?.data ?? []

  // ── Document mutations ───────────────────────────────────────────────────

  const saveDocMut = useMutation<any, any, DocFormState>({
    mutationFn: (f: DocFormState) => {
      const payload: CreatePaymentCalendarDocumentPayload = {
        academic_year_id:    Number(f.academic_year_id),
        faculty_id:          f.faculty_id ? Number(f.faculty_id) : null,
        title:               f.title.trim() || 'PAYMENT CALENDAR',
        intake_label:        f.intake_label.trim() || null,
        department_label:    f.department_label.trim() || null,
        level_label:         f.level_label.trim() || null,
        notes:               f.notes.trim() || null,
        bank_account_note:   f.bank_account_note.trim() || null,
        cursu_account_note:  f.cursu_account_note.trim() || null,
        payment_method_note: f.payment_method_note.trim() || null,
        fine_notice:         f.fine_notice.trim() || null,
        prepared_by_name:    f.prepared_by_name.trim() || null,
        prepared_by_title:   f.prepared_by_title.trim() || null,
        verified_by_name:    f.verified_by_name.trim() || null,
        verified_by_title:   f.verified_by_title.trim() || null,
        approved_by_name:    f.approved_by_name.trim() || null,
        approved_by_title:   f.approved_by_title.trim() || null,
        is_active:           f.is_active ? 1 : 0,
      }
      if (isDocEditing && editingDocId !== null) {
        return paymentCalendarService.update(editingDocId, payload)
      }
      return paymentCalendarService.create(payload)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['finance', 'payment-calendar'] })
      toast.success(isDocEditing ? 'Calendar updated' : 'Calendar created')
      closeDocModal()
    },
    onError: (e: any) => toast.error(e?.response?.data?.message ?? 'Save failed'),
  })

  const deleteDocMut = useMutation({
    mutationFn: (id: number) => paymentCalendarService.delete(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['finance', 'payment-calendar'] })
      toast.success('Calendar deleted')
    },
    onError: (e: any) => toast.error(e?.response?.data?.message ?? 'Delete failed'),
  })

  // ── Item mutations ───────────────────────────────────────────────────────

  const saveItemMut = useMutation<any, any, { documentId: number; itemId?: number; f: ItemFormState }>({
    mutationFn: ({ documentId, itemId, f }) => {
      const payload: PaymentCalendarItemPayload = {
        group_label:   f.group_label.trim() || null,
        item_label:    f.item_label.trim(),
        event_type:    f.event_type,
        start_date:    f.start_date || null,
        deadline_date: f.deadline_date,
        amount:        f.amount !== '' ? Number(f.amount) : null,
        is_active:     f.is_active ? 1 : 0,
      }
      if (itemId) return paymentCalendarService.updateItem(itemId, payload)
      return paymentCalendarService.createItem(documentId, payload)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['finance', 'payment-calendar'] })
      toast.success(itemModal?.item ? 'Item updated' : 'Item added')
      setItemModal(null)
      setItemForm(EMPTY_ITEM)
    },
    onError: (e: any) => toast.error(e?.response?.data?.message ?? 'Save failed'),
  })

  const deleteItemMut = useMutation({
    mutationFn: (itemId: number) => paymentCalendarService.deleteItem(itemId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['finance', 'payment-calendar'] })
      toast.success('Item deleted')
    },
    onError: (e: any) => toast.error(e?.response?.data?.message ?? 'Delete failed'),
  })

  // ── Helpers ───────────────────────────────────────────────────────────────

  function openCreateDoc() {
    setDocForm({ ...EMPTY_DOC, academic_year_id: yearId ? Number(yearId) : (years[0]?.id ?? '') })
    setIsDocEditing(false)
    setEditingDocId(null)
    setIsDocOpen(true)
  }

  function openEditDoc(d: PaymentCalendarDocument) {
    setDocForm({
      academic_year_id:    d.academic_year_id,
      faculty_id:          d.faculty_id ?? '',
      title:               d.title,
      intake_label:        d.intake_label ?? '',
      department_label:    d.department_label ?? '',
      level_label:         d.level_label ?? '',
      notes:               d.notes ?? '',
      bank_account_note:   d.bank_account_note ?? '',
      cursu_account_note:  d.cursu_account_note ?? '',
      payment_method_note: d.payment_method_note ?? '',
      fine_notice:         d.fine_notice ?? '',
      prepared_by_name:    d.prepared_by_name ?? '',
      prepared_by_title:   d.prepared_by_title ?? '',
      verified_by_name:    d.verified_by_name ?? '',
      verified_by_title:   d.verified_by_title ?? '',
      approved_by_name:    d.approved_by_name ?? '',
      approved_by_title:   d.approved_by_title ?? '',
      is_active:           d.is_active === 1,
    })
    setIsDocEditing(true)
    setEditingDocId(d.id)
    setIsDocOpen(true)
  }

  function closeDocModal() {
    setIsDocOpen(false)
    setEditingDocId(null)
    setDocForm(EMPTY_DOC)
  }

  function handleDeleteDoc(d: PaymentCalendarDocument) {
    if (!confirm(`Delete payment calendar '${d.title}' (${d.faculty_name ?? 'General'})? This cannot be undone.`)) return
    deleteDocMut.mutate(d.id)
  }

  function openCreateItem(documentId: number) {
    setItemForm(EMPTY_ITEM)
    setItemModal({ documentId })
  }

  function openEditItem(documentId: number, item: PaymentCalendarItem) {
    setItemForm({
      group_label:   item.group_label ?? '',
      item_label:    item.item_label,
      event_type:    item.event_type,
      start_date:    item.start_date?.slice(0, 10) ?? '',
      deadline_date: item.deadline_date?.slice(0, 10) ?? '',
      amount:        item.amount !== null ? String(item.amount) : '',
      is_active:     item.is_active === 1,
    })
    setItemModal({ documentId, item })
  }

  function handleDeleteItem(itemId: number) {
    if (!confirm('Delete this schedule row? This cannot be undone.')) return
    deleteItemMut.mutate(itemId)
  }

  function set<K extends keyof DocFormState>(k: K, v: DocFormState[K]) {
    setDocForm((f) => ({ ...f, [k]: v }))
  }
  function setItem<K extends keyof ItemFormState>(k: K, v: ItemFormState[K]) {
    setItemForm((f) => ({ ...f, [k]: v }))
  }

  function toggleExpand(id: number) {
    setExpanded((e) => ({ ...e, [id]: !e[id] }))
  }

  async function handleDownloadPdf(d: PaymentCalendarDocument) {
    try {
      const facSlug = d.faculty_name ? `-${d.faculty_name.replace(/[^A-Za-z0-9]+/g, '-')}` : ''
      await paymentCalendarService.downloadPdf(d.id, `Payment-Calendar${facSlug}-${(d.academic_year_label ?? '').replace('/', '-')}.pdf`)
    } catch {
      toast.error('Failed to download PDF')
    }
  }

  const canSubmitDoc = docForm.academic_year_id !== '' && docForm.title.trim() !== ''
  const canSubmitItem = itemForm.item_label.trim() !== '' && itemForm.deadline_date !== ''

  const totalOf = (d: PaymentCalendarDocument) =>
    d.items.reduce((sum, it) => sum + (it.amount !== null ? Number(it.amount) : 0), 0)

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-4 pb-12">

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white dark:bg-ink-900 p-5 rounded-xl border border-ink-200 dark:border-ink-800 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-brand/10 text-brand rounded-lg">
            <CalendarClock className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-base font-bold text-ink-900 dark:text-ink-50">Payment Calendar</h1>
            <p className="text-xs text-ink-500">Official fee installment schedules by faculty and intake — printable in the CUR letterhead format.</p>
          </div>
        </div>
        <button onClick={openCreateDoc} className="btn btn-primary flex items-center gap-2 text-sm">
          <Plus className="w-4 h-4" />
          New Calendar
        </button>
      </div>

      {/* Filter bar */}
      <div className="bg-white dark:bg-ink-900 p-4 rounded-xl border border-ink-200 dark:border-ink-800 shadow-sm">
        <div className="max-w-xs space-y-1">
          <label className="text-xs font-semibold text-ink-600 dark:text-ink-300">Academic Year</label>
          <SearchableSelect
            options={years.map((y: any) => ({ value: y.id, label: y.label }))}
            value={yearId}
            onChange={(v) => setYearId(v === '' ? '' : Number(v))}
            placeholder="All academic years"
            allLabel="All academic years"
          />
        </div>
      </div>

      {/* Document modal */}
      {isDocOpen && (
        <ModalPortal>
          <div className="fixed inset-0 z-50 overflow-y-auto bg-black/50 backdrop-blur-sm">
            <div className="flex min-h-full items-start justify-center p-4 pt-10">
              <div className="bg-white dark:bg-ink-800 rounded-2xl shadow-2xl w-full max-w-2xl overflow-hidden">
                <div className="flex items-center justify-between px-6 py-4 border-b border-ink-100 dark:border-ink-700">
                  <h3 className="text-base font-semibold text-ink-900 dark:text-white">
                    {isDocEditing ? 'Edit Payment Calendar' : 'New Payment Calendar'}
                  </h3>
                  <button onClick={closeDocModal} className="btn-ghost btn-sm p-1.5 rounded-full" aria-label="Close">
                    <X className="w-4 h-4" />
                  </button>
                </div>

                <form
                  onSubmit={(e) => { e.preventDefault(); if (canSubmitDoc) saveDocMut.mutate(docForm) }}
                  className="p-6 space-y-4 max-h-[75vh] overflow-y-auto"
                >
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <label className="text-xs font-semibold text-ink-600 dark:text-ink-300">Academic Year *</label>
                      <SearchableSelect
                        options={years.map((y: any) => ({ value: y.id, label: y.label }))}
                        value={docForm.academic_year_id}
                        onChange={(v) => set('academic_year_id', v === '' ? '' : Number(v))}
                        placeholder="Select academic year"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs font-semibold text-ink-600 dark:text-ink-300">Faculty</label>
                      <SearchableSelect
                        options={facultyOptions}
                        value={docForm.faculty_id}
                        onChange={(v) => set('faculty_id', v === '' ? '' : Number(v))}
                        placeholder="All / general"
                        allLabel="General (no faculty)"
                      />
                    </div>
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-ink-600 dark:text-ink-300">Title *</label>
                    <input
                      required
                      type="text"
                      className="w-full px-3 py-2 bg-ink-50 dark:bg-ink-900 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand/40 border border-ink-200 dark:border-ink-700"
                      value={docForm.title}
                      onChange={(e) => set('title', e.target.value)}
                    />
                  </div>

                  <div className="grid grid-cols-3 gap-4">
                    <div className="space-y-1">
                      <label className="text-xs font-semibold text-ink-600 dark:text-ink-300">Intake Label</label>
                      <input type="text" placeholder="e.g. September Intake 2025-2026" className="w-full px-3 py-2 bg-ink-50 dark:bg-ink-900 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand/40 border border-ink-200 dark:border-ink-700" value={docForm.intake_label} onChange={(e) => set('intake_label', e.target.value)} />
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs font-semibold text-ink-600 dark:text-ink-300">Department(s)</label>
                      <input type="text" placeholder="e.g. Department of Computer Science" className="w-full px-3 py-2 bg-ink-50 dark:bg-ink-900 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand/40 border border-ink-200 dark:border-ink-700" value={docForm.department_label} onChange={(e) => set('department_label', e.target.value)} />
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs font-semibold text-ink-600 dark:text-ink-300">Level</label>
                      <input type="text" placeholder="e.g. L8 S1&2" className="w-full px-3 py-2 bg-ink-50 dark:bg-ink-900 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand/40 border border-ink-200 dark:border-ink-700" value={docForm.level_label} onChange={(e) => set('level_label', e.target.value)} />
                    </div>
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-ink-600 dark:text-ink-300">Notes</label>
                    <textarea rows={2} className="w-full px-3 py-2 bg-ink-50 dark:bg-ink-900 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand/40 border border-ink-200 dark:border-ink-700" value={docForm.notes} onChange={(e) => set('notes', e.target.value)} />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-ink-600 dark:text-ink-300">Bank Account Note</label>
                    <textarea rows={2} className="w-full px-3 py-2 bg-ink-50 dark:bg-ink-900 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand/40 border border-ink-200 dark:border-ink-700" value={docForm.bank_account_note} onChange={(e) => set('bank_account_note', e.target.value)} />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-ink-600 dark:text-ink-300">CURSU Account Note</label>
                    <textarea rows={2} className="w-full px-3 py-2 bg-ink-50 dark:bg-ink-900 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand/40 border border-ink-200 dark:border-ink-700" value={docForm.cursu_account_note} onChange={(e) => set('cursu_account_note', e.target.value)} />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-ink-600 dark:text-ink-300">Payment Method Note</label>
                    <textarea rows={2} className="w-full px-3 py-2 bg-ink-50 dark:bg-ink-900 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand/40 border border-ink-200 dark:border-ink-700" value={docForm.payment_method_note} onChange={(e) => set('payment_method_note', e.target.value)} />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-ink-600 dark:text-ink-300">Fine / Notice</label>
                    <textarea rows={2} className="w-full px-3 py-2 bg-ink-50 dark:bg-ink-900 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand/40 border border-ink-200 dark:border-ink-700" value={docForm.fine_notice} onChange={(e) => set('fine_notice', e.target.value)} />
                  </div>

                  <div className="grid grid-cols-3 gap-4">
                    <div className="space-y-1">
                      <label className="text-xs font-semibold text-ink-600 dark:text-ink-300">Prepared by</label>
                      <input type="text" placeholder="Name" className="w-full px-3 py-2 bg-ink-50 dark:bg-ink-900 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand/40 border border-ink-200 dark:border-ink-700 mb-1" value={docForm.prepared_by_name} onChange={(e) => set('prepared_by_name', e.target.value)} />
                      <input type="text" placeholder="Title" className="w-full px-3 py-2 bg-ink-50 dark:bg-ink-900 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand/40 border border-ink-200 dark:border-ink-700" value={docForm.prepared_by_title} onChange={(e) => set('prepared_by_title', e.target.value)} />
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs font-semibold text-ink-600 dark:text-ink-300">Verified by</label>
                      <input type="text" placeholder="Name" className="w-full px-3 py-2 bg-ink-50 dark:bg-ink-900 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand/40 border border-ink-200 dark:border-ink-700 mb-1" value={docForm.verified_by_name} onChange={(e) => set('verified_by_name', e.target.value)} />
                      <input type="text" placeholder="Title" className="w-full px-3 py-2 bg-ink-50 dark:bg-ink-900 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand/40 border border-ink-200 dark:border-ink-700" value={docForm.verified_by_title} onChange={(e) => set('verified_by_title', e.target.value)} />
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs font-semibold text-ink-600 dark:text-ink-300">Approved by</label>
                      <input type="text" placeholder="Name" className="w-full px-3 py-2 bg-ink-50 dark:bg-ink-900 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand/40 border border-ink-200 dark:border-ink-700 mb-1" value={docForm.approved_by_name} onChange={(e) => set('approved_by_name', e.target.value)} />
                      <input type="text" placeholder="Title" className="w-full px-3 py-2 bg-ink-50 dark:bg-ink-900 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand/40 border border-ink-200 dark:border-ink-700" value={docForm.approved_by_title} onChange={(e) => set('approved_by_title', e.target.value)} />
                    </div>
                  </div>

                  <div className="flex items-center justify-between pt-2">
                    <button
                      type="button"
                      onClick={() => set('is_active', !docForm.is_active)}
                      className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors border ${
                        docForm.is_active
                          ? 'bg-green-50 text-green-700 border-green-200 dark:bg-green-900/30 dark:text-green-400 dark:border-green-800'
                          : 'bg-ink-50 text-ink-500 border-ink-200 dark:bg-ink-900 dark:text-ink-400 dark:border-ink-700'
                      }`}
                    >
                      {docForm.is_active ? <ToggleRight className="w-4 h-4" /> : <ToggleLeft className="w-4 h-4" />}
                      {docForm.is_active ? 'Active' : 'Inactive'}
                    </button>

                    <div className="flex gap-3">
                      <button type="button" onClick={closeDocModal} className="btn btn-secondary text-sm px-5">Cancel</button>
                      <button type="submit" className="btn btn-primary text-sm px-7" disabled={saveDocMut.isPending || !canSubmitDoc}>
                        {saveDocMut.isPending ? 'Saving…' : isDocEditing ? 'Update' : 'Create'}
                      </button>
                    </div>
                  </div>
                </form>
              </div>
            </div>
          </div>
        </ModalPortal>
      )}

      {/* Item modal */}
      {itemModal && (
        <ModalPortal>
          <div className="fixed inset-0 z-50 overflow-y-auto bg-black/50 backdrop-blur-sm">
            <div className="flex min-h-full items-start justify-center p-4 pt-16">
              <div className="bg-white dark:bg-ink-800 rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden">
                <div className="flex items-center justify-between px-6 py-4 border-b border-ink-100 dark:border-ink-700">
                  <h3 className="text-base font-semibold text-ink-900 dark:text-white">
                    {itemModal.item ? 'Edit Schedule Row' : 'New Schedule Row'}
                  </h3>
                  <button onClick={() => setItemModal(null)} className="btn-ghost btn-sm p-1.5 rounded-full" aria-label="Close">
                    <X className="w-4 h-4" />
                  </button>
                </div>

                <form
                  onSubmit={(e) => {
                    e.preventDefault()
                    if (canSubmitItem) saveItemMut.mutate({ documentId: itemModal.documentId, itemId: itemModal.item?.id, f: itemForm })
                  }}
                  className="p-6 space-y-4"
                >
                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-ink-600 dark:text-ink-300">Group / Level Heading</label>
                    <input type="text" placeholder="e.g. L8 S1&2" className="w-full px-3 py-2 bg-ink-50 dark:bg-ink-900 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand/40 border border-ink-200 dark:border-ink-700" value={itemForm.group_label} onChange={(e) => setItem('group_label', e.target.value)} />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-ink-600 dark:text-ink-300">Description *</label>
                    <input required type="text" placeholder="e.g. First Payment Tuition fees" className="w-full px-3 py-2 bg-ink-50 dark:bg-ink-900 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand/40 border border-ink-200 dark:border-ink-700" value={itemForm.item_label} onChange={(e) => setItem('item_label', e.target.value)} />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-ink-600 dark:text-ink-300">Type</label>
                    <select className="w-full px-3 py-2 bg-ink-50 dark:bg-ink-900 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand/40 border border-ink-200 dark:border-ink-700" value={itemForm.event_type} onChange={(e) => setItem('event_type', e.target.value as PaymentCalendarEventType)}>
                      {PAYMENT_CALENDAR_EVENT_TYPES.map((t) => (
                        <option key={t} value={t}>{PAYMENT_CALENDAR_EVENT_TYPE_LABELS[t]}</option>
                      ))}
                    </select>
                  </div>
                  <div className="grid grid-cols-3 gap-3">
                    <div className="space-y-1">
                      <label className="text-xs font-semibold text-ink-600 dark:text-ink-300">Starting Date</label>
                      <input type="date" className="w-full px-3 py-2 bg-ink-50 dark:bg-ink-900 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand/40 border border-ink-200 dark:border-ink-700" value={itemForm.start_date} onChange={(e) => setItem('start_date', e.target.value)} />
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs font-semibold text-ink-600 dark:text-ink-300">Deadline Date *</label>
                      <input required type="date" className="w-full px-3 py-2 bg-ink-50 dark:bg-ink-900 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand/40 border border-ink-200 dark:border-ink-700" value={itemForm.deadline_date} onChange={(e) => setItem('deadline_date', e.target.value)} />
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs font-semibold text-ink-600 dark:text-ink-300">Amount (RWF)</label>
                      <input type="number" min="0" step="0.01" className="w-full px-3 py-2 bg-ink-50 dark:bg-ink-900 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand/40 border border-ink-200 dark:border-ink-700" value={itemForm.amount} onChange={(e) => setItem('amount', e.target.value)} />
                    </div>
                  </div>

                  <div className="flex justify-end gap-3 pt-2 border-t border-ink-100 dark:border-ink-700">
                    <button type="button" onClick={() => setItemModal(null)} className="btn btn-secondary text-sm px-5">Cancel</button>
                    <button type="submit" className="btn btn-primary text-sm px-7" disabled={saveItemMut.isPending || !canSubmitItem}>
                      {saveItemMut.isPending ? 'Saving…' : itemModal.item ? 'Update' : 'Add'}
                    </button>
                  </div>
                </form>
              </div>
            </div>
          </div>
        </ModalPortal>
      )}

      {/* Document list */}
      <div className="space-y-4">
        {isLoading ? (
          <div className="bg-white dark:bg-ink-900 rounded-xl border border-ink-200 dark:border-ink-800 shadow-sm p-6 space-y-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="h-4 bg-ink-100 dark:bg-ink-800 rounded w-full animate-pulse" />
            ))}
          </div>
        ) : documents.length === 0 ? (
          <div className="bg-white dark:bg-ink-900 rounded-xl border border-ink-200 dark:border-ink-800 shadow-sm p-12 text-center text-ink-400 italic text-sm">
            No payment calendars found{yearId ? ' for this academic year' : ''}.
          </div>
        ) : (
          documents.map((d) => {
            const isOpen = expanded[d.id] ?? true
            return (
              <div key={d.id} className="bg-white dark:bg-ink-900 rounded-xl border border-ink-200 dark:border-ink-800 shadow-sm overflow-hidden">
                <div className="flex items-center justify-between gap-3 px-5 py-3.5 bg-ink-50/60 dark:bg-ink-800/60 border-b border-ink-100 dark:border-ink-800">
                  <button onClick={() => toggleExpand(d.id)} className="flex items-center gap-2 min-w-0 text-left flex-1">
                    {isOpen ? <ChevronUp className="w-4 h-4 text-ink-400 flex-shrink-0" /> : <ChevronDown className="w-4 h-4 text-ink-400 flex-shrink-0" />}
                    <div className="min-w-0">
                      <p className="font-semibold text-ink-900 dark:text-ink-50 text-sm truncate">
                        {d.title} {d.faculty_name ? `— ${d.faculty_name}` : ''}
                      </p>
                      <p className="text-xs text-ink-500 truncate">
                        {d.academic_year_label} {d.intake_label ? `· ${d.intake_label}` : ''} {d.level_label ? `· ${d.level_label}` : ''}
                        {' · '}Total: {fmtAmount(totalOf(d))}
                      </p>
                    </div>
                  </button>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <span className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-bold ${
                      d.is_active
                        ? 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-400'
                        : 'bg-ink-100 text-ink-500 dark:bg-ink-800 dark:text-ink-400'
                    }`}>
                      {d.is_active ? 'Active' : 'Inactive'}
                    </span>
                    <button onClick={() => handleDownloadPdf(d)} title="Download PDF" className="p-1.5 text-brand hover:bg-brand/10 rounded-md transition-colors">
                      <Download className="w-3.5 h-3.5" />
                    </button>
                    <button onClick={() => openEditDoc(d)} title="Edit" className="p-1.5 text-brand hover:bg-brand/10 rounded-md transition-colors">
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                    <button onClick={() => handleDeleteDoc(d)} title="Delete" className="p-1.5 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-md transition-colors">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                {isOpen && (
                  <div className="p-4">
                    {d.department_label && (
                      <p className="text-xs text-ink-500 mb-2">{d.department_label}</p>
                    )}
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="text-left text-xs text-ink-500 border-b border-ink-100 dark:border-ink-800">
                            <th className="py-2 pr-2 font-semibold">Description</th>
                            <th className="py-2 pr-2 font-semibold">Starting</th>
                            <th className="py-2 pr-2 font-semibold">Deadline</th>
                            <th className="py-2 pr-2 font-semibold text-right">Amount</th>
                            <th className="py-2 pl-2 font-semibold text-right w-16">Actions</th>
                          </tr>
                        </thead>
                        <tbody>
                          {d.items.length === 0 && (
                            <tr><td colSpan={5} className="py-4 text-center text-ink-400 italic text-xs">No schedule rows yet.</td></tr>
                          )}
                          {(() => {
                            let lastGroup: string | null = null
                            return d.items.map((it) => {
                              const showGroup = it.group_label && it.group_label !== lastGroup
                              lastGroup = it.group_label ?? lastGroup
                              return (
                                <Fragment key={it.id}>
                                  {showGroup && (
                                    <tr key={`g-${it.id}`} className="bg-ink-50 dark:bg-ink-800/60">
                                      <td colSpan={5} className="py-1.5 px-2 text-xs font-bold text-ink-700 dark:text-ink-200">{it.group_label}</td>
                                    </tr>
                                  )}
                                  <tr key={it.id} className="border-b border-ink-50 dark:border-ink-800/60 hover:bg-ink-50/40 dark:hover:bg-ink-800/40 group">
                                    <td className="py-2 pr-2">{it.item_label}</td>
                                    <td className="py-2 pr-2 text-xs">{fmtDate(it.start_date)}</td>
                                    <td className="py-2 pr-2 text-xs">{fmtDate(it.deadline_date)}</td>
                                    <td className="py-2 pr-2 text-right font-medium">{fmtAmount(it.amount)}</td>
                                    <td className="py-2 pl-2 text-right">
                                      <div className="flex justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                        <button onClick={() => openEditItem(d.id, it)} className="p-1 text-brand hover:bg-brand/10 rounded" title="Edit">
                                          <Pencil className="w-3 h-3" />
                                        </button>
                                        <button onClick={() => handleDeleteItem(it.id)} className="p-1 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded" title="Delete">
                                          <Trash2 className="w-3 h-3" />
                                        </button>
                                      </div>
                                    </td>
                                  </tr>
                                </Fragment>
                              )
                            })
                          })()}
                          <tr className="font-bold border-t-2 border-ink-200 dark:border-ink-700">
                            <td colSpan={3} className="py-2 pr-2">Total Payment</td>
                            <td className="py-2 pr-2 text-right">{fmtAmount(totalOf(d))}</td>
                            <td></td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                    <button onClick={() => openCreateItem(d.id)} className="mt-3 flex items-center gap-1.5 text-xs font-semibold text-brand hover:underline">
                      <Plus className="w-3.5 h-3.5" /> Add schedule row
                    </button>
                  </div>
                )}
              </div>
            )
          })
        )}
      </div>

      {/* Info banner */}
      <div className="flex items-start gap-3 p-4 bg-amber-50 dark:bg-amber-900/20 text-amber-800 dark:text-amber-300 rounded-xl text-sm border border-amber-200 dark:border-amber-800">
        <Info className="w-4 h-4 flex-shrink-0 mt-0.5" />
        <p>
          Each calendar prints as an official CUR document with letterhead, installment schedule, notes, and
          Prepared/Verified/Approved signatures — matching the finance office's official payment calendar format.
        </p>
      </div>
    </div>
  )
}
