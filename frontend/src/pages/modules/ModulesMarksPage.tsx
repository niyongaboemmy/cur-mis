import { useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useAuthStore } from '@/store/authStore'
import { PERMISSIONS } from '@/constants/permissions'
import {
  Loader2, Save, GraduationCap, Users, Percent,
  CheckCircle2, FileCheck, SendHorizontal, RotateCcw, Lock,
  UserPlus, Search, X, Download, Upload, AlertTriangle,
  Filter, BookOpen, ChevronLeft, AlertCircle,
} from 'lucide-react'
import * as XLSX from 'xlsx'
import toast from 'react-hot-toast'
import { academicService } from '@/services/academicService'
import { studentService } from '@/services/studentService'
import { attendanceService, type ScheduledBlock } from '@/services/attendanceService'
import { portalService } from '@/services/admissionService'
import { academicsMgmtService } from '@/services/academicsMgmtService'
import SearchableSelect from '@/components/ui/SearchableSelect'
import {
  marksService,
  type MarkableModule,
  type MarksRosterRow,
  type SaveMarkRecord,
  type MarksModuleHeader,
  type MarksWorkflow,
  type MarksWorkflowStatus,
} from '@/services/marksService'

interface RowDraft {
  cat1:     string
  cat2:     string
  cat3:     string
  partial:  string
  exam1:    string
  exam2:    string
  remarks:  string
}

const num = (v: unknown): number | null => {
  if (v === null || v === undefined || v === '') return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

const toStr = (v: unknown): string =>
  v === null || v === undefined || v === '' ? '' : String(v)

// CUR official grading scale — keep in sync with backend ModuleMarksController.gradeFor().
const gradeFor = (pct: number): string => {
  if (pct >= 80) return 'A' // Very Good
  if (pct >= 70) return 'B' // Good
  if (pct >= 60) return 'C' // Satisfaction
  if (pct >= 50) return 'D' // Pass
  return 'E'                // Fail
}

const decisionFor = (pct: number | null): string | null =>
  pct === null ? null : pct >= 50 ? 'P' : 'F&R'

/* ──────────────────────────────────────────────────────────────────────
 * Top-level dispatcher. Decides between the schedule-list landing view
 * and the marks editor based on whether `module_id` is in the URL.
 *
 * The two views are split into separate components so each owns a stable
 * set of hooks. Mounting a different component when the route changes
 * keeps React's hook-count invariant intact (otherwise toggling between
 * the picker and editor blows up with "Rendered more hooks…").
 * ─────────────────────────────────────────────────────────────────── */
export default function ModulesMarksPage() {
  const [sp, setSp] = useSearchParams()
  const moduleId = Number(sp.get('module_id') || 0)

  /* ── shared term state — kept here so it survives toggling the views ── */
  const termsQ = useQuery({ queryKey: ['academic', 'terms'], queryFn: () => academicService.listTerms() })
  const terms  = termsQ.data?.data ?? []
  const [termId, setTermId] = useState<number>(0)
  useEffect(() => {
    if (!termId && terms.length) {
      const current = terms.find((t: any) => t.is_current) ?? terms[0]
      setTermId(current.id)
    }
  }, [terms, termId])

  if (!moduleId) {
    return (
      <MarksSchedulePicker
        termId={termId}
        terms={terms}
        onChangeTerm={setTermId}
        onPickModule={(modId, code, name) => {
          const next = new URLSearchParams(sp)
          next.set('module_id', String(modId))
          next.set('m_code', code || '')
          next.set('m_name', name || '')
          setSp(next, { replace: true })
        }}
      />
    )
  }

  return (
    <MarksEditor
      // Remount on module switch so the editor's internal state (drafts,
      // extras, hydration ref) resets cleanly to the new module.
      key={moduleId}
      moduleId={moduleId}
      termId={termId}
      terms={terms}
      setTermId={setTermId}
      onBackToSchedules={() => {
        const next = new URLSearchParams(sp)
        next.delete('module_id')
        next.delete('m_code')
        next.delete('m_name')
        setSp(next, { replace: true })
      }}
    />
  )
}

function MarksEditor({
  moduleId, termId, terms, setTermId, onBackToSchedules,
}: {
  moduleId:         number
  termId:           number
  terms:            any[]
  setTermId:        (id: number) => void
  onBackToSchedules: () => void
}) {
  const qc = useQueryClient()
  const [, setSp] = useSearchParams()

  const setModuleId = (id: number) => {
    setSp((prev) => {
      const next = new URLSearchParams(prev)
      if (id > 0) {
        next.set('module_id', String(id))
      } else {
        next.delete('module_id')
        next.delete('m_code')
        next.delete('m_name')
      }
      return next
    }, { replace: true })
  }

  const modulesQ = useQuery({
    queryKey: ['marks', 'markable-modules', termId],
    queryFn: () => marksService.markableModules({ academic_term_id: termId }),
    enabled: !!termId,
  })
  const modules: MarkableModule[] = modulesQ.data?.data ?? []
  // If the term was switched and the previously-picked module isn't markable
  // there anymore, drop it so the schedule picker reappears.
  useEffect(() => {
    if (moduleId && modules.length && !modules.find((m) => m.module_id === moduleId)) {
      onBackToSchedules()
    }
     
  }, [modules, moduleId])

  /* ── roster ───────────────────────────────────────────────────── */
  const listQ = useQuery({
    queryKey: ['marks', 'list', moduleId, termId],
    queryFn: () => marksService.list({ module_id: moduleId, academic_term_id: termId }),
    enabled: !!moduleId && !!termId,
  })
  const payload  = listQ.data?.data
  const baseRoster = payload?.roster
  const summary  = payload?.summary
  const moduleH: MarksModuleHeader | undefined = payload?.module
  const workflow: MarksWorkflow | undefined    = payload?.workflow

  /* ── manually-picked students (admin "let me select") ─────────── */
  const [extras, setExtras] = useState<Record<string, MarksRosterRow>>({})
  // Reset extras when the user switches module/term — they're context-bound.
  useEffect(() => { setExtras({}) }, [moduleId, termId])

  const roster = useMemo<MarksRosterRow[] | undefined>(() => {
    if (!baseRoster) return undefined
    const seen = new Set(baseRoster.map((r) => r.regnumber))
    const onlyNew = Object.values(extras).filter((r) => !seen.has(r.regnumber))
    return [...baseRoster, ...onlyNew].sort((a, b) =>
      `${a.lname ?? ''} ${a.fname ?? ''}`.localeCompare(`${b.lname ?? ''} ${b.fname ?? ''}`)
    )
  }, [baseRoster, extras])

  /* ── per-row draft state ──────────────────────────────────────── */
  const [drafts, setDrafts] = useState<Record<string, RowDraft>>({})
  const [maxes, setMaxes] = useState<{
    cat1: number; cat2: number; cat3: number; partial: number; cats: number; final: number
  }>({ cat1: 15, cat2: 15, cat3: 15, partial: 15, cats: 60, final: 40 })

  // Hydrate drafts ONCE per (module, term) selection — preserves user edits
  // (manual entry, CSV import, etc.) across refetches/refocuses that would
  // otherwise change the `roster` reference and trigger a re-hydration.
  const hydratedKey = useRef<string>('')
  useEffect(() => {
    if (!roster) return
    const key = `${moduleId}|${termId}`
    if (hydratedKey.current === key) return
    hydratedKey.current = key

    const next: Record<string, RowDraft> = {}
    for (const r of roster) {
      next[r.regnumber] = {
        cat1:    toStr(r.cat1),
        cat2:    toStr(r.cat2),
        cat3:    toStr(r.cat3),
        partial: toStr(r.partial_exam),
        exam1:   toStr(r.exam_1st_sitting),
        exam2:   toStr(r.exam_2nd_sitting),
        remarks: r.remarks ?? '',
      }
    }
    setDrafts(next)

    const first = roster.find((r) => r.mark_id !== null)
    if (first) {
      setMaxes({
        cat1:    Number(first.cat1_max)         || 15,
        cat2:    Number(first.cat2_max)         || 15,
        cat3:    Number(first.cat3_max)         || 15,
        partial: Number(first.partial_exam_max) || 15,
        cats:    Number(first.cats_max)         || 60,
        final:   Number(first.final_exam_max)   || 40,
      })
    }
  }, [roster, moduleId, termId])

  // Backfill drafts for new roster rows. When the row has saved marks, seed
  // from the server values; otherwise create an empty draft. This handles
  // students that join the roster after the initial hydration ran — e.g.,
  // a manually-picked student whose marks were just saved and now arrive
  // through the registered roster path with persisted cat1/cat2/etc.
  useEffect(() => {
    if (!roster) return
    setDrafts((prev) => {
      let changed = false
      const next = { ...prev }
      for (const r of roster) {
        const cur = next[r.regnumber]
        const isEmpty = !cur || (
          !cur.cat1 && !cur.cat2 && !cur.cat3 && !cur.partial &&
          !cur.exam1 && !cur.exam2 && !cur.remarks
        )
        if (cur && !isEmpty) continue
        if (r.mark_id !== null) {
          next[r.regnumber] = {
            cat1:    toStr(r.cat1),
            cat2:    toStr(r.cat2),
            cat3:    toStr(r.cat3),
            partial: toStr(r.partial_exam),
            exam1:   toStr(r.exam_1st_sitting),
            exam2:   toStr(r.exam_2nd_sitting),
            remarks: r.remarks ?? '',
          }
          changed = true
        } else if (!cur) {
          next[r.regnumber] = { cat1: '', cat2: '', cat3: '', partial: '', exam1: '', exam2: '', remarks: '' }
          changed = true
        }
      }
      return changed ? next : prev
    })
  }, [roster])

  /* ── derived ──────────────────────────────────────────────────── */

  const computed = useMemo(() => {
    type Row = {
      catsTotal: number | null
      finalMark: number | null
      total:     number | null
      pct:       number | null
      grade:     string | null
      decision:  string | null
      hasAny:    boolean
    }
    const map: Record<string, Row> = {}
    if (!roster) return map
    const maxSum = maxes.cats + maxes.final
    for (const r of roster) {
      const d = drafts[r.regnumber]
      if (!d) {
        map[r.regnumber] = { catsTotal: null, finalMark: null, total: null, pct: null, grade: null, decision: null, hasAny: false }
        continue
      }
      const c1 = num(d.cat1), c2 = num(d.cat2), c3 = num(d.cat3), pe = num(d.partial)
      const e1 = num(d.exam1), e2 = num(d.exam2)
      const hasAny = [c1, c2, c3, pe, e1, e2].some((x) => x !== null)
      if (!hasAny) {
        map[r.regnumber] = { catsTotal: null, finalMark: null, total: null, pct: null, grade: null, decision: null, hasAny: false }
        continue
      }
      const catsTotal = (c1 ?? 0) + (c2 ?? 0) + (c3 ?? 0) + (pe ?? 0)
      const finalMark = e2 !== null ? Math.max(e1 ?? 0, e2) : (e1 ?? null)
      const total     = catsTotal + (finalMark ?? 0)
      const pct       = maxSum > 0 ? +(total / maxSum * 100).toFixed(2) : null
      map[r.regnumber] = {
        catsTotal: +catsTotal.toFixed(2),
        finalMark: finalMark !== null ? +finalMark.toFixed(2) : null,
        total: +total.toFixed(2),
        pct,
        grade: pct !== null ? gradeFor(pct) : null,
        decision: decisionFor(pct),
        hasAny,
      }
    }
    return map
  }, [drafts, roster, maxes])

  const setCell = (reg: string, key: keyof RowDraft, val: string) => {
    setDrafts((prev) => ({
      ...prev,
      [reg]: {
        ...(prev[reg] ?? { cat1: '', cat2: '', cat3: '', partial: '', exam1: '', exam2: '', remarks: '' }),
        [key]: val,
      },
    }))
  }

  // Dirty per row — drafts differ from the persisted row.
  const dirty = useMemo<Record<string, boolean>>(() => {
    const out: Record<string, boolean> = {}
    if (!roster) return out
    for (const r of roster) {
      if (r.is_exempted) { out[r.regnumber] = false; continue }
      const d = drafts[r.regnumber]; if (!d) { out[r.regnumber] = false; continue }
      const same =
        toStr(r.cat1)             === d.cat1 &&
        toStr(r.cat2)             === d.cat2 &&
        toStr(r.cat3)             === d.cat3 &&
        toStr(r.partial_exam)     === d.partial &&
        toStr(r.exam_1st_sitting) === d.exam1 &&
        toStr(r.exam_2nd_sitting) === d.exam2 &&
        (r.remarks ?? '')         === d.remarks
      out[r.regnumber] = !same
    }
    return out
  }, [drafts, roster])
  const dirtyCount = Object.values(dirty).filter(Boolean).length

  /* ── workflow lock ────────────────────────────────────────────── */
  const status: MarksWorkflowStatus = workflow?.status ?? 'draft'
  const isLocked = status === 'submitted' || status === 'confirmed'

  /* ── save ─────────────────────────────────────────────────────── */
  const save = useMutation({
    mutationFn: () => {
      const records: SaveMarkRecord[] = (roster ?? [])
        .map((r): SaveMarkRecord | null => {
          // Exempted rows are owned by the Student details → Curriculum view;
          // never overwrite them from this page.
          if (r.is_exempted) return null
          const d = drafts[r.regnumber]; if (!d) return null
          const cat1 = num(d.cat1), cat2 = num(d.cat2), cat3 = num(d.cat3)
          const pe   = num(d.partial)
          const e1   = num(d.exam1), e2 = num(d.exam2)
          const remarks = d.remarks?.trim() || null
          if (cat1 === null && cat2 === null && cat3 === null && pe === null && e1 === null && e2 === null && !remarks) {
            return null
          }
          return {
            student_regnumber: r.regnumber,
            cat1, cat2, cat3, partial_exam: pe,
            exam_1st_sitting: e1, exam_2nd_sitting: e2,
            cat1_max: maxes.cat1, cat2_max: maxes.cat2, cat3_max: maxes.cat3,
            partial_exam_max: maxes.partial, cats_max: maxes.cats, final_exam_max: maxes.final,
            remarks,
          }
        })
        .filter((x): x is SaveMarkRecord => x !== null)

      if (records.length === 0) return Promise.reject(new Error('Nothing to save yet.'))
      return marksService.save({
        module_id: moduleId,
        academic_term_id: termId,
        records,
      })
    },
    onSuccess: (res: any) => {
      toast.success(res?.message ?? `Saved ${res?.data?.saved ?? 0} record(s).`)
      // Force the next refetch to re-hydrate drafts from the server's
      // normalized values (e.g., "10" → "10.00") so the rows aren't reported
      // as dirty just because of decimal formatting, and so saved students
      // reappear with their marks instead of empty cells.
      hydratedKey.current = ''
      qc.invalidateQueries({ queryKey: ['marks', 'list', moduleId, termId] })
    },
    onError: (e: any) => toast.error(e?.response?.data?.message ?? e?.message ?? 'Save failed'),
  })

  const wf = useMutation({
    mutationFn: (action: 'open_claims' | 'submit' | 'confirm' | 'reset') =>
      marksService.workflow({ module_id: moduleId, academic_term_id: termId, action }),
    onSuccess: (res: any) => {
      toast.success(res?.message ?? 'Workflow updated.')
      qc.invalidateQueries({ queryKey: ['marks', 'list', moduleId, termId] })
    },
    onError: (e: any) => toast.error(e?.response?.data?.message ?? e?.message ?? 'Workflow update failed'),
  })

  /* ───────────────────────────────────────────────────────────── */

  const fileRef = useRef<HTMLInputElement | null>(null)

  /* ── Export — XLSX for clean Excel round-trip ─────────────────── */
  const handleExport = () => {
    if (!roster || !moduleH) return
    const headers = [
      'Reg #', 'First Name', 'Surname', 'Sex', 'Program', 'Option',
      `CAT1 (/${maxes.cat1})`, `CAT2 (/${maxes.cat2})`, `CAT3 (/${maxes.cat3})`,
      `Partial (/${maxes.partial})`,
      `Exam 1st (/${maxes.final})`, `Exam 2nd (/${maxes.final})`,
      'Remarks',
    ]
    const aoa: any[][] = [headers]
    roster.forEach((r) => {
      const d = drafts[r.regnumber] ?? emptyDraft()
      aoa.push([
        r.regnumber, r.fname, r.lname, r.sex ?? '', r.student_program ?? '', r.option_acro ?? '',
        d.cat1, d.cat2, d.cat3, d.partial, d.exam1, d.exam2, d.remarks,
      ])
    })
    const ws = XLSX.utils.aoa_to_sheet(aoa)
    // Pin column widths and force text-type on the Reg # column so Excel
    // doesn't strip leading zeros or rewrite as number.
    ws['!cols'] = [
      { wch: 18 }, { wch: 18 }, { wch: 18 }, { wch: 5 },
      { wch: 12 }, { wch: 8 },
      { wch: 9 }, { wch: 9 }, { wch: 9 }, { wch: 9 },
      { wch: 11 }, { wch: 13 }, { wch: 24 },
    ]
    for (let R = 1; R <= roster.length; R++) {
      const ref = XLSX.utils.encode_cell({ c: 0, r: R })
      if (ws[ref]) { ws[ref].t = 's'; ws[ref].v = String(ws[ref].v ?? '') }
    }
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Marks')
    XLSX.writeFile(wb, `marks_${moduleH.module_code.replace(/\s+/g, '')}_term-${termId}.xlsx`)
  }

  /* ── Import — parse file, show preview modal, apply on approve ──── */
  const [preview, setPreview] = useState<ImportPreview | null>(null)

  const handleImportFile = async (file: File) => {
    if (!roster) return
    try {
      const buf = await file.arrayBuffer()
      // SheetJS reads CSV / TSV / XLSX / XLS automatically.
      const wb  = XLSX.read(buf, { type: 'array' })
      const ws  = wb.Sheets[wb.SheetNames[0]]
      if (!ws) { toast.error('No sheet found in the file.'); return }
      const rows: string[][] = XLSX.utils.sheet_to_json(ws, { header: 1, raw: false, defval: '' }) as any
      if (rows.length < 2) { toast.error('File is empty.'); return }

      // Strip BOM from the first header cell (some CSVs have it even via SheetJS).
      if (rows[0][0]) rows[0][0] = String(rows[0][0]).replace(/^\uFEFF/, '')

      const head = rows[0].map((h) => String(h ?? '').trim().toLowerCase())
      const idx = (...names: string[]) => {
        for (const n of names) {
          const i = head.findIndex((h) => h === n || h.startsWith(n) || h.includes(n))
          if (i !== -1) return i
        }
        return -1
      }
      const iReg     = idx('reg #', 'reg#', 'reg', 'regnumber', 'registration')
      const iCat1    = idx('cat1', 'cat 1')
      const iCat2    = idx('cat2', 'cat 2')
      const iCat3    = idx('cat3', 'cat 3')
      const iPartial = idx('partial')
      const iExam1   = idx('exam 1st', 'exam1', '1st sitting', '1st')
      const iExam2   = idx('exam 2nd', 'exam2', '2nd', 'special')
      const iRemarks = idx('remarks', 'remark', 'comment')

      if (iReg < 0) {
        toast.error('Could not find a "Reg #" column. Re-export the template and try again.', { duration: 7000 })
        return
      }

      const normReg = (s: string) =>
        s.replace(/^['’]+/, '')
         .replace(/\s+/g, '')
         .toUpperCase()
      const rosterByReg = new Map(
        roster.map((r) => [normReg(r.regnumber ?? ''), r])
      )

      const entries: ImportEntry[] = []
      const cell = (row: any[], i: number) => i >= 0 ? String(row[i] ?? '').trim() : ''
      let matched = 0
      let unmatched = 0
      let unchanged = 0

      for (let i = 1; i < rows.length; i++) {
        const row = rows[i]
        if (row.every((c) => String(c ?? '').trim() === '')) continue
        const rawReg = cell(row, iReg)
        if (!rawReg) continue
        const key = normReg(rawReg)
        const target = rosterByReg.get(key)
        if (!target) {
          unmatched++
          entries.push({
            regnumber: rawReg, fname: '', lname: '', matched: false,
            current: emptyDraft(), incoming: emptyDraft(), changed: false,
          })
          continue
        }
        const cur: RowDraft = drafts[target.regnumber] ?? emptyDraft()
        const incoming: RowDraft = {
          cat1:    cell(row, iCat1)    || cur.cat1,
          cat2:    cell(row, iCat2)    || cur.cat2,
          cat3:    cell(row, iCat3)    || cur.cat3,
          partial: cell(row, iPartial) || cur.partial,
          exam1:   cell(row, iExam1)   || cur.exam1,
          exam2:   cell(row, iExam2)   || cur.exam2,
          remarks: cell(row, iRemarks) || cur.remarks,
        }
        const changed = !sameDraft(cur, incoming)
        if (changed) matched++; else unchanged++
        entries.push({
          regnumber: target.regnumber,
          fname: target.fname, lname: target.lname,
          matched: true, current: cur, incoming, changed,
        })
      }

      if (entries.length === 0) {
        toast.error('The file had no usable rows.')
        return
      }

      setPreview({ entries, summary: { matched, unmatched, unchanged } })
    } catch (err: any) {
      toast.error(err?.message ?? 'Could not parse the file.')
    }
  }

  const applyImport = () => {
    if (!preview) return
    setDrafts((prev) => {
      const next = { ...prev }
      for (const e of preview.entries) {
        if (!e.matched || !e.changed) continue
        next[e.regnumber] = e.incoming
      }
      return next
    })
    const n = preview.summary.matched
    toast.success(`Applied ${n} row${n === 1 ? '' : 's'} of marks.`)
    setPreview(null)
  }

  const authUser = useAuthStore((s) => s.user)
  const canWrite =
    authUser?.role === 'superadmin' ||
    authUser?.role === 'admin' ||
    (authUser?.permissions ?? []).includes(PERMISSIONS.RECORD_MODULE_MARKS) ||
    (authUser?.permissions ?? []).includes(PERMISSIONS.MANAGE_MODULE_MARKS)

  const canExport = !!roster && roster.length > 0
  const canImport = canExport && !isLocked && canWrite

  return (
    <div className="space-y-4 animate-fade-in">
      <input
        ref={fileRef}
        type="file"
        accept=".csv,.tsv,.txt,.xlsx,.xls,text/csv,text/tab-separated-values,text/plain,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0]
          if (f) handleImportFile(f)
          e.target.value = ''
        }}
      />

      <ImportPreviewModal
        preview={preview}
        onCancel={() => setPreview(null)}
        onApprove={applyImport}
      />

      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="flex items-start gap-2 min-w-0">
          <button
            type="button"
            onClick={onBackToSchedules}
            className="mt-0.5 p-1.5 hover:bg-ink-100 dark:hover:bg-ink-800 rounded-lg text-ink-500 hover:text-brand transition-colors shrink-0"
            title="Back to schedule list"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          <div>
            <h2 className="text-lg font-bold text-ink-900 dark:text-white">Module Marks</h2>
            <p className="text-[13px] text-ink-500">
              Pick a term and a module — the official CUR mark sheet auto-fills with the module
              header and full registered roster.
            </p>
          </div>
        </div>
        <div className="flex gap-2 items-center flex-wrap">
          <select
            className="input input-sm w-44"
            value={termId || ''}
            onChange={(e) => setTermId(Number(e.target.value))}
          >
            <option value="" disabled>Select term…</option>
            {terms.map((t: any) => (
              <option key={t.id} value={t.id}>
                {t.label}{t.is_current ? ' (current)' : ''}
              </option>
            ))}
          </select>
          <ModuleCombobox
            modules={modules}
            value={moduleId}
            onChange={setModuleId}
            disabled={!termId || modulesQ.isLoading}
            loading={modulesQ.isLoading}
          />
        </div>
      </div>

      {/* Sticky action toolbar — Save / Export / Import always visible */}
      {!!termId && !!moduleId && (
        <div className="sticky top-0 z-20 -mx-5 sm:-mx-6 lg:-mx-8 px-5 sm:px-6 lg:px-8 py-2 bg-[rgb(var(--bg-app))]/95 backdrop-blur border-b border-ink-100 dark:border-ink-700 flex items-center justify-between gap-3 flex-wrap">
          <div className="text-[12.5px] text-ink-500 inline-flex items-center gap-2">
            {dirtyCount > 0 ? (
              <span className="inline-flex items-center gap-1.5 text-amber-700 dark:text-amber-400">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                {dirtyCount} row{dirtyCount === 1 ? '' : 's'} unsaved
              </span>
            ) : (
              <span className="text-ink-400">All changes saved.</span>
            )}
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <button
              className="btn-ghost btn-sm"
              disabled={!canExport}
              onClick={handleExport}
              title="Download the roster as an Excel template"
            >
              <Download className="w-3.5 h-3.5" /> Export
            </button>
            {canWrite && (
              <button
                className="btn-ghost btn-sm"
                disabled={!canImport}
                onClick={() => fileRef.current?.click()}
                title="Upload a completed sheet (xlsx, xls, csv, tsv)"
              >
                <Upload className="w-3.5 h-3.5" /> Import
              </button>
            )}
            {canWrite && (
              <button
                className="btn-primary btn-sm"
                disabled={save.isPending || isLocked || !roster || roster.length === 0 || dirtyCount === 0}
                onClick={() => save.mutate()}
              >
                {save.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                {save.isPending ? 'Saving…' : dirtyCount > 0 ? `Save ${dirtyCount} change${dirtyCount === 1 ? '' : 's'}` : 'Save marks'}
              </button>
            )}
          </div>
        </div>
      )}

      {!termId || !moduleId ? (
        <div className="card p-8 text-center text-ink-400">Pick a term and module to begin recording marks.</div>
      ) : listQ.isLoading || !roster || !moduleH ? (
        <div className="card p-8 text-center"><Loader2 className="w-6 h-6 animate-spin mx-auto text-brand" /></div>
      ) : (
        <>
          {/* Official-template module header */}
          <ModuleHeaderCard
            moduleH={moduleH}
            classSize={summary?.total_roster ?? 0}
            status={status}
            disabled={isLocked}
            canWrite={canWrite}
            onWorkflow={(a) => wf.mutate(a)}
            wfPending={wf.isPending}
          />

          {/* KPI strip */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Stat icon={<Users className="w-4 h-4" />} label="Roster" value={summary?.total_roster ?? 0} />
            <Stat icon={<GraduationCap className="w-4 h-4" />} label="Recorded" value={summary?.recorded ?? 0} />
            <Stat icon={<Users className="w-4 h-4" />} label="Unmarked" value={summary?.unmarked ?? 0} tone={(summary?.unmarked ?? 0) > 0 ? 'warn' : undefined} />
            <Stat icon={<Percent className="w-4 h-4" />} label="Class avg %" value={`${summary?.avg_pct ?? 0}%`} />
          </div>

          {/* Maxes editor */}
          <div className="card p-3 flex flex-wrap items-center gap-3 text-[13px]">
            <span className="text-ink-500 font-semibold">Maxes:</span>
            <MaxField label="CAT1"    value={maxes.cat1}    onChange={(v) => setMaxes({ ...maxes, cat1: v })} disabled={isLocked} />
            <MaxField label="CAT2"    value={maxes.cat2}    onChange={(v) => setMaxes({ ...maxes, cat2: v })} disabled={isLocked} />
            <MaxField label="CAT3"    value={maxes.cat3}    onChange={(v) => setMaxes({ ...maxes, cat3: v })} disabled={isLocked} />
            <MaxField label="Partial" value={maxes.partial} onChange={(v) => setMaxes({ ...maxes, partial: v })} disabled={isLocked} />
            <MaxField label="CATs"    value={maxes.cats}    onChange={(v) => setMaxes({ ...maxes, cats: v })} disabled={isLocked} />
            <MaxField label="Final"   value={maxes.final}   onChange={(v) => setMaxes({ ...maxes, final: v })} disabled={isLocked} />
            <span className="ml-auto text-ink-500">
              Total max: <span className="font-semibold text-ink-800 dark:text-white">{maxes.cats + maxes.final}</span>
            </span>
          </div>

          {/* Manual student picker — adds students to the marks sheet on the fly */}
          <StudentPicker
            disabled={isLocked}
            existingRegs={new Set(roster.map((r) => r.regnumber))}
            onPick={(s) => {
              setExtras((prev) => ({ ...prev, [s.regnumber]: s }))
              setDrafts((prev) => prev[s.regnumber] ? prev : ({
                ...prev,
                [s.regnumber]: { cat1: '', cat2: '', cat3: '', partial: '', exam1: '', exam2: '', remarks: '' },
              }))
            }}
            onRemove={(reg) => {
              setExtras((prev) => {
                const next = { ...prev }
                delete next[reg]
                return next
              })
            }}
            extrasCount={Object.keys(extras).length}
          />

          {roster.length === 0 ? (
            <div className="card p-8 text-center text-ink-400">
              No registered or eligible students were auto-detected for this module. Use
              <span className="font-medium"> Pick students </span>
              above to add a roster manually, or register students under
              <span className="font-mono"> Modules → Registrations</span>.
            </div>
          ) : (
            /* Roster table — CUR template */
            <div className="card overflow-auto max-h-[640px]">
              <table className="w-full text-left text-[12.5px] min-w-[1500px]">
                <thead className="sticky top-0 z-10">
                  <tr className="bg-sky-50 dark:bg-ink-800/50 border-b border-ink-100 dark:border-ink-700">
                    <th rowSpan={2} className="px-2 py-2.5 font-bold text-ink-500 text-[10px] uppercase border-r border-ink-100 dark:border-ink-700">No</th>
                    <th rowSpan={2} className="px-2 py-2.5 font-bold text-ink-500 text-[10px] uppercase border-r border-ink-100 dark:border-ink-700">First Name</th>
                    <th rowSpan={2} className="px-2 py-2.5 font-bold text-ink-500 text-[10px] uppercase border-r border-ink-100 dark:border-ink-700">Surname</th>
                    <th rowSpan={2} className="px-2 py-2.5 font-bold text-ink-500 text-[10px] uppercase border-r border-ink-100 dark:border-ink-700">Sex</th>
                    <th rowSpan={2} className="px-2 py-2.5 font-bold text-ink-500 text-[10px] uppercase border-r border-ink-100 dark:border-ink-700">Reg #</th>
                    <th rowSpan={2} className="px-2 py-2.5 font-bold text-ink-500 text-[10px] uppercase border-r border-ink-100 dark:border-ink-700">Program</th>
                    <th rowSpan={2} className="px-2 py-2.5 font-bold text-ink-500 text-[10px] uppercase border-r border-ink-100 dark:border-ink-700">Option</th>
                    <th rowSpan={2} className="px-2 py-2.5 font-bold text-ink-500 text-[10px] uppercase text-center border-r border-ink-100 dark:border-ink-700">CAT1<br/><span className="font-normal text-ink-400">/{maxes.cat1}</span></th>
                    <th rowSpan={2} className="px-2 py-2.5 font-bold text-ink-500 text-[10px] uppercase text-center border-r border-ink-100 dark:border-ink-700">CAT2<br/><span className="font-normal text-ink-400">/{maxes.cat2}</span></th>
                    <th rowSpan={2} className="px-2 py-2.5 font-bold text-ink-500 text-[10px] uppercase text-center border-r border-ink-100 dark:border-ink-700">CAT3<br/><span className="font-normal text-ink-400">/{maxes.cat3}</span></th>
                    <th rowSpan={2} className="px-2 py-2.5 font-bold text-ink-500 text-[10px] uppercase text-center border-r border-ink-100 dark:border-ink-700">Partial<br/><span className="font-normal text-ink-400">/{maxes.partial}</span></th>
                    <th rowSpan={2} className="px-2 py-2.5 font-bold text-ink-500 text-[10px] uppercase text-center border-r border-ink-100 dark:border-ink-700 bg-amber-50 dark:bg-amber-500/10">Tot. CATs<br/><span className="font-normal text-ink-400">/{maxes.cats}</span></th>
                    <th colSpan={2} className="px-2 py-1.5 font-bold text-ink-500 text-[10px] uppercase text-center border-r border-ink-100 dark:border-ink-700">Final Exam /{maxes.final}</th>
                    <th rowSpan={2} className="px-2 py-2.5 font-bold text-ink-500 text-[10px] uppercase text-center border-r border-ink-100 dark:border-ink-700 bg-amber-50 dark:bg-amber-500/10">Final Mark</th>
                    <th rowSpan={2} className="px-2 py-2.5 font-bold text-ink-500 text-[10px] uppercase text-center border-r border-ink-100 dark:border-ink-700 bg-amber-50 dark:bg-amber-500/10">Tot %</th>
                    <th rowSpan={2} className="px-2 py-2.5 font-bold text-ink-500 text-[10px] uppercase text-center border-r border-ink-100 dark:border-ink-700 bg-amber-50 dark:bg-amber-500/10">Decision</th>
                    <th rowSpan={2} className="px-2 py-2.5 font-bold text-ink-500 text-[10px] uppercase">Remarks</th>
                  </tr>
                  <tr className="bg-sky-50 dark:bg-ink-800/50 border-b border-ink-100 dark:border-ink-700">
                    <th className="px-2 py-1.5 font-semibold text-ink-500 text-[10px] uppercase text-center border-r border-ink-100 dark:border-ink-700">1st sitting</th>
                    <th className="px-2 py-1.5 font-semibold text-ink-500 text-[10px] uppercase text-center border-r border-ink-100 dark:border-ink-700">2nd / Special</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-ink-100 dark:divide-ink-700">
                  {roster.map((r: MarksRosterRow, i: number) => {
                    const d = drafts[r.regnumber] ?? { cat1: '', cat2: '', cat3: '', partial: '', exam1: '', exam2: '', remarks: '' }
                    const c = computed[r.regnumber]
                    const isExempted = !!r.is_exempted
                    const rowDisabled = isLocked || isExempted
                    return (
                      <tr key={r.regnumber} className={`hover:bg-ink-50/50 dark:hover:bg-ink-700/20 ${
                        isExempted ? 'bg-violet-50/40 dark:bg-violet-500/10' :
                        dirty[r.regnumber] ? 'bg-amber-50/40 dark:bg-amber-500/5' : ''
                      }`}>
                        <td className="px-2 py-2 text-ink-500 border-r border-ink-100 dark:border-ink-700">
                          <span className="inline-flex items-center gap-1">
                            {dirty[r.regnumber] && !isExempted && (
                              <span className="w-1.5 h-1.5 rounded-full bg-amber-500" title="Unsaved changes" />
                            )}
                            {i + 1}
                          </span>
                        </td>
                        <td className="px-2 py-2 border-r border-ink-100 dark:border-ink-700">
                          {r.fname}
                          {isExempted ? (
                            <span
                              className="ml-1.5 inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[9px] font-bold bg-violet-100 text-violet-700 dark:bg-violet-500/15 dark:text-violet-300"
                              title={r.exemption_reason ?? 'Exempted from this module'}
                            >
                              EXEMPTED
                            </span>
                          ) : r.reg_status === 'completed' ? (
                            <span
                              className="ml-1.5 inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[9px] font-bold bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300"
                              title="Marks saved — student passed this module"
                            >
                              COMPLETED
                            </span>
                          ) : r.reg_status === 'failed' ? (
                            <span
                              className="ml-1.5 inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[9px] font-bold bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300"
                              title="Marks saved — student failed this module"
                            >
                              FAILED
                            </span>
                          ) : null}
                        </td>
                        <td className="px-2 py-2 border-r border-ink-100 dark:border-ink-700">{r.lname}</td>
                        <td className="px-2 py-2 text-center border-r border-ink-100 dark:border-ink-700">{r.sex ?? '—'}</td>
                        <td className="px-2 py-2 font-mono border-r border-ink-100 dark:border-ink-700">{r.regnumber}</td>
                        <td className="px-2 py-2 border-r border-ink-100 dark:border-ink-700">{r.student_program ?? '—'}</td>
                        <td className="px-2 py-2 border-r border-ink-100 dark:border-ink-700">{r.option_acro ?? '—'}</td>
                        <td className="px-1 py-1 text-center border-r border-ink-100 dark:border-ink-700">
                          <NumCell cellId={`${i}:0`} value={d.cat1} max={maxes.cat1} disabled={rowDisabled} onChange={(v) => setCell(r.regnumber, 'cat1', v)} />
                        </td>
                        <td className="px-1 py-1 text-center border-r border-ink-100 dark:border-ink-700">
                          <NumCell cellId={`${i}:1`} value={d.cat2} max={maxes.cat2} disabled={rowDisabled} onChange={(v) => setCell(r.regnumber, 'cat2', v)} />
                        </td>
                        <td className="px-1 py-1 text-center border-r border-ink-100 dark:border-ink-700">
                          <NumCell cellId={`${i}:2`} value={d.cat3} max={maxes.cat3} disabled={rowDisabled} onChange={(v) => setCell(r.regnumber, 'cat3', v)} />
                        </td>
                        <td className="px-1 py-1 text-center border-r border-ink-100 dark:border-ink-700">
                          <NumCell cellId={`${i}:3`} value={d.partial} max={maxes.partial} disabled={rowDisabled} onChange={(v) => setCell(r.regnumber, 'partial', v)} />
                        </td>
                        <td className="px-2 py-2 text-center font-semibold bg-amber-50/50 dark:bg-amber-500/5 border-r border-ink-100 dark:border-ink-700">
                          {isExempted ? '—' : (c?.catsTotal ?? '—')}
                        </td>
                        <td className="px-1 py-1 text-center border-r border-ink-100 dark:border-ink-700">
                          <NumCell cellId={`${i}:4`} value={d.exam1} max={maxes.final} disabled={rowDisabled} onChange={(v) => setCell(r.regnumber, 'exam1', v)} />
                        </td>
                        <td className="px-1 py-1 text-center border-r border-ink-100 dark:border-ink-700">
                          <NumCell cellId={`${i}:5`} value={d.exam2} max={maxes.final} disabled={rowDisabled} onChange={(v) => setCell(r.regnumber, 'exam2', v)} />
                        </td>
                        <td className="px-2 py-2 text-center font-semibold bg-amber-50/50 dark:bg-amber-500/5 border-r border-ink-100 dark:border-ink-700">
                          {isExempted ? '—' : (c?.finalMark ?? '—')}
                        </td>
                        <td className="px-2 py-2 text-center font-semibold bg-amber-50/50 dark:bg-amber-500/5 border-r border-ink-100 dark:border-ink-700">
                          {isExempted
                            ? (r.percentage != null ? `${Math.round(Number(r.percentage))}%` : '—')
                            : (c?.pct != null ? `${c.pct}%` : '—')}
                        </td>
                        <td className="px-2 py-2 text-center bg-amber-50/50 dark:bg-amber-500/5 border-r border-ink-100 dark:border-ink-700">
                          {isExempted
                            ? <DecisionPill decision={r.decision ?? (Number(r.percentage) >= 50 ? 'P' : 'F&R')} />
                            : (c?.decision ? <DecisionPill decision={c.decision} /> : <span className="text-ink-400">—</span>)}
                        </td>
                        <td className="px-1 py-1">
                          {isExempted ? (
                            <span className="text-[11.5px] italic text-violet-700 dark:text-violet-300">
                              Exempted{r.exemption_reason ? ` — ${r.exemption_reason}` : ''}
                            </span>
                          ) : (
                            <input
                              type="text"
                              className="input input-sm w-full"
                              placeholder="—"
                              value={d.remarks}
                              disabled={isLocked}
                              onChange={(e) => setCell(r.regnumber, 'remarks', e.target.value)}
                            />
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* Lecturer footer */}
          <div className="card p-3 flex flex-wrap items-center gap-x-6 gap-y-1 text-[13px]">
            <div>
              <span className="text-ink-500 font-semibold">Lecturer's Names: </span>
              <span className="text-ink-800 dark:text-white">{moduleH.lecturer_name ?? '—'}</span>
            </div>
            <div>
              <span className="text-ink-500 font-semibold">Lecturer's Email: </span>
              <span className="text-ink-800 dark:text-white">{moduleH.lecturer_email ?? '—'}</span>
            </div>
          </div>

        </>
      )}
    </div>
  )
}

/* ─── small UI bits ──────────────────────────────────────────────────── */

function ModuleHeaderCard({
  moduleH, classSize, status, disabled, canWrite, onWorkflow, wfPending,
}: {
  moduleH: MarksModuleHeader
  classSize: number
  status:   MarksWorkflowStatus
  disabled: boolean
  canWrite: boolean
  onWorkflow: (a: 'open_claims' | 'submit' | 'confirm' | 'reset') => void
  wfPending: boolean
}) {
  const statusLabel: Record<MarksWorkflowStatus, string> = {
    draft:        'Draft',
    claims_open:  'Claims open',
    submitted:    'Submitted to faculty',
    confirmed:    'Confirmed & sent to options',
  }
  const statusTone: Record<MarksWorkflowStatus, string> = {
    draft:        'bg-ink-100 text-ink-700 dark:bg-ink-700/60 dark:text-ink-200',
    claims_open:  'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300',
    submitted:    'bg-sky-100 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300',
    confirmed:    'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300',
  }
  return (
    <div className="card p-4 space-y-3">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="space-y-1">
          <div className="text-[12px] uppercase font-bold text-ink-400 tracking-wide">Catholic University of Rwanda</div>
          <div className="text-[15px] font-bold text-ink-900 dark:text-white">
            {moduleH.module_name}
          </div>
          <div className="text-[12px] text-ink-500 font-mono">{moduleH.module_code}</div>
        </div>
        <span className={`px-2.5 py-1 rounded-full text-[11px] font-bold ${statusTone[status]}`}>
          {statusLabel[status]}
        </span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-x-6 gap-y-1.5 text-[13px]">
        <Field label="Program"    value={moduleH.program ?? moduleH.option_acronym ?? '—'} />
        <Field label="Level"      value={moduleH.level !== null && moduleH.level !== undefined ? `Level ${moduleH.level}` : '—'} />
        <Field label="Class size" value={String(classSize)} />
        <Field label="Option"     value={moduleH.option_acronym ?? '—'} />
        <Field label="Department" value={moduleH.dep_name ? `${moduleH.dep_name}${moduleH.dep_acronym ? ` (${moduleH.dep_acronym})` : ''}` : '—'} />
        <Field label="Faculty"    value={moduleH.fac_name ? `${moduleH.fac_name}${moduleH.fac_code ? ` (${moduleH.fac_code})` : ''}` : '—'} />
      </div>

      <div className="flex flex-wrap items-center gap-2 pt-1 border-t border-ink-100 dark:border-ink-700">
        {canWrite && (
          <>
            <button
              className="btn-ghost btn-sm"
              disabled={wfPending || status === 'claims_open' || status === 'submitted' || status === 'confirmed'}
              onClick={() => onWorkflow('open_claims')}
              title="Open the 15-day claims window for students to query their marks"
            >
              <FileCheck className="w-3.5 h-3.5" /> Open claims
            </button>
            <button
              className="btn-ghost btn-sm"
              disabled={wfPending || status === 'submitted' || status === 'confirmed'}
              onClick={() => onWorkflow('submit')}
              title="Submit to faculty & close claims"
            >
              <SendHorizontal className="w-3.5 h-3.5" /> Submit & close claims
            </button>
            <button
              className="btn-ghost btn-sm"
              disabled={wfPending || status !== 'submitted'}
              onClick={() => onWorkflow('confirm')}
              title="Confirm and send to options"
            >
              <CheckCircle2 className="w-3.5 h-3.5" /> Confirm & send to options
            </button>
            <button
              className="btn-ghost btn-sm ml-auto"
              disabled={wfPending || status === 'draft'}
              onClick={() => onWorkflow('reset')}
              title="Re-open editing for this module"
            >
              <RotateCcw className="w-3.5 h-3.5" /> Reset to draft
            </button>
          </>
        )}
        {disabled && (
          <span className="inline-flex items-center gap-1 text-[12px] text-ink-500">
            <Lock className="w-3 h-3" /> Read-only
          </span>
        )}
      </div>
    </div>
  )
}

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex">
      <span className="text-ink-500 font-semibold w-32 shrink-0">{label}:</span>
      <span className="text-ink-800 dark:text-white">{value}</span>
    </div>
  )
}

function Stat({ icon, label, value, tone }: { icon: React.ReactNode; label: string; value: React.ReactNode; tone?: 'warn' }) {
  return (
    <div className={`card p-3 flex items-center gap-3 ${tone === 'warn' ? 'ring-1 ring-amber-300/60' : ''}`}>
      <div className={`w-9 h-9 rounded-md flex items-center justify-center ${
        tone === 'warn' ? 'bg-amber-100 text-amber-700' : 'bg-brand/10 text-brand dark:bg-brand/20 dark:text-gold-400'
      }`}>
        {icon}
      </div>
      <div>
        <div className="text-[10px] uppercase font-bold text-ink-400">{label}</div>
        <div className="text-base font-bold text-ink-900 dark:text-white leading-tight">{value}</div>
      </div>
    </div>
  )
}

function MaxField({
  label, value, onChange, disabled,
}: { label: string; value: number; onChange: (v: number) => void; disabled?: boolean }) {
  return (
    <label className="inline-flex items-center gap-1">
      <span className="text-ink-600">{label}</span>
      <input
        type="number"
        min={1}
        step="1"
        className="input input-sm w-16"
        value={value}
        disabled={disabled}
        onChange={(e) => {
          const n = Number(e.target.value)
          onChange(Number.isFinite(n) && n > 0 ? n : 0)
        }}
      />
    </label>
  )
}

function NumCell({
  value, max, onChange, disabled, cellId,
}: { value: string; max: number; onChange: (v: string) => void; disabled?: boolean; cellId?: string }) {
  const clamp = (raw: string): string => {
    if (raw === '') return ''
    const n = Number(raw)
    if (!Number.isFinite(n)) return ''
    if (n < 0)   return '0'
    if (n > max) return String(max)
    return raw
  }

  // Excel-like nav: Enter / ↓ → next row; ↑ → prev row; ← / → → adjacent col.
  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!cellId) return
    const [rStr, cStr] = cellId.split(':')
    const r = Number(rStr), c = Number(cStr)
    let dr = 0, dc = 0
    if (e.key === 'Enter' || e.key === 'ArrowDown') dr = 1
    else if (e.key === 'ArrowUp') dr = -1
    else if (e.key === 'ArrowRight' && (e.target as HTMLInputElement).selectionStart === (e.target as HTMLInputElement).value.length) dc = 1
    else if (e.key === 'ArrowLeft'  && (e.target as HTMLInputElement).selectionStart === 0) dc = -1
    else return
    e.preventDefault()
    const nextId = `${r + dr}:${c + dc}`
    const next = document.querySelector<HTMLInputElement>(`input[data-mark-cell="${nextId}"]`)
    if (next) { next.focus(); next.select() }
  }

  return (
    <input
      type="number"
      step="0.5"
      min={0}
      max={max}
      className="input input-sm w-16 text-center"
      placeholder="—"
      value={value}
      disabled={disabled}
      data-mark-cell={cellId}
      onChange={(e) => onChange(clamp(e.target.value))}
      onBlur={(e) => onChange(clamp(e.target.value))}
      onFocus={(e) => e.currentTarget.select()}
      onKeyDown={onKeyDown}
    />
  )
}

function DecisionPill({ decision }: { decision: string }) {
  const tone = decision === 'P'
    ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300'
    : 'bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-300'
  return <span className={`inline-block px-2 py-0.5 rounded-full text-[11px] font-bold ${tone}`}>{decision}</span>
}

/* ─── Student picker — admin "let me select" panel ──────────────────── */

function StudentPicker({
  disabled, existingRegs, onPick, onRemove, extrasCount,
}: {
  disabled:     boolean
  existingRegs: Set<string>
  onPick:       (s: MarksRosterRow) => void
  onRemove:     (reg: string) => void
  extrasCount:  number
}) {
  const [open, setOpen]         = useState(false)
  const [q, setQ]               = useState('')
  const [debounced, setDebounced] = useState('')

  useEffect(() => {
    const t = setTimeout(() => setDebounced(q.trim()), 250)
    return () => clearTimeout(t)
  }, [q])

  const searchQ = useQuery({
    queryKey: ['marks', 'student-search', debounced],
    queryFn: () => studentService.list({ q: debounced, per_page: 20, student_state: 'active' }),
    enabled: open && debounced.length >= 2,
  })
  const results = ((searchQ.data as any)?.data?.data ?? []) as any[]

  if (!open) {
    return (
      <div className="card p-3 flex items-center justify-between gap-3 flex-wrap">
        <div className="text-[13px] text-ink-500">
          {extrasCount > 0
            ? <>You added <span className="font-semibold text-ink-800 dark:text-white">{extrasCount}</span> student(s) manually.</>
            : <>Need a different roster? Pick students by name or registration number.</>}
        </div>
        <button
          className="btn-ghost btn-sm"
          disabled={disabled}
          onClick={() => setOpen(true)}
        >
          <UserPlus className="w-3.5 h-3.5" /> Pick students
        </button>
      </div>
    )
  }

  return (
    <div className="card p-3 space-y-2">
      <div className="flex items-center gap-2">
        <Search className="w-4 h-4 text-ink-400" />
        <input
          type="text"
          autoFocus
          className="input input-sm flex-1"
          placeholder="Search by name or registration number (min 2 chars)…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          disabled={disabled}
        />
        <button className="btn-ghost btn-sm" onClick={() => setOpen(false)}>
          <X className="w-3.5 h-3.5" /> Done
        </button>
      </div>

      {debounced.length < 2 ? (
        <div className="text-[12px] text-ink-400 px-1">Type at least 2 characters.</div>
      ) : searchQ.isLoading ? (
        <div className="text-[12px] text-ink-400 px-1 inline-flex items-center gap-1">
          <Loader2 className="w-3 h-3 animate-spin" /> Searching…
        </div>
      ) : results.length === 0 ? (
        <div className="text-[12px] text-ink-400 px-1">No matches.</div>
      ) : (
        <ul className="max-h-64 overflow-y-auto divide-y divide-ink-100 dark:divide-ink-700 border border-ink-100 dark:border-ink-700 rounded-md">
          {results.map((s: any) => {
            const reg = String(s.regnumber ?? '')
            if (!reg) return null
            const already = existingRegs.has(reg)
            return (
              <li key={reg} className="flex items-center justify-between gap-3 px-3 py-2 text-[13px] hover:bg-ink-50/50 dark:hover:bg-ink-700/20">
                <div className="min-w-0">
                  <div className="font-medium truncate">{s.fname} {s.lname}</div>
                  <div className="text-[11px] text-ink-500 font-mono">{reg}</div>
                </div>
                {already ? (
                  <button
                    className="btn-ghost btn-sm text-red-600"
                    onClick={() => onRemove(reg)}
                    disabled={disabled}
                  >
                    Remove
                  </button>
                ) : (
                  <button
                    className="btn-ghost btn-sm"
                    disabled={disabled}
                    onClick={() => onPick(toRosterRow(s))}
                  >
                    Add
                  </button>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}

/** Build a placeholder MarksRosterRow from a Student record. */
function toRosterRow(s: any): MarksRosterRow {
  return {
    student_id:        Number(s.id ?? 0),
    regnumber:         String(s.regnumber ?? ''),
    fname:             String(s.fname ?? ''),
    lname:             String(s.lname ?? ''),
    email:             s.email ?? null,
    sex:               s.gender ?? null,
    student_program:   s.program ?? null,
    option_acro:       s.std_option ?? null,
    mark_id:           null,

    cat_marks:         null,
    assignment_marks:  null,
    exam_marks:        null,
    cat_max:           20,
    assignment_max:    10,
    exam_max:          70,

    cat1:              null,
    cat2:              null,
    cat3:              null,
    partial_exam:      null,
    cat1_max:          15,
    cat2_max:          15,
    cat3_max:          15,
    partial_exam_max:  15,
    cats_max:          60,
    exam_1st_sitting:  null,
    exam_2nd_sitting:  null,
    final_exam_max:    40,

    total:             null,
    percentage:        null,
    grade:             null,
    decision:          null,
    status:            null,
    remarks:           null,
    updated_at:        null,
    teaching_started_on: null,
    teaching_ended_on:   null,
  }
}

/* ─── Searchable module combobox ─────────────────────────────────────── */

function ModuleCombobox({
  modules, value, onChange, disabled, loading,
}: {
  modules:  MarkableModule[]
  value:    number
  onChange: (id: number) => void
  disabled?: boolean
  loading?:  boolean
}) {
  const [open, setOpen]       = useState(false)
  const [query, setQuery]     = useState('')
  const [highlight, setHighlight] = useState(0)
  const wrapRef = useRef<HTMLDivElement | null>(null)
  const inputRef = useRef<HTMLInputElement | null>(null)

  const selected = modules.find((m) => m.module_id === value) ?? null

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return modules
    return modules.filter((m) =>
      m.module_code.toLowerCase().includes(q) ||
      m.module_name.toLowerCase().includes(q)
    )
  }, [modules, query])

  // Click outside closes the panel.
  useEffect(() => {
    if (!open) return
    const onDoc = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [open])

  // Reset highlight when the filtered list changes.
  useEffect(() => { setHighlight(0) }, [query, open])

  // Focus the search input when opening.
  useEffect(() => {
    if (open) requestAnimationFrame(() => inputRef.current?.focus())
  }, [open])

  const onKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setHighlight((h) => Math.min(h + 1, filtered.length - 1)) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setHighlight((h) => Math.max(h - 1, 0)) }
    else if (e.key === 'Enter') {
      e.preventDefault()
      const m = filtered[highlight]
      if (m) { onChange(m.module_id); setOpen(false); setQuery('') }
    } else if (e.key === 'Escape') {
      e.preventDefault(); setOpen(false)
    }
  }

  return (
    <div ref={wrapRef} className="relative w-80">
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((v) => !v)}
        className={`w-full flex items-center gap-2 input input-sm text-left ${
          disabled ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer'
        }`}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span className="flex-1 min-w-0 truncate">
          {loading
            ? <span className="text-ink-400">Loading modules…</span>
            : selected
              ? <>
                  <span className="font-mono text-ink-500 mr-1.5">{selected.module_code}</span>
                  <span className="text-ink-800 dark:text-white">{selected.module_name}</span>
                </>
              : <span className="text-ink-400">Select module…</span>
          }
        </span>
        <svg className={`w-3 h-3 shrink-0 text-ink-400 transition-transform ${open ? 'rotate-180' : ''}`} viewBox="0 0 12 12" fill="none">
          <path d="M3 4.5l3 3 3-3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {open && (
        <div className="absolute z-30 mt-1 w-[28rem] right-0 rounded-lg border border-ink-100 dark:border-ink-700 bg-white dark:bg-ink-800 shadow-lg overflow-hidden">
          <div className="p-2 border-b border-ink-100 dark:border-ink-700 bg-ink-50/40 dark:bg-ink-700/40">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-ink-400 pointer-events-none" />
              <input
                ref={inputRef}
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={onKey}
                placeholder="Search by code or name…"
                className="w-full input input-sm pl-8"
              />
            </div>
            <div className="mt-1.5 px-1 text-[11px] text-ink-400 flex items-center justify-between">
              <span>{filtered.length} of {modules.length} modules</span>
              <span className="hidden sm:inline">↑↓ navigate · enter select · esc close</span>
            </div>
          </div>

          <ul className="max-h-72 overflow-y-auto py-1" role="listbox">
            {filtered.length === 0 ? (
              <li className="px-3 py-6 text-center text-[13px] text-ink-400">
                No modules match "{query}".
              </li>
            ) : filtered.map((m, i) => {
              const isActive = i === highlight
              const isSelected = m.module_id === value
              return (
                <li
                  key={m.module_id}
                  role="option"
                  aria-selected={isSelected}
                  onMouseEnter={() => setHighlight(i)}
                  onClick={() => { onChange(m.module_id); setOpen(false); setQuery('') }}
                  className={`px-3 py-2 cursor-pointer flex items-center gap-3 text-[13px] ${
                    isActive ? 'bg-primary-50 dark:bg-primary-900/30' : ''
                  } ${isSelected ? 'text-primary-700 dark:text-primary-200' : 'text-ink-800 dark:text-ink-100'}`}
                >
                  <span className="font-mono text-[12px] tabular-nums w-24 shrink-0 text-ink-500">
                    {m.module_code}
                  </span>
                  <span className="flex-1 min-w-0 truncate">{m.module_name}</span>
                  {m.level !== null && m.level !== undefined && (
                    <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-ink-100 text-ink-600 dark:bg-ink-700/60 dark:text-ink-300 shrink-0">
                      L{m.level}
                    </span>
                  )}
                  {isSelected && <CheckCircle2 className="w-3.5 h-3.5 text-primary-600 shrink-0" />}
                </li>
              )
            })}
          </ul>
        </div>
      )}
    </div>
  )
}

/* ─── Import helpers ────────────────────────────────────────────────── */

function emptyDraft(): RowDraft {
  return { cat1: '', cat2: '', cat3: '', partial: '', exam1: '', exam2: '', remarks: '' }
}

function sameDraft(a: RowDraft, b: RowDraft): boolean {
  return a.cat1 === b.cat1 && a.cat2 === b.cat2 && a.cat3 === b.cat3 &&
         a.partial === b.partial && a.exam1 === b.exam1 && a.exam2 === b.exam2 &&
         a.remarks === b.remarks
}

interface ImportEntry {
  regnumber: string
  fname:     string
  lname:     string
  matched:   boolean
  current:   RowDraft
  incoming:  RowDraft
  changed:   boolean
}

interface ImportPreview {
  entries: ImportEntry[]
  summary: { matched: number; unmatched: number; unchanged: number }
}

/* ─── Import preview modal ──────────────────────────────────────────── */

function ImportPreviewModal({
  preview, onCancel, onApprove,
}: {
  preview:  ImportPreview | null
  onCancel: () => void
  onApprove: () => void
}) {
  if (!preview) return null
  const { entries, summary } = preview
  const cols: { k: keyof RowDraft; label: string }[] = [
    { k: 'cat1', label: 'C1' }, { k: 'cat2', label: 'C2' }, { k: 'cat3', label: 'C3' },
    { k: 'partial', label: 'P' }, { k: 'exam1', label: 'E1' }, { k: 'exam2', label: 'E2' },
  ]
  return (
    <div className="fixed inset-0 z-50 bg-ink-900/60 backdrop-blur-sm flex items-center justify-center p-4 animate-fade-in">
      <div className="bg-white dark:bg-ink-800 w-full max-w-5xl max-h-[88vh] rounded-xl shadow-2xl flex flex-col overflow-hidden">
        <div className="px-5 py-3 border-b border-ink-100 dark:border-ink-700 flex items-center justify-between gap-3">
          <div>
            <h3 className="text-base font-bold text-ink-900 dark:text-white">Review imported marks</h3>
            <p className="text-[12px] text-ink-500">
              Approve to overwrite the marks for matched students. Unmatched rows are ignored.
            </p>
          </div>
          <button className="icon-btn" onClick={onCancel} aria-label="Close">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="px-5 py-3 border-b border-ink-100 dark:border-ink-700 flex flex-wrap items-center gap-3 text-[12.5px]">
          <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded-full bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300 font-semibold">
            <CheckCircle2 className="w-3 h-3" /> {summary.matched} will be updated
          </span>
          {summary.unchanged > 0 && (
            <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded-full bg-ink-100 text-ink-600 dark:bg-ink-700/60 dark:text-ink-300">
              {summary.unchanged} unchanged
            </span>
          )}
          {summary.unmatched > 0 && (
            <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded-full bg-amber-50 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300 font-semibold">
              <AlertTriangle className="w-3 h-3" /> {summary.unmatched} unmatched
            </span>
          )}
          <span className="ml-auto text-ink-400">{entries.length} row(s) read</span>
        </div>

        <div className="flex-1 overflow-auto">
          <table className="w-full text-left text-[12.5px]">
            <thead className="bg-ink-50/70 dark:bg-ink-700/40 sticky top-0 z-10 text-[10px] uppercase font-bold text-ink-500">
              <tr>
                <th className="px-3 py-2 border-b border-ink-100 dark:border-ink-700">Status</th>
                <th className="px-3 py-2 border-b border-ink-100 dark:border-ink-700">Reg #</th>
                <th className="px-3 py-2 border-b border-ink-100 dark:border-ink-700">Student</th>
                {cols.map((c) => (
                  <th key={c.k} colSpan={2} className="px-2 py-2 border-b border-ink-100 dark:border-ink-700 text-center">{c.label}</th>
                ))}
              </tr>
              <tr>
                <th className="border-b border-ink-100 dark:border-ink-700"></th>
                <th className="border-b border-ink-100 dark:border-ink-700"></th>
                <th className="border-b border-ink-100 dark:border-ink-700"></th>
                {cols.map((c) => (
                  <Fragment2 key={c.k}>
                    <th className="px-2 py-1 border-b border-ink-100 dark:border-ink-700 text-center text-[9px] font-medium text-ink-400">cur</th>
                    <th className="px-2 py-1 border-b border-ink-100 dark:border-ink-700 text-center text-[9px] font-medium text-ink-400">new</th>
                  </Fragment2>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-ink-100 dark:divide-ink-700">
              {entries.map((e, i) => (
                <tr key={i} className={e.matched
                  ? (e.changed ? 'bg-emerald-50/30 dark:bg-emerald-500/5' : '')
                  : 'bg-amber-50/30 dark:bg-amber-500/5'}>
                  <td className="px-3 py-1.5 whitespace-nowrap">
                    {e.matched
                      ? (e.changed
                          ? <span className="text-emerald-700 dark:text-emerald-300 inline-flex items-center gap-1"><CheckCircle2 className="w-3 h-3" /> Update</span>
                          : <span className="text-ink-400">Unchanged</span>)
                      : <span className="text-amber-700 dark:text-amber-300 inline-flex items-center gap-1"><AlertTriangle className="w-3 h-3" /> Not in roster</span>}
                  </td>
                  <td className="px-3 py-1.5 font-mono">{e.regnumber}</td>
                  <td className="px-3 py-1.5">{e.matched ? `${e.fname} ${e.lname}` : '—'}</td>
                  {cols.map((c) => {
                    const before = e.current[c.k]
                    const after  = e.incoming[c.k]
                    const diff   = e.matched && before !== after
                    return (
                      <Fragment2 key={c.k}>
                        <td className="px-2 py-1.5 text-center text-ink-400 text-[11px]">{before || '—'}</td>
                        <td className={`px-2 py-1.5 text-center text-[11px] ${diff ? 'font-bold text-emerald-700 dark:text-emerald-300' : 'text-ink-400'}`}>
                          {after || '—'}
                        </td>
                      </Fragment2>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="px-5 py-3 border-t border-ink-100 dark:border-ink-700 flex items-center justify-end gap-2 bg-ink-50/40 dark:bg-ink-700/20">
          <button className="btn-ghost btn-sm" onClick={onCancel}>Cancel</button>
          <button
            className="btn-primary btn-sm"
            disabled={summary.matched === 0}
            onClick={onApprove}
          >
            <CheckCircle2 className="w-3.5 h-3.5" />
            {summary.matched === 0
              ? 'Nothing to apply'
              : `Approve & apply ${summary.matched} row${summary.matched === 1 ? '' : 's'}`}
          </button>
        </div>
      </div>
    </div>
  )
}

/** React.Fragment alias to keep <Fragment2 key…> JSX legal as a sibling of <th>/<td>. */
function Fragment2({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}

/* ═══════════════════════════════════════════════════════════════════════════
 * MarksSchedulePicker — landing view that mirrors the Attendance flow.
 * Shows every teaching block on the timetable as a flat table; clicking a
 * row opens that module's marks roster.
 * ═══════════════════════════════════════════════════════════════════════ */
const DAY_LABELS_MARKS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

function formatDayPatternMarks(pattern: string | null, dayOfWeek: number | null): string {
  const days = (pattern && pattern.trim() !== ''
    ? pattern.split(',').map((s) => Number(s.trim())).filter((n) => n >= 1 && n <= 7)
    : (dayOfWeek ? [dayOfWeek] : []))
  if (!days.length) return '—'
  return days.map((d) => DAY_LABELS_MARKS[d - 1]).join(', ')
}

function MarksSchedulePicker({
  termId, terms, onChangeTerm, onPickModule,
}: {
  termId:        number
  terms:         any[]
  onChangeTerm:  (id: number) => void
  onPickModule:  (moduleId: number, code: string, name: string) => void
}) {
  const [programId, setProgramId] = useState<number>(0)
  const [gLevel, setGLevel]       = useState<number>(0)
  const [gSearch, setGSearch]     = useState('')

  const programsQ = useQuery({
    queryKey:  ['portal', 'programs'],
    queryFn:   () => portalService.getPrograms(),
    staleTime: 5 * 60_000,
  })
  const program = useMemo(
    () => (programsQ.data?.data ?? []).find((p: any) => Number(p.id) === programId) ?? null,
    [programsQ.data, programId],
  )

  const levelsQ = useQuery({
    queryKey: ['academics', 'levels'],
    queryFn:  () => academicsMgmtService.list<any>('levels', { per_page: 100 }),
    staleTime: 5 * 60_000,
  })
  const levels: any[] = levelsQ.data?.data?.data ?? []

  // Reuse the attendance endpoint — it returns every module_offerings block
  // with the same shape the marks roster needs (module id/code/name).
  const blocksQ = useQuery({
    queryKey:  ['marks', 'scheduled-blocks', programId || 0],
    queryFn:   () => attendanceService.scheduledBlocks(
      programId ? { program_id: programId } : {},
    ),
    staleTime: 60_000,
  })
  const allBlocks: ScheduledBlock[] = blocksQ.data?.data?.rows ?? []

  const filteredBlocks = useMemo(() => {
    let list = allBlocks
    if (gLevel) list = list.filter((b) => Number(b.level ?? 0) === gLevel)
    if (gSearch.trim()) {
      const q = gSearch.toLowerCase()
      list = list.filter((b) =>
        (b.module_code ?? '').toLowerCase().includes(q)
        || (b.module_name ?? '').toLowerCase().includes(q)
        || (b.program_name ?? '').toLowerCase().includes(q),
      )
    }
    return list
  }, [allBlocks, gLevel, gSearch])

  const hasFilters = gLevel > 0 || gSearch.trim().length > 0

  return (
    <div className="space-y-4 animate-fade-in">
      <section className="card p-4">
        <div className="flex items-center gap-3 flex-wrap">
          <div className="min-w-0 flex-1">
            <h2 className="text-[16px] font-semibold text-ink-900 dark:text-white">
              Exam results — scheduled modules
            </h2>
            <p className="text-[12px] text-ink-500">
              Every module that has a teaching block on the timetable. Click a row to open the
              official CUR mark sheet for that module.
            </p>
          </div>
          <select
            className="input input-sm w-44 shrink-0"
            value={termId || ''}
            onChange={(e) => onChangeTerm(Number(e.target.value))}
            title="Academic term"
          >
            <option value="" disabled>Select term…</option>
            {terms.map((t: any) => (
              <option key={t.id} value={t.id}>
                {t.label}{t.is_current ? ' (current)' : ''}
              </option>
            ))}
          </select>
        </div>

        <div className="mt-3 flex items-center gap-2 flex-wrap">
          <Filter className="w-4 h-4 text-ink-400 shrink-0" />
          <div className="relative flex-1 min-w-[220px]">
            <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-ink-400" />
            <input
              className="input input-sm pl-8 w-full"
              placeholder="Search by module code or name…"
              value={gSearch}
              onChange={(e) => setGSearch(e.target.value)}
            />
          </div>
          <div className="w-72 shrink-0">
            <SearchableSelect
              options={(programsQ.data?.data ?? []).map((p: any) => ({ value: p.id, label: p.name }))}
              value={programId}
              onChange={(v) => setProgramId(Number(v))}
              allLabel="All programmes"
            />
          </div>
          <div className="w-44 shrink-0">
            <SearchableSelect
              options={levels.map((l: any) => ({ value: l.id, label: l.name }))}
              value={gLevel}
              onChange={(v) => setGLevel(Number(v))}
              allLabel="All levels"
            />
          </div>
          {(hasFilters || programId > 0) && (
            <button
              type="button"
              className="icon-btn text-ink-400 hover:text-rose-500"
              title="Clear all filters"
              onClick={() => { setGLevel(0); setGSearch(''); setProgramId(0) }}
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {program && (
          <div className="mt-3 inline-flex items-center gap-2 px-2.5 py-1 rounded-md bg-brand/5 border border-brand/20 text-[11.5px] text-brand">
            <BookOpen className="w-3.5 h-3.5" />
            <span className="font-semibold">{program.name}</span>
            <span className="text-ink-500">· {[program.department_name, program.faculty_name].filter(Boolean).join(' · ')}</span>
            <button
              type="button"
              onClick={() => setProgramId(0)}
              className="ml-1 text-ink-400 hover:text-rose-500"
              title="Clear programme filter"
            >
              <X className="w-3 h-3" />
            </button>
          </div>
        )}
      </section>

      <section className="card p-0 overflow-hidden">
        <div className="px-5 py-3 border-b border-ink-100 dark:border-ink-700 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <h3 className="font-semibold text-[14px] text-ink-900 dark:text-white">
              All schedules ({filteredBlocks.length})
            </h3>
            <p className="text-[11.5px] text-ink-500 mt-0.5">
              Same data as Module scheduling. Click any row to record marks for that module.
            </p>
          </div>
          {blocksQ.isFetching && <Loader2 className="w-3.5 h-3.5 animate-spin text-ink-400" />}
        </div>

        {blocksQ.isLoading ? (
          <div className="p-10 flex justify-center"><Loader2 className="w-5 h-5 animate-spin text-ink-400" /></div>
        ) : filteredBlocks.length === 0 ? (
          <div className="p-8 text-center text-ink-500 text-[13px] inline-flex flex-col items-center gap-2 w-full">
            <AlertCircle className="w-5 h-5 text-ink-300" />
            No teaching blocks match the current filters.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Code</th>
                  <th>Module &amp; component</th>
                  <th>Programme</th>
                  <th>Activity</th>
                  <th>Sem</th>
                  <th>Day</th>
                  <th>Start</th>
                  <th>End</th>
                  <th>Period</th>
                  <th>Teacher</th>
                  <th className="text-right">Action</th>
                </tr>
              </thead>
              <tbody>
                {filteredBlocks.map((b) => {
                  const pick = () => onPickModule(b.module_id, b.module_code ?? '', b.module_name ?? '')
                  return (
                    <tr
                      key={b.block_id}
                      className="cursor-pointer hover:bg-ink-50/50 dark:hover:bg-ink-700/20"
                      onClick={pick}
                    >
                      <td className="font-mono text-[12px] font-semibold">{b.module_code ?? '—'}</td>
                      <td className="text-[12.5px]">{b.module_name ?? '—'}</td>
                      <td className="text-[12px] text-ink-500">{b.program_acro ?? b.program_name ?? '—'}</td>
                      <td className="text-[12px]">{b.activity ?? '—'}</td>
                      <td className="text-[12px] text-ink-500">{b.semesters ?? '—'}</td>
                      <td className="text-[12px]">{formatDayPatternMarks(b.day_pattern, b.day_of_week)}</td>
                      <td className="text-[12px] tabular-nums text-ink-500">{b.start_date ?? '—'}</td>
                      <td className="text-[12px] tabular-nums text-ink-500">{b.end_date ?? '—'}</td>
                      <td className="text-[12px] tabular-nums text-ink-500">
                        {b.start_time?.slice(0, 5) ?? '—'}–{b.end_time?.slice(0, 5) ?? '—'}
                      </td>
                      <td className="text-[12px] text-ink-700 dark:text-ink-200">{b.instructor_name ?? '—'}</td>
                      <td className="text-right">
                        <button
                          type="button"
                          className="btn-primary btn-sm"
                          onClick={(e) => { e.stopPropagation(); pick() }}
                        >
                          Record marks
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  )
}
