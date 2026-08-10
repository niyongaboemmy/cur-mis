import { useEffect, useMemo, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { ArrowLeft, Loader2, Printer, Save, MapPin, Clock, Users } from 'lucide-react'
import {
  teacherService,
  type ExamAttendanceInput,
  type ExamAttendanceStatus,
} from '@/services/teacherService'

const STATUSES: Array<{ value: ExamAttendanceStatus; label: string; cls: string }> = [
  { value: 'present',     label: 'Present',     cls: 'bg-emerald-500 text-white' },
  { value: 'absent',      label: 'Absent',      cls: 'bg-rose-500 text-white' },
  { value: 'excused',     label: 'Excused',     cls: 'bg-amber-500 text-white' },
  { value: 'malpractice', label: 'Malpractice', cls: 'bg-violet-600 text-white' },
]

function hhmm(t?: string | null): string {
  return t ? t.slice(0, 5) : '--:--'
}

const esc = (s: unknown): string =>
  String(s ?? '').replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string))

export default function TeacherExamAttendancePage() {
  const { id } = useParams<{ id: string }>()
  const examId = Number(id)
  const qc = useQueryClient()

  const q = useQuery({
    queryKey: ['teacher', 'examAttendance', examId],
    queryFn:  ({ signal }) => teacherService.examAttendance(examId, signal),
    enabled:  examId > 0,
  })

  const exam     = q.data?.data?.exam
  const students = useMemo(() => q.data?.data?.students ?? [], [q.data])

  /** Local edit buffer: regnumber -> {status, seat_no}. */
  const [draft, setDraft] = useState<Record<string, { status: ExamAttendanceStatus; seat_no: string }>>({})

  // Hydrate the buffer once the sheet arrives, preserving anything already saved.
  useEffect(() => {
    if (!students.length) return
    setDraft(Object.fromEntries(students.map((s) => [
      s.regnumber,
      { status: (s.status ?? 'absent') as ExamAttendanceStatus, seat_no: s.seat_no ?? '' },
    ])))
  }, [students])

  const save = useMutation({
    mutationFn: () => {
      const records: ExamAttendanceInput[] = Object.entries(draft).map(([regnumber, v]) => ({
        regnumber,
        status:  v.status,
        seat_no: v.seat_no.trim() || null,
      }))
      return teacherService.saveExamAttendance(examId, records)
    },
    onSuccess: (r) => {
      toast.success(r?.message ?? 'Exam attendance saved.')
      qc.invalidateQueries({ queryKey: ['teacher', 'examAttendance', examId] })
      qc.invalidateQueries({ queryKey: ['teacher', 'exams'] })
    },
    onError: (e: any) =>
      toast.error(e?.response?.data?.message ?? 'Could not save exam attendance.'),
  })

  const counts = useMemo(() => {
    const c: Record<string, number> = { present: 0, absent: 0, excused: 0, malpractice: 0 }
    Object.values(draft).forEach((v) => { c[v.status] = (c[v.status] ?? 0) + 1 })
    return c
  }, [draft])

  const setStatus = (reg: string, status: ExamAttendanceStatus) =>
    setDraft((d) => ({ ...d, [reg]: { ...(d[reg] ?? { seat_no: '' }), status } }))

  const setSeat = (reg: string, seat_no: string) =>
    setDraft((d) => ({ ...d, [reg]: { ...(d[reg] ?? { status: 'absent' as const }), seat_no } }))

  /** Printable signature sheet — same window.open/document.write/print pattern
   *  the payroll and receipt pages use. */
  const print = () => {
    if (!exam) return
    const rows = students.map((s, i) => `
      <tr>
        <td class="c">${i + 1}</td>
        <td>${esc(s.regnumber)}</td>
        <td>${esc(s.full_name)}</td>
        <td class="c">${esc(draft[s.regnumber]?.seat_no ?? '')}</td>
        <td class="c">${esc((draft[s.regnumber]?.status ?? 'absent').toUpperCase())}</td>
        <td class="sig"></td>
        <td class="sig"></td>
      </tr>`).join('')

    const html = `<!doctype html><html><head><meta charset="utf-8">
      <title>Exam attendance — ${esc(exam.module_code)}</title>
      <style>
        *{box-sizing:border-box} body{font-family:Arial,Helvetica,sans-serif;margin:24px;color:#111}
        h1{font-size:16px;margin:0 0 2px} h2{font-size:13px;margin:0 0 12px;font-weight:normal;color:#444}
        .meta{display:flex;gap:24px;flex-wrap:wrap;font-size:12px;margin-bottom:14px;
              border:1px solid #ccc;padding:8px 12px;border-radius:4px}
        .meta b{display:block;font-size:10px;text-transform:uppercase;letter-spacing:.05em;color:#666}
        table{width:100%;border-collapse:collapse;font-size:11px}
        th,td{border:1px solid #999;padding:5px 6px;text-align:left}
        th{background:#eee;font-size:10px;text-transform:uppercase;letter-spacing:.04em}
        .c{text-align:center} .sig{width:110px}
        tfoot td{border:none;padding-top:24px;font-size:11px}
        @media print{body{margin:10mm}}
      </style></head><body>
      <h1>CATHOLIC UNIVERSITY OF RWANDA</h1>
      <h2>Examination Attendance &amp; Signature Sheet</h2>
      <div class="meta">
        <div><b>Module</b>${esc(exam.module_code)} — ${esc(exam.module_name)}</div>
        <div><b>Component</b>${esc(exam.component)}</div>
        <div><b>Date</b>${esc(exam.exam_date)}</div>
        <div><b>Time</b>${esc(hhmm(exam.start_time))}–${esc(hhmm(exam.end_time))}</div>
        <div><b>Room</b>${esc(exam.room ?? 'Not assigned')}${exam.building ? ' (' + esc(exam.building) + ')' : ''}</div>
        <div><b>Candidates</b>${students.length}</div>
        <div><b>Invigilator</b>${esc(exam.instructor_name ?? '')}</div>
      </div>
      <table>
        <thead><tr>
          <th class="c">#</th><th>Reg number</th><th>Student name</th>
          <th class="c">Seat</th><th class="c">Status</th><th>Sign in</th><th>Sign out</th>
        </tr></thead>
        <tbody>${rows}</tbody>
        <tfoot><tr>
          <td colspan="4">Invigilator signature: ______________________</td>
          <td colspan="3">Date: ______________</td>
        </tr></tfoot>
      </table>
      <script>window.onload=function(){window.print();}</script>
      </body></html>`

    const win = window.open('', '_blank', 'width=980,height=760')
    if (win) { win.document.write(html); win.document.close() }
    else toast.error('Allow pop-ups to print the attendance sheet.')
  }

  if (q.isLoading) {
    return <div className="p-12 text-center"><Loader2 className="w-6 h-6 animate-spin mx-auto text-brand" /></div>
  }
  if (q.isError || !exam) {
    return (
      <div className="card p-8 text-center">
        <p className="text-sm text-rose-500">
          {(q.error as any)?.response?.data?.message ?? 'Could not load this exam.'}
        </p>
        <Link to="/teacher/exams" className="btn-ghost btn-sm mt-3 inline-flex">Back to my exams</Link>
      </div>
    )
  }

  return (
    <div className="space-y-4 animate-fade-in">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="min-w-0">
          <Link to="/teacher/exams" className="text-[12px] text-brand hover:underline flex items-center gap-1 mb-1">
            <ArrowLeft className="w-3 h-3" /> My exams
          </Link>
          <h2 className="text-lg font-bold text-ink-900 dark:text-white">
            {exam.module_code} — {exam.module_name}
          </h2>
          <p className="text-[13px] text-ink-500 flex items-center gap-3 flex-wrap mt-0.5">
            <span className="chip-soft">{exam.component}</span>
            <span className="flex items-center gap-1">
              <Clock className="w-3 h-3" />{exam.exam_date} · {hhmm(exam.start_time)}–{hhmm(exam.end_time)}
            </span>
            <span className="flex items-center gap-1">
              <MapPin className="w-3 h-3" />{exam.room ?? 'No room assigned'}
              {exam.capacity ? ` · seats ${exam.capacity}` : ''}
            </span>
            <span className="flex items-center gap-1"><Users className="w-3 h-3" />{students.length} candidates</span>
          </p>
        </div>
        <div className="flex gap-2 shrink-0">
          <button className="btn-ghost btn-sm" onClick={print}>
            <Printer className="w-3.5 h-3.5" /> Print sheet
          </button>
          <button className="btn-primary btn-sm" onClick={() => save.mutate()} disabled={save.isPending}>
            {save.isPending
              ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
              : <Save className="w-3.5 h-3.5" />} Save attendance
          </button>
        </div>
      </div>

      <div className="grid grid-cols-4 gap-2">
        {STATUSES.map((s) => (
          <div key={s.value} className="card p-3 text-center">
            <p className="text-[10px] uppercase tracking-wider text-ink-400 font-bold">{s.label}</p>
            <p className="text-xl font-bold text-ink-900 dark:text-white leading-none mt-1">
              {counts[s.value] ?? 0}
            </p>
          </div>
        ))}
      </div>

      <div className="card overflow-hidden">
        <table className="w-full text-left text-[13px]">
          <thead>
            <tr className="bg-ink-50 dark:bg-ink-800/50 border-b border-ink-100 dark:border-ink-700">
              {['#', 'Reg number', 'Student', 'Seat', 'Status'].map((h) => (
                <th key={h} className="px-3 py-2.5 font-bold text-ink-400 uppercase tracking-wider text-[10px]">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-ink-100 dark:divide-ink-700">
            {students.length === 0 ? (
              <tr><td colSpan={5} className="p-8 text-center text-ink-400">
                No students registered for this module.
              </td></tr>
            ) : students.map((s, i) => (
              <tr key={s.regnumber} className="hover:bg-ink-50/50 dark:hover:bg-ink-700/20">
                <td className="px-3 py-2 text-ink-400 tabular-nums">{i + 1}</td>
                <td className="px-3 py-2 font-mono text-[12px]">{s.regnumber}</td>
                <td className="px-3 py-2 font-medium text-ink-900 dark:text-white">{s.full_name}</td>
                <td className="px-3 py-2">
                  <input
                    className="input input-sm w-20"
                    placeholder="—"
                    value={draft[s.regnumber]?.seat_no ?? ''}
                    onChange={(e) => setSeat(s.regnumber, e.target.value)}
                  />
                </td>
                <td className="px-3 py-2">
                  <div className="flex gap-1 flex-wrap">
                    {STATUSES.map((st) => {
                      const active = (draft[s.regnumber]?.status ?? 'absent') === st.value
                      return (
                        <button
                          key={st.value}
                          onClick={() => setStatus(s.regnumber, st.value)}
                          className={`px-2 py-1 rounded text-[11px] font-semibold transition-colors ${
                            active ? st.cls : 'bg-ink-100 dark:bg-ink-700 text-ink-500 hover:bg-ink-200 dark:hover:bg-ink-600'
                          }`}
                        >
                          {st.label}
                        </button>
                      )
                    })}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
