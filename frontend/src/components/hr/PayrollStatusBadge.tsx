import type { RunStatus } from '@/services/payrollRunService'

const STYLES: Record<string, string> = {
  DRAFT: 'bg-ink-100 text-ink-700 dark:bg-ink-800 dark:text-ink-300',
  CALCULATED: 'bg-sky-100 text-sky-800 dark:bg-sky-900/40 dark:text-sky-300',
  VERIFIED: 'bg-violet-100 text-violet-800 dark:bg-violet-900/40 dark:text-violet-300',
  APPROVED: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300',
  PAID: 'bg-emerald-600 text-white',
  REQUESTED: 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300',
  DVCA_APPROVED: 'bg-sky-100 text-sky-800 dark:bg-sky-900/40 dark:text-sky-300',
  INVITED: 'bg-violet-100 text-violet-800 dark:bg-violet-900/40 dark:text-violet-300',
  CONTRACTED: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300',
  SENT_TO_PAYROLL: 'bg-emerald-600 text-white',
}

const LABELS: Record<string, string> = {
  DVCA_APPROVED: 'DVCA approved',
  SENT_TO_PAYROLL: 'Sent to payroll',
}

export function PayrollStatusBadge({ status }: { status: RunStatus | string }) {
  return (
    <span className={`inline-flex items-center rounded px-2 py-0.5 text-[11px] font-semibold ${STYLES[status] ?? STYLES.DRAFT}`}>
      {LABELS[status] ?? status.charAt(0) + status.slice(1).toLowerCase()}
    </span>
  )
}

/** Whole RWF with thousands separators. */
export function formatRwf(value: number | string | null | undefined): string {
  const n = Number(value ?? 0)
  return Number.isFinite(n) ? Math.round(n).toLocaleString('en-US') : '–'
}

/** Shows only the last four characters of an account number. */
export function maskAccount(account: string | null | undefined): string {
  if (!account) return '–'
  return '•••• ' + account.slice(-4)
}
