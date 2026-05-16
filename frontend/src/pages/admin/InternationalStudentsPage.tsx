import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'react-hot-toast'
import { Globe2, AlertTriangle, CalendarClock, Plus, X } from 'lucide-react'
import { studentService } from '@/services/studentService'
import ModalPortal from '@/components/ui/ModalPortal'

export default function InternationalStudentsPage() {
  const qc = useQueryClient()
  const listQ = useQuery({
    queryKey: ['students', 'international'],
    queryFn: () => studentService.listInternational(),
  })

  const [editingStudentId, setEditingStudentId] = useState<number | null>(null)
  const [editingStudentLabel, setEditingStudentLabel] = useState('')

  const rows = listQ.data?.data?.students ?? []
  const total = listQ.data?.data?.count ?? 0

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      <header className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <p className="text-[11px] uppercase tracking-[0.2em] font-bold text-brand mb-1">Registry</p>
          <h1 className="text-[26px] sm:text-[30px] font-black text-ink-900 dark:text-white tracking-tight leading-tight flex items-center gap-2">
            <Globe2 className="w-6 h-6 text-brand" />
            International students
          </h1>
          <p className="text-[13px] text-ink-500 mt-1">
            Visa status, days until expiry, and the assigned registry officer for each student.
          </p>
        </div>
        <div className="text-[12px] text-ink-500">
          <strong className="text-ink-900 dark:text-white">{total}</strong> students
        </div>
      </header>

      <section className="card p-0 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="data-table">
            <thead>
              <tr>
                <th>Student</th>
                <th>Nationality</th>
                <th>Visa type</th>
                <th>Issued</th>
                <th>Expires</th>
                <th>Days to expiry</th>
                <th>Assigned officer</th>
                <th className="text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {listQ.isLoading ? (
                <tr><td colSpan={8} className="text-center text-ink-500 py-10">Loading…</td></tr>
              ) : rows.length === 0 ? (
                <tr><td colSpan={8} className="text-center text-ink-500 py-10 italic">No international students yet.</td></tr>
              ) : (
                rows.map((s) => {
                  const expiringSoon = s.days_to_expiry != null && s.days_to_expiry <= 30 && s.days_to_expiry >= 0
                  const expired      = s.days_to_expiry != null && s.days_to_expiry < 0
                  return (
                    <tr key={s.id}>
                      <td>
                        <p className="font-medium text-ink-900 dark:text-ink-100">{s.fname} {s.lname}</p>
                        <p className="text-[11px] text-ink-500">{s.regnumber ?? '—'} · {s.email ?? '—'}</p>
                      </td>
                      <td>{s.nationality ?? s.country_of_origin ?? '—'}</td>
                      <td>{s.visa_type ?? '—'}</td>
                      <td>{s.visa_issue_date ?? '—'}</td>
                      <td>{s.visa_expiry_date ?? '—'}</td>
                      <td>
                        {s.days_to_expiry == null ? (
                          <span className="text-ink-400">—</span>
                        ) : expired ? (
                          <span className="chip-danger inline-flex items-center gap-1">
                            <AlertTriangle className="w-3 h-3" />
                            Expired {Math.abs(s.days_to_expiry)}d ago
                          </span>
                        ) : expiringSoon ? (
                          <span className="chip-warning inline-flex items-center gap-1">
                            <CalendarClock className="w-3 h-3" />
                            {s.days_to_expiry}d
                          </span>
                        ) : (
                          <span className="text-emerald-700">{s.days_to_expiry}d</span>
                        )}
                      </td>
                      <td>{s.assigned_registry_name ?? <span className="text-ink-400 italic">unassigned</span>}</td>
                      <td className="text-right">
                        <button
                          type="button"
                          className="btn-secondary btn-sm"
                          onClick={() => {
                            setEditingStudentId(s.id)
                            setEditingStudentLabel(`${s.fname ?? ''} ${s.lname ?? ''}`.trim())
                          }}
                        >
                          <Plus className="w-3 h-3" /> Visa
                        </button>
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      </section>

      <AddVisaModal
        studentId={editingStudentId}
        studentLabel={editingStudentLabel}
        onClose={() => setEditingStudentId(null)}
        onSaved={() => qc.invalidateQueries({ queryKey: ['students', 'international'] })}
      />
    </div>
  )
}

function AddVisaModal({
  studentId, studentLabel, onClose, onSaved,
}: {
  studentId: number | null
  studentLabel: string
  onClose: () => void
  onSaved: () => void
}) {
  const [form, setForm] = useState({
    country_of_origin: '',
    visa_type: '',
    entry_date: '',
    visa_issue_date: '',
    visa_expiry_date: '',
    notes: '',
  })
  const [saving, setSaving] = useState(false)

  if (!studentId) return null

  const submit = async () => {
    if (!form.country_of_origin || !form.entry_date || !form.visa_issue_date || !form.visa_expiry_date) {
      toast.error('All date fields and country are required.')
      return
    }
    setSaving(true)
    try {
      await studentService.addVisaRecord(studentId, form)
      toast.success('Visa record added')
      onSaved()
      onClose()
    } catch (e: any) {
      toast.error(e.response?.data?.message ?? 'Failed to add visa record')
    } finally {
      setSaving(false)
    }
  }

  return (
    <ModalPortal>
      <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 animate-in fade-in">
        <div className="absolute inset-0 bg-ink-900/60 backdrop-blur-sm" onClick={onClose} />
        <div className="relative w-full max-w-lg card overflow-hidden">
          <div className="px-5 py-3.5 border-b hairline flex items-center justify-between">
            <div>
              <h2 className="text-[14px] font-semibold text-ink-900 dark:text-white">
                Add / renew visa
              </h2>
              <p className="section-sub mt-0.5">{studentLabel}</p>
            </div>
            <button onClick={onClose} className="icon-btn"><X className="w-4 h-4" /></button>
          </div>
          <div className="p-5 grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            <div className="sm:col-span-2">
              <label className="label">Country of origin *</label>
              <input className="input" value={form.country_of_origin} onChange={(e) => setForm({ ...form, country_of_origin: e.target.value })} />
            </div>
            <div>
              <label className="label">Visa type</label>
              <input className="input" value={form.visa_type} onChange={(e) => setForm({ ...form, visa_type: e.target.value })} placeholder="e.g. Student" />
            </div>
            <div>
              <label className="label">Entry date *</label>
              <input type="date" className="input" value={form.entry_date} onChange={(e) => setForm({ ...form, entry_date: e.target.value })} />
            </div>
            <div>
              <label className="label">Visa issued *</label>
              <input type="date" className="input" value={form.visa_issue_date} onChange={(e) => setForm({ ...form, visa_issue_date: e.target.value })} />
            </div>
            <div>
              <label className="label">Visa expiry *</label>
              <input type="date" className="input" value={form.visa_expiry_date} onChange={(e) => setForm({ ...form, visa_expiry_date: e.target.value })} />
            </div>
            <div className="sm:col-span-2">
              <label className="label">Notes</label>
              <textarea className="input min-h-[60px]" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
            </div>
          </div>
          <div className="px-5 py-3 border-t hairline flex items-center justify-end gap-2">
            <button onClick={onClose} className="btn-secondary btn-sm">Cancel</button>
            <button onClick={submit} disabled={saving} className="btn-primary btn-sm">
              {saving ? 'Saving…' : 'Save'}
            </button>
          </div>
        </div>
      </div>
    </ModalPortal>
  )
}
