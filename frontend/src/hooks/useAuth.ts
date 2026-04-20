import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import toast from 'react-hot-toast'
import { api } from '@/services/api'
import { useAuthStore } from '@/store/authStore'
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
export function useLogin() {
  const navigate = useNavigate()

  return useMutation({
    mutationFn: (data: LoginRequest) =>
      api.post<AuthTokenResponse>('/api/auth/login', data),

    onSuccess: (response) => {
      if (response.success) {
        if (response.otp_required) {
          toast.success(response.message || 'Verification code sent!')
          navigate('/verify-otp', { state: { email: (response.data as any).email } })
        } else if (response.data) {
          const { setAuth } = useAuthStore.getState()
          setAuth(response.data.user, response.data.token)
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
export function useVerifyOtp() {
  const { setAuth } = useAuthStore()
  const navigate    = useNavigate()

  return useMutation({
    mutationFn: (data: VerifyOtpRequest) =>
      api.post<AuthTokenResponse>('/api/auth/verify-otp', data),

    onSuccess: (response) => {
      if (response.success && response.data) {
        setAuth(response.data.user, response.data.token)
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
export function useResendOtp() {
  return useMutation({
    mutationFn: (email: string) =>
      api.post('/api/auth/resend-otp', { email }),
    onSuccess: (response) => {
      if (response.success) {
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
      api.post('/api/auth/forgot-password', data),
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
      api.post<{ token: string }>('/api/auth/verify-reset-otp', data),
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
      api.post('/api/auth/reset-password', data),
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
    mutationFn: () => api.post('/api/auth/logout'),
    onSettled: () => {
      logout()
      queryClient.clear()
      navigate('/login')
      toast.success('Logged out.')
    },
  })
}

export function useCurrentUser() {
  const { isAuthenticated } = useAuthStore()

  return useQuery({
    queryKey: ['auth', 'me'],
    queryFn:  () => api.get('/api/auth/me'),
    enabled:  isAuthenticated,
    staleTime: 1000 * 60 * 5,
  })
}
