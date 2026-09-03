// Re-trigger frontend deployment
import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Link, useSearchParams } from "react-router-dom";
import {
  Loader2,
  Search,
  Filter,
  Download,
  Users,
  CheckCircle2,
  Banknote,
  TrendingUp,
  CreditCard,
  ShieldAlert,
  ArrowRight,
  X,
  FileText,
} from "lucide-react";

type KpiFilter = "all" | "expected" | "collected" | "bursary" | "pending" | "partial" | "overdue";
import toast from "react-hot-toast";
import { billingService, feeInvoicePdfService } from "@/services/financeService";
import { academicService } from "@/services/academicService";
import { api, apiClient } from "@/services/api";
import { useSystemStore } from "@/store/systemStore";
import { formatRWF } from "@/utils/formatCurrency";
import SearchableSelect from "@/components/ui/SearchableSelect";
import Pagination from "@/components/ui/Pagination";
import StudentBillingFormModal from "@/components/finance/StudentBillingFormModal";
import type { BillingSummary } from "@/types/finance";

export default function StudentBillingPage() {
  const basics = useSystemStore((s) => s.basics);
  const selectedTermId = useSystemStore((s) => s.selectedTermId);

  const [yearId, setYearId] = useState<string | number>("");
  const [semester, setSemester] = useState<string | number>("");
  const [billingFormOpen, setBillingFormOpen] = useState(false);

  // For billing, we use intake years from student table, not the global academic year
  // Don't auto-select a year — let user choose from available intake cohorts

  // Sync with global academic term
  useEffect(() => {
    if (selectedTermId !== null) {
      setSemester(selectedTermId);
    } else {
      // Fallback to active term if "All terms" is selected
      const active = basics?.active_term as any;
      if (active?.id) setSemester(active.id);
    }
  }, [selectedTermId, basics?.active_term]);

  const [searchParams, setSearchParams] = useSearchParams();

  const [facultyId, setFacultyId] = useState<string | number>("");
  const [deptId, setDeptId] = useState<string | number>("");
  // Programme (option) — the level the registry actually bills at.
  const [optionId, setOptionId] = useState<string | number>("");
  const [keyword, setKeyword] = useState("");
  const [debouncedKeyword, setDebouncedKeyword] = useState("");
  const [page, setPage] = useState(1);

  const VALID_KPI: KpiFilter[] = ["all", "expected", "collected", "bursary", "pending", "partial", "overdue"];
  const kpiFromUrl = searchParams.get("kpi") as KpiFilter | null;
  const [activeKpi, setActiveKpi] = useState<KpiFilter>(
    kpiFromUrl && VALID_KPI.includes(kpiFromUrl) ? kpiFromUrl : "all"
  );

  // Keep activeKpi in sync if URL param changes externally (e.g. browser back)
  useEffect(() => {
    const p = searchParams.get("kpi") as KpiFilter | null;
    if (p && VALID_KPI.includes(p)) setActiveKpi(p);
    else setActiveKpi("all");
  }, [searchParams]);

  const handleKpiClick = (id: KpiFilter) => {
    const next = activeKpi === id ? "all" : id;
    setActiveKpi(next);
    setPage(1);
    if (next === "all") {
      setSearchParams(p => { p.delete("kpi"); return p; }, { replace: true });
    } else {
      setSearchParams(p => { p.set("kpi", next); return p; }, { replace: true });
    }
  };

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedKeyword(keyword);
      setPage(1);
    }, 500);
    return () => clearTimeout(timer);
  }, [keyword]);

  // ─── Data Fetching ─────────────────────────────────────────────────────────

  const yearsQ = useQuery({
    queryKey: ["finance", "billing", "intake-years"],
    queryFn: () => api.get<any>("/api/finance/billing/intake-years"),
  });
  // getIntakeYears() returns a flat array, so the payload is one level up from
  // the paginated dropdowns below (faculties/departments/options), which nest
  // their rows inside a {data, total} envelope.
  const years = yearsQ.data?.data ?? [];

  const termsQ = useQuery({
    queryKey: ["academic-terms", yearId],
    queryFn: () => academicService.listTerms(),
    enabled: !!yearId,
  });
  const terms = (termsQ.data?.data ?? []).filter(
    (t) => t.academic_year_id === Number(yearId),
  );

  const facultiesQ = useQuery({
    queryKey: ["faculties"],
    queryFn: () => api.get<any>("/api/academics-management/faculties"),
  });
  const faculties = facultiesQ.data?.data?.data ?? [];

  const departmentsQ = useQuery({
    queryKey: ["departments", facultyId],
    queryFn: () =>
      api.get<any>(
        "/api/academics-management/departments",
        facultyId ? { fac_id: facultyId } : {},
      ),
  });
  const departments = departmentsQ.data?.data?.data ?? [];

  // Programmes for the chosen department (or all, when none is chosen).
  const optionsQ = useQuery({
    queryKey: ["options", deptId],
    queryFn: () =>
      api.get<any>(
        "/api/academics-management/options",
        deptId ? { department_id: deptId } : {},
      ),
  });
  const options = optionsQ.data?.data?.data ?? [];

  // State for selecting students for bulk generation
  const [selectedStudents, setSelectedStudents] = useState<Set<string>>(new Set());
  const [selectAll, setSelectAll] = useState(false);

  const summaryQ = useQuery({
    queryKey: [
      "finance",
      "billing-all-students",
      yearId,
      semester,
      facultyId,
      deptId,
      optionId,
      debouncedKeyword,
      page,
    ],
    queryFn: () => {
      // If no year selected, fetch without yearId to show all active students
      if (!yearId) {
        return api.get<any>('/api/finance/billing/all-students', {
          semester: semester ? Number(semester) : undefined,
          faculty_id: facultyId ? Number(facultyId) : undefined,
          department_id: deptId ? Number(deptId) : undefined,
          option_id: optionId ? Number(optionId) : undefined,
          keyword: debouncedKeyword,
          page,
          per_page: 50,
        });
      }
      // If year selected, filter by that year. Sent as-is rather than through
      // Number(): a cohort with no `academic_years` row is identified by its
      // intake label ("2023-2024"), which Number() would turn into NaN.
      return api.get<any>('/api/finance/billing/all-students', {
        academic_year_id: yearId,
        semester: semester ? Number(semester) : undefined,
        faculty_id: facultyId ? Number(facultyId) : undefined,
        department_id: deptId ? Number(deptId) : undefined,
        option_id: optionId ? Number(optionId) : undefined,
        keyword: debouncedKeyword,
        page,
        per_page: 50,
      });
    },
    // Always enabled - load all students or filtered students
  });

  const paginated = summaryQ.data?.data as any;
  // `/billing/all-students` reports raw ledger columns (opening_balance,
  // invoiced, paid, bursary, total_balance) while `/billing/summary` reports
  // the aggregated shape this screen renders. Normalise here so both payloads
  // drive the same KPI cards and table.
  const students: BillingSummary[] = ((paginated?.data ?? []) as any[]).map((s: any) => {
    const opening  = Number(s.opening_balance ?? 0);
    const invoiced = Number(s.invoiced ?? 0);
    const balance  = Number(s.balance ?? s.total_balance ?? 0);
    return {
      ...s,
      current_billed:      Number(s.current_billed ?? invoiced),
      opening_balance:     opening,
      opening_outstanding: Number(s.opening_outstanding ?? Math.max(0, Math.min(opening, balance))),
      total_expected:      Number(s.total_expected ?? (opening + invoiced)),
      total_collected:     Number(s.total_collected ?? s.paid ?? 0),
      total_bursary:       Number(s.total_bursary ?? s.bursary ?? 0),
      balance,
    };
  });
  const totalItems = paginated?.total ?? 0;

  // Calculate aggregates from displayed students
  const totalExpected = students.reduce((sum, s: any) => sum + (s.total_expected || 0), 0);
  const totalCollected = students.reduce((sum, s: any) => sum + (s.total_collected || 0), 0);
  const totalBursary = students.reduce((sum, s: any) => sum + (s.total_bursary || 0), 0);
  const totalRemaining = totalExpected - totalCollected - totalBursary;
  const partialCount = students.filter((s: any) => (s.total_collected || 0) > 0 && (s.balance || 0) > 0).length;
  const partialBalance = students
    .filter((s: any) => (s.total_collected || 0) > 0 && (s.balance || 0) > 0)
    .reduce((sum, s: any) => sum + (s.balance || 0), 0);

  // Server handles filtering — use students directly
  const filteredStudents = students;

  // Update selectAll when students change
  useEffect(() => {
    if (filteredStudents.length > 0 && selectedStudents.size === filteredStudents.length) {
      setSelectAll(true);
    } else {
      setSelectAll(false);
    }
  }, [filteredStudents, selectedStudents]);

  const kpiLabels: Record<KpiFilter, string> = {
    all:      "",
    expected: "Expected Revenue",
    collected:"Collected",
    bursary:  "Bursary Credits",
    pending:  "Pending Balance",
    partial:  "Partial Payments",
    overdue:  "Overdue",
  };

  // ─── Bulk Actions ──────────────────────────────────────────────────────────

  const bulkMutation = useMutation({
    mutationFn: (studentIds: string[]) =>
      billingService.bulkGenerate({
        academic_year_id: Number(yearId),
        student_ids: studentIds,
      }),
    onSuccess: (res: any) => {
      const data = res.data;
      const parts = [
        `Students processed: ${data.processed_students}`,
        `New invoices: ${data.total_created}`,
        data.total_updated > 0 ? `Updated: ${data.total_updated}` : null,
        `Unchanged: ${data.total_skipped}`,
      ].filter(Boolean).join(' · ');
      toast.success(`Bulk generation complete! ${parts}`, { duration: 6000 });
      setSelectedStudents(new Set());
      setSelectAll(false);
      summaryQ.refetch();
    },
    onError: (e: any) =>
      toast.error(e?.response?.data?.message ?? "Bulk generation failed"),
  });

  const handleExport = () => {
    if (!yearId) return;
    const params = new URLSearchParams({
      academic_year_id: String(yearId),
      ...(semester && { semester: String(semester) }),
      ...(facultyId && { faculty_id: String(facultyId) }),
      ...(deptId && { department_id: String(deptId) }),
      ...(optionId && { option_id: String(optionId) }),
      ...(debouncedKeyword && { keyword: debouncedKeyword }),
    });
    window.open(
      `${apiClient.defaults.baseURL}/api/finance/billing/export?${params.toString()}`,
      "_blank",
    );
  };

  const collectedPct = totalExpected > 0 ? Math.min((totalCollected / totalExpected) * 100, 100) : 0
  const bursaryPct   = totalExpected > 0 ? Math.min((totalBursary   / totalExpected) * 100, 100) : 0

  return (
    <div className="space-y-5 animate-fade-in pb-12">

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-xl font-bold text-ink-900 dark:text-white tracking-tight flex items-center gap-2">
            <span className="w-8 h-8 rounded-lg bg-brand/10 flex items-center justify-center">
              <Users className="w-4 h-4 text-brand" />
            </span>
            Bulk Billing Management
          </h2>
          <p className="text-[13px] text-ink-500 mt-0.5 ml-10">
            Student balances and group invoicing overview.
          </p>
        </div>
        <div className="flex gap-2">
          <button
            className="btn-ghost btn-sm flex items-center gap-1.5 px-3 border border-ink-200 dark:border-ink-700 text-ink-600 dark:text-ink-300"
            onClick={() => setBillingFormOpen(true)}
          >
            <FileText className="w-3.5 h-3.5" />
            Billing Form
          </button>
          <button
            className="btn-ghost btn-sm flex items-center gap-1.5 px-3 border border-ink-200 dark:border-ink-700 text-ink-600 dark:text-ink-300"
            onClick={handleExport}
            disabled={!yearId}
          >
            <Download className="w-3.5 h-3.5" />
            Export CSV
          </button>
        </div>
      </div>

      {/* ── KPI Cards ──────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        {([
          {
            id: "expected" as KpiFilter,
            label: "Expected Revenue",
            value: formatRWF(totalExpected),
            icon: Banknote,
            accent: "brand",
            bar: 100,
          },
          {
            id: "collected" as KpiFilter,
            label: "Collected",
            value: formatRWF(totalCollected),
            icon: CheckCircle2,
            accent: "green",
            bar: collectedPct,
          },
          {
            id: "bursary" as KpiFilter,
            label: "Bursary Credits",
            value: formatRWF(totalBursary),
            icon: CreditCard,
            accent: "blue",
            bar: bursaryPct,
          },
          {
            id: "partial" as KpiFilter,
            label: `Partial · ${partialCount} student${partialCount !== 1 ? "s" : ""}`,
            value: formatRWF(partialBalance),
            icon: TrendingUp,
            accent: "orange",
            bar: null,
          },
          {
            id: "pending" as KpiFilter,
            label: "Pending Balance",
            value: formatRWF(totalRemaining),
            icon: ShieldAlert,
            accent: "red",
            bar: null,
          },
        ] as const).map((stat) => {
          const isActive = activeKpi === stat.id
          const accentMap: Record<string, { icon: string; val: string; ring: string; dot: string; activeBorder: string }> = {
            brand:  { icon: "bg-brand/10 text-brand",          val: "text-brand",       ring: "ring-brand/30",      dot: "bg-brand",    activeBorder: "border-brand/30" },
            green:  { icon: "bg-green-50 text-green-600 dark:bg-green-900/20",  val: "text-green-600",   ring: "ring-green-400/30",  dot: "bg-green-500", activeBorder: "border-green-300/50" },
            blue:   { icon: "bg-blue-50 text-blue-500 dark:bg-blue-900/20",     val: "text-blue-500",    ring: "ring-blue-400/30",   dot: "bg-blue-500",  activeBorder: "border-blue-300/50" },
            orange: { icon: "bg-orange-50 text-orange-500 dark:bg-orange-900/20", val: "text-orange-500", ring: "ring-orange-400/30", dot: "bg-orange-400",activeBorder: "border-orange-300/50" },
            red:    { icon: "bg-red-50 text-red-500 dark:bg-red-900/20",        val: "text-red-500",     ring: "ring-red-400/30",    dot: "bg-red-500",   activeBorder: "border-red-300/50" },
          }
          const a = accentMap[stat.accent]
          return (
            <button
              key={stat.id}
              onClick={() => handleKpiClick(stat.id)}
              className={`card p-4 text-left w-full transition-all duration-150 flex flex-col gap-3
                ${isActive
                  ? `ring-2 ${a.ring} ${a.activeBorder} shadow-md`
                  : "hover:shadow-md hover:border-ink-200 dark:hover:border-ink-600"
                }`}
            >
              <div className="flex items-start justify-between gap-2">
                <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${a.icon}`}>
                  <stat.icon className="w-4 h-4" />
                </div>
                {isActive && (
                  <span className={`text-[9px] font-bold uppercase tracking-widest px-1.5 py-0.5 rounded-full border ${a.activeBorder} ${a.val} bg-current/0`}>
                    Active
                  </span>
                )}
              </div>
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wider text-ink-400 mb-0.5">
                  {stat.label}
                </p>
                <p className={`text-base font-bold leading-tight ${a.val}`}>
                  {stat.value}
                </p>
              </div>
              {stat.bar !== null && (
                <div className="w-full h-1 bg-ink-100 dark:bg-ink-700 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full ${a.dot} transition-all duration-500`}
                    style={{ width: `${stat.bar > 0 ? Math.max(2, stat.bar) : 0}%` }}
                  />
                </div>
              )}
            </button>
          )
        })}
      </div>

      {/* ── Filters & Bulk Generation ─────────────────────────────────────── */}
      <div className="space-y-3">
        {/* Filters */}
        <div className="card p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 items-end">
          <div>
            <label className="block text-[10px] font-bold uppercase tracking-wider text-ink-400 mb-1.5">Academic Year</label>
            <SearchableSelect
              options={years.map((y: any) => ({ value: y.id, label: y.label }))}
              value={yearId}
              onChange={(v) => { setYearId(v); setPage(1) }}
              placeholder="Select year…"
            />
          </div>
          <div>
            <label className="block text-[10px] font-bold uppercase tracking-wider text-ink-400 mb-1.5">Semester / Term</label>
            <SearchableSelect
              options={[{ value: "", label: "Full Year" }, ...terms.map((t: any) => ({ value: t.semester ?? 0, label: t.label }))]}
              value={semester}
              onChange={(v) => { setSemester(v); setPage(1) }}
              placeholder="All terms"
            />
          </div>
          <div>
            <label className="block text-[10px] font-bold uppercase tracking-wider text-ink-400 mb-1.5">Faculty</label>
            <SearchableSelect
              options={faculties.map((f: any) => ({ value: f.fac_id, label: f.fac_name }))}
              value={facultyId}
              onChange={(v) => { setFacultyId(v); setDeptId(""); setOptionId(""); setPage(1) }}
              placeholder="All faculties"
              allLabel="All faculties"
            />
          </div>
          <div>
            <label className="block text-[10px] font-bold uppercase tracking-wider text-ink-400 mb-1.5">Department</label>
            <SearchableSelect
              options={departments.map((d: any) => ({ value: d.dep_id, label: d.dep_name }))}
              value={deptId}
              onChange={(v) => { setDeptId(v); setOptionId(""); setPage(1) }}
              placeholder="All departments"
              allLabel="All departments"
              disabled={!facultyId && departments.length === 0}
            />
          </div>
          <div>
            <label className="block text-[10px] font-bold uppercase tracking-wider text-ink-400 mb-1.5">Programme</label>
            <SearchableSelect
              options={options.map((o: any) => ({ value: o.id, label: o.name }))}
              value={optionId}
              onChange={(v) => { setOptionId(v); setPage(1) }}
              placeholder="All programmes"
              allLabel="All programmes"
            />
          </div>
          <div>
            <label className="block text-[10px] font-bold uppercase tracking-wider text-ink-400 mb-1.5">Search Students</label>
            <div className="relative group">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-ink-300 group-focus-within:text-brand transition-colors" />
              <input
                className="input input-sm pl-9 w-full"
                placeholder="Name or Reg #…"
                value={keyword}
                onChange={(e) => setKeyword(e.target.value)}
              />
              {keyword && (
                <button onClick={() => setKeyword("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-ink-300 hover:text-red-500">
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Bulk Generation Control */}
        {yearId && selectedStudents.size > 0 && (
          <div className="card p-4 bg-gradient-to-r from-brand/5 to-blue-500/5 border border-brand/20 flex items-center justify-between gap-4 flex-wrap">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-brand/10 flex items-center justify-center">
                <TrendingUp className="w-5 h-5 text-brand" />
              </div>
              <div>
                <p className="font-semibold text-sm text-ink-900 dark:text-white">Generate Invoices</p>
                <p className="text-[12px] text-ink-500">
                  Create TUITION and other fee invoices for {selectedStudents.size} selected student{selectedStudents.size !== 1 ? 's' : ''}
                </p>
              </div>
            </div>
            <button
              className="btn-primary btn-sm flex items-center gap-1.5 px-4 shrink-0"
              onClick={() => {
                if (confirm(`Generate invoices for ${selectedStudents.size} student${selectedStudents.size !== 1 ? 's' : ''}? This may take a moment.`)) {
                  bulkMutation.mutate(Array.from(selectedStudents))
                }
              }}
              disabled={bulkMutation.isPending}
            >
              {bulkMutation.isPending
                ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                : <TrendingUp className="w-3.5 h-3.5" />}
              {bulkMutation.isPending ? "Generating..." : "Generate Now"}
            </button>
          </div>
        )}
      </div>

      {/* ── Table ──────────────────────────────────────────────────────────── */}
      <div className="card overflow-hidden shadow-sm">
        {/* Table header bar */}
        <div className="px-5 py-3 border-b border-ink-100 dark:border-ink-700 flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <Filter className="w-3.5 h-3.5 text-ink-400" />
            <span className="text-xs font-bold uppercase tracking-widest text-ink-500">Student Summaries</span>
            <span className="bg-brand/10 text-brand px-2 py-0.5 rounded-full text-[10px] font-bold">
              {totalItems.toLocaleString()} results
            </span>
          </div>
          {activeKpi !== "all" && (
            <div className="flex items-center gap-2">
              <span className="text-[11px] text-ink-400">
                Filtering: <span className="font-semibold text-ink-700 dark:text-ink-200">{kpiLabels[activeKpi]}</span>
              </span>
              <button
                onClick={() => handleKpiClick("all")}
                className="flex items-center gap-1 text-[11px] text-ink-400 hover:text-red-500 border border-ink-200 dark:border-ink-700 rounded-md px-2 py-0.5 hover:border-red-300 transition-colors"
              >
                <X className="w-3 h-3" /> Clear
              </button>
            </div>
          )}
        </div>

        {summaryQ.isLoading ? (
          <div className="flex flex-col items-center justify-center py-20 gap-3">
            <div className="relative w-12 h-12">
              <div className="w-12 h-12 border-4 border-brand/10 border-t-brand rounded-full animate-spin" />
              <Users className="w-4 h-4 absolute inset-0 m-auto text-brand" />
            </div>
            <p className="text-sm text-ink-400">Crunching financial data…</p>
          </div>
        ) : filteredStudents.length === 0 ? (
          <div className="py-20 text-center space-y-2">
            <Search className="w-10 h-10 text-ink-200 mx-auto mb-2" />
            <p className="font-bold text-ink-800 dark:text-white">
              {activeKpi !== "all" ? `No students with ${kpiLabels[activeKpi]}` : "No students found"}
            </p>
            <p className="text-ink-400 text-sm">
              {activeKpi !== "all"
                ? <button onClick={() => setActiveKpi("all")} className="text-brand hover:underline">Clear filter</button>
                : "Try adjusting your filters or search terms."}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-ink-50/60 dark:bg-ink-800/40 border-b border-ink-100 dark:border-ink-700">
                  <th className="px-4 py-3 text-center w-12">
                    <input
                      type="checkbox"
                      checked={selectAll && filteredStudents.length > 0}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setSelectedStudents(new Set(filteredStudents.map((s: any) => s.regnumber)))
                          setSelectAll(true)
                        } else {
                          setSelectedStudents(new Set())
                          setSelectAll(false)
                        }
                      }}
                      className="checkbox checkbox-sm"
                    />
                  </th>
                  {[
                    { label: "Student",      align: "text-left",  cls: "" },
                    { label: "Department",   align: "text-left",  cls: "hidden lg:table-cell" },
                    // The registry's three columns: what was charged THIS
                    // year, what was carried forward, and the running total.
                    { label: "Billing",      align: "text-right", cls: "hidden md:table-cell" },
                    { label: "Open balance", align: "text-right", cls: "hidden md:table-cell" },
                    { label: "Invoiced",     align: "text-right", cls: "" },
                    { label: "Paid",         align: "text-right", cls: "" },
                    { label: "Bursary",      align: "text-right", cls: "" },
                    { label: "Remaining",    align: "text-right", cls: "" },
                    { label: "",             align: "text-center",cls: "w-12" },
                  ].map((h, i) => (
                    <th key={i} className={`px-4 py-3 ${h.align} text-[10px] font-bold uppercase tracking-wider text-ink-400 ${h.cls}`}>
                      {h.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-ink-50 dark:divide-ink-800/60">
                {filteredStudents.map((s) => {
                  const paid    = Number(s.total_collected)
                  const bursary = Number(s.total_bursary)
                  const due     = Number(s.total_expected)
                  const bal     = Math.max(0, Number(s.balance))
                  // Billing = charged for this academic year.
                  // Open balance = rolled forward from previous years, billed
                  // as a single ARREARS invoice by FeeService.
                  const billed  = Number((s as any).current_billed ?? 0)
                  const opening = Number((s as any).opening_balance ?? 0)
                  const arrearsOutstanding = Number((s as any).opening_outstanding ?? 0)
                  const settled = due > 0 ? Math.min(((paid + bursary) / due) * 100, 100) : 0
                  const isCleared = bal <= 0
                  const isPartial = !isCleared && paid > 0

                  return (
                    <tr key={s.regnumber} className="group hover:bg-brand/[0.025] dark:hover:bg-brand/[0.04] transition-colors">
                      {/* Checkbox */}
                      <td className="px-4 py-3 text-center">
                        <input
                          type="checkbox"
                          checked={selectedStudents.has(s.regnumber)}
                          onChange={(e) => {
                            const newSelected = new Set(selectedStudents)
                            if (e.target.checked) {
                              newSelected.add(s.regnumber)
                            } else {
                              newSelected.delete(s.regnumber)
                            }
                            setSelectedStudents(newSelected)
                          }}
                          className="checkbox checkbox-sm"
                        />
                      </td>
                      {/* Student */}
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 rounded-xl bg-ink-100 dark:bg-ink-700 flex items-center justify-center text-ink-500 font-bold text-xs shrink-0 group-hover:bg-brand/15 group-hover:text-brand transition-all">
                            {s.fname.charAt(0)}{s.lname.charAt(0)}
                          </div>
                          <div className="min-w-0">
                            <p className="font-semibold text-ink-900 dark:text-white text-sm leading-tight truncate">
                              {s.lname} {s.fname}
                            </p>
                            <p className="text-[10px] text-ink-400 font-mono mt-0.5">{s.regnumber}</p>
                          </div>
                        </div>
                      </td>

                      {/* Department */}
                      <td className="px-4 py-3 hidden lg:table-cell max-w-[160px]">
                        <p className="text-xs font-medium text-ink-700 dark:text-ink-200 truncate">{s.department}</p>
                        <p className="text-[10px] text-ink-400 truncate uppercase tracking-tight mt-0.5">{s.faculty}</p>
                      </td>

                      {/* Billing — this year's charges */}
                      <td className="px-4 py-3 text-right hidden md:table-cell">
                        <span className="font-mono text-xs text-ink-700 dark:text-ink-200">
                          {billed > 0 ? formatRWF(billed) : '—'}
                        </span>
                      </td>

                      {/* Open balance — carried forward. Flagged in red while
                          still outstanding: it is the debt that must be
                          settled before any newer invoice can be paid. */}
                      <td className="px-4 py-3 text-right hidden md:table-cell">
                        {opening > 0 ? (
                          <span
                            className={`font-mono text-xs font-bold ${arrearsOutstanding > 0 ? 'text-red-600 dark:text-red-400' : 'text-ink-400 line-through'}`}
                            title={arrearsOutstanding > 0
                              ? `${formatRWF(arrearsOutstanding)} of this is still unpaid and must be cleared first`
                              : 'Carried forward and already settled'}
                          >
                            {formatRWF(opening)}
                          </span>
                        ) : (
                          <span className="text-ink-200 dark:text-ink-600 text-xs">—</span>
                        )}
                      </td>

                      {/* Invoiced */}
                      <td className="px-4 py-3 text-right">
                        <div>
                          <p className="font-mono text-xs font-bold text-ink-800 dark:text-ink-100">{formatRWF(due)}</p>
                          {/* mini progress */}
                          <div className="w-full h-0.5 bg-ink-100 dark:bg-ink-700 rounded-full mt-1.5 overflow-hidden">
                            <div
                              className={`h-full rounded-full transition-all ${isCleared ? 'bg-green-500' : isPartial ? 'bg-orange-400' : 'bg-ink-200'}`}
                              style={{ width: `${settled > 0 ? Math.max(2, settled) : 0}%` }}
                            />
                          </div>
                        </div>
                      </td>

                      {/* Paid */}
                      <td className="px-4 py-3 text-right">
                        <span className={`font-mono text-xs font-bold ${paid > 0 ? 'text-green-600' : 'text-ink-300'}`}>
                          {paid > 0 ? formatRWF(paid) : '—'}
                        </span>
                      </td>

                      {/* Bursary */}
                      <td className="px-4 py-3 text-right">
                        {bursary > 0 ? (
                          <span className="font-mono text-xs font-bold text-blue-500">{formatRWF(bursary)}</span>
                        ) : (
                          <span className="text-ink-200 dark:text-ink-600 text-xs">—</span>
                        )}
                      </td>

                      {/* Remaining */}
                      <td className="px-4 py-3 text-right">
                        {isCleared ? (
                          <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-1 rounded-full bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400 border border-green-100 dark:border-green-800">
                            <CheckCircle2 className="w-3 h-3" /> Cleared
                          </span>
                        ) : (
                          <span className={`inline-flex items-center gap-1 font-mono text-xs font-bold px-2 py-1 rounded-lg border
                            ${isPartial
                              ? 'bg-orange-50 dark:bg-orange-900/20 text-orange-600 dark:text-orange-400 border-orange-100 dark:border-orange-800'
                              : 'bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 border-red-100 dark:border-red-900/30'
                            }`}>
                            {formatRWF(bal)}
                          </span>
                        )}
                      </td>

                      {/* Action */}
                      <td className="px-4 py-3 text-center flex items-center justify-center gap-1">
                        {yearId && (
                          <button
                            onClick={async () => {
                              try {
                                await feeInvoicePdfService.downloadStudentBillPdf(
                                  s.regnumber,
                                  {
                                    academic_year_id: Number(yearId),
                                  }
                                );
                              } catch (error) {
                                toast.error("Failed to download bill");
                              }
                            }}
                            className="w-8 h-8 rounded-lg bg-ink-50 dark:bg-ink-800 text-ink-400 hover:bg-green-500 hover:text-white flex items-center justify-center transition-all"
                            title="Download bill PDF"
                          >
                            <Download className="w-3.5 h-3.5" />
                          </button>
                        )}
                        <Link
                          to={`/finance/billing/${s.regnumber}`}
                          className="w-8 h-8 rounded-lg bg-ink-50 dark:bg-ink-800 text-ink-400 hover:bg-brand hover:text-white flex items-center justify-center transition-all"
                          title="View ledger"
                        >
                          <ArrowRight className="w-3.5 h-3.5" />
                        </Link>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}

        {totalItems > 50 && (
          <div className="px-5 py-4 border-t border-ink-100 dark:border-ink-700 flex justify-center bg-ink-50/30 dark:bg-ink-900/20">
            <Pagination
              currentPage={page}
              lastPage={paginated?.last_page ?? 1}
              total={totalItems}
              perPage={50}
              onPageChange={setPage}
            />
          </div>
        )}
      </div>

      {/* Billing Form Modal */}
      <StudentBillingFormModal
        open={billingFormOpen}
        onClose={() => setBillingFormOpen(false)}
        formUrl="/billing-form"
      />
    </div>
  );
}
