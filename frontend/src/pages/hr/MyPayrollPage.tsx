import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Loader2,
  Download,
  Printer,
  Wallet,
  Banknote,
  TrendingDown,
  Receipt,
  Inbox,
  Building2,
  BadgeCheck,
} from "lucide-react";
import { hrService, type PayrollEntry } from "@/services/hrService";
import type { HrEmployee } from "@/types/academic";
import { useAuthStore } from "@/store/authStore";

/* ── helpers ─────────────────────────────────────────────────────────── */

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];
const SHORT_M = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

const now = new Date();
const CUR_Y = now.getFullYear();

// Wide default range so the tab shows the user's full payslip history;
// they can narrow it with the filter below.
const FROM_Y = CUR_Y - 5;

const yearOptions = Array.from({ length: 7 }, (_, i) => CUR_Y - i).map((y) => ({
  value: String(y),
  label: String(y),
}));
const monthOptions = MONTHS.map((m, i) => ({ value: String(i + 1), label: m }));

const fmt = (v: number | string | null | undefined) =>
  v == null || v === ""
    ? "—"
    : Number(v).toLocaleString("en-US", {
        minimumFractionDigits: 0,
        maximumFractionDigits: 0,
      });

function periodLabel(year: number, month: number) {
  return `${SHORT_M[month - 1]}-${String(year).slice(-2)}`;
}

/* ─────────────────────────────────────────────────────────────────────── */

export default function MyPayrollPage() {
  const { user } = useAuthStore();

  /* date range (defaults span all realistic history) */
  const [fromYear, setFromYear] = useState<number>(FROM_Y);
  const [fromMonth, setFromMonth] = useState<number>(1);
  const [toYear, setToYear] = useState<number>(CUR_Y);
  const [toMonth, setToMonth] = useState<number>(12);

  const { data, isLoading, isError } = useQuery({
    queryKey: ["my-payroll-slips", fromYear, fromMonth, toYear, toMonth],
    queryFn: ({ signal }) =>
      hrService.payrollMySlips(
        {
          from_year: fromYear,
          from_month: fromMonth,
          to_year: toYear,
          to_month: toMonth,
        },
        signal,
      ),
  });

  const employee: HrEmployee | null = data?.data?.employee ?? null;
  const slips: PayrollEntry[] = data?.data?.slips ?? [];

  /* totals across the visible range */
  const totals = useMemo(
    () =>
      slips.reduce(
        (acc, s) => ({
          basic_salary: acc.basic_salary + Number(s.basic_salary),
          housing_allowance: acc.housing_allowance + Number(s.housing_allowance),
          transport_allowance:
            acc.transport_allowance + Number(s.transport_allowance),
          other_allowances: acc.other_allowances + Number(s.other_allowances),
          gross_salary: acc.gross_salary + Number(s.gross_salary),
          paye: acc.paye + Number(s.paye),
          rssb: acc.rssb + Number(s.rssb),
          cbhi: acc.cbhi + Number(s.cbhi),
          other_deductions:
            acc.other_deductions + Number(s.other_deductions ?? 0),
          net_salary: acc.net_salary + Number(s.net_salary),
        }),
        {
          basic_salary: 0,
          housing_allowance: 0,
          transport_allowance: 0,
          other_allowances: 0,
          gross_salary: 0,
          paye: 0,
          rssb: 0,
          cbhi: 0,
          other_deductions: 0,
          net_salary: 0,
        },
      ),
    [slips],
  );

  /* summary stats: latest payslip + current-year (YTD) roll-ups */
  const summary = useMemo(() => {
    const latest = slips.reduce<PayrollEntry | null>((best, s) => {
      if (!best) return s;
      const a = s.period_year * 12 + s.period_month;
      const b = best.period_year * 12 + best.period_month;
      return a > b ? s : best;
    }, null);

    const ytd = slips
      .filter((s) => s.period_year === CUR_Y)
      .reduce(
        (acc, s) => ({
          gross: acc.gross + Number(s.gross_salary),
          deductions:
            acc.deductions +
            Number(s.paye) +
            Number(s.rssb) +
            Number(s.cbhi) +
            Number(s.other_deductions ?? 0),
          net: acc.net + Number(s.net_salary),
          months: acc.months + 1,
        }),
        { gross: 0, deductions: 0, net: 0, months: 0 },
      );

    return { latest, ytd };
  }, [slips]);

  /* ── CSV download ─────────────────────────────────────────────────── */
  const downloadCSV = () => {
    const header = [
      "No", "Month", "Basic Salary", "Housing Allowance", "Transport Allowance",
      "Other Allowances", "Gross Salary", "PAYE(TPR)", "RSSB", "CBHI",
      "Deductions", "Net Salary",
    ];
    const rows = slips.map((s, i) => [
      i + 1,
      `${SHORT_M[(s.period_month ?? 1) - 1]}-${String(s.period_year).slice(-2)}`,
      s.basic_salary, s.housing_allowance, s.transport_allowance,
      s.other_allowances, s.gross_salary, s.paye, s.rssb, s.cbhi,
      s.other_deductions ?? 0, s.net_salary,
    ]);
    const csv = [header, ...rows].map((r) => r.join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `my_payslips_${employee?.emp_code ?? "me"}_${fromYear}-${fromMonth}_to_${toYear}-${toMonth}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  /* ── PDF print ────────────────────────────────────────────────────── */
  const printPDF = () => {
    if (!employee || slips.length === 0) return;
    const rows = slips
      .map(
        (s, i) => `
      <tr>
        <td>${i + 1}</td>
        <td>${SHORT_M[(s.period_month ?? 1) - 1]}-${String(s.period_year).slice(-2)}</td>
        <td class="num">${Number(s.basic_salary).toLocaleString()}</td>
        <td class="num">${Number(s.housing_allowance).toLocaleString()}</td>
        <td class="num">${Number(s.transport_allowance).toLocaleString()}</td>
        <td class="num">${Number(s.other_allowances).toLocaleString()}</td>
        <td class="num"><strong>${Number(s.gross_salary).toLocaleString()}</strong></td>
        <td class="num">${Number(s.paye).toLocaleString()}</td>
        <td class="num">${Number(s.rssb).toLocaleString()}</td>
        <td class="num">${Number(s.cbhi).toLocaleString()}</td>
        <td class="num">${Number(s.other_deductions ?? 0) > 0 ? Number(s.other_deductions).toLocaleString() : "—"}</td>
        <td class="num"><strong>${Number(s.net_salary).toLocaleString()}</strong></td>
      </tr>`,
      )
      .join("");

    const totRow = `
      <tr class="total-row">
        <td colspan="2"><strong>TOTAL</strong></td>
        <td class="num"><strong>${totals.basic_salary.toLocaleString()}</strong></td>
        <td class="num"><strong>${totals.housing_allowance.toLocaleString()}</strong></td>
        <td class="num"><strong>${totals.transport_allowance.toLocaleString()}</strong></td>
        <td class="num"><strong>${totals.other_allowances.toLocaleString()}</strong></td>
        <td class="num"><strong>${totals.gross_salary.toLocaleString()}</strong></td>
        <td class="num"><strong>${totals.paye.toLocaleString()}</strong></td>
        <td class="num"><strong>${totals.rssb.toLocaleString()}</strong></td>
        <td class="num"><strong>${totals.cbhi.toLocaleString()}</strong></td>
        <td class="num"><strong>${totals.other_deductions.toLocaleString()}</strong></td>
        <td class="num"><strong>${totals.net_salary.toLocaleString()}</strong></td>
      </tr>`;

    const html = `<!DOCTYPE html><html><head><title>My Payslips — ${employee.full_name}</title>
    <style>
      body { font-family: Arial, sans-serif; font-size: 11px; color: #111; margin: 20px; }
      .header { text-align: center; border-bottom: 2px solid #333; padding-bottom: 10px; margin-bottom: 20px; }
      .header h1 { font-size: 16px; margin: 0 0 4px; letter-spacing: 1px; }
      .header p  { margin: 2px 0; font-size: 10px; }
      .payslip-title { font-weight: bold; font-size: 13px; margin-bottom: 14px; }
      table { width: 100%; border-collapse: collapse; }
      th, td { border: 1px solid #bbb; padding: 4px 6px; text-align: left; }
      th { background: #eee; font-weight: bold; font-size: 10px; text-transform: uppercase; }
      .num { text-align: right; }
      .total-row td { background: #f5f5f5; font-weight: bold; }
      .footer { margin-top: 30px; display: flex; justify-content: space-between; }
      .sig-line { margin-top: 40px; border-top: 1px solid #333; padding-top: 4px; font-size: 10px; }
      @media print { body { margin: 0; } }
    </style></head><body>
    <div class="header">
      <h1>CATHOLIC UNIVERSITY OF RWANDA</h1>
      <p>P.o Box 49 Butare/Huye – RWANDA</p>
      <p>Registry: 250 733 214 677 · Administration: 250 733 214 678</p>
      <p>email: catholic.university.rwanda@gmail.com · website: www.cur.ac.rw</p>
    </div>
    <div class="payslip-title">PAYSLIP: ${employee.full_name}</div>
    <p style="font-size:10px;margin-bottom:8px;">Period: ${SHORT_M[fromMonth - 1]}-${String(fromYear).slice(-2)} to ${SHORT_M[toMonth - 1]}-${String(toYear).slice(-2)}</p>
    <table>
      <thead><tr>
        <th>No</th><th>Months</th><th>Basic Salary</th><th>Housing Allow.</th>
        <th>Transport Allow.</th><th>Other Allowances</th><th>Gross Salary</th>
        <th>PAYE(TPR)</th><th>RSSB</th><th>CBHI</th><th>Deductions</th><th>Net Salary</th>
      </tr></thead>
      <tbody>${rows}${totRow}</tbody>
    </table>
    <div class="footer">
      <div>
        <p>Done at HUYE, ${new Date().toLocaleDateString("en-GB", { day: "2-digit", month: "2-digit", year: "numeric" }).replace(/\//g, ".")}</p>
        <div class="sig-line">Employee:<br/><strong>${employee.full_name}</strong></div>
      </div>
      <div style="text-align:right">
        <div class="sig-line" style="text-align:right">Director of HR</div>
      </div>
    </div>
    <script>window.onload=function(){window.print();}</script>
    </body></html>`;

    const win = window.open("", "_blank", "width=900,height=700");
    if (win) {
      win.document.write(html);
      win.document.close();
    }
  };

  /* ── loading ──────────────────────────────────────────────────────── */
  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-48">
        <Loader2 className="w-6 h-6 animate-spin text-brand" />
      </div>
    );
  }

  /* ── error / no employee linked → friendly empty state ────────────── */
  if (isError || !employee) {
    return (
      <div className="space-y-5 animate-fade-in">
        <PageHeader name={user?.full_name ?? "My Payroll"} />
        <div className="card p-10 flex flex-col items-center text-center gap-3">
          <div className="w-14 h-14 rounded-full bg-ink-50 dark:bg-ink-700/40 flex items-center justify-center">
            <Inbox className="w-7 h-7 text-ink-400" />
          </div>
          <h3 className="text-[15px] font-semibold text-ink-800 dark:text-ink-100">
            No payslips linked to your account
          </h3>
          <p className="text-[13px] text-ink-500 max-w-md">
            We couldn&apos;t find an employee payroll record connected to your
            login. If you believe this is a mistake, please contact the HR
            office so they can link your staff record.
          </p>
        </div>
      </div>
    );
  }

  /* ─────────────────────────────────────────────────────────────────── */
  return (
    <div className="space-y-5 animate-fade-in">
      {/* ── Header ── */}
      <div className="flex items-start gap-4 flex-wrap justify-between">
        <PageHeader
          name={employee.full_name}
          subtitle={[employee.emp_code, employee.department, employee.position]
            .filter(Boolean)
            .join(" · ")}
        />
        <div className="flex items-center gap-2 flex-wrap">
          <button
            className="btn-secondary btn-sm"
            onClick={downloadCSV}
            disabled={slips.length === 0}
            title="Export to CSV / Excel"
          >
            <Download className="w-3.5 h-3.5" /> Excel
          </button>
          <button
            className="btn-secondary btn-sm"
            onClick={printPDF}
            disabled={slips.length === 0}
            title="Download / print PDF"
          >
            <Printer className="w-3.5 h-3.5" /> PDF
          </button>
        </div>
      </div>

      {/* ── Summary cards ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard
          icon={<Wallet className="w-4 h-4" />}
          tone="emerald"
          label={
            summary.latest
              ? `Latest net · ${periodLabel(summary.latest.period_year, summary.latest.period_month)}`
              : "Latest net"
          }
          value={fmt(summary.latest?.net_salary)}
        />
        <StatCard
          icon={<Banknote className="w-4 h-4" />}
          tone="sky"
          label={`Gross this year (${CUR_Y})`}
          value={fmt(summary.ytd.gross)}
        />
        <StatCard
          icon={<TrendingDown className="w-4 h-4" />}
          tone="rose"
          label={`Deductions (${CUR_Y})`}
          value={fmt(summary.ytd.deductions)}
        />
        <StatCard
          icon={<Receipt className="w-4 h-4" />}
          tone="violet"
          label="Payslips on record"
          value={String(slips.length)}
        />
      </div>

      {/* ── Employee info card ── */}
      <div className="card p-4 flex flex-wrap gap-x-8 gap-y-3">
        <InfoItem icon={<BadgeCheck className="w-3.5 h-3.5" />} label="Contract" value={employee.contract_type ?? "—"} />
        <InfoItem label="Status" value={employee.status ?? "—"} />
        <InfoItem icon={<Building2 className="w-3.5 h-3.5" />} label="Department" value={employee.department ?? "—"} />
        <InfoItem label="Start date" value={employee.start_date ?? "—"} />
        {summary.ytd.months > 0 && (
          <InfoItem label={`Net paid (${CUR_Y})`} value={fmt(summary.ytd.net)} />
        )}
      </div>

      {/* ── Date range filter ── */}
      <div className="card p-4">
        <p className="text-[11px] font-bold text-ink-400 uppercase tracking-wider mb-3">
          Filter period
        </p>
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <label className="text-[12px] text-ink-500 shrink-0">From</label>
            <select
              className="input text-[13px] py-1.5 w-32"
              value={fromMonth}
              onChange={(e) => setFromMonth(parseInt(e.target.value))}
            >
              {monthOptions.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
            <select
              className="input text-[13px] py-1.5 w-24"
              value={fromYear}
              onChange={(e) => setFromYear(parseInt(e.target.value))}
            >
              {yearOptions.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>
          <span className="text-ink-400">→</span>
          <div className="flex items-center gap-2">
            <label className="text-[12px] text-ink-500 shrink-0">To</label>
            <select
              className="input text-[13px] py-1.5 w-32"
              value={toMonth}
              onChange={(e) => setToMonth(parseInt(e.target.value))}
            >
              {monthOptions.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
            <select
              className="input text-[13px] py-1.5 w-24"
              value={toYear}
              onChange={(e) => setToYear(parseInt(e.target.value))}
            >
              {yearOptions.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* ── Payslip table ── */}
      <div className="card overflow-hidden">
        <div className="px-4 py-3 border-b border-ink-100 dark:border-ink-700 flex items-center justify-between">
          <span className="font-semibold text-ink-800 dark:text-ink-200 text-[13px]">
            Payslip history
          </span>
          <span className="text-[12px] text-ink-400">
            {slips.length} {slips.length === 1 ? "entry" : "entries"}
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-[12px] text-left">
            <thead>
              <tr className="bg-ink-50 dark:bg-ink-800/50 border-b border-ink-100 dark:border-ink-700">
                {[
                  "No", "Month", "Basic Salary", "Housing Allow.",
                  "Transport Allow.", "Other Allow.", "Gross Salary",
                  "PAYE(TPR)", "RSSB", "CBHI", "Deductions", "Net Salary",
                ].map((h) => (
                  <th
                    key={h}
                    className="px-3 py-2.5 font-bold text-ink-400 uppercase tracking-wider text-[10px] whitespace-nowrap text-right first:text-left"
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-ink-100 dark:divide-ink-700">
              {slips.length === 0 ? (
                <tr>
                  <td colSpan={12} className="p-10 text-center text-ink-400">
                    No payslip entries in this period. Try widening the date
                    range above.
                  </td>
                </tr>
              ) : (
                <>
                  {slips.map((slip, i) => (
                    <tr
                      key={slip.id}
                      className="hover:bg-ink-50/50 dark:hover:bg-ink-700/20"
                    >
                      <td className="px-3 py-3 text-ink-500">{i + 1}</td>
                      <td className="px-3 py-3 font-semibold text-ink-800 dark:text-ink-200">
                        {periodLabel(slip.period_year, slip.period_month)}
                      </td>
                      <td className="px-3 py-3 text-right tabular-nums">{fmt(slip.basic_salary)}</td>
                      <td className="px-3 py-3 text-right tabular-nums">{fmt(slip.housing_allowance)}</td>
                      <td className="px-3 py-3 text-right tabular-nums">{fmt(slip.transport_allowance)}</td>
                      <td className="px-3 py-3 text-right tabular-nums">{fmt(slip.other_allowances)}</td>
                      <td className="px-3 py-3 text-right tabular-nums font-bold text-ink-900 dark:text-white">{fmt(slip.gross_salary)}</td>
                      <td className="px-3 py-3 text-right tabular-nums text-red-600 dark:text-red-400">{fmt(slip.paye)}</td>
                      <td className="px-3 py-3 text-right tabular-nums text-orange-600 dark:text-orange-400">{fmt(slip.rssb)}</td>
                      <td className="px-3 py-3 text-right tabular-nums text-sky-600 dark:text-sky-400">{fmt(slip.cbhi)}</td>
                      <td className="px-3 py-3 text-right tabular-nums text-violet-600 dark:text-violet-400">
                        {Number(slip.other_deductions ?? 0) > 0 ? fmt(slip.other_deductions) : "—"}
                      </td>
                      <td className="px-3 py-3 text-right tabular-nums font-bold text-emerald-700 dark:text-emerald-400">{fmt(slip.net_salary)}</td>
                    </tr>
                  ))}

                  {/* Totals row */}
                  <tr className="bg-ink-50 dark:bg-ink-800/40 font-bold border-t-2 border-ink-200 dark:border-ink-600">
                    <td className="px-3 py-3" colSpan={2}>Total</td>
                    <td className="px-3 py-3 text-right tabular-nums">{fmt(totals.basic_salary)}</td>
                    <td className="px-3 py-3 text-right tabular-nums">{fmt(totals.housing_allowance)}</td>
                    <td className="px-3 py-3 text-right tabular-nums">{fmt(totals.transport_allowance)}</td>
                    <td className="px-3 py-3 text-right tabular-nums">{fmt(totals.other_allowances)}</td>
                    <td className="px-3 py-3 text-right tabular-nums text-ink-900 dark:text-white">{fmt(totals.gross_salary)}</td>
                    <td className="px-3 py-3 text-right tabular-nums text-red-700 dark:text-red-300">{fmt(totals.paye)}</td>
                    <td className="px-3 py-3 text-right tabular-nums text-orange-700 dark:text-orange-300">{fmt(totals.rssb)}</td>
                    <td className="px-3 py-3 text-right tabular-nums text-sky-700 dark:text-sky-300">{fmt(totals.cbhi)}</td>
                    <td className="px-3 py-3 text-right tabular-nums text-violet-700 dark:text-violet-300">
                      {totals.other_deductions > 0 ? fmt(totals.other_deductions) : "—"}
                    </td>
                    <td className="px-3 py-3 text-right tabular-nums text-emerald-700 dark:text-emerald-300">{fmt(totals.net_salary)}</td>
                  </tr>
                </>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

/* ── sub-components ───────────────────────────────────────────────────── */

function PageHeader({ name, subtitle }: { name: string; subtitle?: string }) {
  return (
    <div className="flex items-center gap-3">
      <div className="w-10 h-10 rounded-xl bg-primary-50 dark:bg-primary-900/30 text-primary-700 dark:text-primary-200 flex items-center justify-center">
        <Wallet className="w-5 h-5" />
      </div>
      <div>
        <h2 className="text-lg font-bold text-ink-900 dark:text-white leading-tight">
          My Payroll
        </h2>
        <p className="text-[12.5px] text-ink-500">
          {subtitle ? subtitle : `Payslip history for ${name}`}
        </p>
      </div>
    </div>
  );
}

const TONES: Record<string, string> = {
  emerald: "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300",
  sky: "bg-sky-50 text-sky-700 dark:bg-sky-500/10 dark:text-sky-300",
  rose: "bg-rose-50 text-rose-700 dark:bg-rose-500/10 dark:text-rose-300",
  violet: "bg-violet-50 text-violet-700 dark:bg-violet-500/10 dark:text-violet-300",
};

function StatCard({
  icon,
  label,
  value,
  tone,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  tone: keyof typeof TONES | string;
}) {
  return (
    <div className="card p-4 flex items-start gap-3">
      <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${TONES[tone] ?? TONES.violet}`}>
        {icon}
      </div>
      <div className="min-w-0">
        <p className="text-[10.5px] font-bold text-ink-400 uppercase tracking-wider truncate">
          {label}
        </p>
        <p className="text-[18px] font-bold text-ink-900 dark:text-white tabular-nums mt-0.5">
          {value}
        </p>
      </div>
    </div>
  );
}

function InfoItem({
  label,
  value,
  icon,
}: {
  label: string;
  value: string;
  icon?: React.ReactNode;
}) {
  return (
    <div>
      <p className="text-[10px] font-bold text-ink-400 uppercase tracking-wider flex items-center gap-1">
        {icon}
        {label}
      </p>
      <p className="text-[13px] font-semibold text-ink-800 dark:text-ink-200 mt-0.5">
        {value}
      </p>
    </div>
  );
}
