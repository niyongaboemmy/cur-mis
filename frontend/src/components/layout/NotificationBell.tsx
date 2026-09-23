import { useCallback, useEffect, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { AnimatePresence, motion } from 'framer-motion'
import {
  AlertTriangle,
  Bell,
  CheckCheck,
  CheckCircle2,
  Info,
  Loader2,
  X,
  XCircle,
} from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import {
  notificationService,
  type AppNotification,
  type NotificationSeverity,
} from '@/services/notificationService'
import ConfirmDialog from '@/components/ui/ConfirmDialog'
import { cn } from '@/utils/helpers'

function timeAgo(iso: string): string {
  const diff = (Date.now() - new Date(iso).getTime()) / 1000
  if (diff < 60) return 'just now'
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
  if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`
  return new Date(iso).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })
}

const SEVERITY: Record<
  NotificationSeverity,
  { icon: typeof Info; dot: string; tint: string }
> = {
  info: {
    icon: Info,
    dot: 'bg-primary-500',
    tint: 'text-primary-600 dark:text-primary-400 bg-primary-50 dark:bg-primary-900/30',
  },
  success: {
    icon: CheckCircle2,
    dot: 'bg-emerald-500',
    tint: 'text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/30',
  },
  warning: {
    icon: AlertTriangle,
    dot: 'bg-amber-500',
    tint: 'text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/30',
  },
  danger: {
    icon: XCircle,
    dot: 'bg-red-500',
    tint: 'text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/30',
  },
}

/**
 * System notification bell — approval outcomes, action-required prompts and
 * anything else a module pushes through NotificationService.
 *
 * Distinct from MessageNotificationBell, which is person-to-person messaging.
 * Polls the deliberately cheap /unread-count endpoint; opening an item marks it
 * read and follows its deep link.
 */
export default function NotificationBell() {
  const [open, setOpen] = useState(false)
  const [confirmingAll, setConfirmingAll] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const navigate = useNavigate()
  const qc = useQueryClient()

  const { data, isLoading } = useQuery({
    queryKey: ['notifications', 'unread-count'],
    queryFn: ({ signal }) => notificationService.unreadCount(signal).then(r => r.data),
    refetchInterval: 30_000,
    staleTime: 15_000,
  })

  const total = data?.total ?? 0
  const recent = data?.recent ?? []

  const refresh = useCallback(() => {
    qc.invalidateQueries({ queryKey: ['notifications'] })
  }, [qc])

  const markRead = useMutation({
    mutationFn: (id: number) => notificationService.markRead(id),
    onSuccess: refresh,
  })

  const markAll = useMutation({
    mutationFn: () => notificationService.markAllRead(),
    onSuccess: () => { setConfirmingAll(false); refresh() },
  })

  const close = useCallback(() => setOpen(false), [])

  useEffect(() => {
    if (!open) return
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) close()
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') close()
    }
    document.addEventListener('mousedown', onClick)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onClick)
      document.removeEventListener('keydown', onKey)
    }
  }, [open, close])

  /** Open the thing the notification is about, and stop nagging about it. */
  function openItem(item: AppNotification) {
    markRead.mutate(item.id)
    close()
    if (item.link) navigate(item.link)
  }

  return (
    <div ref={ref} className="relative">
      <button
        aria-label={total > 0 ? `Notifications (${total} unread)` : 'Notifications'}
        onClick={() => setOpen(v => !v)}
        className={cn(
          'relative h-9 w-9 rounded-xl flex items-center justify-center transition-colors active:scale-95',
          open
            ? 'bg-brand/10 text-brand dark:bg-brand/25 dark:text-gold-400'
            : 'text-ink-500 hover:text-ink-900 hover:bg-ink-100 dark:text-ink-300 dark:hover:bg-ink-700 dark:hover:text-white',
        )}
      >
        <Bell className="w-[18px] h-[18px]" />
        {total > 0 && (
          <span className="absolute top-0.5 right-0.5 min-w-[16px] h-[16px] px-1 rounded-full bg-red-500 text-white text-[9px] font-bold flex items-center justify-center ring-2 ring-[rgb(var(--bg-app))] dark:ring-ink-900 leading-none">
            {total > 99 ? '99+' : total}
          </span>
        )}
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            key="notif-popover"
            initial={{ opacity: 0, scale: 0.95, y: -6 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: -6 }}
            transition={{ duration: 0.15, ease: 'easeOut' }}
            className={cn(
              'absolute right-0 top-[calc(100%+8px)] z-50 w-[min(22rem,calc(100vw-1.5rem))] rounded-xl shadow-xl border',
              'bg-white dark:bg-ink-800 border-ink-100 dark:border-ink-700',
              'flex flex-col overflow-hidden',
            )}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-ink-100 dark:border-ink-700">
              <span className="text-sm font-semibold text-ink-900 dark:text-white">
                Notifications
                {total > 0 && (
                  <span className="ml-2 inline-flex items-center px-1.5 py-0.5 rounded-full bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 text-[10px] font-bold">
                    {total} new
                  </span>
                )}
              </span>
              <div className="flex items-center gap-1">
                {total > 0 && (
                  <button
                    onClick={() => setConfirmingAll(true)}
                    disabled={markAll.isPending}
                    title="Mark all as read"
                    className="p-1 rounded-md text-ink-400 hover:text-primary-600 hover:bg-ink-100 dark:hover:bg-ink-700 transition-colors disabled:opacity-50"
                  >
                    {markAll.isPending
                      ? <Loader2 className="w-4 h-4 animate-spin" />
                      : <CheckCheck className="w-4 h-4" />}
                  </button>
                )}
                <button
                  onClick={close}
                  className="p-1 rounded-md text-ink-400 hover:text-ink-700 dark:hover:text-white hover:bg-ink-100 dark:hover:bg-ink-700 transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Items */}
            <div className="flex-1 overflow-y-auto max-h-80 divide-y divide-ink-50 dark:divide-ink-700/50">
              {isLoading ? (
                <div className="px-4 py-8 text-center">
                  <Loader2 className="w-5 h-5 animate-spin mx-auto text-primary-500" />
                </div>
              ) : recent.length === 0 ? (
                <div className="px-4 py-8 text-center">
                  <Bell className="w-8 h-8 mx-auto text-ink-200 dark:text-ink-700 mb-2" />
                  <p className="text-sm text-ink-400 dark:text-ink-500">You're all caught up</p>
                </div>
              ) : (
                recent.map(item => {
                  const look = SEVERITY[item.severity] ?? SEVERITY.info
                  const Icon = look.icon
                  return (
                    <button
                      key={item.id}
                      onClick={() => openItem(item)}
                      className="w-full text-left flex items-start gap-3 px-4 py-3 hover:bg-ink-50 dark:hover:bg-ink-700/40 transition-colors"
                    >
                      <span
                        className={cn(
                          'w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0',
                          look.tint,
                        )}
                      >
                        <Icon className="w-4 h-4" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-baseline justify-between gap-2">
                          <span className="text-xs font-semibold text-ink-900 dark:text-white truncate">
                            {item.title ?? 'Notification'}
                          </span>
                          <span className="text-[10px] text-ink-400 dark:text-ink-500 flex-shrink-0">
                            {timeAgo(item.created_at)}
                          </span>
                        </div>
                        <p className="text-xs text-ink-500 dark:text-ink-400 mt-0.5 line-clamp-2">
                          {item.message}
                        </p>
                      </div>
                      <span
                        className={cn('w-2 h-2 rounded-full flex-shrink-0 mt-1.5', look.dot)}
                        aria-hidden
                      />
                    </button>
                  )
                })
              )}
            </div>

            {/* Footer */}
            <div className="px-4 py-3 border-t border-ink-100 dark:border-ink-700 bg-ink-50/50 dark:bg-ink-900/30">
              <button
                onClick={() => { close(); navigate('/notifications') }}
                className="block w-full text-center text-sm font-medium text-primary-600 dark:text-primary-400 hover:text-primary-800 dark:hover:text-primary-300 transition-colors"
              >
                View all notifications →
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {confirmingAll && (
        <ConfirmDialog
          open
          variant="warning"
          onClose={() => setConfirmingAll(false)}
          onConfirm={() => markAll.mutate()}
          loading={markAll.isPending}
          title="Mark everything as read?"
          confirmLabel="Yes, mark all read"
          message={`This clears all ${total} unread notification${total === 1 ? '' : 's'}.`}
          details={
            <p className="text-[12px] text-ink-500 dark:text-ink-400 rounded-lg bg-ink-50 dark:bg-ink-900/30 px-3 py-2">
              Anything asking for a decision stops being flagged — the requests
              themselves stay in your approval queue.
            </p>
          }
        />
      )}
    </div>
  )
}
