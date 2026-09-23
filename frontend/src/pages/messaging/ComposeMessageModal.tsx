import { useState, useEffect, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { X, Search, Mail, Users, User, Radio, CheckCircle2 } from 'lucide-react'
import toast from 'react-hot-toast'
import Modal from '@/components/ui/Modal'
import { messageService } from '@/services/messageService'
import type { RecipientOption } from '@/types/messaging'
import { cn } from '@/utils/helpers'
import { PERMISSIONS } from '@/constants/permissions'
import { useAnyPermission } from '@/utils/permissions'

/* ------------------------------------------------------------------ */
/* Constants                                                            */
/* ------------------------------------------------------------------ */

/**
 * All role groups. `MessageController::canBroadcast()` requires
 * BROADCAST_MESSAGES or MANAGE_MESSAGES before any of these will send, so the
 * mode is hidden without them — otherwise the permission's only visible effect
 * is a failed send after the user has already written the message.
 */
const ALL_ROLE_GROUPS: RecipientOption[] = [
  { id: 'all_students',   label: 'All Students',   type: 'role' },
  { id: 'all_lecturers',  label: 'All Lecturers',  type: 'role' },
  { id: 'all_applicants', label: 'All Applicants', type: 'role' },
  { id: 'hr_department',  label: 'HR Department',  type: 'role' },
  { id: 'finance',        label: 'Finance Team',   type: 'role' },
  { id: 'registrar_team', label: 'Registrar Team', type: 'role' },
  { id: 'all_staff',      label: 'All Staff',      type: 'role' },
  { id: 'all_users',      label: 'All Users',      type: 'role' },
]

type Mode = 'individual' | 'group' | 'role'

const MODES: { id: Mode; icon: typeof User; label: string; hint: string }[] = [
  { id: 'individual', icon: User,  label: 'Individual', hint: 'Direct message to one person' },
  { id: 'group',      icon: Users, label: 'Group',      hint: 'Message multiple people at once' },
  { id: 'role',       icon: Radio, label: 'By Role',    hint: 'Broadcast to everyone in a role' },
]

/* ------------------------------------------------------------------ */
/* Helper hook                                                          */
/* ------------------------------------------------------------------ */

function useDebounce<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay)
    return () => clearTimeout(t)
  }, [value, delay])
  return debounced
}

/* ------------------------------------------------------------------ */
/* Props                                                                */
/* ------------------------------------------------------------------ */

interface Props {
  open:    boolean
  onClose: () => void
  onSent?: (conversationId: number) => void
}

/* ------------------------------------------------------------------ */
/* Component                                                            */
/* ------------------------------------------------------------------ */

export default function ComposeMessageModal({ open, onClose, onSent }: Props) {
  const qc = useQueryClient()

  /* Form state */
  const canBroadcast = useAnyPermission([
    PERMISSIONS.BROADCAST_MESSAGES,
    PERMISSIONS.MANAGE_MESSAGES,
  ])
  const availableModes = canBroadcast ? MODES : MODES.filter(m => m.id !== 'role')

  const [mode, setMode]                       = useState<Mode>('individual')
  const [selectedRecipients, setSelectedRecipients] = useState<RecipientOption[]>([])
  const [selectedRole, setSelectedRole]       = useState<RecipientOption | null>(null)
  const [recipientSearch, setRecipientSearch] = useState('')
  const [subject, setSubject]                 = useState('')
  const [body, setBody]                       = useState('')
  const [sendEmail, setSendEmail]             = useState(false)
  const [showDropdown, setShowDropdown]       = useState(false)

  const debouncedQ = useDebounce(recipientSearch, 300)
  const searchRef  = useRef<HTMLDivElement>(null)

  /* Switch mode → clear recipient state */
  function switchMode(m: Mode) {
    setMode(m)
    setSelectedRecipients([])
    setSelectedRole(null)
    setRecipientSearch('')
    setShowDropdown(false)
  }

  /* Recipient autocomplete query (individual + group modes) */
  const { data: searchResults, isFetching: searching } = useQuery({
    queryKey: ['messages', 'recipients', debouncedQ],
    queryFn:  () => messageService.searchRecipients(debouncedQ).then(r =>
      (r.data ?? []).filter(o => o.type === 'user')  // roles handled separately in role mode
    ),
    enabled:  debouncedQ.length >= 2 && mode !== 'role',
    staleTime: 10_000,
  })

  /* Close dropdown on outside click */
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
        setShowDropdown(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  /* Reset completely when modal is closed */
  function handleClose() {
    setMode('individual')
    setSelectedRecipients([])
    setSelectedRole(null)
    setRecipientSearch('')
    setSubject('')
    setBody('')
    setSendEmail(false)
    setShowDropdown(false)
    onClose()
  }

  /* Recipient selection */
  function selectRecipient(opt: RecipientOption) {
    if (mode === 'individual') {
      // Replace current selection
      setSelectedRecipients([opt])
    } else {
      // Group: add if not already included
      if (!selectedRecipients.find(r => r.id === opt.id)) {
        setSelectedRecipients(prev => [...prev, opt])
      }
    }
    setRecipientSearch('')
    setShowDropdown(false)
  }

  function removeRecipient(id: number | string) {
    setSelectedRecipients(prev => prev.filter(r => r.id !== id))
  }

  /* Send mutation */
  const sendMutation = useMutation({
    mutationFn: () => {
      const recipients: (number | string)[] =
        mode === 'role'
          ? [selectedRole!.id]
          : selectedRecipients.map(r => r.id)

      return messageService.createConversation({
        recipients,
        subject:    subject.trim() || undefined,
        body:       body.trim(),
        send_email: sendEmail,
        type:       mode === 'individual' ? 'direct' : 'broadcast',
      })
    },
    onSuccess: (res) => {
      toast.success('Message sent')
      qc.invalidateQueries({ queryKey: ['messages'] })
      const convId = res.data?.conversation?.id
      if (convId) onSent?.(convId)
      handleClose()
    },
    onError: (e: unknown) => {
      const msg = (e as { response?: { data?: { message?: string } } })?.response?.data?.message
      toast.error(msg ?? 'Failed to send message')
    },
  })

  /* Guard: can the send button be enabled? */
  const hasRecipient =
    mode === 'role'
      ? selectedRole !== null
      : selectedRecipients.length > 0
  const canSend = hasRecipient && body.trim().length > 0

  /* Dropdown: filter out already-selected users */
  const dropdownOptions = (searchResults ?? []).filter(
    o => !selectedRecipients.find(s => s.id === o.id),
  )

  /* ------------------------------------------------------------------ */
  /* Render                                                               */
  /* ------------------------------------------------------------------ */

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title="New Message"
      size="lg"
      footer={
        <>
          <button onClick={handleClose} className="btn-secondary">Cancel</button>
          <button
            onClick={() => sendMutation.mutate()}
            disabled={!canSend || sendMutation.isPending}
            className="btn-primary disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {sendMutation.isPending ? 'Sending…' : 'Send Message'}
          </button>
        </>
      }
    >
      <div className="space-y-5">

        {/* ── Mode selector ── */}
        <div>
          <label className="label mb-2">Message type</label>
          <div className="grid grid-cols-3 gap-2">
            {availableModes.map(m => {
              const Icon    = m.icon
              const active  = mode === m.id
              return (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => switchMode(m.id)}
                  className={cn(
                    'flex flex-col items-center gap-1.5 px-3 py-3 rounded-xl border-2 text-center transition-all',
                    active
                      ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/20 text-primary-700 dark:text-primary-300'
                      : 'border-ink-200 dark:border-ink-600 text-ink-500 dark:text-ink-400 hover:border-ink-300 dark:hover:border-ink-500 hover:bg-ink-50 dark:hover:bg-ink-700/30',
                  )}
                >
                  <Icon className={cn('w-5 h-5', active ? 'text-primary-600 dark:text-primary-400' : '')} />
                  <span className="text-xs font-semibold">{m.label}</span>
                  <span className="text-[10px] leading-tight opacity-70 hidden sm:block">{m.hint}</span>
                </button>
              )
            })}
          </div>
        </div>

        {/* ── Recipient area — changes by mode ── */}
        <div>
          <label className="label">
            {mode === 'individual' && 'To (person)'}
            {mode === 'group'      && 'To (people)'}
            {mode === 'role'       && 'To (role group)'}
          </label>

          {/* INDIVIDUAL & GROUP — search box with chips */}
          {mode !== 'role' && (
            <div ref={searchRef} className="relative">
              {/* Selected chips */}
              {selectedRecipients.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mb-2">
                  {selectedRecipients.map(r => (
                    <span
                      key={String(r.id)}
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-primary-100 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300"
                    >
                      <User className="w-3 h-3" />
                      {r.label}
                      <button
                        type="button"
                        onClick={() => removeRecipient(r.id)}
                        className="ml-0.5 hover:opacity-70 transition-opacity"
                        aria-label={`Remove ${r.label}`}
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </span>
                  ))}
                </div>
              )}

              {/* Hide search when individual already has 1 recipient */}
              {!(mode === 'individual' && selectedRecipients.length === 1) && (
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-400" />
                  <input
                    type="text"
                    placeholder={
                      mode === 'individual'
                        ? 'Search by name or email…'
                        : 'Add a person by name or email…'
                    }
                    value={recipientSearch}
                    onChange={e => { setRecipientSearch(e.target.value); setShowDropdown(true) }}
                    onFocus={() => { if (debouncedQ.length >= 2) setShowDropdown(true) }}
                    className="input pl-9 w-full"
                  />
                  {searching && (
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] text-ink-400">
                      Searching…
                    </span>
                  )}
                </div>
              )}

              {/* Individual — change link */}
              {mode === 'individual' && selectedRecipients.length === 1 && (
                <button
                  type="button"
                  onClick={() => { setSelectedRecipients([]); setRecipientSearch('') }}
                  className="text-xs text-primary-600 dark:text-primary-400 hover:underline mt-1"
                >
                  Change recipient
                </button>
              )}

              {/* Dropdown results */}
              {showDropdown && dropdownOptions.length > 0 && (
                <div className="absolute z-20 top-full mt-1 left-0 right-0 bg-white dark:bg-ink-800 border border-ink-200 dark:border-ink-600 rounded-lg shadow-lg max-h-52 overflow-y-auto">
                  {dropdownOptions.map(opt => (
                    <button
                      key={String(opt.id)}
                      type="button"
                      onMouseDown={() => selectRecipient(opt)}
                      className="w-full flex items-center gap-2.5 px-3 py-2.5 text-left text-sm hover:bg-ink-50 dark:hover:bg-ink-700 transition-colors"
                    >
                      <span className="w-7 h-7 rounded-full bg-primary-100 dark:bg-primary-900/40 flex items-center justify-center text-[10px] font-bold text-primary-700 dark:text-primary-300 flex-shrink-0">
                        {opt.label.slice(0, 2).toUpperCase()}
                      </span>
                      <span className="font-medium text-ink-900 dark:text-white">{opt.label}</span>
                    </button>
                  ))}
                </div>
              )}

              {showDropdown && debouncedQ.length >= 2 && !searching && dropdownOptions.length === 0 && (
                <div className="absolute z-20 top-full mt-1 left-0 right-0 bg-white dark:bg-ink-800 border border-ink-200 dark:border-ink-600 rounded-lg shadow-lg px-4 py-3 text-sm text-ink-400 dark:text-ink-500">
                  No people found for "{debouncedQ}"
                </div>
              )}
            </div>
          )}

          {/* ROLE — card grid */}
          {mode === 'role' && (
            <div className="grid grid-cols-2 gap-2 mt-1">
              {ALL_ROLE_GROUPS.map(group => {
                const active = selectedRole?.id === group.id
                return (
                  <button
                    key={String(group.id)}
                    type="button"
                    onClick={() => setSelectedRole(active ? null : group)}
                    className={cn(
                      'flex items-center gap-3 px-3 py-3 rounded-xl border-2 text-left transition-all w-full',
                      active
                        ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/20'
                        : 'border-ink-200 dark:border-ink-600 hover:border-ink-300 dark:hover:border-ink-500 hover:bg-ink-50 dark:hover:bg-ink-700/30',
                    )}
                  >
                    <span className={cn(
                      'w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 transition-colors',
                      active
                        ? 'bg-primary-600 text-white'
                        : 'bg-ink-100 dark:bg-ink-700 text-ink-500 dark:text-ink-400',
                    )}>
                      <Users className="w-4 h-4" />
                    </span>
                    <span className={cn(
                      'text-sm font-medium flex-1 leading-tight',
                      active ? 'text-primary-700 dark:text-primary-300' : 'text-ink-800 dark:text-ink-200',
                    )}>
                      {group.label}
                    </span>
                    {active && (
                      <CheckCircle2 className="w-4 h-4 text-primary-600 dark:text-primary-400 flex-shrink-0" />
                    )}
                  </button>
                )
              })}
            </div>
          )}
        </div>

        {/* ── Subject ── */}
        <div>
          <label className="label">
            Subject{' '}
            <span className="text-ink-400 font-normal">(optional)</span>
          </label>
          <input
            type="text"
            placeholder="Message subject…"
            value={subject}
            onChange={e => setSubject(e.target.value)}
            className="input w-full"
          />
        </div>

        {/* ── Body ── */}
        <div>
          <label className="label">Message</label>
          <textarea
            rows={4}
            placeholder="Write your message…"
            value={body}
            onChange={e => setBody(e.target.value)}
            className="input w-full resize-none"
          />
        </div>

        {/* ── Email toggle ── */}
        <label className="flex items-center gap-3 cursor-pointer select-none">
          <span
            onClick={() => setSendEmail(v => !v)}
            className={cn(
              'relative inline-flex h-5 w-9 flex-shrink-0 rounded-full transition-colors duration-200 ease-in-out cursor-pointer',
              sendEmail ? 'bg-primary-600' : 'bg-ink-200 dark:bg-ink-600',
            )}
          >
            <span className={cn(
              'pointer-events-none inline-block h-4 w-4 rounded-full bg-white shadow ring-0 transition-transform duration-200 ease-in-out mt-0.5',
              sendEmail ? 'translate-x-4 ml-0.5' : 'translate-x-0.5',
            )} />
          </span>
          <div className="flex items-center gap-1.5 text-sm text-ink-700 dark:text-ink-300">
            <Mail className="w-4 h-4 text-ink-400" />
            Send a copy to recipient's email
          </div>
        </label>

      </div>
    </Modal>
  )
}
