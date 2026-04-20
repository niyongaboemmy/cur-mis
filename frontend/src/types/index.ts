export interface ApiResponse<T = unknown> {
  success: boolean
  message: string
  data:    T | null
  errors?: Record<string, string[]>
  otp_required?: boolean
}

export interface VerifyOtpRequest {
  email: string
  otp:   string
}

export interface VerifyResetOtpRequest {
  email: string
  otp:   string
}

export interface ForgotPasswordRequest {
  email: string
}

export interface ResetPasswordRequest {
  token:    string
  password: string
}

export interface LoginRequest {
  email:    string
  password: string
}

export interface RegisterRequest {
  name:     string
  email:    string
  password: string
}

export interface AuthTokenResponse {
  token: string
  user:  User
}

export interface User {
  id:          number
  full_name:   string
  email:       string
  created_at?: string
  updated_at?: string
}

export interface PaginatedResponse<T> {
  data:         T[]
  current_page: number
  last_page:    number
  per_page:     number
  total:        number
}

export type FormErrors = Record<string, string | string[]>
