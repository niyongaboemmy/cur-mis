import { useEffect, useMemo, useRef, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Loader2, Save, GraduationCap, Users, Percent } from 'lucide-react'
import toast from 'react-hot-toast'
import { academicService } from '@/services/academicService'
import {
  marksService,
  type MarkableModule,
  type MarksRosterRow,
  type SaveMarkRecord,
} from '@/services/marksService'

interface RowDraft {
  cat:        string
  assignment: string
  exam:       string
  remarks:    string
}

const num = (v: unknown): number | null => {
  if (v === null || v === undefined || v === '') return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

// CUR official grading scale — keep in sync with backend ModuleMarksController.gradeFor().
const gradeFor = (pct: number): string => {
  if (pct >= 80) return 'A' // Very Good
  if (pct >= 70) return 'B' // Good
  if (pct >= 60) return 'C' // Satisfaction
  if (pct >= 50) return 'D' // Pass
  return 'E'                // Fail
}

export default function ModulesMarksPage() {
  const qc = useQueryClient()

  /* ── filters: term + module ───────────────────────────────────── */
  const termsQ = useQuery({ queryKey: ['academic', 'terms'], queryFn: () => academicService.listTerms() })
  const terms  = termsQ.data?.data ?? []
  const [termId, setTermId] = useState<number>(0)
  useEffect(() => {
    if (!termId && terms.length) {
      const current = terms.find((t: any) => t.is_current) ?? terms[0]
      setTermId(current.id)
    }
  }, [terms, termId])

  const modulesQ = useQuery({
    queryKey: ['marks', 'markable-modules', termId],
    queryFn: () => marksService.markableModules({ academic_term_id: termId }),
    enabled: !!termId,
  })
  const modules: MarkableModule[] = modulesQ.data?.data ?? []
  const [moduleId, setModuleId] = useState<number>(0)
  // Reset module when term changes if no longer in list
  useEffect(() => {
    if (moduleId && modules.length && !modules.find((m) => m.module_id === moduleId)) {
      setModuleId(0)
    }
  }, [modules, moduleId])

  /* ── roster ───────────────────────────────────────────────────── */
  const listQ = useQuery({
    queryKey: ['marks', 'list', moduleId, termId],
    queryFn: () => marksService.list({ module_id: moduleId, academic_term_id: termId }),
    enabled: !!moduleId && !!termId,
  })
  const payload = listQ.data?.data
  const roster  = payload?.roster
  const summary = payload?.summary

  /* ── per-row draft state ──────────────────────────────────────── */
  const [drafts, setDrafts] = useState<Record<string, RowDraft>>({})
  const [maxes, setMaxes]   = useState<{ cat: number; assignment: number; exam: number }>({
    cat: 20, assignment: 10, exam: 70,
  })

  // Hydrate drafts only when the roster reference actually changes
  // (react-query keeps the same array between renders until refetch).
  const hydratedFor = useRef<MarksRosterRow[] | null>(null)
  useEffect(() => {
    if (!roster) return
    if (hydratedFor.current === roster) return
    hydratedFor.current = roster

    const next: Record<string, RowDraft> = {}
    for (const r of roster) {
      next[r.regnumber] = {
        cat:        r.cat_marks        != null ? String(r.cat_marks)        : '',
        assignment: r.assignment_marks != null ? String(r.assignment_marks) : '',
        exam:       r.exam_marks       != null ? String(r.exam_marks)       : '',
        remarks:    r.remarks ?? '',
      }
    }
    setDrafts(next)

    // Pick up the first stored row's maxes (same across the module).
    const first = roster.find((r) => r.mark_id !== null)
    if (first) {
      setMaxes({
        cat:        Number(first.cat_max)        || 20,
        assignment: Number(first.assignment_max) || 10,
        exam:       Number(first.exam_max)       || 70,
      })
    }
  }, [roster])

  const maxSum = maxes.cat + maxes.assignment + maxes.exam

  const computed = useMemo(() => {
    const map: Record<string, { total: number | null; pct: number | null; grade: string | null; hasAny: boolean }> = {}
    if (!roster) return map
    for (const r of roster) {
      const d = drafts[r.regnumber]
      if (!d) { map[r.regnumber] = { total: null, pct: null, grade: null, hasAny: false }; continue }
      const c = num(d.cat); const a = num(d.assignment); const e = num(d.exam)
      const hasAny = c !== null || a !== null || e !== null
      if (!hasAny) { map[r.regnumber] = { total: null, pct: null, grade: null, hasAny: false }; continue }
      const total = (c ?? 0) + (a ?? 0) + (e ?? 0)
      const pct   = maxSum > 0 ? +(total / maxSum * 100).toFixed(2) : null
      map[r.regnumber] = { total: +total.toFixed(2), pct, grade: pct !== null ? gradeFor(pct) : null, hasAny }
    }
    return map
  }, [drafts, roster, maxSum])

  const setCell = (reg: string, key: keyof RowDraft, val: string) => {
    setDrafts((prev) => ({ ...prev, [reg]: { ...(prev[reg] ?? { cat: '', assignment: '', exam: '', remarks: '' }), [key]: val } }))
  }

  /* ── save ─────────────────────────────────────────────────────── */
  const save = useMutation({
    mutationFn: () => {
      const records: SaveMarkRecord[] = (roster ?? [])
        .map((r): SaveMarkRecord | null => {
          const d = drafts[r.regnumber]; if (!d) return null
          const c = num(d.cat); const a = num(d.assignment); const e = num(d.exam)
          const remarks = d.remarks?.trim() || null
          if (c === null && a === null && e === null && !remarks) return null
          return {
            student_regnumber: r.regnumber,
            cat_marks: c, assignment_marks: a, exam_marks: e,
            cat_max: maxes.cat, assignment_max: maxes.assignment, exam_max: maxes.exam,
            remarks,
          }
        })
        .filter((x): x is SaveMarkRecord => x !== null)

      if (records.length === 0) return Promise.reject(new Error('Nothing to save yet.'))
      return marksService.save({ module_id: moduleId, academic_term_id: termId, records })
    },
    onSuccess: (res: any) => {
      toast.success(res?.message ?? `Saved ${res?.data?.saved ?? 0} record(s).`)
      qc.invalidateQueries({ queryKey: ['marks', 'list', moduleId, termId] })
    },
    onError: (e: any) => toast.error(e?.response?.data?.message ?? e?.message ?? 'Save failed'),
  })

  return (
    <div className="space-y-4 animate-fade-in">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-lg font-bold text-ink-900 dark:text-white">Module Marks</h2>
          <p className="text-[13px] text-ink-500">
            Pick a term and a module, fill CAT / Assignment / Exam — total, % and grade compute automatically.
          </p>
        </div>
        <div className="flex gap-2 items-center flex-wrap">
          <select
            className="input input-sm w-48"
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
          <select
            className="input input-sm w-72"
            value={moduleId || ''}
            disabled={!termId || modulesQ.isLoading}
            onChange={(e) => setModuleId(Number(e.target.value))}
          >
            <option value="" disabled>{modulesQ.isLoading ? 'Loading modules…' : 'Select module…'}</option>
            {modules.map((m) => (
              <option key={m.module_id} value={m.module_id}>
                {m.module_code} — {m.module_name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {!termId || !moduleId ? (
        <div className="card p-8 text-center text-ink-400">Pick a term and module to begin recording marks.</div>
      ) : listQ.isLoading || !roster ? (
        <div className="card p-8 text-center"><Loader2 className="w-6 h-6 animate-spin mx-auto text-brand" /></div>
      ) : roster.length === 0 ? (
        <div className="card p-8 text-center text-ink-400">
          No registered students for this module in the selected term. Make sure students have been registered for this
          module under <span className="font-mono">Modules → Registrations</span>.
        </div>
      ) : (
        <>
          {/* KPI strip */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Stat icon={<Users className="w-4 h-4" />} label="Roster" value={summary?.total_roster ?? 0} />
            <Stat icon={<GraduationCap className="w-4 h-4" />} label="Recorded" value={summary?.recorded ?? 0} />
            <Stat icon={<Users className="w-4 h-4" />} label="Unmarked" value={summary?.unmarked ?? 0} tone={(summary?.unmarked ?? 0) > 0 ? 'warn' : undefined} />
            <Stat icon={<Percent className="w-4 h-4" />} label="Class avg %" value={`${summary?.avg_pct ?? 0}%`} />
          </div>

          {/* Maxes editor */}
          <div className="card p-3 flex flex-wrap items-center gap-3 text-[13px]">
            <span className="text-ink-500 font-semibold">Out of:</span>
            <MaxField label="CAT"        value={maxes.cat}        onChange={(v) => setMaxes({ ...maxes, cat: v })} />
            <MaxField label="Assignment" value={maxes.assignment} onChange={(v) => setMaxes({ ...maxes, assignment: v })} />
            <MaxField label="Exam"       value={maxes.exam}       onChange={(v) => setMaxes({ ...maxes, exam: v })} />
            <span className="ml-auto text-ink-500">
              Total max: <span className="font-semibold text-ink-800 dark:text-white">{maxSum}</span>
            </span>
          </div>

          {/* Roster table */}
          <div className="card overflow-x-auto">
            <table className="w-full text-left text-[13px] min-w-[900px]">
              <thead>
                <tr className="bg-ink-50 dark:bg-ink-800/50 border-b border-ink-100 dark:border-ink-700">
                  <th className="px-3 py-2.5 font-bold text-ink-400 text-[10px] uppercase">#</th>
                  <th className="px-3 py-2.5 font-bold text-ink-400 text-[10px] uppercase">Reg #</th>
                  <th className="px-3 py-2.5 font-bold text-ink-400 text-[10px] uppercase">Student</th>
                  <th className="px-3 py-2.5 font-bold text-ink-400 text-[10px] uppercase text-center">CAT /{maxes.cat}</th>
                  <th className="px-3 py-2.5 font-bold text-ink-400 text-[10px] uppercase text-center">Assg /{maxes.assignment}</th>
                  <th className="px-3 py-2.5 font-bold text-ink-400 text-[10px] uppercase text-center">Exam /{maxes.exam}</th>
                  <th className="px-3 py-2.5 font-bold text-ink-400 text-[10px] uppercase text-center">Total</th>
                  <th className="px-3 py-2.5 font-bold text-ink-400 text-[10px] uppercase text-center">%</th>
                  <th className="px-3 py-2.5 font-bold text-ink-400 text-[10px] uppercase text-center">Grade</th>
                  <th className="px-3 py-2.5 font-bold text-ink-400 text-[10px] uppercase">Remarks</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink-100 dark:divide-ink-700">
                {roster.map((r: MarksRosterRow, i: number) => {
                  const d = drafts[r.regnumber] ?? { cat: '', assignment: '', exam: '', remarks: '' }
                  const c = computed[r.regnumber]
                  return (
                    <tr key={r.regnumber} className="hover:bg-ink-50/50 dark:hover:bg-ink-700/20">
                      <td className="px-3 py-2 text-ink-500">{i + 1}</td>
                      <td className="px-3 py-2 font-mono">{r.regnumber}</td>
                      <td className="px-3 py-2">{r.lname} {r.fname}</td>
                      <td className="px-2 py-1.5 text-center">
                        <NumCell value={d.cat} max={maxes.cat} onChange={(v) => setCell(r.regnumber, 'cat', v)} />
                      </td>
                      <td className="px-2 py-1.5 text-center">
                        <NumCell value={d.assignment} max={maxes.assignment} onChange={(v) => setCell(r.regnumber, 'assignment', v)} />
                      </td>
                      <td className="px-2 py-1.5 text-center">
                        <NumCell value={d.exam} max={maxes.exam} onChange={(v) => setCell(r.regnumber, 'exam', v)} />
                      </td>
                      <td className="px-3 py-2 text-center font-semibold">{c?.total ?? '—'}</td>
                      <td className="px-3 py-2 text-center font-semibold">
                        {c?.pct != null ? `${c.pct}%` : '—'}
                      </td>
                      <td className="px-3 py-2 text-center">
                        {c?.grade ? <GradePill grade={c.grade} /> : <span className="text-ink-400">—</span>}
                      </td>
                      <td className="px-2 py-1.5">
                        <input
                          type="text"
                          className="input input-sm w-full"
                          placeholder="—"
                          value={d.remarks}
                          onChange={(e) => setCell(r.regnumber, 'remarks', e.target.value)}
                        />
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          {/* Save bar */}
          <div className="flex items-center justify-end gap-2">
            <button
              className="btn-primary btn-sm"
              disabled={save.isPending}
              onClick={() => save.mutate()}
            >
              {save.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
              {save.isPending ? 'Saving…' : 'Save marks'}
            </button>
          </div>
        </>
      )}
    </div>
  )
}

/* ─── small UI bits ──────────────────────────────────────────────────── */

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

function MaxField({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <label className="inline-flex items-center gap-1">
      <span className="text-ink-600">{label}</span>
      <input
        type="number"
        min={1}
        step="1"
        className="input input-sm w-20"
        value={value}
        onChange={(e) => {
          const n = Number(e.target.value)
          onChange(Number.isFinite(n) && n > 0 ? n : 0)
        }}
      />
    </label>
  )
}

function NumCell({ value, max, onChange }: { value: string; max: number; onChange: (v: string) => void }) {
  const clamp = (raw: string): string => {
    if (raw === '') return ''
    const n = Number(raw)
    if (!Number.isFinite(n)) return ''
    if (n < 0)   return '0'
    if (n > max) return String(max)
    return raw
  }
  return (
    <input
      type="number"
      step="0.5"
      min={0}
      max={max}
      className="input input-sm w-20 text-center"
      placeholder="—"
      value={value}
      onChange={(e) => onChange(clamp(e.target.value))}
      onBlur={(e) => onChange(clamp(e.target.value))}
    />
  )
}

function GradePill({ grade }: { grade: string }) {
  const tone =
    grade === 'A' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300'
    : grade === 'B' ? 'bg-sky-100 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300'
    : grade === 'C' ? 'bg-blue-100 text-blue-700 dark:bg-blue-500/15 dark:text-blue-300'
    : grade === 'D' ? 'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300'
    : 'bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-300'
  return <span className={`inline-block px-2 py-0.5 rounded-full text-[11px] font-bold ${tone}`}>{grade}</span>
}
