import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import { useEffect, useState } from 'react'
import { AUTH_STORAGE_KEY } from '@/constants'

export interface AuthUser {
  id:           number | string
  email:        string
  full_name:    string
  username?:    string
  phone?:       string | null
  photo?:       string | null
  role?:        string
  role_name?:   string
  role_id?:     number
  permissions?: string[]
  is_applicant?: boolean
  /** True when this account is assigned at least one module. Teaching access
   *  follows the assignment, not the role — see TeacherPortalMiddleware. */
  is_teaching?: boolean
  /** When true (set from roles.enforce_campus_scope), the UI must hide
   *  any "all campuses" affordances and limit campus filters to
   *  assigned_campuses only. */
  enforce_campus_scope?: boolean
  /** Campuses this user is assigned to via user_campus_assignments. */
  assigned_campuses?: Array<{
    id:       number
    name:     string
    code:     string | null
    location: string | null
  }>
}

interface AuthState {
  user:            AuthUser | null
  token:           string | null
  isAuthenticated: boolean

  setAuth: (user: AuthUser, token: string) => void
  logout:  () => void
  setUser: (user: AuthUser) => void
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user:            null,
      token:           null,
      isAuthenticated: false,

      setAuth: (user, token) =>
        set({ user, token, isAuthenticated: true }),

      logout: () =>
        set({ user: null, token: null, isAuthenticated: false }),

      setUser: (user) =>
        set({ user }),
    }),
    {
      name:    AUTH_STORAGE_KEY,
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        user: state.user,
        token: state.token,
        isAuthenticated: state.isAuthenticated
      }),
    },
  ),
)

/**
 * True once the persisted auth state has been read back from localStorage.
 * Zustand's persist middleware hydrates asynchronously, so on the very first
 * render `isAuthenticated` is momentarily `false` even for an already-logged-in
 * user — any logic that branches on "is this a guest?" (e.g. deciding whether
 * to check for an existing unpaid service request) must wait for this to be
 * true first, or it will wrongly treat a logged-in user as a guest.
 */
export function useAuthHydrated(): boolean {
  const [hydrated, setHydrated] = useState(() => useAuthStore.persist.hasHydrated());

  useEffect(() => {
    if (hydrated) return;
    const unsub = useAuthStore.persist.onFinishHydration(() => setHydrated(true));
    if (useAuthStore.persist.hasHydrated()) setHydrated(true);
    return unsub;
  }, [hydrated]);

  return hydrated;
}
