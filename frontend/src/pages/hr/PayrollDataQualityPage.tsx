import { useEffect, useState } from 'react'
import { AlertCircle, CheckCircle2, RefreshCw } from 'lucide-react'
import toast from 'react-hot-toast'
import {
  payrollReferenceService,
  type DataQualityReport,
  type IssueSeverity,
} from '@/services/payrollReferenceService'

/** Plain-language labels for each issue code the checker can return. */
const ISSUE_LABELS: Record<string, string> = {
  MISSING_BANK: 'No bank',
  BANK_HOLDS_NUMBER: 'Bank field holds a number',
  BANK_NOT_IN_LIST: 'Bank not in the bank list',
  MISSING_ACCOUNT: 'No account number',
  ACCOUNT_HAS_LETTERS: 'Account number has letters',
  MISSING_RSSB: 'No RSSB number',
  UNKNOWN_EMPLOYMENT_TYPE: 'Employment type unknown',
  MISSING_STAFF_CATEGORY: 'No staff category',
  INVALID_STAFF_CATEGORY: 'Invalid staff category',
  INVALID_SALARY: 'Salary is not a number',
  NEGATIVE_SALARY: 'Negative salary',
  ZERO_SALARY: 'Zero salary',
  SALARY_ABOVE_REVIEW_LEVEL: 'Salary above review level',
  MISSING_INSURANCE_TYPE: 'No insurance type',
  INVALID_INSURANCE_TYPE: 'Invalid insurance type',
  OTHER_INSURANCE_NO_PREMIUM: 'Other insurer with no premium',
}

function SeverityBadge({ severity }: { severity: IssueSeverity }) {
  const isError = severity === 'error'
  return (
    <span
      className={
        isError
          ? 'inline-flex items-center rounded px-1.5 py-0.5 text-[11px] font-semibold bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300'
          : 'inline-flex items-center rounded px-1.5 py-0.5 text-[11px] font-semibold bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300'
      }
    >
      {isError ? 'Blocks payment' : 'Check'}
    </span>
  )
}

function StatCard({ label, value, tone }: { label: string; value: number; tone?: 'ok' | 'bad' }) {
  const color =
    tone === 'bad'
      ? 'text-red-600 dark:text-red-400'
      : tone === 'ok'
        ? 'text-emerald-600 dark:text-emerald-400'
        : 'text-ink-900 dark:text-white'
  return (
    <div className="card p-4">
      <p className="text-[12px] text-ink-500">{label}</p>
      <p className={`text-2xl font-bold mt-1 ${color}`}>{value.toLocaleString()}</p>
    </div>
  )
}

export default function PayrollDataQualityPage() {
  const [report, setReport] = useState<DataQualityReport | null>(null)
  const [loading, setLoading] = useState(false)
  const [reviewAbove, setReviewAbove] = useState('')

  const load = async (threshold?: string) => {
    setLoading(true)
    try {
      const res = await payrollReferenceService.dataQuality(threshold)
      setReport(res.data)
    } catch {
      toast.error('Could not load the data-quality report')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  const flagged = report?.employees ?? []

  return (
    <div className="space-y-4 animate-fade-in">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-lg font-bold text-ink-900 dark:text-white">Payroll data quality</h2>
          <p className="text-[13px] text-ink-500">
            Active staff whose records need attention before payroll. Nothing is changed automatically; fix records in the employee file.
          </p>
        </div>
        <div className="flex items-end gap-2 flex-wrap">
          <label className="text-[12px] text-ink-500">
            Review salaries above (RWF)
            <input
              type="number"
              min={0}
              value={reviewAbove}
              onChange={(e) => setReviewAbove(e.target.value)}
              className="input mt-1 w-44"
              placeholder="Off"
            />
          </label>
          <button
            type="button"
            className="btn-secondary btn-sm gap-1.5"
            onClick={() => load(reviewAbove || undefined)}
            disabled={loading}
          >
            <RefreshCw className="w-3.5 h-3.5" /> Run check
          </button>
        </div>
      </div>

      {report && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <StatCard label="Active employees" value={report.active_employees} />
            <StatCard label="Ready for payroll" value={report.clean_employees} tone="ok" />
            <StatCard
              label="Blocked (must fix)"
              value={report.blocked_employees}
              tone={report.blocked_employees > 0 ? 'bad' : undefined}
            />
            <StatCard label="Need a check" value={flagged.length - report.blocked_employees} />
          </div>

          {flagged.length === 0 ? (
            <div className="card p-6 flex items-center gap-2 text-emerald-700 dark:text-emerald-300">
              <CheckCircle2 className="w-5 h-5" /> Every active employee has complete payroll data.
            </div>
          ) : (
            <div className="card overflow-x-auto">
              <table className="w-full text-[13px]">
                <thead>
                  <tr className="text-left text-ink-500 border-b border-ink-100 dark:border-ink-800">
                    <th className="px-3 py-2 font-semibold">Employee</th>
                    <th className="px-3 py-2 font-semibold">Bank</th>
                    <th className="px-3 py-2 font-semibold">Account</th>
                    <th className="px-3 py-2 font-semibold">Issues</th>
                  </tr>
                </thead>
                <tbody>
                  {flagged.map((emp) => (
                    <tr key={emp.employee_id} className="border-b border-ink-50 dark:border-ink-900 align-top">
                      <td className="px-3 py-2">
                        <div className="font-medium text-ink-900 dark:text-white">{emp.name}</div>
                        <div className="text-[11px] text-ink-400">#{emp.employee_id}</div>
                      </td>
                      <td className="px-3 py-2 text-ink-700 dark:text-ink-300">{emp.bank || '–'}</td>
                      <td className="px-3 py-2 font-mono text-ink-700 dark:text-ink-300">{emp.account || '–'}</td>
                      <td className="px-3 py-2">
                        <ul className="space-y-1">
                          {emp.issues.map((issue, i) => (
                            <li key={`${issue.code}-${i}`} className="flex items-start gap-2">
                              <SeverityBadge severity={issue.severity} />
                              <span className="text-ink-700 dark:text-ink-300">
                                <span className="font-medium">{ISSUE_LABELS[issue.code] ?? issue.code}.</span>{' '}
                                {issue.message}
                              </span>
                            </li>
                          ))}
                        </ul>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {Object.keys(report.issue_counts).length > 0 && (
            <div className="card p-4">
              <p className="text-[12px] font-semibold text-ink-500 mb-2 flex items-center gap-1.5">
                <AlertCircle className="w-3.5 h-3.5" /> Issues by type
              </p>
              <ul className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-1 text-[13px]">
                {Object.entries(report.issue_counts)
                  .sort((a, b) => b[1] - a[1])
                  .map(([code, count]) => (
                    <li key={code} className="flex justify-between gap-3">
                      <span className="text-ink-700 dark:text-ink-300">{ISSUE_LABELS[code] ?? code}</span>
                      <span className="font-semibold text-ink-900 dark:text-white">{count}</span>
                    </li>
                  ))}
              </ul>
            </div>
          )}
        </>
      )}
    </div>
  )
}
