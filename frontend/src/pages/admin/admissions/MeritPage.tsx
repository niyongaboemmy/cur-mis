import { useEffect, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { Award, Loader2, Play, Send, Settings, Info } from 'lucide-react'
import { meritService, intakeService } from '@/services/admissionService'
import { useSystemStore, selectActiveYear } from '@/store/systemStore'
import { academicsMgmtService } from '@/services/academicsMgmtService'

const EMPTY_FORM = {
  grade_weight: 60,
  combination_weight: 30,
  other_weight: 10,
  min_grade: '',
  cutoff_score: '',
  max_capacity: '',
  required_combinations: '',
}

export default function MeritPage() {
  const qc = useQueryClient()
  const activeYear = useSystemStore(selectActiveYear)
  const [departmentId, setDepartmentId] = useState<number | ''>('')
  const [intake, setIntake] = useState('')
  const [form, setForm] = useState(EMPTY_FORM)

  // Department picker
  const departmentsQ = useQuery({
    queryKey: ['acmgmt', 'departments', 'all'],
    queryFn:  () => academicsMgmtService.list<any>('departments', { page: 1, per_page: 100 }),
  })
  const departments = departmentsQ.data?.data?.data ?? []

  // Intake picker — fetched from DB, not hardcoded
  const intakesQ = useQuery({
    queryKey: ['admin', 'intakes'],
    queryFn:  () => intakeService.list(),
  })
  const intakes = intakesQ.data?.data ?? []

  const canQuery = !!departmentId && !!intake && !!activeYear
  const keyParams = canQuery ? { department_id: Number(departmentId), intake, academic_year_id: activeYear!.id } : null

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

  // Sync existing criteria into the form whenever the query result changes
  useEffect(() => {
    const c = criteriaQ.data?.data
    if (c) {
      setForm({
        grade_weight:          c.grade_weight,
        combination_weight:    c.combination_weight,
        other_weight:          c.other_weight,
        min_grade:             c.min_grade            ?? '',
        cutoff_score:          c.cutoff_score != null ? String(c.cutoff_score)  : '',
        max_capacity:          c.max_capacity != null ? String(c.max_capacity)  : '',
        required_combinations: c.required_combinations ?? '',
      })
    } else if (criteriaQ.isFetched && !c) {
      // No criteria saved yet — reset to defaults
      setForm(EMPTY_FORM)
    }
  }, [criteriaQ.data, criteriaQ.isFetched])

  // Reset form when department/intake changes
  useEffect(() => { setForm(EMPTY_FORM) }, [departmentId, intake])

  const weightTotal = Number(form.grade_weight) + Number(form.combination_weight) + Number(form.other_weight)
  const weightsValid = Math.abs(weightTotal - 100) < 0.01

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
    }),
    onSuccess: () => { toast.success('Criteria saved'); qc.invalidateQueries({ queryKey: ['admin', 'merit'] }) },
    onError:   (e: any) => toast.error(e?.response?.data?.message ?? 'Failed to save'),
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
    onSuccess:  () => toast.success('Merit list published'),
    onError:    (e: any) => toast.error(e?.response?.data?.message ?? 'Failed'),
  })

  const rows = listQ.data?.data?.data ?? []

  return (
    <div className="space-y-4">
      {/* Selector */}
      <section className="card p-5">
        <div className="flex items-center gap-3 mb-4">
          <Award className="w-5 h-5 text-brand" />
          <div>
            <h2 className="section-title">Merit lists</h2>
            <p className="section-sub">Configure scoring per department, generate ranked lists, publish.</p>
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <label className="label">Department</label>
            <select className="input" value={departmentId} onChange={(e) => setDepartmentId(e.target.value ? Number(e.target.value) : '')}>
              <option value="">— pick department —</option>
              {departments.map((p: any) => (
                <option key={p.dep_id} value={p.dep_id}>{p.dep_acronym} · {p.dep_name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">Intake</label>
            <select className="input" value={intake} onChange={(e) => setIntake(e.target.value)}>
              <option value="">— pick intake —</option>
              {intakes.map((i: any) => (
                <option key={i.id} value={i.name}>{i.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">Academic year</label>
            <input className="input" readOnly value={activeYear?.label ?? '— none active —'} />
          </div>
        </div>
      </section>

      {canQuery && (
        <>
          {/* Criteria */}
          <section className="card p-5">
            <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
              <h3 className="section-title flex items-center gap-2">
                <Settings className="w-4 h-4 text-brand" /> Admission criteria
              </h3>
              {criteriaQ.data?.data && (
                <span className="chip-success text-[11px]">Saved criteria loaded</span>
              )}
            </div>

            {/* Weight controls */}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              <Field label="Grade weight %">
                <input type="number" min={0} max={100} className="input" value={form.grade_weight}
                  onChange={(e) => setForm({ ...form, grade_weight: Number(e.target.value) })} />
              </Field>
              <Field label="Combination weight %">
                <input type="number" min={0} max={100} className="input" value={form.combination_weight}
                  onChange={(e) => setForm({ ...form, combination_weight: Number(e.target.value) })} />
              </Field>
              <Field label="Other weight %">
                <input type="number" min={0} max={100} className="input" value={form.other_weight}
                  onChange={(e) => setForm({ ...form, other_weight: Number(e.target.value) })} />
              </Field>
            </div>

            {/* Weight total indicator */}
            <div className={`mt-2 text-[12px] font-medium flex items-center gap-1.5 ${weightsValid ? 'text-emerald-600' : 'text-red-500'}`}>
              <Info className="w-3.5 h-3.5" />
              Total: {weightTotal}% {weightsValid ? '✓ valid' : '— must equal 100%'}
            </div>

            {/* Threshold controls */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-4">
              <Field label="Minimum grade" hint="Applicants below this grade are excluded before ranking">
                <input className="input" placeholder="e.g. 60% or DIV2 or C" value={form.min_grade}
                  onChange={(e) => setForm({ ...form, min_grade: e.target.value })} />
              </Field>
              <Field label="Cutoff score" hint="Minimum computed merit score to qualify">
                <input type="number" min={0} max={100} step={0.1} className="input" value={form.cutoff_score}
                  onChange={(e) => setForm({ ...form, cutoff_score: e.target.value })} />
              </Field>
              <Field label="Max capacity" hint="Maximum number of qualified slots">
                <input type="number" min={1} className="input" value={form.max_capacity}
                  onChange={(e) => setForm({ ...form, max_capacity: e.target.value })} />
              </Field>
            </div>

            {/* Required combinations */}
            <div className="mt-4">
              <Field label="Required A-level combinations (JSON array)" hint='e.g. ["PCM","MCB","HEG"] — leave blank to accept all'>
                <input className="input font-mono text-[13px]" placeholder='["PCM","MCB","HEG"]'
                  value={form.required_combinations}
                  onChange={(e) => setForm({ ...form, required_combinations: e.target.value })} />
              </Field>
              {form.required_combinations && !isValidJson(form.required_combinations) && (
                <p className="text-[12px] text-red-500 mt-1">Invalid JSON — use format: ["PCM","MCB"]</p>
              )}
            </div>

            <div className="flex flex-wrap gap-2 mt-5 pt-4 border-t border-ink-100 dark:border-ink-700">
              <button
                className="btn-secondary btn-sm"
                disabled={save.isPending || !weightsValid}
                onClick={() => save.mutate()}
              >
                {save.isPending && <Loader2 className="w-3 h-3 animate-spin" />}
                Save criteria
              </button>
              <button
                className="btn-primary btn-sm"
                disabled={generate.isPending || !criteriaQ.data?.data}
                title={!criteriaQ.data?.data ? 'Save criteria first' : ''}
                onClick={() => generate.mutate()}
              >
                {generate.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Play className="w-3 h-3" />}
                Generate list
              </button>
              <button
                className="btn-gold btn-sm"
                disabled={publish.isPending || rows.length === 0}
                onClick={() => publish.mutate()}
              >
                {publish.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Send className="w-3 h-3" />}
                Publish
              </button>
            </div>
          </section>

          {/* Merit list table */}
          <section className="card p-0 overflow-hidden">
            <div className="px-4 py-3 border-b border-ink-100 dark:border-ink-700 flex items-center justify-between">
              <div>
                <h3 className="section-title">Ranked applicants</h3>
                <p className="section-sub">
                  {listQ.isLoading ? 'Loading…' : rows.length === 0
                    ? 'No merit list yet — save criteria and click Generate list.'
                    : `${rows.length} ranked · ${rows.filter((r: any) => r.is_qualified).length} qualified`}
                </p>
              </div>
            </div>
            {rows.length > 0 && (
              <div className="overflow-x-auto">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Rank</th>
                      <th>Applicant</th>
                      <th>App #</th>
                      <th>Grade</th>
                      <th>Combination</th>
                      <th>Score</th>
                      <th>Qualified</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r: any) => (
                      <tr key={r.id} className={!r.is_qualified ? 'opacity-50' : ''}>
                        <td className="font-mono font-bold">#{r.rank}</td>
                        <td>
                          <p className="font-medium text-ink-900 dark:text-ink-100">{r.first_name} {r.last_name}</p>
                          <p className="text-[11px] text-ink-500">{r.email}</p>
                        </td>
                        <td className="font-mono text-[12px]">{r.application_number}</td>
                        <td>{r.prev_grade}</td>
                        <td>{r.combination || '—'}</td>
                        <td className="font-semibold">{Number(r.merit_score).toFixed(2)}</td>
                        <td>
                          {r.is_qualified
                            ? <span className="chip-success">Qualified</span>
                            : <span className="chip-soft">Not qualified</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      )}
    </div>
  )
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="label">{label}</label>
      {children}
      {hint && <p className="text-[11px] text-ink-400 mt-1">{hint}</p>}
    </div>
  )
}

function isValidJson(s: string): boolean {
  try { JSON.parse(s); return true } catch { return false }
}
