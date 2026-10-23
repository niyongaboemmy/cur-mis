import { useEffect, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import Modal from '@/components/ui/Modal'
import {
  notificationService,
  type AppNotification,
  type NotificationSeverity,
} from '@/services/notificationService'
import { useAuthStore } from '@/store/authStore'
import { cn, timeAgo } from '@/utils/helpers'

const DOT: Record<NotificationSeverity, string> = {
  info:    'bg-primary-500',
  success: 'bg-emerald-500',
  warning: 'bg-amber-500',
  danger:  'bg-red-500',
}

/**
 * Shows the signed-in user's unread notifications once per browser session,
 * right after they open the app, so nothing waiting for them goes unseen
 * behind the bell.
 *
 * "Once per session" is tracked in sessionStorage keyed by user, so a new
 * sign-in on the same computer gets its own summary. Storage can be blocked
 * (private windows); the ref still stops a second opening in that case.
 */
export default function LaunchNotificationsDigest() {
  const user = useAuthStore(s => s.user)
  const navigate = useNavigate()
  const qc = useQueryClient()
  const [open, setOpen] = useState(false)
  const shown = useRef(false)
  const storageKey = `cur-mis-digest-shown:${user?.id ?? 'anon'}`

  const { data } = useQuery({
    queryKey: ['notifications', 'digest'],
    queryFn: ({ signal }) =>
      notificationService.list({ unread: 1, per_page: 10 }, signal).then(r => r.data),
    // One fetch per launch: the bell keeps the live count, this only summarises it.
    staleTime: Infinity,
    refetchOnWindowFocus: false,
  })

  useEffect(() => {
    if (!data || data.unread_total === 0 || shown.current) return
    shown.current = true
    try {
      if (sessionStorage.getItem(storageKey)) return
      sessionStorage.setItem(storageKey, '1')
    } catch {
      // Storage unavailable: the ref above still limits this to one opening.
    }
    setOpen(true)
  }, [data, storageKey])

  const refresh = () => qc.invalidateQueries({ queryKey: ['notifications'] })

  const markRead = useMutation({
    mutationFn: (id: number) => notificationService.markRead(id),
    onSettled: refresh,
  })

  const markAll = useMutation({
    mutationFn: () => notificationService.markAllRead(),
    onSuccess: () => setOpen(false),
    onSettled: refresh,
  })

  function openItem(item: AppNotification) {
    markRead.mutate(item.id)
    setOpen(false)
    if (item.link) navigate(item.link)
  }

  const items = data?.data ?? []
  const total = data?.unread_total ?? 0

  return (
    <Modal
      open={open}
      onClose={() => setOpen(false)}
      title={`You have ${total} unread notification${total === 1 ? '' : 's'}`}
      size="md"
      footer={
        <div className="flex w-full flex-wrap items-center justify-between gap-2">
          <button
            onClick={() => { setOpen(false); navigate('/notifications') }}
            className="text-sm font-medium text-primary-600 dark:text-primary-400 hover:text-primary-800 dark:hover:text-primary-300"
          >
            View all
          </button>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setOpen(false)}
              className="rounded-lg px-3 py-2 text-sm font-medium text-ink-600 hover:bg-ink-100 dark:text-ink-300 dark:hover:bg-ink-700"
            >
              Later
            </button>
            <button
              onClick={() => markAll.mutate()}
              disabled={markAll.isPending}
              className="rounded-lg bg-brand px-3 py-2 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-60"
            >
              Mark all read
            </button>
          </div>
        </div>
      }
    >
      <ul className="-my-2 divide-y divide-ink-100 dark:divide-ink-700">
        {items.map(item => (
          <li key={item.id}>
            <button
              onClick={() => openItem(item)}
              className="flex w-full items-start gap-3 rounded-lg px-1 py-3 text-left hover:bg-ink-50 dark:hover:bg-ink-700/40"
            >
              <span
                className={cn(
                  'mt-1.5 h-2 w-2 shrink-0 rounded-full',
                  DOT[item.severity] ?? DOT.info,
                )}
              />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-ink-900 dark:text-white">
                  {item.title ?? 'Notification'}
                </p>
                <p className="line-clamp-2 text-xs text-ink-500 dark:text-ink-400">{item.message}</p>
                <p className="mt-0.5 text-[11px] text-ink-400">{timeAgo(item.created_at)}</p>
              </div>
            </button>
          </li>
        ))}
      </ul>

      {total > items.length && (
        <p className="pt-3 text-xs text-ink-400">
          Showing the {items.length} most recent. The rest are in the bell.
        </p>
      )}
    </Modal>
  )
}
