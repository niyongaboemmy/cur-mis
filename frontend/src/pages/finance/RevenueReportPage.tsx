import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Loader2, Download } from 'lucide-react'
import { financeReportService, exportService } from '@/services/financeService'
import { academicService } from '@/services/academicService'
import { FEE_TYPE_LABELS } from '@/types/finance'
import type { RevenueByType } from '@/types/finance'
import SearchableSelect from '@/components/ui/SearchableSelect'
import { formatRWF } from '@/utils/formatCurrency'

export default function RevenueReportPage() {
  const [yearId, setYearId] = useState('')

  const yearsQ = useQuery({
    queryKey: ['academic-years'],
    queryFn: () => academicService.listYears(),
  })
  const years = yearsQ.data?.data ?? []

  const reportQ = useQuery({
    queryKey: ['finance', 'revenue-report', yearId],
    queryFn: () => financeReportService.getRevenueByType(Number(yearId)),
    enabled: !!yearId,
  })
  const rows: RevenueByType[] = reportQ.data?.data ?? []

  const totalExpected  = rows.reduce((s, r) => s + Number(r.total_expected),  0)
  const totalCollected = rows.reduce((s, r) => s + Number(r.total_collected), 0)

  return (
    <div className="space-y-4 animate-fade-in">
      <div>
        <h2 className="text-lg font-bold text-ink-900 dark:text-white">Revenue Report</h2>
        <p className="text-[13px] text-ink-500">Fee collection breakdown by category.</p>
      </div>

      {/* Year filter + Actions */}
      <div className="card p-3 flex gap-3 items-end flex-wrap justify-between">
        <div className="min-w-[200px]">
          <label className="block text-xs text-ink-500 mb-1">Academic Year</label>
          <SearchableSelect
            options={years.map((y: any) => ({ value: y.id, label: y.label }))}
            value={yearId}
            onChange={v => setYearId(String(v))}
            placeholder="Select year…"
          />
        </div>
        
        {yearId && (
          <div className="flex gap-2">
            <button 
              className="btn-ghost btn-sm"
              onClick={() => exportService.downloadCSV('revenue', Number(yearId))}
            >
              <Download className="w-3.5 h-3.5" /> Export Summary CSV
            </button>
            <button 
              className="btn-secondary btn-sm"
              onClick={() => exportService.downloadCSV('payments', Number(yearId))}
            >
              <Download className="w-3.5 h-3.5" /> Export All Payments
            </button>
          </div>
        )}
      </div>

      {reportQ.isLoading && (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-5 h-5 animate-spin text-brand" />
        </div>
      )}

      {!yearId && !reportQ.isLoading && (
        <p className="text-center py-10 text-ink-400 text-sm">Select an academic year to view the report.</p>
      )}

      {yearId && !reportQ.isLoading && rows.length === 0 && (
        <p className="text-center py-10 text-ink-400 text-sm">No revenue data for this year.</p>
      )}

      {rows.length > 0 && (
        <>
          {/* Summary */}
          <div className="grid grid-cols-2 gap-4">
            <div className="card p-4">
              <p className="text-xs text-ink-500 mb-1">Total Expected</p>
              <p className="text-xl font-bold text-ink-700">{formatRWF(totalExpected)}</p>
            </div>
            <div className="card p-4">
              <p className="text-xs text-ink-500 mb-1">Total Collected</p>
              <p className="text-xl font-bold text-green-600">{formatRWF(totalCollected)}</p>
            </div>
          </div>

          {/* Breakdown table */}
          <div className="card overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-ink-50 dark:bg-ink-700/50 text-ink-500 text-xs uppercase">
                <tr>
                  <th className="px-4 py-2.5 text-left">Fee Category</th>
                  <th className="px-4 py-2.5 text-right">Invoices</th>
                  <th className="px-4 py-2.5 text-right">Expected (RWF)</th>
                  <th className="px-4 py-2.5 text-right">Collected (RWF)</th>
                  <th className="px-4 py-2.5 text-right">Bursary (RWF)</th>
                  <th className="px-4 py-2.5 text-right">%</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink-100 dark:divide-ink-700">
                {rows.map((r: RevenueByType) => {
                  const pct = Number(r.total_expected) > 0
                    ? Math.round((Number(r.total_collected) / Number(r.total_expected)) * 100)
                    : 0
                  return (
                    <tr key={r.fee_type} className="hover:bg-ink-50/50 dark:hover:bg-ink-700/30">
                      <td className="px-4 py-2.5 font-medium">{FEE_TYPE_LABELS[r.fee_type]}</td>
                      <td className="px-4 py-2.5 text-right text-ink-500">{r.invoice_count}</td>
                      <td className="px-4 py-2.5 text-right font-mono">{formatRWF(r.total_expected)}</td>
                      <td className="px-4 py-2.5 text-right font-mono font-semibold text-green-600">{formatRWF(r.total_collected)}</td>
                      <td className="px-4 py-2.5 text-right font-mono text-blue-600">{formatRWF(r.total_bursary)}</td>
                      <td className="px-4 py-2.5 text-right">
                        <span className={`font-semibold ${pct >= 80 ? 'text-green-600' : pct >= 50 ? 'text-yellow-600' : 'text-red-500'}`}>
                          {pct}%
                        </span>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
              <tfoot className="bg-ink-50 dark:bg-ink-700/50 font-semibold">
                <tr>
                  <td className="px-4 py-2.5">Total</td>
                  <td className="px-4 py-2.5 text-right text-ink-500">{rows.reduce((s, r) => s + Number(r.invoice_count), 0)}</td>
                  <td className="px-4 py-2.5 text-right font-mono">{formatRWF(totalExpected)}</td>
                  <td className="px-4 py-2.5 text-right font-mono text-green-600">{formatRWF(totalCollected)}</td>
                  <td className="px-4 py-2.5 text-right font-mono text-blue-600">{formatRWF(rows.reduce((s, r) => s + Number(r.total_bursary), 0))}</td>
                  <td className="px-4 py-2.5 text-right">
                    <span className="font-bold">
                      {totalExpected > 0 ? Math.round((totalCollected / totalExpected) * 100) : 0}%
                    </span>
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </>
      )}
    </div>
  )
}
