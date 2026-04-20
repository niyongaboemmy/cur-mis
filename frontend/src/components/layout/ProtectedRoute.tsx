import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useAuthStore } from '@/store/authStore'

/**
 * Route guard — redirects unauthenticated users to /login.
 * Passes the current path as `?redirect=` so after login they return here.
 *
 * Usage in App.tsx:
 *   <Route element={<ProtectedRoute />}>
 *     <Route path="/" element={<HomePage />} />
 *   </Route>
 */
export default function ProtectedRoute() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated)
  const location        = useLocation()

  if (!isAuthenticated) {
    return (
      <Navigate
        to={`/login?redirect=${encodeURIComponent(location.pathname + location.search)}`}
        replace
      />
    )
  }

  return <Outlet />
}
