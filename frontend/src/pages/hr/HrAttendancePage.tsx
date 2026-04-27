import { ClipboardCheck, Sparkles } from 'lucide-react'

export default function HrAttendancePage() {
  return (
    <div className="max-w-[900px] mx-auto">
      <section className="card p-10 flex flex-col items-center text-center gap-3">
        <div className="w-14 h-14 rounded-2xl bg-brand/10 text-brand flex items-center justify-center">
          <ClipboardCheck className="w-6 h-6" />
        </div>
        <div>
          <h2 className="section-title">Staff attendance</h2>
          <p className="section-sub mt-1">
            Daily clock-in / clock-out, timesheets, monthly attendance reports and leave tracking
            for all HR staff.
          </p>
        </div>
        <span className="inline-flex items-center gap-1.5 chip-soft">
          <Sparkles className="w-3 h-3" /> Coming soon
        </span>
      </section>
    </div>
  )
}
