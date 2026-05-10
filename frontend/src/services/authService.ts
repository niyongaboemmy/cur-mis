import { api } from './api'
import type { AuthUser } from '@/store/authStore'

export interface LoginResponse {
  token: string
  user:  AuthUser
  otp_required?: boolean
  email?: string
}

export const authService = {
  login: (data: Record<string, string>) => 
    api.post<LoginResponse>('/api/auth/login', data),

  verifyOtp: (data: { email: string; otp: string }) =>
    api.post<LoginResponse>('/api/auth/verify-otp', data),

  resendOtp: (email: string) =>
    api.post<null>('/api/auth/resend-otp', { email }),

  registerApplicantAccount: (data: Record<string, string>) =>
    api.post<LoginResponse>('/api/auth/register-applicant-account', data),

  forgotPassword: (email: string) =>
    api.post<{ email: string }>('/api/auth/forgot-password', { email }),

  verifyResetOtp: (data: { email: string; otp: string }) =>
    api.post<{ token: string }>('/api/auth/verify-reset-otp', data),

  resetPassword: (data: Record<string, string>) =>
    api.post<null>('/api/auth/reset-password', data),

  /** Authenticated self-service password change. */
  changePassword: (data: { current_password: string; new_password: string }) =>
    api.post<null>('/api/auth/change-password', data),

  me: () => api.get<AuthUser>('/api/auth/me'),
}
