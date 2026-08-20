import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { BarChart3, FileSpreadsheet } from 'lucide-react'
import { applicationAdminService } from '@/services/admissionService'
import { useLevels } from '@/hooks/useLevels'
import DateRangeFilter from '@/components/ui/DateRangeFilter'

export default function ApplicationStatisticsPage() {
  const { levels } = useLevels()
  const [filters, setFilters] = useState({
    faculty_id:    '',
    department_id: '',
    option_id:     '',
    campus_id:     '',
    level_id:      '',
    mode:          '',
    date_from:     '',
    date_to:       '',
  })

  const statsQ = useQuery({
    queryKey: ['admin', 'applications', 'statistics', filters],
    queryFn: () => applicationAdminService.statistics(toNumberFilters(filters)),
  })

  const rows = statsQ.data?.data?.rows ?? []
  const totals = statsQ.data?.data?.totals ?? null

  const downloadCsv = () => {
    const header = ['Faculty', 'Department', 'Program', 'Total', 'New', 'Accepted', 'Enrolled', 'Withdrawn']
    const body = rows.map((r) => [
      r.faculty ?? '', r.department ?? '', r.program ?? '',
      r.total, r.new_count, r.accepted_count, r.enrolled_count, r.withdrawn_count,
    ])
    const csv = [header, ...body].map((row) => row.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n')
    const blob = new Blob(['﻿', csv], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `applicant-statistics-${new Date().toISOString().slice(0,10)}.csv`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      <header>
        <p className="text-[11px] uppercase tracking-[0.2em] font-bold text-brand mb-1">Admissions</p>
        <h1 className="text-[26px] sm:text-[30px] font-black text-ink-900 dark:text-white tracking-tight leading-tight flex items-center gap-2">
          <BarChart3 className="w-6 h-6 text-brand" />
          Applicant statistics
        </h1>
        <p className="text-[13px] text-ink-500 mt-1">
          New / accepted / enrolled / withdrawn counts per faculty, department and program. Filter by campus, attendance mode, level and date range.
        </p>
      </header>

      <section className="card p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <NumberFilter label="Faculty ID"    value={filters.faculty_id}    onChange={(v) => setFilters({ ...filters, faculty_id: v })} />
        <NumberFilter label="Department ID" value={filters.department_id} onChange={(v) => setFilters({ ...filters, department_id: v })} />
        <NumberFilter label="Program ID"    value={filters.option_id}     onChange={(v) => setFilters({ ...filters, option_id: v })} />
        <NumberFilter label="Campus ID"     value={filters.campus_id}     onChange={(v) => setFilters({ ...filters, campus_id: v })} />
        {/* Chosen by name, still sent as the `levels.id` the API filters on. */}
        <SelectFilter
          label="Level"
          value={filters.level_id}
          onChange={(v) => setFilters({ ...filters, level_id: v })}
          options={levels.map((l) => ({ value: String(l.id), label: l.name }))}
          allLabel="All levels"
        />
        <TextFilter   label="Attendance mode" value={filters.mode}        onChange={(v) => setFilters({ ...filters, mode: v })} placeholder="e.g. Day" />
        {/* Shared control so a range means the same thing here as on the
            applications list — both now range on submitted_at. */}
        <div className="col-span-full">
          <DateRangeFilter
            label="Submitted"
            value={{ from: filters.date_from, to: filters.date_to }}
            onChange={(v) => setFilters({ ...filters, date_from: v.from, date_to: v.to })}
          />
        </div>
      </section>

      <section className="card p-0 overflow-hidden">
        <div className="px-4 py-3 border-b hairline flex items-center justify-between">
          <p className="text-[12.5px] text-ink-500">
            {statsQ.isLoading ? 'Loading…' : `${rows.length} row(s)`}
          </p>
          <button onClick={downloadCsv} disabled={rows.length === 0} className="btn-secondary btn-sm">
            <FileSpreadsheet className="w-3.5 h-3.5" /> Export CSV
          </button>
        </div>
        <div className="overflow-x-auto">
          <table className="data-table">
            <thead>
              <tr>
                <th>Faculty</th>
                <th>Department</th>
                <th>Program</th>
                <th className="text-right">Total</th>
                <th className="text-right">New</th>
                <th className="text-right">Accepted</th>
                <th className="text-right">Enrolled</th>
                <th className="text-right">Withdrawn</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && !statsQ.isLoading ? (
                <tr><td colSpan={8} className="text-center text-ink-500 py-10 italic">No applications match these filters.</td></tr>
              ) : (
                rows.map((r, i) => (
                  <tr key={i}>
                    <td>{r.faculty ?? '—'}</td>
                    <td>{r.department ?? '—'}</td>
                    <td>{r.program ?? '—'}</td>
                    <td className="text-right font-semibold">{r.total}</td>
                    <td className="text-right">{r.new_count}</td>
                    <td className="text-right">{r.accepted_count}</td>
                    <td className="text-right">{r.enrolled_count}</td>
                    <td className="text-right">{r.withdrawn_count}</td>
                  </tr>
                ))
              )}
              {totals && rows.length > 0 && (
                <tr className="font-bold border-t-2 border-ink-200 bg-ink-50/50 dark:bg-ink-800/30">
                  <td colSpan={3} className="text-right">Totals</td>
                  <td className="text-right">{totals.total}</td>
                  <td className="text-right">{totals.new_count}</td>
                  <td className="text-right">{totals.accepted_count}</td>
                  <td className="text-right">{totals.enrolled_count}</td>
                  <td className="text-right">{totals.withdrawn_count}</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  )
}

function toNumberFilters(f: Record<string, string>) {
  const out: Record<string, any> = {}
  for (const [k, v] of Object.entries(f)) {
    if (v === '') continue
    if (['faculty_id','department_id','option_id','campus_id','level_id'].includes(k)) {
      out[k] = Number(v)
    } else {
      out[k] = v
    }
  }
  return out
}

function NumberFilter({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div>
      <label className="label">{label}</label>
      <input type="number" className="input" value={value} onChange={(e) => onChange(e.target.value)} />
    </div>
  )
}

function SelectFilter({ label, value, onChange, options, allLabel }: {
  label: string
  value: string
  onChange: (v: string) => void
  options: Array<{ value: string; label: string }>
  allLabel: string
}) {
  return (
    <div>
      <label className="label">{label}</label>
      <select className="input" value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">{allLabel}</option>
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </div>
  )
}

function TextFilter({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <div>
      <label className="label">{label}</label>
      <input className="input" placeholder={placeholder} value={value} onChange={(e) => onChange(e.target.value)} />
    </div>
  )
}

