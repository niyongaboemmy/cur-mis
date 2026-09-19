import { useState, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { CheckCircle2, XCircle, Loader2, AlertCircle } from 'lucide-react'
import Modal from '@/components/ui/Modal'

interface DocumentItem {
  id: string
  name: string
  verified: boolean | null
  verified_at?: string
  verified_by?: string
  uploaded?: boolean
}

interface MissingDocument {
  id: string
  name: string
}

interface DocumentChecklistModalProps {
  open: boolean
  onClose: () => void
  studentId: string
  studentName: string
  programme: string
  onSave?: (documents: DocumentItem[]) => void
}

const REQUIRED_DOCUMENTS: Record<string, string[]> = {
  UNDERGRADUATE: [
    'Notarized A2 or equivalent',
    'A1 and transcripts (credit transfer)',
    'Medical report',
    'ID/Passport',
    'Application letter',
    'Criminal record',
    'Health insurance',
  ],
  MASTERS: [
    'Notarized A2 or equivalent',
    'Notarized A0',
    'Medical report',
    'ID/Passport',
    'Application letter',
    'Criminal record',
    'Health insurance',
    'Recommendation letter from employer or academician',
  ],
  PGDE: [
    'Notarized A2 or equivalent',
    'Notarized A0',
    'Medical report',
    'ID/Passport',
    'Application letter',
    'Criminal record',
    'Health insurance',
  ],
}

// Document aliases - maps different document names to the same requirement
const DOCUMENT_ALIASES: Record<string, string[]> = {
  'ID/Passport': ['National ID', 'Passport', 'National ID / Passport', 'identification', 'id'],
  'Notarized A2 or equivalent': ['High School Diploma', 'Notified High School Diploma', 'Secondary School Certificate', 'A2 Certificate', 'Form 6'],
  'Notarized A0': ['Bachelor Degree', 'University Degree', 'A0 Certificate'],
  'Medical report': ['Medical', 'Health Certificate', 'Medical Examination'],
  'A1 and transcripts (credit transfer)': ['A1', 'Transcripts', 'Academic Transcript', 'A1 Certificate'],
  'Application letter': ['Application', 'Letter of Intent', 'Motivation Letter'],
  'Criminal record': ['Police Clearance', 'Criminal Clearance', 'Background Check'],
  'Health insurance': ['Insurance', 'Health Coverage'],
  'Recommendation letter from employer or academician': ['Recommendation', 'Reference Letter', 'Letter of Recommendation'],
}

export default function DocumentChecklistModal({
  open,
  onClose,
  studentId,
  studentName,
  programme,
  onSave,
}: DocumentChecklistModalProps) {
  const [documents, setDocuments] = useState<DocumentItem[]>([])
  const [missingDocuments, setMissingDocuments] = useState<MissingDocument[]>([])
  const [newMissingDoc, setNewMissingDoc] = useState('')
  const [allCompleted, setAllCompleted] = useState(false)
  const [saving, setSaving] = useState(false)
  const programmeKey = programme.toUpperCase().replace(/\s+/g, '')

  // Fetch uploaded documents for this student
  const { data: studentDocs } = useQuery({
    queryKey: ['student-documents', studentId],
    queryFn: async () => {
      try {
        const res = await fetch(`/api/students/${studentId}/documents`)
        if (!res.ok) return null
        return res.json()
      } catch {
        return null
      }
    },
    enabled: !!studentId && open,
  })

  useEffect(() => {
    if (open) {
      const requiredDocs = REQUIRED_DOCUMENTS[programmeKey] || REQUIRED_DOCUMENTS.UNDERGRADUATE
      const uploadedDocNames = studentDocs?.data?.map((d: any) => d.document_type?.toLowerCase() || '') || []

      const initialDocs = requiredDocs
        .map((doc, idx) => {
          // Get aliases for this document type
          const aliases = DOCUMENT_ALIASES[doc] || [doc]
          const searchTerms = [doc, ...aliases].map(term => term.toLowerCase())

          // Check if document type matches any uploaded document (case-insensitive or by alias)
          const hasUpload = uploadedDocNames.some((uploaded: string) =>
            searchTerms.some(term =>
              term.includes(uploaded.trim()) || uploaded.trim().includes(term)
            )
          )

          return {
            id: `doc-${idx}`,
            name: doc,
            verified: hasUpload ? true : false, // Auto-green if uploaded, auto-red if missing
            verified_at: hasUpload ? new Date().toISOString().split('T')[0] : undefined,
            verified_by: hasUpload ? 'System' : 'Missing',
            uploaded: hasUpload,
          }
        })
        // Filter to show ONLY missing documents (not uploaded)
        .filter((doc: DocumentItem) => !doc.uploaded)

      setDocuments(initialDocs)
    }
  }, [open, programmeKey, studentDocs])

  const toggleDocument = (id: string) => {
    setDocuments((docs) =>
      docs.map((doc) =>
        doc.id === id
          ? {
              ...doc,
              verified: doc.verified === true ? false : doc.verified === false ? null : true,
              verified_at: new Date().toISOString().split('T')[0],
              verified_by: 'Current User',
            }
          : doc
      )
    )
  }

  const addMissingDocument = () => {
    if (newMissingDoc.trim()) {
      setMissingDocuments([
        ...missingDocuments,
        { id: `missing-${Date.now()}`, name: newMissingDoc.trim() }
      ])
      setNewMissingDoc('')
    }
  }

  const removeMissingDocument = (id: string) => {
    setMissingDocuments(missingDocuments.filter((d) => d.id !== id))
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      // Simulate API call
      await new Promise((resolve) => setTimeout(resolve, 500))
      if (onSave) {
        onSave(documents)
      }
      onClose()
    } finally {
      setSaving(false)
    }
  }

  const completedCount = documents.filter((d) => d.verified === true).length
  const progress = Math.round((completedCount / documents.length) * 100)
  const isAllVerified = completedCount === documents.length && missingDocuments.length === 0

  return (
    <Modal open={open} onClose={onClose} title={`Document Checklist - ${studentName}`} size="lg">
      <div className="space-y-5 py-4">
        {/* Student Info */}
        <div className="rounded-lg bg-primary-50 dark:bg-primary-900/20 p-4 border border-primary-200 dark:border-primary-800">
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <p className="text-xs text-primary-600 dark:text-primary-400 font-semibold uppercase">Student ID</p>
              <p className="text-primary-900 dark:text-white font-mono">{studentId}</p>
            </div>
            <div>
              <p className="text-xs text-primary-600 dark:text-primary-400 font-semibold uppercase">Programme</p>
              <p className="text-primary-900 dark:text-white">{programme}</p>
            </div>
          </div>
        </div>

        {/* Progress Bar */}
        <div className="space-y-2">
          <div className="flex justify-between items-center">
            <p className="text-sm font-semibold text-ink-900 dark:text-white">Verification Progress</p>
            <span className="text-xs font-bold text-primary-600">{completedCount}/{documents.length}</span>
          </div>
          <div className="h-3 rounded-full bg-ink-200 dark:bg-ink-700 overflow-hidden">
            <div
              className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-green-500 transition-all duration-300"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>

        {/* Documents List */}
        <div className="space-y-2 max-h-96 overflow-y-auto">
          {documents.map((doc) => (
            <button
              key={doc.id}
              onClick={() => toggleDocument(doc.id)}
              className={`w-full flex items-center gap-3 p-3 rounded-lg border-2 transition-all ${
                doc.verified === true
                  ? 'bg-emerald-50 dark:bg-emerald-900/20 border-emerald-300 dark:border-emerald-700'
                  : doc.verified === false
                  ? 'bg-red-50 dark:bg-red-900/20 border-red-300 dark:border-red-700'
                  : 'bg-ink-50 dark:bg-ink-800 border-ink-200 dark:border-ink-700 hover:border-primary-300'
              }`}
            >
              <div
                className={`flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center ${
                  doc.verified === true
                    ? 'bg-emerald-500'
                    : doc.verified === false
                    ? 'bg-red-500'
                    : 'bg-ink-300 dark:bg-ink-600'
                }`}
              >
                {doc.verified === true ? (
                  <CheckCircle2 className="w-4 h-4 text-white" />
                ) : doc.verified === false ? (
                  <XCircle className="w-4 h-4 text-white" />
                ) : (
                  <span className="text-xs font-bold text-white">?</span>
                )}
              </div>
              <div className="flex-1 text-left">
                <p className={`text-sm font-medium ${
                  doc.verified === true
                    ? 'text-emerald-900 dark:text-emerald-300'
                    : doc.verified === false
                    ? 'text-red-900 dark:text-red-300'
                    : 'text-ink-900 dark:text-white'
                }`}>
                  {doc.name}
                </p>
                {doc.verified_at && (
                  <p className="text-xs text-ink-500 dark:text-ink-400 mt-0.5">
                    Verified on {doc.verified_at}
                  </p>
                )}
              </div>
            </button>
          ))}
        </div>

        {/* Legend */}
        <div className="flex flex-wrap gap-4 text-xs pt-2 border-t border-ink-200 dark:border-ink-700 pb-4">
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 rounded-full bg-emerald-500" />
            <span className="text-ink-600 dark:text-ink-400">Verified</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 rounded-full bg-red-500" />
            <span className="text-ink-600 dark:text-ink-400">Missing</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 rounded-full bg-ink-300 dark:bg-ink-600" />
            <span className="text-ink-600 dark:text-ink-400">Not checked</span>
          </div>
        </div>

        {/* Missing Documents Section */}
        <div className="space-y-3 border-t border-ink-200 dark:border-ink-700 pt-4">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-amber-600 dark:text-amber-400" />
            <h3 className="text-sm font-semibold text-ink-900 dark:text-white">Additional Missing Documents</h3>
          </div>

          {/* Add missing document input */}
          <div className="flex gap-2">
            <input
              type="text"
              value={newMissingDoc}
              onChange={(e) => setNewMissingDoc(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && addMissingDocument()}
              placeholder="Type document name and press Enter..."
              className="input flex-1 text-sm"
            />
            <button
              onClick={addMissingDocument}
              className="btn-secondary btn-sm px-3"
              disabled={!newMissingDoc.trim()}
            >
              Add
            </button>
          </div>

          {/* Missing documents list */}
          {missingDocuments.length > 0 && (
            <div className="space-y-2">
              {missingDocuments.map((doc) => (
                <div
                  key={doc.id}
                  className="flex items-center justify-between gap-2 p-2.5 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800"
                >
                  <span className="text-sm text-amber-900 dark:text-amber-300">{doc.name}</span>
                  <button
                    onClick={() => removeMissingDocument(doc.id)}
                    className="text-amber-600 dark:text-amber-400 hover:text-amber-700 dark:hover:text-amber-300"
                    title="Remove"
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Completion Status */}
        {isAllVerified && (
          <div className="space-y-3 border-t border-ink-200 dark:border-ink-700 pt-4">
            <div className="p-4 rounded-lg bg-emerald-50 dark:bg-emerald-900/20 border-2 border-emerald-300 dark:border-emerald-700">
              <div className="flex items-center gap-3">
                <CheckCircle2 className="w-6 h-6 text-emerald-600 dark:text-emerald-400 flex-shrink-0" />
                <div>
                  <p className="text-sm font-semibold text-emerald-900 dark:text-emerald-300">
                    ✓ All Documents Complete
                  </p>
                  <p className="text-xs text-emerald-700 dark:text-emerald-400 mt-0.5">
                    This student's document verification is complete and can be marked as inactive.
                  </p>
                </div>
              </div>
            </div>

            <label className="flex items-center gap-3 p-3 rounded-lg bg-ink-50 dark:bg-ink-800 border border-ink-200 dark:border-ink-700 cursor-pointer hover:bg-ink-100 dark:hover:bg-ink-700">
              <input
                type="checkbox"
                checked={allCompleted}
                onChange={(e) => setAllCompleted(e.target.checked)}
                className="w-4 h-4 rounded cursor-pointer"
              />
              <span className="text-sm font-medium text-ink-900 dark:text-white">
                Mark all documents as completed
              </span>
            </label>
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-2 justify-end pt-2 border-t border-ink-200 dark:border-ink-700">
          <button
            onClick={onClose}
            className="btn-secondary"
            disabled={saving}
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="btn-primary flex items-center gap-2"
          >
            {saving ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Saving...
              </>
            ) : (
              'Save Checklist'
            )}
          </button>
        </div>
      </div>
    </Modal>
  )
}
