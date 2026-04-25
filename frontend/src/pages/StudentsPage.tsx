import { useMemo, useState, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useSearchParams } from 'react-router-dom'
import {
  GraduationCap,
  Users,
  Search,
  Loader2,
  Mail,
  Phone,
  Calendar,
  BadgeCheck,
  ArrowLeft,
  ArrowRight,
} from 'lucide-react'
import { studentService } from '@/services/studentService'
import { hrService } from '@/services/hrService'
import { useDebounce } from '@/hooks/useDebounce'
import type { Student, HrEmployee } from '@/types/academic'

type Tab = 'students' | 'employees'
const PER_PAGE = 15

export default function StudentsPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const initialQ = searchParams.get('q') || ''
  
  const [tab, setTab]     = useState<Tab>('students')
  const [q, setQ]         = useState(initialQ)
  const [page, setPage]   = useState(1)
  const debouncedQ        = useDebounce(q, 350)

  // Sync search state with URL for "auto-select" behavior
  useEffect(() => {
    if (debouncedQ) {
      setSearchParams({ q: debouncedQ }, { replace: true })
    } else {
      searchParams.delete('q')
      setSearchParams(searchParams, { replace: true })
    }
  }, [debouncedQ, setSearchParams])

  // Reset page on tab or search change
  const resetTo = (nextTab: Tab) => { setTab(nextTab); setPage(1); setQ('') }

  return (
    <div className="max-w-[1400px] mx-auto space-y-5">
      {/* ── Header / Tabs ── */}
      <section className="card p-4">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
          <div className="flex gap-1 p-1 rounded-md bg-ink-50 dark:bg-ink-700/50 self-start">
            <TabButton active={tab === 'students'} icon={GraduationCap} label="Student Registry" onClick={() => resetTo('students')} />
            <TabButton active={tab === 'employees'} icon={Users}        label="HR Employees"     onClick={() => resetTo('employees')} />
          </div>

          <div className="relative w-full md:w-80">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-400 pointer-events-none" />
            <input
              value={q}
              onChange={(e) => { setQ(e.target.value); setPage(1) }}
              placeholder={tab === 'students' ? 'Search by name, email, reg #…' : 'Search employees…'}
              className="input pl-9"
            />
          </div>
        </div>
      </section>

      {tab === 'students'
        ? <StudentList  page={page} onPage={setPage} q={debouncedQ} />
        : <EmployeeList page={page} onPage={setPage} q={debouncedQ} />}
    </div>
  )
}

/* ─────────────────────────────────────────────────────────────
   Student list
   ───────────────────────────────────────────────────────────── */
function StudentList({ page, onPage, q }: { page: number; onPage: (p: number) => void; q: string }) {
  const listQ = useQuery({
    queryKey: ['students', page, q],
    queryFn:  () => studentService.list({ page, per_page: PER_PAGE, q: q || undefined }),
    placeholderData: (prev) => prev,
  })

  const rows  = listQ.data?.data?.data ?? []
  // If backend doesn't filter server-side, fall back to client filter.
  const filtered = useMemo(() => {
    if (!q) return rows
    const needle = q.toLowerCase()
    return rows.filter((s) => {
      const hay = [s.fname, s.lname, s.email, s.regnumber, s.phone].filter(Boolean).join(' ').toLowerCase()
      return hay.includes(needle)
    })
  }, [rows, q])

  const total = listQ.data?.data?.total ?? 0
  const last  = listQ.data?.data?.last_page ?? 1

  return (
    <section className="card p-0 overflow-hidden">
      <Header
        title="Student Registry"
        sub={`${total.toLocaleString()} students in CUR`}
        loading={listQ.isLoading}
      />

      {listQ.isLoading ? (
        <Skel />
      ) : listQ.isError ? (
        <Empty label="Failed to load students." />
      ) : filtered.length === 0 ? (
        <Empty label={q ? `No students match "${q}".` : 'No students yet.'} />
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Student</th>
                  <th>Reg / Index</th>
                  <th>Contact</th>
                  <th>Gender</th>
                  <th>Nationality</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((s) => <StudentRow key={s.id} s={s} />)}
              </tbody>
            </table>
          </div>
          <Pager page={page} last={last} onPage={onPage} />
        </>
      )}
    </section>
  )
}

function StudentRow({ s }: { s: Student }) {
  const name     = [s.fname, s.lname].filter(Boolean).join(' ') || '—'
  const initials = name.split(' ').map((p) => p[0]).slice(0, 2).join('').toUpperCase()
  return (
    <tr>
      <td>
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-md bg-brand/10 text-brand dark:bg-brand/25 dark:text-gold-400 flex items-center justify-center font-semibold text-[12px] shrink-0">
            {initials}
          </div>
          <div className="min-w-0">
            <p className="font-semibold text-ink-900 dark:text-ink-100 truncate">{name}</p>
            <p className="text-[11.5px] text-ink-500 truncate">ID #{s.id}</p>
          </div>
        </div>
      </td>
      <td>
        <span className="font-mono text-[12px] text-ink-700 dark:text-ink-200">
          {s.regnumber || s.index_number || s.index_file || '—'}
        </span>
      </td>
      <td>
        <div className="flex flex-col gap-0.5">
          {s.email && <span className="text-[12.5px] flex items-center gap-1 text-ink-700 dark:text-ink-200"><Mail className="w-3 h-3 shrink-0" /> {s.email}</span>}
          {s.phone && <span className="text-[12px] flex items-center gap-1 text-ink-500"><Phone className="w-3 h-3 shrink-0" /> {s.phone}</span>}
          {!s.email && !s.phone && <span className="text-ink-400">—</span>}
        </div>
      </td>
      <td>
        {s.gender
          ? <span className="chip-soft uppercase">{String(s.gender).slice(0, 1)}</span>
          : <span className="text-ink-400">—</span>}
      </td>
      <td>{s.nationality || '—'}</td>
    </tr>
  )
}

/* ─────────────────────────────────────────────────────────────
   Employee list
   ───────────────────────────────────────────────────────────── */
function EmployeeList({ page, onPage, q }: { page: number; onPage: (p: number) => void; q: string }) {
  const listQ = useQuery({
    queryKey: ['employees', page, q],
    queryFn:  () => hrService.listEmployees({ page, per_page: PER_PAGE, q: q || undefined }),
    placeholderData: (prev) => prev,
  })

  const rows  = listQ.data?.data?.data ?? []
  const filtered = useMemo(() => {
    if (!q) return rows
    const needle = q.toLowerCase()
    return rows.filter((e) => {
      const hay = [e.full_name, e.emp_code, e.email, e.position, e.department].filter(Boolean).join(' ').toLowerCase()
      return hay.includes(needle)
    })
  }, [rows, q])
  const total = listQ.data?.data?.total ?? 0
  const last  = listQ.data?.data?.last_page ?? 1

  return (
    <section className="card p-0 overflow-hidden">
      <Header
        title="HR Employees"
        sub={`${total.toLocaleString()} employees on staff`}
        loading={listQ.isLoading}
      />

      {listQ.isLoading ? (
        <Skel />
      ) : listQ.isError ? (
        <Empty label="Failed to load employees." />
      ) : filtered.length === 0 ? (
        <Empty label={q ? `No employees match "${q}".` : 'No employees yet.'} />
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Employee</th>
                  <th>Code</th>
                  <th>Department / Role</th>
                  <th>Contract</th>
                  <th>Contact</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((e) => <EmployeeRow key={e.id} e={e} />)}
              </tbody>
            </table>
          </div>
          <Pager page={page} last={last} onPage={onPage} />
        </>
      )}
    </section>
  )
}

function EmployeeRow({ e }: { e: HrEmployee }) {
  const initials = e.full_name?.split(' ').map((p) => p[0]).slice(0, 2).join('').toUpperCase() || 'E'
  const isActive = (e.status || '').toLowerCase() === 'active'
  return (
    <tr>
      <td>
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-md bg-brand/10 text-brand dark:bg-brand/25 dark:text-gold-400 flex items-center justify-center font-semibold text-[12px] shrink-0">
            {initials}
          </div>
          <div className="min-w-0">
            <p className="font-semibold text-ink-900 dark:text-ink-100 truncate">{e.full_name}</p>
            <p className="text-[11.5px] text-ink-500 truncate">{e.gender === 'M' ? 'Male' : e.gender === 'F' ? 'Female' : '—'}</p>
          </div>
        </div>
      </td>
      <td><span className="font-mono text-[12px]">{e.emp_code}</span></td>
      <td>
        <div>
          <p className="text-[13px] text-ink-800 dark:text-ink-100">{e.department || '—'}</p>
          <p className="text-[11.5px] text-ink-500">{e.position || '—'}</p>
        </div>
      </td>
      <td>
        <div className="flex flex-col gap-0.5">
          <span className="text-[12.5px] text-ink-700 dark:text-ink-200">{e.contract_type || '—'}</span>
          <span className="text-[11px] text-ink-500 flex items-center gap-1">
            <Calendar className="w-3 h-3" />
            {e.start_date || '—'} → {e.end_date || 'open'}
          </span>
        </div>
      </td>
      <td>
        <div className="flex flex-col gap-0.5">
          {e.email && <span className="text-[12.5px] flex items-center gap-1 text-ink-700 dark:text-ink-200"><Mail className="w-3 h-3 shrink-0" /> {e.email}</span>}
          {e.phone && <span className="text-[12px] flex items-center gap-1 text-ink-500"><Phone className="w-3 h-3 shrink-0" /> {e.phone}</span>}
          {!e.email && !e.phone && <span className="text-ink-400">—</span>}
        </div>
      </td>
      <td>
        {isActive
          ? <span className="chip-success"><BadgeCheck className="w-3 h-3" /> Active</span>
          : <span className="chip-soft">{e.status || 'Unknown'}</span>}
      </td>
    </tr>
  )
}

/* ─────────────────────────────────────────────────────────────
   Shared bits
   ───────────────────────────────────────────────────────────── */

function TabButton({ active, icon: Icon, label, onClick }: {
  active:  boolean
  icon:    any
  label:   string
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-[13px] rounded transition-colors ${
        active
          ? 'bg-white dark:bg-ink-800 shadow-sm text-brand font-semibold'
          : 'text-ink-600 dark:text-ink-300 hover:text-ink-900 dark:hover:text-white'
      }`}
    >
      <Icon className="w-3.5 h-3.5" />
      {label}
    </button>
  )
}

function Header({ title, sub, loading }: { title: string; sub: string; loading: boolean }) {
  return (
    <div className="flex items-center justify-between gap-4 px-6 pt-5 pb-3 border-b border-ink-100 dark:border-ink-700">
      <div>
        <h2 className="section-title">{title}</h2>
        <p className="section-sub">{sub}</p>
      </div>
      {loading && <Loader2 className="w-4 h-4 text-ink-400 animate-spin" />}
    </div>
  )
}

function Empty({ label }: { label: string }) {
  return <div className="p-10 text-center text-ink-500 text-[13px]">{label}</div>
}

function Skel() {
  return (
    <div className="p-6 space-y-2">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="h-10 rounded-md bg-ink-50 dark:bg-ink-700/30 animate-pulse" />
      ))}
    </div>
  )
}

function Pager({ page, last, onPage }: { page: number; last: number; onPage: (p: number) => void }) {
  if (last <= 1) return null
  return (
    <div className="flex items-center justify-between px-6 py-3 border-t border-ink-100 dark:border-ink-700 text-[12.5px] text-ink-500">
      <span>Page {page} of {last}</span>
      <div className="flex gap-1">
        <button className="btn-secondary btn-sm" onClick={() => onPage(Math.max(1, page - 1))} disabled={page <= 1}>
          <ArrowLeft className="w-3 h-3" /> Prev
        </button>
        <button className="btn-secondary btn-sm" onClick={() => onPage(Math.min(last, page + 1))} disabled={page >= last}>
          Next <ArrowRight className="w-3 h-3" />
        </button>
      </div>
    </div>
  )
}
