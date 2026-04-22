import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import {
  User, ScrollText, FileUp, ListTree, Loader2, CheckCircle2, XCircle, Clock,
  Trash2, Plus, Pencil, Star, FileText,
} from 'lucide-react'
import { applicantService } from '@/services/admissionService'
import Modal from '@/components/ui/Modal'
import type { AcademicRecord, ApplicantProfile } from '@/types/admission'

type Tab = 'overview' | 'profile' | 'records' | 'documents'

export default function ApplicantPortalPage() {
  const [tab, setTab] = useState<Tab>('overview')

  return (
    <div className="max-w-5xl mx-auto space-y-4">
      {/* Tabs */}
      <section className="card p-2">
        <div className="flex gap-1 overflow-x-auto no-scrollbar">
          <Tab active={tab === 'overview'}  onClick={() => setTab('overview')}  label="Overview"           icon={ListTree} />
          <Tab active={tab === 'profile'}   onClick={() => setTab('profile')}   label="Personal profile"   icon={User} />
          <Tab active={tab === 'records'}   onClick={() => setTab('records')}   label="Academic records"   icon={ScrollText} />
          <Tab active={tab === 'documents'} onClick={() => setTab('documents')} label="Documents"          icon={FileUp} />
        </div>
      </section>

      {tab === 'overview'  && <Overview />}
      {tab === 'profile'   && <ProfilePanel />}
      {tab === 'records'   && <RecordsPanel />}
      {tab === 'documents' && <DocumentsPanel />}
    </div>
  )
}

function Tab({ active, onClick, label, icon: Icon }: { active: boolean; onClick: () => void; label: string; icon: any }) {
  return (
    <button
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-md text-[13px] whitespace-nowrap ${
        active
          ? 'bg-brand/10 text-brand dark:bg-brand/25 dark:text-gold-400 font-semibold'
          : 'text-ink-600 hover:bg-ink-50 dark:text-ink-300 dark:hover:bg-ink-700/50'
      }`}
    >
      <Icon className="w-3.5 h-3.5" /> {label}
    </button>
  )
}

/* ─────────────────────────────────────────────────────────── */

function Overview() {
  const q = useQuery({ queryKey: ['applicant', 'application'], queryFn: () => applicantService.getApplication() })
  const app = q.data?.data
  if (q.isLoading) return <Card><Loading /></Card>
  if (!app) return <Card><p className="text-[13px] text-ink-500">No application linked to this account.</p></Card>
  const docs = app.documents ?? []
  return (
    <Card>
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <p className="text-[11px] uppercase tracking-wider text-ink-400">Application</p>
          <p className="text-[20px] font-mono font-bold text-brand">{app.application_number}</p>
          <p className="text-[13px] text-ink-600 mt-1">
            {app.first_name} {app.last_name} · <span className="text-ink-500">{app.email}</span>
          </p>
        </div>
        <span className="chip-primary">{app.status}</span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-5">
        <StatTile k="Program" v={app.program_name ?? `#${app.program_id}`} />
        <StatTile k="Intake"  v={app.intake} />
        <StatTile k="Documents" v={`${docs.filter((d) => d.verification_status === 'verified').length}/${docs.length} verified`} />
      </div>
    </Card>
  )
}

function StatTile({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div className="rounded-md bg-ink-50 p-3">
      <p className="text-[10.5px] uppercase tracking-wider font-semibold text-ink-400">{k}</p>
      <p className="text-ink-900 dark:text-white font-semibold truncate">{v || '—'}</p>
    </div>
  )
}

/* ─────────────────────────────────────────────────────────── */

function ProfilePanel() {
  const qc = useQueryClient()
  const q  = useQuery({ queryKey: ['applicant', 'profile'], queryFn: () => applicantService.getProfile() })
  const profile = q.data?.data
  const [form, setForm] = useState<Partial<ApplicantProfile>>({})

  const save = useMutation({
    mutationFn: () => applicantService.updateProfile(form),
    onSuccess:  () => { toast.success('Profile saved'); qc.invalidateQueries({ queryKey: ['applicant', 'profile'] }) },
    onError:    (e: any) => toast.error(e?.response?.data?.message ?? 'Failed'),
  })

  if (q.isLoading) return <Card><Loading /></Card>

  const v = { ...(profile ?? {}), ...form }
  const set = <K extends keyof ApplicantProfile>(k: K, val: ApplicantProfile[K]) => setForm({ ...form, [k]: val })

  return (
    <Card>
      <SectionHeader title="Personal profile" sub="Update your extended information." />
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-4">
        <Field label="Middle name">
          <input className="input" value={v.middle_name ?? ''} onChange={(e) => set('middle_name', e.target.value)} />
        </Field>
        <Field label="ID type">
          <select className="input" value={v.id_type ?? ''} onChange={(e) => set('id_type', e.target.value as any)}>
            <option value="">—</option>
            <option value="national_id">National ID</option>
            <option value="passport">Passport</option>
            <option value="birth_certificate">Birth certificate</option>
          </select>
        </Field>
        <Field label="ID number">
          <input className="input" value={v.id_number ?? ''} onChange={(e) => set('id_number', e.target.value)} />
        </Field>
        <Field label="Province">
          <input className="input" value={v.province ?? ''} onChange={(e) => set('province', e.target.value)} />
        </Field>
        <Field label="District">
          <input className="input" value={v.district ?? ''} onChange={(e) => set('district', e.target.value)} />
        </Field>
        <Field label="Sector">
          <input className="input" value={v.sector ?? ''} onChange={(e) => set('sector', e.target.value)} />
        </Field>
        <Field label="Emergency contact name">
          <input className="input" value={v.emergency_contact_name ?? ''} onChange={(e) => set('emergency_contact_name', e.target.value)} />
        </Field>
        <Field label="Emergency contact phone">
          <input className="input" value={v.emergency_contact_phone ?? ''} onChange={(e) => set('emergency_contact_phone', e.target.value)} />
        </Field>
      </div>
      <div className="flex justify-end mt-4">
        <button className="btn-primary btn-sm" disabled={save.isPending} onClick={() => save.mutate()}>
          {save.isPending && <Loader2 className="w-3 h-3 animate-spin" />} Save profile
        </button>
      </div>
    </Card>
  )
}

/* ─────────────────────────────────────────────────────────── */

function RecordsPanel() {
  const qc = useQueryClient()
  const q  = useQuery({ queryKey: ['applicant', 'records'], queryFn: () => applicantService.listAcademicRecords() })
  const [editing, setEditing] = useState<Partial<AcademicRecord> | null>(null)

  const save = useMutation({
    mutationFn: async (d: Partial<AcademicRecord>) => {
      if (d.id) await applicantService.updateAcademicRecord(d.id, d)
      else      await applicantService.addAcademicRecord(d as any)
    },
    onSuccess: () => { toast.success('Record saved'); setEditing(null); qc.invalidateQueries({ queryKey: ['applicant', 'records'] }) },
    onError:   (e: any) => toast.error(e?.response?.data?.message ?? 'Failed'),
  })
  const remove = useMutation({
    mutationFn: (id: number) => applicantService.deleteAcademicRecord(id),
    onSuccess: () => { toast.success('Record removed'); qc.invalidateQueries({ queryKey: ['applicant', 'records'] }) },
  })
  const setPrimary = useMutation({
    mutationFn: (id: number) => applicantService.setPrimaryRecord(id),
    onSuccess: () => { toast.success('Primary updated'); qc.invalidateQueries({ queryKey: ['applicant', 'records'] }) },
  })

  const rows = q.data?.data ?? []
  return (
    <>
      <Card>
        <div className="flex items-start justify-between gap-4">
          <SectionHeader title="Academic records" sub="Every school you've attended. The one marked primary is used for merit scoring." />
          <button className="btn-primary btn-sm" onClick={() => setEditing({})}>
            <Plus className="w-3.5 h-3.5" /> Add record
          </button>
        </div>
        {q.isLoading ? <Loading /> : rows.length === 0 ? (
          <p className="mt-4 text-[13px] text-ink-500">No academic records yet.</p>
        ) : (
          <ul className="space-y-2 mt-4">
            {rows.map((r) => (
              <li key={r.id} className="rounded-md border border-ink-100 p-3 flex items-center justify-between gap-3 flex-wrap">
                <div className="min-w-0">
                  <p className="text-[14px] font-semibold text-ink-900 dark:text-white">
                    {r.institution_name}
                    {r.is_primary ? <span className="chip-primary ml-2"><Star className="w-3 h-3" /> Primary</span> : null}
                  </p>
                  <p className="text-[12.5px] text-ink-500">
                    {r.qualification} · {r.grade} · {r.year_completed}{r.combination ? ` · ${r.combination}` : ''}
                  </p>
                </div>
                <div className="flex gap-1">
                  {!r.is_primary && (
                    <button className="btn-secondary btn-sm" onClick={() => setPrimary.mutate(r.id)} disabled={setPrimary.isPending}>
                      <Star className="w-3 h-3" /> Make primary
                    </button>
                  )}
                  <button className="icon-btn" onClick={() => setEditing(r)}><Pencil className="w-3.5 h-3.5" /></button>
                  <button
                    className="icon-btn text-red-500 hover:bg-red-50"
                    disabled={remove.isPending && remove.variables === r.id}
                    onClick={() => confirm('Delete this record?') && remove.mutate(r.id)}
                  >
                    {remove.isPending && remove.variables === r.id
                      ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      : <Trash2 className="w-3.5 h-3.5" />}
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
      {editing !== null && <RecordModal rec={editing} busy={save.isPending} onClose={() => setEditing(null)} onSave={(d) => save.mutate(d)} />}
    </>
  )
}

function RecordModal({
  rec, onClose, onSave, busy,
}: {
  rec: Partial<AcademicRecord>
  onClose: () => void
  onSave: (d: Partial<AcademicRecord>) => void
  busy: boolean
}) {
  const [form, setForm] = useState<Partial<AcademicRecord>>({
    institution_name: rec.institution_name ?? '',
    qualification:    rec.qualification    ?? '',
    grade:            rec.grade            ?? '',
    combination:      rec.combination      ?? '',
    year_completed:   rec.year_completed   ?? new Date().getFullYear(),
    is_primary:       rec.is_primary       ?? 0,
    id:               rec.id,
  })
  return (
    <Modal open onClose={onClose} title={rec.id ? 'Edit academic record' : 'Add academic record'}
      footer={<>
        <button className="btn-secondary" onClick={onClose}>Cancel</button>
        <button className="btn-primary" onClick={() => onSave(form)} disabled={busy}>
          {busy && <Loader2 className="w-3.5 h-3.5 animate-spin" />} Save
        </button>
      </>}
    >
      <div className="space-y-3">
        <Field label="Institution name">
          <input className="input" value={form.institution_name ?? ''} onChange={(e) => setForm({ ...form, institution_name: e.target.value })} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Qualification">
            <input className="input" value={form.qualification ?? ''} onChange={(e) => setForm({ ...form, qualification: e.target.value })} />
          </Field>
          <Field label="Grade">
            <input className="input" value={form.grade ?? ''} onChange={(e) => setForm({ ...form, grade: e.target.value })} />
          </Field>
          <Field label="Combination (A-level)">
            <input className="input" value={form.combination ?? ''} onChange={(e) => setForm({ ...form, combination: e.target.value })} />
          </Field>
          <Field label="Year completed">
            <input type="number" className="input" value={form.year_completed ?? ''} onChange={(e) => setForm({ ...form, year_completed: Number(e.target.value) })} />
          </Field>
        </div>
      </div>
    </Modal>
  )
}

/* ─────────────────────────────────────────────────────────── */

function DocumentsPanel() {
  const qc = useQueryClient()
  const q  = useQuery({ queryKey: ['applicant', 'documents'], queryFn: () => applicantService.listDocuments() })
  const rows = q.data?.data ?? []

  const [fileServerId, setFileServerId] = useState('')
  const [fileName, setFileName] = useState('')
  const [typeId, setTypeId] = useState('')

  const add = useMutation({
    mutationFn: () => applicantService.uploadDocument({
      document_type_id: Number(typeId),
      file_server_id:   fileServerId,
      file_original_name: fileName || undefined,
    }),
    onSuccess: () => {
      toast.success('Document added')
      setFileServerId(''); setFileName(''); setTypeId('')
      qc.invalidateQueries({ queryKey: ['applicant', 'documents'] })
    },
    onError: (e: any) => toast.error(e?.response?.data?.message ?? 'Failed'),
  })

  const remove = useMutation({
    mutationFn: (id: number) => applicantService.deleteDocument(id),
    onSuccess: () => { toast.success('Removed'); qc.invalidateQueries({ queryKey: ['applicant', 'documents'] }) },
  })

  return (
    <Card>
      <SectionHeader title="Documents" sub="Upload each required document from your checklist." />

      {q.isLoading ? <Loading /> : rows.length === 0 ? (
        <p className="mt-4 text-[13px] text-ink-500">No documents uploaded yet.</p>
      ) : (
        <ul className="space-y-2 mt-4">
          {rows.map((d) => (
            <li key={d.id} className="rounded-md border border-ink-100 p-3 flex items-center justify-between gap-3 flex-wrap">
              <div className="flex items-center gap-2.5 min-w-0">
                <FileText className="w-4 h-4 text-ink-400 shrink-0" />
                <div className="min-w-0">
                  <p className="text-[13px] font-medium text-ink-800">{d.document_type_name ?? `Type #${d.document_type_id}`}</p>
                  <p className="text-[11.5px] text-ink-500 truncate">{d.file_original_name}</p>
                  {d.rejection_notes && <p className="text-[12px] text-red-700 mt-1">Rejection: {d.rejection_notes}</p>}
                </div>
              </div>
              <div className="flex items-center gap-1.5">
                <VerifChip s={d.verification_status} />
                <button
                  className="icon-btn text-red-500 hover:bg-red-50"
                  onClick={() => confirm('Delete this document?') && remove.mutate(d.id)}
                  disabled={d.verification_status === 'verified'}
                  title={d.verification_status === 'verified' ? 'Verified documents cannot be deleted' : ''}
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {/* Upload form (placeholder — file-server upload integration is out of scope here) */}
      <div className="mt-6 rounded-md border border-dashed border-ink-200 bg-ink-50 p-4">
        <p className="text-[13px] font-semibold mb-3">Attach a document</p>
        <div className="grid grid-cols-1 sm:grid-cols-[1fr_2fr_2fr_auto] gap-2 items-end">
          <Field label="Type ID">
            <input className="input" placeholder="1" value={typeId} onChange={(e) => setTypeId(e.target.value)} />
          </Field>
          <Field label="File-server ID">
            <input className="input font-mono" placeholder="uuid-from-file-server" value={fileServerId} onChange={(e) => setFileServerId(e.target.value)} />
          </Field>
          <Field label="Original filename">
            <input className="input" placeholder="id-card.pdf" value={fileName} onChange={(e) => setFileName(e.target.value)} />
          </Field>
          <button className="btn-primary" onClick={() => add.mutate()} disabled={!typeId || !fileServerId || add.isPending}>
            {add.isPending && <Loader2 className="w-3 h-3 animate-spin" />} Save
          </button>
        </div>
        <p className="mt-2 text-[11.5px] text-ink-500">
          Uploads go through the file-server. Paste the returned file UUID above.
        </p>
      </div>
    </Card>
  )
}

/* ─── shared ─── */
function Card({ children }: { children: React.ReactNode }) { return <section className="card p-5">{children}</section> }
function Loading() { return <p className="text-[13px] text-ink-500 flex items-center gap-2 py-4"><Loader2 className="w-4 h-4 animate-spin" /> Loading…</p> }
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div><label className="label">{label}</label>{children}</div>
}
function SectionHeader({ title, sub }: { title: string; sub: string }) {
  return <div><h2 className="section-title">{title}</h2><p className="section-sub">{sub}</p></div>
}
function VerifChip({ s }: { s: 'pending' | 'verified' | 'rejected' }) {
  if (s === 'verified') return <span className="chip-success"><CheckCircle2 className="w-3 h-3" /> Verified</span>
  if (s === 'rejected') return <span className="chip-danger"><XCircle className="w-3 h-3" /> Rejected</span>
  return <span className="chip-warning"><Clock className="w-3 h-3" /> Pending</span>
}
