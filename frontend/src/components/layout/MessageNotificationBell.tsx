import { useRef, useState, useEffect, useCallback } from 'react'
import { useQuery } from '@tanstack/react-query'
import { AnimatePresence, motion } from 'framer-motion'
import { MessageSquare, X } from 'lucide-react'
import { Link } from 'react-router-dom'
import { messageService } from '@/services/messageService'
import { cn } from '@/utils/helpers'

function timeAgo(iso: string): string {
  const diff = (Date.now() - new Date(iso).getTime()) / 1000
  if (diff < 60)  return 'just now'
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
  return `${Math.floor(diff / 86400)}d ago`
}

function Initials({ name }: { name: string }) {
  const parts = name.trim().split(' ')
  const letters = parts.length > 1
    ? (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
    : name.slice(0, 2).toUpperCase()
  return (
    <span className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-primary-100 dark:bg-primary-900/40 text-primary-700 dark:text-primary-300 text-xs font-semibold flex-shrink-0">
      {letters}
    </span>
  )
}

export default function MessageNotificationBell() {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  const { data } = useQuery({
    queryKey: ['messages', 'unread-count'],
    queryFn:  () => messageService.getUnreadCount().then(r => r.data),
    refetchInterval: 30_000,
    staleTime: 15_000,
  })

  const total  = data?.total  ?? 0
  const recent = data?.recent ?? []

  const close = useCallback(() => setOpen(false), [])

  useEffect(() => {
    if (!open) return
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) close()
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open, close])

  return (
    <div ref={ref} className="relative">
      {/* Trigger */}
      <button
        aria-label="Messages"
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
        <MessageSquare className="w-[18px] h-[18px]" />
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
            key="msg-popover"
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
                Messages
                {total > 0 && (
                  <span className="ml-2 inline-flex items-center px-1.5 py-0.5 rounded-full bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 text-[10px] font-bold">
                    {total} unread
                  </span>
                )}
              </span>
              <button
                onClick={close}
                className="p-1 rounded-md text-ink-400 hover:text-ink-700 dark:hover:text-white hover:bg-ink-100 dark:hover:bg-ink-700 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Items */}
            <div className="flex-1 overflow-y-auto max-h-72 divide-y divide-ink-50 dark:divide-ink-700/50">
              {recent.length === 0 ? (
                <p className="px-4 py-6 text-sm text-center text-ink-400 dark:text-ink-500">
                  No unread messages
                </p>
              ) : (
                recent.map(item => (
                  <Link
                    key={item.conversation_id}
                    to={`/messages?c=${item.conversation_id}`}
                    onClick={close}
                    className="flex items-start gap-3 px-4 py-3 hover:bg-ink-50 dark:hover:bg-ink-700/40 transition-colors"
                  >
                    <Initials name={item.sender_name} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline justify-between gap-2">
                        <span className="text-xs font-semibold text-ink-900 dark:text-white truncate">
                          {item.sender_name}
                        </span>
                        <span className="text-[10px] text-ink-400 dark:text-ink-500 flex-shrink-0">
                          {timeAgo(item.created_at)}
                        </span>
                      </div>
                      {item.subject && (
                        <p className="text-[11px] font-medium text-primary-600 dark:text-primary-400 truncate">
                          {item.subject}
                        </p>
                      )}
                      <p className="text-xs text-ink-500 dark:text-ink-400 truncate mt-0.5">
                        {item.body}
                      </p>
                    </div>
                  </Link>
                ))
              )}
            </div>

            {/* Footer */}
            <div className="px-4 py-3 border-t border-ink-100 dark:border-ink-700 bg-ink-50/50 dark:bg-ink-900/30">
              <Link
                to="/messages"
                onClick={close}
                className="block w-full text-center text-sm font-medium text-primary-600 dark:text-primary-400 hover:text-primary-800 dark:hover:text-primary-300 transition-colors"
              >
                View all messages →
              </Link>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
