import { useEffect, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { CheckCircle2, Loader2, GraduationCap, Calendar } from 'lucide-react'
import toast from 'react-hot-toast'
import { myModulesService } from '@/services/modulesService'
import { academicService } from '@/services/academicService'
import type { ModuleRegistration } from '@/types/modules'

type Tab = 'available' | 'mine'

export default function MyRegistrationsPage() {
  const qc = useQueryClient()

  const termsQ = useQuery({ queryKey: ['academic', 'terms'], queryFn: () => academicService.listTerms() })
  const terms = termsQ.data?.data ?? []
  const [termId, setTermId] = useState<number>(0)
  useEffect(() => {
    if (!termId && terms.length) {
      const current = terms.find((t: any) => t.is_current) ?? terms[0]
      setTermId(current.id)
    }
  }, [terms, termId])

  const [tab, setTab] = useState<Tab>('available')

  const eligibleQ = useQuery({
    queryKey: ['my-modules', 'eligible', termId],
    queryFn: () => myModulesService.eligible(termId),
    enabled: !!termId && tab === 'available',
  })

  const mineQ = useQuery({
    queryKey: ['my-modules', 'registrations', termId],
    queryFn: () => myModulesService.registrations({ term_id: termId }),
    enabled: !!termId && tab === 'mine',
  })

  const register = useMutation({
    mutationFn: (moduleId: number) => myModulesService.register({ module_id: moduleId, academic_term_id: termId }),
    onSuccess: () => {
      toast.success('Registered')
      qc.invalidateQueries({ queryKey: ['my-modules'] })
    },
    onError: (e: any) => toast.error(e?.response?.data?.message ?? 'Registration failed'),
  })

  const drop = useMutation({
    mutationFn: (id: number) => myModulesService.drop(id),
    onSuccess: () => {
      toast.success('Module dropped')
      qc.invalidateQueries({ queryKey: ['my-modules'] })
    },
    onError: (e: any) => toast.error(e?.response?.data?.message ?? 'Drop failed'),
  })

  const eligible = eligibleQ.data?.data ?? []
  const mine: ModuleRegistration[] = mineQ.data?.data ?? []

  return (
    <div className="max-w-[1200px] mx-auto space-y-4 animate-fade-in">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-lg font-bold text-ink-900 dark:text-white">My modules</h2>
          <p className="text-[13px] text-ink-500">Register for the modules you are eligible to take this term.</p>
        </div>
        <select className="input input-sm w-56" value={termId || ''} onChange={(e) => setTermId(Number(e.target.value))}>
          <option value="" disabled>Select term…</option>
          {terms.map((t: any) => (
            <option key={t.id} value={t.id}>
              {t.label}{t.is_current ? ' (current)' : ''}
            </option>
          ))}
        </select>
      </div>

      {/* Tabs */}
      <div className="card p-1 inline-flex gap-1">
        <button
          className={`px-3 py-1.5 text-[13px] rounded-md ${tab === 'available' ? 'bg-brand/10 text-brand font-semibold' : 'text-ink-600'}`}
          onClick={() => setTab('available')}
        >
          <Calendar className="w-3.5 h-3.5 inline mr-1" /> Available
        </button>
        <button
          className={`px-3 py-1.5 text-[13px] rounded-md ${tab === 'mine' ? 'bg-brand/10 text-brand font-semibold' : 'text-ink-600'}`}
          onClick={() => setTab('mine')}
        >
          <GraduationCap className="w-3.5 h-3.5 inline mr-1" /> My registrations
        </button>
      </div>

      {!termId ? (
        <div className="card p-8 text-center text-ink-400">Pick an academic term to continue.</div>
      ) : tab === 'available' ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {eligibleQ.isLoading ? (
            <div className="col-span-full card p-8 text-center"><Loader2 className="w-6 h-6 animate-spin mx-auto text-brand" /></div>
          ) : eligible.length === 0 ? (
            <div className="col-span-full card p-8 text-center text-ink-400">
              No modules are currently available to you. Check your prerequisites and year of study.
            </div>
          ) : eligible.map((m: any) => (
            <div key={m.module_id} className="card p-4">
              <div className="font-mono text-[11px] text-ink-500 mb-0.5">{m.module_code}</div>
              <div className="font-semibold text-ink-900 dark:text-white mb-1">{m.module_name}</div>
              <div className="text-[12px] text-ink-500 mb-2">
                {m.module_credits} credits · Level {m.level}
              </div>
              {m.description && (
                <p className="text-[12px] text-ink-600 dark:text-ink-300 mb-3 line-clamp-3">{m.description}</p>
              )}
              <button
                className="btn-primary btn-xs w-full"
                disabled={register.isPending}
                onClick={() => register.mutate(m.module_id)}
              >
                {register.isPending ? 'Registering…' : 'Register'}
              </button>
            </div>
          ))}
        </div>
      ) : (
        <div className="card overflow-hidden">
          <table className="w-full text-left text-[13px]">
            <thead>
              <tr className="bg-ink-50 dark:bg-ink-800/50 border-b border-ink-100 dark:border-ink-700">
                <th className="px-4 py-2.5 font-bold text-ink-400 text-[10px] uppercase">Module</th>
                <th className="px-4 py-2.5 font-bold text-ink-400 text-[10px] uppercase">Credits</th>
                <th className="px-4 py-2.5 font-bold text-ink-400 text-[10px] uppercase">Status</th>
                <th className="px-4 py-2.5 font-bold text-ink-400 text-[10px] uppercase">Grade</th>
                <th className="px-4 py-2.5 font-bold text-ink-400 text-[10px] uppercase text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ink-100 dark:divide-ink-700">
              {mineQ.isLoading ? (
                <tr><td colSpan={5} className="p-8 text-center"><Loader2 className="w-6 h-6 animate-spin mx-auto text-brand" /></td></tr>
              ) : mine.length === 0 ? (
                <tr><td colSpan={5} className="p-8 text-center text-ink-400">You have no registrations for this term yet.</td></tr>
              ) : mine.map((r) => (
                <tr key={r.id} className="hover:bg-ink-50/50 dark:hover:bg-ink-700/20">
                  <td className="px-4 py-3">
                    <span className="font-mono">{r.module_code}</span>
                    <span className="text-ink-500 ml-1">— {r.module_name}</span>
                  </td>
                  <td className="px-4 py-3">{r.module_credits ?? '—'}</td>
                  <td className="px-4 py-3">
                    <span className={`chip-xs ${
                      r.status === 'registered' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-400' :
                      r.status === 'completed'  ? 'bg-blue-100 text-blue-700 dark:bg-blue-500/20 dark:text-blue-400' :
                      r.status === 'failed'     ? 'bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-400' :
                      'bg-ink-100 text-ink-600 dark:bg-ink-700 dark:text-ink-400'
                    }`}>
                      {r.status === 'completed' && <CheckCircle2 className="w-3 h-3 inline mr-0.5" />}
                      {r.status}
                    </span>
                  </td>
                  <td className="px-4 py-3">{r.grade ?? '—'}</td>
                  <td className="px-4 py-3 text-right">
                    {r.status === 'registered' ? (
                      <button
                        className="btn-ghost btn-xs text-red-500"
                        disabled={drop.isPending}
                        onClick={() => confirm(`Drop ${r.module_code}?`) && drop.mutate(r.id)}
                      >
                        Drop
                      </button>
                    ) : (
                      <span className="text-ink-300 text-[12px]">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
