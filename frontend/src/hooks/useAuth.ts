import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import toast from 'react-hot-toast'
import { api } from '@/services/api'
import { useAuthStore } from '@/store/authStore'
import { useSystemStore } from '@/store/systemStore'
import type { 
  LoginRequest, 
  AuthTokenResponse, 
  VerifyOtpRequest, 
  ForgotPasswordRequest, 
  ResetPasswordRequest 
} from '@/types'

/**
 * Handle initial login step (email/password).
 * If OTP is required, it redirects to the verification page.
 */
export function useLogin(options?: { onSuccess?: (response: any) => void }) {
  const navigate = useNavigate()

  return useMutation({
    mutationFn: (data: LoginRequest) =>
      api.post<AuthTokenResponse>('/auth/login', data),

    onSuccess: (response) => {
      if (response.success) {
        if (options?.onSuccess) {
          options.onSuccess(response)
          return
        }
        if (response.otp_required) {
          toast.success(response.message || 'Verification code sent!')
          const payload = response.data as any
          navigate('/verify-otp', { state: { email: payload?.email, devOtp: payload?.dev_otp } })
        } else if (response.data) {
          const { setAuth } = useAuthStore.getState()
          // Backend's /auth/login returns `role_name`; downstream UI
          // (including CampusFilterSwitcher) reads `user.role`. Mirror
          // the field so we don't depend on /auth/me hydrating it later.
          const u = response.data.user as any
          if (!u.role && u.role_name) u.role = u.role_name
          setAuth(u, response.data.token)
          toast.success('Logged in successfully!')

          navigate('/')
        }
      } else {
        toast.error(response.message || 'Login failed')
      }
    },

    onError: (error: any) => {
      const message = error?.response?.data?.message ?? 'Login failed. Please verify your credentials.'
      toast.error(message)
    },
  })
}

/**
 * Handle OTP verification to complete the login.
 */
export function useVerifyOtp(options?: { onSuccess?: (response: any) => void }) {
  const { setAuth } = useAuthStore()
  const navigate    = useNavigate()

  return useMutation({
    mutationFn: (data: VerifyOtpRequest) =>
      api.post<AuthTokenResponse>('/auth/verify-otp', data),

    onSuccess: (response) => {
      if (response.success && response.data) {
        // Normalize: backend returns `role_name` here but /auth/me returns `role`.
        // Alias to `role` so downstream UI reading `user.role` works immediately.
        const u = response.data.user as any
        if (!u.role && u.role_name) u.role = u.role_name
        setAuth(u, response.data.token)
        
        if (options?.onSuccess) {
          options.onSuccess(response)
          return
        }
        
        toast.success('Identity verified!')

        navigate('/')
      } else {
        toast.error(response.message || 'Verification failed')
      }
    },

    onError: (error: any) => {
      const message = error?.response?.data?.message ?? 'Invalid or expired code.'
      toast.error(message)
    },
  })
}

/**
 * Resend the OTP code.
 */
export function useResendOtp(options?: { onNewCode?: (devOtp?: string) => void }) {
  return useMutation({
    mutationFn: (email: string) =>
      api.post<{ email: string; dev_otp?: string }>('/auth/resend-otp', { email }),
    onSuccess: (response) => {
      if (response.success) {
        // A resend rotates `users.otp_code`, so any code already on screen is
        // now dead. Hand the fresh one back so the caller can re-sync.
        options?.onNewCode?.((response.data as any)?.dev_otp)
        toast.success(response.message || 'New code sent!')
      } else {
        toast.error(response.message || 'Failed to resend code')
      }
    },
    onError: (error: any) => {
      const message = error?.response?.data?.message ?? 'Failed to resend code.'
      toast.error(message)
    },
  })
}

/**
 * Initiate password reset.
 */
export function useForgotPassword() {
  return useMutation({
    mutationFn: (data: ForgotPasswordRequest) =>
      api.post('/auth/forgot-password', data),
    onSuccess: (response) => {
      if (response.success) {
        toast.success(response.message || 'Verification code sent!')
      } else {
        toast.error(response.message || 'Request failed')
      }
    },
    onError: (error: any) => {
      const message = error?.response?.data?.message ?? 'Request failed. Please try again.'
      toast.error(message)
    },
  })
}

/**
 * Verify OTP for password reset.
 */
export function useVerifyResetOtp() {
  return useMutation({
    mutationFn: (data: { email: string; otp: string }) =>
      api.post<{ token: string }>('/auth/verify-reset-otp', data),
    onSuccess: (response) => {
      if (response.success) {
        toast.success(response.message || 'Code verified!')
      } else {
        toast.error(response.message || 'Verification failed')
      }
    },
    onError: (error: any) => {
      const message = error?.response?.data?.message ?? 'Invalid or expired code.'
      toast.error(message)
    },
  })
}

/**
 * Reset password using token.
 */
export function useResetPassword() {
  const navigate = useNavigate()

  return useMutation({
    mutationFn: (data: ResetPasswordRequest) =>
      api.post('/auth/reset-password', data),
    onSuccess: (response) => {
      if (response.success) {
        toast.success('Password reset successfully! You can now log in.')
        navigate('/login')
      } else {
        toast.error(response.message || 'Reset failed')
      }
    },
    onError: (error: any) => {
      const message = error?.response?.data?.message ?? 'Reset failed. Token might be invalid.'
      toast.error(message)
    },
  })
}

export function useLogout() {
  const { logout }  = useAuthStore()
  const navigate    = useNavigate()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: () => api.post('/auth/logout'),
    onSettled: () => {
      logout()
      useSystemStore.getState().clear()
      queryClient.clear()
      navigate('/login')
      toast.success('Logged out.')
    },
  })
}

export function useCurrentUser() {
  const { isAuthenticated, setUser } = useAuthStore()

  const query = useQuery({
    queryKey: ['auth', 'me'],
    queryFn:  () => api.get<any>('/auth/me'),
    enabled:  isAuthenticated,
    staleTime: 1000 * 60 * 5,
  })

  // Keep the Zustand auth user in sync with the server.
  // /auth/me is the authoritative shape (returns `role`, `permissions`, etc.).
  useEffect(() => {
    const payload: any = query.data
    const u = payload?.data ?? payload
    if (u && typeof u === 'object' && u.id) {
      setUser(u)
    }
  }, [query.data, setUser])

  return query
}
