import { useState, useMemo, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import toast from "react-hot-toast";
import {
  Banknote,
  CheckSquare,
  Square,
  X,
  Loader2,
  AlertCircle,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Sparkles,
  Building2,
  Phone,
} from "lucide-react";
import {
  hrService,
  type PaymentMethod,
  type PayrollRow,
  type PayrollConfig,
} from "@/services/hrService";
import ModalPortal from "@/components/ui/ModalPortal";

const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

const fmt = (v: number) =>
  v.toLocaleString("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  });

/* ── PAYE formula ────────────────────────────────────────────────────── */
interface FormulaConfig {
  b1: number;
  b2: number;
  b3: number;
  r1: number;
  r2: number;
  r3: number;
}
const DEFAULT_FORMULA: FormulaConfig = {
  b1: 60_000,
  b2: 100_000,
  b3: 200_000,
  r1: 0.1,
  r2: 0.2,
  r3: 0.3,
};
function calcPaye(gross: number, f = DEFAULT_FORMULA): number {
  if (gross <= 0 || gross <= f.b1) return 0;
  const c1 = (f.b2 - f.b1) * f.r1;
  if (gross <= f.b2) return (gross - f.b1) * f.r1;
  const c2 = c1 + (f.b3 - f.b2) * f.r2;
  if (gross <= f.b3) return c1 + (gross - f.b2) * f.r2;
  return c2 + (gross - f.b3) * f.r3;
}
function loadFormula(): FormulaConfig {
  try {
    const r = localStorage.getItem("cur-mis-paye-formula");
    return r ? { ...DEFAULT_FORMULA, ...JSON.parse(r) } : DEFAULT_FORMULA;
  } catch {
    return DEFAULT_FORMULA;
  }
}
function computeBreakdown(
  gross: number,
  cfg: PayrollConfig,
  formula: FormulaConfig,
) {
  const paye = calcPaye(gross, formula);
  const maternity = gross * (cfg.maternity_employee_rate / 100);
  const rssb =
    gross * ((cfg.rssb_employee_rate + cfg.maternity_employee_rate) / 100);
  const cbhi = gross * (cfg.cbhi_employee_rate / 100);
  const net = Math.max(0, gross - paye - rssb - cbhi);
  return { gross, paye, rssb, maternity, cbhi, net };
}
const DEFAULT_CFG: PayrollConfig = {
  rssb_employee_rate: 6,
  rssb_employer_rate: 6,
  maternity_employee_rate: 0.3,
  maternity_employer_rate: 0.3,
  cbhi_employee_rate: 5,
  cbhi_employer_rate: 5,
};

// Payroll rows are real employees, so their id is numeric — narrow the id that
// HrEmployee widened to `number | string` (for the directory's "user-<id>" rows)
// back to `number` here, since payroll keys selection/maps by employee id.
type RowEx = Omit<PayrollRow, "id"> & {
  id: number;
  payroll_status?: string;
  bank?: string | null;
  bank_account?: string | null;
  phone?: string | null;
  department?: string | null;
};

export interface PayAllModalProps {
  periodYear: number;
  periodMonth: number;
  alreadyPaidIds: Set<number>;
  onClose: () => void;
  onDone: () => void;
}

export default function PayAllModal({
  periodYear,
  periodMonth,
  alreadyPaidIds,
  onClose,
  onDone,
}: PayAllModalProps) {
  const formula = useMemo(loadFormula, []);

  /* ── Global payment settings ──────────────────────────────────────── */
  const [method, setMethod] = useState<PaymentMethod>("Bank Transfer");
  const [reference, setReference] = useState("");
  const [notes, setNotes] = useState("");

  /* ── Selection & exclusion reasons ───────────────────────────────── */
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [exclusionReasons, setExclusionReasons] = useState<
    Record<number, string>
  >({});
  const [seeded, setSeeded] = useState(false);

  /* ── Progress / summary ───────────────────────────────────────────── */
  const [progress, setProgress] = useState<{
    done: number;
    total: number;
  } | null>(null);
  const [summary, setSummary] = useState<{
    paid: { name: string; amount: number; wasNew: boolean }[];
    skipped: { name: string; reason: string }[];
  } | null>(null);
  const [showSkipped, setShowSkipped] = useState(false);

  const reasonRefs = useRef<Record<number, HTMLInputElement | null>>({});

  /* ── Fetch ────────────────────────────────────────────────────────── */
  const { data: payrollRes, isLoading } = useQuery({
    queryKey: ["pay-all-payroll", periodYear, periodMonth],
    queryFn: ({ signal }) =>
      hrService.payrollList(
        {
          period_year: periodYear,
          period_month: periodMonth,
          per_page: 500,
          status: "Active",
        },
        signal,
      ),
  });
  const { data: cfgRes } = useQuery({
    queryKey: ["hr-payroll-config"],
    queryFn: ({ signal }) => hrService.getPayrollConfig(signal),
    staleTime: 5 * 60_000,
  });

  const cfg = cfgRes?.data ?? DEFAULT_CFG;
  const allRows = (payrollRes?.data?.data ?? []) as RowEx[];

  /* ── Eligible ─────────────────────────────────────────────────────── */
  const eligible = useMemo(
    () =>
      allRows.filter((r) => {
        if (alreadyPaidIds.has(r.payroll_id as number)) return false;
        if (r.payroll_id != null)
          return (
            r.payroll_status === "Approved" || r.payroll_status === "Pending"
          );
        return Number(r.salary ?? 0) > 0;
      }),
    [allRows, alreadyPaidIds],
  );

  /* ── Pre-computed amounts ─────────────────────────────────────────── */
  const amounts = useMemo(() => {
    const map: Record<number, ReturnType<typeof computeBreakdown>> = {};
    for (const r of eligible) {
      if (r.payroll_id != null && Number(r.net_salary ?? 0) > 0) {
        map[r.id] = {
          gross: Number(r.gross_salary ?? r.salary ?? 0),
          paye: Number(r.paye ?? 0),
          rssb: Number(r.rssb ?? 0),
          maternity: 0,
          cbhi: Number(r.cbhi ?? 0),
          net: Number(r.net_salary ?? 0),
        };
      } else {
        map[r.id] = computeBreakdown(Number(r.salary ?? 0), cfg, formula);
      }
    }
    return map;
  }, [eligible, cfg, formula]);

  /* ── Seed selection on first load ─────────────────────────────────── */
  if (!seeded && eligible.length > 0) {
    setSelected(new Set(eligible.map((r) => r.id)));
    setSeeded(true);
  }

  const allChecked = eligible.length > 0 && selected.size === eligible.length;
  const noneChecked = selected.size === 0;

  const toggleAll = () => {
    if (allChecked) {
      setSelected(new Set());
    } else {
      setSelected(new Set(eligible.map((r) => r.id)));
      setExclusionReasons({});
    }
  };
  const toggle = (empId: number) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(empId)) {
        next.delete(empId);
        setTimeout(() => reasonRefs.current[empId]?.focus(), 50);
      } else {
        next.add(empId);
        setExclusionReasons((r) => {
          const n = { ...r };
          delete n[empId];
          return n;
        });
      }
      return next;
    });
  };
  const setReason = (empId: number, v: string) =>
    setExclusionReasons((p) => ({ ...p, [empId]: v }));

  const selectedRows = eligible.filter((r) => selected.has(r.id));
  const skippedRows = eligible.filter((r) => !selected.has(r.id));
  const totalNet = selectedRows.reduce(
    (s, r) => s + (amounts[r.id]?.net ?? 0),
    0,
  );
  const isProcessing = progress !== null && summary === null;
  const newCount = eligible.filter((r) => r.payroll_id == null).length;

  /* ── Process ──────────────────────────────────────────────────────── */
  const processAll = async () => {
    const missing = skippedRows.filter((r) => !exclusionReasons[r.id]?.trim());
    if (missing.length > 0) {
      toast.error(
        `Reason required for ${missing.length} excluded employee${missing.length !== 1 ? "s" : ""}.`,
      );
      reasonRefs.current[missing[0].id]?.focus();
      return;
    }
    if (selectedRows.length === 0) {
      toast.error("No employees selected.");
      return;
    }

    setProgress({ done: 0, total: selectedRows.length });
    const paid: { name: string; amount: number; wasNew: boolean }[] = [];
    let failed = 0;

    for (const row of selectedRows) {
      try {
        const bd = amounts[row.id];
        const isNew = row.payroll_id == null;
        let pid = row.payroll_id as number | undefined;

        if (isNew) {
          const res = await hrService.payrollUpsert({
            emp_id: row.id,
            period_year: periodYear,
            period_month: periodMonth,
            basic_salary: bd.gross,
            housing_allowance: 0,
            transport_allowance: 0,
            other_allowances: 0,
            gross_salary: bd.gross,
            paye: bd.paye,
            rssb: bd.rssb - bd.maternity,
            maternity: bd.maternity,
            cbhi: bd.cbhi,
            net_salary: bd.net,
            payroll_status: "Approved",
          } as any);
          pid = (res as any)?.data?.id;
          if (!pid) throw new Error("upsert returned no id");
        }

        let bankName: string | null = null;
        let acct: string | null = null;
        if (method === "Bank Transfer") {
          bankName = row.bank ?? null;
          acct = row.bank_account ?? null;
        } else if (method === "MoMo") {
          acct = row.phone ?? null;
        }

        await hrService.processPayment({
          payroll_id: pid!,
          amount: bd.net,
          payment_method: method,
          bank_name: bankName,
          account_number: acct,
          reference: reference || null,
          notes: notes || null,
        });
        paid.push({ name: row.full_name, amount: bd.net, wasNew: isNew });
      } catch {
        failed++;
      }
      setProgress((p) => (p ? { done: p.done + 1, total: p.total } : null));
    }

    setSummary({
      paid,
      skipped: skippedRows.map((r) => ({
        name: r.full_name,
        reason: exclusionReasons[r.id]?.trim() ?? "—",
      })),
    });
    if (failed === 0)
      toast.success(
        `${paid.length} payment${paid.length !== 1 ? "s" : ""} processed.`,
      );
    else toast.error(`${paid.length} processed, ${failed} failed.`);
  };

  /* ══════════════════════════════════════════════════════════════════
     SUMMARY SCREEN
     ══════════════════════════════════════════════════════════════════ */
  if (summary) {
    const sumTotal = summary.paid.reduce((s, p) => s + p.amount, 0);
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink-900/60 backdrop-blur-sm p-4">
        <div className="bg-white dark:bg-ink-800 rounded-xl shadow-2xl w-full max-w-lg flex flex-col max-h-[85vh]">
          <div className="flex items-center justify-between px-5 py-4 border-b border-ink-100 dark:border-ink-700 shrink-0">
            <h3 className="font-bold text-[15px] text-ink-900 dark:text-white flex items-center gap-2">
              <CheckCircle2 className="w-5 h-5 text-emerald-500" />
              Payment Summary — {MONTHS[periodMonth - 1]} {periodYear}
            </h3>
          </div>

          {/* Total pill */}
          <div className="mx-5 mt-4 flex items-center justify-between rounded-lg bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-700 px-4 py-3 shrink-0">
            <div>
              <p className="text-[11px] font-bold text-emerald-700 dark:text-emerald-300 uppercase tracking-wider">
                Total Paid
              </p>
              <p className="text-[11px] text-emerald-600 dark:text-emerald-400">
                {summary.paid.length} employee
                {summary.paid.length !== 1 ? "s" : ""} · {method}
                {summary.paid.filter((p) => p.wasNew).length > 0 &&
                  ` · ${summary.paid.filter((p) => p.wasNew).length} auto-created`}
              </p>
            </div>
            <span className="text-[20px] font-bold tabular-nums text-emerald-800 dark:text-emerald-200">
              {fmt(sumTotal)}{" "}
              <span className="text-[12px] font-normal">RWF</span>
            </span>
          </div>

          <div className="overflow-y-auto flex-1 px-5 py-4 space-y-1">
            {summary.paid.map((p, i) => (
              <div
                key={i}
                className="flex items-center justify-between py-2 border-b border-ink-50 dark:border-ink-700/50"
              >
                <div className="flex items-center gap-2">
                  <span className="text-[12.5px] text-ink-800 dark:text-ink-200">
                    {p.name}
                  </span>
                  {p.wasNew && (
                    <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[9px] font-bold bg-sky-100 dark:bg-sky-500/20 text-sky-600 dark:text-sky-300">
                      <Sparkles className="w-2.5 h-2.5" /> AUTO
                    </span>
                  )}
                </div>
                <span className="tabular-nums text-[12px] font-semibold text-emerald-700 dark:text-emerald-400">
                  {fmt(p.amount)} RWF
                </span>
              </div>
            ))}

            {summary.skipped.length > 0 && (
              <div className="pt-3">
                <button
                  className="flex items-center gap-1.5 text-[10px] font-bold text-amber-600 dark:text-amber-400 uppercase tracking-wider mb-2"
                  onClick={() => setShowSkipped((s) => !s)}
                >
                  <AlertCircle className="w-3.5 h-3.5" />
                  Excluded ({summary.skipped.length})
                  {showSkipped ? (
                    <ChevronUp className="w-3 h-3" />
                  ) : (
                    <ChevronDown className="w-3 h-3" />
                  )}
                </button>
                {showSkipped &&
                  summary.skipped.map((s, i) => (
                    <div
                      key={i}
                      className="py-2 border-b border-amber-50 dark:border-amber-900/30"
                    >
                      <span className="text-[12.5px] font-medium text-ink-700 dark:text-ink-300">
                        {s.name}
                      </span>
                      <span className="text-[11px] text-amber-600 dark:text-amber-400 ml-2">
                        — {s.reason}
                      </span>
                    </div>
                  ))}
              </div>
            )}
          </div>

          <div className="px-5 py-4 border-t border-ink-100 dark:border-ink-700 shrink-0 flex justify-end">
            <button className="btn-primary gap-1.5" onClick={onDone}>
              <CheckCircle2 className="w-4 h-4" /> Done
            </button>
          </div>
        </div>
      </div>
    );
  }

  /* ══════════════════════════════════════════════════════════════════
     MAIN MODAL
     ══════════════════════════════════════════════════════════════════ */
  return (
    <ModalPortal>
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink-900/60 backdrop-blur-sm p-4">
        <div className="bg-white dark:bg-ink-800 rounded-xl shadow-2xl w-full max-w-2xl flex flex-col max-h-[90vh]">
          {/* ── Header ── */}
          <div className="flex items-center justify-between px-5 py-4 border-b border-ink-100 dark:border-ink-700 shrink-0">
            <div>
              <h3 className="font-bold text-[15px] text-ink-900 dark:text-white flex items-center gap-2">
                <Banknote className="w-4 h-4 text-emerald-600" />
                Process Salary Payment — All
              </h3>
              <p className="text-[12px] text-ink-400 mt-0.5">
                {MONTHS[periodMonth - 1]} {periodYear}
                {" · "}Uncheck to exclude; reason required.
              </p>
            </div>
            {!isProcessing && (
              <button className="icon-btn" onClick={onClose}>
                <X className="w-4 h-4" />
              </button>
            )}
          </div>

          {/* ── Auto-create notice ── */}
          {newCount > 0 && !isLoading && (
            <div className="mx-5 mt-3 flex items-center gap-2 rounded-lg bg-sky-50 dark:bg-sky-500/10 border border-sky-100 dark:border-sky-800 px-4 py-2.5 shrink-0">
              <Sparkles className="w-3.5 h-3.5 text-sky-500 shrink-0" />
              <p className="text-[12px] text-sky-700 dark:text-sky-300">
                <span className="font-bold">
                  {newCount} employee{newCount !== 1 ? "s" : ""}
                </span>{" "}
                have no payroll entry yet — will be auto-created from salary on
                file, then paid.
              </p>
            </div>
          )}

          {/* ── Global payment settings ── */}
          <div className="px-5 pt-4 pb-4 border-b border-ink-100 dark:border-ink-700 shrink-0 space-y-3">
            {/* Payment method — button style matching ProcessPaymentModal */}
            <div>
              <label className="block text-[10px] font-bold text-ink-500 uppercase tracking-wider mb-1.5">
                Payment Method
              </label>
              <div className="flex gap-2">
                {(["Bank Transfer", "Cash", "MoMo"] as PaymentMethod[]).map(
                  (m) => (
                    <button
                      key={m}
                      onClick={() => setMethod(m)}
                      disabled={isProcessing}
                      className={`flex-1 py-2 rounded-lg text-[12px] font-semibold border transition-colors ${
                        method === m
                          ? "bg-brand border-brand text-white"
                          : "bg-white dark:bg-ink-700 border-ink-200 dark:border-ink-600 text-ink-600 dark:text-ink-300 hover:border-brand hover:text-brand"
                      }`}
                    >
                      {m}
                    </button>
                  ),
                )}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[10px] font-bold text-ink-500 uppercase tracking-wider mb-1">
                  Transaction Reference{" "}
                  <span className="font-normal text-ink-400">(optional)</span>
                </label>
                <input
                  className="input text-[13px]"
                  placeholder="e.g. TXN-JUN-2026-001"
                  value={reference}
                  onChange={(e) => setReference(e.target.value)}
                  disabled={isProcessing}
                />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-ink-500 uppercase tracking-wider mb-1">
                  Notes{" "}
                  <span className="font-normal text-ink-400">(optional)</span>
                </label>
                <input
                  className="input text-[13px]"
                  placeholder="Any remarks about this payment…"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  disabled={isProcessing}
                />
              </div>
            </div>
          </div>

          {/* ── Employee list ── */}
          <div className="overflow-y-auto flex-1">
            {isLoading ? (
              <div className="py-12 text-center">
                <Loader2 className="w-6 h-6 animate-spin mx-auto text-brand" />
              </div>
            ) : eligible.length === 0 ? (
              <div className="py-12 text-center text-ink-400 text-[13px]">
                No eligible employees for this period.
              </div>
            ) : (
              <div className="divide-y divide-ink-100 dark:divide-ink-700">
                {/* Select-all header */}
                <div className="flex items-center gap-3 px-5 py-2.5 bg-ink-50 dark:bg-ink-800/60 sticky top-0 z-10 border-b border-ink-100 dark:border-ink-700">
                  <button
                    onClick={toggleAll}
                    disabled={isProcessing}
                    className="shrink-0"
                  >
                    {allChecked ? (
                      <CheckSquare className="w-4 h-4 text-brand" />
                    ) : noneChecked ? (
                      <Square className="w-4 h-4 text-ink-400" />
                    ) : (
                      <CheckSquare className="w-4 h-4 text-brand/50" />
                    )}
                  </button>
                  <span className="text-[10px] font-bold text-ink-400 uppercase tracking-wider">
                    {selectedRows.length} of {eligible.length} selected
                  </span>
                  {totalNet > 0 && (
                    <span className="ml-auto text-[11px] font-bold text-emerald-700 dark:text-emerald-400 tabular-nums">
                      {fmt(totalNet)} RWF
                    </span>
                  )}
                </div>

                {eligible.map((row) => {
                  const empId = row.id;
                  const checked = selected.has(empId);
                  const isNew = row.payroll_id == null;
                  const bd = amounts[empId];

                  return (
                    <div
                      key={empId}
                      className={`px-5 py-3 transition-colors ${
                        checked
                          ? "hover:bg-ink-50/50 dark:hover:bg-ink-700/20"
                          : "bg-amber-50/40 dark:bg-amber-500/5"
                      }`}
                    >
                      <div className="flex items-start gap-3">
                        {/* Checkbox */}
                        <button
                          className="mt-1 shrink-0"
                          onClick={() => !isProcessing && toggle(empId)}
                          disabled={isProcessing}
                        >
                          {checked ? (
                            <CheckSquare className="w-4 h-4 text-brand" />
                          ) : (
                            <Square className="w-4 h-4 text-amber-500" />
                          )}
                        </button>

                        {/* Employee info */}
                        <div className="flex-1 min-w-0">
                          <div
                            className="flex items-center gap-2 cursor-pointer"
                            onClick={() => !isProcessing && toggle(empId)}
                          >
                            <span
                              className={`font-semibold text-[13px] ${!checked ? "text-ink-400 dark:text-ink-500" : "text-ink-900 dark:text-white"}`}
                            >
                              {row.full_name}
                            </span>
                            {isNew && (
                              <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[9px] font-bold bg-sky-100 dark:bg-sky-500/20 text-sky-600 dark:text-sky-300">
                                <Sparkles className="w-2.5 h-2.5" /> AUTO
                              </span>
                            )}
                          </div>
                          <p className="text-[11px] text-ink-400 mt-0.5">
                            {row.emp_code}
                            {row.department ? " · " + row.department : ""}
                          </p>

                          {/* Bank / MoMo info */}
                          {checked && method !== "Cash" && (
                            <div className="mt-1">
                              {method === "Bank Transfer" && (
                                <span className="inline-flex items-center gap-1 text-[11px] text-ink-500">
                                  <Building2 className="w-3 h-3" />
                                  {row.bank ? (
                                    `${row.bank}${row.bank_account ? " · " + row.bank_account : ""}`
                                  ) : (
                                    <span className="text-ink-300">
                                      No bank info
                                    </span>
                                  )}
                                </span>
                              )}
                              {method === "MoMo" && (
                                <span className="inline-flex items-center gap-1 text-[11px] text-ink-500">
                                  <Phone className="w-3 h-3" />
                                  {row.phone ?? (
                                    <span className="text-amber-500">
                                      No phone on file
                                    </span>
                                  )}
                                </span>
                              )}
                            </div>
                          )}

                          {/* Exclusion reason */}
                          {!checked && (
                            <div className="mt-2 flex items-center gap-1.5">
                              <AlertCircle className="w-3 h-3 text-amber-500 shrink-0" />
                              <input
                                ref={(el) => {
                                  reasonRefs.current[empId] = el;
                                }}
                                type="text"
                                placeholder="Reason for exclusion (required)"
                                className="input py-1 text-[11px] border-amber-300 dark:border-amber-600 focus:ring-amber-400 w-full max-w-xs"
                                value={exclusionReasons[empId] ?? ""}
                                onChange={(e) =>
                                  setReason(empId, e.target.value)
                                }
                                disabled={isProcessing}
                                onClick={(e) => e.stopPropagation()}
                              />
                            </div>
                          )}
                        </div>

                        {/* Net salary pill — matching ProcessPaymentModal style */}
                        {bd && (
                          <div
                            className={`shrink-0 rounded-lg px-3 py-2 text-right transition-opacity ${
                              checked
                                ? "bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-700"
                                : "bg-ink-100 dark:bg-ink-700/30 border border-ink-200 dark:border-ink-600 opacity-40"
                            }`}
                          >
                            <p
                              className={`text-[9px] font-bold uppercase tracking-wider ${checked ? "text-emerald-700 dark:text-emerald-300" : "text-ink-400"}`}
                            >
                              Net Salary
                            </p>
                            <p
                              className={`text-[13px] font-bold tabular-nums ${checked ? "text-emerald-800 dark:text-emerald-200" : "line-through text-ink-300 dark:text-ink-600"}`}
                            >
                              {fmt(bd.net)}{" "}
                              <span className="text-[10px] font-normal">
                                RWF
                              </span>
                            </p>
                            <p
                              className={`text-[9px] tabular-nums ${checked ? "text-emerald-600 dark:text-emerald-400" : "text-ink-300"}`}
                            >
                              {fmt(bd.gross)} – {fmt(Math.round(bd.paye))}
                            </p>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* ── Footer ── */}
          <div className="px-5 py-4 border-t border-ink-100 dark:border-ink-700 shrink-0 space-y-3">
            {/* Progress bar */}
            {isProcessing && progress && (
              <div>
                <div className="flex justify-between text-[12px] text-ink-500 mb-1">
                  <span>Processing payments…</span>
                  <span>
                    {progress.done} / {progress.total}
                  </span>
                </div>
                <div className="h-2 bg-ink-100 dark:bg-ink-700 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-emerald-500 transition-all duration-300 rounded-full"
                    style={{
                      width:
                        progress.total > 0
                          ? (progress.done / progress.total) * 100 + "%"
                          : "0%",
                    }}
                  />
                </div>
              </div>
            )}

            {/* Exclusion warning */}
            {skippedRows.length > 0 && !isProcessing && (
              <div className="flex items-start gap-2 px-3 py-2 rounded-lg bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-700">
                <AlertCircle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
                <p className="text-[12px] text-amber-700 dark:text-amber-300">
                  <span className="font-bold">
                    {skippedRows.length} excluded.
                  </span>{" "}
                  Reason required for each before confirming.
                </p>
              </div>
            )}

            <div className="flex items-center justify-between gap-4">
              <div className="text-[12px] text-ink-500">
                {selectedRows.length > 0 && (
                  <>
                    <span className="font-bold text-ink-900 dark:text-white tabular-nums">
                      {fmt(totalNet)} RWF
                    </span>
                    <span className="ml-1">
                      · {selectedRows.length} employee
                      {selectedRows.length !== 1 ? "s" : ""}
                    </span>
                  </>
                )}
              </div>
              <div className="flex gap-2">
                {!isProcessing && (
                  <button
                    className="btn-secondary text-[13px]"
                    onClick={onClose}
                  >
                    Cancel
                  </button>
                )}
                <button
                  className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-semibold text-[13px] transition-colors"
                  disabled={selectedRows.length === 0 || isProcessing}
                  onClick={processAll}
                >
                  {isProcessing ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />{" "}
                      Processing…
                    </>
                  ) : (
                    <>
                      <Banknote className="w-3.5 h-3.5" /> Confirm Payment (
                      {selectedRows.length})
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </ModalPortal>
  );
}
