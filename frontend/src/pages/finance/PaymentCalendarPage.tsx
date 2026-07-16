import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { CalendarClock, Plus, Pencil, Trash2, X, Info, ToggleLeft, ToggleRight, CalendarDays } from 'lucide-react'
import toast from 'react-hot-toast'
import { paymentCalendarService } from '@/services/financeService'
import { academicService as academicSvc } from '@/services/academicService'
import type {
  PaymentCalendarEvent,
  PaymentCalendarEventType,
  CreatePaymentCalendarEventPayload,
} from '@/types/finance'
import { PAYMENT_CALENDAR_EVENT_TYPES, PAYMENT_CALENDAR_EVENT_TYPE_LABELS } from '@/types/finance'
import SearchableSelect from '@/components/ui/SearchableSelect'
import ModalPortal from '@/components/ui/ModalPortal'

// ── Types ─────────────────────────────────────────────────────────────────────

interface FormState {
  academic_year_id: number
  event_type:       PaymentCalendarEventType | ''
  label:             string
  event_date:        string
  is_active:         boolean
}

const EMPTY: FormState = { academic_year_id: 0, event_type: '', label: '', event_date: '', is_active: true }

const EVENT_TYPE_COLORS: Record<PaymentCalendarEventType, string> = {
  registration_deadline: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-400',
  installment_due:       'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400',
  penalty_start:         'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-400',
  semester_start:        'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-400',
  semester_end:          'bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-400',
}

// ── PaymentCalendarPage ────────────────────────────────────────────────────────

export default function PaymentCalendarPage() {
  const qc = useQueryClient()
  const [yearId, setYearId]         = useState<number | ''>('')
  const [isOpen, setIsOpen]         = useState(false)
  const [isEditing, setIsEditing]   = useState(false)
  const [editingId, setEditingId]   = useState<number | null>(null)
  const [form, setForm]             = useState<FormState>(EMPTY)

  // ── Data ──────────────────────────────────────────────────────────────────

  const yearsQ = useQuery({
    queryKey: ['academic', 'years'],
    queryFn: ({ signal }) => academicSvc.listYears(signal),
  })
  const years = yearsQ.data?.data ?? []

  const { data: res, isLoading } = useQuery({
    queryKey: ['finance', 'payment-calendar', yearId],
    queryFn: ({ signal }) =>
      paymentCalendarService.list(yearId ? { academic_year_id: Number(yearId) } : {}, signal),
  })
  const events: PaymentCalendarEvent[] = res?.data ?? []

  const grouped = PAYMENT_CALENDAR_EVENT_TYPES.map((type) => ({
    type,
    items: events.filter((e) => e.event_type === type),
  })).filter((g) => g.items.length > 0)

  // ── Mutations ─────────────────────────────────────────────────────────────

  const saveMut = useMutation<any, any, FormState>({
    mutationFn: (f: FormState) => {
      const payload: CreatePaymentCalendarEventPayload = {
        academic_year_id: f.academic_year_id,
        event_type:       f.event_type as PaymentCalendarEventType,
        label:             f.label.trim(),
        event_date:        f.event_date,
        is_active:         f.is_active ? 1 : 0,
      }
      if (isEditing && editingId !== null) {
        return paymentCalendarService.update(editingId, payload)
      }
      return paymentCalendarService.create(payload)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['finance', 'payment-calendar'] })
      toast.success(isEditing ? 'Calendar event updated' : 'Calendar event created')
      closeModal()
    },
    onError: (e: any) =>
      toast.error(e?.response?.data?.message ?? 'Save failed'),
  })

  const deleteMut = useMutation({
    mutationFn: (id: number) => paymentCalendarService.delete(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['finance', 'payment-calendar'] })
      toast.success('Calendar event deleted')
    },
    onError: (e: any) =>
      toast.error(e?.response?.data?.message ?? 'Delete failed'),
  })

  // ── Helpers ───────────────────────────────────────────────────────────────

  function openCreate() {
    setForm({ ...EMPTY, academic_year_id: yearId ? Number(yearId) : (years[0]?.id ?? 0) })
    setIsEditing(false)
    setEditingId(null)
    setIsOpen(true)
  }

  function openEdit(e: PaymentCalendarEvent) {
    setForm({
      academic_year_id: e.academic_year_id,
      event_type:       e.event_type,
      label:             e.label,
      event_date:        e.event_date?.slice(0, 10) ?? '',
      is_active:         e.is_active === 1,
    })
    setIsEditing(true)
    setEditingId(e.id)
    setIsOpen(true)
  }

  function closeModal() {
    setIsOpen(false)
    setEditingId(null)
    setForm(EMPTY)
  }

  function handleDelete(e: PaymentCalendarEvent) {
    if (!confirm(`Delete calendar event '${e.label}'? This cannot be undone.`)) return
    deleteMut.mutate(e.id)
  }

  function set<K extends keyof FormState>(k: K, v: FormState[K]) {
    setForm((f) => ({ ...f, [k]: v }))
  }

  const canSubmit = form.academic_year_id > 0 && form.event_type !== '' && form.label.trim() !== '' && form.event_date !== ''

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
            <p className="text-xs text-ink-500">Registration deadlines, installment due dates, penalty start dates, and semester boundaries.</p>
          </div>
        </div>
        <button onClick={openCreate} className="btn btn-primary flex items-center gap-2 text-sm">
          <Plus className="w-4 h-4" />
          New Event
        </button>
      </div>

      {/* Filter bar */}
      <div className="bg-white dark:bg-ink-900 p-4 rounded-xl border border-ink-200 dark:border-ink-800 shadow-sm">
        <div className="max-w-xs space-y-1">
          <label className="text-xs font-semibold text-ink-600 dark:text-ink-300">Academic Year</label>
          <SearchableSelect
            options={years.map((y) => ({ value: y.id, label: y.label }))}
            value={yearId}
            onChange={(v) => setYearId(v === '' ? '' : Number(v))}
            placeholder="All academic years"
            allLabel="All academic years"
          />
        </div>
      </div>

      {/* Modal */}
      {isOpen && (
        <ModalPortal>
          <div className="fixed inset-0 z-50 overflow-y-auto bg-black/50 backdrop-blur-sm">
            <div className="flex min-h-full items-start justify-center p-4 pt-16">
              <div className="bg-white dark:bg-ink-800 rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden">

                {/* Modal header */}
                <div className="flex items-center justify-between px-6 py-4 border-b border-ink-100 dark:border-ink-700">
                  <h3 className="text-base font-semibold text-ink-900 dark:text-white">
                    {isEditing ? 'Edit Calendar Event' : 'New Calendar Event'}
                  </h3>
                  <button onClick={closeModal} className="btn-ghost btn-sm p-1.5 rounded-full" aria-label="Close">
                    <X className="w-4 h-4" />
                  </button>
                </div>

                {/* Modal body */}
                <form
                  onSubmit={(e) => { e.preventDefault(); if (canSubmit) saveMut.mutate(form) }}
                  className="p-6 space-y-4"
                >
                  {/* Academic Year */}
                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-ink-600 dark:text-ink-300">Academic Year *</label>
                    <SearchableSelect
                      options={years.map((y) => ({ value: y.id, label: y.label }))}
                      value={form.academic_year_id}
                      onChange={(v) => set('academic_year_id', Number(v))}
                      placeholder="Select academic year"
                    />
                  </div>

                  {/* Event Type */}
                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-ink-600 dark:text-ink-300">Event Type *</label>
                    <select
                      required
                      className="w-full px-3 py-2 bg-ink-50 dark:bg-ink-900 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand/40 border border-ink-200 dark:border-ink-700"
                      value={form.event_type}
                      onChange={(e) => set('event_type', e.target.value as PaymentCalendarEventType)}
                    >
                      <option value="">Select event type</option>
                      {PAYMENT_CALENDAR_EVENT_TYPES.map((t) => (
                        <option key={t} value={t}>{PAYMENT_CALENDAR_EVENT_TYPE_LABELS[t]}</option>
                      ))}
                    </select>
                  </div>

                  {/* Label */}
                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-ink-600 dark:text-ink-300">Label *</label>
                    <input
                      required
                      type="text"
                      className="w-full px-3 py-2 bg-ink-50 dark:bg-ink-900 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand/40 border border-ink-200 dark:border-ink-700"
                      placeholder="e.g. Semester 1 Registration Deadline"
                      value={form.label}
                      onChange={(e) => set('label', e.target.value)}
                    />
                  </div>

                  {/* Event Date + Active */}
                  <div className="flex gap-4 items-end">
                    <div className="space-y-1 flex-1">
                      <label className="text-xs font-semibold text-ink-600 dark:text-ink-300">Date *</label>
                      <input
                        required
                        type="date"
                        className="w-full px-3 py-2 bg-ink-50 dark:bg-ink-900 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand/40 border border-ink-200 dark:border-ink-700"
                        value={form.event_date}
                        onChange={(e) => set('event_date', e.target.value)}
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs font-semibold text-ink-600 dark:text-ink-300">Status</label>
                      <button
                        type="button"
                        onClick={() => set('is_active', !form.is_active)}
                        className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors border ${
                          form.is_active
                            ? 'bg-green-50 text-green-700 border-green-200 dark:bg-green-900/30 dark:text-green-400 dark:border-green-800'
                            : 'bg-ink-50 text-ink-500 border-ink-200 dark:bg-ink-900 dark:text-ink-400 dark:border-ink-700'
                        }`}
                      >
                        {form.is_active ? <ToggleRight className="w-4 h-4" /> : <ToggleLeft className="w-4 h-4" />}
                        {form.is_active ? 'Active' : 'Inactive'}
                      </button>
                    </div>
                  </div>

                  {/* Footer */}
                  <div className="flex justify-end gap-3 pt-2 border-t border-ink-100 dark:border-ink-700">
                    <button type="button" onClick={closeModal} className="btn btn-secondary text-sm px-5">
                      Cancel
                    </button>
                    <button
                      type="submit"
                      className="btn btn-primary text-sm px-7"
                      disabled={saveMut.isPending || !canSubmit}
                    >
                      {saveMut.isPending ? 'Saving…' : isEditing ? 'Update' : 'Create'}
                    </button>
                  </div>
                </form>
              </div>
            </div>
          </div>
        </ModalPortal>
      )}

      {/* Grouped list */}
      <div className="space-y-4">
        {isLoading ? (
          <div className="bg-white dark:bg-ink-900 rounded-xl border border-ink-200 dark:border-ink-800 shadow-sm p-6 space-y-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-4 bg-ink-100 dark:bg-ink-800 rounded w-full animate-pulse" />
            ))}
          </div>
        ) : grouped.length === 0 ? (
          <div className="bg-white dark:bg-ink-900 rounded-xl border border-ink-200 dark:border-ink-800 shadow-sm p-12 text-center text-ink-400 italic text-sm">
            No payment calendar events found{yearId ? ' for this academic year' : ''}.
          </div>
        ) : (
          grouped.map(({ type, items }) => (
            <div key={type} className="bg-white dark:bg-ink-900 rounded-xl border border-ink-200 dark:border-ink-800 shadow-sm overflow-hidden">
              <div className="flex items-center gap-2 px-5 py-3 border-b border-ink-100 dark:border-ink-800 bg-ink-50/60 dark:bg-ink-800/60">
                <CalendarDays className="w-4 h-4 text-ink-400" />
                <span className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-bold ${EVENT_TYPE_COLORS[type]}`}>
                  {PAYMENT_CALENDAR_EVENT_TYPE_LABELS[type]}
                </span>
                <span className="text-xs text-ink-400">({items.length})</span>
              </div>
              <div className="divide-y divide-ink-100 dark:divide-ink-800">
                {items.map((e) => (
                  <div key={e.id} className="flex items-center justify-between gap-3 px-5 py-3.5 hover:bg-ink-50/40 dark:hover:bg-ink-800/40 transition-colors group">
                    <div className="min-w-0">
                      <p className="font-semibold text-ink-900 dark:text-ink-50 text-sm truncate">{e.label}</p>
                      <p className="text-xs text-ink-500">
                        {e.event_date} · {e.academic_year_label ?? `Year #${e.academic_year_id}`}
                        {e.fee_structure_label ? ` · ${e.fee_structure_label}` : ''}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <span className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-bold ${
                        e.is_active
                          ? 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-400'
                          : 'bg-ink-100 text-ink-500 dark:bg-ink-800 dark:text-ink-400'
                      }`}>
                        {e.is_active ? 'Active' : 'Inactive'}
                      </span>
                      <div className="flex gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button
                          onClick={() => openEdit(e)}
                          className="p-1.5 text-brand hover:bg-brand/10 rounded-md transition-colors"
                          title="Edit"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => handleDelete(e)}
                          className="p-1.5 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-md transition-colors"
                          title="Delete"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))
        )}
      </div>

      {/* Info banner */}
      <div className="flex items-start gap-3 p-4 bg-amber-50 dark:bg-amber-900/20 text-amber-800 dark:text-amber-300 rounded-xl text-sm border border-amber-200 dark:border-amber-800">
        <Info className="w-4 h-4 flex-shrink-0 mt-0.5" />
        <p>
          Configure a full academic year's calendar entirely from this page — no code changes are needed to add a new year's schedule.
          Switch academic years using the filter above to build out registration deadlines, installment due dates, penalty start dates, and semester boundaries independently per year.
        </p>
      </div>
    </div>
  )
}
