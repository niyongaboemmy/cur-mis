import { api } from '@/services/api'
import { useAuthStore } from '@/store/authStore'

export type DocumentType =
  | 'to_whom_visa'
  | 'admission_letter'
  | 'registration_form'
  | 'english_proficiency'
  | 'completed_modules'
  | 'exemption_letter'
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
    api.get<{ html: string }>('/documents/preview', {
      student_id: studentId,
      document_type: documentType,
    }),

  /** Token-bearing URL that streams a PDF — opens inline in the browser tab. */
  downloadUrl: (studentId: number, documentType: DocumentType): string =>
    `${base()}/documents/download?student_id=${studentId}&document_type=${documentType}&token=${token()}`,

  /** Preview exemption letter via POST (accepts custom letter data). */
  previewExemptionLetter: (payload: any) =>
    api.post<{ html: string }>('/documents/exemption-letter/preview', payload),

  /**
   * Download exemption letter PDF via POST with blob response.
   * Fetches the PDF and triggers a client-side download.
   */
  downloadExemptionLetter: async (payload: any) => {
    try {
      const response = await fetch(
        `${base()}/documents/exemption-letter/download`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token()}`,
          },
          body: JSON.stringify(payload),
        }
      );

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `Exemption_Letter_${payload.student_id || 'document'}.pdf`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Download failed:', error);
      throw error;
    }
  },
}
