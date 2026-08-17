import { useRef, useState, useEffect, useCallback } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { AnimatePresence, motion } from 'framer-motion'
import { Bell, X, CheckCheck, AlertTriangle, Info, Wallet, FileText } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { notificationService, type AppNotification } from '@/services/notificationService'
import { cn } from '@/utils/helpers'

function timeAgo(iso: string): string {
  const diff = (Date.now() - new Date(iso).getTime()) / 1000
  if (diff < 60)    return 'just now'
  if (diff < 3600)  return `${Math.floor(diff / 60)}m ago`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
  return `${Math.floor(diff / 86400)}d ago`
}

/** Icon per notification category, with a neutral fallback for unknown types. */
function iconFor(type: string | null) {
  switch (type) {
    case 'FEE_OVERDUE':  return { Icon: Wallet,        tone: 'text-red-500    bg-red-50    dark:bg-red-900/20'    }
    case 'FINE_ISSUED':  return { Icon: AlertTriangle, tone: 'text-amber-500  bg-amber-50  dark:bg-amber-900/20'  }
    case 'DOCUMENT':     return { Icon: FileText,      tone: 'text-blue-500   bg-blue-50   dark:bg-blue-900/20'   }
    default:             return { Icon: Info,          tone: 'text-ink-400    bg-ink-50    dark:bg-ink-800'       }
  }
}

/**
 * Header notification bell.
 *
 * Replaces the previous decorative button, which rendered a permanent unread
 * dot and had no click handler at all — clicking Notifications did nothing
 * while the neighbouring Messages bell opened a dropdown.
 */
export default function NotificationBell() {
  const [open, setOpen] = useState(false)
  const ref      = useRef<HTMLDivElement>(null)
  const navigate = useNavigate()
  const qc       = useQueryClient()

  const { data, isLoading } = useQuery({
    queryKey: ['notifications', 'feed'],
    queryFn:  ({ signal }) => notificationService.getFeed(10, signal).then(r => r.data),
    refetchInterval: 60_000,
    staleTime:       30_000,
  })

  const total  = data?.total  ?? 0
  const recent: AppNotification[] = data?.recent ?? []

  const invalidate = () => qc.invalidateQueries({ queryKey: ['notifications', 'feed'] })

  const markRead    = useMutation({ mutationFn: (id: number) => notificationService.markRead(id), onSuccess: invalidate })
  const markAllRead = useMutation({ mutationFn: () => notificationService.markAllRead(),          onSuccess: invalidate })

  const close = useCallback(() => setOpen(false), [])

  useEffect(() => {
    if (!open) return
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) close()
    }
    function onEsc(e: KeyboardEvent) {
      if (e.key === 'Escape') close()
    }
    document.addEventListener('mousedown', handler)
    document.addEventListener('keydown', onEsc)
    return () => {
      document.removeEventListener('mousedown', handler)
      document.removeEventListener('keydown', onEsc)
    }
  }, [open, close])

  const openNotification = (n: AppNotification) => {
    if (!n.is_read) markRead.mutate(n.id)
    close()
    if (n.link) navigate(n.link)
  }

  return (
    <div ref={ref} className="relative">
      {/* Trigger */}
      <button
        type="button"
        aria-label="Notifications"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen(v => !v)}
        className={cn(
          'relative w-10 h-10 rounded-full border bg-white dark:bg-ink-800 text-ink-600 dark:text-ink-300',
          'hover:text-primary-700 hover:border-primary-200 dark:hover:bg-ink-700 transition-colors',
          'flex items-center justify-center',
          open
            ? 'border-primary-300 dark:border-primary-600 text-primary-700 dark:text-primary-300'
            : 'border-ink-100 dark:border-ink-700',
        )}
      >
        <Bell className="w-[18px] h-[18px]" />
        {/* Badge reflects the real unread count — the old button showed a
            hardcoded dot whether or not anything was waiting. */}
        {total > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center ring-2 ring-white dark:ring-ink-900 leading-none">
            {total > 99 ? '99+' : total}
          </span>
        )}
      </button>

      {/* Popover */}
      <AnimatePresence>
        {open && (
          <motion.div
            key="notif-popover"
            role="menu"
            initial={{ opacity: 0, scale: 0.95, y: -6 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: -6 }}
            transition={{ duration: 0.15, ease: 'easeOut' }}
            className={cn(
              'absolute right-0 top-12 z-50 w-80 rounded-xl shadow-xl border',
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
                    type="button"
                    onClick={() => markAllRead.mutate()}
                    disabled={markAllRead.isPending}
                    title="Mark all as read"
                    className="p-1 rounded-md text-ink-400 hover:text-primary-600 hover:bg-ink-100 dark:hover:bg-ink-700 transition-colors disabled:opacity-50"
                  >
                    <CheckCheck className="w-4 h-4" />
                  </button>
                )}
                <button
                  type="button"
                  onClick={close}
                  aria-label="Close notifications"
                  className="p-1 rounded-md text-ink-400 hover:text-ink-700 dark:hover:text-white hover:bg-ink-100 dark:hover:bg-ink-700 transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Items */}
            <div className="flex-1 overflow-y-auto max-h-80 divide-y divide-ink-50 dark:divide-ink-700/50">
              {isLoading ? (
                <p className="px-4 py-6 text-sm text-center text-ink-400 dark:text-ink-500">
                  Loading…
                </p>
              ) : recent.length === 0 ? (
                /* The reported bug was "no visible response" — an explicit empty
                   state is what tells the user the feature actually works. */
                <p className="px-4 py-6 text-sm text-center text-ink-400 dark:text-ink-500">
                  You have no notifications
                </p>
              ) : (
                recent.map(n => {
                  const { Icon, tone } = iconFor(n.type)
                  return (
                    <button
                      key={n.id}
                      type="button"
                      role="menuitem"
                      onClick={() => openNotification(n)}
                      className={cn(
                        'w-full text-left flex items-start gap-3 px-4 py-3 transition-colors',
                        'hover:bg-ink-50 dark:hover:bg-ink-700/40',
                        !n.is_read && 'bg-primary-50/40 dark:bg-primary-900/10',
                      )}
                    >
                      <span className={cn('inline-flex items-center justify-center w-8 h-8 rounded-full flex-shrink-0', tone)}>
                        <Icon className="w-4 h-4" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="flex items-baseline justify-between gap-2">
                          <span
                            className={cn(
                              'text-xs truncate',
                              n.is_read
                                ? 'text-ink-600 dark:text-ink-300'
                                : 'font-semibold text-ink-900 dark:text-white',
                            )}
                          >
                            {n.message}
                          </span>
                          <span className="text-[10px] text-ink-400 dark:text-ink-500 flex-shrink-0">
                            {timeAgo(n.created_at)}
                          </span>
                        </span>
                      </span>
                      {!n.is_read && (
                        <span className="w-2 h-2 rounded-full bg-primary-500 flex-shrink-0 mt-1.5" aria-label="Unread" />
                      )}
                    </button>
                  )
                })
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
