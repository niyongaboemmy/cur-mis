import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Loader2, MapPin, Clock, CalendarDays, ShieldCheck, ChevronRight } from 'lucide-react'
import { teacherService } from '@/services/teacherService'

function hhmm(t?: string | null): string {
  return t ? t.slice(0, 5) : '--:--'
}

export default function TeacherExamsPage() {
  const q = useQuery({
    queryKey: ['teacher', 'exams'],
    queryFn:  ({ signal }) => teacherService.exams(signal),
  })

  const exams = q.data?.data ?? []
  const today = new Date().toISOString().slice(0, 10)

  return (
    <div className="space-y-4 animate-fade-in">
      <div>
        <h2 className="text-lg font-bold text-ink-900 dark:text-white">My Exams</h2>
        <p className="text-[13px] text-ink-500">
          Sittings for the modules you teach, plus any you are assigned to invigilate.
        </p>
      </div>

      {q.isLoading ? (
        <div className="p-12 text-center"><Loader2 className="w-6 h-6 animate-spin mx-auto text-brand" /></div>
      ) : q.isError ? (
        <div className="card p-8 text-center text-rose-500 text-sm">Failed to load your exams.</div>
      ) : exams.length === 0 ? (
        <div className="card p-10 text-center">
          <CalendarDays className="w-7 h-7 mx-auto text-ink-300 mb-2" />
          <p className="text-sm font-semibold text-ink-900 dark:text-white">No exams scheduled</p>
          <p className="text-[13px] text-ink-500 mt-1">
            Exams appear here once they are scheduled for one of your modules.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {exams.map((e) => {
            const past = e.exam_date < today
            return (
              <Link
                key={e.id}
                to={`/teacher/exams/${e.id}`}
                className="card p-4 flex items-center gap-4 hover:shadow-md transition-shadow"
              >
                <div className="shrink-0 text-center w-14">
                  <p className="text-[10px] uppercase tracking-wider text-ink-400 font-bold">
                    {new Date(e.exam_date).toLocaleDateString(undefined, { month: 'short' })}
                  </p>
                  <p className="text-xl font-bold text-ink-900 dark:text-white leading-none">
                    {new Date(e.exam_date).getDate()}
                  </p>
                </div>

                <div className="min-w-0 flex-1">
                  <p className="text-[14px] font-semibold text-ink-900 dark:text-white truncate">
                    {e.module_code} — {e.module_name}
                  </p>
                  <p className="text-[12px] text-ink-500 flex items-center gap-3 flex-wrap mt-0.5">
                    <span className="flex items-center gap-1">
                      <Clock className="w-3 h-3" />{hhmm(e.start_time)}–{hhmm(e.end_time)}
                    </span>
                    <span className="flex items-center gap-1">
                      <MapPin className="w-3 h-3" />{e.room ?? 'No room assigned'}
                      {e.building ? ` (${e.building})` : ''}
                    </span>
                    <span className="chip-soft">{e.component}</span>
                    {e.is_invigilator && (
                      <span className="chip-primary flex items-center gap-1">
                        <ShieldCheck className="w-3 h-3" /> Invigilator
                      </span>
                    )}
                  </p>
                </div>

                <div className="shrink-0 text-right hidden sm:block">
                  {e.marked > 0 ? (
                    <>
                      <p className="text-[11px] uppercase tracking-wider text-ink-400 font-bold">Attendance</p>
                      <p className="text-[13px] font-semibold text-ink-900 dark:text-white">
                        <span className="text-emerald-600 dark:text-emerald-400">{e.present}</span>
                        {' / '}
                        <span className="text-rose-500">{e.absent}</span>
                        <span className="text-ink-400 text-[11px]"> P/A</span>
                      </p>
                    </>
                  ) : (
                    <span className={past ? 'chip-warning' : 'chip-soft'}>
                      {past ? 'Not recorded' : 'Upcoming'}
                    </span>
                  )}
                </div>

                <ChevronRight className="w-4 h-4 text-ink-300 shrink-0" />
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}
