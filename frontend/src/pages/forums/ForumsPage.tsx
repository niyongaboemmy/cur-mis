import { useEffect, useRef, useState, useCallback } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import {
  MessagesSquare, Plus, Loader2, Send, Trash2, X, Settings2, ArrowLeft,
  ArrowDown, Hash, ShieldCheck, Paperclip, FileText, Download, ImageIcon,
} from 'lucide-react'
import { useAuthStore } from '@/store/authStore'
import { PERMISSIONS } from '@/constants/permissions'
import {
  forumService, FORUM_AUDIENCE_LABELS,
  type ForumCategory, type ForumAudience, type ForumMessage,
} from '@/services/forumService'

const AUDIENCES: ForumAudience[] = ['all', 'students', 'staff', 'faculty', 'admin']
const POLL_MS = 3000
const SEEN_KEY = 'forum_seen_v1'
const MAX_UPLOAD = 5 * 1024 * 1024 // 5MB (file-server limit)

/* ── helpers ──────────────────────────────────────────────────────────────── */

function initials(name: string | null) {
  if (!name) return '?'
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase()
}
const AV_COLORS = ['#0ea5e9', '#6366f1', '#ec4899', '#f59e0b', '#10b981', '#ef4444', '#8b5cf6', '#14b8a6']
function avatarColor(name: string | null) {
  const s = name ?? '?'
  let h = 0
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0
  return AV_COLORS[h % AV_COLORS.length]
}
function clockTime(d: string) {
  try { return new Date(d).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' }) }
  catch { return '' }
}
function dayLabel(d: string) {
  try {
    const dt = new Date(d), now = new Date()
    if (dt.toDateString() === now.toDateString()) return 'Today'
    const yest = new Date(now); yest.setDate(now.getDate() - 1)
    if (dt.toDateString() === yest.toDateString()) return 'Yesterday'
    return dt.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })
  } catch { return '' }
}
const isImage = (mime?: string | null) => !!mime && mime.startsWith('image/')

// per-room "last seen message id" map, persisted locally
function readSeen(): Record<string, number> {
  try { return JSON.parse(localStorage.getItem(SEEN_KEY) || '{}') } catch { return {} }
}
function writeSeen(map: Record<string, number>) {
  try { localStorage.setItem(SEEN_KEY, JSON.stringify(map)) } catch { /* ignore */ }
}

/* ── Avatar (real photo with initials fallback) ─────────────────────────────── */

function Avatar({ name, photoId, size = 32 }: { name: string | null; photoId?: string | null; size?: number }) {
  const [failed, setFailed] = useState(false)
  const px = { width: size, height: size }
  if (photoId && !failed) {
    return (
      <img
        src={forumService.fileUrl(photoId)}
        alt={name ?? ''}
        style={px}
        className="rounded-full object-cover bg-ink-100"
        onError={() => setFailed(true)}
      />
    )
  }
  return (
    <div style={{ ...px, background: avatarColor(name) }} className="rounded-full grid place-items-center text-white text-[11px] font-bold">
      {initials(name)}
    </div>
  )
}

export default function ForumsPage() {
  const user = useAuthStore((s) => s.user)
  const canModerate =
    ['superadmin', 'admin'].includes(user?.role ?? '') ||
    (user?.permissions ?? []).includes(PERMISSIONS.MODERATE_FORUMS)

  const qc = useQueryClient()
  const [selected, setSelected] = useState<ForumCategory | null>(null)
  const [showCatForm, setShowCatForm] = useState(false)
  const [seen, setSeen] = useState<Record<string, number>>(() => readSeen())

  const catQ = useQuery({
    queryKey: ['forum-categories'],
    queryFn: () => forumService.categories(),
    refetchInterval: 10000,
  })
  const categories = catQ.data?.data ?? []

  const unreadFor = (c: ForumCategory) => {
    const last = Number(c.last_message_id ?? 0)
    const s = seen[String(c.id)] ?? 0
    return last > s ? last - s : 0
  }
  const totalUnread = categories.reduce((n, c) => n + (selected?.id === c.id ? 0 : unreadFor(c)), 0)

  const markSeen = useCallback((catId: number, lastId: number) => {
    setSeen((prev) => {
      if ((prev[String(catId)] ?? 0) >= lastId) return prev
      const next = { ...prev, [String(catId)]: lastId }
      writeSeen(next)
      return next
    })
  }, [])

  const openRoom = (c: ForumCategory) => {
    setSelected(c)
    if (c.last_message_id) markSeen(c.id, Number(c.last_message_id))
  }

  return (
    <div className="max-w-[1280px] mx-auto h-[calc(100vh-150px)] min-h-[480px] flex flex-col">
      <div className="flex items-center gap-3 mb-3">
        <div className="w-10 h-10 rounded-xl bg-brand/10 text-brand grid place-items-center relative">
          <MessagesSquare className="w-5 h-5" />
          {totalUnread > 0 && (
            <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-red-500 text-white text-[10px] font-bold grid place-items-center">
              {totalUnread > 99 ? '99+' : totalUnread}
            </span>
          )}
        </div>
        <div className="flex-1">
          <h1 className="text-lg font-bold text-ink-900 dark:text-ink-50">Discussion forums</h1>
          <p className="text-[13px] text-ink-500">Live chat rooms for the university community.</p>
        </div>
        {canModerate && (
          <button className="btn-ghost btn-sm" onClick={() => setShowCatForm(true)}>
            <Settings2 className="w-4 h-4" /> New room
          </button>
        )}
      </div>

      <div className="card overflow-hidden grid grid-cols-1 md:grid-cols-[300px_1fr] flex-1 min-h-0">
        {/* Rooms list */}
        <aside className={`border-r border-ink-100 dark:border-ink-700 overflow-y-auto ${selected ? 'hidden md:block' : 'block'}`}>
          <div className="px-4 py-2.5 text-[11px] font-bold uppercase tracking-wide text-ink-400 border-b border-ink-100 dark:border-ink-700 flex items-center justify-between">
            Rooms {totalUnread > 0 && <span className="text-red-500">{totalUnread} new</span>}
          </div>
          {catQ.isLoading ? (
            <div className="p-6 text-center"><Loader2 className="w-5 h-5 animate-spin mx-auto text-brand" /></div>
          ) : categories.length === 0 ? (
            <div className="p-6 text-center text-ink-400 text-[13px]">No rooms yet.</div>
          ) : (
            categories.map((c) => {
              const unread = selected?.id === c.id ? 0 : unreadFor(c)
              return (
                <button
                  key={c.id}
                  onClick={() => openRoom(c)}
                  className={`w-full text-left px-3 py-2.5 flex items-start gap-2.5 border-b border-ink-50 dark:border-ink-800/50 transition
                    ${selected?.id === c.id ? 'bg-brand/10' : 'hover:bg-ink-50 dark:hover:bg-ink-800/40'} ${!Number(c.is_active) ? 'opacity-60' : ''}`}
                >
                  <div className="w-8 h-8 rounded-lg bg-ink-100 dark:bg-ink-700 grid place-items-center text-ink-500 shrink-0">
                    <Hash className="w-4 h-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <span className={`font-semibold text-[14px] truncate ${selected?.id === c.id ? 'text-brand' : 'text-ink-900 dark:text-ink-50'}`}>{c.name}</span>
                      {unread > 0
                        ? <span className="min-w-[18px] h-[18px] px-1 rounded-full bg-red-500 text-white text-[10px] font-bold grid place-items-center shrink-0">{unread > 99 ? '99+' : unread}</span>
                        : <span className="text-[10px] px-1.5 py-0.5 rounded bg-ink-100 dark:bg-ink-700 text-ink-500 shrink-0">{FORUM_AUDIENCE_LABELS[c.audience]}</span>}
                    </div>
                    {c.description && <p className="text-[11.5px] text-ink-400 truncate">{c.description}</p>}
                    <div className="text-[10.5px] text-ink-400 mt-0.5">{c.post_count ?? 0} messages</div>
                  </div>
                </button>
              )
            })
          )}
        </aside>

        {/* Chat room */}
        <section className={`${selected ? 'flex' : 'hidden md:flex'} flex-col min-h-0`}>
          {!selected ? (
            <div className="flex-1 grid place-items-center text-ink-400 text-[14px] px-6 text-center">
              Select a room to open its live chat.
            </div>
          ) : (
            <ChatRoom
              key={selected.id}
              room={selected}
              me={Number(user?.id)}
              canModerate={canModerate}
              onBack={() => setSelected(null)}
              onSeen={(lastId) => markSeen(selected.id, lastId)}
              onActivity={() => qc.invalidateQueries({ queryKey: ['forum-categories'] })}
            />
          )}
        </section>
      </div>

      {showCatForm && (
        <NewCategoryModal
          onClose={() => setShowCatForm(false)}
          onCreated={() => { setShowCatForm(false); qc.invalidateQueries({ queryKey: ['forum-categories'] }) }}
        />
      )}
    </div>
  )
}

/* ── Chat room (live polling) ───────────────────────────────────────────────── */

function ChatRoom({
  room, me, canModerate, onBack, onSeen, onActivity,
}: {
  room: ForumCategory; me: number; canModerate: boolean
  onBack: () => void; onSeen: (lastId: number) => void; onActivity: () => void
}) {
  const [messages, setMessages] = useState<ForumMessage[]>([])
  const [loading, setLoading] = useState(true)
  const [draft, setDraft] = useState('')
  const [sending, setSending] = useState(false)
  const [atBottom, setAtBottom] = useState(true)
  const [newCount, setNewCount] = useState(0)
  const [attachment, setAttachment] = useState<{ id: string; name: string; mime: string } | null>(null)
  const [uploading, setUploading] = useState(false)

  const lastIdRef = useRef(0)
  const scrollRef = useRef<HTMLDivElement | null>(null)
  const atBottomRef = useRef(true)
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  const scrollToBottom = useCallback((behavior: ScrollBehavior = 'auto') => {
    const el = scrollRef.current
    if (el) el.scrollTo({ top: el.scrollHeight, behavior })
    setNewCount(0)
  }, [])

  // initial load
  useEffect(() => {
    let alive = true
    setLoading(true); setMessages([]); lastIdRef.current = 0
    forumService.roomMessages(room.id)
      .then((res) => {
        if (!alive) return
        const msgs = res.data?.messages ?? []
        setMessages(msgs)
        lastIdRef.current = msgs.length ? msgs[msgs.length - 1].id : 0
        if (lastIdRef.current) onSeen(lastIdRef.current)
        setLoading(false)
        requestAnimationFrame(() => scrollToBottom('auto'))
      })
      .catch((e: any) => {
        if (!alive) return
        setLoading(false)
        toast.error(e?.response?.data?.message ?? 'Could not open this room.')
      })
    return () => { alive = false }
  }, [room.id, scrollToBottom, onSeen])

  // poll
  useEffect(() => {
    let alive = true
    const tick = async () => {
      try {
        const res = await forumService.roomMessages(room.id, lastIdRef.current || undefined)
        if (!alive) return
        const incoming = (res.data?.messages ?? []).filter((m) => m.id > lastIdRef.current)
        if (incoming.length) {
          lastIdRef.current = incoming[incoming.length - 1].id
          setMessages((prev) => [...prev, ...incoming])
          onActivity()
          if (atBottomRef.current) {
            onSeen(lastIdRef.current)
            requestAnimationFrame(() => scrollToBottom('smooth'))
          } else {
            setNewCount((n) => n + incoming.filter((m) => m.created_by !== me).length)
          }
        }
      } catch { /* transient */ }
    }
    const id = window.setInterval(tick, POLL_MS)
    return () => { alive = false; window.clearInterval(id) }
  }, [room.id, me, scrollToBottom, onActivity, onSeen])

  const onScroll = () => {
    const el = scrollRef.current
    if (!el) return
    const near = el.scrollHeight - el.scrollTop - el.clientHeight < 80
    atBottomRef.current = near
    setAtBottom(near)
    if (near) { setNewCount(0); if (lastIdRef.current) onSeen(lastIdRef.current) }
  }

  const pickFile = () => fileInputRef.current?.click()

  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    if (file.size > MAX_UPLOAD) { toast.error('File too large (max 5 MB).'); return }
    const ok = file.type.startsWith('image/') || file.type === 'application/pdf'
    if (!ok) { toast.error('Only images and PDF files are allowed.'); return }
    setUploading(true)
    try {
      const res = await forumService.uploadAttachment(file)
      const up = res.data
      if (up) setAttachment({ id: up.file_id, name: up.name, mime: up.mime })
    } catch (err: any) {
      toast.error(err?.response?.data?.message ?? 'Upload failed.')
    } finally {
      setUploading(false)
    }
  }

  const send = async () => {
    const text = draft.trim()
    if ((!text && !attachment) || sending) return
    setSending(true)
    const sentAttach = attachment
    setDraft(''); setAttachment(null)
    try {
      const res = await forumService.sendMessage(room.id, text, sentAttach ?? undefined)
      const msg = res.data
      if (msg) {
        lastIdRef.current = Math.max(lastIdRef.current, msg.id)
        onSeen(lastIdRef.current)
        setMessages((prev) => (prev.some((m) => m.id === msg.id) ? prev : [...prev, msg]))
        requestAnimationFrame(() => scrollToBottom('smooth'))
      }
    } catch (e: any) {
      setDraft(text); setAttachment(sentAttach)
      toast.error(e?.response?.data?.message ?? 'Message not sent.')
    } finally {
      setSending(false)
    }
  }

  const removeMsg = async (id: number) => {
    const prev = messages
    setMessages((m) => m.filter((x) => x.id !== id))
    try { await forumService.deletePost(id) }
    catch (e: any) { setMessages(prev); toast.error(e?.response?.data?.message ?? 'Could not remove message.') }
  }

  return (
    <div className="flex flex-col min-h-0 h-full">
      {/* Header */}
      <div className="px-4 py-2.5 border-b border-ink-100 dark:border-ink-700 flex items-center gap-2 bg-white dark:bg-ink-900">
        <button className="md:hidden p-1 text-ink-500" onClick={onBack}><ArrowLeft className="w-5 h-5" /></button>
        <div className="w-8 h-8 rounded-lg bg-brand/10 text-brand grid place-items-center"><Hash className="w-4 h-4" /></div>
        <div className="min-w-0 flex-1">
          <div className="font-semibold text-ink-900 dark:text-ink-50 truncate flex items-center gap-2">
            {room.name}
            <span className="inline-flex items-center gap-1 text-[10px] text-emerald-600 font-medium">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" /> live
            </span>
          </div>
          {room.description && <p className="text-[11.5px] text-ink-400 truncate">{room.description}</p>}
        </div>
        <span className="text-[10px] px-1.5 py-0.5 rounded bg-ink-100 dark:bg-ink-700 text-ink-500">{FORUM_AUDIENCE_LABELS[room.audience]}</span>
      </div>

      {/* Messages */}
      <div className="relative flex-1 min-h-0">
        <div ref={scrollRef} onScroll={onScroll} className="absolute inset-0 overflow-y-auto px-4 py-3 space-y-1 bg-ink-50/40 dark:bg-ink-900/40">
          {loading ? (
            <div className="h-full grid place-items-center"><Loader2 className="w-6 h-6 animate-spin text-brand" /></div>
          ) : messages.length === 0 ? (
            <div className="h-full grid place-items-center text-ink-400 text-[13px] text-center px-6">No messages yet — say hello 👋</div>
          ) : (
            messages.map((m, i) => {
              const prev = messages[i - 1]
              const showDay = !prev || dayLabel(prev.created_at) !== dayLabel(m.created_at)
              const grouped = !!prev && !showDay && prev.created_by === m.created_by
              return (
                <div key={m.id}>
                  {showDay && (
                    <div className="flex justify-center my-3">
                      <span className="text-[10.5px] px-2.5 py-0.5 rounded-full bg-ink-200/70 dark:bg-ink-700 text-ink-500">{dayLabel(m.created_at)}</span>
                    </div>
                  )}
                  <ChatBubble msg={m} mine={m.created_by === me} grouped={grouped} canDelete={canModerate || m.created_by === me} onDelete={() => removeMsg(m.id)} />
                </div>
              )
            })
          )}
        </div>

        {(!atBottom && newCount > 0) && (
          <button onClick={() => scrollToBottom('smooth')} className="absolute bottom-3 left-1/2 -translate-x-1/2 btn-primary btn-sm shadow-lg rounded-full">
            <ArrowDown className="w-3.5 h-3.5" /> {newCount} new
          </button>
        )}
      </div>

      {/* Composer */}
      <div className="border-t border-ink-100 dark:border-ink-700 p-2.5 bg-white dark:bg-ink-900">
        {attachment && (
          <div className="mb-2 inline-flex items-center gap-2 rounded-lg border border-ink-200 dark:border-ink-700 bg-ink-50 dark:bg-ink-800 pl-2 pr-1 py-1 text-[12px]">
            {isImage(attachment.mime) ? <ImageIcon className="w-4 h-4 text-brand" /> : <FileText className="w-4 h-4 text-red-500" />}
            <span className="max-w-[200px] truncate text-ink-700 dark:text-ink-200">{attachment.name}</span>
            <button className="p-0.5 text-ink-400 hover:text-red-500" onClick={() => setAttachment(null)}><X className="w-3.5 h-3.5" /></button>
          </div>
        )}
        <div className="flex items-end gap-2">
          <input ref={fileInputRef} type="file" accept="image/*,application/pdf" className="hidden" onChange={onFile} />
          <button
            className="h-[42px] w-[42px] grid place-items-center rounded-lg border border-ink-200 dark:border-ink-700 text-ink-500 hover:bg-ink-50 dark:hover:bg-ink-800 shrink-0 disabled:opacity-50"
            onClick={pickFile} disabled={uploading} title="Attach image or PDF"
          >
            {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Paperclip className="w-4 h-4" />}
          </button>
          <textarea
            className="input flex-1 resize-none min-h-[42px] max-h-[140px] py-2.5"
            rows={1}
            placeholder={`Message #${room.name}…`}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() } }}
          />
          <button className="btn-primary btn-sm h-[42px] px-4" disabled={(!draft.trim() && !attachment) || sending} onClick={send}>
            {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
          </button>
        </div>
        <p className="text-[10.5px] text-ink-400 mt-1 px-1">Enter to send · Shift+Enter for a new line · 📎 image / PDF up to 5 MB</p>
      </div>
    </div>
  )
}

function ChatBubble({
  msg, mine, grouped, canDelete, onDelete,
}: { msg: ForumMessage; mine: boolean; grouped: boolean; canDelete: boolean; onDelete: () => void }) {
  return (
    <div className={`group flex gap-2.5 ${mine ? 'flex-row-reverse' : ''} ${grouped ? 'mt-0.5' : 'mt-2'}`}>
      <div className="w-8 shrink-0">
        {!grouped && <Avatar name={msg.author_name} photoId={msg.author_photo} size={32} />}
      </div>

      <div className={`max-w-[78%] min-w-0 ${mine ? 'items-end text-right' : ''} flex flex-col`}>
        {!grouped && (
          <div className={`flex items-center gap-1.5 mb-0.5 ${mine ? 'flex-row-reverse' : ''}`}>
            <span className="text-[12px] font-semibold text-ink-800 dark:text-ink-100 truncate">{mine ? 'You' : (msg.author_name ?? 'Unknown')}</span>
            {msg.author_role && ['superadmin', 'admin', 'registrar', 'HOD'].includes(msg.author_role) && (
              <span className="inline-flex items-center gap-0.5 text-[9px] px-1 py-0.5 rounded bg-brand/10 text-brand">
                <ShieldCheck className="w-2.5 h-2.5" /> {msg.author_role}
              </span>
            )}
            <span className="text-[10px] text-ink-400">{clockTime(msg.created_at)}</span>
          </div>
        )}
        <div className={`inline-flex items-start gap-2 ${mine ? 'flex-row-reverse' : ''}`}>
          <div className={`px-3 py-2 rounded-2xl text-[13.5px] whitespace-pre-wrap break-words text-left
            ${mine ? 'bg-brand text-white rounded-tr-sm' : 'bg-white dark:bg-ink-800 text-ink-800 dark:text-ink-100 border border-ink-100 dark:border-ink-700 rounded-tl-sm'}`}>
            {msg.attachment_id && <Attachment msg={msg} mine={mine} />}
            {msg.body && <div className={msg.attachment_id ? 'mt-1.5' : ''}>{msg.body}</div>}
          </div>
          {canDelete && (
            <button onClick={onDelete} className="opacity-0 group-hover:opacity-100 p-1 text-ink-300 hover:text-red-500 transition self-center" title="Delete message">
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

function Attachment({ msg, mine }: { msg: ForumMessage; mine: boolean }) {
  const url = forumService.fileUrl(msg.attachment_id as string)
  if (isImage(msg.attachment_mime)) {
    return (
      <a href={url} target="_blank" rel="noopener noreferrer" className="block">
        <img src={url} alt={msg.attachment_name ?? 'image'} className="rounded-lg max-h-64 max-w-full object-cover" loading="lazy" />
      </a>
    )
  }
  return (
    <a
      href={url} target="_blank" rel="noopener noreferrer"
      className={`flex items-center gap-2 rounded-lg px-2.5 py-2 ${mine ? 'bg-white/15 hover:bg-white/25' : 'bg-ink-50 dark:bg-ink-700/60 hover:bg-ink-100 dark:hover:bg-ink-700'}`}
    >
      <FileText className={`w-5 h-5 shrink-0 ${mine ? 'text-white' : 'text-red-500'}`} />
      <span className="text-[12.5px] truncate max-w-[180px]">{msg.attachment_name ?? 'Document'}</span>
      <Download className={`w-3.5 h-3.5 shrink-0 ${mine ? 'text-white/80' : 'text-ink-400'}`} />
    </a>
  )
}

/* ── New room (category) modal — moderators ─────────────────────────────────── */

function NewCategoryModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [audience, setAudience] = useState<ForumAudience>('all')
  const mut = useMutation({
    mutationFn: () => forumService.createCategory({ name: name.trim(), description: description.trim() || null, audience }),
    onSuccess: () => { toast.success('Room created.'); onCreated() },
    onError: (e: any) => toast.error(e?.response?.data?.message ?? 'Could not create room.'),
  })
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink-900/60 backdrop-blur-sm p-4">
      <div className="card w-full max-w-md">
        <div className="flex items-center justify-between px-5 py-3 border-b border-ink-100 dark:border-ink-700">
          <h3 className="font-semibold text-ink-900 dark:text-ink-50">New chat room</h3>
          <button className="p-1 text-ink-400 hover:text-ink-700" onClick={onClose}><X className="w-5 h-5" /></button>
        </div>
        <div className="p-5 space-y-4">
          <div>
            <label className="label">Room name</label>
            <input className="input" maxLength={120} value={name} placeholder="e.g. Final Year Projects" onChange={(e) => setName(e.target.value)} />
          </div>
          <div>
            <label className="label">Description <span className="text-ink-400 font-normal">(optional)</span></label>
            <input className="input" value={description} onChange={(e) => setDescription(e.target.value)} />
          </div>
          <div>
            <label className="label">Who can join?</label>
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
