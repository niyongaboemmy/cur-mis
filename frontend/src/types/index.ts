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
  id:           number
  full_name:    string
  email:        string
  username?:    string
  role?:        string
  role_name?:   string
  role_id?:     number
  permissions?: string[]
  is_applicant?: boolean
  created_at?:  string
  updated_at?:  string
}

export interface PaginatedResponse<T> {
  data:         T[]
  current_page: number
  last_page:    number
  per_page:     number
  total:        number
}

export type FormErrors = Record<string, string | string[]>

export interface SystemLog {
  id:          number
  user_id:     number | null
  user_name:   string
  user_email:  string
  action:      string
  module:      string
  entity_type: string | null
  entity_id:   number | null
  description: string
  ip_address:  string
  metadata:    Record<string, unknown> | null
  created_at:  string
}

export interface SystemLogStats {
  total:      number
  today:      number
  yesterday:  number
  by_module:  { module: string; count: number }[]
  by_action:  { action: string; count: number }[]
  trend_7d:   { date: string;   count: number }[]
  top_users:  { user_name: string; user_email: string; count: number }[]
  last_entry: string | null
}

export interface SystemLogFilters {
  module?:    string
  action?:    string
  user_id?:   number
  date_from?: string
  date_to?:   string
  search?:    string
  page?:      number
  per_page?:  number
}
