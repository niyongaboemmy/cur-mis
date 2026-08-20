import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Loader2, Download, TrendingUp, Target, BadgeDollarSign, AlertCircle, GitMerge } from 'lucide-react'
import { financeReportService, exportService } from '@/services/financeService'
import { academicService } from '@/services/academicService'
import { FEE_TYPE_LABELS } from '@/types/finance'
import type { RevenueByType } from '@/types/finance'
import SearchableSelect from '@/components/ui/SearchableSelect'
import { formatRWF } from '@/utils/formatCurrency'
import { useSystemStore } from '@/store/systemStore'
import {
  FinanceBarChart,
  FinanceDonut,
  RadialProgress,
  CHART_COLORS,
  PIE_COLORS,
} from '@/components/finance/FinanceCharts'

export default function RevenueReportPage() {
  const basics = useSystemStore((s) => s.basics)
  const selectedYearLabel = useSystemStore((s) => s.selectedYearLabel)

  const [yearId, setYearId] = useState<string>(() => {
    if (selectedYearLabel) {
      const y = basics?.years?.find((y: any) => y.label === selectedYearLabel)
      if (y) return String((y as any).id)
    }
    const active = basics?.active_year as any
    return active?.id ? String(active.id) : ''
  })

  const yearsQ = useQuery({ queryKey: ['academic-years'], queryFn: () => academicService.listYears() })
  const years  = yearsQ.data?.data ?? []

  const reportQ = useQuery({
    queryKey: ['finance', 'revenue-report', yearId],
    queryFn: () => financeReportService.getRevenueByType(Number(yearId)),
    enabled:  !!yearId,
  })
  const rows: RevenueByType[] = reportQ.data?.data ?? []

  // Aggregates
  const totalExpected     = rows.reduce((s, r) => s + Number(r.total_expected),      0)
  const totalCollected    = rows.reduce((s, r) => s + Number(r.total_collected),     0)
  const totalBursary      = rows.reduce((s, r) => s + Number(r.total_bursary),       0)
  const totalInvoices     = rows.reduce((s, r) => s + Number(r.invoice_count),       0)
  const totalAppTransfer  = rows.reduce((s, r) => s + Number(r.app_transfer_amount), 0)
  const totalAppTxCount   = rows.reduce((s, r) => s + Number(r.app_transfer_count),  0)
  const gap               = totalExpected - totalCollected - totalBursary
  const collectionRate    = totalExpected > 0 ? Math.round((totalCollected / totalExpected) * 100) : 0

  // Chart data
  const barData = rows.map(r => ({
    label:     FEE_TYPE_LABELS[r.fee_type],
    Expected:  Number(r.total_expected),
    Collected: Number(r.total_collected),
    Bursary:   Number(r.total_bursary),
  }))

  const donutData = rows
    .filter(r => Number(r.total_collected) + Number(r.total_bursary) > 0)
    .map((r, i) => ({
      name:  FEE_TYPE_LABELS[r.fee_type],
      value: Number(r.total_collected) + Number(r.total_bursary),
      color: PIE_COLORS[i % PIE_COLORS.length],
    }))

  // Top 4 categories by expected for radial rings
  const topRows = [...rows]
    .sort((a, b) => Number(b.total_expected) - Number(a.total_expected))
    .slice(0, 4)

  const ringColors = [CHART_COLORS.brand, CHART_COLORS.green, CHART_COLORS.orange, CHART_COLORS.teal]

  const kpis = [
    {
      label: 'Total Expected',
      value: formatRWF(totalExpected),
      sub:   `${totalInvoices} invoices`,
      icon:  <Target className="w-4 h-4" />,
      color: 'text-ink-700 dark:text-white',
      bg:    'bg-ink-100 dark:bg-ink-700',
    },
    {
      label: 'Collected',
      value: formatRWF(totalCollected),
      sub:   `${collectionRate}% of expected`,
      icon:  <TrendingUp className="w-4 h-4" />,
      color: 'text-green-600',
      bg:    'bg-green-100 dark:bg-green-900/30',
    },
    {
      label: 'App Fee Transfers',
      value: formatRWF(totalAppTransfer),
      sub:   `${totalAppTxCount} application${totalAppTxCount !== 1 ? 's' : ''} credited`,
      icon:  <GitMerge className="w-4 h-4" />,
      color: 'text-violet-600',
      bg:    'bg-violet-100 dark:bg-violet-900/30',
    },
    {
      label: 'Bursary Applied',
      value: formatRWF(totalBursary),
      sub:   'scholarship/grant credits',
      icon:  <BadgeDollarSign className="w-4 h-4" />,
      color: 'text-blue-600',
      bg:    'bg-blue-100 dark:bg-blue-900/30',
    },
    {
      label: 'Outstanding Gap',
      value: formatRWF(Math.max(gap, 0)),
      sub:   gap > 0 ? 'remaining to collect' : 'fully covered',
      icon:  <AlertCircle className="w-4 h-4" />,
      color: gap > 0 ? 'text-red-600' : 'text-green-600',
      bg:    gap > 0 ? 'bg-red-100 dark:bg-red-900/30' : 'bg-green-100 dark:bg-green-900/30',
    },
  ]

  return (
    <div className="space-y-5 animate-fade-in">
      {/* Header */}
      <div>
        <h2 className="text-lg font-bold text-ink-900 dark:text-white">Revenue Report</h2>
        <p className="text-[13px] text-ink-500">Fee collection breakdown by category — expected vs. collected.</p>
      </div>

      {/* Filters + Actions */}
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
            <button className="btn-ghost btn-sm" onClick={() => exportService.downloadCSV('revenue', Number(yearId))}>
              <Download className="w-3.5 h-3.5" /> Export Summary
            </button>
            <button className="btn-secondary btn-sm" onClick={() => exportService.downloadCSV('payments', Number(yearId))}>
              <Download className="w-3.5 h-3.5" /> Export Payments
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
          {/* KPI Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
            {kpis.map(k => (
              <div key={k.label} className="card p-4">
                <div className="flex items-start justify-between mb-2">
                  <p className="text-xs text-ink-500">{k.label}</p>
                  <div className={`w-7 h-7 rounded-lg ${k.bg} flex items-center justify-center ${k.color}`}>{k.icon}</div>
                </div>
                <p className={`text-xl font-bold ${k.color}`}>{k.value}</p>
                {k.sub && <p className="text-xs text-ink-400 mt-1">{k.sub}</p>}
              </div>
            ))}
          </div>

          {/* Overall collection progress */}
          <div className="card p-4 space-y-2">
            <div className="flex justify-between text-sm">
              <span className="font-medium text-ink-700 dark:text-white">Overall Collection Rate</span>
              <span className={`font-bold ${collectionRate >= 80 ? 'text-green-600' : collectionRate >= 50 ? 'text-yellow-600' : 'text-red-500'}`}>
                {collectionRate}%
              </span>
            </div>
            <div className="h-2.5 bg-ink-200 dark:bg-ink-700 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-700 ${
                  collectionRate >= 80 ? 'bg-green-500' : collectionRate >= 50 ? 'bg-yellow-500' : 'bg-red-500'
                }`}
                style={{ width: `${Math.min(collectionRate, 100)}%` }}
              />
            </div>
            <div className="flex justify-between text-xs text-ink-400">
              <span>Collected: {formatRWF(totalCollected)}</span>
              <span>Target: {formatRWF(totalExpected)}</span>
            </div>
          </div>

          {/* Charts row */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {/* Bar chart — Expected vs Collected */}
            <div className="card p-4 lg:col-span-2">
              <p className="text-sm font-semibold text-ink-700 dark:text-white mb-3">Expected vs. Collected by Fee Type</p>
              <FinanceBarChart
                data={barData}
                xKey="label"
                series={[
                  { key: 'Expected',  label: 'Expected',  color: CHART_COLORS.blue   },
                  { key: 'Collected', label: 'Collected', color: CHART_COLORS.green  },
                  { key: 'Bursary',   label: 'Bursary',   color: CHART_COLORS.violet },
                ]}
                height={240}
              />
            </div>

            {/* Donut — collection mix */}
            <div className="card p-4">
              <p className="text-sm font-semibold text-ink-700 dark:text-white mb-1">Collection Mix</p>
              <p className="text-xs text-ink-400 mb-2">Share of revenue by fee type</p>
              <FinanceDonut
                data={donutData}
                height={220}
                innerLabel={formatRWF(totalCollected + totalBursary).replace(' RWF', '')}
                innerSub="total settled"
              />
            </div>
          </div>

          {/* Per-category collection rate rings */}
          {topRows.length > 0 && (
            <div className="card p-4">
              <p className="text-sm font-semibold text-ink-700 dark:text-white mb-4">Collection Rate by Category</p>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-6 justify-items-center">
                {topRows.map((r, i) => {
                  const pct = Number(r.total_expected) > 0
                    ? Math.round((Number(r.total_collected) / Number(r.total_expected)) * 100)
                    : 0
                  return (
                    <div key={r.fee_type} className="flex flex-col items-center gap-2">
                      <RadialProgress pct={pct} color={ringColors[i]} size={90} label={`${pct}%`} sub={FEE_TYPE_LABELS[r.fee_type]} />
                      <div className="text-center">
                        <p className="text-xs font-medium text-ink-600 dark:text-ink-300">{FEE_TYPE_LABELS[r.fee_type]}</p>
                        <p className="text-[11px] text-ink-400">{formatRWF(Number(r.total_collected))} / {formatRWF(Number(r.total_expected))}</p>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* Detailed table */}
          <div className="card overflow-hidden">
            <div className="px-4 py-3 border-b border-ink-100 dark:border-ink-700">
              <p className="font-semibold text-sm text-ink-700 dark:text-white">Detailed Breakdown</p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-ink-50 dark:bg-ink-700/50 text-ink-500 text-xs uppercase">
                  <tr>
                    <th className="px-4 py-2.5 text-left">Fee Category</th>
                    <th className="px-4 py-2.5 text-right">Invoices</th>
                    <th className="px-4 py-2.5 text-right">Expected (RWF)</th>
                    <th className="px-4 py-2.5 text-right">Collected (RWF)</th>
                    <th className="px-4 py-2.5 text-right">App Fee Transfer</th>
                    <th className="px-4 py-2.5 text-right">Bursary (RWF)</th>
                    <th className="px-4 py-2.5 text-left min-w-[140px]">Progress</th>
                    <th className="px-4 py-2.5 text-right">Rate</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-ink-100 dark:divide-ink-700">
                  {rows.map((r) => {
                    const pct = Number(r.total_expected) > 0
                      ? Math.round((Number(r.total_collected) / Number(r.total_expected)) * 100)
                      : 0
                    const appAmt = Number(r.app_transfer_amount)
                    const appCnt = Number(r.app_transfer_count)
                    return (
                      <tr key={r.fee_type} className="hover:bg-ink-50/50 dark:hover:bg-ink-700/30">
                        <td className="px-4 py-3 font-medium text-ink-800 dark:text-ink-100">{FEE_TYPE_LABELS[r.fee_type]}</td>
                        <td className="px-4 py-3 text-right text-ink-500">{r.invoice_count}</td>
                        <td className="px-4 py-3 text-right font-mono">{formatRWF(Number(r.total_expected))}</td>
                        <td className="px-4 py-3 text-right font-mono font-semibold text-green-600">{formatRWF(Number(r.total_collected))}</td>
                        <td className="px-4 py-3 text-right">
                          {appAmt > 0 ? (
                            <span className="inline-flex flex-col items-end gap-0.5">
                              <span className="font-mono text-violet-600 dark:text-violet-400 font-semibold text-xs">
                                {formatRWF(appAmt)}
                              </span>
                              <span className="text-[10px] text-ink-400">{appCnt} transfer{appCnt !== 1 ? 's' : ''}</span>
                            </span>
                          ) : (
                            <span className="text-ink-300 dark:text-ink-600 text-xs">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right font-mono text-blue-600">{formatRWF(Number(r.total_bursary))}</td>
                        <td className="px-4 py-3">
                          <div className="h-1.5 bg-ink-200 dark:bg-ink-600 rounded-full overflow-hidden w-full">
                            <div
                              className={`h-full rounded-full ${pct >= 80 ? 'bg-green-500' : pct >= 50 ? 'bg-yellow-500' : 'bg-red-500'}`}
                              style={{ width: `${Math.min(pct, 100)}%` }}
                            />
                          </div>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold ${
                            pct >= 80 ? 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-400' :
                            pct >= 50 ? 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-400' :
                            'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-400'
                          }`}>
                            {pct}%
                          </span>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
                <tfoot className="bg-ink-50 dark:bg-ink-700/50 font-semibold text-sm">
                  <tr>
                    <td className="px-4 py-2.5 text-ink-700 dark:text-white">Total</td>
                    <td className="px-4 py-2.5 text-right text-ink-500">{totalInvoices}</td>
                    <td className="px-4 py-2.5 text-right font-mono">{formatRWF(totalExpected)}</td>
                    <td className="px-4 py-2.5 text-right font-mono text-green-600">{formatRWF(totalCollected)}</td>
                    <td className="px-4 py-2.5 text-right font-mono text-violet-600">
                      {totalAppTransfer > 0 ? formatRWF(totalAppTransfer) : '—'}
                    </td>
                    <td className="px-4 py-2.5 text-right font-mono text-blue-600">{formatRWF(totalBursary)}</td>
                    <td className="px-4 py-2.5" />
                    <td className="px-4 py-2.5 text-right">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-bold ${
                        collectionRate >= 80 ? 'bg-green-100 text-green-700' :
                        collectionRate >= 50 ? 'bg-yellow-100 text-yellow-700' :
                        'bg-red-100 text-red-700'
                      }`}>
                        {collectionRate}%
                      </span>
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
