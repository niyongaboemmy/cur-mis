import { api } from './api'

export interface SystemDocument {
  id: number
  name: string
  description?: string
  file_name: string
  file_size: number
  file_type: string
  category: string
  uploaded_by_name?: string
  uploaded_at: string
  is_active: number
}

export interface DocumentCategory {
  category: string
  count: number
}

export const systemDocumentService = {
  /**
   * Get all active system documents
   */
  list: async () => {
    const response = await api.get<SystemDocument[]>('/api/system-documents')
    return response.data || []
  },

  /**
   * Get all document categories
   */
  getCategories: async () => {
    const response = await api.get<DocumentCategory[]>('/api/system-documents/categories')
    return response.data || []
  },

  /**
   * Download a document by ID
   * Returns blob for file download
   */
  download: async (docId: number, fileName: string): Promise<void> => {
    try {
      const response = await fetch(`/api/system-documents/${docId}/download`, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${localStorage.getItem('cur-mis-auth') ? JSON.parse(localStorage.getItem('cur-mis-auth') || '{}').token : ''}`,
        },
      })

      if (!response.ok) {
        throw new Error(`Download failed: ${response.statusText}`)
      }

      const blob = await response.blob()
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = fileName
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      URL.revokeObjectURL(url)
    } catch (error) {
      throw error
    }
  },

  /**
   * Upload a new system document (admin only)
   */
  upload: async (formData: FormData): Promise<SystemDocument> => {
    const response = await fetch('/api/system-documents', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${localStorage.getItem('cur-mis-auth') ? JSON.parse(localStorage.getItem('cur-mis-auth') || '{}').token : ''}`,
      },
      body: formData,
    })

    if (!response.ok) {
      const error = await response.json()
      throw new Error(error.message || 'Upload failed')
    }

    const result = await response.json()
    return result.data
  },

  /**
   * Delete a document (admin only)
   */
  delete: async (docId: number): Promise<void> => {
    const response = await fetch(`/api/system-documents/${docId}`, {
      method: 'DELETE',
      headers: {
        Authorization: `Bearer ${localStorage.getItem('cur-mis-auth') ? JSON.parse(localStorage.getItem('cur-mis-auth') || '{}').token : ''}`,
      },
    })

    if (!response.ok) {
      const error = await response.json()
      throw new Error(error.message || 'Delete failed')
    }
  },
}
