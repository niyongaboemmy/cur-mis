import { useEffect, useRef } from 'react'
import { useLocation } from 'react-router-dom'
import { useAuthStore } from '@/store/authStore'
import { userActivityService } from '@/services/userActivityService'

const HEARTBEAT_MS = 60_000
const DUPLICATE_VIEW_MS = 5_000

/**
 * Records the signed-in user's activity for the User Activity dashboard:
 * a heartbeat every minute while the tab is visible (keeps the session
 * alive), and a page view on each route change. Failures are ignored so
 * tracking can never disturb the app.
 */
export function useActivityTracking() {
  const userId = useAuthStore((s) => s.user?.id)
  const { pathname } = useLocation()
  const lastView = useRef<{ path: string; at: number } | null>(null)

  useEffect(() => {
    if (!userId) return
    const beat = () => {
      if (document.visibilityState !== 'visible') return
      userActivityService.heartbeat().catch(() => {})
    }
    beat()
    const timer = window.setInterval(beat, HEARTBEAT_MS)
    return () => window.clearInterval(timer)
  }, [userId])

  useEffect(() => {
    if (!userId) return
    const now = Date.now()
    const last = lastView.current
    if (last && last.path === pathname && now - last.at < DUPLICATE_VIEW_MS) return
    lastView.current = { path: pathname, at: now }
    userActivityService.pageView(pathname).catch(() => {})
  }, [userId, pathname])
}
