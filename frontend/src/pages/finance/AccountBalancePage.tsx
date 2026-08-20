import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Loader2, TrendingUp, TrendingDown, Wallet, BarChart3, PieChart } from 'lucide-react'
import { balanceService, financeReportService } from '@/services/financeService'
import { academicService } from '@/services/academicService'
import SearchableSelect from '@/components/ui/SearchableSelect'
import { useSystemStore } from '@/store/systemStore'
import { formatRWF } from '@/utils/formatCurrency'
import {
  FinanceBarChart,
  FinanceDonut,
  RadialProgress,
  CHART_COLORS,
  PIE_COLORS,
} from '@/components/finance/FinanceCharts'

export default function AccountBalancePage() {
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

  const yearsQ  = useQuery({ queryKey: ['academic-years'], queryFn: () => academicService.listYears() })
  const years   = yearsQ.data?.data ?? []

  const balQ = useQuery({
    queryKey: ['finance', 'balance', yearId],
    queryFn:  () => balanceService.get(Number(yearId)),
    enabled:  !!yearId,
  })
  const b = balQ.data?.data

  // Monthly data for income vs expenses bar chart
  const monthlyQ = useQuery({
    queryKey: ['finance', 'monthly', yearId],
    queryFn:  () => financeReportService.getMonthlyCollections(Number(yearId)),
    enabled:  !!yearId,
  })
  const monthly = monthlyQ.data?.data ?? []

  // Chart helpers
  const collectionRateRaw = b && b.expected_revenue > 0
    ? (b.collected_revenue / b.expected_revenue) * 100
    : 0
  const collectionRate    = Math.round(collectionRateRaw)
  const collectionRatePct = collectionRateRaw > 0 ? Math.max(0.5, Math.min(100, collectionRateRaw)) : 0
  const collectionRateLbl = collectionRateRaw > 0 && collectionRateRaw < 0.5 ? '<1%' : `${collectionRate}%`

  const expenseRateRaw = b && b.total_budget > 0
    ? (b.total_expenses / b.total_budget) * 100
    : 0
  const expenseRate    = Math.round(expenseRateRaw)
  const expenseRatePct = expenseRateRaw > 0 ? Math.max(0.5, Math.min(100, expenseRateRaw)) : 0
  const expenseRateLbl = expenseRateRaw > 0 && expenseRateRaw < 0.5 ? '<1%' : `${expenseRate}%`

  const monthlyBarData = monthly.map((m: any) => ({
    label:    m.month,
    Income:   m.collected,
    Expenses: m.expenses,
  }))

  const budgetDonutData = b?.budgets
    ?.filter((bud: any) => bud.amount > 0)
    ?.map((bud: any, i: number) => ({
      name:  bud.category_name ?? `Category ${i + 1}`,
      value: Number(bud.amount),
      color: PIE_COLORS[i % PIE_COLORS.length],
    })) ?? []


  return (
    <div className="space-y-5 animate-fade-in">
      {/* Header */}
      <div>
        <h2 className="text-lg font-bold text-ink-900 dark:text-white">Account Balance</h2>
        <p className="text-[13px] text-ink-500">Financial position — income collected vs. expenses incurred.</p>
      </div>

      {/* Year filter */}
      <div className="card p-3 flex gap-3 items-end">
        <div className="min-w-[200px]">
          <label className="block text-xs text-ink-500 mb-1">Academic Year</label>
          <SearchableSelect
            options={years.map((y: any) => ({ value: y.id, label: y.label }))}
            value={yearId}
            onChange={v => setYearId(String(v))}
            placeholder="Select year…"
          />
        </div>
      </div>

      {!yearId && (
        <div className="card p-12 text-center text-ink-400">
          <BarChart3 className="w-10 h-10 mx-auto mb-3 opacity-30" />
          <p className="text-sm">Select an academic year to view the account balance.</p>
        </div>
      )}

      {balQ.isLoading && (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-5 h-5 animate-spin text-brand" />
        </div>
      )}

      {b && (
        <>
          {/* KPI + Health Indicators — merged */}
          {(() => {
            const coverageRaw = b.collected_revenue > 0
              ? Math.min((b.collected_revenue / Math.max(b.total_expenses, 1)) * 100, 200) : 0
            const coverageRnd = Math.round(coverageRaw)
            const coveragePct = coverageRaw > 0 ? Math.max(0.5, Math.min(100, coverageRaw)) : 0
            const coverageLbl = coverageRaw > 0 && coverageRaw < 0.5 ? '<1%' : `${coverageRnd}%`

            const totalSettled = b.collected_revenue + b.bursary_revenue
            const bursaryRaw   = totalSettled > 0 ? (b.bursary_revenue / totalSettled) * 100 : 0
            const bursaryRnd   = Math.round(bursaryRaw)
            const bursaryPct   = bursaryRaw > 0 ? Math.max(0.5, Math.min(100, bursaryRaw)) : 0
            const bursaryLbl   = bursaryRaw > 0 && bursaryRaw < 0.5 ? '<1%' : `${bursaryRnd}%`

            const cols = [
              {
                label:    'Expected Revenue',
                value:    formatRWF(b.expected_revenue),
                sub:      'invoiced this year',
                icon:     <BarChart3 className="w-4 h-4" />,
                valColor: 'text-ink-700 dark:text-white',
                bg:       'bg-ink-100 dark:bg-ink-700',
                iconCls:  'text-ink-700 dark:text-white',
                ringPct:  collectionRatePct,
                ringColor: collectionRateRaw >= 80 ? CHART_COLORS.green : collectionRateRaw >= 50 ? CHART_COLORS.yellow : CHART_COLORS.red,
                ringLbl:  collectionRateLbl,
                ringSub:  'collected',
                ringInfo: `Collection Rate · ${formatRWF(b.collected_revenue)} / ${formatRWF(b.expected_revenue)}`,
              },
              {
                label:    'Collected',
                value:    formatRWF(b.collected_revenue),
                sub:      `${collectionRateLbl} collection rate`,
                icon:     <TrendingUp className="w-4 h-4" />,
                valColor: 'text-green-600',
                bg:       'bg-green-100 dark:bg-green-900/30',
                iconCls:  'text-green-600',
                ringPct:  expenseRatePct,
                ringColor: expenseRateRaw >= 90 ? CHART_COLORS.red : expenseRateRaw >= 70 ? CHART_COLORS.orange : CHART_COLORS.brand,
                ringLbl:  expenseRateLbl,
                ringSub:  'of budget',
                ringInfo: `Budget Utilization · ${formatRWF(b.total_expenses)} / ${formatRWF(b.total_budget)}`,
              },
              {
                label:    'Total Expenses',
                value:    formatRWF(b.total_expenses),
                sub:      `Budget: ${formatRWF(b.total_budget)}`,
                icon:     <TrendingDown className="w-4 h-4" />,
                valColor: 'text-red-600',
                bg:       'bg-red-100 dark:bg-red-900/30',
                iconCls:  'text-red-600',
                ringPct:  coveragePct,
                ringColor: coverageRaw >= 100 ? CHART_COLORS.green : CHART_COLORS.red,
                ringLbl:  coverageLbl,
                ringSub:  'coverage',
                ringInfo: `Expense Coverage · income covers ${coverageLbl} of expenses`,
              },
              {
                label:    'Net Balance',
                value:    formatRWF(b.net_balance),
                sub:      'Collected − Expenses',
                icon:     <Wallet className="w-4 h-4" />,
                valColor: b.net_balance >= 0 ? 'text-green-600' : 'text-red-600',
                bg:       b.net_balance >= 0 ? 'bg-green-100 dark:bg-green-900/30' : 'bg-red-100 dark:bg-red-900/30',
                iconCls:  b.net_balance >= 0 ? 'text-green-600' : 'text-red-600',
                ringPct:  bursaryPct,
                ringColor: CHART_COLORS.violet,
                ringLbl:  bursaryLbl,
                ringSub:  'bursary',
                ringInfo: `Bursary Share · ${formatRWF(b.bursary_revenue)} of total`,
              },
            ]

            return (
              <div className="card overflow-hidden">
                <div className="grid grid-cols-2 sm:grid-cols-4 divide-x divide-ink-100 dark:divide-ink-700">
                  {cols.map((c, i) => (
                    <div key={i} className="p-4 flex flex-col gap-4">
                      {/* KPI */}
                      <div>
                        <div className="flex items-start justify-between mb-2">
                          <p className="text-xs text-ink-500">{c.label}</p>
                          <div className={`w-7 h-7 rounded-lg ${c.bg} flex items-center justify-center ${c.iconCls}`}>{c.icon}</div>
                        </div>
                        <p className={`text-xl font-bold ${c.valColor}`}>{c.value}</p>
                        <p className="text-xs text-ink-400 mt-0.5">{c.sub}</p>
                      </div>
                      {/* Divider */}
                      <div className="border-t border-ink-100 dark:border-ink-700" />
                      {/* Ring */}
                      <div className="flex flex-col items-center gap-2">
                        <RadialProgress pct={c.ringPct} color={c.ringColor} size={88} label={c.ringLbl} sub={c.ringSub} />
                        <p className="text-[11px] text-center text-ink-400 leading-snug">{c.ringInfo}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )
          })()}

          {/* Income vs Expenses monthly chart */}
          {monthlyBarData.length > 0 && (
            <div className="card p-4">
              <p className="text-sm font-semibold text-ink-700 dark:text-white mb-1">Monthly Income vs. Expenses</p>
              <p className="text-xs text-ink-400 mb-3">Collected revenue compared to operating expenses by month</p>
              <FinanceBarChart
                data={monthlyBarData}
                xKey="label"
                series={[
                  { key: 'Income',   label: 'Income',   color: CHART_COLORS.green },
                  { key: 'Expenses', label: 'Expenses', color: CHART_COLORS.red   },
                ]}
                height={240}
              />
            </div>
          )}

          {/* Charts: Net balance summary + Budget donut */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Net balance breakdown */}
            <div className="card p-4">
              <p className="text-sm font-semibold text-ink-700 dark:text-white mb-4">Financial Summary</p>
              {(() => {
                const exp      = Math.max(b.expected_revenue, 1)
                const colPct   = Math.min((b.collected_revenue / exp) * 100, 100)
                const burPct   = Math.min((b.bursary_revenue   / exp) * 100, 100)
                const remPct   = Math.max(0, 100 - colPct - burPct)
                const fmtPct   = (v: number) => v < 0.1 ? '<0.1%' : v < 1 ? '<1%' : `${Math.round(v)}%`
                const rows = [
                  { label: 'Expected Revenue',  value: b.expected_revenue,  dot: 'bg-ink-300',   pctOf: null },
                  { label: 'Collected Revenue', value: b.collected_revenue,  dot: 'bg-green-500', pctOf: colPct },
                  { label: 'Bursary Applied',   value: b.bursary_revenue,    dot: 'bg-blue-500',  pctOf: burPct },
                  { label: 'Total Expenses',    value: b.total_expenses,     dot: 'bg-red-500',   pctOf: Math.min((b.total_expenses / exp) * 100, 100) },
                ]
                return (
                  <div className="space-y-0">
                    {/* Stacked revenue bar */}
                    <div className="mb-4">
                      <div className="flex justify-between text-[11px] text-ink-400 mb-1">
                        <span>Revenue breakdown (of {formatRWF(b.expected_revenue)})</span>
                        <span>{fmtPct(colPct + burPct)} settled</span>
                      </div>
                      <div className="h-3 bg-ink-100 dark:bg-ink-700 rounded-full overflow-hidden flex">
                        <div className="h-full bg-green-500 transition-all" style={{ width: `${Math.max(colPct > 0 ? 0.5 : 0, colPct)}%` }} title={`Collected: ${fmtPct(colPct)}`} />
                        <div className="h-full bg-blue-400 transition-all"  style={{ width: `${Math.max(burPct > 0 ? 0.5 : 0, burPct)}%` }} title={`Bursary: ${fmtPct(burPct)}`} />
                        <div className="h-full bg-ink-200 dark:bg-ink-600 transition-all" style={{ width: `${remPct}%` }} />
                      </div>
                      <div className="flex gap-3 mt-1.5 flex-wrap">
                        <span className="flex items-center gap-1 text-[10px] text-ink-400"><span className="w-2 h-2 rounded-full bg-green-500 inline-block"/>Collected</span>
                        <span className="flex items-center gap-1 text-[10px] text-ink-400"><span className="w-2 h-2 rounded-full bg-blue-400 inline-block"/>Bursary</span>
                        <span className="flex items-center gap-1 text-[10px] text-ink-400"><span className="w-2 h-2 rounded-full bg-ink-200 dark:bg-ink-600 inline-block"/>Outstanding</span>
                      </div>
                    </div>

                    {/* Rows */}
                    <div className="divide-y divide-ink-100 dark:divide-ink-700">
                      {rows.map(item => (
                        <div key={item.label} className="flex items-center justify-between py-2.5">
                          <div className="flex items-center gap-2">
                            <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${item.dot}`} />
                            <span className="text-xs text-ink-600 dark:text-ink-300">{item.label}</span>
                          </div>
                          <div className="text-right">
                            <span className="font-mono text-xs font-semibold text-ink-700 dark:text-ink-200">{formatRWF(item.value)}</span>
                            {item.pctOf !== null && (
                              <span className="ml-2 text-[10px] text-ink-400">({fmtPct(item.pctOf)})</span>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>

                    <div className={`pt-3 border-t border-ink-200 dark:border-ink-700 flex justify-between font-semibold text-sm ${b.net_balance >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                      <span>Net Balance</span>
                      <span className="font-mono">{formatRWF(b.net_balance)}</span>
                    </div>
                  </div>
                )
              })()}
            </div>

            {/* Budget allocation donut */}
            {budgetDonutData.length > 0 ? (
              <div className="card p-4">
                <div className="flex items-center gap-2 mb-1">
                  <PieChart className="w-4 h-4 text-ink-400" />
                  <p className="text-sm font-semibold text-ink-700 dark:text-white">Budget Allocation</p>
                </div>
                <p className="text-xs text-ink-400 mb-2">Distribution across expense categories</p>
                <FinanceDonut
                  data={budgetDonutData}
                  height={200}
                  innerLabel={`${(b.total_budget / 1_000_000).toFixed(1)}M`}
                  innerSub="RWF budget"
                />
              </div>
            ) : (
              <div className="card p-4 flex flex-col items-center justify-center text-center text-ink-300">
                <PieChart className="w-8 h-8 mb-2 opacity-30" />
                <p className="text-sm">No budget allocations set for this year.</p>
              </div>
            )}
          </div>

          {/* Budget vs Actual table */}
          {b.budgets.length > 0 && (
            <div className="card overflow-hidden">
              <div className="px-4 py-3 border-b border-ink-100 dark:border-ink-700 flex items-center justify-between">
                <p className="font-semibold text-sm text-ink-700 dark:text-white">Budget vs. Actual Expenses</p>
                <span className="text-xs text-ink-400">Spent / Allocated</span>
              </div>
              <div className="divide-y divide-ink-100 dark:divide-ink-700">
                {b.budgets.map((bud: any) => {
                  const expEntry  = (b.expense_by_category ?? []).find((e: any) => e.category_id === bud.category_id)
                  const spent      = Number(expEntry?.total ?? 0)
                  const budget     = Number(bud.amount)
                  const rawPctF    = budget > 0 ? (spent / budget) * 100 : (spent > 0 ? 100 : 0)
                  const rawPct     = Math.round(rawPctF)
                  const barPct     = spent > 0 ? Math.max(0.5, Math.min(100, rawPctF)) : 0
                  const isOver     = rawPctF > 100
                  const isCritical = rawPctF >= 90
                  const usageLbl   = rawPctF > 0 && rawPctF < 0.5 ? '<1%' : `${rawPct}% utilized`
                  return (
                    <div key={bud.id ?? bud.category_id} className="px-4 py-3.5">
                      <div className="flex items-start justify-between mb-2 gap-2">
                        <div className="flex items-center gap-2 min-w-0">
                          <p className="text-sm font-medium text-ink-900 dark:text-white truncate">{bud.category_name}</p>
                          {isOver && (
                            <span className="shrink-0 text-[10px] font-bold px-1.5 py-0.5 rounded bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-400">
                              OVER
                            </span>
                          )}
                          {!isOver && isCritical && (
                            <span className="shrink-0 text-[10px] font-bold px-1.5 py-0.5 rounded bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-400">
                              HIGH
                            </span>
                          )}
                        </div>
                        <div className="text-right text-xs shrink-0">
                          <span className={`font-mono font-semibold ${spent > 0 ? (isOver ? 'text-red-600' : 'text-ink-700 dark:text-ink-200') : 'text-ink-400'}`}>
                            {formatRWF(spent)}
                          </span>
                          <span className="text-ink-300 mx-1">/</span>
                          <span className="font-mono text-ink-500">{formatRWF(budget)}</span>
                        </div>
                      </div>
                      <div className="h-2 bg-ink-100 dark:bg-ink-700 rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all duration-500 ${
                            isOver     ? 'bg-red-500' :
                            isCritical ? 'bg-orange-500' :
                            spent > 0  ? 'bg-green-500' : 'bg-ink-200 dark:bg-ink-600'
                          }`}
                          style={{ width: `${barPct}%` }}
                        />
                      </div>
                      <div className="flex items-center justify-between mt-1">
                        <p className="text-[11px] text-ink-400">
                          {spent === 0 ? 'No expenses recorded yet' : usageLbl}
                        </p>
                        {budget > spent && (
                          <p className="text-[11px] text-ink-400">{formatRWF(budget - spent)} remaining</p>
                        )}
                        {isOver && (
                          <p className="text-[11px] text-red-500 font-medium">{formatRWF(spent - budget)} over budget</p>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
              {/* Footer totals */}
              {(() => {
                const totalSpent  = (b.expense_by_category ?? []).reduce((s: number, e: any) => s + Number(e.total ?? 0), 0)
                const overBudget  = totalSpent > b.total_budget
                return (
                  <div className="px-4 py-3 border-t border-ink-100 dark:border-ink-700 bg-ink-50/50 dark:bg-ink-700/30">
                    <div className="flex justify-between text-sm font-semibold mb-1">
                      <span className="text-ink-700 dark:text-white">Totals</span>
                      <div className="text-right text-xs">
                        <span className={`font-mono font-bold ${overBudget ? 'text-red-600' : 'text-ink-700 dark:text-white'}`}>{formatRWF(totalSpent)}</span>
                        <span className="text-ink-300 mx-1">/</span>
                        <span className="font-mono text-ink-500">{formatRWF(b.total_budget)}</span>
                      </div>
                    </div>
                    <div className="flex justify-between text-[11px] text-ink-400">
                      <span>{overBudget ? `${formatRWF(totalSpent - b.total_budget)} over total budget` : `${formatRWF(b.total_budget - totalSpent)} remaining`}</span>
                      {(() => {
                        const ovRaw = b.total_budget > 0 ? (totalSpent / b.total_budget) * 100 : 0
                        const ovLbl = ovRaw > 0 && ovRaw < 0.5 ? '<1%' : `${Math.round(ovRaw)}%`
                        return <span>{ovLbl} overall utilization</span>
                      })()}
                    </div>
                  </div>
                )
              })()}
            </div>
          )}

          {/* Bursary note */}
          {b.bursary_revenue > 0 && (
            <div className="card p-4 flex items-start gap-3 border-l-4 border-l-blue-500">
              <div className="w-8 h-8 rounded-lg bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center shrink-0 text-blue-600">
                <Wallet className="w-4 h-4" />
              </div>
              <div>
                <p className="text-sm font-bold text-ink-800 dark:text-white">Internal Bursaries</p>
                <p className="text-xs text-ink-500 mt-0.5">
                  {formatRWF(b.bursary_revenue)} has been applied as bursary credit for students this year.
                </p>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
