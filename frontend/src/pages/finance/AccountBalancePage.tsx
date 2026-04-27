import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Loader2, TrendingUp, TrendingDown, Wallet, BarChart3 } from 'lucide-react'
import { balanceService } from '@/services/financeService'
import { academicService } from '@/services/academicService'
import SearchableSelect from '@/components/ui/SearchableSelect'
import { useSystemStore, selectActiveYear } from '@/store/systemStore'
import { formatRWF } from '@/utils/formatCurrency'

export default function AccountBalancePage() {
  const activeYear = useSystemStore(selectActiveYear)
  const [yearId, setYearId] = useState<number | string>('')

  useEffect(() => { if (activeYear?.id && !yearId) setYearId(activeYear.id) }, [activeYear?.id]) // eslint-disable-line

  const yearsQ = useQuery({ queryKey: ['academic-years'], queryFn: () => academicService.listYears() })
  const years  = yearsQ.data?.data ?? []

  const balQ = useQuery({
    queryKey: ['finance', 'balance', yearId],
    queryFn: () => balanceService.get(Number(yearId)),
    enabled: !!yearId,
  })
  const b = balQ.data?.data

  return (
    <div className="space-y-4 animate-fade-in">
      <div>
        <h2 className="text-lg font-bold text-ink-900 dark:text-white">Account Balance</h2>
        <p className="text-[13px] text-ink-500">Financial position: income collected vs. expenses incurred per academic year.</p>
      </div>

      {/* Year filter */}
      <div className="card p-3 flex gap-3 items-end">
        <div className="min-w-[200px]">
          <label className="block text-xs text-ink-500 mb-1">Academic Year</label>
          <SearchableSelect
            options={years.map((y: any) => ({ value: y.id, label: y.label }))}
            value={yearId}
            onChange={v => setYearId(v)}
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
          {/* KPI Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <KpiCard
              label="Expected Revenue"
              value={b.expected_revenue}
              icon={<BarChart3 className="w-4 h-4" />}
              color="text-ink-700 dark:text-white"
              bgColor="bg-ink-100 dark:bg-ink-700"
            />
            <KpiCard
              label="Collected"
              value={b.collected_revenue}
              icon={<TrendingUp className="w-4 h-4" />}
              color="text-green-600"
              bgColor="bg-green-100 dark:bg-green-900/30"
              sub={`${b.expected_revenue > 0 ? Math.round((b.collected_revenue / b.expected_revenue) * 100) : 0}% collection rate`}
            />
            <KpiCard
              label="Expenses"
              value={b.total_expenses}
              icon={<TrendingDown className="w-4 h-4" />}
              color="text-red-600"
              bgColor="bg-red-100 dark:bg-red-900/30"
              sub={`Budget: ${formatRWF(b.total_budget)}`}
            />
            <KpiCard
              label="Net Balance"
              value={b.net_balance}
              icon={<Wallet className="w-4 h-4" />}
              color={b.net_balance >= 0 ? 'text-green-600' : 'text-red-600'}
              bgColor={b.net_balance >= 0 ? 'bg-green-100 dark:bg-green-900/30' : 'bg-red-100 dark:bg-red-900/30'}
              sub="Collected − Expenses"
            />
          </div>

          {/* Collection progress bar */}
          <div className="card p-4 space-y-2">
            <div className="flex justify-between text-sm">
              <span className="font-medium">Collection Progress</span>
              <span className="font-mono text-ink-500">{b.expected_revenue > 0 ? Math.round((b.collected_revenue / b.expected_revenue) * 100) : 0}%</span>
            </div>
            <div className="h-3 bg-ink-200 dark:bg-ink-700 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all ${
                  (b.collected_revenue / b.expected_revenue) >= 0.8 ? 'bg-green-500' :
                  (b.collected_revenue / b.expected_revenue) >= 0.5 ? 'bg-yellow-500' : 'bg-red-500'
                }`}
                style={{ width: `${Math.min(b.expected_revenue > 0 ? (b.collected_revenue / b.expected_revenue) * 100 : 0, 100)}%` }}
              />
            </div>
            <div className="flex justify-between text-xs text-ink-400">
              <span>Collected: {formatRWF(b.collected_revenue)}</span>
              <span>Expected: {formatRWF(b.expected_revenue)}</span>
            </div>
          </div>

          {/* Budget vs Actual Breakdown */}
          {b.budgets.length > 0 && (
            <div className="card overflow-hidden">
              <div className="px-4 py-3 border-b border-ink-100 dark:border-ink-700 font-medium text-sm">
                Budget vs Actual Expenses
              </div>
            <div className="divide-y divide-ink-100 dark:divide-ink-700">
                {b.budgets.map((bud: any) => {
                  return (
                    <div key={bud.id ?? bud.category_id} className="px-4 py-3 flex items-center justify-between">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-ink-900 dark:text-white truncate">{bud.category_name}</p>
                        <p className="text-[11px] text-ink-500">Allocated Budget</p>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-mono font-bold">{formatRWF(bud.amount)}</p>
                      </div>
                    </div>
                  )
                })}
              </div>
              <div className="px-4 py-3 border-t border-ink-100 dark:border-ink-700 flex justify-between font-semibold text-sm bg-ink-50/50">
                <span>Total Allocated Budget</span>
                <span className="font-mono text-ink-900 dark:text-white">{formatRWF(b.total_budget)}</span>
              </div>
            </div>
          )}

          {/* Bursary note */}
          {b.bursary_revenue > 0 && (
            <div className="card p-4 flex items-start gap-3 border-l-4 border-l-blue-500">
              <div className="w-8 h-8 rounded-lg bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center shrink-0 text-blue-600">
                <Wallet className="w-4 h-4" />
              </div>
              <div>
                <p className="text-sm font-bold">Internal Bursaries</p>
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

// ─── KPI Card ─────────────────────────────────────────────────────────────────

function KpiCard({ label, value, icon, color, bgColor, sub }: {
  label:   string
  value:   number
  icon:    React.ReactNode
  color:   string
  bgColor: string
  sub?:    string
}) {
  return (
    <div className="card p-4">
      <div className="flex items-start justify-between mb-2">
        <p className="text-xs text-ink-500">{label}</p>
        <div className={`w-7 h-7 rounded-lg ${bgColor} flex items-center justify-center ${color}`}>{icon}</div>
      </div>
      <p className={`text-xl font-bold ${color}`}>{formatRWF(value)}</p>
      {sub && <p className="text-xs text-ink-400 mt-1">{sub}</p>}
    </div>
  )
}
