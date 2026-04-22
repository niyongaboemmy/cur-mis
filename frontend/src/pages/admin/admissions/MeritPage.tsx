import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { Award, Loader2, Play, Send, Settings } from 'lucide-react'
import { meritService } from '@/services/admissionService'
import { useSystemStore, selectActiveYear } from '@/store/systemStore'
import { academicsMgmtService } from '@/services/academicsMgmtService'

export default function MeritPage() {
  const qc = useQueryClient()
  const activeYear = useSystemStore(selectActiveYear)
  const [programId, setProgramId] = useState<number | ''>('')
  const [intake, setIntake] = useState('2026-A')

  // program picker — list degrees
  const programsQ = useQuery({
    queryKey: ['acmgmt', 'degrees', 'all'],
    queryFn:  () => academicsMgmtService.list<any>('degrees', { page: 1, per_page: 100 }),
  })
  const programs = programsQ.data?.data?.data ?? []

  const canQuery = !!programId && !!intake && !!activeYear
  const keyParams = canQuery ? { program_id: Number(programId), intake, academic_year_id: activeYear!.id } : null

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

  const [form, setForm] = useState({
    grade_weight: 60, combination_weight: 30, other_weight: 10,
    min_grade: '', cutoff_score: '', max_capacity: '',
  })

  const save = useMutation({
    mutationFn: () => meritService.saveCriteria({
      program_id:       Number(programId),
      intake,
      academic_year_id: activeYear!.id,
      grade_weight:       Number(form.grade_weight),
      combination_weight: Number(form.combination_weight),
      other_weight:       Number(form.other_weight),
      min_grade:          form.min_grade || undefined,
      cutoff_score:       form.cutoff_score ? Number(form.cutoff_score) : undefined,
      max_capacity:       form.max_capacity ? Number(form.max_capacity) : undefined,
    }),
    onSuccess: () => { toast.success('Criteria saved'); qc.invalidateQueries({ queryKey: ['admin', 'merit'] }) },
    onError:   (e: any) => toast.error(e?.response?.data?.message ?? 'Failed'),
  })

  const generate = useMutation({
    mutationFn: () => meritService.generate(keyParams!),
    onSuccess:  (r) => {
      toast.success(`Generated ${r.data?.generated ?? 0} ranked rows`)
      qc.invalidateQueries({ queryKey: ['admin', 'merit', 'list'] })
    },
    onError:    (e: any) => toast.error(e?.response?.data?.message ?? 'Failed'),
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
            <p className="section-sub">Configure scoring, generate ranked lists, publish.</p>
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <label className="label">Program</label>
            <select className="input" value={programId} onChange={(e) => setProgramId(e.target.value ? Number(e.target.value) : '')}>
              <option value="">— pick program —</option>
              {programs.map((p) => <option key={p.id} value={p.id}>{p.code} · {p.name}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Intake</label>
            <select className="input" value={intake} onChange={(e) => setIntake(e.target.value)}>
              <option>2026-A</option>
              <option>2026-B</option>
            </select>
          </div>
          <div>
            <label className="label">Academic year</label>
            <input className="input" readOnly value={activeYear?.label ?? '— none —'} />
          </div>
        </div>
      </section>

      {canQuery && (
        <>
          {/* Criteria */}
          <section className="card p-5">
            <h3 className="section-title mb-3 flex items-center gap-2"><Settings className="w-4 h-4 text-brand" /> Criteria</h3>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              <Field label="Grade weight %">
                <input type="number" className="input" value={form.grade_weight} onChange={(e) => setForm({ ...form, grade_weight: Number(e.target.value) })} />
              </Field>
              <Field label="Combination weight %">
                <input type="number" className="input" value={form.combination_weight} onChange={(e) => setForm({ ...form, combination_weight: Number(e.target.value) })} />
              </Field>
              <Field label="Other weight %">
                <input type="number" className="input" value={form.other_weight} onChange={(e) => setForm({ ...form, other_weight: Number(e.target.value) })} />
              </Field>
              <Field label="Minimum grade">
                <input className="input" placeholder="e.g. 60% or C" value={form.min_grade} onChange={(e) => setForm({ ...form, min_grade: e.target.value })} />
              </Field>
              <Field label="Cutoff score">
                <input type="number" className="input" value={form.cutoff_score} onChange={(e) => setForm({ ...form, cutoff_score: e.target.value as any })} />
              </Field>
              <Field label="Max capacity">
                <input type="number" className="input" value={form.max_capacity} onChange={(e) => setForm({ ...form, max_capacity: e.target.value as any })} />
              </Field>
            </div>
            <div className="flex gap-2 mt-4">
              <button className="btn-secondary btn-sm" disabled={save.isPending} onClick={() => save.mutate()}>
                {save.isPending && <Loader2 className="w-3 h-3 animate-spin" />} Save criteria
              </button>
              <button className="btn-primary btn-sm" disabled={generate.isPending} onClick={() => generate.mutate()}>
                {generate.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Play className="w-3 h-3" />}
                Generate list
              </button>
              <button className="btn-gold btn-sm" disabled={publish.isPending || rows.length === 0} onClick={() => publish.mutate()}>
                {publish.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Send className="w-3 h-3" />}
                Publish
              </button>
            </div>
            {criteriaQ.data?.data && (
              <p className="text-[11.5px] text-ink-500 mt-2">
                Existing criteria loaded. Saving again overwrites.
              </p>
            )}
          </section>

          {/* List */}
          <section className="card p-0 overflow-hidden">
            <div className="px-4 py-3 border-b border-ink-100">
              <h3 className="section-title">Ranked applicants</h3>
              <p className="section-sub">
                {listQ.isLoading ? 'Loading…' : `${rows.length} ranked`}
              </p>
            </div>
            {rows.length === 0 ? (
              <p className="p-8 text-center text-ink-500 text-[13px]">
                No merit list yet. Save criteria and click <b>Generate list</b>.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="data-table">
                  <thead><tr><th>Rank</th><th>Applicant</th><th>App #</th><th>Score</th><th>Qualified</th></tr></thead>
                  <tbody>
                    {rows.map((r) => (
                      <tr key={r.id}>
                        <td>#{r.rank}</td>
                        <td>{r.applicant_name}</td>
                        <td className="font-mono text-[12px]">{r.application_number}</td>
                        <td>{Number(r.merit_score).toFixed(2)}</td>
                        <td>{r.is_qualified ? <span className="chip-success">Yes</span> : <span className="chip-soft">No</span>}</td>
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

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="label">{label}</label>
      {children}
    </div>
  )
}
