import { useEffect, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import {
  Award, Loader2, Play, Send, Settings, Info, CheckCircle2, XCircle,
  Cpu, Users, ClipboardList, ChevronRight, BarChart2, UserCheck,
} from 'lucide-react'
import { meritService, intakeService, manualAdmissionService } from '@/services/admissionService'
import { useSystemStore, selectActiveYear } from '@/store/systemStore'
import { academicsMgmtService } from '@/services/academicsMgmtService'
import Modal from '@/components/ui/Modal'
import DepartmentDetails from '@/components/admission/DepartmentDetails'

const ALGORITHM_OPTIONS = [
  {
    value: 'merit_based',
    label: 'Merit-Based',
    icon: BarChart2,
    color: 'text-brand',
    bg: 'bg-brand/10',
    description: 'Rank applicants by weighted grade + subject combination scores.',
  },
  {
    value: 'first_come_first_served',
    label: 'First-Come First-Served',
    icon: ClipboardList,
    color: 'text-amber-600',
    bg: 'bg-amber-500/10',
    description: 'Admit in order of verified document submission date.',
  },
  {
    value: 'manual',
    label: 'Manual Selection',
    icon: UserCheck,
    color: 'text-emerald-600',
    bg: 'bg-emerald-500/10',
    description: 'Admin manually selects and admits individual applicants.',
  },
]

const EMPTY_FORM = {
  grade_weight: 60,
  combination_weight: 30,
  other_weight: 10,
  min_grade: '',
  cutoff_score: '',
  max_capacity: '',
  required_combinations: '',
  algorithm_type: 'merit_based',
  algorithm_notes: '',
}

export default function MeritPage() {
  const qc = useQueryClient()
  const activeYear = useSystemStore(selectActiveYear)
  const [departmentId, setDepartmentId] = useState<number | ''>('')
  const [intake, setIntake] = useState('')
  const [form, setForm] = useState(EMPTY_FORM)
  const [manualOpen, setManualOpen] = useState(false)
  const [manualAppId, setManualAppId] = useState('')
  const [manualReason, setManualReason] = useState('')
  const [manualExpiry, setManualExpiry] = useState('')
  const [deptDetailsOpen, setDeptDetailsOpen] = useState(false)
  const [deptDetailsTarget, setDeptDetailsTarget] = useState<any>(null)

  // Department list
  const departmentsQ = useQuery({
    queryKey: ['acmgmt', 'departments', 'all'],
    queryFn:  () => academicsMgmtService.list<any>('departments', { page: 1, per_page: 100 }),
  })
  const departments = departmentsQ.data?.data?.data ?? []

  // Intake list
  const intakesQ = useQuery({
    queryKey: ['admin', 'intakes'],
    queryFn:  () => intakeService.list(),
  })
  const intakes = intakesQ.data?.data ?? []

  const canQuery  = !!departmentId && !!intake && !!activeYear
  const keyParams = canQuery
    ? { department_id: Number(departmentId), intake, academic_year_id: activeYear!.id }
    : null

  const criteriaQ = useQuery({
    queryKey: ['admin', 'merit', 'criteria', keyParams],
    queryFn:  () => meritService.getCriteria(keyParams!),
    enabled:  canQuery,
  })
  const listQ = useQuery({
    queryKey: ['admin', 'merit', 'list', keyParams],
    queryFn:  () => meritService.getMeritList(keyParams!),
    enabled:  canQuery,
  })

  // Sync existing criteria into form
  useEffect(() => {
    const c = criteriaQ.data?.data
    if (c) {
      setForm({
        grade_weight:          c.grade_weight,
        combination_weight:    c.combination_weight,
        other_weight:          c.other_weight,
        min_grade:             c.min_grade             ?? '',
        cutoff_score:          c.cutoff_score != null  ? String(c.cutoff_score)  : '',
        max_capacity:          c.max_capacity != null  ? String(c.max_capacity)  : '',
        required_combinations: c.required_combinations ?? '',
        algorithm_type:        (c as any).algorithm_type   ?? 'merit_based',
        algorithm_notes:       (c as any).algorithm_notes  ?? '',
      })
    } else if (criteriaQ.isFetched && !c) {
      setForm(EMPTY_FORM)
    }
  }, [criteriaQ.data, criteriaQ.isFetched])

  useEffect(() => { setForm(EMPTY_FORM) }, [departmentId, intake])

  const weightTotal  = Number(form.grade_weight) + Number(form.combination_weight) + Number(form.other_weight)
  const weightsValid = Math.abs(weightTotal - 100) < 0.01
  const isMeritBased = form.algorithm_type === 'merit_based'

  // Selected department details (for allowed_combinations display)
  const selectedDept = departments.find((d: any) => d.dep_id === departmentId)
  const deptCombinations: string[] = (() => {
    try { return JSON.parse(selectedDept?.allowed_combinations ?? '[]') } catch { return [] }
  })()

  const save = useMutation({
    mutationFn: () => meritService.saveCriteria({
      department_id:          Number(departmentId),
      intake,
      academic_year_id:       activeYear!.id,
      grade_weight:           Number(form.grade_weight),
      combination_weight:     Number(form.combination_weight),
      other_weight:           Number(form.other_weight),
      min_grade:              form.min_grade              || undefined,
      required_combinations:  form.required_combinations  || undefined,
      cutoff_score:           form.cutoff_score           ? Number(form.cutoff_score)  : undefined,
      max_capacity:           form.max_capacity           ? Number(form.max_capacity)  : undefined,
      algorithm_type:         form.algorithm_type         as any,
      algorithm_notes:        form.algorithm_notes        || undefined,
    } as any),
    onSuccess: () => {
      toast.success('Algorithm settings saved')
      qc.invalidateQueries({ queryKey: ['admin', 'merit'] })
    },
    onError: (e: any) => toast.error(e?.response?.data?.message ?? 'Failed to save'),
  })

  const generate = useMutation({
    mutationFn: () => meritService.generate(keyParams!),
    onSuccess:  (r) => {
      const d = r.data as any
      toast.success(`Generated ${d?.total ?? 0} ranked · ${d?.qualified_count ?? 0} qualified`)
      qc.invalidateQueries({ queryKey: ['admin', 'merit', 'list'] })
    },
    onError: (e: any) => toast.error(e?.response?.data?.message ?? 'Generation failed'),
  })

  const publish = useMutation({
    mutationFn: () => meritService.publish(keyParams!),
    onSuccess:  () => { toast.success('Merit list published'); qc.invalidateQueries({ queryKey: ['admin', 'merit'] }) },
    onError:    (e: any) => toast.error(e?.response?.data?.message ?? 'Failed'),
  })

  const manualAdmit = useMutation({
    mutationFn: () => manualAdmissionService.admit({
      application_id: Number(manualAppId),
      reason:    manualReason,
      expires_at: manualExpiry || undefined,
    }),
    onSuccess: (r: any) => {
      toast.success(`Manually admitted · Offer: ${r.data?.offer_letter_reference}`)
      setManualOpen(false)
      setManualAppId('')
      setManualReason('')
      setManualExpiry('')
      qc.invalidateQueries({ queryKey: ['admin', 'merit'] })
      qc.invalidateQueries({ queryKey: ['admin', 'offers'] })
    },
    onError: (e: any) => toast.error(e?.response?.data?.message ?? 'Manual admission failed'),
  })

  const rows = listQ.data?.data?.data ?? []
  const algorithmInfo = ALGORITHM_OPTIONS.find(a => a.value === form.algorithm_type)

  return (
    <div className="space-y-6">

      {/* Header & Selectors */}
      <section className="card p-6 bg-brand/5 border-brand/20 relative overflow-hidden">
        <div className="absolute top-0 right-0 p-8 opacity-5">
          <Award className="w-32 h-32" />
        </div>

        <div className="flex items-center gap-4 mb-6 relative z-10">
          <div className="w-12 h-12 rounded-2xl bg-brand text-white flex items-center justify-center shadow-lg shadow-brand/20">
            <Award className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-[22px] font-black text-ink-900 dark:text-white leading-none">Admission Algorithm</h2>
            <p className="text-[14px] text-ink-500 mt-1">Configure per-department selection algorithm, run rankings, and publish results.</p>
          </div>
          <div className="flex-1" />
          <button
            className="btn-secondary btn-sm border-amber-300 text-amber-700 dark:text-amber-400 flex items-center gap-2"
            onClick={() => setManualOpen(true)}
          >
            <UserCheck className="w-4 h-4" /> Manual Admit
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 relative z-10">
          <div className="space-y-1.5">
            <label className="text-[11px] font-black uppercase tracking-widest text-ink-400 ml-1">Academic Year</label>
            <div className="input bg-white/50 dark:bg-ink-900/50 backdrop-blur-sm border-brand/10 font-bold py-2.5">
              {activeYear?.label ?? '— No Active Year —'}
            </div>
          </div>
          <div className="space-y-1.5">
            <label className="text-[11px] font-black uppercase tracking-widest text-ink-400 ml-1">Department</label>
            <select className="input bg-white dark:bg-ink-900 border-brand/10 py-2.5 font-medium" value={departmentId} onChange={(e) => setDepartmentId(e.target.value ? Number(e.target.value) : '')}>
              <option value="">— Select Department —</option>
              {departments.map((p: any) => (
                <option key={p.dep_id} value={p.dep_id}>{p.dep_acronym} · {p.dep_name}</option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <label className="text-[11px] font-black uppercase tracking-widest text-ink-400 ml-1">Intake Session</label>
            <select className="input bg-white dark:bg-ink-900 border-brand/10 py-2.5 font-medium" value={intake} onChange={(e) => setIntake(e.target.value)}>
              <option value="">— Select Intake —</option>
              {intakes.map((i: any) => (
                <option key={i.id} value={i.name}>{i.name}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Department combinations badge row */}
        {selectedDept && deptCombinations.length > 0 && (
          <div className="mt-4 flex flex-wrap items-center gap-2 relative z-10">
            <span className="text-[10px] font-black uppercase tracking-widest text-ink-400">Department Combinations:</span>
            {deptCombinations.map((c) => (
              <span key={c} className="px-2.5 py-0.5 rounded-full bg-brand/10 text-brand text-[11px] font-black tracking-wider">{c}</span>
            ))}
          </div>
        )}
      </section>

      {canQuery && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">

          {/* LEFT: SETTINGS PANEL (4/12) */}
          <div className="lg:col-span-4 space-y-6">

            {/* Algorithm Type Selector */}
            <section className="card p-6 border-brand/10">
              <h3 className="text-[13px] font-black uppercase tracking-widest text-ink-900 dark:text-white flex items-center gap-2 mb-4">
                <Cpu className="w-4 h-4 text-brand" /> Algorithm Type
              </h3>
              <div className="space-y-2">
                {ALGORITHM_OPTIONS.map(opt => {
                  const Icon = opt.icon
                  const active = form.algorithm_type === opt.value
                  return (
                    <button
                      key={opt.value}
                      onClick={() => setForm({ ...form, algorithm_type: opt.value })}
                      className={`w-full flex items-start gap-3 p-3.5 rounded-xl border-2 text-left transition-all ${
                        active
                          ? 'border-brand bg-brand/5 shadow-sm'
                          : 'border-ink-100 dark:border-ink-800 hover:border-brand/30'
                      }`}
                    >
                      <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 mt-0.5 ${opt.bg}`}>
                        <Icon className={`w-4 h-4 ${opt.color}`} />
                      </div>
                      <div>
                        <p className={`text-[13px] font-black ${active ? 'text-brand' : 'text-ink-800 dark:text-ink-200'}`}>{opt.label}</p>
                        <p className="text-[11px] text-ink-400 leading-tight mt-0.5">{opt.description}</p>
                      </div>
                      {active && <CheckCircle2 className="w-4 h-4 text-brand ml-auto mt-1 shrink-0" />}
                    </button>
                  )
                })}
              </div>

              {/* Notes */}
              <div className="mt-4 space-y-1.5">
                <label className="text-[11px] font-black uppercase tracking-widest text-ink-400">Algorithm Notes</label>
                <textarea
                  className="input text-[13px] h-16 resize-none"
                  placeholder="Optional: explain the rationale for this configuration..."
                  value={form.algorithm_notes}
                  onChange={(e) => setForm({ ...form, algorithm_notes: e.target.value })}
                />
              </div>
            </section>

            {/* Scoring Weights (only for merit_based) */}
            {isMeritBased && (
              <section className="card p-6 border-brand/10">
                <div className="flex items-center justify-between mb-6">
                  <h3 className="text-[13px] font-black uppercase tracking-widest text-ink-900 dark:text-white flex items-center gap-2">
                    <Settings className="w-4 h-4 text-brand" /> Scoring Weights
                  </h3>
                  {criteriaQ.data?.data && <span className="chip-success py-0.5 text-[10px] font-black tracking-widest">ACTIVE</span>}
                </div>

                <div className="space-y-5">
                  <div className="p-4 bg-ink-50 dark:bg-ink-800/40 rounded-2xl border border-ink-100 dark:border-ink-800">
                    <div className="space-y-4">
                      <WeightInput label="Academic Grades" value={form.grade_weight} color="bg-brand"
                        onChange={(v) => setForm({ ...form, grade_weight: v })} />
                      <WeightInput label="Combination Match" value={form.combination_weight} color="bg-amber-500"
                        onChange={(v) => setForm({ ...form, combination_weight: v })} />
                      <WeightInput label="Other Factors" value={form.other_weight} color="bg-emerald-500"
                        onChange={(v) => setForm({ ...form, other_weight: v })} />
                    </div>

                    <div className={`mt-5 pt-4 border-t border-ink-100 dark:border-ink-800 flex items-center justify-between font-black text-[14px] ${weightsValid ? 'text-emerald-600' : 'text-red-500'}`}>
                      <span>TOTAL WEIGHT</span>
                      <span className="flex items-center gap-1.5">
                        {weightTotal}% {weightsValid ? <CheckCircle2 className="w-4 h-4" /> : <XCircle className="w-4 h-4" />}
                      </span>
                    </div>
                    {!weightsValid && <p className="text-[11px] text-red-400 mt-1 text-right">Must equal 100% to save</p>}
                  </div>

                  {/* Thresholds */}
                  <div className="space-y-4 pt-2">
                    <Field label="Minimum Entry Grade" hint="Applicants below this are excluded">
                      <input className="input font-bold" placeholder="e.g. 60%" value={form.min_grade}
                        onChange={(e) => setForm({ ...form, min_grade: e.target.value })} />
                    </Field>
                    <div className="grid grid-cols-2 gap-4">
                      <Field label="Cutoff Score" hint="Min merit score">
                        <input type="number" step={0.1} className="input font-bold" value={form.cutoff_score}
                          onChange={(e) => setForm({ ...form, cutoff_score: e.target.value })} />
                      </Field>
                      <Field label="Max Capacity" hint="Available slots">
                        <input type="number" className="input font-bold" value={form.max_capacity}
                          onChange={(e) => setForm({ ...form, max_capacity: e.target.value })} />
                      </Field>
                    </div>
                    <Field label="Allowed Combinations" hint="JSON array, e.g. [&quot;PCM&quot;,&quot;MCB&quot;]">
                      <div className="relative">
                        <input className="input font-mono text-[13px] pr-24" placeholder='["ALL"]'
                          value={form.required_combinations}
                          onChange={(e) => setForm({ ...form, required_combinations: e.target.value })} />
                        {/* Quick-fill from dept combinations */}
                        {deptCombinations.length > 0 && (
                          <button
                            type="button"
                            className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] font-black text-brand bg-brand/10 px-2 py-0.5 rounded hover:bg-brand/20 transition-colors"
                            onClick={() => setForm({ ...form, required_combinations: JSON.stringify(deptCombinations) })}
                          >
                            USE DEPT
                          </button>
                        )}
                      </div>
                      {form.required_combinations && !isValidJson(form.required_combinations) && (
                        <p className="text-[11px] text-red-500 mt-1 font-medium">Invalid JSON Format</p>
                      )}
                    </Field>
                  </div>
                </div>
              </section>
            )}

            {/* Action Buttons */}
            <div className="flex flex-col gap-2">
              <button
                className="btn-primary w-full py-3 rounded-xl shadow-lg shadow-brand/20"
                disabled={save.isPending || (isMeritBased && !weightsValid)}
                onClick={() => save.mutate()}
              >
                {save.isPending ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : 'Save Algorithm Settings'}
              </button>
              {isMeritBased && (
                <button
                  className="btn-secondary w-full py-3 rounded-xl border-brand/20 text-brand"
                  disabled={generate.isPending || !criteriaQ.data?.data}
                  onClick={() => generate.mutate()}
                >
                  {generate.isPending ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : <><Play className="w-3.5 h-3.5 mr-2" /> Generate Ranking</>}
                </button>
              )}
              <button
                className="btn-gold w-full py-3 rounded-xl shadow-lg shadow-amber-500/20"
                disabled={publish.isPending || rows.length === 0}
                onClick={() => publish.mutate()}
              >
                {publish.isPending ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : <><Send className="w-3.5 h-3.5 mr-2" /> Publish Results</>}
              </button>
            </div>
          </div>

          {/* RIGHT: RANKING TABLE (8/12) */}
          <div className="lg:col-span-8 space-y-6">

            {/* Algorithm info banner */}
            {algorithmInfo && (
              <div className={`flex items-center gap-4 p-4 rounded-2xl border ${algorithmInfo.bg} border-ink-100 dark:border-ink-800`}>
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${algorithmInfo.bg}`}>
                  <algorithmInfo.icon className={`w-5 h-5 ${algorithmInfo.color}`} />
                </div>
                <div>
                  <p className={`text-[13px] font-black ${algorithmInfo.color}`}>{algorithmInfo.label}</p>
                  <p className="text-[12px] text-ink-500">{algorithmInfo.description}</p>
                </div>
                {form.algorithm_notes && (
                  <p className="ml-auto text-[12px] text-ink-400 max-w-xs text-right italic">{form.algorithm_notes}</p>
                )}
              </div>
            )}

            <section className="card p-0 overflow-hidden border-brand/10 shadow-sm">
              <div className="p-6 border-b border-ink-100 dark:border-ink-800 bg-brand/[0.02] flex items-center justify-between">
                <div>
                  <h3 className="text-[18px] font-black text-ink-900 dark:text-white leading-none">Ranked Applicants</h3>
                  <p className="text-[13px] text-ink-500 mt-1.5">
                    {listQ.isLoading ? 'Loading rankings...' : rows.length === 0
                      ? 'No ranking generated yet.'
                      : `${rows.length} Total · ${rows.filter((r: any) => r.is_qualified).length} Qualified`}
                  </p>
                </div>
                {rows.length > 0 && (
                  <div className="text-right">
                    <p className="text-[10px] uppercase tracking-widest font-black text-ink-400">Status</p>
                    <p className="text-[14px] font-black text-emerald-600">READY TO PUBLISH</p>
                  </div>
                )}
              </div>

              {rows.length === 0 ? (
                <div className="p-16 text-center">
                  <div className="w-16 h-16 bg-ink-50 dark:bg-ink-800 rounded-full flex items-center justify-center mx-auto mb-4 text-ink-300">
                    <Info className="w-8 h-8" />
                  </div>
                  <p className="text-[15px] font-medium text-ink-500">
                    {isMeritBased
                      ? 'Configure criteria and click "Generate Ranking" to see the list.'
                      : form.algorithm_type === 'manual'
                        ? 'Use the "Manual Admit" button to individually admit applicants.'
                        : 'Save settings and generate ranking to see results.'}
                  </p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-ink-50 dark:bg-ink-800/50 text-[11px] font-black uppercase tracking-widest text-ink-400">
                        <th className="px-6 py-4">Rank</th>
                        <th className="px-6 py-4">Applicant</th>
                        <th className="px-6 py-4">Credentials</th>
                        <th className="px-6 py-4 text-right">Merit Score</th>
                        <th className="px-6 py-4 text-center">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-ink-100 dark:divide-ink-800">
                      {rows.map((r: any) => (
                        <tr key={r.id} className={`group transition-colors hover:bg-brand/[0.02] ${!r.is_qualified ? 'opacity-60 bg-ink-50/30' : ''}`}>
                          <td className="px-6 py-5">
                            <div className={`w-9 h-9 rounded-lg flex items-center justify-center font-mono font-black text-[15px] shadow-sm ${r.rank <= 3 ? 'bg-amber-100 text-amber-700' : 'bg-ink-100 text-ink-500'}`}>
                              #{r.rank}
                            </div>
                          </td>
                          <td className="px-6 py-5">
                            <p className="font-black text-ink-900 dark:text-white leading-none">{r.first_name} {r.last_name}</p>
                            <p className="text-[12px] text-ink-500 mt-1 font-mono">{r.application_number}</p>
                          </td>
                          <td className="px-6 py-5">
                            <div className="flex items-center gap-2 text-[12px]">
                              <span className="font-bold text-ink-700 dark:text-ink-300">{r.prev_grade}</span>
                              <span className="text-ink-300">·</span>
                              <span className={`uppercase font-medium px-2 py-0.5 rounded text-[10px] ${
                                deptCombinations.includes(r.combination?.toUpperCase?.() ?? '')
                                  ? 'bg-emerald-100 text-emerald-700'
                                  : 'bg-ink-100 text-ink-500'
                              }`}>{r.combination || 'Gen'}</span>
                            </div>
                          </td>
                          <td className="px-6 py-5 text-right">
                            <div className="inline-block text-right">
                              <p className="text-[16px] font-black text-ink-900 dark:text-white leading-none">{Number(r.merit_score).toFixed(2)}</p>
                              <div className="w-24 h-1.5 bg-ink-100 dark:bg-ink-800 rounded-full mt-2 overflow-hidden">
                                <div className="h-full bg-brand" style={{ width: `${r.merit_score}%` }} />
                              </div>
                            </div>
                          </td>
                          <td className="px-6 py-5 text-center">
                            {r.is_qualified ? (
                              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-100 text-emerald-700 text-[11px] font-black uppercase tracking-widest">
                                <CheckCircle2 className="w-3 h-3" /> Qualified
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-ink-200 text-ink-600 text-[11px] font-black uppercase tracking-widest">
                                Not Selected
                              </span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          </div>
        </div>
      )}

      {/* Department Overview (when no dept selected) */}
      {!canQuery && departments.length > 0 && (
        <section className="card p-0 overflow-hidden">
          <div className="p-5 border-b border-ink-100 dark:border-ink-800">
            <h3 className="text-[16px] font-black text-ink-900 dark:text-white flex items-center gap-2">
              <Users className="w-5 h-5 text-brand" /> All Departments Overview
            </h3>
            <p className="text-[13px] text-ink-500 mt-1">Select a department and intake above to configure its algorithm settings.</p>
          </div>
          <div className="divide-y divide-ink-100 dark:divide-ink-800">
            {departments.map((d: any) => {
              const combos: string[] = (() => {
                try { return JSON.parse(d.allowed_combinations ?? '[]') } catch { return [] }
              })()
              return (
                <div key={d.dep_id} className="flex items-center gap-4 px-5 py-4 hover:bg-ink-50 dark:hover:bg-ink-800/30 transition-colors">
                  <div className="w-10 h-10 rounded-xl bg-brand/10 flex items-center justify-center shrink-0">
                    <Award className="w-5 h-5 text-brand" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[14px] font-black text-ink-900 dark:text-white truncate">{d.dep_name}</p>
                    <p className="text-[11px] text-ink-400">{d.dep_acronym} · {d.program_level ?? 'undergraduate'}</p>
                  </div>
                  <div className="flex flex-wrap gap-1.5 max-w-xs">
                    {combos.length > 0
                      ? combos.map(c => (
                          <span key={c} className="px-2 py-0.5 rounded-full bg-brand/10 text-brand text-[10px] font-black">{c}</span>
                        ))
                      : <span className="text-[11px] text-ink-400">No combinations set</span>
                    }
                  </div>
                  <button
                    className="btn-secondary btn-sm shrink-0 ml-4"
                    onClick={() => { setDeptDetailsTarget(d); setDeptDetailsOpen(true) }}
                  >
                    Configure <ChevronRight className="w-3 h-3 ml-1" />
                  </button>
                </div>
              )
            })}
          </div>
        </section>
      )}

      {/* Department Details slide-over */}
      <DepartmentDetails
        dept={deptDetailsTarget}
        open={deptDetailsOpen}
        onClose={() => setDeptDetailsOpen(false)}
        onUpdated={() => qc.invalidateQueries({ queryKey: ['acmgmt', 'departments'] })}
      />

      {/* Manual Admit Modal */}
      <Modal
        open={manualOpen}
        onClose={() => setManualOpen(false)}
        title="Manual Admission"
        footer={
          <>
            <button className="btn-secondary" onClick={() => setManualOpen(false)}>Cancel</button>
            <button
              className="btn-primary"
              disabled={manualAdmit.isPending || !manualAppId}
              onClick={() => manualAdmit.mutate()}
            >
              {manualAdmit.isPending && <Loader2 className="w-3.5 h-3.5 animate-spin mr-2" />}
              Admit Applicant
            </button>
          </>
        }
      >
        <div className="space-y-4">
          <div className="p-4 bg-amber-50 dark:bg-amber-900/10 border border-amber-100 dark:border-amber-900/50 rounded-xl text-[13px] text-amber-800 dark:text-amber-300">
            Manual admission bypasses the ranking algorithm and directly issues an admission offer to the applicant.
          </div>
          <div>
            <label className="label">Application ID <span className="text-red-500">*</span></label>
            <input className="input font-mono" placeholder="e.g. 42" value={manualAppId}
              onChange={(e) => setManualAppId(e.target.value)} />
            <p className="text-[11px] text-ink-400 mt-1">Find the ID in the Applications list.</p>
          </div>
          <div>
            <label className="label">Reason for Manual Admission</label>
            <textarea className="input h-20" placeholder="e.g. Special talent award, scholarship holder..."
              value={manualReason} onChange={(e) => setManualReason(e.target.value)} />
          </div>
          <div>
            <label className="label">Offer Expiry Date</label>
            <input type="date" className="input" value={manualExpiry}
              onChange={(e) => setManualExpiry(e.target.value)} />
          </div>
        </div>
      </Modal>
    </div>
  )
}

function WeightInput({ label, value, color, onChange }: { label: string; value: number; color: string; onChange: (v: number) => void }) {
  return (
    <div className="space-y-1.5">
      <div className="flex justify-between text-[12px] font-bold">
        <span className="text-ink-600">{label}</span>
        <span className="text-ink-900 dark:text-white">{value}%</span>
      </div>
      <input type="range" min="0" max="100" step="5" className="w-full accent-brand h-1.5"
        value={value} onChange={(e) => onChange(Number(e.target.value))} />
      <div className="w-full h-1 bg-ink-100 dark:bg-ink-800 rounded-full overflow-hidden">
        <div className={`h-full ${color} transition-all duration-300`} style={{ width: `${value}%` }} />
      </div>
    </div>
  )
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label className="text-[11px] font-black uppercase tracking-widest text-ink-400 ml-1">{label}</label>
      {children}
      {hint && <p className="text-[10px] text-ink-400 font-medium ml-1 leading-tight" dangerouslySetInnerHTML={{ __html: hint }} />}
    </div>
  )
}

function isValidJson(s: string): boolean {
  try { JSON.parse(s); return true } catch { return false }
}
