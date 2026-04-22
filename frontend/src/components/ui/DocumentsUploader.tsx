import { useRef, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import {
  UploadCloud, FileText, Loader2, CheckCircle2, XCircle, Clock, Paperclip,
} from 'lucide-react'
import type { AdmissionRequirement, ApplicationDocument } from '@/types/admission'

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
 * Inline per-requirement document uploader. For each requirement, shows:
 *   - the document name + required/optional badge
 *   - the already-uploaded file (with verification status), if any
 *   - a single "Upload" file picker that replaces the file for that type
 */
export default function DocumentsUploader({
  requirements, uploaded, onUpload, invalidateKeys, emptyHint,
}: DocumentsUploaderProps) {
  const qc = useQueryClient()

  if (requirements.length === 0) {
    return (
      <p className="text-[13px] text-ink-500">
        {emptyHint ?? 'No document requirements were configured for your faculty and academic year.'}
      </p>
    )
  }

  const byType: Record<number, ApplicationDocument | undefined> = {}
  for (const d of uploaded) byType[d.document_type_id] = d

  return (
    <ul className="space-y-2.5">
      {requirements.map((r) => (
        <Row
          key={r.id}
          requirement={r}
          existing={byType[r.document_type_id]}
          onUpload={onUpload}
          onDone={() => {
            for (const key of invalidateKeys ?? []) qc.invalidateQueries({ queryKey: key })
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

  const upload = useMutation({
    mutationFn: (file: File) => onUpload({ document_type_id: requirement.document_type_id, file }),
    onSuccess: () => {
      toast.success(`${requirement.document_type_name ?? 'Document'} uploaded`)
      onDone()
    },
    onError: (e: any) => toast.error(e?.response?.data?.message ?? 'Upload failed'),
  })

  const handleFiles = (files: FileList | null) => {
    if (!files || files.length === 0) return
    const f = files[0]
    if (f.size > 10 * 1024 * 1024) {
      toast.error('File is larger than 10MB.')
      return
    }
    upload.mutate(f)
  }

  const statusChip = existing ? <VerifChip s={existing.verification_status} /> : null
  const isReplace  = !!existing

  return (
    <li
      className={`rounded-md border ${dragging ? 'border-brand bg-brand/5' : 'border-ink-100 dark:border-ink-700 bg-white dark:bg-ink-800/40'} p-3 transition-colors`}
      onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => { e.preventDefault(); setDragging(false); handleFiles(e.dataTransfer.files) }}
    >
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="flex items-start gap-2.5 min-w-0">
          <FileText className="w-4 h-4 text-ink-400 shrink-0 mt-0.5" />
          <div className="min-w-0">
            <p className="text-[13.5px] font-medium text-ink-800 dark:text-ink-100 flex items-center gap-2 flex-wrap">
              {requirement.document_type_name ?? `Document #${requirement.document_type_id}`}
              {requirement.is_required
                ? <span className="chip-primary">Required</span>
                : <span className="chip-soft">Optional</span>}
              {statusChip}
            </p>
            {existing?.file_original_name && (
              <p className="text-[11.5px] text-ink-500 truncate mt-0.5">
                <Paperclip className="w-3 h-3 inline mr-1" />
                {existing.file_original_name}
              </p>
            )}
            {requirement.notes && (
              <p className="text-[11.5px] text-ink-500 mt-0.5">{requirement.notes}</p>
            )}
            {existing?.rejection_notes && (
              <p className="text-[12px] text-red-700 dark:text-red-300 mt-1">
                Reviewer: {existing.rejection_notes}
              </p>
            )}
          </div>
        </div>

        <div className="shrink-0">
          <input
            ref={inputRef}
            type="file"
            accept=".pdf,.jpg,.jpeg,.png,.webp"
            className="hidden"
            onChange={(e) => handleFiles(e.target.files)}
          />
          <button
            type="button"
            className={isReplace ? 'btn-secondary btn-sm' : 'btn-primary btn-sm'}
            onClick={() => inputRef.current?.click()}
            disabled={upload.isPending || existing?.verification_status === 'verified'}
            title={existing?.verification_status === 'verified' ? 'Verified files cannot be changed' : ''}
          >
            {upload.isPending
              ? <Loader2 className="w-3 h-3 animate-spin" />
              : <UploadCloud className="w-3 h-3" />}
            {isReplace ? 'Replace' : 'Upload'}
          </button>
        </div>
      </div>
    </li>
  )
}

function VerifChip({ s }: { s: 'pending' | 'verified' | 'rejected' }) {
  if (s === 'verified') return <span className="chip-success"><CheckCircle2 className="w-3 h-3" /> Verified</span>
  if (s === 'rejected') return <span className="chip-danger"><XCircle className="w-3 h-3" /> Rejected</span>
  return <span className="chip-warning"><Clock className="w-3 h-3" /> Pending</span>
}
