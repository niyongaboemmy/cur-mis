import { useCallback, useMemo, useRef, useState } from 'react'
import {
  X, Upload, Download, FileSpreadsheet, AlertCircle, CheckCircle2,
  Loader2, ArrowLeft, ArrowRight, Search, Pencil, Plus, RefreshCw,
} from 'lucide-react'
import { toast } from 'react-hot-toast'
import ModalPortal from '@/components/ui/ModalPortal'
import type {
  BulkValidateResponse, BulkPreviewRow, BulkPatchedRow,
} from '@/services/studentService'

export interface BulkUploadResult {
  inserted: number
  updated?: number
  /** Existing rows the importer touched but didn't need to write
   *  anything for (every provided value already matched). */
  unchanged?: number
  skipped?: number
  errors:   Array<{ row: number; message: string }>
}

interface Props {
  open:    boolean
  onClose: () => void
  /** Modal title (e.g. "Bulk import students"). */
  title:   string
  /** Short helper text shown under the title in step 1. */
  description?: string
  /** Direct URL the "Download template" button navigates to. */
  templateUrl: string
  /** Field keys that must be filled — surface them in the legend and
   *  flag every blank value in red. */
  requiredFields: string[]
  /** Friendlier labels for header columns, used in the preview table.
   *  Anything missing falls back to the raw header key. */
  fieldLabels?: Record<string, string>
  /** Server-side dry-run. */
  onValidate: (file: File) => Promise<{ data: BulkValidateResponse | null }>
  /** Server-side commit. The modal forwards any in-UI corrections
   *  (only the cells the user actually edited). */
  onUpload:   (file: File, patches: BulkPatchedRow[]) => Promise<{ data: BulkUploadResult | null }>
  /** Called after a successful commit (e.g. to refetch the list). */
  onSuccess?: () => void
}

type Step = 'pick' | 'preview' | 'done'

export default function BulkUploadModal({
  open, onClose, title, description, templateUrl,
  requiredFields, fieldLabels, onValidate, onUpload, onSuccess,
}: Props) {
  const [step, setStep] = useState<Step>('pick')
  const [file, setFile] = useState<File | null>(null)
  const [validating, setValidating] = useState(false)
  const [uploading, setUploading]   = useState(false)
  const [preview, setPreview]       = useState<BulkValidateResponse | null>(null)
  const [patches, setPatches]       = useState<Record<number, Record<string, string>>>({})
  const [filter, setFilter]         = useState<'all' | 'errors' | 'create' | 'update'>('all')
  const [search, setSearch]         = useState('')
  const [result, setResult]         = useState<BulkUploadResult | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const fieldLabel = useCallback(
    (key: string) => fieldLabels?.[key] ?? key.replace(/_/g, ' '),
    [fieldLabels],
  )

  const reset = () => {
    setStep('pick'); setFile(null); setPreview(null); setPatches({})
    setResult(null); setFilter('all'); setSearch('')
  }
  const closeAndReset = () => { reset(); onClose() }

  const pickFile = (next: File | null) => {
    setFile(next); setPreview(null); setPatches({})
  }

  const runValidate = async () => {
    if (!file) return
    setValidating(true)
    try {
      const res = await onValidate(file)
      if (!res.data) throw new Error('Empty preview response.')
      setPreview(res.data); setStep('preview')
    } catch (e: any) {
      toast.error(e?.response?.data?.message ?? e?.message ?? 'Could not preview the file.')
    } finally {
      setValidating(false)
    }
  }

  const runUpload = async () => {
    if (!file || !preview) return
    setUploading(true)
    try {
      const list: BulkPatchedRow[] = Object.entries(patches)
        .filter(([, data]) => Object.keys(data).length > 0)
        .map(([row_no, data]) => ({ row_no: Number(row_no), data }))
      const res = await onUpload(file, list)
      const data = res.data ?? { inserted: 0, errors: [] }
      setResult(data); setStep('done')
      onSuccess?.()
      const wrote = (data.inserted ?? 0) + (data.updated ?? 0)
      const noop  = data.unchanged ?? 0
      toast.success(
        wrote > 0
          ? `Imported ${wrote} row(s)${noop > 0 ? ` (${noop} unchanged)` : ''}.`
          : noop > 0
            ? `No new changes — ${noop} row(s) already up to date.`
            : 'No rows imported.'
      )
    } catch (e: any) {
      toast.error(e?.response?.data?.message ?? 'Bulk upload failed.')
    } finally {
      setUploading(false)
    }
  }

  // Effective row value after any in-modal patches are merged.
  const effectiveRow = useCallback(
    (row: BulkPreviewRow) => ({ ...row.data, ...(patches[row.row_no] ?? {}) }),
    [patches],
  )

  const setCell = (rowNo: number, key: string, value: string) => {
    setPatches((prev) => {
      const current = { ...(prev[rowNo] ?? {}) }
      current[key] = value
      return { ...prev, [rowNo]: current }
    })
  }

  // Re-derive a row's effective error list so the UI live-clears the
  // "missing required field" badge once the user types a value in.
  const effectiveErrors = useCallback(
    (row: BulkPreviewRow) => {
      const merged = effectiveRow(row)
      // Strip server-flagged errors that the user has since filled in.
      const remaining = row.errors.filter((err) => {
        const v = (merged[err.field] ?? '').toString().trim()
        if (v === '') return true
        // Required-field errors clear once a non-empty value appears.
        if (err.message.startsWith('Missing required')) return false
        // For value errors we can't safely re-run server validation
        // client-side; leave them visible so the user knows the cell
        // still needs review. They can hit "Re-check" to refresh.
        return true
      })
      return remaining
    },
    [effectiveRow],
  )

  const headers = preview?.headers ?? []
  const filteredRows = useMemo(() => {
    if (!preview) return []
    const q = search.trim().toLowerCase()
    return preview.rows.filter((r) => {
      if (filter === 'errors' && effectiveErrors(r).length === 0) return false
      if (filter === 'create' && r.action !== 'create') return false
      if (filter === 'update' && r.action !== 'update') return false
      if (!q) return true
      const merged = effectiveRow(r)
      return Object.values(merged).some((v) => String(v).toLowerCase().includes(q))
    })
  }, [preview, filter, search, effectiveErrors, effectiveRow])

  const liveSummary = useMemo(() => {
    if (!preview) return null
    let errs = 0, ok = 0
    for (const r of preview.rows) {
      if (effectiveErrors(r).length > 0) errs++
      else ok++
    }
    return { ...preview.summary, with_errors: errs, valid: ok }
  }, [preview, effectiveErrors])

  const canCommit = !!preview && (liveSummary?.valid ?? 0) > 0

  if (!open) return null

  return (
    <ModalPortal>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={closeAndReset} />
        <div
          className="relative z-10 w-full max-w-6xl max-h-[92vh] bg-white dark:bg-ink-900 rounded-xl shadow-2xl flex flex-col"
          role="dialog" aria-modal="true"
        >
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-ink-100 dark:border-ink-800">
            <div className="flex items-center gap-3 min-w-0">
              <div className="bg-brand/10 text-brand p-2 rounded-lg">
                <Upload className="w-5 h-5" />
              </div>
              <div className="min-w-0">
                <h2 className="text-lg font-bold text-ink-900 dark:text-white truncate">{title}</h2>
                <p className="text-[12px] text-ink-500 truncate">
                  {step === 'pick'    && (description ?? 'Download the template, fill it in, then re-upload.')}
                  {step === 'preview' && `Step 2 of 3 — preview ${preview?.rows.length ?? 0} row(s) before committing.`}
                  {step === 'done'    && 'Step 3 of 3 — import complete.'}
                </p>
              </div>
            </div>
            <button
              type="button" onClick={closeAndReset}
              className="rounded-md p-1 text-ink-400 hover:text-ink-600 hover:bg-ink-100 dark:hover:bg-ink-800"
              aria-label="Close"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Body */}
          <div className="flex-1 overflow-y-auto px-6 py-5">
            {step === 'pick' && (
              <div className="space-y-5">
                <div className="border border-dashed border-ink-300 dark:border-ink-700 rounded-xl p-6 bg-ink-50/40 dark:bg-ink-800/40">
                  <div className="flex items-start gap-4 flex-wrap">
                    <div className="bg-white dark:bg-ink-900 rounded-lg p-3 text-brand border border-ink-200 dark:border-ink-700">
                      <FileSpreadsheet className="w-7 h-7" />
                    </div>
                    <div className="flex-1 min-w-[260px]">
                      <p className="font-semibold text-ink-900 dark:text-white">Download the template</p>
                      <p className="text-[12.5px] text-ink-500 mt-0.5">
                        Excel-compatible CSV (UTF-8). The first row contains the column
                        headers — don't rename or reorder them. The second row shows an
                        example you can delete.
                      </p>
                      <a
                        href={templateUrl} target="_blank" rel="noreferrer"
                        className="btn-secondary btn-sm mt-3 inline-flex items-center gap-1.5"
                      >
                        <Download className="w-3.5 h-3.5" /> Download CSV template
                      </a>
                    </div>
                  </div>
                </div>

                <div>
                  <label className="block text-[12px] uppercase tracking-wide text-ink-500 font-bold mb-2">
                    Upload your filled file
                  </label>
                  <div
                    className="border-2 border-dashed border-ink-200 dark:border-ink-700 rounded-xl px-6 py-8 text-center hover:border-brand transition-colors cursor-pointer"
                    onClick={() => inputRef.current?.click()}
                    onDragOver={(e) => { e.preventDefault() }}
                    onDrop={(e) => {
                      e.preventDefault()
                      const f = e.dataTransfer.files?.[0]
                      if (f) pickFile(f)
                    }}
                  >
                    <Upload className="w-10 h-10 mx-auto text-ink-400 mb-2" />
                    <p className="text-[13px] text-ink-700 dark:text-ink-200 font-medium">
                      {file ? file.name : 'Click or drop a CSV file here'}
                    </p>
                    <p className="text-[11px] text-ink-500 mt-1">
                      Accepted: .csv (Excel saves as "CSV UTF-8")
                    </p>
                    <input
                      ref={inputRef} type="file" hidden
                      accept=".csv,text/csv,application/vnd.ms-excel"
                      onChange={(e) => pickFile(e.target.files?.[0] ?? null)}
                    />
                  </div>
                  {file && (
                    <button
                      type="button"
                      className="text-[12px] text-brand mt-2 underline"
                      onClick={() => pickFile(null)}
                    >
                      Choose a different file
                    </button>
                  )}
                </div>

                <div className="text-[12px] text-ink-500">
                  Required fields:{' '}
                  {requiredFields.map((f, i) => (
                    <span key={f}>
                      <code className="px-1 py-0.5 bg-ink-100 dark:bg-ink-800 rounded">{fieldLabel(f)}</code>
                      {i < requiredFields.length - 1 ? ', ' : ''}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {step === 'preview' && preview && (
              <div className="space-y-4">
                {/* Summary chips */}
                <div className="flex items-center gap-2 flex-wrap">
                  <SummaryChip
                    icon={CheckCircle2} tone="success"
                    label="Valid rows" value={liveSummary?.valid ?? 0}
                  />
                  <SummaryChip
                    icon={AlertCircle} tone="danger"
                    label="With errors" value={liveSummary?.with_errors ?? 0}
                  />
                  {liveSummary?.to_create != null && (
                    <SummaryChip
                      icon={Plus} tone="brand" label="New" value={liveSummary.to_create}
                    />
                  )}
                  {liveSummary?.to_update != null && (
                    <SummaryChip
                      icon={Pencil} tone="info" label="Updates" value={liveSummary.to_update}
                    />
                  )}
                  {liveSummary?.duplicates != null && liveSummary.duplicates > 0 && (
                    <SummaryChip
                      icon={AlertCircle} tone="warn"
                      label="Duplicates" value={liveSummary.duplicates}
                    />
                  )}
                </div>

                {/* Toolbar */}
                <div className="flex items-center gap-2 flex-wrap">
                  <div className="relative flex-1 min-w-[200px]">
                    <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-400 pointer-events-none" />
                    <input
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      placeholder="Search rows…"
                      className="input pl-8 w-full text-[12.5px]"
                    />
                  </div>
                  <div className="flex items-center gap-1 bg-ink-100 dark:bg-ink-800 p-1 rounded-md text-[12px]">
                    <FilterPill active={filter === 'all'}    onClick={() => setFilter('all')}>All</FilterPill>
                    <FilterPill active={filter === 'errors'} onClick={() => setFilter('errors')}>Errors only</FilterPill>
                    <FilterPill active={filter === 'create'} onClick={() => setFilter('create')}>New</FilterPill>
                    <FilterPill active={filter === 'update'} onClick={() => setFilter('update')}>Updates</FilterPill>
                  </div>
                  <button
                    type="button"
                    onClick={runValidate}
                    disabled={!file || validating}
                    className="btn-secondary btn-sm inline-flex items-center gap-1.5"
                    title="Re-parse the file (useful after fixing the CSV directly)"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${validating ? 'animate-spin' : ''}`} /> Re-check
                  </button>
                </div>

                {/* Preview table */}
                <div className="border border-ink-100 dark:border-ink-800 rounded-lg overflow-hidden">
                  <div className="overflow-x-auto max-h-[55vh]">
                    <table className="data-table w-full text-[12px]">
                      <thead className="bg-ink-50 dark:bg-ink-800 sticky top-0 z-10">
                        <tr>
                          <th className="w-12 text-center">#</th>
                          <th className="w-24">Action</th>
                          {headers.map((h) => (
                            <th key={h} className="whitespace-nowrap">
                              {fieldLabel(h)}
                              {requiredFields.includes(h) && (
                                <span className="text-red-500 ml-0.5">*</span>
                              )}
                            </th>
                          ))}
                          <th className="w-[260px]">Issues</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredRows.length === 0 ? (
                          <tr>
                            <td colSpan={headers.length + 3} className="text-center text-ink-500 py-8">
                              No rows match the current filter.
                            </td>
                          </tr>
                        ) : filteredRows.map((row) => {
                          const merged = effectiveRow(row)
                          const errs   = effectiveErrors(row)
                          const errFields = new Set(errs.map((e) => e.field))
                          const hasErr = errs.length > 0
                          return (
                            <tr key={row.row_no} className={hasErr ? 'bg-red-50/60 dark:bg-red-950/30' : ''}>
                              <td className="text-center text-ink-400 align-top">{row.row_no}</td>
                              <td className="align-top">
                                <ActionChip action={row.action} />
                              </td>
                              {headers.map((h) => {
                                const isErr = errFields.has(h)
                                const value = merged[h] ?? ''
                                return (
                                  <td key={h} className="align-top min-w-[120px]">
                                    <input
                                      value={value}
                                      onChange={(e) => setCell(row.row_no, h, e.target.value)}
                                      className={
                                        'w-full px-1.5 py-1 text-[12px] rounded border bg-transparent ' +
                                        (isErr
                                          ? 'border-red-300 bg-red-50/50 dark:bg-red-900/20 dark:border-red-700 focus:ring-1 focus:ring-red-400'
                                          : 'border-transparent hover:border-ink-200 focus:border-brand focus:ring-1 focus:ring-brand')
                                      }
                                      placeholder={requiredFields.includes(h) ? 'required' : ''}
                                    />
                                  </td>
                                )
                              })}
                              <td className="align-top">
                                {errs.length === 0 ? (
                                  <span className="text-emerald-600 text-[11px] inline-flex items-center gap-1">
                                    <CheckCircle2 className="w-3 h-3" /> OK
                                  </span>
                                ) : (
                                  <ul className="space-y-0.5">
                                    {errs.map((e, i) => (
                                      <li key={i} className="text-red-700 dark:text-red-300 text-[11px] inline-flex items-start gap-1">
                                        <AlertCircle className="w-3 h-3 mt-0.5 shrink-0" />
                                        <span>{e.message}</span>
                                      </li>
                                    ))}
                                  </ul>
                                )}
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>

                <p className="text-[11.5px] text-ink-500">
                  Tip — you can edit cells inline here, or fix the file in Excel and click
                  "Re-check" to re-parse. Rows with unresolved errors will be skipped on
                  commit.
                </p>
              </div>
            )}

            {step === 'done' && result && (
              <div className="text-center py-8 space-y-4">
                <div className="mx-auto bg-emerald-50 dark:bg-emerald-900/30 text-emerald-600 w-16 h-16 rounded-full flex items-center justify-center">
                  <CheckCircle2 className="w-8 h-8" />
                </div>
                <div>
                  <h3 className="text-xl font-bold text-ink-900 dark:text-white">Import complete</h3>
                  <p className="text-[13px] text-ink-500 mt-1">
                    {result.inserted} created
                    {result.updated   != null ? ` · ${result.updated} updated`     : ''}
                    {result.unchanged != null ? ` · ${result.unchanged} unchanged` : ''}
                    {result.skipped   != null ? ` · ${result.skipped} skipped`     : ''}
                  </p>
                  {result.unchanged != null && result.unchanged > 0 && (
                    <p className="text-[11.5px] text-ink-400 mt-2 max-w-md mx-auto">
                      Unchanged rows had no new information — blank cells never
                      overwrite existing data, and cells that matched the current
                      value were skipped.
                    </p>
                  )}
                </div>
                {result.errors.length > 0 && (
                  <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg p-4 text-left max-w-2xl mx-auto">
                    <p className="font-semibold text-amber-900 dark:text-amber-200 text-[13px] mb-2">
                      {result.errors.length} row{result.errors.length === 1 ? '' : 's'} skipped
                    </p>
                    <ul className="max-h-40 overflow-y-auto text-[12px] text-amber-900 dark:text-amber-200 space-y-1">
                      {result.errors.map((e, i) => (
                        <li key={i}>Row {e.row}: {e.message}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="px-6 py-4 border-t border-ink-100 dark:border-ink-800 flex items-center justify-between gap-3 bg-ink-50 dark:bg-ink-800/50 rounded-b-xl">
            <div className="text-[12px] text-ink-500">
              {step === 'preview' && (
                <button
                  type="button"
                  onClick={() => { setStep('pick'); setPreview(null); setPatches({}) }}
                  className="inline-flex items-center gap-1 hover:text-ink-700"
                >
                  <ArrowLeft className="w-3.5 h-3.5" /> Back
                </button>
              )}
            </div>

            <div className="flex items-center gap-2">
              <button type="button" onClick={closeAndReset} className="btn-secondary">
                {step === 'done' ? 'Close' : 'Cancel'}
              </button>

              {step === 'pick' && (
                <button
                  type="button"
                  onClick={runValidate}
                  disabled={!file || validating}
                  className="btn-primary inline-flex items-center gap-1.5"
                >
                  {validating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ArrowRight className="w-3.5 h-3.5" />}
                  {validating ? 'Parsing…' : 'Preview file'}
                </button>
              )}

              {step === 'preview' && (
                <button
                  type="button"
                  onClick={runUpload}
                  disabled={!canCommit || uploading}
                  className="btn-primary inline-flex items-center gap-1.5"
                  title={canCommit ? 'Commit valid rows to the database' : 'Fix at least one row first'}
                >
                  {uploading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
                  {uploading ? 'Importing…' : `Import ${liveSummary?.valid ?? 0} valid row(s)`}
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </ModalPortal>
  )
}

/* ── Small helpers ───────────────────────────────────────────── */

function FilterPill({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button" onClick={onClick}
      className={
        'px-2.5 py-1 rounded font-medium ' +
        (active ? 'bg-white dark:bg-ink-900 shadow text-brand' : 'text-ink-600 dark:text-ink-300 hover:text-ink-800')
      }
    >
      {children}
    </button>
  )
}

function SummaryChip({
  icon: Icon, tone, label, value,
}: {
  icon: React.ComponentType<{ className?: string }>
  tone: 'success' | 'danger' | 'brand' | 'info' | 'warn'
  label: string
  value: number
}) {
  const tones: Record<typeof tone, string> = {
    success: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-200',
    danger:  'bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-200',
    brand:   'bg-brand/10 text-brand',
    info:    'bg-sky-50 text-sky-700 dark:bg-sky-900/30 dark:text-sky-200',
    warn:    'bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-200',
  } as const
  return (
    <div className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[12px] font-medium ${tones[tone]}`}>
      <Icon className="w-3.5 h-3.5" />
      <span>{label}: <strong>{value}</strong></span>
    </div>
  )
}

function ActionChip({ action }: { action: BulkPreviewRow['action'] }) {
  if (action === 'update') {
    return <span className="inline-flex items-center gap-1 text-[11px] font-medium px-1.5 py-0.5 rounded bg-sky-100 text-sky-800 dark:bg-sky-900/40 dark:text-sky-200"><Pencil className="w-3 h-3" /> Update</span>
  }
  if (action === 'duplicate') {
    return <span className="inline-flex items-center gap-1 text-[11px] font-medium px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200"><AlertCircle className="w-3 h-3" /> Duplicate</span>
  }
  return <span className="inline-flex items-center gap-1 text-[11px] font-medium px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200"><Plus className="w-3 h-3" /> New</span>
}
