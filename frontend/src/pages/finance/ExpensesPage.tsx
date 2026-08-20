import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Plus,
  Trash2,
  Loader2,
  X,
  Receipt,
  Download,
  AlertTriangle,
  CheckCircle2,
  TrendingDown,
  PiggyBank,
  Tag,
} from "lucide-react";
import toast from "react-hot-toast";
import {
  expenseService,
  exportService,
  budgetService,
} from "@/services/financeService";
import { academicService } from "@/services/academicService";
import type { Expense, CreateExpensePayload } from "@/types/finance";
import SearchableSelect from "@/components/ui/SearchableSelect";
import Pagination from "@/components/ui/Pagination";
import { useSystemStore } from "@/store/systemStore";
import { formatRWF } from "@/utils/formatCurrency";
import ModalPortal from "@/components/ui/ModalPortal";
import { PERMISSIONS } from "@/constants";
import { usePermission } from "@/utils/permissions";

const PAYMENT_METHODS = [
  { value: "BANK_TRANSFER", label: "Bank Transfer" },
  { value: "CASH", label: "Cash" },
  { value: "MOBILE_MONEY", label: "Mobile Money" },
  { value: "CHEQUE", label: "Cheque" },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function resolveYearId(label: string, basics: any): number | string {
  if (label) {
    const y = basics?.years?.find((y: any) => y.label === label);
    if (y) return y.id;
  }
  return (basics?.active_year as any)?.id ?? "";
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function ExpensesPage() {
  const canManage = usePermission(PERMISSIONS.MANAGE_FINANCE);
  const basics = useSystemStore((s) => s.basics);
  const selectedYearLabel = useSystemStore((s) => s.selectedYearLabel);
  const qc = useQueryClient();
  const navigate = useNavigate();

  const [yearId, setYearId] = useState<number | string>(() =>
    resolveYearId(selectedYearLabel, basics),
  );
  const [catId, setCatId] = useState<number | string>("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [page, setPage] = useState(1);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Expense | null>(null);
  const [deleteId, setDeleteId] = useState<number | null>(null);

  useEffect(() => {
    setYearId(resolveYearId(selectedYearLabel, basics));
    setPage(1);
  }, [selectedYearLabel, basics?.years]);

  const yearsQ = useQuery({
    queryKey: ["academic-years"],
    queryFn: () => academicService.listYears(),
  });
  const years = yearsQ.data?.data ?? [];

  const catsQ = useQuery({
    queryKey: ["finance", "expense-cats"],
    queryFn: () => expenseService.listCategories(),
  });
  const cats = catsQ.data?.data ?? [];

  const expQ = useQuery({
    queryKey: ["finance", "expenses", yearId, catId, fromDate, toDate, page],
    queryFn: () =>
      expenseService.list({
        academic_year_id: yearId ? Number(yearId) : undefined,
        category_id: catId ? Number(catId) : undefined,
        from_date: fromDate || undefined,
        to_date: toDate || undefined,
        page,
        per_page: 20,
      }),
  });

  const budgetQ = useQuery({
    queryKey: ["finance", "budgets", yearId],
    queryFn: () => budgetService.list(Number(yearId)),
    enabled: !!yearId,
  });

  const result = expQ.data?.data as any;
  const expenses = result?.data ?? [];
  const budgets = budgetQ.data?.data ?? [];

  const pageTotal = expenses.reduce(
    (s: number, e: any) => s + Number(e.amount),
    0,
  );
  const totalBudget = budgets.reduce(
    (s: number, b: any) => s + Number(b.amount),
    0,
  );
  const totalSpent = budgets.reduce(
    (s: number, b: any) => s + Number(b.spent),
    0,
  );

  const deleteMut = useMutation({
    mutationFn: expenseService.delete,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["finance", "expenses"] });
      qc.invalidateQueries({ queryKey: ["finance", "budgets"] });
      toast.success("Expense deleted");
      setDeleteId(null);
    },
    onError: (e: any) =>
      toast.error(e?.response?.data?.message ?? "Delete failed"),
  });

  const openEdit = (e: Expense) => {
    setEditing(e);
    setShowForm(true);
  };
  const closeForm = () => {
    setShowForm(false);
    setEditing(null);
  };

  return (
    <div className="space-y-4 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-lg font-bold text-ink-900 dark:text-white">
            Expenses
          </h2>
          <p className="text-[13px] text-ink-500">
            Record and report all institutional expenditure.
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <button
            className="btn-ghost btn-sm"
            onClick={() => navigate("/finance/budget-execution")}
          >
            <PiggyBank className="w-3.5 h-3.5" /> Budget Execution
          </button>
          <button
            className="btn-ghost btn-sm"
            onClick={() => navigate("/finance/expenses/categories")}
          >
            <Tag className="w-3.5 h-3.5" /> Manage Categories
          </button>
          <button
            className="btn-ghost btn-sm"
            onClick={() =>
              exportService.downloadCSV(
                "expenses",
                yearId ? Number(yearId) : undefined,
              )
            }
          >
            <Download className="w-3.5 h-3.5" /> Export CSV
          </button>
          {canManage && (
            <button
              className="btn-primary btn-sm"
              onClick={() => {
                setEditing(null);
                setShowForm(true);
              }}
            >
              <Plus className="w-3.5 h-3.5" /> Record Expense
            </button>
          )}
        </div>
      </div>

      {/* Filters */}
      <div className="card p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 items-end">
        <div>
          <label className="block text-xs text-ink-500 mb-1">
            Academic Year
          </label>
          <SearchableSelect
            options={years.map((y: any) => ({ value: y.id, label: y.label }))}
            value={yearId}
            onChange={(v) => {
              setYearId(v);
              setPage(1);
            }}
            placeholder="All years"
            allLabel="All years"
          />
        </div>
        <div>
          <label className="block text-xs text-ink-500 mb-1">Category</label>
          <SearchableSelect
            options={cats.map((c: any) => ({ value: c.id, label: c.name }))}
            value={catId}
            onChange={(v) => {
              setCatId(v);
              setPage(1);
            }}
            placeholder="All categories"
            allLabel="All categories"
          />
        </div>
        <div>
          <label className="block text-xs text-ink-500 mb-1">From Date</label>
          <input
            type="date"
            className="input input-sm w-full"
            value={fromDate}
            max={toDate || today()}
            onChange={(e) => {
              setFromDate(e.target.value);
              setPage(1);
            }}
          />
        </div>
        <div>
          <label className="block text-xs text-ink-500 mb-1">To Date</label>
          <input
            type="date"
            className="input input-sm w-full"
            value={toDate}
            min={fromDate}
            max={today()}
            onChange={(e) => {
              setToDate(e.target.value);
              setPage(1);
            }}
          />
        </div>
        {(fromDate || toDate || catId) && (
          <div className="col-span-full flex justify-end">
            <button
              className="text-xs text-brand hover:underline flex items-center gap-1"
              onClick={() => {
                setFromDate("");
                setToDate("");
                setCatId("");
                setPage(1);
              }}
            >
              <X className="w-3 h-3" /> Clear filters
            </button>
          </div>
        )}
      </div>

      {/* KPI Summary — always visible when year selected */}
      {yearId && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="card p-4">
            <p className="text-[10px] font-bold uppercase tracking-wider text-ink-400 mb-1">
              Total Spent
            </p>
            <p className="text-2xl font-bold text-red-600">
              {formatRWF(totalSpent || pageTotal)}
            </p>
            {totalBudget > 0 && (
              <div className="mt-2">
                <div className="flex justify-between text-[10px] mb-1 text-ink-500">
                  <span>Budget usage</span>
                  <span
                    className={
                      totalSpent > totalBudget ? "text-red-600 font-bold" : ""
                    }
                  >
                    {Math.round(
                      ((totalSpent || pageTotal) / totalBudget) * 100,
                    )}
                    %
                  </span>
                </div>
                <div className="h-1.5 w-full bg-ink-100 rounded-full overflow-hidden">
                  <div
                    className={`h-full transition-all ${(totalSpent || pageTotal) > totalBudget ? "bg-red-500" : "bg-brand"}`}
                    style={{
                      width: `${Math.min(100, ((totalSpent || pageTotal) / totalBudget) * 100)}%`,
                    }}
                  />
                </div>
              </div>
            )}
          </div>

          {totalBudget > 0 && (
            <div className="card p-4">
              <p className="text-[10px] font-bold uppercase tracking-wider text-ink-400 mb-1">
                Total Budget
              </p>
              <p className="text-2xl font-bold text-ink-700 dark:text-ink-200">
                {formatRWF(totalBudget)}
              </p>
              <p className="text-[10px] text-ink-400 mt-1">
                {budgets.length} categor{budgets.length !== 1 ? "ies" : "y"}{" "}
                budgeted
              </p>
            </div>
          )}

          {totalBudget > 0 && (
            <div className="card p-4">
              <p className="text-[10px] font-bold uppercase tracking-wider text-ink-400 mb-1">
                Remaining Budget
              </p>
              <p
                className={`text-2xl font-bold ${totalBudget - totalSpent < 0 ? "text-red-600" : "text-green-600"}`}
              >
                {formatRWF(totalBudget - totalSpent)}
              </p>
              {totalBudget - totalSpent < 0 && (
                <p className="text-[10px] text-red-500 mt-1 flex items-center gap-1">
                  <AlertTriangle className="w-3 h-3" /> Over budget
                </p>
              )}
            </div>
          )}

          <div className="card p-4">
            <p className="text-[10px] font-bold uppercase tracking-wider text-ink-400 mb-1">
              Transactions
            </p>
            <p className="text-2xl font-bold text-ink-700 dark:text-ink-200">
              {result?.total ?? expenses.length}
            </p>
            <p className="text-[10px] text-ink-400 mt-1">
              {fromDate || toDate ? "in selected period" : "this academic year"}
            </p>
          </div>
        </div>
      )}

      {/* Category breakdown — top 3 budgets */}
      {budgets.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {budgets.slice(0, 3).map((b: any) => {
            const spent = Number(b.spent);
            const budget = Number(b.amount);
            if (!budget && !spent) return null;
            const pctRaw = budget > 0 ? (spent / budget) * 100 : null;
            const pct = pctRaw !== null ? Math.round(pctRaw) : null;
            return (
              <div
                key={b.category_id}
                className="card p-3 flex items-center gap-3"
              >
                <div
                  className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${(pct ?? 0) > 100 ? "bg-red-50 dark:bg-red-900/20" : "bg-brand/10"}`}
                >
                  <TrendingDown
                    className={`w-5 h-5 ${(pct ?? 0) > 100 ? "text-red-500" : "text-brand"}`}
                  />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-ink-400 truncate">
                    {b.category_name}
                  </p>
                  <p className="text-sm font-bold text-ink-800 dark:text-white">
                    {formatRWF(spent)}
                  </p>
                  {budget > 0 && (
                    <>
                      <div className="h-1 w-full bg-ink-100 rounded-full overflow-hidden mt-1">
                        <div
                          className={`h-full transition-all ${spent > budget ? "bg-red-500" : "bg-brand"}`}
                          style={{
                            width: `${spent > 0 ? Math.max(0.5, Math.min(100, (spent / budget) * 100)) : 0}%`,
                          }}
                        />
                      </div>
                      <p className="text-[9px] text-ink-400 mt-0.5 flex justify-between">
                        <span>Budget: {formatRWF(budget)}</span>
                        <span
                          className={
                            spent > budget ? "text-red-600 font-bold" : ""
                          }
                        >
                          {pct !== null
                            ? pct < 1 && spent > 0
                              ? "<1%"
                              : `${pct}%`
                            : "—"}
                        </span>
                      </p>
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Transactions list */}
      <div className="card overflow-hidden">
          {expQ.isFetching && expenses.length === 0 ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-5 h-5 animate-spin text-brand" />
            </div>
          ) : expenses.length === 0 ? (
            <div className="text-center py-12 text-ink-400">
              <Receipt className="w-8 h-8 mx-auto mb-2 opacity-30" />
              <p className="text-sm">
                No expenses recorded
                {fromDate || toDate || catId ? " for these filters" : " yet"}.
              </p>
              {!fromDate && !toDate && !catId && canManage && (
                <button
                  className="btn-secondary btn-sm mt-3"
                  onClick={() => setShowForm(true)}
                >
                  <Plus className="w-3.5 h-3.5" /> Record First Expense
                </button>
              )}
            </div>
          ) : (
            <>
              {expQ.isFetching && (
                <div className="h-0.5 bg-brand/20 relative overflow-hidden">
                  <div className="absolute inset-y-0 left-0 w-1/3 bg-brand animate-[shimmer_1s_infinite]" />
                </div>
              )}
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
                      <tr
                        key={e.id}
                        className="hover:bg-ink-50/50 dark:hover:bg-ink-700/30 cursor-pointer"
                        onClick={() => openEdit(e)}
                      >
                        <td className="px-4 py-2.5 font-medium">{e.title}</td>
                        <td className="px-4 py-2.5 text-ink-500">
                          {e.category_name}
                        </td>
                        <td className="px-4 py-2.5 text-ink-500 text-xs">
                          {e.vendor ?? "—"}
                        </td>
                        <td className="px-4 py-2.5 text-ink-500 text-xs">
                          {e.payment_date}
                        </td>
                        <td className="px-4 py-2.5 text-ink-500 text-xs">
                          <span className="px-1.5 py-0.5 rounded bg-ink-100 dark:bg-ink-700 text-[10px] font-medium">
                            {e.payment_method.replace(/_/g, " ")}
                          </span>
                        </td>
                        <td className="px-4 py-2.5 text-right font-mono font-semibold text-red-600">
                          {formatRWF(e.amount)}
                        </td>
                        <td className="px-4 py-2.5 text-ink-400 text-xs">
                          {(e as any).recorded_by_name ?? "—"}
                        </td>
                        <td
                          className="px-4 py-2.5"
                          onClick={(ev) => ev.stopPropagation()}
                        >
                          <button
                            className="btn-ghost btn-xs text-red-500 hover:bg-red-50"
                            onClick={() => setDeleteId(e.id)}
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="bg-ink-50 dark:bg-ink-700/50 font-semibold text-sm">
                      <td
                        colSpan={5}
                        className="px-4 py-2.5 text-ink-500 text-xs"
                      >
                        Page total ({expenses.length} of{" "}
                        {result?.total ?? expenses.length} records)
                      </td>
                      <td className="px-4 py-2.5 text-right font-mono text-red-600">
                        {formatRWF(pageTotal)}
                      </td>
                      <td colSpan={2} />
                    </tr>
                  </tfoot>
                </table>
              </div>
              {result && result.last_page > 1 && (
                <div className="px-4 py-3 border-t border-ink-100 dark:border-ink-700">
                  <Pagination
                    currentPage={result.current_page}
                    lastPage={result.last_page}
                    total={result.total}
                    perPage={result.per_page}
                    onPageChange={setPage}
                  />
                </div>
              )}
            </>
          )}
        </div>

      {/* Delete confirmation */}
      {deleteId !== null && (
        <ModalPortal>
          <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
            <div className="bg-white dark:bg-ink-800 rounded-xl shadow-xl w-full max-w-sm p-6 space-y-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center shrink-0">
                  <AlertTriangle className="w-5 h-5 text-red-600" />
                </div>
                <div>
                  <h3 className="font-semibold text-ink-900 dark:text-white">
                    Delete Expense
                  </h3>
                  <p className="text-sm text-ink-500">
                    This action cannot be undone.
                  </p>
                </div>
              </div>
              <div className="flex gap-2 justify-end">
                <button
                  className="btn-ghost btn-sm"
                  onClick={() => setDeleteId(null)}
                >
                  Cancel
                </button>
                <button
                  className="btn-sm bg-red-600 hover:bg-red-700 text-white font-semibold px-4 rounded-lg"
                  onClick={() => deleteMut.mutate(deleteId)}
                  disabled={deleteMut.isPending}
                >
                  {deleteMut.isPending && (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  )}
                  Delete
                </button>
              </div>
            </div>
          </div>
        </ModalPortal>
      )}

      {showForm && (
        <ExpenseFormModal
          initial={editing}
          categories={cats}
          years={years}
          activeYearId={
            yearId ? Number(yearId) : ((basics?.active_year as any)?.id ?? 0)
          }
          budgets={budgets}
          onClose={closeForm}
          onDone={() => {
            closeForm();
            qc.invalidateQueries({ queryKey: ["finance", "expenses"] });
            qc.invalidateQueries({ queryKey: ["finance", "budgets"] });
          }}
        />
      )}
    </div>
  );
}

// ─── Expense Form Modal ───────────────────────────────────────────────────────

type FormErrors = Partial<
  Record<keyof CreateExpensePayload | "overBudget", string>
>;

function ExpenseFormModal({
  initial,
  categories,
  years,
  activeYearId,
  budgets,
  onClose,
  onDone,
}: {
  initial: Expense | null;
  categories: any[];
  years: any[];
  activeYearId: number;
  budgets: any[];
  onClose: () => void;
  onDone: () => void;
}) {
  const isEdit = !!initial;
  const [form, setForm] = useState<CreateExpensePayload>({
    category_id: initial?.category_id ?? categories[0]?.id ?? 0,
    academic_year_id: initial?.academic_year_id ?? activeYearId,
    title: initial?.title ?? "",
    description: initial?.description ?? "",
    amount: initial?.amount ?? 0,
    payment_date: initial?.payment_date ?? today(),
    payment_method: initial?.payment_method ?? "BANK_TRANSFER",
    reference_number: initial?.reference_number ?? "",
    vendor: initial?.vendor ?? "",
  });
  const [errors, setErrors] = useState<FormErrors>({});
  const [overBudgetOk, setOverBudgetOk] = useState(false);
  const [showAddCat, setShowAddCat] = useState(false);

  const qc = useQueryClient();

  const set = (k: keyof CreateExpensePayload, v: any) => {
    setForm((f) => ({ ...f, [k]: v }));
    setErrors((e) => {
      const n = { ...e };
      delete n[k];
      return n;
    });
  };

  // Budget info for selected category
  const catBudget = budgets.find(
    (b: any) => b.category_id === form.category_id,
  );
  const budgetAmt = catBudget ? Number(catBudget.amount) : 0;
  // In edit mode, the original amount is already counted in spent — subtract it
  const effectiveSpent = catBudget
    ? Number(catBudget.spent) - (isEdit ? Number(initial?.amount ?? 0) : 0)
    : 0;
  const remaining = budgetAmt > 0 ? budgetAmt - effectiveSpent : null;
  const usageAfter =
    budgetAmt > 0 ? ((effectiveSpent + form.amount) / budgetAmt) * 100 : null;
  const willExceed = usageAfter !== null && usageAfter > 100;

  const validate = (): boolean => {
    const e: FormErrors = {};
    if (!form.title.trim()) e.title = "Title is required";
    else if (form.title.trim().length < 3)
      e.title = "Title must be at least 3 characters";
    if (!form.category_id) e.category_id = "Category is required";
    if (!form.academic_year_id)
      e.academic_year_id = "Academic year is required";
    if (!form.amount || form.amount <= 0)
      e.amount = "Amount must be greater than 0";
    if (!form.payment_date) e.payment_date = "Date is required";
    else if (form.payment_date > today())
      e.payment_date = "Date cannot be in the future";
    if (willExceed && !overBudgetOk)
      e.overBudget = "Acknowledge the budget overrun to proceed";
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const mutation = useMutation({
    mutationFn: async () =>
      isEdit
        ? expenseService.update(initial!.id, form)
        : expenseService.create(form),
    onSuccess: () => {
      toast.success(isEdit ? "Expense updated" : "Expense recorded");
      onDone();
    },
    onError: (e: any) => {
      const msg = e?.response?.data?.message ?? "Save failed";
      toast.error(msg);
    },
  });

  const handleSubmit = () => {
    if (!validate()) return;
    mutation.mutate();
  };

  return (
    <ModalPortal>
      <div className="fixed inset-0 z-50 overflow-y-auto bg-black/50">
        <div className="flex min-h-full items-center justify-center p-4">
          <div className="bg-white dark:bg-ink-800 rounded-xl shadow-xl w-full max-w-md">
            {/* Modal Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-ink-100 dark:border-ink-700">
              <h3 className="text-base font-semibold">
                {isEdit ? "Edit" : "Record"} Expense
              </h3>
              <button className="btn-ghost btn-xs" onClick={onClose}>
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="px-6 py-4 space-y-4">
              <div className="grid grid-cols-2 gap-3 text-sm">
                {/* Title */}
                <div className="col-span-2">
                  <label className="block text-xs font-medium text-ink-600 dark:text-ink-400 mb-1">
                    Title <span className="text-red-500">*</span>
                  </label>
                  <input
                    className={`input input-sm w-full ${errors.title ? "border-red-400 focus:ring-red-300" : ""}`}
                    value={form.title}
                    onChange={(e) => set("title", e.target.value)}
                    placeholder="e.g. Monthly electricity bill"
                  />
                  {errors.title && (
                    <p className="text-red-500 text-[10px] mt-0.5">
                      {errors.title}
                    </p>
                  )}
                </div>

                {/* Category */}
                <div>
                  <label className="text-xs font-medium text-ink-600 dark:text-ink-400 mb-1 flex justify-between items-center">
                    <span>
                      Category <span className="text-red-500">*</span>
                    </span>
                    <button
                      type="button"
                      onClick={() => setShowAddCat(true)}
                      className="text-[10px] text-brand hover:underline flex items-center gap-0.5"
                    >
                      <Plus className="w-2.5 h-2.5" /> Quick Add
                    </button>
                  </label>
                  <SearchableSelect
                    options={categories.map((c) => ({
                      value: c.id,
                      label: c.name,
                    }))}
                    value={form.category_id}
                    onChange={(v) => set("category_id", Number(v))}
                    placeholder="Select…"
                  />
                  {errors.category_id && (
                    <p className="text-red-500 text-[10px] mt-0.5">
                      {errors.category_id}
                    </p>
                  )}
                </div>

                {/* Academic Year */}
                <div>
                  <label className="block text-xs font-medium text-ink-600 dark:text-ink-400 mb-1">
                    Academic Year <span className="text-red-500">*</span>
                  </label>
                  <SearchableSelect
                    options={years.map((y: any) => ({
                      value: y.id,
                      label: y.label,
                    }))}
                    value={form.academic_year_id ?? ""}
                    onChange={(v) => set("academic_year_id", Number(v))}
                    placeholder="Select…"
                  />
                  {errors.academic_year_id && (
                    <p className="text-red-500 text-[10px] mt-0.5">
                      {errors.academic_year_id}
                    </p>
                  )}
                </div>

                {/* Amount */}
                <div>
                  <label className="block text-xs font-medium text-ink-600 dark:text-ink-400 mb-1">
                    Amount (RWF) <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="number"
                    className={`input input-sm w-full ${errors.amount ? "border-red-400 focus:ring-red-300" : ""}`}
                    value={form.amount || ""}
                    min={1}
                    step={100}
                    onChange={(e) => set("amount", Number(e.target.value))}
                    placeholder="0"
                  />
                  {errors.amount && (
                    <p className="text-red-500 text-[10px] mt-0.5">
                      {errors.amount}
                    </p>
                  )}
                </div>

                {/* Date */}
                <div>
                  <label className="block text-xs font-medium text-ink-600 dark:text-ink-400 mb-1">
                    Date <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="date"
                    className={`input input-sm w-full ${errors.payment_date ? "border-red-400 focus:ring-red-300" : ""}`}
                    value={form.payment_date}
                    max={today()}
                    onChange={(e) => set("payment_date", e.target.value)}
                  />
                  {errors.payment_date && (
                    <p className="text-red-500 text-[10px] mt-0.5">
                      {errors.payment_date}
                    </p>
                  )}
                </div>

                {/* Payment Method */}
                <div>
                  <label className="block text-xs font-medium text-ink-600 dark:text-ink-400 mb-1">
                    Payment Method
                  </label>
                  <SearchableSelect
                    options={PAYMENT_METHODS}
                    value={form.payment_method ?? ""}
                    onChange={(v) => set("payment_method", v)}
                    placeholder="Select…"
                  />
                </div>

                {/* Reference */}
                <div>
                  <label className="block text-xs font-medium text-ink-600 dark:text-ink-400 mb-1">
                    Reference / Voucher #
                  </label>
                  <input
                    className="input input-sm w-full"
                    value={form.reference_number ?? ""}
                    onChange={(e) => set("reference_number", e.target.value)}
                    placeholder="Optional"
                  />
                </div>

                {/* Vendor */}
                <div className="col-span-2">
                  <label className="block text-xs font-medium text-ink-600 dark:text-ink-400 mb-1">
                    Vendor / Supplier
                  </label>
                  <input
                    className="input input-sm w-full"
                    value={form.vendor ?? ""}
                    onChange={(e) => set("vendor", e.target.value)}
                    placeholder="Optional"
                  />
                </div>

                {/* Description */}
                <div className="col-span-2">
                  <label className="block text-xs font-medium text-ink-600 dark:text-ink-400 mb-1">
                    Description
                  </label>
                  <textarea
                    className="input input-sm w-full resize-none"
                    rows={2}
                    value={form.description ?? ""}
                    onChange={(e) => set("description", e.target.value)}
                    placeholder="Optional notes…"
                  />
                </div>

                {/* Budget Alert */}
                {budgetAmt > 0 && (
                  <div
                    className={`col-span-2 p-3 rounded-lg border space-y-2 text-xs ${
                      willExceed
                        ? "bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800"
                        : usageAfter !== null && usageAfter > 80
                          ? "bg-yellow-50 dark:bg-yellow-900/20 border-yellow-200"
                          : "bg-ink-50 dark:bg-ink-700/30 border-ink-100 dark:border-ink-700"
                    }`}
                  >
                    <div className="flex justify-between font-semibold text-[10px] uppercase tracking-wide">
                      <span className="text-ink-500">
                        Category Budget: {formatRWF(budgetAmt)}
                      </span>
                      <span
                        className={
                          remaining !== null && remaining < 0
                            ? "text-red-600"
                            : "text-ink-500"
                        }
                      >
                        Available: {formatRWF(remaining ?? 0)}
                      </span>
                    </div>
                    <div className="h-1.5 w-full bg-white dark:bg-ink-900 rounded-full overflow-hidden">
                      <div
                        className={`h-full transition-all ${willExceed ? "bg-red-500" : (usageAfter ?? 0) > 80 ? "bg-yellow-500" : "bg-brand"}`}
                        style={{ width: `${Math.min(100, usageAfter ?? 0)}%` }}
                      />
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-ink-500">
                        After this expense:{" "}
                        <strong>{Math.round(usageAfter ?? 0)}%</strong> used
                      </span>
                      {willExceed && (
                        <span className="font-bold text-red-600 flex items-center gap-1">
                          <AlertTriangle className="w-3 h-3" /> Exceeds Budget
                        </span>
                      )}
                      {!willExceed &&
                        usageAfter !== null &&
                        usageAfter > 80 && (
                          <span className="font-bold text-yellow-600 flex items-center gap-1">
                            <AlertTriangle className="w-3 h-3" /> Near limit
                          </span>
                        )}
                    </div>

                    {willExceed && (
                      <label className="flex items-start gap-2 cursor-pointer pt-1 border-t border-red-200 dark:border-red-700">
                        <input
                          type="checkbox"
                          className="mt-0.5 accent-red-600"
                          checked={overBudgetOk}
                          onChange={(e) => {
                            setOverBudgetOk(e.target.checked);
                            setErrors((p) => {
                              const n = { ...p };
                              delete n.overBudget;
                              return n;
                            });
                          }}
                        />
                        <span className="text-red-700 dark:text-red-400">
                          I acknowledge this expense exceeds the allocated
                          budget for this category.
                        </span>
                      </label>
                    )}
                    {errors.overBudget && (
                      <p className="text-red-500 text-[10px]">
                        {errors.overBudget}
                      </p>
                    )}
                  </div>
                )}

                {/* Summary row — no budget set */}
                {!budgetAmt && form.category_id > 0 && (
                  <div className="col-span-2 flex items-center gap-2 text-xs text-ink-400 bg-ink-50 dark:bg-ink-700/30 rounded-lg p-2.5">
                    <CheckCircle2 className="w-3.5 h-3.5 text-ink-300 shrink-0" />
                    No budget limit set for this category. You can set one in
                    the Budget Execution tab.
                  </div>
                )}
              </div>
            </div>

            <div className="flex gap-2 justify-end px-6 py-4 border-t border-ink-100 dark:border-ink-700">
              <button className="btn-ghost btn-sm" onClick={onClose}>
                Cancel
              </button>
              <button
                className="btn-primary btn-sm min-w-[110px]"
                onClick={handleSubmit}
                disabled={mutation.isPending}
              >
                {mutation.isPending ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : isEdit ? (
                  "Save Changes"
                ) : (
                  "Record Expense"
                )}
              </button>
            </div>
          </div>
        </div>

        {showAddCat && (
          <QuickCreateCategoryModal
            onClose={() => setShowAddCat(false)}
            onCreated={(newCatId) => {
              qc.invalidateQueries({ queryKey: ["finance", "expense-cats"] });
              set("category_id", newCatId);
              setShowAddCat(false);
            }}
          />
        )}
      </div>
    </ModalPortal>
  );
}

function QuickCreateCategoryModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (id: number) => void;
}) {
  const [name, setName] = useState("");
  const mutation = useMutation({
    mutationFn: (data: { name: string }) => expenseService.createCategory(data),
    onSuccess: (res: any) => {
      toast.success("Category created");
      onCreated(res.data.id);
    },
    onError: (e: any) =>
      toast.error(e?.response?.data?.message ?? "Failed to create category"),
  });

  return (
    <ModalPortal>
      <div className="fixed inset-0 z-[60] bg-black/60 flex items-center justify-center p-4">
        <div className="bg-white dark:bg-ink-800 rounded-xl shadow-2xl w-full max-w-sm p-6 space-y-4">
          <div className="flex justify-between items-center">
            <h3 className="font-bold">New Category</h3>
            <button onClick={onClose}>
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className="space-y-1">
            <label className="text-xs text-ink-500">Name</label>
            <input
              autoFocus
              className="input input-sm w-full"
              placeholder="e.g. Refreshments"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <div className="flex gap-2 pt-2">
            <button className="btn-ghost btn-sm flex-1" onClick={onClose}>
              Cancel
            </button>
            <button
              className="btn-primary btn-sm flex-1"
              disabled={!name.trim() || mutation.isPending}
              onClick={() => mutation.mutate({ name })}
            >
              {mutation.isPending ? "Saving..." : "Create Category"}
            </button>
          </div>
        </div>
      </div>
    </ModalPortal>
  );
}
