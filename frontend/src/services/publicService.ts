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

/** One module row exactly as printed on the transcript sheet. */
export interface TranscriptModuleRow {
  code:         string
  title:        string
  credits:      number
  marks:        string
  credit_point: string
  grade:        string
}

/** One sheet (level of study) of an issued transcript. */
export interface TranscriptSheet {
  level:   string
  modules: TranscriptModuleRow[]
  totals: {
    credits:          number
    credit_points:    string
    weighted_average: string | null
    grade:            string | null
    decision:         string | null
  }
}

export interface TranscriptVerifyResult {
  found:          boolean
  code?:          string
  issued_on?:     string
  issued_place?:  string | null
  registrar?:     string | null
  /** Date a later transcript with different results was issued for this student. */
  superseded_on?: string | null
  student?: {
    surname:     string
    other_names: string
    regnumber:   string
    faculty:     string | null
    department:  string | null
    option:      string | null
  } | null
  sheets?: TranscriptSheet[]
}

const API = (import.meta.env.VITE_API_URL ?? '').replace(/\/$/, '')

/**
 * Absolute URL for a public photo path returned by the verify endpoint.
 * Built exactly like the API client builds request URLs (baseURL + path),
 * so the browser's <img> request hits the same backend route as the JSON
 * verify call. The backend returns `relPath` already prefixed with `/api/...`.
 */
export const publicPhotoUrl = (relPath: string) => `${API}${relPath}`

export const publicService = {
  verifyStudent: (code: string) =>
    api.get<StudentVerifyResult>('/public/student-verify', { code }),
  verifyTranscript: (code: string) =>
    api.get<TranscriptVerifyResult>('/public/transcript-verify', { code }),
}
