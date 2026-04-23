import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { 
  FileText, Upload, Trash2, ExternalLink, Info, 
  GraduationCap, Plus, Pencil, Star, Loader2, CheckCircle2, XCircle, Clock,
  ArrowRight, ArrowLeft, UploadCloud
} from 'lucide-react'
import { applicantService, portalService } from '@/services/admissionService'
import { Card, SectionHeader, Loading, Field } from '@/components/applicant/ApplicantPortalShared'
import Modal from '@/components/ui/Modal'
import type { ApplicationDocument, AcademicRecord } from '@/types/admission'

export default function ApplicantDocumentsPage() {
  const qc = useQueryClient()
  
  // Queries
  const docsQ = useQuery({ 
    queryKey: ['applicant', 'documents'], 
    queryFn: () => applicantService.listDocuments() 
  })
  
  const recordsQ = useQuery({ 
    queryKey: ['applicant', 'records'], 
    queryFn: () => applicantService.listAcademicRecords() 
  })

  const typesQ = useQuery({
    queryKey: ['portal', 'document-types'],
    queryFn: () => portalService.getDocumentTypes()
  })

  // Mutations
  const removeDoc = useMutation({
    mutationFn: (id: number) => applicantService.deleteDocument(id),
    onSuccess: () => {
      toast.success('Document removed')
      qc.invalidateQueries({ queryKey: ['applicant', 'documents'] })
      qc.invalidateQueries({ queryKey: ['applicant', 'records'] })
    }
  })

  const [editingRecord, setEditingRecord] = useState<Partial<AcademicRecord> | null>(null)
  const [showUploadModal, setShowUploadModal] = useState(false)

  const docs = docsQ.data?.data?.documents ?? []
  const records = recordsQ.data?.data ?? []
  const types = typesQ.data?.data ?? []

  return (
    <div className="max-w-6xl mx-auto space-y-8">
      {/* 1. Academic Records & Transcripts */}
      <Card>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <SectionHeader 
            title="Academic Records" 
            sub="Manage your education history and attach your diplomas/transcripts here." 
          />
          <button className="btn-primary" onClick={() => setEditingRecord({})}>
            <Plus className="w-4 h-4" /> Add Academic Record
          </button>
        </div>
        
        <div className="mt-6">
          {recordsQ.isLoading ? <Loading /> : records.length === 0 ? (
            <div className="text-center py-12 border-2 border-dashed border-ink-100 dark:border-ink-700 rounded-2xl">
              <GraduationCap className="w-12 h-12 text-ink-300 mx-auto mb-3" />
              <p className="text-[14px] text-ink-500 font-medium">No academic records added yet.</p>
              <p className="text-[12.5px] text-ink-400 mt-1">Add your high school or university background.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              {records.map(rec => (
                <RecordCard key={rec.id} record={rec} onEdit={() => setEditingRecord(rec)} />
              ))}
            </div>
          )}
        </div>
      </Card>

      {/* 2. All Attachments (Responsive Grid) */}
      <Card>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <SectionHeader 
            title="Attachments Library" 
            sub="All files uploaded to your profile, including application requirements." 
          />
          <button className="btn-secondary" onClick={() => setShowUploadModal(true)}>
            <UploadCloud className="w-4 h-4" /> Upload Attachment
          </button>
        </div>
        
        <div className="mt-8">
          {docsQ.isLoading ? <Loading /> : docs.length === 0 ? (
            <div className="text-center py-12 border-2 border-dashed border-ink-100 dark:border-ink-700 rounded-2xl">
              <FileText className="w-12 h-12 text-ink-300 mx-auto mb-3" />
              <p className="text-[14px] text-ink-500 font-medium">Your attachment library is empty.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {docs.map(doc => (
                <DocumentCard key={doc.id} doc={doc} onDelete={() => removeDoc.mutate(doc.id)} />
              ))}
            </div>
          )}
        </div>
      </Card>

      {editingRecord !== null && (
        <TwoStepRecordModal 
          rec={editingRecord} 
          documents={docs}
          types={types}
          onClose={() => setEditingRecord(null)} 
          onSaved={() => {
            qc.invalidateQueries({ queryKey: ['applicant', 'records'] })
            qc.invalidateQueries({ queryKey: ['applicant', 'documents'] })
            setEditingRecord(null)
          }}
        />
      )}

      {showUploadModal && (
        <UploadDocumentModal 
          types={types} 
          onClose={() => setShowUploadModal(false)} 
          onSuccess={() => {
            qc.invalidateQueries({ queryKey: ['applicant', 'documents'] })
            setShowUploadModal(false)
          }}
        />
      )}
    </div>
  )
}

function RecordCard({ record, onEdit }: { record: AcademicRecord, onEdit: () => void }) {
  const status = record.doc_status || 'missing'
  
  return (
    <div className="p-5 rounded-2xl border border-ink-100 dark:border-ink-700 bg-white dark:bg-ink-800/50 hover:border-primary-300 dark:hover:border-primary-700 transition-all group relative overflow-hidden">
      <div className="flex items-start justify-between gap-3 relative z-10">
        <div className="min-w-0">
          <div className="flex items-center gap-2 mb-1.5">
            <h4 className="font-bold text-ink-900 dark:text-white truncate text-[15px]">{record.institution_name}</h4>
            {record.is_primary === 1 && (
              <span className="px-2 py-0.5 rounded-full bg-primary-100 dark:bg-primary-900/40 text-primary-700 dark:text-primary-300 text-[9px] font-bold uppercase tracking-wider flex items-center gap-1 shrink-0">
                <Star className="w-2.5 h-2.5 fill-current" /> Primary
              </span>
            )}
          </div>
          <p className="text-[13px] text-ink-600 dark:text-ink-400 font-medium">
            {record.qualification}
          </p>
          <p className="text-[12px] text-ink-400 mt-0.5">
            Grade: <span className="text-ink-700 dark:text-ink-200">{record.grade}</span> · Year: <span className="text-ink-700 dark:text-ink-200">{record.year_completed}</span>
          </p>
        </div>
        <button onClick={onEdit} className="p-2 rounded-xl hover:bg-primary-50 dark:hover:bg-primary-900/30 text-ink-400 hover:text-primary-600 transition-colors shrink-0">
          <Pencil className="w-4 h-4" />
        </button>
      </div>
      
      <div className="mt-5 pt-4 border-t border-ink-50 dark:border-ink-800 flex items-center justify-between relative z-10">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${record.document_id ? 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600' : 'bg-amber-50 dark:bg-amber-900/20 text-amber-600'}`}>
            <FileText className="w-4.5 h-4.5" />
          </div>
          <div className="min-w-0">
            <p className="text-[12px] font-semibold text-ink-700 dark:text-ink-200 truncate max-w-[180px]">
              {record.document_id ? record.file_original_name : 'No Attachment'}
            </p>
            <StatusBadge status={status as any} />
          </div>
        </div>
      </div>
    </div>
  )
}

function DocumentCard({ doc, onDelete }: { doc: ApplicationDocument, onDelete: () => void }) {
  return (
    <div className="p-4 rounded-2xl border border-ink-100 dark:border-ink-700 bg-white dark:bg-ink-800/40 hover:shadow-md hover:border-primary-200 dark:hover:border-primary-800 transition-all group">
      <div className="flex items-start justify-between gap-3 mb-4">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-10 h-10 rounded-2xl bg-primary-50 dark:bg-primary-900/20 flex items-center justify-center text-primary-600 group-hover:scale-110 transition-transform shrink-0">
            <FileText className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            {/* Show document type name as primary, original filename as secondary */}
            <p className="font-bold text-ink-900 dark:text-white truncate text-[14px]">{doc.document_type_name}</p>
            <p className="text-[11px] text-ink-400 truncate">{doc.file_original_name}</p>
          </div>
        </div>
        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
          <a 
            href={applicantService.downloadUrl(doc.id)}
            target="_blank"
            className="p-1.5 rounded-lg hover:bg-ink-100 dark:hover:bg-ink-700 text-ink-500 transition-colors"
          >
            <ExternalLink className="w-3.5 h-3.5" />
          </a>
          {doc.verification_status !== 'verified' && (
            <button 
              onClick={() => confirm('Delete this document?') && onDelete()}
              className="p-1.5 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 text-red-500 transition-colors"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>
      
      <div className="space-y-3">
        <div className="flex flex-wrap gap-1.5">
          {doc.usage && doc.usage.length > 0 ? doc.usage.map((u, i) => (
            <span key={i} className="text-[10px] font-medium text-primary-700 dark:text-primary-300 bg-primary-50 dark:bg-primary-900/30 px-2 py-0.5 rounded-full border border-primary-100 dark:border-primary-800/50">
              {u}
            </span>
          )) : (
            <span className="text-[10px] text-ink-400 italic">Unused</span>
          )}
        </div>
        
        <div className="flex items-center justify-between pt-2 border-t border-ink-50 dark:border-ink-800/50">
          <p className="text-[10px] text-ink-400 font-medium">{(doc.file_size! / 1024).toFixed(1)} KB · {new Date(doc.uploaded_at!).toLocaleDateString()}</p>
          <StatusBadge status={doc.verification_status} />
        </div>
      </div>
    </div>
  )
}

function StatusBadge({ status }: { status: 'pending' | 'verified' | 'rejected' | 'missing' }) {
  const configs = {
    pending: { icon: Clock, label: 'Pending', class: 'text-amber-600 bg-amber-50 dark:bg-amber-900/20' },
    verified: { icon: CheckCircle2, label: 'Verified', class: 'text-emerald-600 bg-emerald-50 dark:bg-emerald-900/20' },
    rejected: { icon: XCircle, label: 'Rejected', class: 'text-red-600 bg-red-50 dark:bg-red-900/20' },
    missing: { icon: Info, label: 'Missing', class: 'text-ink-400 bg-ink-50 dark:bg-ink-800' }
  }
  const cfg = configs[status] || configs.pending
  return (
    <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-tight ${cfg.class}`}>
      <cfg.icon className="w-2.5 h-2.5" /> {cfg.label}
    </span>
  )
}

/** 2-STEP RECORD MODAL */
function TwoStepRecordModal({ rec, documents, types, onClose, onSaved }: { 
  rec: Partial<AcademicRecord>, 
  documents: ApplicationDocument[], 
  types: any[],
  onClose: () => void, 
  onSaved: () => void 
}) {
  const [step, setStep] = useState(1)
  const [busy, setBusy] = useState(false)
  const [form, setForm] = useState({
    institution_name: rec.institution_name ?? '',
    qualification: rec.qualification ?? '',
    grade: rec.grade ?? '',
    combination: rec.combination ?? '',
    year_completed: rec.year_completed ?? new Date().getFullYear(),
    document_id: rec.document_id ?? null,
    is_primary: rec.is_primary ?? 0
  })

  const [uploadState, setUploadState] = useState<{ busy: boolean, file: File | null, typeId: number | null }>({
    busy: false,
    file: null,
    typeId: null
  })

  const saveRecord = async (finalDocId: number | null = form.document_id) => {
    setBusy(true)
    try {
      const payload = { ...form, document_id: finalDocId }
      if (rec.id) await applicantService.updateAcademicRecord(rec.id, payload)
      else await applicantService.addAcademicRecord(payload as any)
      toast.success('Academic record saved successfully')
      onSaved()
    } catch (e: any) {
      toast.error(e?.response?.data?.message ?? 'Failed to save record')
    } finally {
      setBusy(false)
    }
  }

  const handleUploadAndSave = async () => {
    if (!uploadState.file || !uploadState.typeId) {
      toast.error('Please pick a file and document type')
      return
    }
    setUploadState(s => ({ ...s, busy: true }))
    try {
      const res = await applicantService.uploadDocument({ 
        document_type_id: uploadState.typeId as number, 
        file: uploadState.file 
      })
      if (res.data) {
        await saveRecord(res.data.id)
      }
    } catch (e: any) {
      toast.error(e?.response?.data?.message ?? 'Upload failed')
    } finally {
      setUploadState(s => ({ ...s, busy: false }))
    }
  }

  return (
    <Modal 
      open 
      onClose={onClose} 
      title={step === 1 ? 'Step 1: Institution Details' : 'Step 2: Attach Diploma/Transcript'}
      footer={
        <div className="flex items-center justify-between w-full">
          <div>
            {step === 2 && (
              <button className="btn-secondary" onClick={() => setStep(1)} disabled={busy || uploadState.busy}>
                <ArrowLeft className="w-4 h-4" /> Back
              </button>
            )}
          </div>
          <div className="flex gap-2">
            <button className="btn-secondary" onClick={onClose}>Cancel</button>
            {step === 1 ? (
              <button className="btn-primary" onClick={() => setStep(2)}>
                Next Step <ArrowRight className="w-4 h-4" />
              </button>
            ) : (
              <button 
                className="btn-primary" 
                onClick={uploadState.file ? handleUploadAndSave : () => saveRecord()} 
                disabled={busy || uploadState.busy}
              >
                {(busy || uploadState.busy) ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Finish & Save'}
              </button>
            )}
          </div>
        </div>
      }
    >
      {step === 1 ? (
        <div className="space-y-4 animate-in fade-in slide-in-from-right-4 duration-300">
          <Field label="Institution Name">
            <input 
              className="input" 
              value={form.institution_name} 
              onChange={e => setForm({...form, institution_name: e.target.value})} 
              placeholder="e.g. University of Rwanda"
            />
          </Field>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Qualification">
              <input className="input" value={form.qualification} onChange={e => setForm({...form, qualification: e.target.value})} />
            </Field>
            <Field label="Grade / Mean Grade">
              <input className="input" value={form.grade} onChange={e => setForm({...form, grade: e.target.value})} />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Combination (if applicable)">
              <input className="input" value={form.combination} onChange={e => setForm({...form, combination: e.target.value})} />
            </Field>
            <Field label="Year Completed">
              <input type="number" className="input" value={form.year_completed} onChange={e => setForm({...form, year_completed: Number(e.target.value)})} />
            </Field>
          </div>
          <div className="pt-2">
            <label className="flex items-center gap-3 cursor-pointer group">
              <input 
                type="checkbox" 
                className="w-5 h-5 rounded-lg border-ink-300 text-primary-600 focus:ring-primary-500 transition-all cursor-pointer" 
                checked={form.is_primary === 1} 
                onChange={e => setForm({...form, is_primary: e.target.checked ? 1 : 0})} 
              />
              <span className="text-[13.5px] font-bold text-ink-700 dark:text-ink-200 group-hover:text-primary-600 transition-colors">
                Mark as Primary Academic Record
              </span>
            </label>
            <p className="text-[11.5px] text-ink-400 mt-1 ml-8 italic">
              The primary record is typically your most recent qualification (e.g. S6 or Bachelor's).
            </p>
          </div>
        </div>
      ) : (
        <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
          <div className="p-4 bg-primary-50 dark:bg-primary-900/20 border border-primary-100 dark:border-primary-800 rounded-2xl flex gap-3">
            <Info className="w-5 h-5 text-primary-600 shrink-0 mt-0.5" />
            <p className="text-[12.5px] text-primary-800 dark:text-primary-200 leading-relaxed">
              Attach a scanned copy of your diploma or transcript for verification. You can pick an existing file or upload a new one.
            </p>
          </div>

          <Field label="Choose from existing attachments">
            <select 
              className="input select-custom" 
              value={form.document_id || ''} 
              onChange={e => {
                setForm({...form, document_id: e.target.value ? Number(e.target.value) : null})
                setUploadState({ ...uploadState, file: null }) // Reset upload if picking existing
              }}
            >
              <option value="">-- No existing attachment --</option>
              {documents.map(d => (
                <option key={d.id} value={d.id}>
                  {d.document_type_name} ({d.file_original_name})
                </option>
              ))}
            </select>
          </Field>

          <div className="relative py-4">
            <div className="absolute inset-0 flex items-center"><span className="w-full border-t border-ink-100 dark:border-ink-800" /></div>
            <div className="relative flex justify-center"><span className="bg-white dark:bg-ink-900 px-3 text-[11px] font-bold text-ink-300 uppercase tracking-widest">Or upload new</span></div>
          </div>

          <div className="space-y-4">
            <Field label="Document Type">
              <select 
                className="input" 
                value={uploadState.typeId || ''} 
                onChange={e => setUploadState({ ...uploadState, typeId: e.target.value ? Number(e.target.value) : null })}
              >
                <option value="">-- Select Type --</option>
                {types.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </Field>
            
            <div 
              className={`border-2 border-dashed rounded-2xl p-8 text-center transition-colors cursor-pointer ${uploadState.file ? 'border-emerald-400 bg-emerald-50 dark:bg-emerald-900/10' : 'border-ink-200 dark:border-ink-700 hover:border-primary-400'}`}
              onClick={() => document.getElementById('new-rec-upload')?.click()}
            >
              <UploadCloud className={`w-8 h-8 mx-auto mb-2 ${uploadState.file ? 'text-emerald-500' : 'text-ink-300'}`} />
              <p className="text-[13px] font-medium text-ink-700 dark:text-ink-200">
                {uploadState.file ? uploadState.file.name : 'Click to select or drag diploma file'}
              </p>
              <p className="text-[11px] text-ink-400 mt-1">PDF, JPG, PNG (Max 5MB)</p>
              <input 
                id="new-rec-upload" 
                type="file" 
                className="hidden" 
                onChange={e => {
                  if (e.target.files?.[0]) {
                    setUploadState({ ...uploadState, file: e.target.files[0] })
                    setForm({ ...form, document_id: null }) // Clear existing if uploading new
                  }
                }} 
              />
            </div>
          </div>
        </div>
      )}
    </Modal>
  )
}

/** GENERAL UPLOAD MODAL */
function UploadDocumentModal({ types, onClose, onSuccess }: { types: any[], onClose: () => void, onSuccess: () => void }) {
  const [file, setFile] = useState<File | null>(null)
  const [typeId, setTypeId] = useState<number | null>(null)
  const [busy, setBusy] = useState(false)

  const upload = async () => {
    if (!file || !typeId) return
    setBusy(true)
    try {
      await applicantService.uploadDocument({ document_type_id: typeId, file })
      toast.success('Document uploaded to your library')
      onSuccess()
    } catch (e: any) {
      toast.error(e?.response?.data?.message ?? 'Upload failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal 
      open 
      onClose={onClose} 
      title="Upload New Attachment"
      footer={<><button className="btn-secondary" onClick={onClose}>Cancel</button><button className="btn-primary" onClick={upload} disabled={busy || !file || !typeId}>{busy ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Upload File'}</button></>}
    >
      <div className="space-y-4">
        <Field label="Document Category / Type">
          <select className="input" value={typeId || ''} onChange={e => setTypeId(e.target.value ? Number(e.target.value) : null)}>
            <option value="">-- select document type --</option>
            {types.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        </Field>
        <div 
          className="border-2 border-dashed border-ink-200 dark:border-ink-700 rounded-2xl p-10 text-center hover:border-primary-400 transition-colors cursor-pointer"
          onClick={() => document.getElementById('gen-upload')?.click()}
        >
          <Upload className="w-10 h-10 text-ink-300 mx-auto mb-3" />
          <p className="text-[14px] font-medium text-ink-800 dark:text-ink-100">{file ? file.name : 'Select file to upload'}</p>
          <p className="text-[12px] text-ink-400 mt-1">Files are securely stored and encrypted.</p>
          <input id="gen-upload" type="file" className="hidden" onChange={e => e.target.files?.[0] && setFile(e.target.files[0])} />
        </div>
      </div>
    </Modal>
  )
}
