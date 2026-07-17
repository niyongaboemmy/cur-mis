import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { GraduationCap, CheckCircle2, Clock, UserCheck, ChevronLeft, ChevronRight, Plus } from 'lucide-react'
import Modal from '@/components/ui/Modal'
import { graduandService, type EligibilityRow, type GraduandStatus, type DegreeClass } from '@/services/graduandService'
import { useAuthStore } from '@/store/authStore'
import { PERMISSIONS } from '@/constants/permissions'

const DEGREE_CLASSES: DegreeClass[] = ['First Class', 'Upper Second', 'Lower Second', 'Pass', 'Distinction']

const STATUS_BADGE: Record<GraduandStatus, string> = {
  pending:   'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/20 dark:text-yellow-300',
  approved:  'bg-blue-100 text-blue-800 dark:bg-blue-900/20 dark:text-blue-300',
  graduated: 'bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-300',
  deferred:  'bg-gray-100 text-gray-700 dark:bg-ink-700 dark:text-ink-300',
}

export default function GraduandManagementPage() {
  const authUser = useAuthStore((s) => s.user)
  const canWrite = authUser?.permissions?.includes(PERMISSIONS.MANAGE_GRADUANDS)
                || authUser?.role === 'superadmin'

  const qc = useQueryClient()
  const [activeTab, setActiveTab] = useState<'eligibility' | 'list'>('eligibility')
  const [page, setPage]     = useState(1)
  const [status, setStatus] = useState<GraduandStatus | ''>('')

  const [graduateId, setGraduateId]         = useState<number | null>(null)
  const [graduationDate, setGraduationDate] = useState(new Date().toISOString().slice(0, 10))
  const [ceremonyNumber, setCeremonyNumber] = useState('')

  const [addStudent, setAddStudent]   = useState<EligibilityRow | null>(null)
  const [chosenClass, setChosenClass] = useState<DegreeClass>('Pass')

  const { data: eligResult, isLoading: eligLoading } = useQuery({
    queryKey: ['graduands-eligibility', page],
    queryFn:  () => graduandService.eligibilityList({ page, per_page: 20 }),
    enabled:  activeTab === 'eligibility',
  })
  const eligData = eligResult?.data

  const { data: listResult, isLoading: listLoading } = useQuery({
    queryKey: ['graduands-list', status, page],
    queryFn:  () => graduandService.list({ status: status || undefined, page, per_page: 20 }),
    enabled:  activeTab === 'list',
  })
  const listData = listResult?.data

  const addMut = useMutation({
    mutationFn: () => graduandService.add({ student_id: addStudent!.id, degree_class: chosenClass }),
    onSuccess: () => {
      toast.success('Student added to graduation list.')
      qc.invalidateQueries({ queryKey: ['graduands-list'] })
      setAddStudent(null)
    },
    onError: (e: any) => toast.error(e?.response?.data?.message ?? 'Failed to add student.'),
  })

  const approveMut = useMutation({
    mutationFn: graduandService.approve,
    onSuccess: () => { toast.success('Graduand approved.'); qc.invalidateQueries({ queryKey: ['graduands-list'] }) },
    onError: () => toast.error('Approval failed.'),
  })

  const graduateMut = useMutation({
    mutationFn: (id: number) => graduandService.graduate(id, { graduation_date: graduationDate, ceremony_number: ceremonyNumber }),
    onSuccess: () => {
      toast.success('Student marked as graduated.')
      qc.invalidateQueries({ queryKey: ['graduands-list'] })
      setGraduateId(null)
    },
    onError: () => toast.error('Action failed.'),
  })

  const deferMut = useMutation({
    mutationFn: graduandService.defer,
    onSuccess: () => { toast.success('Graduand deferred.'); qc.invalidateQueries({ queryKey: ['graduands-list'] }) },
    onError: () => toast.error('Action failed.'),
  })

  const switchTab = (t: 'eligibility' | 'list') => { setActiveTab(t); setPage(1) }

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <GraduationCap className="w-6 h-6 text-blue-600" />
        <div>
          <h1 className="text-xl font-bold text-gray-900 dark:text-white">Graduand Management</h1>
          <p className="text-sm text-gray-500 dark:text-ink-400">Check eligibility, build the graduation list, and manage ceremony records.</p>
        </div>
      </div>

      <div className="flex border-b border-gray-200 mb-6 dark:border-ink-700">
        {(['eligibility', 'list'] as const).map((t) => (
          <button key={t} onClick={() => switchTab(t)}
            className={`px-5 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${
              activeTab === t ? 'border-blue-600 text-blue-600 dark:text-blue-400' : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-ink-400 dark:hover:text-ink-200'
            }`}>
            {t === 'eligibility' ? 'Eligibility List' : 'Graduation List'}
          </button>
        ))}
      </div>

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
            <PaginationBar page={page} lastPage={eligData?.last_page ?? 1} total={eligData?.total ?? 0} onPage={setPage} />
          </>
        )
      )}

      {/* Graduation List Tab */}
      {activeTab === 'list' && (
        <>
          <div className="flex gap-2 mb-4">
            {(['', 'pending', 'approved', 'graduated', 'deferred'] as const).map((s) => (
              <button key={s} onClick={() => { setStatus(s); setPage(1) }}
                className={`px-3 py-1.5 text-xs rounded-full border font-medium capitalize ${
                  status === s ? 'bg-blue-600 text-white border-blue-600' : 'text-gray-600 hover:bg-gray-50 dark:text-ink-300 dark:border-ink-700 dark:hover:bg-ink-700/50'
                }`}>
                {s === '' ? 'All' : s}
              </button>
            ))}
          </div>
          {listLoading ? <div className="text-center py-12 text-gray-400 dark:text-ink-500">Loading…</div> : (
            <>
              <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm dark:border-ink-700 dark:bg-ink-800">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 border-b border-gray-200 dark:bg-ink-900/40 dark:border-ink-700">
                    <tr>
                      <th className="px-4 py-3 text-left font-semibold text-gray-700 dark:text-ink-200">Student</th>
                      <th className="px-4 py-3 text-center font-semibold text-gray-700 dark:text-ink-200">GPA</th>
                      <th className="px-4 py-3 text-left font-semibold text-gray-700 dark:text-ink-200">Degree Class</th>
                      <th className="px-4 py-3 text-left font-semibold text-gray-700 dark:text-ink-200">Year</th>
                      <th className="px-4 py-3 text-center font-semibold text-gray-700 dark:text-ink-200">Status</th>
                      {canWrite && <th className="px-4 py-3 text-center font-semibold text-gray-700 dark:text-ink-200">Actions</th>}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 dark:divide-ink-700">
                    {(listData?.data ?? []).length === 0 && (
                      <tr><td colSpan={6} className="px-4 py-8 text-center text-gray-400 dark:text-ink-500">No graduands found.</td></tr>
                    )}
                    {(listData?.data ?? []).map((r) => (
                      <tr key={r.id} className="hover:bg-gray-50 dark:hover:bg-ink-700/50">
                        <td className="px-4 py-3">
                          <div className="font-medium text-gray-900 dark:text-white">{r.lname} {r.fname}</div>
                          <div className="text-xs text-gray-500 dark:text-ink-400">{r.regnumber}</div>
                        </td>
                        <td className="px-4 py-3 text-center font-semibold dark:text-ink-100">
                          {r.cgpa != null ? `${Number(r.cgpa).toFixed(1)}%` : '—'}
                        </td>
                        <td className="px-4 py-3 text-gray-700 dark:text-ink-200">{r.degree_class ?? '—'}</td>
                        <td className="px-4 py-3 text-gray-500 text-xs dark:text-ink-400">{r.year_label ?? '—'}</td>
                        <td className="px-4 py-3 text-center">
                          <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium capitalize ${STATUS_BADGE[r.status]}`}>
                            {r.status}
                          </span>
                        </td>
                        {canWrite && (
                          <td className="px-4 py-3">
                            <div className="flex justify-center gap-1">
                              {r.status === 'pending' && (
                                <button title="Approve" onClick={() => approveMut.mutate(r.id)}
                                  className="p-1.5 rounded text-green-600 hover:bg-green-50 dark:text-green-400 dark:hover:bg-green-900/20">
                                  <UserCheck className="w-4 h-4" />
                                </button>
                              )}
                              {r.status === 'approved' && (
                                <button title="Graduate"
                                  onClick={() => { setGraduateId(r.id); setGraduationDate(new Date().toISOString().slice(0, 10)); setCeremonyNumber('') }}
                                  className="p-1.5 rounded text-blue-600 hover:bg-blue-50 dark:text-blue-400 dark:hover:bg-blue-900/20">
                                  <GraduationCap className="w-4 h-4" />
                                </button>
                              )}
                              {['pending', 'approved'].includes(r.status) && (
                                <button title="Defer"
                                  onClick={() => { if (window.confirm('Defer this student?')) deferMut.mutate(r.id) }}
                                  className="p-1.5 rounded text-gray-500 hover:bg-gray-100 dark:text-ink-400 dark:hover:bg-ink-700">
                                  <Clock className="w-4 h-4" />
                                </button>
                              )}
                            </div>
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <PaginationBar page={page} lastPage={listData?.last_page ?? 1} total={listData?.total ?? 0} onPage={setPage} />
            </>
          )}
        </>
      )}

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

      {/* Graduate modal */}
      <Modal open={graduateId !== null} title="Mark as Graduated" onClose={() => setGraduateId(null)}>
        <div className="space-y-4 p-1">
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1 dark:text-ink-300">Graduation Date</label>
            <input type="date" value={graduationDate} onChange={(e) => setGraduationDate(e.target.value)}
              className="w-full border rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500 dark:border-ink-700 dark:bg-ink-900 dark:text-white" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1 dark:text-ink-300">Ceremony Number (optional)</label>
            <input value={ceremonyNumber} onChange={(e) => setCeremonyNumber(e.target.value)}
              placeholder="e.g. 25th Graduation Ceremony"
              className="w-full border rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500 dark:border-ink-700 dark:bg-ink-900 dark:text-white" />
          </div>
          <div className="flex justify-end gap-2">
            <button onClick={() => setGraduateId(null)} className="px-4 py-2 text-sm border rounded-lg hover:bg-gray-50 dark:border-ink-700 dark:text-ink-200 dark:hover:bg-ink-700/50">Cancel</button>
            <button onClick={() => graduateId !== null && graduateMut.mutate(graduateId)} disabled={graduateMut.isPending}
              className="px-4 py-2 text-sm bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50">
              {graduateMut.isPending ? 'Saving…' : 'Confirm Graduation'}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  )
}

function PaginationBar({ page, lastPage, total, onPage }: { page: number; lastPage: number; total: number; onPage: (p: number) => void }) {
  if (lastPage <= 1) return null
  return (
    <div className="flex items-center justify-between mt-4 text-sm text-gray-600 dark:text-ink-300">
      <span>{total} student{total !== 1 ? 's' : ''}</span>
      <div className="flex gap-2">
        <button onClick={() => onPage(Math.max(1, page - 1))} disabled={page <= 1}
          className="p-2 border rounded hover:bg-gray-50 disabled:opacity-40 dark:border-ink-700 dark:hover:bg-ink-700/50"><ChevronLeft className="w-4 h-4" /></button>
        <span className="px-3 py-2 border rounded bg-white dark:border-ink-700 dark:bg-ink-800 dark:text-white">{page} / {lastPage}</span>
        <button onClick={() => onPage(Math.min(lastPage, page + 1))} disabled={page >= lastPage}
          className="p-2 border rounded hover:bg-gray-50 disabled:opacity-40 dark:border-ink-700 dark:hover:bg-ink-700/50"><ChevronRight className="w-4 h-4" /></button>
      </div>
    </div>
  )
}
