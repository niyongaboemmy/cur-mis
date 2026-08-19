import { api, apiClient } from '@/services/api'

export interface StudentIdCard {
  id:          number
  student_id:  number
  issue_date:  string
  expiry_date: string
  barcode:     string
  is_active:   number | boolean
  created_at:  string
}

export interface StudentIdHistory {
  active:  StudentIdCard | null
  history: StudentIdCard[]
}

/** One row of the ID-card workspace roster. */
export interface StudentIdRosterRow {
  student_id:    number
  regnumber:     string
  fname:         string | null
  lname:         string | null
  photo:         string | null
  campus:        string | null
  student_state: string | null
  option_name:   string | null
  card_id:       number | null
  issue_date:    string | null
  expiry_date:   string | null
  barcode:       string | null
  card_state:    'none' | 'active' | 'expired' | 'revoked'
}

export interface StudentIdRosterFilters {
  page?:      number
  per_page?:  number
  keyword?:   string
  state?:     string
  campus?:    string
  option_id?: number
}

export const studentIdService = {
  /** Students plus their current card state — powers the ID-card workspace. */
  roster: (filters: StudentIdRosterFilters = {}, signal?: AbortSignal) =>
    api.get<{
      data: StudentIdRosterRow[]
      pagination: { current_page: number; per_page: number; total: number; last_page: number }
    }>('/api/student-ids', filters as Record<string, unknown>, signal),

  /** Issue cards for a selection. Partial failures come back in `failed`. */
  batchIssue: (studentIds: number[], validityYears = 4) =>
    api.post<{
      issued: { student_id: number; card_id: number; barcode: string }[]
      failed: { student_id: number; reason: string }[]
    }>('/api/student-ids/batch-issue', { student_ids: studentIds, validity_years: validityYears }),

  history: (studentId: number | string) =>
    api.get<StudentIdHistory>(`/api/student-ids/by-student/${studentId}`),

  issue: (studentId: number | string, validityYears = 4) =>
    api.post<StudentIdCard>('/api/student-ids/issue', { student_id: studentId, validity_years: validityYears }),

  revoke: (cardId: number) =>
    api.delete<void>(`/api/student-ids/${cardId}`),

  /** Fetch the printable card HTML for an in-app preview.
   *  Pass `photoValue` (student.photo from the DB row) so the backend can embed
   *  the photo even when the student.photo column is null in the DB. */
  preview: (studentId: number | string, photoValue?: string | null) => {
    const params: Record<string, unknown> = { preview: 1 }
    if (photoValue) params.photo = photoValue
    return api.get<{ html: string }>(`/api/student-ids/by-student/${studentId}/card`, params)
  },

  /** Download one PDF holding every selected student's active card. */
  batchPrint: async (studentIds: number[]) => {
    const res = await apiClient.post(
      '/api/student-ids/batch-print',
      { student_ids: studentIds },
      { responseType: 'blob' },
    )
    const blob = res.data instanceof Blob ? res.data : new Blob([res.data])
    const url  = window.URL.createObjectURL(blob)
    const a    = document.createElement('a')
    a.href = url; a.download = `id-cards-${studentIds.length}.pdf`
    document.body.appendChild(a); a.click(); a.remove()
    window.URL.revokeObjectURL(url)
  },

  /** Download the card as a PDF (carries the auth header). */
  download: async (studentId: number | string) => {
    const res = await apiClient.get(`/api/student-ids/by-student/${studentId}/card`, {
      responseType: 'blob',
    })
    const blob = res.data instanceof Blob ? res.data : new Blob([res.data])
    const cd   = (res.headers['content-disposition'] as string | undefined) ?? ''
    const m    = /filename="?([^";]+)"?/i.exec(cd)
    const name = m?.[1] ?? `id-card-${studentId}.pdf`
    const url  = window.URL.createObjectURL(blob)
    const a    = document.createElement('a')
    a.href = url; a.download = name
    document.body.appendChild(a); a.click(); a.remove()
    window.URL.revokeObjectURL(url)
  },
}
