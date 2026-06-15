import {
  useRef,
  useEffect,
  useState,
  useCallback,
  type ChangeEvent,
  type KeyboardEvent,
} from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useSearchParams } from 'react-router-dom'
import {
  Search,
  Send,
  Paperclip,
  Edit,
  MoreVertical,
  Trash2,
  MessageSquare,
} from 'lucide-react'
import toast from 'react-hot-toast'
import { messageService } from '@/services/messageService'
import { useAuthStore } from '@/store/authStore'
import { cn } from '@/utils/helpers'
import type { Conversation, Message, MessageAttachment, Participant } from '@/types/messaging'
import ComposeMessageModal from './ComposeMessageModal'

/* ------------------------------------------------------------------ */
/* Helpers                                                              */
/* ------------------------------------------------------------------ */

function timeAgo(iso: string): string {
  const diff = (Date.now() - new Date(iso).getTime()) / 1000
  if (diff < 60)    return 'just now'
  if (diff < 3600)  return `${Math.floor(diff / 60)}m ago`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
  const d = new Date(iso)
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
}

function Initials({ name, size = 'md' }: { name: string; size?: 'sm' | 'md' }) {
  const parts = name.trim().split(' ')
  const letters = parts.length > 1
    ? (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
    : name.slice(0, 2).toUpperCase()
  return (
    <span className={cn(
      'inline-flex items-center justify-center rounded-full bg-primary-100 dark:bg-primary-900/40 text-primary-700 dark:text-primary-300 font-semibold flex-shrink-0',
      size === 'sm' ? 'w-8 h-8 text-xs' : 'w-9 h-9 text-sm',
    )}>
      {letters}
    </span>
  )
}

function conversationTitle(conv: Conversation): string {
  if (conv.subject) return conv.subject
  if (conv.type === 'direct') return 'Direct Message'
  return `Group (${conv.participant_count})`
}

/* ------------------------------------------------------------------ */
/* Sub-components                                                        */
/* ------------------------------------------------------------------ */

function ConversationItem({
  conv,
  active,
  onClick,
}: {
  conv:    Conversation
  active:  boolean
  onClick: () => void
}) {
  const title = conversationTitle(conv)
  const hasUnread = conv.unread_count > 0

  return (
    <button
      onClick={onClick}
      className={cn(
        'w-full flex items-start gap-3 px-4 py-3 text-left transition-colors',
        active
          ? 'bg-primary-50 dark:bg-primary-900/20 border-r-2 border-primary-600'
          : 'hover:bg-ink-50 dark:hover:bg-ink-700/40',
        hasUnread && !active && 'bg-blue-50/60 dark:bg-primary-900/10',
      )}
    >
      <Initials name={title} size="sm" />
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-1">
          <span className={cn(
            'text-sm truncate',
            hasUnread ? 'font-bold text-ink-900 dark:text-white' : 'font-medium text-ink-800 dark:text-ink-200',
          )}>
            {title}
          </span>
          <span className="text-[10px] text-ink-400 dark:text-ink-500 flex-shrink-0">
            {timeAgo(conv.last_message_at ?? conv.updated_at)}
          </span>
        </div>
        <div className="flex items-center gap-1 mt-0.5">
          <p className={cn(
            'text-xs truncate flex-1',
            hasUnread ? 'text-ink-700 dark:text-ink-300' : 'text-ink-400 dark:text-ink-500',
          )}>
            {conv.last_message_sender_name && conv.last_message_body
              ? `${conv.last_message_sender_name}: ${conv.last_message_body}`
              : 'No messages yet'}
          </p>
          {hasUnread && (
            <span className="w-4 h-4 rounded-full bg-primary-600 text-white text-[9px] font-bold flex items-center justify-center flex-shrink-0">
              {conv.unread_count > 9 ? '9+' : conv.unread_count}
            </span>
          )}
        </div>
      </div>
    </button>
  )
}

const API_BASE = import.meta.env.VITE_API_URL ?? ''

function AttachmentView({ att, mine }: { att: MessageAttachment; mine: boolean }) {
  const url = `${API_BASE}/${att.file_path}`
  const isImage = att.mime_type.startsWith('image/')

  if (isImage) {
    return (
      <a href={url} target="_blank" rel="noopener noreferrer" className="block mt-1.5">
        <img
          src={url}
          alt={att.file_name}
          className="max-w-[220px] max-h-[200px] rounded-xl object-cover border border-white/20"
        />
      </a>
    )
  }

  const kb = att.file_size < 1024 * 1024
    ? `${(att.file_size / 1024).toFixed(1)} KB`
    : `${(att.file_size / (1024 * 1024)).toFixed(1)} MB`

  return (
    <a
      href={url}
      download={att.file_name}
      className={cn(
        'mt-1.5 flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-medium transition-colors',
        mine
          ? 'bg-white/20 hover:bg-white/30 text-white'
          : 'bg-ink-200 dark:bg-ink-600 hover:bg-ink-300 dark:hover:bg-ink-500 text-ink-700 dark:text-ink-200',
      )}
    >
      <Paperclip className="w-3.5 h-3.5 flex-shrink-0" />
      <span className="truncate max-w-[160px]">{att.file_name}</span>
      <span className="flex-shrink-0 opacity-70">{kb}</span>
    </a>
  )
}

function MessageBubble({ msg, mine }: { msg: Message; mine: boolean }) {
  return (
    <div className={cn('flex items-end gap-2 group', mine ? 'flex-row-reverse' : 'flex-row')}>
      {!mine && (
        <span className="w-6 h-6 rounded-full bg-ink-200 dark:bg-ink-600 flex items-center justify-center text-[9px] font-bold text-ink-600 dark:text-ink-300 flex-shrink-0 mb-1">
          {msg.sender_name.slice(0, 2).toUpperCase()}
        </span>
      )}
      <div className={cn('max-w-[70%] flex flex-col', mine ? 'items-end' : 'items-start')}>
        {!mine && (
          <span className="text-[10px] text-ink-400 dark:text-ink-500 mb-1 ml-1">
            {msg.sender_name}
          </span>
        )}
        <div className={cn(
          'px-3.5 py-2.5 rounded-2xl text-sm leading-relaxed break-words',
          mine
            ? 'bg-primary-600 text-white rounded-br-sm'
            : 'bg-gray-100 dark:bg-ink-700 text-gray-800 dark:text-ink-100 rounded-bl-sm',
        )}>
          {msg.body}
          {msg.attachments.map(att => (
            <AttachmentView key={att.id} att={att} mine={mine} />
          ))}
        </div>
        <span className="text-[10px] mt-1 text-ink-400 dark:text-ink-500">
          {formatTime(msg.created_at)}
          {mine && msg.seen_at && (
            <span className="ml-1 text-primary-400">· Read</span>
          )}
        </span>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Main Page                                                            */
/* ------------------------------------------------------------------ */

export default function MessagesPage() {
  const qc   = useQueryClient()
  const user = useAuthStore(s => s.user)
  const myId = Number(user?.id ?? 0)

  const [params, setParams] = useSearchParams()
  const activeId = params.get('c') ? Number(params.get('c')) : null

  const [search, setSearch]       = useState('')
  const [body, setBody]           = useState('')
  const [sendEmail, setSendEmail] = useState(false)
  const [compose, setCompose]     = useState(false)
  const [menuOpen, setMenuOpen]   = useState(false)

  const bottomRef   = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const menuRef     = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [pendingFile, setPendingFile]   = useState<File | null>(null)
  const [uploading, setUploading]       = useState(false)

  /* Conversations list */
  const { data: convData, isLoading: loadingConvs } = useQuery({
    queryKey: ['messages', 'conversations'],
    queryFn:  () => messageService.getConversations().then(r => r.data),
    staleTime: 10_000,
    refetchInterval: 30_000,
  })
  const conversations: Conversation[] = convData?.data ?? []

  const filtered = conversations.filter(c => {
    const title = conversationTitle(c).toLowerCase()
    return title.includes(search.toLowerCase()) ||
           (c.last_message_body ?? '').toLowerCase().includes(search.toLowerCase())
  })

  /* Messages for active conversation */
  const { data: msgData, isLoading: loadingMsgs } = useQuery({
    queryKey: ['messages', 'chat', activeId],
    queryFn:  () => messageService.getMessages(activeId!).then(r => r.data),
    enabled:  !!activeId,
    staleTime: 5_000,
    refetchInterval: 10_000,
  })
  const messages: Message[] = msgData?.data ?? []

  /* Participants for the active conversation */
  const { data: participantsData } = useQuery({
    queryKey: ['messages', 'participants', activeId],
    queryFn:  () => messageService.getParticipants(activeId!).then(r => r.data ?? []),
    enabled:  !!activeId,
    staleTime: 60_000,
  })
  const participants: Participant[] = participantsData ?? []

  /* Active conversation object */
  const activeConv = conversations.find(c => c.id === activeId) ?? null

  /* Scroll to bottom when messages load or change */
  useEffect(() => {
    if (bottomRef.current) {
      bottomRef.current.scrollIntoView({ behavior: 'smooth' })
    }
  }, [messages.length, activeId])

  /* Auto-resize textarea */
  useEffect(() => {
    const ta = textareaRef.current
    if (!ta) return
    ta.style.height = 'auto'
    ta.style.height = Math.min(ta.scrollHeight, 120) + 'px'
  }, [body])

  /* Close options menu on outside click */
  useEffect(() => {
    if (!menuOpen) return
    function handler(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [menuOpen])

  /* Send message mutation */
  const sendMut = useMutation({
    mutationFn: (vars: { id: number; body: string; send_email: boolean }) =>
      messageService.sendMessage(vars.id, { body: vars.body, send_email: vars.send_email }),

    onMutate: async ({ id, body: msgBody }) => {
      await qc.cancelQueries({ queryKey: ['messages', 'chat', id] })
      const prev = qc.getQueryData(['messages', 'chat', id])

      const optimistic: Message = {
        id:               Date.now(),
        conversation_id:  id,
        sender_id:        myId,
        sender_name:      user?.full_name ?? 'You',
        body:             msgBody,
        is_draft:         false,
        delivery_channel: sendEmail ? 'system_email' : 'system',
        created_at:       new Date().toISOString(),
        seen_at:          null,
        attachments:      [],
      }

      qc.setQueryData(['messages', 'chat', id], (old: typeof msgData) => {
        if (!old) return old
        return { ...old, data: [...(old.data ?? []), optimistic] }
      })

      return { prev }
    },

    onError: (_, vars, ctx) => {
      qc.setQueryData(['messages', 'chat', vars.id], ctx?.prev)
      toast.error('Failed to send message')
    },

    onSettled: (_, __, vars) => {
      qc.invalidateQueries({ queryKey: ['messages', 'chat', vars.id] })
      qc.invalidateQueries({ queryKey: ['messages', 'conversations'] })
      qc.invalidateQueries({ queryKey: ['messages', 'unread-count'] })
    },
  })

  async function handleSend() {
    if (!activeId) return
    const text = body.trim()
    const file = pendingFile
    if (!text && !file) return

    setBody('')
    setPendingFile(null)

    if (file) {
      setUploading(true)
      try {
        const msgRes = await messageService.sendMessage(activeId, {
          body: text || '📎 Attachment',
          send_email: sendEmail,
        })
        const msgId = msgRes.data?.id
        if (msgId) {
          await messageService.uploadAttachment(msgId, file)
        }
        qc.invalidateQueries({ queryKey: ['messages', 'chat', activeId] })
        qc.invalidateQueries({ queryKey: ['messages', 'conversations'] })
      } catch {
        toast.error('Failed to send message')
      } finally {
        setUploading(false)
      }
      return
    }

    sendMut.mutate({ id: activeId, body: text, send_email: sendEmail })
  }

  function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      void handleSend()
    }
  }

  /* Delete conversation */
  const deleteMut = useMutation({
    mutationFn: (id: number) => messageService.deleteConversation(id),
    onSuccess: () => {
      toast.success('Conversation deleted')
      setParams({})
      qc.invalidateQueries({ queryKey: ['messages', 'conversations'] })
    },
    onError: () => toast.error('Could not delete conversation'),
  })

  const selectConv = useCallback((id: number) => {
    setParams({ c: String(id) })
    setBody('')
  }, [setParams])

  /* ---------------------------------------------------------------- */
  /* Render                                                            */
  /* ---------------------------------------------------------------- */

  return (
    <>
      <ComposeMessageModal
        open={compose}
        onClose={() => setCompose(false)}
        onSent={(id) => { setCompose(false); setParams({ c: String(id) }) }}
      />

      <div className="flex h-[calc(100vh-5rem)] -mx-5 sm:-mx-6 lg:-mx-8 -mt-6 overflow-hidden rounded-xl border border-ink-200 dark:border-ink-700 bg-white dark:bg-ink-800">

        {/* ---- Left sidebar ---- */}
        <aside className="w-[30%] min-w-[220px] max-w-xs flex flex-col border-r border-ink-100 dark:border-ink-700">
          {/* Header */}
          <div className="px-4 py-3 border-b border-ink-100 dark:border-ink-700 flex items-center justify-between gap-2">
            <h2 className="font-semibold text-sm text-ink-900 dark:text-white">Messages</h2>
            <button
              onClick={() => setCompose(true)}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-primary-600 hover:bg-primary-700 text-white text-xs font-medium transition-colors"
            >
              <Edit className="w-3.5 h-3.5" />
              Compose
            </button>
          </div>

          {/* Search */}
          <div className="px-3 py-2 border-b border-ink-50 dark:border-ink-700/50">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-ink-400" />
              <input
                type="text"
                placeholder="Search conversations…"
                value={search}
                onChange={(e: ChangeEvent<HTMLInputElement>) => setSearch(e.target.value)}
                className="w-full pl-8 pr-3 py-1.5 text-xs rounded-lg bg-ink-50 dark:bg-ink-700 border border-ink-100 dark:border-ink-600 text-ink-900 dark:text-white placeholder-ink-400 dark:placeholder-ink-500 focus:outline-none focus:ring-1 focus:ring-primary-400"
              />
            </div>
          </div>

          {/* Conversation list */}
          <div className="flex-1 overflow-y-auto">
            {loadingConvs ? (
              <div className="px-4 py-8 text-center text-xs text-ink-400">Loading…</div>
            ) : filtered.length === 0 ? (
              <div className="px-4 py-8 text-center text-xs text-ink-400 dark:text-ink-500">
                {search ? 'No conversations match.' : 'No conversations yet.'}
              </div>
            ) : (
              filtered.map(c => (
                <ConversationItem
                  key={c.id}
                  conv={c}
                  active={c.id === activeId}
                  onClick={() => selectConv(c.id)}
                />
              ))
            )}
          </div>
        </aside>

        {/* ---- Main panel ---- */}
        <main className="flex-1 flex flex-col min-w-0">
          {!activeId ? (
            /* Empty state */
            <div className="flex-1 flex flex-col items-center justify-center text-center gap-4 text-ink-400 dark:text-ink-500 px-8">
              <div className="w-16 h-16 rounded-full bg-ink-100 dark:bg-ink-700 flex items-center justify-center">
                <MessageSquare className="w-7 h-7 text-ink-400 dark:text-ink-500" />
              </div>
              <div>
                <p className="text-sm font-medium text-ink-600 dark:text-ink-400">Select a conversation</p>
                <p className="text-xs mt-1">or compose a new message to get started</p>
              </div>
              <button
                onClick={() => setCompose(true)}
                className="btn-primary text-sm"
              >
                Compose
              </button>
            </div>
          ) : (
            <>
              {/* Chat header */}
              <div className="flex items-center justify-between px-5 py-3 border-b border-ink-100 dark:border-ink-700 bg-white dark:bg-ink-800 flex-shrink-0">
                {activeConv ? (
                  <div className="flex items-center gap-3 min-w-0">
                    <Initials name={conversationTitle(activeConv)} size="sm" />
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-ink-900 dark:text-white truncate">
                        {conversationTitle(activeConv)}
                      </p>
                      {participants.length > 0 && (
                        <p className="text-xs text-ink-400 dark:text-ink-500 truncate">
                          {participants.map(p => p.full_name).join(', ')}
                        </p>
                      )}
                      {participants.length > 0 && (
                        <p className="text-[10px] text-ink-300 dark:text-ink-600 truncate">
                          {participants.map(p => p.email).join(' · ')}
                        </p>
                      )}
                    </div>
                  </div>
                ) : (
                  <div />
                )}

                {/* Options */}
                <div ref={menuRef} className="relative">
                  <button
                    onClick={() => setMenuOpen(v => !v)}
                    className="p-2 rounded-lg text-ink-400 hover:text-ink-700 dark:hover:text-white hover:bg-ink-100 dark:hover:bg-ink-700 transition-colors"
                  >
                    <MoreVertical className="w-4 h-4" />
                  </button>
                  {menuOpen && (
                    <div className="absolute right-0 top-full mt-1 w-44 bg-white dark:bg-ink-800 border border-ink-200 dark:border-ink-600 rounded-lg shadow-lg py-1 z-20">
                      <button
                        onClick={() => {
                          setMenuOpen(false)
                          if (confirm('Delete this conversation?')) {
                            deleteMut.mutate(activeId)
                          }
                        }}
                        className="w-full flex items-center gap-2 px-3 py-2 text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                      >
                        <Trash2 className="w-4 h-4" />
                        Delete conversation
                      </button>
                    </div>
                  )}
                </div>
              </div>

              {/* Messages area */}
              <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3 bg-gray-50 dark:bg-ink-900/30">
                {loadingMsgs ? (
                  <div className="text-center py-8 text-xs text-ink-400">Loading messages…</div>
                ) : messages.length === 0 ? (
                  <div className="text-center py-8 text-xs text-ink-400">No messages yet. Say hello!</div>
                ) : (
                  messages.map(msg => (
                    <MessageBubble key={msg.id} msg={msg} mine={msg.sender_id === myId} />
                  ))
                )}
                <div ref={bottomRef} />
              </div>

              {/* Input area */}
              <div className="px-4 py-3 border-t border-ink-100 dark:border-ink-700 bg-white dark:bg-ink-800 flex-shrink-0">
                {/* Pending file indicator */}
                {pendingFile && (
                  <div className="flex items-center gap-2 mb-2 px-1">
                    <Paperclip className="w-3.5 h-3.5 text-primary-500 flex-shrink-0" />
                    <span className="text-xs text-ink-700 dark:text-ink-300 truncate flex-1">{pendingFile.name}</span>
                    <button
                      type="button"
                      onClick={() => setPendingFile(null)}
                      className="text-ink-400 hover:text-red-500 transition-colors text-xs"
                    >
                      ✕
                    </button>
                  </div>
                )}

                {/* Email toggle */}
                <div className="flex items-center gap-2 mb-2">
                  <label className="flex items-center gap-1.5 cursor-pointer text-xs text-ink-500 dark:text-ink-400 select-none">
                    <span
                      onClick={() => setSendEmail(v => !v)}
                      className={cn(
                        'relative inline-flex h-4 w-7 rounded-full transition-colors cursor-pointer',
                        sendEmail ? 'bg-primary-600' : 'bg-ink-200 dark:bg-ink-600',
                      )}
                    >
                      <span className={cn(
                        'inline-block h-3 w-3 rounded-full bg-white shadow mt-0.5 transition-transform',
                        sendEmail ? 'translate-x-3.5 ml-0' : 'translate-x-0.5',
                      )} />
                    </span>
                    Also send by email
                  </label>
                </div>

                {/* Hidden file input */}
                <input
                  ref={fileInputRef}
                  type="file"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0] ?? null
                    setPendingFile(f)
                    e.target.value = ''
                  }}
                />

                <div className="flex items-end gap-2">
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className={cn(
                      'p-2 rounded-lg transition-colors flex-shrink-0',
                      pendingFile
                        ? 'text-primary-600 bg-primary-50 dark:bg-primary-900/20'
                        : 'text-ink-400 hover:text-ink-700 dark:hover:text-white hover:bg-ink-100 dark:hover:bg-ink-700',
                    )}
                    title="Attach file"
                  >
                    <Paperclip className="w-4 h-4" />
                  </button>

                  <textarea
                    ref={textareaRef}
                    rows={1}
                    placeholder="Type a message… (Enter to send, Shift+Enter for new line)"
                    value={body}
                    onChange={(e: ChangeEvent<HTMLTextAreaElement>) => setBody(e.target.value)}
                    onKeyDown={handleKeyDown}
                    className="flex-1 resize-none rounded-xl border border-ink-200 dark:border-ink-600 bg-ink-50 dark:bg-ink-700 text-ink-900 dark:text-white placeholder-ink-400 dark:placeholder-ink-500 px-3.5 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-400 focus:border-transparent transition-colors overflow-hidden"
                    style={{ minHeight: '38px', maxHeight: '120px' }}
                  />

                  <button
                    onClick={() => void handleSend()}
                    disabled={(!body.trim() && !pendingFile) || sendMut.isPending || uploading}
                    className={cn(
                      'flex-shrink-0 w-9 h-9 rounded-xl flex items-center justify-center transition-all',
                      (body.trim() || pendingFile) && !sendMut.isPending && !uploading
                        ? 'bg-primary-600 hover:bg-primary-700 text-white shadow-sm'
                        : 'bg-ink-100 dark:bg-ink-700 text-ink-400 cursor-not-allowed',
                    )}
                  >
                    <Send className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </>
          )}
        </main>
      </div>
    </>
  )
}
