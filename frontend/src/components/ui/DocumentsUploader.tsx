import { useRef, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import {
  UploadCloud, FileText, Loader2, CheckCircle2, XCircle, Clock, Paperclip, Eye,
} from 'lucide-react'
import type { AdmissionRequirement, ApplicationDocument } from '@/types/admission'
import DocumentPreviewModal from './DocumentPreviewModal'
import { applicantService } from '@/services/admissionService'

interface DocumentsUploaderProps {
  /** Requirements checklist for the applicant's faculty/year. */
  requirements: AdmissionRequirement[]
  /** Documents already uploaded — keyed by document_type_id. */
  uploaded:     ApplicationDocument[]
  /** Called for each file the user picks. Returns a promise so the UI can show loading. */
  onUpload:     (args: { document_type_id: number; file: File }) => Promise<unknown>
  /** react-query keys to invalidate after a successful upload. */
  invalidateKeys?: unknown[][]
  /** Optional empty state when no requirements exist for this applicant yet. */
  emptyHint?:   string
}

/**
 * Inline per-requirement document uploader.
 */
export default function DocumentsUploader({
  requirements, uploaded, onUpload, invalidateKeys, emptyHint,
}: DocumentsUploaderProps) {
  const qc = useQueryClient()

  if (requirements.length === 0) {
    return (
      <div className="text-center py-8">
        <FileText className="w-10 h-10 text-ink-200 mx-auto mb-3" />
        <p className="text-[13px] text-ink-500 max-w-[280px] mx-auto leading-relaxed">
          {emptyHint ?? 'No document requirements were configured for your faculty and academic year.'}
        </p>
      </div>
    )
  }

  const byType: Record<number, ApplicationDocument | undefined> = {}
  for (const d of uploaded) byType[d.document_type_id] = d

  return (
    <ul className="space-y-3">
      {requirements.map((r) => (
        <Row
          key={r.id}
          requirement={r}
          existing={byType[r.document_type_id]}
          onUpload={onUpload}
          onDone={() => {
            if (invalidateKeys) {
               invalidateKeys.forEach(key => qc.invalidateQueries({ queryKey: key }))
            }
          }}
        />
      ))}
    </ul>
  )
}

function Row({
  requirement, existing, onUpload, onDone,
}: {
  requirement: AdmissionRequirement
  existing?:   ApplicationDocument
  onUpload:    (args: { document_type_id: number; file: File }) => Promise<unknown>
  onDone:      () => void
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [dragging, setDragging] = useState(false)
  const [previewOpen, setPreviewOpen] = useState(false)

  const upload = useMutation({
    mutationFn: (file: File) => onUpload({ document_type_id: requirement.document_type_id, file }),
    onSuccess: () => {
      toast.success(`${requirement.document_type_name ?? 'Document'} uploaded successfully`)
      onDone()
    },
    onError: (e: any) => toast.error(e?.response?.data?.message ?? 'Upload failed'),
  })

  const handleFiles = (files: FileList | null) => {
    if (!files || files.length === 0) return
    const f = files[0]
    
    if (requirement.allowed_extensions) {
      const allowed = requirement.allowed_extensions.split(',').map(e => e.trim().toLowerCase())
      const ext = f.name.split('.').pop()?.toLowerCase()
      if (!ext || !allowed.includes(ext)) {
        toast.error(`Invalid file type. Allowed: ${allowed.join(', ')}`)
        return
      }
    }

    if (f.size > 10 * 1024 * 1024) {
      toast.error('File size exceeds the 10MB limit.')
      return
    }
    upload.mutate(f)
  }

  const isReplace = !!existing
  const isVerified = existing?.verification_status === 'verified'

  return (
    <>
      <li
        className={`rounded-2xl border transition-all ${dragging ? 'border-primary-500 bg-primary-50/50 dark:bg-primary-900/10' : 'border-ink-100 dark:border-ink-800 bg-white dark:bg-ink-900/30'} p-4`}
        onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => { e.preventDefault(); setDragging(false); handleFiles(e.dataTransfer.files) }}
      >
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-start gap-3 min-w-0">
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${isReplace ? 'bg-emerald-50 dark:bg-emerald-900/10 text-emerald-600' : 'bg-ink-50 dark:bg-ink-800 text-ink-400'}`}>
               <FileText className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <p className="text-[14px] font-bold text-ink-900 dark:text-white">
                  {requirement.document_type_name || requirement.document_name}
                </p>
                {requirement.is_required ? (
                  <span className="text-[9px] font-black uppercase tracking-widest text-red-500 bg-red-50 dark:bg-red-900/20 px-1.5 py-0.5 rounded">Required</span>
                ) : (
                  <span className="text-[9px] font-black uppercase tracking-widest text-ink-400 bg-ink-50 dark:bg-ink-800 px-1.5 py-0.5 rounded">Optional</span>
                )}
                {existing && <VerifChip s={existing.verification_status} />}
              </div>
              
              {existing ? (
                <p className="text-[12px] text-ink-500 truncate mt-0.5 flex items-center gap-1.5">
                  <Paperclip className="w-3 h-3" /> {existing.file_original_name}
                </p>
              ) : (
                <p className="text-[12px] text-ink-400 italic mt-0.5">Not uploaded yet</p>
              )}

              {existing?.rejection_notes && (
                <div className="mt-2 p-2 rounded-lg bg-red-50 dark:bg-red-900/10 border border-red-100 dark:border-red-900/20">
                  <p className="text-[11px] font-bold text-red-700 dark:text-red-400 uppercase tracking-tighter">Correction Required:</p>
                  <p className="text-[12px] text-red-600 dark:text-red-300 mt-0.5">{existing.rejection_notes}</p>
                </div>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
            <input
              ref={inputRef}
              type="file"
              accept={requirement.allowed_extensions ? requirement.allowed_extensions.split(',').map(e => '.' + e.trim()).join(',') : ".pdf,.jpg,.jpeg,.png,.webp"}
              className="hidden"
              onChange={(e) => handleFiles(e.target.files)}
            />
            
            {existing && (
              <button
                type="button"
                className="btn-secondary btn-sm h-9 px-3"
                onClick={() => setPreviewOpen(true)}
              >
                <Eye className="w-3.5 h-3.5" /> View
              </button>
            )}

            {!isVerified && (
              <button
                type="button"
                className={isReplace ? 'btn-secondary btn-sm h-9 px-3' : 'btn-primary btn-sm h-9 px-3'}
                onClick={() => inputRef.current?.click()}
                disabled={upload.isPending}
              >
                {upload.isPending ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <UploadCloud className="w-3.5 h-3.5" />
                )}
                {isReplace ? 'Replace' : 'Upload'}
              </button>
            )}
          </div>
        </div>
      </li>

      {existing && (
        <DocumentPreviewModal
          open={previewOpen}
          onClose={() => setPreviewOpen(false)}
          title={requirement.document_type_name || "Document Preview"}
          url={applicantService.downloadUrl(existing.id)}
          mimeType={existing.file_mime ?? undefined}
        />
      )}
    </>
  )
}

function VerifChip({ s }: { s: 'pending' | 'verified' | 'rejected' }) {
  if (s === 'verified') return <span className="flex items-center gap-1 text-[10px] font-black uppercase text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/20 px-1.5 py-0.5 rounded"><CheckCircle2 className="w-3 h-3" /> Verified</span>
  if (s === 'rejected') return <span className="flex items-center gap-1 text-[10px] font-black uppercase text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 px-1.5 py-0.5 rounded"><XCircle className="w-3 h-3" /> Rejected</span>
  return <span className="flex items-center gap-1 text-[10px] font-black uppercase text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 px-1.5 py-0.5 rounded"><Clock className="w-3 h-3" /> Pending</span>
}
