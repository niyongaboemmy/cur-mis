import { api } from './api'
import type { AuthUser } from '@/store/authStore'
import { useAuthStore } from '@/store/authStore'
import { isPhotoUuid, legacyPhotoUrl } from '@/services/photoHelper'

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

  /** Self-service profile update — full_name / email / username / phone. */
  updateMe: (data: { full_name: string; email: string; username: string; phone?: string }) =>
    api.put<AuthUser>('/api/auth/me', data),

  /** Direct URL for the authenticated user's profile photo.
   *  Legacy photo values are served straight from the old CUR photo store. */
  myPhotoUrl: (cacheKey?: string | number) => {
    const photoValue = cacheKey != null ? String(cacheKey) : ''
    if (photoValue && !isPhotoUuid(photoValue)) {
      return legacyPhotoUrl(photoValue)
    }
    const token = useAuthStore.getState().token
    const base  = import.meta.env.VITE_API_URL ?? ''
    const v     = photoValue ? `&v=${encodeURIComponent(photoValue)}` : ''
    return `${base}/api/auth/me/photo?token=${token}${v}`
  },

  /** Upload (or replace) the authenticated user's profile photo. */
  uploadMyPhoto: (file: File) => {
    const form = new FormData()
    form.append('photo', file)
    return api.upload<{ photo: string }>('/api/auth/me/photo', form)
  },

  /**
   * Remove the authenticated user's profile photo.
   * Returns the same user shape as uploadMyPhoto with `photo: null`, so the
   * auth store can be refreshed from either response identically.
   */
  deleteMyPhoto: () =>
    api.delete<{ photo: null }>('/api/auth/me/photo'),
}
