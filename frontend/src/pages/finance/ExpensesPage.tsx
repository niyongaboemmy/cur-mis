import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, Trash2, Loader2, X, Receipt, Download, AlertTriangle } from 'lucide-react'
import toast from 'react-hot-toast'
import { expenseService, exportService, budgetService } from '@/services/financeService'
import { academicService } from '@/services/academicService'
import type { Expense, CreateExpensePayload } from '@/types/finance'
import SearchableSelect from '@/components/ui/SearchableSelect'
import Pagination from '@/components/ui/Pagination'
import { useSystemStore, selectActiveYear } from '@/store/systemStore'
import { formatRWF } from '@/utils/formatCurrency'

const PAYMENT_METHODS = [
  { value: 'BANK_TRANSFER', label: 'Bank Transfer' },
  { value: 'CASH',          label: 'Cash' },
  { value: 'MOBILE_MONEY',  label: 'Mobile Money' },
  { value: 'CHEQUE',        label: 'Cheque' },
]

export default function ExpensesPage() {
  const activeYear = useSystemStore(selectActiveYear)
  const qc = useQueryClient()

  const [tab,      setTab]      = useState<'list' | 'budgets'>('list')
  const [yearId,   setYearId]   = useState<number | string>(activeYear?.id ?? '')
  const [catId,    setCatId]    = useState<number | string>('')
  const [page,     setPage]     = useState(1)
  const [showForm, setShowForm] = useState(false)
  const [editing,  setEditing]  = useState<Expense | null>(null)

  const yearsQ = useQuery({ queryKey: ['academic-years'], queryFn: () => academicService.listYears() })
  const years  = yearsQ.data?.data ?? []

  const catsQ = useQuery({ queryKey: ['finance', 'expense-cats'], queryFn: () => expenseService.listCategories() })
  const cats  = catsQ.data?.data ?? []

  const expQ = useQuery({
    queryKey: ['finance', 'expenses', yearId, catId, page],
    queryFn: () => expenseService.list({
      academic_year_id: yearId ? Number(yearId) : undefined,
      category_id:      catId  ? Number(catId)  : undefined,
      page,
      per_page: 20,
    }),
  })

  const budgetQ = useQuery({
    queryKey: ['finance', 'budgets', yearId],
    queryFn: () => budgetService.list(Number(yearId)),
    enabled: !!yearId,
  })

  const result   = expQ.data?.data
  const expenses = result?.data ?? []
  const budgets  = budgetQ.data?.data ?? []
  
  // Use DB-calculated totals from budgets array instead of local paginated expenses
  const total = expenses.reduce((s: number, e: any) => s + Number(e.amount), 0)
  const totalBudget = budgets.reduce((s: number, b: any) => s + Number(b.amount), 0)
  const totalSpent  = budgets.reduce((s: number, b: any) => s + Number(b.spent), 0)

  // Controlled budget amounts — synced from server but editable locally
  const [budgetAmounts, setBudgetAmounts] = useState<Record<number, number>>({});
  useEffect(() => {
    if (budgets.length) {
      const map: Record<number, number> = {};
      budgets.forEach((b: any) => { map[b.category_id] = Number(b.amount) })
      setBudgetAmounts(map)
    }
  }, [JSON.stringify(budgets)])

  const deleteMut = useMutation({
    mutationFn: expenseService.delete,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['finance', 'expenses'] }); toast.success('Expense deleted') },
    onError: (e: any) => toast.error(e?.response?.data?.message ?? 'Delete failed'),
  })

  const saveBudgetMut = useMutation({
    mutationFn: budgetService.save,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['finance', 'budgets'] }); toast.success('Budget updated') },
    onError: (e: any) => toast.error(e?.response?.data?.message ?? 'Save failed'),
  })

  return (
    <div className="space-y-4 animate-fade-in">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-lg font-bold text-ink-900 dark:text-white">Expenses</h2>
          <p className="text-[13px] text-ink-500">Record and report all institutional expenditure.</p>
        </div>
        <div className="flex gap-2">
          <button
            className={`btn-sm ${tab === 'list' ? 'btn-primary' : 'btn-ghost'}`}
            onClick={() => setTab('list')}
          >
            Transactions
          </button>
          <button
            className={`btn-sm ${tab === 'budgets' ? 'btn-primary' : 'btn-ghost'}`}
            onClick={() => setTab('budgets')}
          >
            Budget Plan
          </button>
          <div className="w-px h-8 bg-ink-100 mx-1" />
          <button
            className="btn-ghost btn-sm"
            onClick={() => exportService.downloadCSV('expenses', yearId ? Number(yearId) : undefined)}
          >
            <Download className="w-3.5 h-3.5" /> Export CSV
          </button>
          <button className="btn-primary btn-sm" onClick={() => { setEditing(null); setShowForm(true) }}>
            <Plus className="w-3.5 h-3.5" /> Record Expense
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="card p-3 flex gap-3 flex-wrap items-end">
        <div className="min-w-[180px]">
          <label className="block text-xs text-ink-500 mb-1">Academic Year</label>
          <SearchableSelect
            options={years.map((y: any) => ({ value: y.id, label: y.label }))}
            value={yearId}
            onChange={v => { setYearId(v); setPage(1) }}
            placeholder="All years"
            allLabel="All years"
          />
        </div>
        <div className="min-w-[180px]">
          <label className="block text-xs text-ink-500 mb-1">Category</label>
          <SearchableSelect
            options={cats.map((c: any) => ({ value: c.id, label: c.name }))}
            value={catId}
            onChange={v => { setCatId(v); setPage(1) }}
            placeholder="All categories"
            allLabel="All categories"
          />
        </div>
      </div>

      {/* Summary with Progress Bars */}
      {tab === 'list' && budgets.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="card p-4 flex flex-col justify-between">
            <div>
              <p className="text-[11px] uppercase tracking-wider font-semibold text-ink-500 mb-1">Total Spent</p>
              <p className="text-2xl font-bold text-red-600">{formatRWF(totalSpent)}</p>
              {totalBudget > 0 && (
                <div className="mt-3">
                  <div className="flex justify-between text-[11px] mb-1 font-medium">
                    <span className="text-ink-500">Overall Budget Usage</span>
                    <span className={totalSpent > totalBudget ? 'text-red-600' : 'text-ink-700'}>{Math.round((totalSpent / totalBudget) * 100)}%</span>
                  </div>
                  <div className="h-1.5 w-full bg-ink-100 rounded-full overflow-hidden">
                    <div 
                      className={`h-full transition-all ${totalSpent > totalBudget ? 'bg-red-500' : 'bg-brand'}`}
                      style={{ width: `${Math.min(100, (totalSpent / totalBudget) * 100)}%` }}
                    />
                  </div>
                </div>
              )}
            </div>
          </div>
          {budgets.slice(0, 3).map((b: any) => {
            const catTotal = Number(b.spent)
            const catBudget = Number(b.amount)
            if (!catTotal && !catBudget) return null
            return (
              <div key={b.category_id} className="card p-4">
                <p className="text-[11px] uppercase tracking-wider font-semibold text-ink-500 mb-1 truncate">{b.category_name}</p>
                <p className="text-xl font-bold text-ink-900 dark:text-white">{formatRWF(catTotal)}</p>
                {catBudget > 0 && (
                  <div className="mt-3">
                    <div className="h-1 w-full bg-ink-100 rounded-full overflow-hidden">
                      <div 
                        className={`h-full transition-all ${catTotal > catBudget ? 'bg-red-500' : 'bg-brand'}`}
                        style={{ width: `${Math.min(100, (catTotal / catBudget) * 100)}%` }}
                      />
                    </div>
                    <p className="text-[10px] text-ink-500 mt-1 flex justify-between">
                      <span>Budget: {formatRWF(catBudget)}</span>
                      <span className={catTotal > catBudget ? 'text-red-600 font-bold' : ''}>{Math.round((catTotal / catBudget) * 100)}%</span>
                    </p>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {tab === 'budgets' && (
        <div className="card overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-ink-50 dark:bg-ink-700/50 text-ink-500 text-xs uppercase font-bold">
              <tr>
                <th className="px-4 py-3 text-left">Category</th>
                <th className="px-4 py-3 text-right">Allocated Budget (RWF)</th>
                <th className="px-4 py-3 text-right">Actual Spent</th>
                <th className="px-4 py-3 text-right">Remaining</th>
                <th className="px-4 py-3 text-center">Usage</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ink-100 dark:divide-ink-700">
              {budgets.map((b: any) => {
                const spent  = Number(b.spent)
                const saved  = Number(b.amount)
                const amt    = budgetAmounts[b.category_id] ?? saved
                const rem    = amt - spent
                const usage  = amt > 0 ? Math.round((spent / amt) * 100) : 0

                return (
                  <tr key={b.category_id} className="hover:bg-ink-50/30">
                    <td className="px-4 py-3 font-medium text-ink-900 dark:text-white">{b.category_name}</td>
                    <td className="px-4 py-3 text-right">
                      <input
                        type="number"
                        className="input input-xs w-32 text-right font-mono"
                        value={amt}
                        onChange={ev => setBudgetAmounts(prev => ({ ...prev, [b.category_id]: Number(ev.target.value) }))}
                        onBlur={() => {
                          if (!yearId) { toast.error('Select an academic year first'); return }
                          if (amt !== saved) {
                            saveBudgetMut.mutate({ academic_year_id: Number(yearId), category_id: b.category_id, amount: amt })
                          }
                        }}
                      />
                    </td>
                    <td className="px-4 py-3 text-right text-ink-600 dark:text-ink-300 font-mono">{formatRWF(spent)}</td>
                    <td className={`px-4 py-3 text-right font-mono ${rem < 0 ? 'text-red-600 font-bold' : 'text-ink-600'}`}>
                      {formatRWF(rem)}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <div className="flex items-center gap-2 justify-center">
                        <div className="w-16 h-1.5 bg-ink-100 rounded-full overflow-hidden">
                          <div 
                            className={`h-full ${usage > 100 ? 'bg-red-500' : 'bg-brand'}`}
                            style={{ width: `${Math.min(100, usage)}%` }}
                          />
                        </div>
                        <span className={`text-[11px] font-bold ${usage > 100 ? 'text-red-600' : 'text-ink-500'}`}>{usage}%</span>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Table */}
      {tab === 'list' && (
        <div className="card overflow-hidden">
        {expQ.isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-5 h-5 animate-spin text-brand" />
          </div>
        ) : expenses.length === 0 ? (
          <div className="text-center py-12 text-ink-400">
            <Receipt className="w-8 h-8 mx-auto mb-2 opacity-30" />
            <p className="text-sm">No expenses recorded yet.</p>
            <button className="btn-secondary btn-sm mt-3" onClick={() => setShowForm(true)}>
              <Plus className="w-3.5 h-3.5" /> Record First Expense
            </button>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-ink-50 dark:bg-ink-700/50 text-ink-500 text-xs uppercase">
                  <tr>
                    <th className="px-4 py-2.5 text-left">Title</th>
                    <th className="px-4 py-2.5 text-left">Category</th>
                    <th className="px-4 py-2.5 text-left">Vendor</th>
                    <th className="px-4 py-2.5 text-left">Date</th>
                    <th className="px-4 py-2.5 text-left">Method</th>
                    <th className="px-4 py-2.5 text-right">Amount</th>
                    <th className="px-4 py-2.5 text-left">Recorded By</th>
                    <th className="px-4 py-2.5" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-ink-100 dark:divide-ink-700">
                  {expenses.map((e: Expense) => (
                    <tr key={e.id} className="hover:bg-ink-50/50 dark:hover:bg-ink-700/30 cursor-pointer"
                      onClick={() => { setEditing(e); setShowForm(true) }}>
                      <td className="px-4 py-2.5 font-medium">{e.title}</td>
                      <td className="px-4 py-2.5 text-ink-500">{e.category_name}</td>
                      <td className="px-4 py-2.5 text-ink-500">{e.vendor ?? '—'}</td>
                      <td className="px-4 py-2.5 text-ink-500 text-xs">{e.payment_date}</td>
                      <td className="px-4 py-2.5 text-ink-500 text-xs">{e.payment_method.replace(/_/g, ' ')}</td>
                      <td className="px-4 py-2.5 text-right font-mono font-semibold text-red-600">{formatRWF(e.amount)}</td>
                      <td className="px-4 py-2.5 text-ink-400 text-xs">{e.recorded_by_name ?? '—'}</td>
                      <td className="px-4 py-2.5" onClick={ev => ev.stopPropagation()}>
                        <button
                          className="btn-ghost btn-xs text-red-500"
                          onClick={() => { if (confirm('Delete this expense?')) deleteMut.mutate(e.id) }}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="bg-ink-50 dark:bg-ink-700/50 font-semibold text-sm">
                    <td colSpan={5} className="px-4 py-2.5">Total</td>
                    <td className="px-4 py-2.5 text-right font-mono text-red-600">{formatRWF(total)}</td>
                    <td colSpan={2} />
                  </tr>
                </tfoot>
              </table>
            </div>
            {result && result.last_page > 1 && (
              <div className="px-4 py-3 border-t border-ink-100 dark:border-ink-700">
                <Pagination currentPage={result.current_page} lastPage={result.last_page} total={result.total} perPage={result.per_page} onPageChange={setPage} />
              </div>
            )}
          </>
        )}
        </div>
      )}

      {showForm && (
        <ExpenseFormModal
          initial={editing}
          categories={cats}
          years={years}
          activeYearId={yearId ? Number(yearId) : (activeYear?.id ?? 0)}
          budgets={budgets}
          onClose={() => { setShowForm(false); setEditing(null) }}
          onDone={() => { setShowForm(false); setEditing(null); qc.invalidateQueries({ queryKey: ['finance', 'expenses'] }) }}
        />
      )}
    </div>
  )
}

// ─── Expense Form Modal ───────────────────────────────────────────────────────

function ExpenseFormModal({ initial, categories, years, activeYearId, budgets, onClose, onDone }: {
  initial:      Expense | null
  categories:   any[]
  years:        any[]
  activeYearId: number
  budgets:      any[]
  onClose:      () => void
  onDone:       () => void
}) {
  const isEdit = !!initial
  const [form, setForm] = useState<CreateExpensePayload>({
    category_id:       initial?.category_id       ?? (categories[0]?.id ?? 0),
    academic_year_id:  initial?.academic_year_id  ?? activeYearId,
    title:             initial?.title             ?? '',
    description:       initial?.description       ?? '',
    amount:            initial?.amount            ?? 0,
    payment_date:      initial?.payment_date      ?? new Date().toISOString().slice(0, 10),
    payment_method:    initial?.payment_method    ?? 'BANK_TRANSFER',
    reference_number:  initial?.reference_number  ?? '',
    vendor:            initial?.vendor            ?? '',
  })
  const set = (k: keyof CreateExpensePayload, v: any) => setForm(f => ({ ...f, [k]: v }))

  const mutation = useMutation({
    mutationFn: async () => isEdit
      ? expenseService.update(initial!.id, form)
      : expenseService.create(form),
    onSuccess: () => { toast.success(isEdit ? 'Expense updated' : 'Expense recorded'); onDone() },
    onError: (e: any) => toast.error(e?.response?.data?.message ?? 'Save failed'),
  })

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black/50">
      <div className="flex min-h-full items-center justify-center p-4">
        <div className="bg-white dark:bg-ink-800 rounded-xl shadow-xl w-full max-w-md p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-base font-semibold">{isEdit ? 'Edit' : 'Record'} Expense</h3>
            <button className="btn-ghost btn-xs" onClick={onClose}><X className="w-4 h-4" /></button>
          </div>

          <div className="grid grid-cols-2 gap-3 text-sm">
            <div className="col-span-2">
              <label className="block text-xs text-ink-500 mb-1">Title *</label>
              <input className="input input-sm w-full" value={form.title} onChange={e => set('title', e.target.value)} placeholder="e.g. Monthly electricity bill" />
            </div>
            <div>
              <label className="block text-xs text-ink-500 mb-1">Category *</label>
              <SearchableSelect
                options={categories.map(c => ({ value: c.id, label: c.name }))}
                value={form.category_id}
                onChange={v => set('category_id', Number(v))}
                placeholder="Select…"
              />
            </div>
            <div>
              <label className="block text-xs text-ink-500 mb-1">Academic Year</label>
              <SearchableSelect
                options={years.map((y: any) => ({ value: y.id, label: y.label }))}
                value={form.academic_year_id ?? ''}
                onChange={v => set('academic_year_id', Number(v))}
                placeholder="Select…"
              />
            </div>
            <div>
              <label className="block text-xs text-ink-500 mb-1">Amount (RWF) *</label>
              <input type="number" className="input input-sm w-full" value={form.amount} min={1} onChange={e => set('amount', Number(e.target.value))} />
            </div>
            <div>
              <label className="block text-xs text-ink-500 mb-1">Date *</label>
              <input type="date" className="input input-sm w-full" value={form.payment_date} onChange={e => set('payment_date', e.target.value)} />
            </div>
            <div>
              <label className="block text-xs text-ink-500 mb-1">Payment Method</label>
              <SearchableSelect
                options={PAYMENT_METHODS}
                value={form.payment_method ?? ''}
                onChange={v => set('payment_method', v)}
                placeholder="Select…"
              />
            </div>
            <div>
              <label className="block text-xs text-ink-500 mb-1">Reference / Voucher #</label>
              <input className="input input-sm w-full" value={form.reference_number ?? ''} onChange={e => set('reference_number', e.target.value)} placeholder="Optional" />
            </div>
            <div className="col-span-2">
              <label className="block text-xs text-ink-500 mb-1">Vendor / Supplier</label>
              <input className="input input-sm w-full" value={form.vendor ?? ''} onChange={e => set('vendor', e.target.value)} placeholder="Optional" />
            </div>
            <div className="col-span-2">
              <label className="block text-xs text-ink-500 mb-1">Description</label>
              <textarea className="input input-sm w-full" rows={2} value={form.description ?? ''} onChange={e => set('description', e.target.value)} placeholder="Optional notes…" />
            </div>

            {/* Budget Usage Alert */}
            {(() => {
              const catBudget = budgets.find((b: any) => b.category_id === form.category_id);
              if (!catBudget || Number(catBudget.amount) <= 0) return null;
              
              const remaining = Number(catBudget.amount) - Number(catBudget.spent);
              const usageAfter = ((Number(catBudget.spent) + form.amount) / Number(catBudget.amount)) * 100;
              const isOver = usageAfter > 100;

              return (
                <div className={`col-span-2 p-3 rounded-lg border text-xs space-y-1 ${
                  isOver ? 'bg-red-50 border-red-200 text-red-700' : 'bg-ink-50 border-ink-100 text-ink-600'
                }`}>
                  <div className="flex justify-between font-bold uppercase tracking-tight text-[10px]">
                    <span>Category Budget: {formatRWF(catBudget.amount)}</span>
                    <span>Remaining: {formatRWF(remaining)}</span>
                  </div>
                  <div className="h-1.5 w-full bg-white dark:bg-ink-900 rounded-full overflow-hidden">
                    <div 
                      className={`h-full transition-all ${isOver ? 'bg-red-500' : 'bg-brand'}`}
                      style={{ width: `${Math.min(100, usageAfter)}%` }}
                    />
                  </div>
                  <p className="flex justify-between items-center">
                    <span>New Usage: {Math.round(usageAfter)}%</span>
                    {isOver && <span className="font-bold flex items-center gap-1 animate-pulse"><AlertTriangle className="w-3 h-3" /> Exceeds Budget</span>}
                  </p>
                </div>
              );
            })()}
          </div>

          <div className="flex gap-2 justify-end pt-1">
            <button className="btn-ghost btn-sm" onClick={onClose}>Cancel</button>
            <button
              className="btn-primary btn-sm"
              onClick={() => mutation.mutate()}
              disabled={mutation.isPending || !form.title || form.amount <= 0}
            >
              {mutation.isPending && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              {isEdit ? 'Save Changes' : 'Record Expense'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
