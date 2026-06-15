import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useParams, useNavigate } from 'react-router-dom'
import toast from 'react-hot-toast'
import {
  ArrowLeft, Loader2, Pin, PinOff, Lock, Unlock, Trash2, Send, ShieldCheck,
} from 'lucide-react'
import { useAuthStore } from '@/store/authStore'
import { forumService, type ForumPost } from '@/services/forumService'

function fmt(d: string) {
  try { return new Date(d).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }) }
  catch { return d }
}

function initials(name: string | null) {
  if (!name) return '?'
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase()
}

export default function ForumThreadPage() {
  const { id } = useParams<{ id: string }>()
  const threadId = Number(id)
  const navigate = useNavigate()
  const qc = useQueryClient()
  const user = useAuthStore((s) => s.user)
  const [reply, setReply] = useState('')

  const q = useQuery({
    queryKey: ['forum-thread', threadId],
    queryFn: () => forumService.thread(threadId),
    enabled: threadId > 0,
  })

  const data = q.data?.data
  const thread = data?.thread
  const posts = data?.posts ?? []
  const canModerate = !!data?.can_moderate
  const locked = !!(thread && Number(thread.is_locked))

  const invalidate = () => qc.invalidateQueries({ queryKey: ['forum-thread', threadId] })

  const replyMut = useMutation({
    mutationFn: () => forumService.reply(threadId, reply.trim()),
    onSuccess: () => { setReply(''); invalidate() },
    onError: (e: any) => toast.error(e?.response?.data?.message ?? 'Could not post reply.'),
  })

  const modMut = useMutation({
    mutationFn: (payload: { is_pinned?: boolean; is_locked?: boolean }) => forumService.updateThread(threadId, payload),
    onSuccess: () => { invalidate(); toast.success('Thread updated.') },
    onError: (e: any) => toast.error(e?.response?.data?.message ?? 'Could not update thread.'),
  })

  const delPostMut = useMutation({
    mutationFn: (postId: number) => forumService.deletePost(postId),
    onSuccess: () => { invalidate(); toast.success('Post removed.') },
    onError: (e: any) => toast.error(e?.response?.data?.message ?? 'Could not remove post.'),
  })

  const delThreadMut = useMutation({
    mutationFn: () => forumService.deleteThread(threadId),
    onSuccess: () => { toast.success('Thread removed.'); navigate('/forums') },
    onError: (e: any) => toast.error(e?.response?.data?.message ?? 'Could not remove thread.'),
  })

  if (q.isLoading) {
    return <div className="card p-10 text-center max-w-[900px] mx-auto"><Loader2 className="w-6 h-6 animate-spin mx-auto text-brand" /></div>
  }
  if (q.isError || !thread) {
    return (
      <div className="card p-10 text-center max-w-[900px] mx-auto text-ink-400">
        This thread is unavailable.
        <div className="mt-3"><button className="btn-ghost btn-sm" onClick={() => navigate('/forums')}><ArrowLeft className="w-4 h-4" /> Back to forums</button></div>
      </div>
    )
  }

  const canDeleteThread = canModerate || Number(thread.created_by) === Number(user?.id)

  return (
    <div className="max-w-[900px] mx-auto space-y-4">
      <button className="btn-ghost btn-sm" onClick={() => navigate('/forums')}>
        <ArrowLeft className="w-4 h-4" /> {thread.category_name ?? 'Forums'}
      </button>

      {/* Thread header */}
      <div className="card p-4">
        <div className="flex items-start gap-2">
          <div className="flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              {!!Number(thread.is_pinned) && <Pin className="w-4 h-4 text-brand" />}
              {locked && <Lock className="w-4 h-4 text-ink-400" />}
              <h1 className="text-lg font-bold text-ink-900 dark:text-ink-50">{thread.title}</h1>
            </div>
            <p className="text-[12px] text-ink-400 mt-1">
              Started by {thread.author_name ?? 'Unknown'} · {fmt(thread.created_at)} · {thread.views} views
            </p>
          </div>
          <div className="flex items-center gap-1">
            {canModerate && (
              <>
                <button className="p-1.5 rounded-lg hover:bg-ink-100 dark:hover:bg-ink-700 text-ink-500"
                  title={Number(thread.is_pinned) ? 'Unpin' : 'Pin'}
                  onClick={() => modMut.mutate({ is_pinned: !Number(thread.is_pinned) })}>
                  {Number(thread.is_pinned) ? <PinOff className="w-4 h-4" /> : <Pin className="w-4 h-4" />}
                </button>
                <button className="p-1.5 rounded-lg hover:bg-ink-100 dark:hover:bg-ink-700 text-ink-500"
                  title={locked ? 'Unlock' : 'Lock'}
                  onClick={() => modMut.mutate({ is_locked: !locked })}>
                  {locked ? <Unlock className="w-4 h-4" /> : <Lock className="w-4 h-4" />}
                </button>
              </>
            )}
            {canDeleteThread && (
              <button className="p-1.5 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/30 text-red-500"
                title="Delete thread" onClick={() => delThreadMut.mutate()}>
                <Trash2 className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Posts */}
      <div className="space-y-3">
        {posts.map((p, i) => (
          <PostCard
            key={p.id}
            post={p}
            isOpening={i === 0}
            canDelete={canModerate || Number(p.created_by) === Number(user?.id)}
            onDelete={() => delPostMut.mutate(p.id)}
          />
        ))}
      </div>

      {/* Reply box */}
      {locked ? (
        <div className="card p-4 text-center text-[13px] text-ink-400">
          <Lock className="w-4 h-4 inline mr-1" /> This thread is locked. New replies are disabled.
        </div>
      ) : (
        <div className="card p-3">
          <textarea
            className="input min-h-[90px]" value={reply} placeholder="Write a reply…"
            onChange={(e) => setReply(e.target.value)}
          />
          <div className="flex justify-end mt-2">
            <button className="btn-primary btn-sm" disabled={reply.trim() === '' || replyMut.isPending} onClick={() => replyMut.mutate()}>
              {replyMut.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />} Reply
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

function PostCard({ post, isOpening, canDelete, onDelete }: { post: ForumPost; isOpening: boolean; canDelete: boolean; onDelete: () => void }) {
  if (Number(post.is_deleted)) {
    return <div className="card p-3 text-[12px] text-ink-400 italic">This post was removed.</div>
  }
  return (
    <div className={`card p-4 ${isOpening ? 'border-l-4 border-l-brand' : ''}`}>
      <div className="flex items-start gap-3">
        <div className="w-9 h-9 rounded-full bg-brand/10 text-brand grid place-items-center text-[12px] font-bold shrink-0">
          {initials(post.author_name)}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-ink-900 dark:text-ink-50 text-[13px]">{post.author_name ?? 'Unknown'}</span>
            {post.author_role && (
              <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] bg-ink-100 dark:bg-ink-700 text-ink-500">
                {['superadmin', 'admin', 'registrar'].includes(post.author_role) && <ShieldCheck className="w-3 h-3" />}
                {post.author_role}
              </span>
            )}
            <span className="text-[11px] text-ink-400">· {fmt(post.created_at)}</span>
            {canDelete && (
              <button className="ml-auto p-1 rounded hover:bg-red-50 dark:hover:bg-red-900/30 text-red-400" title="Delete" onClick={onDelete}>
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
          <p className="mt-1.5 text-[13.5px] text-ink-700 dark:text-ink-200 whitespace-pre-wrap break-words">{post.body}</p>
        </div>
      </div>
    </div>
  )
}
