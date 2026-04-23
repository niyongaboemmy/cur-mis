import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useAuthStore } from '@/store/authStore'

/**
 * Route guard — redirects unauthenticated users to /login.
 * Passes the current path as `?redirect=` so after login they return here.
 * Also checks `requiredPermissions`.
 */
interface Props {
  requiredPermissions?: string | string[]
}

export default function ProtectedRoute({ requiredPermissions }: Props) {
  const { isAuthenticated, user } = useAuthStore((s) => ({
    isAuthenticated: s.isAuthenticated,
    user: s.user
  }))
  const location = useLocation()

  if (!isAuthenticated) {
    return (
      <Navigate
        to={`/login?redirect=${encodeURIComponent(location.pathname + location.search)}`}
        replace
      />
    )
  }

  if (requiredPermissions && user?.role !== 'superadmin') {
    const required = Array.isArray(requiredPermissions) ? requiredPermissions : [requiredPermissions];
    const userPerms = user?.permissions || [];
    
    // Check if user has ANY of the required permissions
    const hasAccess = required.some(p => {
      // Handle pseudo-permissions
      if (p === 'ACCESS_APPLICANT_PORTAL' && user?.role === 'applicant') return true;
      if (p === 'STAFF_ACCESS' && user?.role !== 'applicant') return true;
      
      return userPerms.includes(p);
    });

    if (!hasAccess) {
      // User is authenticated but lacks permission
      return <Navigate to="/" replace />
    }
  }

  return <Outlet />
}
