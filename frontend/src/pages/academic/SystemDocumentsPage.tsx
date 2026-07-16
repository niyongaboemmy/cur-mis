import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import {
  Download,
  Upload,
  Trash2,
  Loader2,
  FileText,
  FolderOpen,
  AlertCircle,
} from 'lucide-react'
import { systemDocumentService, type SystemDocument } from '@/services/systemDocumentService'
import { useAuthStore } from '@/store/authStore'
import Modal from '@/components/ui/Modal'
import Button from '@/components/ui/Button'

export default function SystemDocumentsPage() {
  const [selectedCategory, setSelectedCategory] = useState<string>('')
  const [showUploadModal, setShowUploadModal] = useState(false)
  const [uploadLoading, setUploadLoading] = useState(false)
  const [deleteId, setDeleteId] = useState<number | null>(null)
  const { user } = useAuthStore()

  const isAdmin = user?.role === 'admin' || user?.role === 'superadmin'

  // Fetch all documents
  const { data: docs = [], isLoading, refetch } = useQuery({
    queryKey: ['system-documents'],
    queryFn: () => systemDocumentService.list(),
  })

  // Fetch categories
  const { data: categories = [] } = useQuery({
    queryKey: ['document-categories'],
    queryFn: () => systemDocumentService.getCategories(),
  })

  // Filter documents by selected category
  const filteredDocs = selectedCategory
    ? docs.filter((d) => d.category === selectedCategory)
    : docs

  const handleDownload = async (doc: SystemDocument) => {
    try {
      await systemDocumentService.download(doc.id, doc.file_name)
      toast.success(`Downloaded: ${doc.name}`)
    } catch (error) {
      toast.error('Download failed')
    }
  }

  const handleDelete = async () => {
    if (!deleteId) return
    try {
      await systemDocumentService.delete(deleteId)
      toast.success('Document deleted')
      setDeleteId(null)
      refetch()
    } catch (error) {
      toast.error('Failed to delete document')
    }
  }

  const handleUpload = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setUploadLoading(true)

    try {
      const formData = new FormData(e.currentTarget)
      await systemDocumentService.upload(formData)
      toast.success('Document uploaded')
      setShowUploadModal(false)
      e.currentTarget.reset()
      refetch()
    } catch (error: any) {
      toast.error(error.message || 'Upload failed')
    } finally {
      setUploadLoading(false)
    }
  }

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 B'
    const k = 1024
    const sizes = ['B', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
  }

  const getFileIcon = () => {
    return <FileText className="w-4 h-4" />
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">System Documents</h1>
          <p className="text-gray-600 mt-1">Fee structures, policies, and institutional documents</p>
        </div>
        {isAdmin && (
          <Button
            onClick={() => setShowUploadModal(true)}
            className="flex items-center gap-2"
          >
            <Upload className="w-4 h-4" />
            Upload Document
          </Button>
        )}
      </div>

      {/* Category Filter */}
      {categories.length > 0 && (
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => setSelectedCategory('')}
            className={`px-4 py-2 rounded-lg font-medium transition ${
              selectedCategory === ''
                ? 'bg-blue-500 text-white'
                : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
            }`}
          >
            All ({docs.length})
          </button>
          {categories.map((cat) => (
            <button
              key={cat.category}
              onClick={() => setSelectedCategory(cat.category)}
              className={`px-4 py-2 rounded-lg font-medium transition ${
                selectedCategory === cat.category
                  ? 'bg-blue-500 text-white'
                  : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
              }`}
            >
              {cat.category} ({cat.count})
            </button>
          ))}
        </div>
      )}

      {/* Documents Display */}
      {filteredDocs.length === 0 ? (
        <div className="text-center py-12 bg-gray-50 rounded-lg">
          <FolderOpen className="w-12 h-12 text-gray-400 mx-auto mb-3" />
          <p className="text-gray-600">No documents found</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredDocs.map((doc) => (
            <div
              key={doc.id}
              className="flex items-center justify-between p-4 bg-white border border-gray-200 rounded-lg hover:shadow-md transition"
            >
              <div className="flex items-center gap-3 flex-1">
                {getFileIcon()}
                <div className="flex-1">
                  <h3 className="font-semibold text-gray-900">{doc.name}</h3>
                  {doc.description && (
                    <p className="text-sm text-gray-600">{doc.description}</p>
                  )}
                  <div className="flex items-center gap-3 mt-1 text-xs text-gray-500">
                    <span>{doc.category}</span>
                    <span>•</span>
                    <span>{formatFileSize(doc.file_size)}</span>
                    <span>•</span>
                    <span>{new Date(doc.uploaded_at).toLocaleDateString()}</span>
                    {doc.uploaded_by_name && (
                      <>
                        <span>•</span>
                        <span>by {doc.uploaded_by_name}</span>
                      </>
                    )}
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => handleDownload(doc)}
                  className="p-2 text-blue-500 hover:bg-blue-50 rounded-lg transition"
                  title="Download"
                >
                  <Download className="w-5 h-5" />
                </button>
                {isAdmin && (
                  <button
                    onClick={() => setDeleteId(doc.id)}
                    className="p-2 text-red-500 hover:bg-red-50 rounded-lg transition"
                    title="Delete"
                  >
                    <Trash2 className="w-5 h-5" />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Upload Modal */}
      <Modal
        open={showUploadModal}
        onClose={() => setShowUploadModal(false)}
        title="Upload Document"
      >
        <form onSubmit={handleUpload} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Document Name *
            </label>
            <input
              type="text"
              name="name"
              required
              maxLength={255}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="e.g., Fee Structure 2025-2026"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Category *
            </label>
            <select
              name="category"
              required
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              <option value="">Select category</option>
              <option value="Fee Structure">Fee Structure</option>
              <option value="Policy">Policy</option>
              <option value="Regulation">Regulation</option>
              <option value="Academic Calendar">Academic Calendar</option>
              <option value="Other">Other</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Description
            </label>
            <textarea
              name="description"
              maxLength={1000}
              rows={3}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="Optional description"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              File (PDF, Word, Excel) *
            </label>
            <input
              type="file"
              name="file"
              required
              accept=".pdf,.doc,.docx,.xls,.xlsx"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
            <p className="text-xs text-gray-500 mt-1">Max file size: 10MB</p>
          </div>

          <div className="flex gap-2 justify-end pt-4">
            <button
              type="button"
              onClick={() => setShowUploadModal(false)}
              className="px-4 py-2 text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg transition"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={uploadLoading}
              className="px-4 py-2 bg-blue-500 text-white hover:bg-blue-600 rounded-lg disabled:opacity-50 flex items-center gap-2"
            >
              {uploadLoading && <Loader2 className="w-4 h-4 animate-spin" />}
              Upload
            </button>
          </div>
        </form>
      </Modal>

      {/* Delete Confirmation Modal */}
      <Modal
        open={deleteId !== null}
        onClose={() => setDeleteId(null)}
        title="Delete Document"
      >
        <div className="space-y-4">
          <div className="flex items-start gap-3 p-3 bg-red-50 rounded-lg">
            <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
            <p className="text-sm text-red-800">
              Are you sure you want to delete this document? This action cannot be undone.
            </p>
          </div>

          <div className="flex gap-2 justify-end">
            <button
              onClick={() => setDeleteId(null)}
              className="px-4 py-2 text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg transition"
            >
              Cancel
            </button>
            <button
              onClick={handleDelete}
              className="px-4 py-2 bg-red-500 text-white hover:bg-red-600 rounded-lg"
            >
              Delete
            </button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
