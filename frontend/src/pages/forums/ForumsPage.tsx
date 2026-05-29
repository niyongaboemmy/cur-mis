import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import toast from 'react-hot-toast'
import {
  MessagesSquare, Plus, Loader2, Pin, Lock, MessageCircle, ChevronRight, X, Settings2,
} from 'lucide-react'
import { useAuthStore } from '@/store/authStore'
import { PERMISSIONS } from '@/constants/permissions'
import {
  forumService, FORUM_AUDIENCE_LABELS,
  type ForumCategory, type ForumAudience,
} from '@/services/forumService'

const AUDIENCES: ForumAudience[] = ['all', 'students', 'staff', 'faculty', 'admin']

function timeAgo(d: string | null) {
  if (!d) return '—'
  const diff = Date.now() - new Date(d).getTime()
  const m = Math.floor(diff / 60000)
  if (m < 1) return 'just now'
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  const days = Math.floor(h / 24)
  if (days < 30) return `${days}d ago`
  return new Date(d).toLocaleDateString()
}

export default function ForumsPage() {
  const user = useAuthStore((s) => s.user)
  const canModerate =
    ['superadmin', 'admin'].includes(user?.role ?? '') ||
    (user?.permissions ?? []).includes(PERMISSIONS.MODERATE_FORUMS)

  const qc = useQueryClient()
  const navigate = useNavigate()
  const [selected, setSelected] = useState<ForumCategory | null>(null)
  const [showThreadForm, setShowThreadForm] = useState(false)
  const [showCatForm, setShowCatForm] = useState(false)

  const catQ = useQuery({ queryKey: ['forum-categories'], queryFn: () => forumService.categories() })
  const categories = catQ.data?.data ?? []

  const threadsQ = useQuery({
    queryKey: ['forum-threads', selected?.id],
    queryFn: () => forumService.threads(selected!.id),
    enabled: !!selected,
  })
  const threads = threadsQ.data?.data?.threads ?? []

  return (
    <div className="max-w-[1100px] mx-auto space-y-5">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-brand/10 text-brand grid place-items-center">
          <MessagesSquare className="w-5 h-5" />
        </div>
        <div className="flex-1">
          <h1 className="text-lg font-bold text-ink-900 dark:text-ink-50">Discussion forums</h1>
          <p className="text-[13px] text-ink-500">Ask questions and discuss with the university community.</p>
        </div>
        {canModerate && (
          <button className="btn-ghost btn-sm" onClick={() => setShowCatForm(true)}>
            <Settings2 className="w-4 h-4" /> New category
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-[280px_1fr] gap-4">
        {/* Categories */}
        <div className="space-y-2">
          {catQ.isLoading ? (
            <div className="card p-6 text-center"><Loader2 className="w-5 h-5 animate-spin mx-auto text-brand" /></div>
          ) : categories.length === 0 ? (
            <div className="card p-6 text-center text-ink-400 text-[13px]">No categories yet.</div>
          ) : (
            categories.map((c) => (
              <button
                key={c.id}
                onClick={() => { setSelected(c) }}
                className={`w-full text-left card p-3 transition ${selected?.id === c.id ? 'ring-2 ring-brand' : 'hover:bg-ink-50 dark:hover:bg-ink-800/40'} ${!Number(c.is_active) ? 'opacity-60' : ''}`}
              >
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-ink-900 dark:text-ink-50 text-[14px]">{c.name}</span>
                  <ChevronRight className="w-4 h-4 text-ink-300" />
                </div>
                {c.description && <p className="text-[12px] text-ink-500 mt-0.5 line-clamp-2">{c.description}</p>}
                <div className="flex items-center gap-3 mt-1.5 text-[11px] text-ink-400">
                  <span>{c.thread_count ?? 0} threads</span>
                  <span>{c.post_count ?? 0} posts</span>
                  {!Number(c.is_active) && <span className="text-amber-600">hidden</span>}
                  <span className="ml-auto px-1.5 py-0.5 rounded bg-ink-100 dark:bg-ink-700 text-ink-500">{FORUM_AUDIENCE_LABELS[c.audience]}</span>
                </div>
              </button>
            ))
          )}
        </div>

        {/* Threads */}
        <div className="space-y-3">
          {!selected ? (
            <div className="card p-10 text-center text-ink-400">
              Select a category to view its discussions.
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between">
                <h2 className="font-semibold text-ink-900 dark:text-ink-50">{selected.name}</h2>
                <button className="btn-primary btn-sm" onClick={() => setShowThreadForm(true)}>
                  <Plus className="w-4 h-4" /> New thread
                </button>
              </div>

              {threadsQ.isLoading ? (
                <div className="card p-8 text-center"><Loader2 className="w-6 h-6 animate-spin mx-auto text-brand" /></div>
              ) : threads.length === 0 ? (
                <div className="card p-8 text-center text-ink-400 text-[13px]">
                  No discussions yet — be the first to start one.
                </div>
              ) : (
                <div className="card divide-y divide-ink-100 dark:divide-ink-700/60">
                  {threads.map((t) => (
                    <button
                      key={t.id}
                      onClick={() => navigate(`/forums/threads/${t.id}`)}
                      className="w-full text-left p-3 flex items-start gap-3 hover:bg-ink-50 dark:hover:bg-ink-800/40"
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5">
                          {!!Number(t.is_pinned) && <Pin className="w-3.5 h-3.5 text-brand" />}
                          {!!Number(t.is_locked) && <Lock className="w-3.5 h-3.5 text-ink-400" />}
                          <span className="font-medium text-ink-900 dark:text-ink-50 truncate">{t.title}</span>
                        </div>
                        <div className="text-[11px] text-ink-400 mt-0.5">
                          {t.author_name ?? 'Unknown'} · {timeAgo(t.last_post_at ?? t.created_at)}
                        </div>
                      </div>
                      <div className="flex items-center gap-1 text-[12px] text-ink-400 shrink-0">
                        <MessageCircle className="w-3.5 h-3.5" /> {t.reply_count ?? 0}
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {showThreadForm && selected && (
        <NewThreadModal
          category={selected}
          onClose={() => setShowThreadForm(false)}
          onCreated={(id) => { setShowThreadForm(false); qc.invalidateQueries({ queryKey: ['forum-threads', selected.id] }); qc.invalidateQueries({ queryKey: ['forum-categories'] }); navigate(`/forums/threads/${id}`) }}
        />
      )}

      {showCatForm && (
        <NewCategoryModal
          onClose={() => setShowCatForm(false)}
          onCreated={() => { setShowCatForm(false); qc.invalidateQueries({ queryKey: ['forum-categories'] }) }}
        />
      )}
    </div>
  )
}

function NewThreadModal({ category, onClose, onCreated }: { category: ForumCategory; onClose: () => void; onCreated: (id: number) => void }) {
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const mut = useMutation({
    mutationFn: () => forumService.createThread(category.id, title.trim(), body.trim()),
    onSuccess: (res) => { toast.success('Thread created.'); onCreated(res.data?.id as number) },
    onError: (e: any) => toast.error(e?.response?.data?.message ?? 'Could not create thread.'),
  })
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink-900/60 backdrop-blur-sm p-4">
      <div className="card w-full max-w-lg">
        <div className="flex items-center justify-between px-5 py-3 border-b border-ink-100 dark:border-ink-700">
          <h3 className="font-semibold text-ink-900 dark:text-ink-50">New thread in {category.name}</h3>
          <button className="p-1 text-ink-400 hover:text-ink-700" onClick={onClose}><X className="w-5 h-5" /></button>
        </div>
        <div className="p-5 space-y-4">
          <div>
            <label className="label">Title</label>
            <input className="input" maxLength={200} value={title} placeholder="What do you want to discuss?"
              onChange={(e) => setTitle(e.target.value)} />
          </div>
          <div>
            <label className="label">Message</label>
            <textarea className="input min-h-[140px]" value={body} placeholder="Write your message…"
              onChange={(e) => setBody(e.target.value)} />
          </div>
        </div>
        <div className="flex justify-end gap-2 px-5 py-3 border-t border-ink-100 dark:border-ink-700">
          <button className="btn-ghost btn-sm" onClick={onClose}>Cancel</button>
          <button className="btn-primary btn-sm" disabled={title.trim() === '' || body.trim() === '' || mut.isPending} onClick={() => mut.mutate()}>
            {mut.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />} Create
          </button>
        </div>
      </div>
    </div>
  )
}

function NewCategoryModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [audience, setAudience] = useState<ForumAudience>('all')
  const mut = useMutation({
    mutationFn: () => forumService.createCategory({ name: name.trim(), description: description.trim() || null, audience }),
    onSuccess: () => { toast.success('Category created.'); onCreated() },
    onError: (e: any) => toast.error(e?.response?.data?.message ?? 'Could not create category.'),
  })
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink-900/60 backdrop-blur-sm p-4">
      <div className="card w-full max-w-md">
        <div className="flex items-center justify-between px-5 py-3 border-b border-ink-100 dark:border-ink-700">
          <h3 className="font-semibold text-ink-900 dark:text-ink-50">New forum category</h3>
          <button className="p-1 text-ink-400 hover:text-ink-700" onClick={onClose}><X className="w-5 h-5" /></button>
        </div>
        <div className="p-5 space-y-4">
          <div>
            <label className="label">Name</label>
            <input className="input" maxLength={120} value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div>
            <label className="label">Description <span className="text-ink-400 font-normal">(optional)</span></label>
            <input className="input" value={description} onChange={(e) => setDescription(e.target.value)} />
          </div>
          <div>
            <label className="label">Who can see this?</label>
            <select className="input" value={audience} onChange={(e) => setAudience(e.target.value as ForumAudience)}>
              {AUDIENCES.map((a) => <option key={a} value={a}>{FORUM_AUDIENCE_LABELS[a]}</option>)}
            </select>
          </div>
        </div>
        <div className="flex justify-end gap-2 px-5 py-3 border-t border-ink-100 dark:border-ink-700">
          <button className="btn-ghost btn-sm" onClick={onClose}>Cancel</button>
          <button className="btn-primary btn-sm" disabled={name.trim() === '' || mut.isPending} onClick={() => mut.mutate()}>
            {mut.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />} Create
          </button>
        </div>
      </div>
    </div>
  )
}
