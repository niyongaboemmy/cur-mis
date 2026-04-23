import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import {
  Loader2, Pencil,
} from 'lucide-react'
import { applicantService } from '@/services/admissionService'
import Modal from '@/components/ui/Modal'
import VerificationStep from '@/components/admission/VerificationStep'
import { Card, Field, SectionHeader, fmt } from '@/components/applicant/ApplicantPortalShared'

export default function ApplicantOverviewPage() {
  const qc = useQueryClient()
  const q = useQuery({ queryKey: ['applicant', 'applications'], queryFn: () => applicantService.listApplications() })
  const apps = q.data?.data ?? []
  const [selectedId, setSelectedId] = useState<number | null>(null)

  if (q.isLoading) return <div className="max-w-5xl mx-auto p-12 text-center"><Loader2 className="w-8 h-8 animate-spin mx-auto text-brand" /><p className="text-ink-500 mt-4">Loading your application...</p></div>

  // If there's a primary application that needs verification, show the wall.
  const primaryApp = apps.find(a => Number(a.email_verified) === 0 && a.status !== 'draft')
  if (primaryApp) {
    return (
      <div className="max-w-xl mx-auto py-12 px-4">
        <VerificationStep email={primaryApp.email} onSuccess={() => qc.invalidateQueries({ queryKey: ['applicant', 'applications'] })} />
      </div>
    )
  }

  if (apps.length === 0) return <Card><p className="text-[13px] text-ink-500 text-center py-12">No application found for your account. Please start an application.</p></Card>

  const selectedApp = selectedId ? apps.find(a => a.id === selectedId) : apps[0]

  return (
    <div className="max-w-5xl mx-auto space-y-4">
      <Overview apps={apps} onSelect={setSelectedId} selectedId={selectedApp?.id} />
    </div>
  )
}

function Overview({ apps, onSelect, selectedId }: { apps: any[], onSelect: (id: number) => void, selectedId?: number }) {
  const [editing, setEditing] = useState<number | null>(null)
  
  const selectedApp = apps.find(a => a.id === selectedId) || apps[0]
  const qc = useQueryClient()

  const applicationDetailsQ = useQuery({
    queryKey: ['applicant', 'application', selectedApp.id],
    queryFn: () => applicantService.getApplicationDetails(selectedApp.id),
    enabled: !!selectedApp.id
  })
  const details = applicationDetailsQ.data?.data

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr] gap-4">
      <aside className="space-y-2">
        <h3 className="text-[11px] uppercase tracking-wider font-bold text-ink-400 px-1">My Applications</h3>
        <div className="space-y-2">
          {apps.map(a => (
            <button
              key={a.id}
              onClick={() => onSelect(a.id)}
              className={`w-full text-left p-3 rounded-lg border transition-all ${selectedId === a.id ? 'bg-brand/5 border-brand ring-1 ring-brand/20' : 'bg-white dark:bg-ink-800 border-ink-100 dark:border-ink-700 hover:border-ink-200'}`}
            >
              <p className="text-[13px] font-bold text-ink-900 dark:text-white truncate">{a.application_number}</p>
              <div className="flex items-center justify-between gap-2 mt-1">
                <span className="text-[11px] text-ink-500 truncate">{a.department_name}</span>
                <span className={`chip-primary chip-xs ${a.status === 'draft' ? 'opacity-60' : ''}`}>{a.status}</span>
              </div>
            </button>
          ))}
        </div>
      </aside>

      <Card>
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <p className="text-[11px] uppercase tracking-wider text-ink-400">Application Number</p>
            <p className="text-[20px] font-mono font-bold text-brand">{selectedApp.application_number}</p>
            <p className="text-[13px] text-ink-600 mt-1">{selectedApp.first_name} {selectedApp.last_name} · <span className="text-ink-500">{selectedApp.email}</span></p>
          </div>
          <div className="flex items-center gap-2">
            <span className="chip-primary">{selectedApp.status}</span>
            {['draft', 'submitted'].includes(selectedApp.status) && (
              <button onClick={() => setEditing(selectedApp.id)} className="btn-secondary btn-sm"><Pencil className="w-3.5 h-3.5" /> Edit details</button>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-5">
          <StatTile k="Faculty / Department" v={`${selectedApp.faculty_name} / ${selectedApp.department_name}`} />
          <StatTile k="Intake / Year"  v={`${selectedApp.intake} (${selectedApp.academic_year_label})`} />
        </div>

        {details?.status_log && details.status_log.length > 0 && (
          <div className="mt-8 pt-6 border-t border-ink-100 dark:border-ink-700">
            <SectionHeader title="Status history" sub="Application progress over time." />
            <div className="mt-4 space-y-3">
              {details.status_log.map((log: any, idx: number) => (
                <div key={idx} className="flex gap-3">
                  <div className="w-1.5 h-1.5 rounded-full bg-brand mt-1.5 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-4">
                      <span className="text-[12.5px] font-bold text-ink-900 dark:text-white capitalize">{log.to_status.replace('_', ' ')}</span>
                      <span className="text-[11px] text-ink-400">{fmt(log.created_at)}</span>
                    </div>
                    <p className="text-[12px] text-ink-500 mt-0.5">{log.notes || `Application moved to ${log.to_status}`}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {editing && (
          <EditApplicationModal
            appId={editing}
            onClose={() => setEditing(null)}
            onSuccess={() => { setEditing(null); qc.invalidateQueries({ queryKey: ['applicant', 'applications'] }); qc.invalidateQueries({ queryKey: ['applicant', 'application', editing] }) }}
          />
        )}
      </Card>
    </div>
  )
}

function StatTile({ k, v }: { k: string; v: React.ReactNode }) {
  return <div className="rounded-md bg-ink-50 dark:bg-ink-800/50 p-3"><p className="text-[10.5px] uppercase tracking-wider font-semibold text-ink-400">{k}</p><p className="text-ink-900 dark:text-white font-semibold truncate">{v || '—'}</p></div>
}

function EditApplicationModal({ appId, onClose, onSuccess }: { appId: number, onClose: () => void, onSuccess: () => void }) {
  const applicationQ = useQuery({ queryKey: ['applicant', 'application', appId], queryFn: () => applicantService.getApplicationDetails(appId) })
  const app = applicationQ.data?.data
  const [form, setForm] = useState<any>(null)
  
  if (app && !form) {
    setForm({
      first_name: app.first_name, last_name: app.last_name, phone: app.phone, gender: app.gender,
      birthdate: app.birthdate, nationality: app.nationality, address: app.address,
      prev_school: app.prev_school, prev_qualification: app.prev_qualification,
      prev_grade: app.prev_grade, graduation_year: app.graduation_year,
      sponsorship: app.sponsorship, sponsor_name: app.sponsor_name
    })
  }

  const mutation = useMutation({
    mutationFn: (d: any) => applicantService.updateApplication(appId, d),
    onSuccess: () => { toast.success('Application updated'); onSuccess() },
    onError: (e: any) => toast.error(e?.response?.data?.message ?? 'Failed to update')
  })

  if (!app || !form) return null

  const save = () => mutation.mutate(form)

  return (
    <Modal open onClose={onClose} title="Edit Application Details" footer={<><button className="btn-secondary" onClick={onClose}>Cancel</button><button className="btn-primary" onClick={save} disabled={mutation.isPending}>{mutation.isPending && <Loader2 className="w-3.5 h-3.5 animate-spin" />} Save changes</button></>}>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Field label="First name"><input className="input" value={form.first_name} onChange={e => setForm({ ...form, first_name: e.target.value })} /></Field>
        <Field label="Last name"><input className="input" value={form.last_name} onChange={e => setForm({ ...form, last_name: e.target.value })} /></Field>
        <Field label="Phone number"><input className="input" value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} /></Field>
        <Field label="Gender">
          <select className="input" value={form.gender} onChange={e => setForm({ ...form, gender: e.target.value })}>
            <option value="Male">Male</option>
            <option value="Female">Female</option>
            <option value="Other">Other</option>
          </select>
        </Field>
        <Field label="Birthdate"><input type="date" className="input" value={form.birthdate} onChange={e => setForm({ ...form, birthdate: e.target.value })} /></Field>
        <Field label="Nationality"><input className="input" value={form.nationality} onChange={e => setForm({ ...form, nationality: e.target.value })} /></Field>
        <div className="sm:col-span-2">
          <Field label="Residential Address"><textarea className="input" value={form.address} onChange={e => setForm({ ...form, address: e.target.value })} /></Field>
        </div>
        <div className="sm:col-span-2 mt-4 pt-4 border-t border-ink-100 dark:border-ink-700">
          <h3 className="text-[13px] font-bold text-ink-900 dark:text-white">Academic background</h3>
        </div>
        <Field label="Previous school"><input className="input" value={form.prev_school} onChange={e => setForm({ ...form, prev_school: e.target.value })} /></Field>
        <Field label="Qualification"><input className="input" value={form.prev_qualification} onChange={e => setForm({ ...form, prev_qualification: e.target.value })} /></Field>
        <Field label="Grade/Result"><input className="input" value={form.prev_grade} onChange={e => setForm({ ...form, prev_grade: e.target.value })} /></Field>
        <Field label="Graduation year"><input type="number" className="input" value={form.graduation_year} onChange={e => setForm({ ...form, graduation_year: Number(e.target.value) })} /></Field>
        <div className="sm:col-span-2 mt-4 pt-4 border-t border-ink-100 dark:border-ink-700">
          <h3 className="text-[13px] font-bold text-ink-900 dark:text-white">Financing</h3>
        </div>
        <Field label="Sponsorship">
          <select className="input" value={form.sponsorship} onChange={e => setForm({ ...form, sponsorship: e.target.value })}>
            <option value="self">Self-sponsored</option>
            <option value="government">Government / REB</option>
            <option value="church">Church / Parish</option>
            <option value="other">Other organization</option>
          </select>
        </Field>
        {form.sponsorship !== 'self' && (
          <Field label="Sponsor name"><input className="input" value={form.sponsor_name} onChange={e => setForm({ ...form, sponsor_name: e.target.value })} /></Field>
        )}
      </div>
    </Modal>
  )
}
