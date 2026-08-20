import { useState, useEffect } from 'react'
import ModalPortal from '@/components/ui/ModalPortal'
import { motion, AnimatePresence } from 'framer-motion'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import {
  X, Building2, Edit3, Cpu, BarChart2, ClipboardList, UserCheck,
  CheckCircle2, XCircle, Play, Send, Loader2, Plus, Save,
  GraduationCap, Hash, Layers, Info, ChevronDown,
} from 'lucide-react'
import { meritService, intakeService } from '@/services/admissionService'
import { academicsMgmtService } from '@/services/academicsMgmtService'
import { useSystemStore, selectActiveYear } from '@/store/systemStore'

/* ── shared constants ──────────────────────────────────────────────────────── */
const ALGORITHM_OPTIONS = [
  {
    value: 'merit_based',
    label: 'Merit-Based',
    icon: BarChart2,
    color: 'text-brand',
    bg: 'bg-brand/10',
    desc: 'Rank applicants by weighted grade + subject combination scores.',
  },
  {
    value: 'first_come_first_served',
    label: 'First-Come First-Served',
    icon: ClipboardList,
    color: 'text-amber-600',
    bg: 'bg-amber-500/10',
    desc: 'Admit in order of verified document submission date.',
  },
  {
    value: 'manual',
    label: 'Manual Selection',
    icon: UserCheck,
    color: 'text-emerald-600',
    bg: 'bg-emerald-500/10',
    desc: 'Admin manually selects and admits individual applicants.',
  },
]

const PROGRAM_LEVELS = [
  { value: 'undergraduate', label: 'Undergraduate' },
  { value: 'postgraduate',  label: 'Postgraduate'  },
  { value: 'diploma',       label: 'Diploma'        },
  { value: 'certificate',   label: 'Certificate'    },
]

const EMPTY_ALGO = {
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

const TABS = [
  { id: 'details',   label: 'Details',            icon: Building2 },
  { id: 'edit',      label: 'Edit',               icon: Edit3     },
  { id: 'algorithm', label: 'Admission Algorithm', icon: Cpu      },
] as const

type TabId = (typeof TABS)[number]['id']

/* ── props ─────────────────────────────────────────────────────────────────── */
interface Props {
  dept: any
  open: boolean
  onClose: () => void
  onUpdated?: () => void
}

/* ═══════════════════════════════════════════════════════════════════════════ */
export default function DepartmentDetails({ dept, open, onClose, onUpdated }: Props) {
  const qc         = useQueryClient()
  const activeYear = useSystemStore(selectActiveYear)
  const [tab, setTab] = useState<TabId>('details')

  const deptCombos: string[] = (() => {
    try { return JSON.parse(dept?.allowed_combinations ?? '[]') } catch { return [] }
  })()

  useEffect(() => { if (!open) setTab('details') }, [open])

  /* ── Edit tab ─────────────────────────────────────────────────────────── */
  const [editForm, setEditForm] = useState({
    dep_name:             '',
    dep_acronym:          '',
    program_level:        'undergraduate',
    allowed_combinations: [] as string[],
  })
  const [newCombo, setNewCombo] = useState('')

  useEffect(() => {
    if (!dept) return
    setEditForm({
      dep_name:             dept.dep_name    ?? '',
      dep_acronym:          dept.dep_acronym ?? '',
      program_level:        dept.program_level ?? 'undergraduate',
      allowed_combinations: deptCombos,
    })
   
  }, [dept?.dep_id])

  const addCombo = () => {
    const val = newCombo.trim().toUpperCase()
    if (!val || editForm.allowed_combinations.includes(val)) return
    setEditForm(f => ({ ...f, allowed_combinations: [...f.allowed_combinations, val] }))
    setNewCombo('')
  }
  const removeCombo = (c: string) =>
    setEditForm(f => ({ ...f, allowed_combinations: f.allowed_combinations.filter(x => x !== c) }))

  const updateDept = useMutation({
    mutationFn: () =>
      academicsMgmtService.update('departments', dept.dep_id, {
        dep_name:             editForm.dep_name,
        dep_acronym:          editForm.dep_acronym,
        program_level:        editForm.program_level,
        allowed_combinations: JSON.stringify(editForm.allowed_combinations),
      }),
    onSuccess: () => {
      toast.success('Department updated')
      qc.invalidateQueries({ queryKey: ['acmgmt', 'departments'] })
      onUpdated?.()
    },
    onError: (e: any) => toast.error(e?.response?.data?.message ?? 'Update failed'),
  })

  /* ── Algorithm tab ────────────────────────────────────────────────────── */
  const [intake, setIntake] = useState('')
  const [algoForm, setAlgoForm] = useState(EMPTY_ALGO)

  const intakesQ = useQuery({
    queryKey: ['admin', 'intakes'],
    queryFn:  () => intakeService.list(),
    enabled:  open && tab === 'algorithm',
  })
  const intakes = intakesQ.data?.data ?? []

  const canQuery  = !!dept && !!intake && !!activeYear
  const keyParams = canQuery
    ? { department_id: dept.dep_id, intake, academic_year_id: activeYear!.id }
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

  useEffect(() => {
    const c = criteriaQ.data?.data
    if (c) {
      setAlgoForm({
        grade_weight:          c.grade_weight,
        combination_weight:    c.combination_weight,
        other_weight:          c.other_weight,
        min_grade:             c.min_grade             ?? '',
        cutoff_score:          c.cutoff_score != null  ? String(c.cutoff_score)  : '',
        max_capacity:          c.max_capacity != null  ? String(c.max_capacity)  : '',
        required_combinations: c.required_combinations ?? '',
        algorithm_type:        (c as any).algorithm_type  ?? 'merit_based',
        algorithm_notes:       (c as any).algorithm_notes ?? '',
      })
    } else if (criteriaQ.isFetched && !c) {
      setAlgoForm(EMPTY_ALGO)
    }
  }, [criteriaQ.data, criteriaQ.isFetched])

  useEffect(() => { setAlgoForm(EMPTY_ALGO) }, [intake])

  const isMeritBased  = algoForm.algorithm_type === 'merit_based'
  const weightTotal   = Number(algoForm.grade_weight) + Number(algoForm.combination_weight) + Number(algoForm.other_weight)
  const weightsValid  = Math.abs(weightTotal - 100) < 0.01
  const rows = listQ.data?.data?.data ?? []

  const saveAlgo = useMutation({
    mutationFn: () => meritService.saveCriteria({
      department_id:         dept.dep_id,
      intake,
      academic_year_id:      activeYear!.id,
      grade_weight:          Number(algoForm.grade_weight),
      combination_weight:    Number(algoForm.combination_weight),
      other_weight:          Number(algoForm.other_weight),
      min_grade:             algoForm.min_grade             || undefined,
      required_combinations: algoForm.required_combinations || undefined,
      cutoff_score:          algoForm.cutoff_score          ? Number(algoForm.cutoff_score)  : undefined,
      max_capacity:          algoForm.max_capacity          ? Number(algoForm.max_capacity)  : undefined,
      algorithm_type:        algoForm.algorithm_type        as any,
      algorithm_notes:       algoForm.algorithm_notes       || undefined,
    } as any),
    onSuccess: () => {
      toast.success('Algorithm settings saved')
      qc.invalidateQueries({ queryKey: ['admin', 'merit'] })
      onUpdated?.()
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

  /* ── render ───────────────────────────────────────────────────────────── */
  if (!dept) return null

  const panel = (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-50 flex justify-end">
          {/* Backdrop */}
          <motion.div
            key="backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            onClick={onClose}
          />

          {/* Panel */}
          <motion.div
            key="panel"
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ duration: 0.28, ease: [0.32, 0.72, 0, 1] }}
            className="relative z-10 flex flex-col w-full max-w-2xl bg-white dark:bg-ink-950 shadow-2xl h-full overflow-hidden"
          >
            {/* Header */}
            <div className="flex items-center gap-4 px-6 py-5 border-b border-ink-100 dark:border-ink-800 shrink-0">
              <div className="w-11 h-11 rounded-2xl bg-brand/10 flex items-center justify-center shrink-0">
                <Building2 className="w-5 h-5 text-brand" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[18px] font-black text-ink-900 dark:text-white leading-none truncate">{dept.dep_name}</p>
                <p className="text-[12px] text-ink-400 mt-0.5 font-mono">{dept.dep_acronym} · {dept.fac_name ?? dept.faculty_name ?? ''}</p>
              </div>
              <button
                onClick={onClose}
                className="w-9 h-9 rounded-xl flex items-center justify-center text-ink-400 hover:text-ink-700 hover:bg-ink-100 dark:hover:bg-ink-800 transition-colors shrink-0"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Tab bar */}
            <div className="flex gap-0.5 px-4 pt-3 pb-0 border-b border-ink-100 dark:border-ink-800 bg-ink-50/50 dark:bg-ink-900/50 shrink-0">
              {TABS.map(t => {
                const Icon   = t.icon
                const active = tab === t.id
                return (
                  <button
                    key={t.id}
                    onClick={() => setTab(t.id)}
                    className={`flex items-center gap-2 px-4 py-2.5 text-[12px] font-black uppercase tracking-wider rounded-t-lg transition-all border-b-2 -mb-px ${
                      active
                        ? 'text-brand border-brand bg-white dark:bg-ink-950'
                        : 'text-ink-400 border-transparent hover:text-ink-600 hover:bg-white/60 dark:hover:bg-ink-800/40'
                    }`}
                  >
                    <Icon className="w-3.5 h-3.5" /> {t.label}
                  </button>
                )
              })}
            </div>

            {/* Tab body */}
            <div className="flex-1 overflow-y-auto">

              {/* ── DETAILS ─────────────────────────────────────────────── */}
              {tab === 'details' && (
                <div className="p-6 space-y-6">

                  {/* Key stats row */}
                  <div className="grid grid-cols-3 gap-3">
                    <StatCard icon={Hash} label="Code" value={dept.dep_acronym} />
                    <StatCard icon={GraduationCap} label="Level" value={PROGRAM_LEVELS.find(l => l.value === (dept.program_level ?? 'undergraduate'))?.label ?? '—'} />
                    <StatCard icon={Layers} label="Combinations" value={String(deptCombos.length || '—')} />
                  </div>

                  {/* Department info */}
                  <section className="card p-5 space-y-4">
                    <h4 className="text-[11px] font-black uppercase tracking-widest text-ink-400">Department Information</h4>
                    <Row label="Full Name"    value={dept.dep_name}    />
                    <Row label="Acronym"      value={dept.dep_acronym} />
                    <Row label="Faculty"      value={dept.fac_name ?? dept.faculty_name ?? '—'} />
                    <Row label="Program Level" value={PROGRAM_LEVELS.find(l => l.value === (dept.program_level ?? 'undergraduate'))?.label ?? 'Undergraduate'} />
                  </section>

                  {/* Combinations */}
                  <section className="card p-5">
                    <h4 className="text-[11px] font-black uppercase tracking-widest text-ink-400 mb-3">Allowed Subject Combinations</h4>
                    {deptCombos.length > 0 ? (
                      <div className="flex flex-wrap gap-2">
                        {deptCombos.map(c => (
                          <span key={c} className="px-3 py-1 rounded-full bg-brand/10 text-brand text-[12px] font-black tracking-wider">{c}</span>
                        ))}
                      </div>
                    ) : (
                      <div className="flex items-center gap-2 text-ink-400 text-[13px]">
                        <Info className="w-4 h-4 shrink-0" />
                        No subject combinations configured. Use the Edit tab to add them.
                      </div>
                    )}
                  </section>

                  {/* Quick actions */}
                  <div className="flex gap-3">
                    <button className="btn-secondary btn-sm flex-1" onClick={() => setTab('edit')}>
                      <Edit3 className="w-3.5 h-3.5 mr-1.5" /> Edit Details
                    </button>
                    <button className="btn-primary btn-sm flex-1" onClick={() => setTab('algorithm')}>
                      <Cpu className="w-3.5 h-3.5 mr-1.5" /> Configure Algorithm
                    </button>
                  </div>
                </div>
              )}

              {/* ── EDIT ────────────────────────────────────────────────── */}
              {tab === 'edit' && (
                <div className="p-6 space-y-5">
                  <p className="text-[13px] text-ink-500 bg-ink-50 dark:bg-ink-800/40 rounded-xl px-4 py-3 border border-ink-100 dark:border-ink-800">
                    Changes apply immediately to all admission workflows for this department.
                  </p>

                  <div className="space-y-1.5">
                    <label className="label">Department Name <span className="text-red-500">*</span></label>
                    <input
                      className="input"
                      value={editForm.dep_name}
                      onChange={e => setEditForm(f => ({ ...f, dep_name: e.target.value }))}
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="label">Acronym / Code <span className="text-red-500">*</span></label>
                    <input
                      className="input font-mono uppercase"
                      placeholder="e.g. CS, IT, BBA"
                      value={editForm.dep_acronym}
                      onChange={e => setEditForm(f => ({ ...f, dep_acronym: e.target.value.toUpperCase() }))}
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="label">Program Level</label>
                    <div className="relative">
                      <select
                        className="input appearance-none pr-10"
                        value={editForm.program_level}
                        onChange={e => setEditForm(f => ({ ...f, program_level: e.target.value }))}
                      >
                        {PROGRAM_LEVELS.map(l => (
                          <option key={l.value} value={l.value}>{l.label}</option>
                        ))}
                      </select>
                      <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-400 pointer-events-none" />
                    </div>
                  </div>

                  {/* Combination pill editor */}
                  <div className="space-y-2">
                    <label className="label">Subject Combinations</label>
                    <p className="text-[11px] text-ink-400 -mt-1">Type a combination code and press Enter or click Add (e.g. PCM, MCB).</p>
                    <div className="flex gap-2">
                      <input
                        className="input flex-1 font-mono uppercase"
                        placeholder="e.g. PCM"
                        value={newCombo}
                        onChange={e => setNewCombo(e.target.value.toUpperCase())}
                        onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addCombo() } }}
                      />
                      <button type="button" className="btn-secondary btn-sm px-4 shrink-0" onClick={addCombo}>
                        <Plus className="w-3.5 h-3.5 mr-1" /> Add
                      </button>
                    </div>
                    {editForm.allowed_combinations.length > 0 ? (
                      <div className="flex flex-wrap gap-2 mt-2">
                        {editForm.allowed_combinations.map(c => (
                          <span key={c} className="flex items-center gap-1.5 pl-3 pr-2 py-1 rounded-full bg-brand/10 text-brand text-[12px] font-black">
                            {c}
                            <button
                              type="button"
                              onClick={() => removeCombo(c)}
                              className="w-4 h-4 rounded-full bg-brand/20 hover:bg-brand/40 flex items-center justify-center transition-colors"
                            >
                              <X className="w-2.5 h-2.5" />
                            </button>
                          </span>
                        ))}
                      </div>
                    ) : (
                      <p className="text-[12px] text-ink-400 italic mt-1">No combinations added yet.</p>
                    )}
                  </div>

                  <button
                    className="btn-primary w-full py-3 mt-2"
                    disabled={updateDept.isPending || !editForm.dep_name || !editForm.dep_acronym}
                    onClick={() => updateDept.mutate()}
                  >
                    {updateDept.isPending
                      ? <Loader2 className="w-4 h-4 animate-spin mx-auto" />
                      : <><Save className="w-3.5 h-3.5 mr-2" /> Save Changes</>
                    }
                  </button>
                </div>
              )}

              {/* ── ADMISSION ALGORITHM ─────────────────────────────────── */}
              {tab === 'algorithm' && (
                <div className="p-6 space-y-5">

                  {/* Intake selector */}
                  <div className="space-y-1.5">
                    <label className="label">Intake Session <span className="text-red-500">*</span></label>
                    <select
                      className="input"
                      value={intake}
                      onChange={e => setIntake(e.target.value)}
                    >
                      <option value="">— Select Intake —</option>
                      {intakes.map((i: any) => (
                        <option key={i.id} value={i.name}>{i.name}</option>
                      ))}
                    </select>
                    {activeYear && (
                      <p className="text-[11px] text-ink-400 ml-1">Academic Year: <strong>{activeYear.label}</strong></p>
                    )}
                  </div>

                  {!intake ? (
                    <div className="flex flex-col items-center justify-center py-12 text-center text-ink-400">
                      <Cpu className="w-10 h-10 mb-3 opacity-30" />
                      <p className="text-[14px] font-medium">Select an intake to configure the algorithm.</p>
                    </div>
                  ) : (
                    <>
                      {/* Algorithm type cards */}
                      <section className="card p-5 border-ink-100 dark:border-ink-800">
                        <h4 className="text-[11px] font-black uppercase tracking-widest text-ink-400 mb-3 flex items-center gap-2">
                          <Cpu className="w-3.5 h-3.5" /> Algorithm Type
                        </h4>
                        <div className="space-y-2">
                          {ALGORITHM_OPTIONS.map(opt => {
                            const Icon   = opt.icon
                            const active = algoForm.algorithm_type === opt.value
                            return (
                              <button
                                key={opt.value}
                                onClick={() => setAlgoForm(f => ({ ...f, algorithm_type: opt.value }))}
                                className={`w-full flex items-start gap-3 p-3.5 rounded-xl border-2 text-left transition-all ${
                                  active
                                    ? 'border-brand bg-brand/5 shadow-sm'
                                    : 'border-ink-100 dark:border-ink-800 hover:border-brand/30'
                                }`}
                              >
                                <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 mt-0.5 ${opt.bg}`}>
                                  <Icon className={`w-4 h-4 ${opt.color}`} />
                                </div>
                                <div className="flex-1 min-w-0">
                                  <p className={`text-[13px] font-black ${active ? 'text-brand' : 'text-ink-800 dark:text-ink-200'}`}>{opt.label}</p>
                                  <p className="text-[11px] text-ink-400 leading-tight mt-0.5">{opt.desc}</p>
                                </div>
                                {active && <CheckCircle2 className="w-4 h-4 text-brand ml-auto mt-1 shrink-0" />}
                              </button>
                            )
                          })}
                        </div>

                        <div className="mt-4 space-y-1.5">
                          <label className="text-[11px] font-black uppercase tracking-widest text-ink-400">Notes</label>
                          <textarea
                            className="input text-[13px] h-14 resize-none"
                            placeholder="Optional rationale for this configuration..."
                            value={algoForm.algorithm_notes}
                            onChange={e => setAlgoForm(f => ({ ...f, algorithm_notes: e.target.value }))}
                          />
                        </div>
                      </section>

                      {/* Scoring weights (merit only) */}
                      {isMeritBased && (
                        <section className="card p-5 border-ink-100 dark:border-ink-800 space-y-4">
                          <div className="flex items-center justify-between">
                            <h4 className="text-[11px] font-black uppercase tracking-widest text-ink-400">Scoring Weights</h4>
                            {criteriaQ.data?.data && (
                              <span className="chip-success py-0.5 text-[10px] font-black tracking-widest">ACTIVE</span>
                            )}
                          </div>

                          <div className="p-4 bg-ink-50 dark:bg-ink-800/40 rounded-2xl border border-ink-100 dark:border-ink-800 space-y-4">
                            <WeightInput label="Academic Grades"   value={algoForm.grade_weight}       color="bg-brand"        onChange={v => setAlgoForm(f => ({ ...f, grade_weight: v }))} />
                            <WeightInput label="Combination Match" value={algoForm.combination_weight} color="bg-amber-500"     onChange={v => setAlgoForm(f => ({ ...f, combination_weight: v }))} />
                            <WeightInput label="Other Factors"     value={algoForm.other_weight}       color="bg-emerald-500"  onChange={v => setAlgoForm(f => ({ ...f, other_weight: v }))} />

                            <div className={`pt-3 border-t border-ink-100 dark:border-ink-800 flex items-center justify-between font-black text-[13px] ${weightsValid ? 'text-emerald-600' : 'text-red-500'}`}>
                              <span>TOTAL</span>
                              <span className="flex items-center gap-1.5">
                                {weightTotal}% {weightsValid ? <CheckCircle2 className="w-3.5 h-3.5" /> : <XCircle className="w-3.5 h-3.5" />}
                              </span>
                            </div>
                            {!weightsValid && <p className="text-[11px] text-red-400 text-right">Must equal 100% to save</p>}
                          </div>

                          {/* Thresholds */}
                          <div className="grid grid-cols-2 gap-3">
                            <AlgoField label="Min Entry Grade">
                              <input className="input font-bold" placeholder="e.g. 60%" value={algoForm.min_grade}
                                onChange={e => setAlgoForm(f => ({ ...f, min_grade: e.target.value }))} />
                            </AlgoField>
                            <AlgoField label="Cutoff Score">
                              <input type="number" step={0.1} className="input font-bold" value={algoForm.cutoff_score}
                                onChange={e => setAlgoForm(f => ({ ...f, cutoff_score: e.target.value }))} />
                            </AlgoField>
                            <AlgoField label="Max Capacity">
                              <input type="number" className="input font-bold" value={algoForm.max_capacity}
                                onChange={e => setAlgoForm(f => ({ ...f, max_capacity: e.target.value }))} />
                            </AlgoField>
                            <AlgoField label="Required Combos">
                              <div className="relative">
                                <input className="input font-mono text-[12px] pr-16" placeholder='["ALL"]'
                                  value={algoForm.required_combinations}
                                  onChange={e => setAlgoForm(f => ({ ...f, required_combinations: e.target.value }))} />
                                {editForm.allowed_combinations.length > 0 && (
                                  <button
                                    type="button"
                                    className="absolute right-2 top-1/2 -translate-y-1/2 text-[9px] font-black text-brand bg-brand/10 px-1.5 py-0.5 rounded hover:bg-brand/20"
                                    onClick={() => setAlgoForm(f => ({ ...f, required_combinations: JSON.stringify(editForm.allowed_combinations) }))}
                                  >
                                    FILL
                                  </button>
                                )}
                              </div>
                            </AlgoField>
                          </div>
                        </section>
                      )}

                      {/* Action buttons */}
                      <div className="flex flex-col gap-2">
                        <button
                          className="btn-primary w-full py-3 rounded-xl"
                          disabled={saveAlgo.isPending || (isMeritBased && !weightsValid)}
                          onClick={() => saveAlgo.mutate()}
                        >
                          {saveAlgo.isPending ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : 'Save Algorithm Settings'}
                        </button>
                        {isMeritBased && (
                          <button
                            className="btn-secondary w-full py-2.5 rounded-xl border-brand/20 text-brand flex items-center justify-center gap-2"
                            disabled={generate.isPending || !criteriaQ.data?.data}
                            onClick={() => generate.mutate()}
                          >
                            {generate.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Play className="w-3.5 h-3.5" /> Generate Ranking</>}
                          </button>
                        )}
                        <button
                          className="btn-gold w-full py-2.5 rounded-xl flex items-center justify-center gap-2"
                          disabled={publish.isPending || rows.length === 0}
                          onClick={() => publish.mutate()}
                        >
                          {publish.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Send className="w-3.5 h-3.5" /> Publish Results</>}
                        </button>
                      </div>

                      {/* Mini ranking list */}
                      {rows.length > 0 && (
                        <section className="card p-0 overflow-hidden border-ink-100 dark:border-ink-800">
                          <div className="px-5 py-3.5 border-b border-ink-100 dark:border-ink-800 flex items-center justify-between">
                            <p className="text-[13px] font-black text-ink-900 dark:text-white">
                              Ranked Applicants
                            </p>
                            <span className="text-[11px] text-ink-400">
                              {rows.filter((r: any) => r.is_qualified).length}/{rows.length} qualified
                            </span>
                          </div>
                          <div className="divide-y divide-ink-100 dark:divide-ink-800 max-h-64 overflow-y-auto">
                            {rows.map((r: any) => (
                              <div key={r.id} className={`flex items-center gap-3 px-5 py-3 ${!r.is_qualified ? 'opacity-50' : ''}`}>
                                <span className={`w-8 h-8 rounded-lg flex items-center justify-center font-mono font-black text-[13px] shrink-0 ${r.rank <= 3 ? 'bg-amber-100 text-amber-700' : 'bg-ink-100 text-ink-500'}`}>
                                  #{r.rank}
                                </span>
                                <div className="flex-1 min-w-0">
                                  <p className="text-[13px] font-black text-ink-900 dark:text-white leading-none truncate">{r.first_name} {r.last_name}</p>
                                  <p className="text-[11px] text-ink-400 font-mono">{r.application_number}</p>
                                </div>
                                <div className="text-right shrink-0">
                                  <p className="text-[14px] font-black text-ink-900 dark:text-white">{Number(r.merit_score).toFixed(1)}</p>
                                  {r.is_qualified
                                    ? <span className="text-[10px] font-black text-emerald-600 uppercase">Qualified</span>
                                    : <span className="text-[10px] font-black text-ink-400 uppercase">Not Selected</span>
                                  }
                                </div>
                              </div>
                            ))}
                          </div>
                        </section>
                      )}
                    </>
                  )}
                </div>
              )}

            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  )

  return <ModalPortal>{panel}</ModalPortal>
}

/* ── small sub-components ────────────────────────────────────────────────── */
function StatCard({ icon: Icon, label, value }: { icon: any; label: string; value: string }) {
  return (
    <div className="card p-4 flex flex-col items-center gap-1.5 text-center border-ink-100 dark:border-ink-800">
      <Icon className="w-4 h-4 text-brand opacity-70" />
      <p className="text-[18px] font-black text-ink-900 dark:text-white leading-none">{value}</p>
      <p className="text-[10px] font-black uppercase tracking-widest text-ink-400">{label}</p>
    </div>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center gap-3">
      <span className="text-[12px] text-ink-400 w-28 shrink-0">{label}</span>
      <span className="text-[13px] font-bold text-ink-800 dark:text-ink-200">{value || '—'}</span>
    </div>
  )
}

function WeightInput({ label, value, color, onChange }: { label: string; value: number; color: string; onChange: (v: number) => void }) {
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-[12px] font-bold">
        <span className="text-ink-600">{label}</span>
        <span className="text-ink-900 dark:text-white">{value}%</span>
      </div>
      <input type="range" min="0" max="100" step="5" className="w-full accent-brand h-1.5"
        value={value} onChange={e => onChange(Number(e.target.value))} />
      <div className="w-full h-1 bg-ink-100 dark:bg-ink-800 rounded-full overflow-hidden">
        <div className={`h-full ${color} transition-all duration-300`} style={{ width: `${value}%` }} />
      </div>
    </div>
  )
}

function AlgoField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <label className="text-[10px] font-black uppercase tracking-widest text-ink-400">{label}</label>
      {children}
    </div>
  )
}
