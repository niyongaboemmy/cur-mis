import { useState, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import {
  ShieldCheck,
  ShieldX,
  ShieldAlert,
  Loader2,
  Download,
  RefreshCw,
  Info,
  Receipt,
  CreditCard,
  AlertTriangle,
  CheckCircle,
  Clock,
  User,
  CalendarCheck,
  CalendarX,
  Layers,
  FileBarChart2,
  TrendingUp,
  Search,
} from "lucide-react";
import toast from "react-hot-toast";
import { clearanceService, feeStructureService } from "@/services/financeService";
import { academicService } from "@/services/academicService";
import type {
  StudentClearance,
  ClearanceStatus,
  ExamEligibility,
  ExamEligibilityItem,
  ClearanceReport,
  ClearanceReportStudentStatus,
  FeeStructure,
} from "@/types/finance";
import {
  CLEARANCE_STATUS_LABELS,
  CLEARANCE_STATUS_COLORS,
  FEE_TYPE_LABELS,
} from "@/types/finance";
import StudentSearchSelect from "@/components/finance/StudentSearchSelect";
import SearchableSelect from "@/components/ui/SearchableSelect";
import Pagination from "@/components/ui/Pagination";
import { useSystemStore } from "@/store/systemStore";
import { formatRWF } from "@/utils/formatCurrency";

const STATUS_ICON: Record<ClearanceStatus, React.FC<{ className?: string }>> = {
  cleared: ShieldCheck,
  not_cleared: ShieldX,
  conditional: ShieldAlert,
};

export default function ClearancePage() {
  const basics = useSystemStore((s) => s.basics);
  const selectedYearLabel = useSystemStore((s) => s.selectedYearLabel);
  const navigate = useNavigate();

  const [tab, setTab] = useState<"student" | "bulk" | "report">("student");
  const [studentId, setStudentId] = useState("");
  const [reportFeeStructureId, setReportFeeStructureId] = useState<number | "">("");
  const [reportPeriod, setReportPeriod] = useState("full_year");
  const [reportSearch, setReportSearch] = useState("");
  const [reportPage, setReportPage] = useState(1);
  const [examSemester, setExamSemester] = useState<1 | 2 | null>(null);
  const [yearId, setYearId] = useState<number | string>(() => {
    if (selectedYearLabel) {
      const y = basics?.years?.find((y: any) => y.label === selectedYearLabel);
      if (y) return (y as any).id;
    }
    return (basics?.active_year as any)?.id ?? "";
  });
  const [page, setPage] = useState(1);
  // const [grantNotes, _setGrantNotes] = useState("");
  // const [_showGrant, setShowGrant] = useState(false);

  const yearsQ = useQuery({
    queryKey: ["academic-years"],
    queryFn: () => academicService.listYears(),
  });
  const years = yearsQ.data?.data ?? [];

  // ─── Fee structures for Report tab ───────────────────────────────────────────
  const structuresQ = useQuery({
    queryKey: ["finance", "structures", yearId],
    queryFn: () => feeStructureService.list({ academic_year_id: Number(yearId), is_active: 1 }),
    enabled: tab === "report" && !!yearId,
  });
  const structures: FeeStructure[] = structuresQ.data?.data ?? [];

  const selectedStructure = useMemo(
    () => structures.find((s) => s.id === Number(reportFeeStructureId)) ?? null,
    [structures, reportFeeStructureId],
  );

  const periodOptions = useMemo(() => {
    if (!selectedStructure) return [{ value: "full_year", label: "Full Year" }];
    const plan = selectedStructure.payment_plan ?? "full_year";
    const count = selectedStructure.installment_count ?? 2;
    if (plan === "per_semester") {
      return [
        { value: "semester_1", label: "Semester 1" },
        { value: "semester_2", label: "Semester 2" },
      ];
    }
    if (plan === "per_installment") {
      return Array.from({ length: count }, (_, i) => ({
        value: `installment_${i + 1}`,
        label: `Installment ${i + 1}`,
      }));
    }
    return [{ value: "full_year", label: "Full Year" }];
  }, [selectedStructure]);

  const reportQ = useQuery({
    queryKey: ["finance", "clearance", "report", yearId, reportFeeStructureId, reportPeriod],
    queryFn: () =>
      clearanceService.getReport(Number(yearId), Number(reportFeeStructureId), reportPeriod),
    enabled: tab === "report" && !!yearId && !!reportFeeStructureId,
  });
  const report = reportQ.data?.data;

  const reportStudents = useMemo(() => {
    const list = report?.students ?? [];
    if (!reportSearch.trim()) return list;
    const q = reportSearch.toLowerCase();
    return list.filter(
      (s) =>
        s.regnumber?.toLowerCase().includes(q) ||
        `${s.fname} ${s.lname}`.toLowerCase().includes(q) ||
        (s.department_name ?? "").toLowerCase().includes(q),
    );
  }, [report, reportSearch]);

  // ─── Student tab ──────────────────────────────────────────────────────────
  const studentQ = useQuery({
    queryKey: ["finance", "clearance", "student", studentId, yearId],
    queryFn: () => clearanceService.getStatus(studentId, Number(yearId)),
    enabled: !!studentId && !!yearId,
  });
  const clearance = studentQ.data?.data;

  const examQ = useQuery({
    queryKey: ["finance", "clearance", "exam", studentId, yearId, examSemester],
    queryFn: () =>
      clearanceService.getExamEligibility(
        studentId,
        Number(yearId),
        examSemester as 1 | 2,
      ),
    enabled: !!studentId && !!yearId && examSemester !== null,
  });
  const examData = examQ.data?.data;

  // const _grantMut = useMutation({
  //   mutationFn: () =>
  //     clearanceService.grant({
  //       student_id: studentId,
  //       academic_year_id: Number(yearId),
  //       notes: grantNotes,
  //     }),
  //   onSuccess: () => {
  //     toast.success("Clearance granted");
  //     studentQ.refetch();
  //     setShowGrant(false);
  //   },
  //   onError: (e: any) => toast.error(e?.response?.data?.message ?? "Failed"),
  // });

  // ─── Bulk tab ─────────────────────────────────────────────────────────────
  const bulkQ = useQuery({
    queryKey: ["finance", "clearance", "bulk", yearId, page],
    queryFn: () =>
      clearanceService.getBulk(Number(yearId), { page, per_page: 40 }),
    enabled: tab === "bulk" && !!yearId,
  });
  const bulkData = bulkQ.data?.data;
  const records = bulkData?.data ?? [];

  const bulkRunMut = useMutation({
    mutationFn: () => clearanceService.runBulk(Number(yearId)),
    onSuccess: (res) => {
      const d = res.data;
      if (!d || d.total === 0) {
        toast(
          "No students with invoices found for this year. Generate invoices first.",
          { icon: "⚠️" },
        );
      } else {
        toast.success(
          `Done: ${d.cleared} cleared, ${d.not_cleared} not cleared (${d.total} total students processed)`,
        );
      }
      bulkQ.refetch();
    },
    onError: (e: any) => {
      const msg = e?.response?.data?.message ?? e?.message ?? "Request failed";
      toast.error(`Auto-clearance failed: ${msg}`);
    },
  });

  const exportReportCSV = (r: ClearanceReport) => {
    const rows = [
      ["Reg #", "Name", "Department", "Billed", "Paid (Cash)", "Bursary", "Covered", "Required", "Shortfall", "Status"],
      ...r.students.map((s) => [
        s.regnumber,
        `${s.fname} ${s.lname}`.trim(),
        s.department_name ?? "",
        s.amount_billed,
        s.amount_paid,
        s.bursary_applied,
        s.total_covered,
        s.required_this_period,
        s.shortfall,
        s.status === "cleared" ? "Cleared" : s.status === "partial" ? "Partial" : "Not Paid",
      ]),
    ];
    const csv = rows
      .map((row) => row.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(","))
      .join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = Object.assign(document.createElement("a"), {
      href: url,
      download: `clearance-report-${r.fee_structure.label}-${r.period_label}.csv`,
    });
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const exportBulkCSV = () => {
    if (!records.length) return;
    const rows = [
      [
        "Reg #",
        "Name",
        "Department",
        "Status",
        "Balance at Clearance",
        "Cleared By",
        "Cleared At",
        "Notes",
      ],
      ...records.map((r) => [
        r.regnumber ?? r.student_id,
        `${r.fname ?? ""} ${r.lname ?? ""}`.trim(),
        r.department_name ?? "",
        CLEARANCE_STATUS_LABELS[r.status],
        r.balance_at_clearance ?? "",
        r.cleared_by_name ?? "",
        r.cleared_at ?? "",
        r.notes ?? "",
      ]),
    ];
    const csv = rows
      .map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(","))
      .join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = Object.assign(document.createElement("a"), {
      href: url,
      download: `clearance-${yearId}.csv`,
    });
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  // Derived totals from backend
  const totals = (clearance as any)?.totals;
  const totalDue = Number(totals?.total_due ?? 0);
  const totalPaid = Number(totals?.total_paid ?? 0);
  const totalBurs = Number(totals?.total_bursary ?? 0);
  const balance = Number(clearance?.balance ?? 0);
  const threshold = Number(clearance?.threshold ?? 0);
  const payPct =
    totalDue > 0
      ? Math.min(Math.round(((totalPaid + totalBurs) / totalDue) * 100), 100)
      : 100;

  return (
    <div className="space-y-4 animate-fade-in">
      {/* Header */}
      <div>
        <h2 className="text-lg font-bold text-ink-900 dark:text-white">
          Student Clearance
        </h2>
        <p className="text-[13px] text-ink-500">
          Financial clearance confirms a student has settled their fees and is
          eligible for academic services (exams, transcripts, graduation).
        </p>
      </div>

      {/* Info banner */}
      <div className="card p-3 flex gap-3 border-l-4 border-l-brand bg-brand/5">
        <Info className="w-4 h-4 text-brand mt-0.5 shrink-0" />
        <div className="text-xs text-ink-600 dark:text-ink-300 space-y-0.5">
          <p>
            <strong className="text-ink-800 dark:text-white">Cleared</strong> —
            Student has paid all fees or their outstanding balance is within the
            allowed threshold. They can access all academic services.
          </p>
          <p>
            <strong className="text-ink-800 dark:text-white">
              Not Cleared
            </strong>{" "}
            — Outstanding balance exceeds the threshold. Access to exams,
            transcripts, or graduation may be restricted.
          </p>
          <p>
            <strong className="text-ink-800 dark:text-white">
              Conditional
            </strong>{" "}
            — Clearance was manually granted by a finance officer despite an
            outstanding balance (e.g. payment plan agreement).
          </p>
        </div>
      </div>

      {/* Tabs */}
      <div className="card p-2 flex gap-1 flex-wrap">
        {(["student", "bulk", "report"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
              tab === t
                ? "bg-brand/10 text-brand dark:bg-brand/25 dark:text-gold-400 font-semibold"
                : "text-ink-500 hover:bg-ink-50 dark:hover:bg-ink-700/50"
            }`}
          >
            {t === "student" ? "Individual Student" : t === "bulk" ? "Bulk View" : "Clearance Report"}
          </button>
        ))}
      </div>

      {/* Shared filters */}
      <div className="card p-3 flex gap-3 flex-wrap items-end">
        <div className="min-w-[200px]">
          <label className="block text-xs text-ink-500 mb-1">
            Academic Year *
          </label>
          <SearchableSelect
            options={years.map((y: any) => ({ value: y.id, label: y.label }))}
            value={yearId}
            onChange={(v) => {
              setYearId(v);
              setReportFeeStructureId("");
              setReportPeriod("full_year");
            }}
            placeholder="Select year…"
          />
        </div>
        {tab === "student" && (
          <div className="flex-1 min-w-[260px]">
            <label className="block text-xs text-ink-500 mb-1">Student</label>
            <StudentSearchSelect
              value={studentId}
              onChange={setStudentId}
              placeholder="Search by name or reg number…"
            />
          </div>
        )}
        {tab === "bulk" && yearId && (
          <button
            className="btn-secondary btn-sm"
            onClick={() => bulkRunMut.mutate()}
            disabled={bulkRunMut.isPending}
          >
            {bulkRunMut.isPending ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <RefreshCw className="w-3.5 h-3.5" />
            )}
            Run Auto-Clearance
          </button>
        )}
        {tab === "bulk" && records.length > 0 && (
          <button className="btn-ghost btn-sm" onClick={exportBulkCSV}>
            <Download className="w-3.5 h-3.5" /> Export CSV
          </button>
        )}
        {tab === "report" && yearId && (
          <>
            <div className="min-w-[260px] flex-1">
              <label className="block text-xs text-ink-500 mb-1">Fee Structure *</label>
              <SearchableSelect
                options={structures.map((s) => ({
                  value: s.id,
                  label: `${s.label}${s.department_name ? ` — ${s.department_name}` : ""}`,
                }))}
                value={reportFeeStructureId}
                onChange={(v) => {
                  setReportFeeStructureId(v as number);
                  setReportPeriod("full_year");
                }}
                placeholder={structuresQ.isLoading ? "Loading…" : "Select fee structure…"}
              />
            </div>
            {selectedStructure && (
              <div className="min-w-[180px]">
                <label className="block text-xs text-ink-500 mb-1">Period *</label>
                <select
                  className="input input-sm w-full"
                  value={reportPeriod}
                  onChange={(e) => setReportPeriod(e.target.value)}
                >
                  {periodOptions.map((p) => (
                    <option key={p.value} value={p.value}>{p.label}</option>
                  ))}
                </select>
              </div>
            )}
            {report && (
              <button
                className="btn-ghost btn-sm"
                onClick={() => exportReportCSV(report)}
              >
                <Download className="w-3.5 h-3.5" /> Export CSV
              </button>
            )}
          </>
        )}
      </div>

      {/* ── Student tab ── */}
      {tab === "student" && (
        <>
          {!studentId && (
            <div className="card p-10 text-center text-ink-400">
              <User className="w-8 h-8 mx-auto mb-2 opacity-30" />
              <p className="text-sm">
                Search for a student above to view their clearance status.
              </p>
            </div>
          )}

          {studentId && !yearId && (
            <p className="text-center py-8 text-sm text-ink-400">
              Select an academic year to check clearance.
            </p>
          )}

          {studentId && yearId && studentQ.isLoading && (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-5 h-5 animate-spin text-brand" />
            </div>
          )}

          {clearance && (
            <>
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              {/* Left: Status card */}
              <div className="space-y-4">
                {(() => {
                  const Icon = STATUS_ICON[clearance.status];
                  const isOk = clearance.status === "cleared";
                  const isCond = clearance.status === "conditional";
                  const isNot = clearance.status === "not_cleared";
                  return (
                    <div
                      className={`card p-6 text-center border-2 ${
                        isOk
                          ? "border-green-300 dark:border-green-700"
                          : isCond
                            ? "border-orange-300 dark:border-orange-700"
                            : "border-red-300 dark:border-red-700"
                      }`}
                    >
                      <div className="flex justify-center mb-3">
                        <div
                          className={`w-16 h-16 rounded-full flex items-center justify-center ${CLEARANCE_STATUS_COLORS[clearance.status]}`}
                        >
                          <Icon className="w-8 h-8" />
                        </div>
                      </div>
                      <p className="text-[11px] uppercase tracking-wider font-semibold text-ink-400 mb-1">
                        Clearance Status
                      </p>
                      <p
                        className={`text-2xl font-bold mb-1 ${
                          isOk
                            ? "text-green-600"
                            : isCond
                              ? "text-orange-600"
                              : "text-red-600"
                        }`}
                      >
                        {CLEARANCE_STATUS_LABELS[clearance.status]}
                      </p>

                      {isOk && (
                        <p className="text-xs text-green-600 flex items-center justify-center gap-1 mt-1">
                          <CheckCircle className="w-3 h-3" /> Eligible for
                          academic services
                        </p>
                      )}
                      {isCond && (
                        <p className="text-xs text-orange-600 flex items-center justify-center gap-1 mt-1">
                          <AlertTriangle className="w-3 h-3" /> Override granted
                          — balance still outstanding
                        </p>
                      )}
                      {isNot && (
                        <p className="text-xs text-red-600 flex items-center justify-center gap-1 mt-1">
                          <AlertTriangle className="w-3 h-3" /> Academic
                          services may be restricted
                        </p>
                      )}

                      {/* Balance vs threshold */}
                      <div className="grid grid-cols-2 gap-2 mt-4 pt-4 border-t border-ink-100 dark:border-ink-700">
                        <div className="p-2.5 rounded-lg bg-ink-50 dark:bg-ink-900/50">
                          <p className="text-[10px] uppercase text-ink-400 font-medium mb-0.5">
                            Outstanding
                          </p>
                          <p
                            className={`text-base font-bold ${balance > 0 ? "text-red-600" : "text-green-600"}`}
                          >
                            {formatRWF(balance)}
                          </p>
                        </div>
                        <div className="p-2.5 rounded-lg bg-ink-50 dark:bg-ink-900/50">
                          <p className="text-[10px] uppercase text-ink-400 font-medium mb-0.5">
                            Threshold
                          </p>
                          <p className="text-base font-bold text-ink-600 dark:text-ink-200">
                            {formatRWF(threshold)}
                          </p>
                        </div>
                      </div>

                      {threshold > 0 && (
                        <p className="text-[11px] text-ink-400 mt-2">
                          Students with balance ≤ {formatRWF(threshold)} are
                          auto-cleared.
                        </p>
                      )}
                      {threshold === 0 && (
                        <p className="text-[11px] text-ink-400 mt-2">
                          Full payment required — no allowance threshold set for
                          this year.
                        </p>
                      )}
                    </div>
                  );
                })()}

                {/* Clearance record details */}
                {clearance.record && (
                  <div className="card p-4 space-y-2">
                    <p className="text-xs font-semibold text-ink-500 uppercase tracking-wide">
                      Clearance Record
                    </p>
                    {clearance.record.cleared_at && (
                      <div className="flex justify-between text-sm">
                        <span className="flex items-center gap-1.5 text-ink-500">
                          <Clock className="w-3.5 h-3.5" /> Cleared At
                        </span>
                        <span className="font-medium">
                          {new Date(
                            clearance.record.cleared_at,
                          ).toLocaleDateString()}
                        </span>
                      </div>
                    )}
                    {clearance.record.cleared_by_name && (
                      <div className="flex justify-between text-sm">
                        <span className="flex items-center gap-1.5 text-ink-500">
                          <User className="w-3.5 h-3.5" /> Cleared By
                        </span>
                        <span className="font-medium">
                          {clearance.record.cleared_by_name}
                        </span>
                      </div>
                    )}
                    <div className="flex justify-between text-sm">
                      <span className="text-ink-500">Method</span>
                      <span
                        className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                          clearance.record.auto_cleared
                            ? "bg-blue-100 text-blue-700"
                            : "bg-orange-100 text-orange-700"
                        }`}
                      >
                        {clearance.record.auto_cleared ? "Auto" : "Manual"}
                      </span>
                    </div>
                    {clearance.record.notes && (
                      <div className="pt-2 border-t border-ink-100 dark:border-ink-700">
                        <p className="text-[11px] text-ink-400 mb-0.5">Note</p>
                        <p className="text-xs text-ink-600 dark:text-ink-300">
                          {clearance.record.notes}
                        </p>
                      </div>
                    )}
                  </div>
                )}

                {/* Process Dropout / Refund action */}
                {studentId && (
                  <button
                    className="btn-secondary btn-sm w-full flex items-center gap-2"
                    onClick={() => navigate(`/finance/refunds?student_id=${studentId}`)}
                  >
                    <Receipt className="w-3.5 h-3.5" />
                    Process Dropout / Refund
                  </button>
                )}

                {/* Grant clearance action */}
                {/* {clearance.status !== 'cleared' && !showGrant && (
                  <button className="btn-secondary btn-sm w-full" onClick={() => setShowGrant(true)}>
                    <ShieldCheck className="w-3.5 h-3.5" /> Grant Conditional Clearance
                  </button>
                )}

                {showGrant && (
                  <div className="border border-orange-200 dark:border-orange-800 rounded-lg p-3 space-y-2 bg-orange-50/50 dark:bg-orange-900/10">
                    <p className="text-sm font-semibold text-orange-700 dark:text-orange-400 flex items-center gap-1.5">
                      <ShieldAlert className="w-4 h-4" /> Grant Conditional Clearance
                    </p>
                    <p className="text-xs text-ink-500">This overrides the system check. The student still has an outstanding balance but will be allowed access.</p>
                    <textarea
                      className="input input-sm w-full"
                      rows={2}
                      placeholder="Reason / authorisation notes (required)…"
                      value={grantNotes}
                      onChange={e => setGrantNotes(e.target.value)}
                    />
                    <div className="flex gap-2 justify-end">
                      <button className="btn-ghost btn-xs" onClick={() => setShowGrant(false)}>Cancel</button>
                      <button
                        className="btn-xs bg-orange-500 hover:bg-orange-600 text-white rounded px-3"
                        onClick={() => grantMut.mutate()}
                        disabled={grantMut.isPending || !grantNotes.trim()}
                      >
                        {grantMut.isPending && <Loader2 className="w-3 h-3 animate-spin" />}
                        Confirm
                      </button>
                    </div>
                  </div>
                )} */}
              </div>

              {/* Right: Financial breakdown */}
              <div className="lg:col-span-2 space-y-4">
                {/* Fee payment summary */}
                <div className="card p-5">
                  <div className="flex items-center gap-2 mb-4">
                    <Receipt className="w-4 h-4 text-ink-400" />
                    <p className="text-sm font-semibold text-ink-700 dark:text-white">
                      Fee Payment Summary
                    </p>
                    <span className="text-xs text-ink-400">
                      —{" "}
                      {years.find((y: any) => y.id === Number(yearId))?.label ??
                        ""}
                    </span>
                  </div>

                  {/* Payment progress bar */}
                  <div className="mb-4">
                    <div className="flex justify-between text-xs mb-1">
                      <span className="text-ink-500">Payment Progress</span>
                      <span
                        className={`font-bold ${payPct === 100 ? "text-green-600" : payPct >= 50 ? "text-yellow-600" : "text-red-600"}`}
                      >
                        {payPct}%
                      </span>
                    </div>
                    <div className="h-2.5 bg-ink-200 dark:bg-ink-700 rounded-full overflow-hidden flex">
                      {totalPaid > 0 && (
                        <div
                          className="h-full bg-green-500 transition-all"
                          style={{
                            width: `${totalDue > 0 ? Math.min((totalPaid / totalDue) * 100, 100) : 0}%`,
                          }}
                        />
                      )}
                      {totalBurs > 0 && (
                        <div
                          className="h-full bg-blue-400 transition-all"
                          style={{
                            width: `${totalDue > 0 ? Math.min((totalBurs / totalDue) * 100, 100) : 0}%`,
                          }}
                        />
                      )}
                    </div>
                    <div className="flex gap-4 mt-1.5 text-[11px] text-ink-400">
                      <span className="flex items-center gap-1">
                        <span className="w-2 h-2 rounded-full bg-green-500 inline-block" />
                        Cash/Transfer
                      </span>
                      <span className="flex items-center gap-1">
                        <span className="w-2 h-2 rounded-full bg-blue-400 inline-block" />
                        Bursary
                      </span>
                    </div>
                  </div>

                  {/* Fee grid */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    {[
                      {
                        label: "Total Billed",
                        value: totalDue,
                        color: "text-ink-700 dark:text-white",
                        icon: <Receipt className="w-4 h-4" />,
                        bg: "bg-ink-100 dark:bg-ink-700",
                      },
                      {
                        label: "Paid (Cash)",
                        value: totalPaid,
                        color: "text-green-600",
                        icon: <CreditCard className="w-4 h-4" />,
                        bg: "bg-green-100 dark:bg-green-900/30",
                      },
                      {
                        label: "Bursary Applied",
                        value: totalBurs,
                        color: "text-blue-600",
                        icon: <ShieldCheck className="w-4 h-4" />,
                        bg: "bg-blue-100 dark:bg-blue-900/30",
                      },
                      {
                        label: "Outstanding",
                        value: balance,
                        color: balance > 0 ? "text-red-600" : "text-green-600",
                        icon:
                          balance > 0 ? (
                            <AlertTriangle className="w-4 h-4" />
                          ) : (
                            <CheckCircle className="w-4 h-4" />
                          ),
                        bg:
                          balance > 0
                            ? "bg-red-100 dark:bg-red-900/30"
                            : "bg-green-100 dark:bg-green-900/30",
                      },
                    ].map((k) => (
                      <div key={k.label} className="card p-3">
                        <div className="flex items-start justify-between mb-1.5">
                          <p className="text-[11px] text-ink-400 leading-tight">
                            {k.label}
                          </p>
                          <div
                            className={`w-6 h-6 rounded-md ${k.bg} flex items-center justify-center ${k.color}`}
                          >
                            {k.icon}
                          </div>
                        </div>
                        <p className={`text-base font-bold ${k.color}`}>
                          {formatRWF(k.value)}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>

                {/* What-next guidance */}
                {clearance.status === "not_cleared" && (
                  <div className="card p-4 border border-red-200 dark:border-red-800/50 bg-red-50/50 dark:bg-red-900/10">
                    <div className="flex items-center gap-2 mb-2 text-red-700 dark:text-red-400">
                      <AlertTriangle className="w-4 h-4" />
                      <p className="text-sm font-semibold">Action Required</p>
                    </div>
                    <p className="text-xs text-ink-600 dark:text-ink-300 mb-2">
                      This student has an outstanding balance of{" "}
                      <strong>{formatRWF(balance)}</strong>.
                      {threshold > 0
                        ? ` They need to reduce their balance to ${formatRWF(threshold)} or below to be auto-cleared.`
                        : " Full payment is required for clearance."}
                    </p>
                    <ul className="text-xs text-ink-500 space-y-1 list-disc list-inside">
                      <li>
                        Go to <strong>Student Billing</strong> to view and
                        record payments
                      </li>
                      <li>
                        Or grant a <strong>Conditional Clearance</strong> below
                        with authorisation notes
                      </li>
                    </ul>
                  </div>
                )}

                {clearance.status === "cleared" && (
                  <div className="card p-4 border border-green-200 dark:border-green-800/50 bg-green-50/50 dark:bg-green-900/10">
                    <div className="flex items-center gap-2 text-green-700 dark:text-green-400">
                      <CheckCircle className="w-4 h-4" />
                      <p className="text-sm font-semibold">
                        Student is Financially Cleared
                      </p>
                    </div>
                    <p className="text-xs text-ink-500 mt-1">
                      This student has no outstanding balance and is eligible
                      for all academic services: exams, transcripts, and
                      graduation.
                    </p>
                  </div>
                )}

                {clearance.status === "conditional" && (
                  <div className="card p-4 border border-orange-200 dark:border-orange-800/50 bg-orange-50/50 dark:bg-orange-900/10">
                    <div className="flex items-center gap-2 text-orange-700 dark:text-orange-400">
                      <ShieldAlert className="w-4 h-4" />
                      <p className="text-sm font-semibold">
                        Conditional Clearance in Effect
                      </p>
                    </div>
                    <p className="text-xs text-ink-500 mt-1">
                      This student has been manually cleared despite an
                      outstanding balance of{" "}
                      <strong>{formatRWF(balance)}</strong>. Follow up on
                      payment to resolve the balance.
                    </p>
                  </div>
                )}
              </div>
            </div>

            {/* ── Exam Eligibility ── */}
            <div className="card p-5">
              <div className="flex items-center justify-between gap-4 flex-wrap mb-4">
                <div className="flex items-center gap-2">
                  <Layers className="w-4 h-4 text-ink-400" />
                  <p className="text-sm font-semibold text-ink-700 dark:text-white">
                    Exam Eligibility
                  </p>
                  <span className="text-xs text-ink-400">— payment-plan based</span>
                </div>
                <div className="flex gap-1.5">
                  {([null, 1, 2] as const).map((s) => (
                    <button
                      key={String(s)}
                      onClick={() => setExamSemester(s)}
                      className={`px-3 py-1 rounded-lg text-xs font-medium border transition-colors ${
                        examSemester === s
                          ? "bg-brand text-white border-brand"
                          : "border-ink-200 dark:border-ink-600 text-ink-500 hover:border-ink-300"
                      }`}
                    >
                      {s === null ? "Hide" : `Semester ${s}`}
                    </button>
                  ))}
                </div>
              </div>

              {examSemester === null && (
                <p className="text-xs text-ink-400 py-4 text-center">
                  Select a semester above to check if this student may sit exams,
                  based on the payment plan of each fee structure.
                </p>
              )}

              {examSemester !== null && examQ.isLoading && (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="w-4 h-4 animate-spin text-brand" />
                </div>
              )}

              {examSemester !== null && examData && (
                <ExamEligibilityPanel data={examData} />
              )}
            </div>
            </>
          )}
        </>
      )}

      {/* ── Bulk tab ── */}
      {tab === "bulk" && yearId && (
        <div className="space-y-3">
          <div className="p-3 rounded-lg bg-brand/5 border border-brand/10 text-brand dark:text-gold-400 text-[12px] flex items-center gap-2">
            <RefreshCw className="w-3.5 h-3.5" />
            <span>
              Auto-clearance threshold for this year:{" "}
              <strong>
                {formatRWF(
                  years.find((y: any) => y.id === Number(yearId))
                    ?.clearance_threshold ?? 0,
                )}
              </strong>
              . Students at or below this balance will be cleared automatically.
            </span>
          </div>

          <div className="card overflow-hidden">
            {bulkQ.isLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="w-5 h-5 animate-spin text-brand" />
              </div>
            ) : records.length === 0 ? (
              <div className="text-center py-12 text-ink-400 text-sm">
                <ShieldX className="w-8 h-8 mx-auto mb-2 opacity-30" />
                <p className="font-medium text-ink-600 dark:text-ink-300">
                  No clearance records for this year.
                </p>
                <p className="text-xs mt-1.5 max-w-xs mx-auto">
                  Click{" "}
                  <strong className="text-ink-700 dark:text-ink-200">
                    Run Auto-Clearance
                  </strong>{" "}
                  above to evaluate all students who have fee invoices for this
                  academic year. Make sure invoices have been generated first —
                  students with no invoices will not appear here.
                </p>
              </div>
            ) : (
              <>
                {/* Summary row */}
                {(() => {
                  const cleared = records.filter(
                    (r: StudentClearance) => r.status === "cleared",
                  ).length;
                  const cond = records.filter(
                    (r: StudentClearance) => r.status === "conditional",
                  ).length;
                  const notClr = records.filter(
                    (r: StudentClearance) => r.status === "not_cleared",
                  ).length;
                  return (
                    <div className="px-4 py-3 border-b border-ink-100 dark:border-ink-700 flex gap-6 flex-wrap text-sm">
                      <span className="flex items-center gap-1.5 text-green-600">
                        <ShieldCheck className="w-3.5 h-3.5" /> {cleared}{" "}
                        Cleared
                      </span>
                      <span className="flex items-center gap-1.5 text-orange-600">
                        <ShieldAlert className="w-3.5 h-3.5" /> {cond}{" "}
                        Conditional
                      </span>
                      <span className="flex items-center gap-1.5 text-red-600">
                        <ShieldX className="w-3.5 h-3.5" /> {notClr} Not Cleared
                      </span>
                      <span className="text-ink-400 ml-auto text-xs">
                        {bulkData?.total ?? 0} total records
                      </span>
                    </div>
                  );
                })()}
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-ink-50 dark:bg-ink-700/50 text-ink-500 text-xs uppercase">
                      <tr>
                        <th className="px-4 py-2.5 text-left">Reg #</th>
                        <th className="px-4 py-2.5 text-left">Name</th>
                        <th className="px-4 py-2.5 text-left">Department</th>
                        <th className="px-4 py-2.5 text-right">Balance</th>
                        <th className="px-4 py-2.5 text-center">Status</th>
                        <th className="px-4 py-2.5 text-left">Cleared By</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-ink-100 dark:divide-ink-700">
                      {records.map((r: StudentClearance) => (
                        <tr
                          key={`${r.student_id}-${r.academic_year_id}`}
                          className="hover:bg-ink-50/50 dark:hover:bg-ink-700/30"
                        >
                          <td className="px-4 py-2.5 font-mono text-xs text-ink-500">
                            {r.regnumber ?? r.student_id}
                          </td>
                          <td className="px-4 py-2.5 font-medium">
                            {`${r.fname ?? ""} ${r.lname ?? ""}`.trim()}
                          </td>
                          <td className="px-4 py-2.5 text-ink-500 text-xs">
                            {r.department_name ?? "—"}
                          </td>
                          <td className="px-4 py-2.5 text-right font-mono">
                            <span
                              className={
                                Number(r.balance_at_clearance ?? 0) > 0
                                  ? "text-red-600"
                                  : "text-green-600"
                              }
                            >
                              {formatRWF(r.balance_at_clearance ?? 0)}
                            </span>
                          </td>
                          <td className="px-4 py-2.5 text-center">
                            <span
                              className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full ${CLEARANCE_STATUS_COLORS[r.status]}`}
                            >
                              {CLEARANCE_STATUS_LABELS[r.status]}
                            </span>
                          </td>
                          <td className="px-4 py-2.5 text-ink-400 text-xs">
                            {r.cleared_by_name ??
                              (r.auto_cleared ? "— Auto" : "—")}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {bulkData && bulkData.last_page > 1 && (
                  <div className="px-4 py-3 border-t border-ink-100 dark:border-ink-700">
                    <Pagination
                      currentPage={bulkData.current_page}
                      lastPage={bulkData.last_page}
                      total={bulkData.total}
                      perPage={bulkData.per_page}
                      onPageChange={setPage}
                    />
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}

      {/* ── Report tab ── */}
      {tab === "report" && (
        <div className="space-y-4">
          {!yearId && (
            <div className="card p-10 text-center text-ink-400">
              <FileBarChart2 className="w-8 h-8 mx-auto mb-2 opacity-30" />
              <p className="text-sm">Select an academic year to generate a clearance report.</p>
            </div>
          )}

          {yearId && !reportFeeStructureId && (
            <div className="card p-10 text-center text-ink-400">
              <FileBarChart2 className="w-8 h-8 mx-auto mb-2 opacity-30" />
              <p className="text-sm">Select a fee structure above to see the clearance breakdown.</p>
              {structures.length === 0 && !structuresQ.isLoading && (
                <p className="text-xs mt-1 text-ink-300">No active fee structures found for this year.</p>
              )}
            </div>
          )}

          {yearId && reportFeeStructureId && reportQ.isLoading && (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="w-6 h-6 animate-spin text-brand" />
            </div>
          )}

          {report && (
            <>
              {/* Fee structure context banner */}
              <div className="card p-4 flex items-center gap-4 flex-wrap border-l-4 border-l-brand bg-brand/5">
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-ink-500 uppercase tracking-wider font-semibold mb-0.5">
                    Report Context
                  </p>
                  <p className="font-semibold text-ink-800 dark:text-white text-sm">
                    {report.fee_structure.label}
                  </p>
                  <p className="text-xs text-ink-500 mt-0.5">
                    {report.fee_structure.department_name ?? "All Departments"}
                    {report.fee_structure.level_name ? ` · ${report.fee_structure.level_name}` : ""}
                    {" · "}
                    <span className="font-medium">{report.period_label}</span>
                    {" · Required per student: "}
                    <span className="font-semibold text-brand">{formatRWF(report.required_amount)}</span>
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-[11px] text-ink-400 uppercase font-semibold">Annual Amount</p>
                  <p className="text-lg font-bold text-ink-700 dark:text-white">
                    {formatRWF(report.fee_structure.amount)}
                  </p>
                </div>
              </div>

              {/* Summary cards */}
              {(() => {
                const s = report.summary;
                const collectionRate = s.total_billed > 0
                  ? Math.round((s.total_collected / s.total_billed) * 100)
                  : 0;
                const clearanceRate = s.total > 0
                  ? Math.round((s.cleared / s.total) * 100)
                  : 0;
                return (
                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
                    {[
                      { label: "Total Students", value: s.total, sub: null, color: "text-ink-700 dark:text-white", bg: "bg-ink-100 dark:bg-ink-700", icon: <User className="w-4 h-4" /> },
                      { label: "Cleared", value: s.cleared, sub: `${clearanceRate}%`, color: "text-green-700 dark:text-green-400", bg: "bg-green-100 dark:bg-green-900/30", icon: <ShieldCheck className="w-4 h-4" /> },
                      { label: "Partial", value: s.partial, sub: null, color: "text-orange-700 dark:text-orange-400", bg: "bg-orange-100 dark:bg-orange-900/30", icon: <ShieldAlert className="w-4 h-4" /> },
                      { label: "Not Paid", value: s.not_paid, sub: null, color: "text-red-700 dark:text-red-400", bg: "bg-red-100 dark:bg-red-900/30", icon: <ShieldX className="w-4 h-4" /> },
                      { label: "Collected", value: formatRWF(s.total_collected), sub: `${collectionRate}% of ${formatRWF(s.total_billed)}`, color: "text-brand dark:text-gold-400", bg: "bg-brand/10 dark:bg-brand/20", icon: <TrendingUp className="w-4 h-4" /> },
                    ].map((k) => (
                      <div key={k.label} className="card p-4">
                        <div className="flex items-start justify-between mb-2">
                          <p className="text-[11px] text-ink-400 uppercase font-semibold tracking-wide leading-tight">{k.label}</p>
                          <div className={`w-7 h-7 rounded-lg ${k.bg} flex items-center justify-center ${k.color} flex-shrink-0`}>
                            {k.icon}
                          </div>
                        </div>
                        <p className={`text-xl font-bold ${k.color}`}>{k.value}</p>
                        {k.sub && <p className="text-[11px] text-ink-400 mt-0.5">{k.sub}</p>}
                      </div>
                    ))}
                  </div>
                );
              })()}

              {/* Collection progress bar */}
              {(() => {
                const s = report.summary;
                const pct = s.total_billed > 0 ? Math.min(Math.round((s.total_collected / s.total_billed) * 100), 100) : 0;
                return (
                  <div className="card p-4">
                    <div className="flex justify-between text-xs mb-2">
                      <span className="font-medium text-ink-600 dark:text-ink-300 flex items-center gap-1.5">
                        <TrendingUp className="w-3.5 h-3.5 text-brand" /> Collection Progress
                      </span>
                      <span className={`font-bold ${pct >= 80 ? "text-green-600" : pct >= 50 ? "text-orange-600" : "text-red-600"}`}>
                        {formatRWF(s.total_collected)} / {formatRWF(s.total_billed)} ({pct}%)
                      </span>
                    </div>
                    <div className="h-3 bg-ink-200 dark:bg-ink-700 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all ${pct >= 80 ? "bg-green-500" : pct >= 50 ? "bg-orange-400" : "bg-red-500"}`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <div className="flex gap-4 mt-1.5 text-[11px] text-ink-400">
                      <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-green-500 inline-block" /> Cleared: {report.summary.cleared}</span>
                      <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-orange-400 inline-block" /> Partial: {report.summary.partial}</span>
                      <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-red-500 inline-block" /> Not Paid: {report.summary.not_paid}</span>
                    </div>
                  </div>
                );
              })()}

              {/* Search + table */}
              <div className="card overflow-hidden">
                {/* Search bar */}
                <div className="px-4 py-3 border-b border-ink-100 dark:border-ink-700 flex items-center gap-3">
                  <Search className="w-4 h-4 text-ink-400 flex-shrink-0" />
                  <input
                    type="text"
                    className="bg-transparent text-sm outline-none flex-1 placeholder-ink-300 dark:placeholder-ink-500"
                    placeholder="Filter by name, reg number, or department…"
                    value={reportSearch}
                    onChange={(e) => {
                      setReportSearch(e.target.value);
                      setReportPage(1);
                    }}
                  />
                  {reportSearch && (
                    <button
                      className="text-xs text-ink-400 hover:text-ink-600"
                      onClick={() => { setReportSearch(""); setReportPage(1); }}
                    >
                      Clear
                    </button>
                  )}
                  <span className="text-xs text-ink-400 flex-shrink-0">
                    {reportStudents.length} / {report.summary.total} students
                  </span>
                </div>

                {reportStudents.length === 0 ? (
                  <div className="text-center py-12 text-ink-400 text-sm">
                    <ShieldX className="w-8 h-8 mx-auto mb-2 opacity-30" />
                    <p>{reportSearch ? "No students match your search." : "No students found for this fee structure."}</p>
                  </div>
                ) : (
                  <>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead className="bg-ink-50 dark:bg-ink-700/50 text-ink-500 text-xs uppercase">
                          <tr>
                            <th className="px-4 py-2.5 text-left w-8">#</th>
                            <th className="px-4 py-2.5 text-left">Reg #</th>
                            <th className="px-4 py-2.5 text-left">Name</th>
                            <th className="px-4 py-2.5 text-left">Department</th>
                            <th className="px-4 py-2.5 text-right">Required</th>
                            <th className="px-4 py-2.5 text-right">Covered</th>
                            <th className="px-4 py-2.5 text-right">Shortfall</th>
                            <th className="px-4 py-2.5 text-center">Status</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-ink-100 dark:divide-ink-700">
                          {reportStudents
                            .slice((reportPage - 1) * REPORT_PER_PAGE, reportPage * REPORT_PER_PAGE)
                            .map((s, idx) => (
                              <tr
                                key={s.student_id}
                                className="hover:bg-ink-50/50 dark:hover:bg-ink-700/20 transition-colors"
                              >
                                <td className="px-4 py-2.5 text-ink-400 text-xs">
                                  {(reportPage - 1) * REPORT_PER_PAGE + idx + 1}
                                </td>
                                <td className="px-4 py-2.5 font-mono text-xs text-ink-500">
                                  {s.regnumber}
                                </td>
                                <td className="px-4 py-2.5 font-medium text-ink-800 dark:text-ink-100">
                                  {`${s.fname} ${s.lname}`.trim()}
                                </td>
                                <td className="px-4 py-2.5 text-ink-500 text-xs">
                                  {s.department_name ?? "—"}
                                </td>
                                <td className="px-4 py-2.5 text-right font-mono text-xs text-ink-600 dark:text-ink-300">
                                  {formatRWF(s.required_this_period)}
                                </td>
                                <td className="px-4 py-2.5 text-right font-mono text-xs">
                                  <span className={s.total_covered >= s.required_this_period ? "text-green-600" : "text-orange-600"}>
                                    {formatRWF(s.total_covered)}
                                  </span>
                                  {s.bursary_applied > 0 && (
                                    <span className="block text-[10px] text-blue-500">
                                      incl. {formatRWF(s.bursary_applied)} bursary
                                    </span>
                                  )}
                                </td>
                                <td className="px-4 py-2.5 text-right font-mono text-xs">
                                  {s.shortfall > 0 ? (
                                    <span className="text-red-600">{formatRWF(s.shortfall)}</span>
                                  ) : (
                                    <span className="text-green-600">—</span>
                                  )}
                                </td>
                                <td className="px-4 py-2.5 text-center">
                                  <ReportStatusBadge status={s.status} />
                                </td>
                              </tr>
                            ))}
                        </tbody>
                      </table>
                    </div>

                    {/* Pagination */}
                    {Math.ceil(reportStudents.length / REPORT_PER_PAGE) > 1 && (
                      <div className="px-4 py-3 border-t border-ink-100 dark:border-ink-700">
                        <Pagination
                          currentPage={reportPage}
                          lastPage={Math.ceil(reportStudents.length / REPORT_PER_PAGE)}
                          total={reportStudents.length}
                          perPage={REPORT_PER_PAGE}
                          onPageChange={setReportPage}
                        />
                      </div>
                    )}
                  </>
                )}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

const REPORT_PER_PAGE = 25;

function ReportStatusBadge({ status }: { status: ClearanceReportStudentStatus }) {
  if (status === "cleared") return (
    <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400">
      <CheckCircle className="w-3 h-3" /> Cleared
    </span>
  );
  if (status === "partial") return (
    <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400">
      <Clock className="w-3 h-3" /> Partial
    </span>
  );
  return (
    <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400">
      <AlertTriangle className="w-3 h-3" /> Not Paid
    </span>
  );
}

// ─── Exam Eligibility Panel ───────────────────────────────────────────────────

function ExamEligibilityPanel({ data }: { data: ExamEligibility }) {
  const eligible = data.eligible

  return (
    <div className="space-y-4">
      {/* Overall verdict */}
      <div className={`rounded-xl p-4 flex items-start gap-3 border ${
        eligible
          ? "bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800/50"
          : "bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800/50"
      }`}>
        <div className={`mt-0.5 ${eligible ? "text-green-600" : "text-red-600"}`}>
          {eligible
            ? <CalendarCheck className="w-5 h-5" />
            : <CalendarX className="w-5 h-5" />}
        </div>
        <div className="flex-1">
          <p className={`font-semibold text-sm ${eligible ? "text-green-700 dark:text-green-400" : "text-red-700 dark:text-red-400"}`}>
            {eligible
              ? `Eligible to sit Semester ${data.semester} exams`
              : `Not eligible for Semester ${data.semester} exams`}
          </p>
          {eligible ? (
            <p className="text-xs text-ink-500 mt-0.5">
              All required installments for Semester {data.semester} have been covered.
            </p>
          ) : (
            <p className="text-xs text-ink-500 mt-0.5">
              Outstanding shortfall of <strong className="text-red-600">{formatRWF(data.total_shortfall)}</strong> must
              be paid before sitting exams. Required by S{data.semester}: {formatRWF(data.total_required)} · Covered: {formatRWF(data.total_covered)}.
            </p>
          )}
        </div>
      </div>

      {/* Per-fee breakdown */}
      {data.items.length === 0 && (
        <p className="text-xs text-ink-400 text-center py-3">
          No invoices found for this student in this academic year.
          Generate invoices first, then re-check eligibility.
        </p>
      )}

      {data.items.length > 0 && (
        <div className="rounded-xl border border-ink-200 dark:border-ink-600 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-ink-50 dark:bg-ink-700/50 text-ink-500 text-[11px] uppercase">
              <tr>
                <th className="px-3 py-2 text-left">Fee</th>
                <th className="px-3 py-2 text-left">Plan</th>
                <th className="px-3 py-2 text-right">Annual</th>
                <th className="px-3 py-2 text-right">Due S{data.semester}</th>
                <th className="px-3 py-2 text-right">Covered</th>
                <th className="px-3 py-2 text-center">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ink-100 dark:divide-ink-700">
              {data.items.map((item) => (
                <tr key={item.fee_type}>
                  <td className="px-3 py-2.5">
                    <div className="font-medium text-xs">{item.label}</div>
                    <div className="text-[10px] text-ink-400">
                      {(FEE_TYPE_LABELS as Record<string, string>)[item.fee_type] ?? item.fee_type}
                    </div>
                  </td>
                  <td className="px-3 py-2.5">
                    <PlanBadge plan={item.payment_plan} count={item.installment_count} />
                  </td>
                  <td className="px-3 py-2.5 text-right font-mono text-xs text-ink-500">
                    {formatRWF(item.total_billed)}
                  </td>
                  <td className="px-3 py-2.5 text-right font-mono text-xs font-semibold">
                    {formatRWF(item.min_required)}
                  </td>
                  <td className="px-3 py-2.5 text-right font-mono text-xs">
                    <span className={item.eligible ? "text-green-600" : "text-red-600"}>
                      {formatRWF(item.total_covered)}
                    </span>
                  </td>
                  <td className="px-3 py-2.5 text-center">
                    {item.eligible
                      ? <span className="inline-flex items-center gap-1 text-[10px] font-medium text-green-700 bg-green-100 dark:bg-green-900/30 dark:text-green-400 px-2 py-0.5 rounded-full">
                          <CheckCircle className="w-3 h-3" /> OK
                        </span>
                      : <span className="inline-flex items-center gap-1 text-[10px] font-medium text-red-700 bg-red-100 dark:bg-red-900/30 dark:text-red-400 px-2 py-0.5 rounded-full">
                          <AlertTriangle className="w-3 h-3" /> {formatRWF(item.shortfall)} short
                        </span>
                    }
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Installment schedules */}
      {data.items.filter(i => i.payment_plan !== 'full_year').map((item) => (
        <InstallmentSchedule key={item.fee_type} item={item} examSemester={data.semester} />
      ))}
    </div>
  )
}

function PlanBadge({ plan, count }: { plan: string; count: number }) {
  const labels: Record<string, string> = {
    full_year: 'Full year',
    per_semester: '2× semester',
    per_installment: `${count}× install.`,
  }
  const colors: Record<string, string> = {
    full_year: 'bg-ink-100 text-ink-600 dark:bg-ink-700 dark:text-ink-300',
    per_semester: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
    per_installment: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400',
  }
  return (
    <span className={`inline-block text-[10px] font-medium px-1.5 py-0.5 rounded ${colors[plan] ?? colors.full_year}`}>
      {labels[plan] ?? plan}
    </span>
  )
}

function InstallmentSchedule({ item, examSemester }: { item: ExamEligibilityItem; examSemester: 1 | 2 }) {
  return (
    <div className="rounded-xl border border-ink-200 dark:border-ink-600 overflow-hidden">
      <div className="bg-ink-50 dark:bg-ink-700/40 px-3 py-2 flex items-center justify-between">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-ink-500">
          {item.label} — Payment Schedule
        </span>
        <PlanBadge plan={item.payment_plan} count={item.installment_count} />
      </div>
      <div className="p-3">
        <div className="flex gap-2 flex-wrap">
          {item.schedule.map((inst, i) => {
            const isDue = inst.for_exam_s <= examSemester
            return (
              <div
                key={i}
                className={`flex-1 min-w-[100px] rounded-lg border-2 p-2.5 text-center transition-colors ${
                  inst.covered
                    ? 'border-green-300 bg-green-50 dark:bg-green-900/20 dark:border-green-700'
                    : isDue
                    ? 'border-red-300 bg-red-50 dark:bg-red-900/20 dark:border-red-700'
                    : 'border-ink-200 bg-ink-50/50 dark:bg-ink-800 dark:border-ink-600'
                }`}
              >
                <p className="text-[10px] text-ink-400 mb-0.5">{inst.label}</p>
                <p className="text-xs font-mono font-semibold">{formatRWF(inst.amount)}</p>
                <p className={`text-[10px] mt-1 font-medium ${
                  inst.covered ? 'text-green-600' : isDue ? 'text-red-500' : 'text-ink-400'
                }`}>
                  {inst.covered ? '✓ Covered' : isDue ? '⚠ Due' : '○ Later'}
                </p>
              </div>
            )
          })}
        </div>
        <p className="text-[10px] text-ink-400 mt-2">
          Covered = cumulative payments have reached or exceeded this installment.
          {item.total_covered > 0 && ` Total paid so far: ${formatRWF(item.total_covered)}.`}
        </p>
      </div>
    </div>
  )
}
