import { useAuthStore } from '@/store/authStore'

interface UserLike {
  role?: string
  role_name?: string
  permissions?: string[]
}

/**
 * The only blanket permission bypass. Deliberately excludes 'admin' — that
 * role's near-full access comes from its actual `permissions[]` grants, not
 * a name-string special case (see RBAC_PERMISSIONS_AUDIT.md Finding A: a
 * role renamed to 'admin' must not inherit a bypass).
 */
export function isSuperadmin(user?: UserLike | null): boolean {
  return (user?.role ?? user?.role_name ?? '') === 'superadmin'
}

function hasAnyPermission(user: UserLike | null | undefined, slugs: string[]): boolean {
  if (isSuperadmin(user)) return true
  const userPerms = user?.permissions || []
  return slugs.some((p) => userPerms.includes(p))
}

/** True when the current user holds `slug` (or is superadmin). */
export function usePermission(slug: string): boolean {
  const user = useAuthStore((s) => s.user)
  return hasAnyPermission(user, [slug])
}

/** True when the current user holds at least one of `slugs` (or is superadmin). */
export function useAnyPermission(slugs: string[]): boolean {
  const user = useAuthStore((s) => s.user)
  return hasAnyPermission(user, slugs)
}
