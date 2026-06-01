import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import {
  Megaphone, Plus, Pencil, Trash2, Loader2, AlertTriangle,
  Pin, CalendarClock, X, Eye, EyeOff,
} from 'lucide-react'
import { useAuthStore } from '@/store/authStore'
import { PERMISSIONS } from '@/constants/permissions'
import {
  announcementService, AUDIENCE_LABELS,
  type Announcement, type AnnouncementInput,
  type AnnouncementAudience, type AnnouncementPriority,
} from '@/services/announcementService'

const AUDIENCES: AnnouncementAudience[] = ['all', 'students', 'staff', 'faculty', 'admin']

function audienceBadge(a: AnnouncementAudience) {
  return (
    <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wide bg-brand/10 text-brand">
      {AUDIENCE_LABELS[a]}
    </span>
  )
}

function fmtDate(d: string | null) {
  if (!d) return null
  try { return new Date(d).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }) }
  catch { return d }
}

export default function AnnouncementsPage() {
  const user = useAuthStore((s) => s.user)
  const canManage =
    ['superadmin', 'admin'].includes(user?.role ?? '') ||
    (user?.permissions ?? []).includes(PERMISSIONS.MANAGE_ANNOUNCEMENTS)

  const qc = useQueryClient()
  const [editing, setEditing] = useState<Announcement | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState<Announcement | null>(null)

  // Personalised feed — everyone sees this.
  const feedQ = useQuery({
    queryKey: ['announcements', 'feed'],
    queryFn: () => announcementService.feed(),
  })

  // Management list — only fetched for managers.
  const manageQ = useQuery({
    queryKey: ['announcements', 'manage'],
    queryFn: () => announcementService.list(),
    enabled: canManage,
  })

  const removeMut = useMutation({
    mutationFn: (id: number) => announcementService.remove(id),
    onSuccess: () => {
      toast.success('Announcement deleted.')
      setConfirmDelete(null)
      qc.invalidateQueries({ queryKey: ['announcements'] })
    },
    onError: (e: any) => toast.error(e?.response?.data?.message ?? 'Could not delete.'),
  })

  const toggleMut = useMutation({
    mutationFn: (a: Announcement) =>
      announcementService.update(a.id, {
        title: a.title, body: a.body, audience: a.audience, priority: a.priority,
        expires_at: a.expires_at, is_active: !Number(a.is_active),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['announcements'] }),
    onError: (e: any) => toast.error(e?.response?.data?.message ?? 'Could not update.'),
  })

  const feed = feedQ.data?.data ?? []
  const all  = manageQ.data?.data ?? []

  const openCreate = () => { setEditing(null); setShowForm(true) }
  const openEdit   = (a: Announcement) => { setEditing(a); setShowForm(true) }

  return (
    <div className="max-w-[1100px] mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-brand/10 text-brand grid place-items-center">
          <Megaphone className="w-5 h-5" />
        </div>
        <div className="flex-1">
          <h1 className="text-lg font-bold text-ink-900 dark:text-ink-50">Announcements</h1>
          <p className="text-[13px] text-ink-500">Exam schedules, results, holidays and notices.</p>
        </div>
        {canManage && (
          <button className="btn-primary btn-sm" onClick={openCreate}>
            <Plus className="w-4 h-4" /> New announcement
          </button>
        )}
      </div>

      {/* Personalised feed */}
      <section className="space-y-3">
        {feedQ.isLoading ? (
          <div className="card p-8 text-center"><Loader2 className="w-6 h-6 animate-spin mx-auto text-brand" /></div>
        ) : feed.length === 0 ? (
          <div className="card p-8 text-center text-ink-400">
            No announcements right now. Check back later.
          </div>
        ) : (
          feed.map((a) => (
            <article
              key={a.id}
              className={`card p-4 border-l-4 ${a.priority === 'urgent' ? 'border-l-red-500' : 'border-l-brand'}`}
            >
              <div className="flex items-start gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    {a.priority === 'urgent' && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300">
                        <Pin className="w-3 h-3" /> Urgent
                      </span>
                    )}
                    <h3 className="font-semibold text-ink-900 dark:text-ink-50 truncate">{a.title}</h3>
                    {audienceBadge(a.audience)}
                  </div>
                  <p className="mt-1.5 text-[13px] text-ink-600 dark:text-ink-300 whitespace-pre-wrap">{a.body}</p>
                  <div className="mt-2 flex items-center gap-3 text-[11px] text-ink-400">
                    <span>{fmtDate(a.created_at)}</span>
                    {a.posted_by_name && <span>· {a.posted_by_name}</span>}
                    {a.expires_at && (
                      <span className="inline-flex items-center gap-1">
                        <CalendarClock className="w-3 h-3" /> until {fmtDate(a.expires_at)}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </article>
          ))
        )}
      </section>

      {/* Management table */}
      {canManage && (
        <section className="card overflow-hidden">
          <div className="px-4 py-2.5 border-b border-ink-100 dark:border-ink-700 bg-ink-50 dark:bg-ink-800/40 text-[12px] font-semibold text-ink-700 dark:text-ink-200">
            Manage all announcements
          </div>
          {manageQ.isLoading ? (
            <div className="p-8 text-center"><Loader2 className="w-6 h-6 animate-spin mx-auto text-brand" /></div>
          ) : all.length === 0 ? (
            <div className="p-8 text-center text-ink-400">No announcements created yet.</div>
          ) : (
            <table className="w-full text-left text-[13px]">
              <thead>
                <tr className="bg-ink-50/60 dark:bg-ink-800/30 border-b border-ink-100 dark:border-ink-700 text-[10px] uppercase text-ink-400">
                  <th className="px-3 py-2 font-bold">Title</th>
                  <th className="px-3 py-2 font-bold">Audience</th>
                  <th className="px-3 py-2 font-bold">Priority</th>
                  <th className="px-3 py-2 font-bold">Expires</th>
                  <th className="px-3 py-2 font-bold">Status</th>
                  <th className="px-3 py-2 font-bold text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {all.map((a) => (
                  <tr key={a.id} className="border-b border-ink-50 dark:border-ink-800/60">
                    <td className="px-3 py-2 font-medium text-ink-800 dark:text-ink-100 max-w-[280px] truncate">{a.title}</td>
                    <td className="px-3 py-2">{AUDIENCE_LABELS[a.audience]}</td>
                    <td className="px-3 py-2">
                      {a.priority === 'urgent'
                        ? <span className="text-red-600 font-semibold">Urgent</span>
                        : <span className="text-ink-500">Normal</span>}
                    </td>
                    <td className="px-3 py-2 text-ink-500">
                      {a.expires_at ? fmtDate(a.expires_at) : '—'}
                      {!!a.is_expired && <span className="ml-1 text-[10px] text-amber-600">(expired)</span>}
                    </td>
                    <td className="px-3 py-2">
                      {Number(a.is_active)
                        ? <span className="text-emerald-600 font-medium">Active</span>
                        : <span className="text-ink-400">Hidden</span>}
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          title={Number(a.is_active) ? 'Hide' : 'Show'}
                          className="p-1.5 rounded-lg hover:bg-ink-100 dark:hover:bg-ink-700 text-ink-500"
                          onClick={() => toggleMut.mutate(a)}
                        >
                          {Number(a.is_active) ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                        </button>
                        <button
                          title="Edit"
                          className="p-1.5 rounded-lg hover:bg-ink-100 dark:hover:bg-ink-700 text-ink-500"
                          onClick={() => openEdit(a)}
                        >
                          <Pencil className="w-4 h-4" />
                        </button>
                        <button
                          title="Delete"
                          className="p-1.5 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/30 text-red-500"
                          onClick={() => setConfirmDelete(a)}
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      )}

      {showForm && (
        <AnnouncementForm
          initial={editing}
          onClose={() => setShowForm(false)}
          onSaved={() => { setShowForm(false); qc.invalidateQueries({ queryKey: ['announcements'] }) }}
        />
      )}

      {confirmDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink-900/60 backdrop-blur-sm p-4">
          <div className="card p-5 max-w-sm w-full">
            <div className="flex items-center gap-2 text-red-600 mb-2">
              <AlertTriangle className="w-5 h-5" />
              <h3 className="font-semibold">Delete announcement?</h3>
            </div>
            <p className="text-[13px] text-ink-600 dark:text-ink-300">
              "{confirmDelete.title}" will be permanently removed. This cannot be undone.
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <button className="btn-ghost btn-sm" onClick={() => setConfirmDelete(null)}>Cancel</button>
              <button
                className="btn-sm bg-red-600 text-white hover:bg-red-700 rounded-lg px-3 inline-flex items-center gap-1.5"
                disabled={removeMut.isPending}
                onClick={() => removeMut.mutate(confirmDelete.id)}
              >
                {removeMut.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

/* ── Create / edit modal ──────────────────────────────────────────────────── */

function AnnouncementForm({
  initial, onClose, onSaved,
}: { initial: Announcement | null; onClose: () => void; onSaved: () => void }) {
  const isEdit = !!initial
  const [form, setForm] = useState<AnnouncementInput>({
    title:      initial?.title ?? '',
    body:       initial?.body ?? '',
    audience:   initial?.audience ?? 'all',
    priority:   initial?.priority ?? 'normal',
    expires_at: initial?.expires_at ?? '',
    is_active:  initial ? !!Number(initial.is_active) : true,
  })

  const valid = form.title.trim() !== '' && form.body.trim() !== ''

  const saveMut = useMutation({
    mutationFn: () => {
      const payload: AnnouncementInput = {
        ...form,
        expires_at: form.expires_at ? form.expires_at : null,
      }
      return isEdit
        ? announcementService.update(initial!.id, payload)
        : announcementService.create(payload)
    },
    onSuccess: () => { toast.success(isEdit ? 'Announcement updated.' : 'Announcement posted.'); onSaved() },
    onError: (e: any) => toast.error(e?.response?.data?.message ?? 'Could not save.'),
  })

  const set = <K extends keyof AnnouncementInput>(k: K, v: AnnouncementInput[K]) =>
    setForm((f) => ({ ...f, [k]: v }))

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink-900/60 backdrop-blur-sm p-4">
      <div className="card w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-5 py-3 border-b border-ink-100 dark:border-ink-700">
          <h3 className="font-semibold text-ink-900 dark:text-ink-50">
            {isEdit ? 'Edit announcement' : 'New announcement'}
          </h3>
          <button className="p-1 text-ink-400 hover:text-ink-700" onClick={onClose}><X className="w-5 h-5" /></button>
        </div>

        <div className="p-5 space-y-4">
          <div>
            <label className="label">Title</label>
            <input
              className="input" value={form.title} maxLength={200}
              placeholder="e.g. End-of-semester exam timetable published"
              onChange={(e) => set('title', e.target.value)}
            />
          </div>

          <div>
            <label className="label">Message</label>
            <textarea
              className="input min-h-[120px]" value={form.body}
              placeholder="Write the announcement details…"
              onChange={(e) => set('body', e.target.value)}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Audience</label>
              <select className="input" value={form.audience}
                onChange={(e) => set('audience', e.target.value as AnnouncementAudience)}>
                {AUDIENCES.map((a) => <option key={a} value={a}>{AUDIENCE_LABELS[a]}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Priority</label>
              <select className="input" value={form.priority}
                onChange={(e) => set('priority', e.target.value as AnnouncementPriority)}>
                <option value="normal">Normal</option>
                <option value="urgent">Urgent</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 items-end">
            <div>
              <label className="label">Expires on <span className="text-ink-400 font-normal">(optional)</span></label>
              <input type="date" className="input" value={form.expires_at ?? ''}
                onChange={(e) => set('expires_at', e.target.value)} />
            </div>
            <label className="flex items-center gap-2 text-[13px] text-ink-600 dark:text-ink-300 pb-2 cursor-pointer">
              <input type="checkbox" checked={!!form.is_active}
                onChange={(e) => set('is_active', e.target.checked)} />
              Active (visible to audience)
            </label>
          </div>
        </div>

        <div className="flex justify-end gap-2 px-5 py-3 border-t border-ink-100 dark:border-ink-700">
          <button className="btn-ghost btn-sm" onClick={onClose}>Cancel</button>
          <button className="btn-primary btn-sm" disabled={!valid || saveMut.isPending} onClick={() => saveMut.mutate()}>
            {saveMut.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Megaphone className="w-4 h-4" />}
            {isEdit ? 'Save changes' : 'Post announcement'}
          </button>
        </div>
      </div>
    </div>
  )
}
