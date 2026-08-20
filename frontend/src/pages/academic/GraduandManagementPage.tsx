import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { GraduationCap, CheckCircle2, Plus } from 'lucide-react'
import Modal from '@/components/ui/Modal'
import Pagination, { DEFAULT_PER_PAGE_OPTIONS } from '@/components/ui/Pagination'
import GraduationAuditPanel from './GraduationAuditPanel'
import GraduationRosterPanel from './GraduationRosterPanel'
import { graduandService, type EligibilityRow, type DegreeClass } from '@/services/graduandService'
import { useAuthStore } from '@/store/authStore'
import { PERMISSIONS } from '@/constants/permissions'

const DEGREE_CLASSES: DegreeClass[] = ['First Class', 'Upper Second', 'Lower Second', 'Pass', 'Distinction']

type TabKey = 'audit' | 'eligibility' | 'list'

const TABS: Array<{ key: TabKey; label: string }> = [
  // Default tab: the cohort audit answers "who should be graduating and what is
  // still missing", which is the question that precedes building the list.
  { key: 'audit',       label: 'Completion audit' },
  { key: 'eligibility', label: 'Eligibility list' },
  { key: 'list',        label: 'Graduation list' },
]

export default function GraduandManagementPage() {
  const authUser = useAuthStore((s) => s.user)
  const canWrite = authUser?.permissions?.includes(PERMISSIONS.MANAGE_GRADUANDS)
                || authUser?.role === 'superadmin'

  const qc = useQueryClient()
  const [activeTab, setActiveTab] = useState<TabKey>('audit')
  const [page, setPage]     = useState(1)
  // Page size is shared by both tabs. Changing it resets to page 1 — staying on
  // page 3 after switching 20 → 500 would land past the end of the result set.
  const [perPage, setPerPage] = useState(DEFAULT_PER_PAGE_OPTIONS[0])
  const changePerPage = (n: number) => { setPerPage(n); setPage(1) }


  const [addStudent, setAddStudent]   = useState<EligibilityRow | null>(null)
  const [chosenClass, setChosenClass] = useState<DegreeClass>('Pass')

  const { data: eligResult, isLoading: eligLoading } = useQuery({
    queryKey: ['graduands-eligibility', page, perPage],
    queryFn:  () => graduandService.eligibilityList({ page, per_page: perPage }),
    enabled:  activeTab === 'eligibility',
  })
  const eligData = eligResult?.data

  const addMut = useMutation({
    mutationFn: () => graduandService.add({ student_id: addStudent!.id, degree_class: chosenClass }),
    onSuccess: () => {
      toast.success('Student added to graduation list.')
      qc.invalidateQueries({ queryKey: ['graduands-list'] })
      setAddStudent(null)
    },
    onError: (e: any) => toast.error(e?.response?.data?.message ?? 'Failed to add student.'),
  })

  const switchTab = (t: TabKey) => { setActiveTab(t); setPage(1) }

  return (
    <div className="px-6 pb-6 max-w-7xl mx-auto">
      <div className="flex items-center gap-3 pt-6 mb-6">
        <GraduationCap className="w-6 h-6 text-blue-600" />
        <div>
          <h1 className="text-xl font-bold text-gray-900 dark:text-white">Graduand Management</h1>
          <p className="text-sm text-gray-500 dark:text-ink-400">Audit who has completed their curriculum, check eligibility, and manage the graduation list.</p>
        </div>
      </div>

      {/* Pinned to the top of the scroll area so the tabs stay reachable while
          reading a long cohort. Height is fixed at h-12 because the audit
          table's header row pins directly beneath it at `top-12` — change one
          and the other has to move with it. */}
      <div className="sticky top-0 z-30 flex h-12 items-end border-b border-gray-200 bg-[rgb(var(--bg-app))] mb-6 dark:border-ink-700 dark:bg-ink-900">
        {TABS.map((t) => (
          <button key={t.key} onClick={() => switchTab(t.key)}
            className={`px-5 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${
              activeTab === t.key ? 'border-blue-600 text-blue-600 dark:text-blue-400' : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-ink-400 dark:hover:text-ink-200'
            }`}>
            {t.label}
          </button>
        ))}
      </div>

      {/* Completion audit — cohort by start date, curriculum vs recorded marks */}
      {activeTab === 'audit' && <GraduationAuditPanel />}

      {/* Eligibility Tab */}
      {activeTab === 'eligibility' && (
        eligLoading ? <div className="text-center py-12 text-gray-400 dark:text-ink-500">Loading…</div> : (
          <>
            <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm dark:border-ink-700 dark:bg-ink-800">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b border-gray-200 dark:bg-ink-900/40 dark:border-ink-700">
                  <tr>
                    <th className="px-4 py-3 text-left font-semibold text-gray-700 dark:text-ink-200">Student</th>
                    <th className="px-4 py-3 text-left font-semibold text-gray-700 dark:text-ink-200">Program</th>
                    <th className="px-4 py-3 text-center font-semibold text-gray-700 dark:text-ink-200">Modules</th>
                    <th className="px-4 py-3 text-center font-semibold text-gray-700 dark:text-ink-200">Weighted Avg</th>
                    <th className="px-4 py-3 text-center font-semibold text-gray-700 dark:text-ink-200">Degree Class</th>
                    <th className="px-4 py-3 text-center font-semibold text-gray-700 dark:text-ink-200">Eligible</th>
                    {canWrite && <th className="px-4 py-3 text-center font-semibold text-gray-700 dark:text-ink-200">Action</th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-ink-700">
                  {(eligData?.data ?? []).length === 0 && (
                    <tr><td colSpan={7} className="px-4 py-8 text-center text-gray-400 dark:text-ink-500">No students found.</td></tr>
                  )}
                  {(eligData?.data ?? []).map((r) => (
                    <tr key={r.id} className="hover:bg-gray-50 dark:hover:bg-ink-700/50">
                      <td className="px-4 py-3">
                        <div className="font-medium text-gray-900 dark:text-white">{r.lname} {r.fname}</div>
                        <div className="text-xs text-gray-500 dark:text-ink-400">{r.regnumber}</div>
                      </td>
                      <td className="px-4 py-3 text-gray-600 text-xs dark:text-ink-300">
                        {r.option_title ?? r.option_acronym ?? '—'}
                        {r.dep_name && <div className="text-gray-400 dark:text-ink-500">{r.dep_name}</div>}
                      </td>
                      <td className="px-4 py-3 text-center text-gray-700 dark:text-ink-200">{r.modules}</td>
                      <td className="px-4 py-3 text-center font-semibold text-gray-800 dark:text-ink-100">
                        {r.weighted_avg != null ? `${r.weighted_avg.toFixed(1)}%` : '—'}
                      </td>
                      <td className="px-4 py-3 text-center text-xs text-gray-700 dark:text-ink-200">{r.degree_class ?? '—'}</td>
                      <td className="px-4 py-3 text-center">
                        {r.eligible
                          ? <CheckCircle2 className="w-5 h-5 text-green-500 mx-auto dark:text-green-400" />
                          : <span className="text-xs text-red-500 dark:text-red-400">{r.failed} failed</span>}
                      </td>
                      {canWrite && (
                        <td className="px-4 py-3 text-center">
                          {r.eligible && (
                            <button onClick={() => { setAddStudent(r); setChosenClass(r.degree_class ?? 'Pass') }}
                              className="inline-flex items-center gap-1 px-3 py-1 text-xs bg-blue-600 text-white rounded-lg hover:bg-blue-700">
                              <Plus className="w-3 h-3" /> Add to List
                            </button>
                          )}
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pagination
              currentPage={page}
              lastPage={eligData?.last_page ?? 1}
              total={eligData?.total ?? 0}
              perPage={perPage}
              onPageChange={setPage}
              perPageOptions={DEFAULT_PER_PAGE_OPTIONS}
              onPerPageChange={changePerPage}
              className="px-4 py-3 border-t border-gray-100 dark:border-ink-700"
            />
          </>
        )
      )}

      {/* Graduation list — the students the completion snapshot says have
          finished, with whatever lifecycle record each already has. */}
      {activeTab === 'list' && <GraduationRosterPanel />}

      {/* Add to list modal */}
      <Modal open={addStudent !== null} title={`Add ${addStudent?.lname ?? ''} ${addStudent?.fname ?? ''} to Graduation List`} onClose={() => setAddStudent(null)}>
        <div className="space-y-4 p-1">
          <p className="text-sm text-gray-600 mb-1 dark:text-ink-300">
            Suggested Degree Class (based on GPA {addStudent?.weighted_avg?.toFixed(1)}%)
          </p>
          <select value={chosenClass} onChange={(e) => setChosenClass(e.target.value as DegreeClass)}
            className="w-full border rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500 dark:border-ink-700 dark:bg-ink-900 dark:text-white">
            {DEGREE_CLASSES.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
          <div className="flex justify-end gap-2">
            <button onClick={() => setAddStudent(null)} className="px-4 py-2 text-sm border rounded-lg hover:bg-gray-50 dark:border-ink-700 dark:text-ink-200 dark:hover:bg-ink-700/50">Cancel</button>
            <button onClick={() => addMut.mutate()} disabled={addMut.isPending}
              className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50">
              {addMut.isPending ? 'Adding…' : 'Add to List'}
            </button>
          </div>
        </div>
      </Modal>

    </div>
  )
}

// The local prev/next-only `PaginationBar` was replaced by the shared
// `components/ui/Pagination`, which renders numbered pages with ellipsis and
// the per-page selector.
