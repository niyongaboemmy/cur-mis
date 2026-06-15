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

export const studentIdService = {
  history: (studentId: number | string) =>
    api.get<StudentIdHistory>(`/api/student-ids/by-student/${studentId}`),

  issue: (studentId: number | string, validityYears = 4) =>
    api.post<StudentIdCard>('/api/student-ids/issue', { student_id: studentId, validity_years: validityYears }),

  revoke: (cardId: number) =>
    api.delete<void>(`/api/student-ids/${cardId}`),

  /** Fetch the printable card HTML for an in-app preview. */
  preview: (studentId: number | string) =>
    api.get<{ html: string }>(`/api/student-ids/by-student/${studentId}/card`, { preview: 1 }),

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
