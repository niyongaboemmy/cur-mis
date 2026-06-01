import { api } from '@/services/api'

export interface StudentVerifyResult {
  found:       boolean
  valid?:      boolean
  status?:     'valid' | 'expired' | 'revoked'
  full_name?:  string
  regnumber?:  string
  faculty?:    string | null
  department?: string | null
  program?:    string | null
  level?:      string | null
  issued_at?:  string | null
  expires_at?: string | null
  has_photo?:  boolean
  photo_url?:  string | null
}

const API = (import.meta.env.VITE_API_URL ?? '').replace(/\/$/, '')

/** Absolute URL for a public photo path returned by the verify endpoint. */
export const publicPhotoUrl = (relPath: string) =>
  `${API.replace(/\/api$/, '')}${relPath}`

export const publicService = {
  verifyStudent: (code: string) =>
    api.get<StudentVerifyResult>('/api/public/student-verify', { code }),
}
