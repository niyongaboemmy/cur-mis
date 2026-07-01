import { api } from '@/services/api'
import { useAuthStore } from '@/store/authStore'

export type DocumentType =
  | 'to_whom_visa'
  | 'admission_letter'
  | 'registration_form'
  | 'english_proficiency'
  | 'completed_modules'
  | 'degree_bachelor'
  | 'degree_pgde'
  | 'degree_undergraduate'

function base() {
  return import.meta.env.VITE_API_URL ?? ''
}

function token() {
  return useAuthStore.getState().token ?? ''
}

export const documentService = {
  /**
   * Fetch the rendered document HTML via the authenticated API client.
   * Use the returned string as an iframe's `srcdoc` to avoid direct
   * browser-to-backend URL issues.
   */
  fetchPreview: (studentId: number, documentType: DocumentType) =>
    api.get<{ html: string }>('/api/documents/preview', {
      student_id: studentId,
      document_type: documentType,
    }),

  /** Token-bearing URL that streams a PDF — opens inline in the browser tab. */
  downloadUrl: (studentId: number, documentType: DocumentType): string =>
    `${base()}/api/documents/download?student_id=${studentId}&document_type=${documentType}&token=${token()}`,
}
