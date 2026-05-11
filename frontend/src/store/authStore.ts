import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
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
