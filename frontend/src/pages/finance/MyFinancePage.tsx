import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  Loader2,
  AlertCircle,
  ShieldCheck,
  ShieldX,
  RefreshCw,
} from 'lucide-react'
import { myLedgerService } from '@/services/financeService'
import { useSystemStore } from '@/store/systemStore'
import InvoiceStatusBadge from '@/components/finance/InvoiceStatusBadge'
import {
  FEE_TYPE_LABELS,
  CLEARANCE_STATUS_LABELS,
  CLEARANCE_STATUS_COLORS,
} from '@/types/finance'
import { formatRWF } from '@/utils/formatCurrency'
import type { FeeInvoice, LedgerTotals, ClearanceResult } from '@/types/finance'

type Semester = '' | '1' | '2'

export default function MyFinancePage() {
  const basics           = useSystemStore((s) => s.basics)
  const selectedYearLabel = useSystemStore((s) => s.selectedYearLabel)

  const resolveYearId = (label: string): number | string => {
    if (label) {
      const found = basics?.years?.find((y: any) => y.label === label)
      if (found) return found.id
    }
    return (basics?.active_year as any)?.id ?? ''
  }

  const [yearId, setYearId]     = useState<number | string>(() => resolveYearId(selectedYearLabel))
  const [semester, setSemester] = useState<Semester>('')

  useEffect(() => {
    setYearId(resolveYearId(selectedYearLabel))
  }, [selectedYearLabel, basics?.years])

  const ledgerQ = useQuery({
    queryKey: ['my-finance', 'ledger', yearId, semester],
    queryFn: (ctx) =>
      myLedgerService.getMyLedger(
        {
          ...(yearId ? { academic_year_id: Number(yearId) } : {}),
          ...(semester ? { semester: Number(semester) as 1 | 2 } : {}),
        },
        ctx.signal,
      ),
    enabled: !!yearId,
  })

  const clearanceQ = useQuery({
    queryKey: ['my-finance', 'clearance', yearId, semester],
    queryFn: (ctx) =>
      myLedgerService.getMyClearance(
        Number(yearId),
        semester ? (Number(semester) as 1 | 2) : null,
        ctx.signal,
      ),
    enabled: !!yearId,
  })

  const invoices: FeeInvoice[]        = ledgerQ.data?.data?.invoices ?? []
  const totals: LedgerTotals | undefined = ledgerQ.data?.data?.totals
  const clearance: ClearanceResult | undefined = clearanceQ.data?.data ?? undefined

  const balance = totals?.balance ?? 0

  return (
    <div className="flex flex-col gap-5 p-4 md:p-6 max-w-6xl mx-auto">

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-ink-900 dark:text-white">My Finance</h1>
          <p className="text-[13px] text-ink-400 mt-0.5">Your invoices and payment status</p>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={semester}
            onChange={(e) => setSemester(e.target.value as Semester)}
            className="input input-sm w-44"
          >
            <option value="">All Semesters</option>
            <option value="1">Semester 1</option>
            <option value="2">Semester 2</option>
          </select>
        </div>
      </div>

      {/* No year selected */}
      {!yearId && (
        <div className="card p-6 text-center text-ink-400 text-[13px]">
          Select an academic year using the selector at the top of the page.
        </div>
      )}

      {yearId && (
        <>
          {/* Error */}
          {ledgerQ.isError && (
            <div className="card p-5 flex items-center gap-3 text-red-600 dark:text-red-400">
              <AlertCircle className="shrink-0" size={20} />
              <div className="flex-1 text-[13px]">
                {(ledgerQ.error as any)?.response?.data?.message ?? 'Failed to load finance data.'}
              </div>
              <button
                onClick={() => ledgerQ.refetch()}
                className="btn btn-sm flex items-center gap-1.5"
              >
                <RefreshCw size={13} />
                Retry
              </button>
            </div>
          )}

          {/* Summary cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <SumCard
              label="Total Due"
              value={formatRWF(totals?.total_due ?? 0)}
              loading={ledgerQ.isLoading}
            />
            <SumCard
              label="Amount Paid"
              value={formatRWF(totals?.total_paid ?? 0)}
              loading={ledgerQ.isLoading}
              colorClass="text-green-600 dark:text-green-400"
            />
            <SumCard
              label="Bursary Applied"
              value={formatRWF(totals?.total_bursary ?? 0)}
              loading={ledgerQ.isLoading}
              colorClass="text-blue-600 dark:text-blue-400"
            />
            <SumCard
              label="Outstanding Balance"
              value={formatRWF(balance)}
              loading={ledgerQ.isLoading}
              colorClass={balance > 0 ? 'text-red-600 dark:text-red-400' : 'text-green-600 dark:text-green-400'}
            />
          </div>

          {/* Clearance status */}
          {clearance && (
            <div className="card p-4 flex items-center gap-3">
              {clearance.status === 'cleared' ? (
                <ShieldCheck size={20} className="text-green-600 dark:text-green-400 shrink-0" />
              ) : (
                <ShieldX size={20} className="text-red-500 dark:text-red-400 shrink-0" />
              )}
              <span className="text-[13px] font-medium text-ink-900 dark:text-white">Financial Clearance</span>
              <span className={`ml-auto text-[11px] font-bold px-2.5 py-1 rounded-full ${CLEARANCE_STATUS_COLORS[clearance.status]}`}>
                {CLEARANCE_STATUS_LABELS[clearance.status]}
              </span>
            </div>
          )}
          {clearanceQ.isLoading && (
            <div className="card p-4 flex items-center gap-2 text-ink-400 text-[13px]">
              <Loader2 size={14} className="animate-spin" />
              Checking clearance status…
            </div>
          )}

          {/* Invoice table */}
          <div className="card overflow-hidden">
            <div className="px-4 py-3 border-b border-ink-100 dark:border-ink-800">
              <h2 className="text-[13px] font-bold text-ink-900 dark:text-white">
                Invoices
                {invoices.length > 0 && (
                  <span className="ml-2 text-[11px] font-normal text-ink-400">{invoices.length} record{invoices.length !== 1 ? 's' : ''}</span>
                )}
              </h2>
            </div>

            {ledgerQ.isLoading ? (
              <div className="flex items-center justify-center gap-2 py-12 text-ink-400 text-[13px]">
                <Loader2 size={16} className="animate-spin" />
                Loading invoices…
              </div>
            ) : invoices.length === 0 ? (
              <div className="py-12 text-center text-ink-400 text-[13px]">
                No invoices found for this period.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-[13px]">
                  <thead>
                    <tr className="border-b border-ink-100 dark:border-ink-800">
                      {['Invoice #', 'Date', 'Fee Type', 'Description', 'Due', 'Paid', 'Bursary', 'Status'].map((h) => (
                        <th
                          key={h}
                          className="px-4 py-2.5 text-left text-[10px] uppercase font-bold text-ink-400 whitespace-nowrap"
                        >
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-ink-50 dark:divide-ink-800">
                    {invoices.map((inv) => (
                      <tr key={inv.id} className="hover:bg-ink-50/50 dark:hover:bg-ink-800/30">
                        <td className="px-4 py-2.5 font-mono text-[12px] text-ink-600 dark:text-ink-300 whitespace-nowrap">
                          {inv.invoice_number}
                        </td>
                        <td className="px-4 py-2.5 text-ink-500 dark:text-ink-400 whitespace-nowrap">
                          {new Date(inv.created_at).toLocaleDateString('en-GB')}
                        </td>
                        <td className="px-4 py-2.5 text-ink-700 dark:text-ink-300 whitespace-nowrap">
                          {FEE_TYPE_LABELS[inv.fee_type] ?? inv.fee_type}
                        </td>
                        <td className="px-4 py-2.5 text-ink-700 dark:text-ink-300 max-w-[200px] truncate">
                          {inv.description}
                        </td>
                        <td className="px-4 py-2.5 text-right text-ink-900 dark:text-white font-medium whitespace-nowrap">
                          {formatRWF(inv.amount_due)}
                        </td>
                        <td className="px-4 py-2.5 text-right text-green-600 dark:text-green-400 whitespace-nowrap">
                          {formatRWF(inv.amount_paid)}
                        </td>
                        <td className="px-4 py-2.5 text-right text-blue-600 dark:text-blue-400 whitespace-nowrap">
                          {formatRWF(inv.bursary_applied)}
                        </td>
                        <td className="px-4 py-2.5 whitespace-nowrap">
                          <InvoiceStatusBadge status={inv.status} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}

function SumCard({
  label,
  value,
  loading,
  colorClass = 'text-ink-900 dark:text-white',
}: {
  label: string
  value: string
  loading: boolean
  colorClass?: string
}) {
  return (
    <div className="card p-4">
      <p className="text-[11px] uppercase font-bold text-ink-400 mb-1">{label}</p>
      {loading ? (
        <Loader2 size={16} className="animate-spin text-ink-300 mt-1" />
      ) : (
        <p className={`text-[15px] font-bold ${colorClass}`}>{value}</p>
      )}
    </div>
  )
}
