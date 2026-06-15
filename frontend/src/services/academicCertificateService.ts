import { api } from '@/services/api'

export type CertificateType   = 'degree' | 'diploma' | 'certificate' | 'provisional'
export type CertificateStatus = 'draft' | 'issued' | 'dispatched' | 'revoked'

export interface AcademicCertificate {
  id:                 number
  student_id:         number
  academic_year_id:   number | null
  certificate_type:   CertificateType
  certificate_number: string | null
  degree_class:       string | null
  issue_date:         string | null
  issued_by:          number | null
  dispatch_date:      string | null
  dispatch_notes:     string | null
  is_replacement:     boolean
  replacement_reason: string | null
  status:             CertificateStatus
  created_at:         string
  updated_at:         string
  regnumber:          string
  fname:              string
  lname:              string
  year_label:         string | null
  issued_by_name:     string | null
}

export interface CertificateListResponse {
  data:      AcademicCertificate[]
  total:     number
  page:      number
  per_page:  number
  last_page: number
}

export interface CertificateIssuePayload {
  student_id:         number
  academic_year_id?:  number
  certificate_type:   CertificateType
  degree_class?:      string
  issue_date?:        string
  is_replacement?:    boolean
  replacement_reason?: string
}

export const academicCertificateService = {
  list: (
    params: {
      status?: CertificateStatus
      certificate_type?: CertificateType
      academic_year_id?: number
      search?: string
      page?: number
      per_page?: number
    } = {},
    signal?: AbortSignal,
  ) =>
    api.get<CertificateListResponse>('/api/academic-certificates', params as Record<string, unknown>, signal),

  issue: (payload: CertificateIssuePayload) =>
    api.post<{ id: number; certificate_number: string }>('/api/academic-certificates', payload),

  dispatch: (id: number, payload: { dispatch_date?: string; dispatch_notes?: string } = {}) =>
    api.put<null>(`/api/academic-certificates/${id}/dispatch`, payload),

  revoke: (id: number) =>
    api.put<null>(`/api/academic-certificates/${id}/revoke`, {}),

  delete: (id: number) =>
    api.delete<null>(`/api/academic-certificates/${id}`),
}
