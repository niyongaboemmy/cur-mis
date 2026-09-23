import { useQuery } from '@tanstack/react-query'
import { Loader2, CheckCircle2, AlertCircle } from 'lucide-react'
import Modal from '@/components/ui/Modal'
import { studentService } from '@/services/studentService'
import {
  ComplianceSummary,
  RequirementList,
  NotifyStudentPanel,
} from '@/components/students/DocumentCompliancePanel'

interface DocumentChecklistModalProps {
  open: boolean
  onClose: () => void
  /** students.id — the checklist is resolved server-side from this. */
  studentId: number
  regNumber?: string | null
  studentName: string
  programme?: string
}

/**
 * Focused view of the required-documents checklist for one student.
 *
 * Reads the same `student-documents` query the Documents tab uses, so what
 * the modal reports is exactly what the server detected: each configured
 * requirement for the student's programme category matched against their
 * uploads by document type. Nothing here is edited by hand — the checklist
 * itself is configured under Admissions → Required student documents, and
 * a document's status changes when it is uploaded or verified.
 */
export default function DocumentChecklistModal({
  open,
  onClose,
  studentId,
  regNumber,
  studentName,
  programme,
}: DocumentChecklistModalProps) {
  const docsQ = useQuery({
    queryKey: ['student-documents', studentId],
    queryFn: () => studentService.listDocuments(studentId),
    enabled: open && !!studentId,
  })

  const checklist = docsQ.data?.data?.checklist ?? null
  const contact   = docsQ.data?.data?.student_contact
  const s = checklist?.summary

  return (
    <Modal open={open} onClose={onClose} title={`Document checklist — ${studentName}`} size="lg">
      <div className="space-y-4 py-2">
        {/* Student strip */}
        <div className="rounded-lg bg-ink-50 dark:bg-ink-800/60 border border-ink-200 dark:border-ink-700 p-3 grid grid-cols-2 sm:grid-cols-3 gap-3 text-sm">
          <div>
            <p className="text-[10.5px] text-ink-500 font-semibold uppercase tracking-wider">Reg. number</p>
            <p className="text-ink-900 dark:text-white font-mono text-[13px]">{regNumber || `#${studentId}`}</p>
          </div>
          <div>
            <p className="text-[10.5px] text-ink-500 font-semibold uppercase tracking-wider">Category</p>
            <p className="text-ink-900 dark:text-white text-[13px]">{checklist?.programme_category_label ?? '—'}</p>
          </div>
          {programme && (
            <div className="col-span-2 sm:col-span-1 min-w-0">
              <p className="text-[10.5px] text-ink-500 font-semibold uppercase tracking-wider">Programme</p>
              <p className="text-ink-900 dark:text-white text-[13px] truncate" title={programme}>{programme}</p>
            </div>
          )}
        </div>

        {docsQ.isLoading || !checklist ? (
          <div className="flex items-center justify-center py-12">
            {docsQ.isError
              ? <p className="text-rose-600 text-sm">Could not load the checklist.</p>
              : <Loader2 className="w-6 h-6 text-brand animate-spin" />}
          </div>
        ) : (
          <>
            <ComplianceSummary checklist={checklist} />

            {/* Legend */}
            {checklist.configured && s && (
              <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11.5px] text-ink-500">
                <span className="inline-flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-emerald-500" /> Verified {s.verified}</span>
                <span className="inline-flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-amber-400" /> Pending {s.pending}</span>
                <span className="inline-flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-rose-500" /> Rejected {s.rejected}</span>
                <span className="inline-flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-red-500" /> Not uploaded {s.missing}</span>
                {s.optional_missing > 0 && <span>· {s.optional_missing} optional not uploaded</span>}
              </div>
            )}

            <div className="max-h-[50vh] overflow-y-auto pr-1">
              <RequirementList checklist={checklist} studentId={studentId} compact />
            </div>

            {checklist.configured && checklist.outstanding.length > 0 && (
              <NotifyStudentPanel studentId={studentId} checklist={checklist} contact={contact} />
            )}

            {checklist.configured && checklist.is_complete && (
              <div className="p-3 rounded-lg bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-300 dark:border-emerald-700 flex items-center gap-3">
                <CheckCircle2 className="w-5 h-5 text-emerald-600 dark:text-emerald-400 shrink-0" />
                <p className="text-[13px] text-emerald-900 dark:text-emerald-200">
                  Every required document is on file and verified. Nothing to chase.
                </p>
              </div>
            )}

            {checklist.configured && !checklist.is_complete && checklist.outstanding.length === 0 && (
              <div className="p-3 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-300 dark:border-amber-700 flex items-center gap-3">
                <AlertCircle className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0" />
                <p className="text-[13px] text-amber-900 dark:text-amber-200">
                  All required documents are uploaded; some still need verification by the registry.
                </p>
              </div>
            )}
          </>
        )}

        <div className="flex justify-end pt-2 border-t border-ink-200 dark:border-ink-700">
          <button onClick={onClose} className="btn-secondary">Close</button>
        </div>
      </div>
    </Modal>
  )
}
