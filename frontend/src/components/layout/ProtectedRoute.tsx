import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useAuthStore } from '@/store/authStore'
import { isSuperadmin } from '@/utils/permissions'

/**
 * Route guard — redirects unauthenticated users to /login.
 * Passes the current path as `?redirect=` so after login they return here.
 *
 * Access model:
 *   - `superadmin` bypasses permission checks (but NOT `requiredRoles`, so
 *     role-bound areas like /applicant stay scoped to their actual audience).
 *   - When `requiredRoles` is set, the user's role must be in the list.
 *   - When `requiredPermissions` is set, the user must hold at least ONE
 *     of the listed RBAC slugs (from their JWT `user.permissions`).
 */
interface Props {
  requiredPermissions?: string | string[]
  requiredRoles?: string | string[]
  /**
   * Also admit anyone assigned to a module (`user.is_teaching`), regardless of
   * role or permission. Used by the teacher workspace so a registrar/HR user who
   * picks up a class can reach it; every page behind it is still scoped
   * server-side to that person's own assignments.
   */
  allowWhenTeaching?: boolean
}

export default function ProtectedRoute({ requiredPermissions, requiredRoles, allowWhenTeaching }: Props) {
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

  // Role gate — evaluated first so role-bound areas aren't bypassed by
  // permissions (including superadmin's blanket permission bypass).
  if (requiredRoles) {
    const roles = Array.isArray(requiredRoles) ? requiredRoles : [requiredRoles]
    if (!roles.includes(user?.role ?? '')) {
      return <Navigate to="/" replace />
    }
  }

  if (requiredPermissions && !isSuperadmin(user)) {
    const required  = Array.isArray(requiredPermissions) ? requiredPermissions : [requiredPermissions]
    const userPerms = user?.permissions || []

    const hasAccess = required.some((p) => userPerms.includes(p))
      || (allowWhenTeaching === true && user?.is_teaching === true)

    if (!hasAccess) {
      return <Navigate to="/" replace />
    }
  }

  return <Outlet />
}
