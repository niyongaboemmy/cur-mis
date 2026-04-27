import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Link } from "react-router-dom";
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
} from "lucide-react";
import toast from "react-hot-toast";
import { billingService } from "@/services/financeService";
import { academicService } from "@/services/academicService";
import { api, apiClient } from "@/services/api";
import { useSystemStore } from "@/store/systemStore";
import { formatRWF } from "@/utils/formatCurrency";
import SearchableSelect from "@/components/ui/SearchableSelect";
import Pagination from "@/components/ui/Pagination";
import type { BillingSummary } from "@/types/finance";

export default function StudentBillingPage() {
  const basics = useSystemStore((s) => s.basics);
  const selectedYearLabel = useSystemStore((s) => s.selectedYearLabel);
  const selectedTermId = useSystemStore((s) => s.selectedTermId);

  const [yearId, setYearId] = useState<string | number>("");
  const [semester, setSemester] = useState<string | number>("");

  // Sync with global academic year
  useEffect(() => {
    if (selectedYearLabel) {
      const year = basics?.years?.find((y) => y.label === selectedYearLabel);
      if (year) {
        setYearId(year.id);
      }
    } else {
      // Fallback to active year if "All years" is selected but we need a default
      const active = basics?.active_year as any;
      if (active?.id) setYearId(active.id);
    }
  }, [selectedYearLabel, basics?.years]);

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

  const [facultyId, setFacultyId] = useState<string | number>("");
  const [deptId, setDeptId] = useState<string | number>("");
  const [keyword, setKeyword] = useState("");
  const [debouncedKeyword, setDebouncedKeyword] = useState("");
  const [page, setPage] = useState(1);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedKeyword(keyword);
      setPage(1);
    }, 500);
    return () => clearTimeout(timer);
  }, [keyword]);

  // ─── Data Fetching ─────────────────────────────────────────────────────────

  const yearsQ = useQuery({
    queryKey: ["academic-years"],
    queryFn: () => academicService.listYears(),
  });
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

  const summaryQ = useQuery({
    queryKey: [
      "finance",
      "billing-summary",
      yearId,
      semester,
      facultyId,
      deptId,
      debouncedKeyword,
      page,
    ],
    queryFn: () =>
      billingService.getSummary({
        academic_year_id: Number(yearId),
        semester: semester ? Number(semester) : undefined,
        faculty_id: facultyId ? Number(facultyId) : undefined,
        department_id: deptId ? Number(deptId) : undefined,
        keyword: debouncedKeyword,
        page,
        per_page: 50,
      }),
    enabled: !!yearId,
  });

  const paginated = summaryQ.data?.data as any;
  const students: BillingSummary[] = paginated?.data ?? [];
  const totalItems = paginated?.total ?? 0;

  const aggregates = paginated?.aggregates ?? {
    expected: 0,
    collected: 0,
    bursary: 0,
    balance: 0,
  };

  const totalExpected = aggregates.expected;
  const totalCollected = aggregates.collected;
  const totalBursary = aggregates.bursary;
  const totalRemaining = aggregates.balance;

  // ─── Bulk Actions ──────────────────────────────────────────────────────────

  const bulkMutation = useMutation({
    mutationFn: () =>
      billingService.bulkGenerate({
        academic_year_id: Number(yearId),
        semester: semester ? Number(semester) : undefined,
        faculty_id: facultyId ? Number(facultyId) : undefined,
        department_id: deptId ? Number(deptId) : undefined,
      }),
    onSuccess: (res: any) => {
      const data = res.data;
      toast.success(
        `Bulk generation complete!\nStudents processed: ${data.processed_students}\nNew invoices: ${data.total_created}\nSkipped: ${data.total_skipped}`,
        { duration: 5000 },
      );
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
      ...(debouncedKeyword && { keyword: debouncedKeyword }),
    });
    window.open(
      `${apiClient.defaults.baseURL}/api/finance/billing/export?${params.toString()}`,
      "_blank",
    );
  };

  return (
    <div className="space-y-6 animate-fade-in pb-12">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-xl font-bold text-ink-900 dark:text-white text-display tracking-tight flex items-center gap-2">
            <Users className="w-6 h-6 text-brand" />
            Bulk Billing Management
          </h2>
          <p className="text-sm text-ink-500">
            Overview of student balances and group invoicing.
          </p>
        </div>

        <div className="flex gap-2">
          <button
            className="btn-ghost btn-sm flex items-center gap-2 px-3 border border-ink-200 dark:border-ink-700"
            onClick={handleExport}
            disabled={!yearId}
          >
            <Download className="w-3.5 h-3.5" />
            Export CSV
          </button>

          {yearId && (
            <button
              className="btn-primary btn-sm flex items-center gap-2 px-4 shadow-lg shadow-brand/20 hover:scale-[1.02] transition-transform"
              onClick={() => {
                const scope = deptId
                  ? "selected department"
                  : facultyId
                    ? "selected faculty"
                    : "ALL active students";
                if (
                  confirm(
                    `Are you sure you want to run invoice generation for ${scope}? This may take a moment.`,
                  )
                ) {
                  bulkMutation.mutate();
                }
              }}
              disabled={bulkMutation.isPending}
            >
              {bulkMutation.isPending ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <TrendingUp className="w-3.5 h-3.5" />
              )}
              Run Bulk Generation
            </button>
          )}
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          {
            label: "Expected Revenue",
            value: totalExpected,
            icon: Banknote,
            color: "text-brand",
            bg: "bg-brand/10",
          },
          {
            label: "Collected",
            value: totalCollected,
            icon: CheckCircle2,
            color: "text-green-600",
            bg: "bg-green-100 dark:bg-green-900/20",
          },
          {
            label: "Bursary Credits",
            value: totalBursary,
            icon: CreditCard,
            color: "text-blue-500",
            bg: "bg-blue-50 dark:bg-blue-900/20",
          },
          {
            label: "Pending Balance",
            value: totalRemaining,
            icon: ShieldAlert,
            color: "text-red-500",
            bg: "bg-red-50 dark:bg-red-900/20",
          },
        ].map((stat, i) => (
          <div
            key={i}
            className="card p-4 flex items-center gap-4 border-ink-100 dark:border-ink-700 shadow-sm transition-all hover:shadow-md"
          >
            <div
              className={`w-12 h-12 rounded-xl flex items-center justify-center ${stat.bg}`}
            >
              <stat.icon className={`w-6 h-6 ${stat.color}`} />
            </div>
            <div>
              <p className="text-[11px] font-bold uppercase tracking-wider text-ink-400">
                {stat.label}
              </p>
              <p className={`text-lg font-bold ${stat.color}`}>
                {formatRWF(stat.value)}
              </p>
            </div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="card p-5 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4 items-end bg-gradient-to-br from-white to-ink-50 dark:from-ink-900 dark:to-ink-950 border-ink-100 dark:border-ink-700 shadow-sm">
        <div>
          <label className="block text-[10px] font-bold uppercase tracking-wider text-ink-400 mb-2 ml-1">
            Academic Year
          </label>
          <SearchableSelect
            options={years.map((y: any) => ({ value: y.id, label: y.label }))}
            value={yearId}
            onChange={(v) => {
              setYearId(v);
              setPage(1);
            }}
            placeholder="Select year…"
          />
        </div>
        <div>
          <label className="block text-[10px] font-bold uppercase tracking-wider text-ink-400 mb-2 ml-1">
            Semester/Term
          </label>
          <SearchableSelect
            options={[
              { value: "", label: "Full Year" },
              ...terms.map((t: any) => ({
                value: t.semester ?? 0,
                label: t.label,
              })),
            ]}
            value={semester}
            onChange={(v) => {
              setSemester(v);
              setPage(1);
            }}
            placeholder="All terms"
          />
        </div>
        <div>
          <label className="block text-[10px] font-bold uppercase tracking-wider text-ink-400 mb-2 ml-1">
            Faculty
          </label>
          <SearchableSelect
            options={faculties.map((f: any) => ({
              value: f.fac_id,
              label: f.fac_name,
            }))}
            value={facultyId}
            onChange={(v) => {
              setFacultyId(v);
              setDeptId("");
              setPage(1);
            }}
            placeholder="All faculties"
            allLabel="All faculties"
          />
        </div>
        <div>
          <label className="block text-[10px] font-bold uppercase tracking-wider text-ink-400 mb-2 ml-1">
            Department
          </label>
          <SearchableSelect
            options={departments.map((d: any) => ({
              value: d.dep_id,
              label: d.dep_name,
            }))}
            value={deptId}
            onChange={(v) => {
              setDeptId(v);
              setPage(1);
            }}
            placeholder="All departments"
            allLabel="All departments"
            disabled={!facultyId && departments.length === 0}
          />
        </div>
        <div className="relative">
          <label className="block text-[10px] font-bold uppercase tracking-wider text-ink-400 mb-2 ml-1">
            Search Students
          </label>
          <div className="relative group">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-300 group-focus-within:text-brand transition-colors" />
            <input
              className="input input-sm pl-9 w-full bg-white dark:bg-ink-800 focus:ring-brand/20 transition-all shadow-inner"
              placeholder="Name or Reg #…"
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
            />
            {keyword && (
              <button
                onClick={() => setKeyword("")}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-ink-300 hover:text-red-500"
              >
                ×
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="card overflow-hidden border-ink-100 dark:border-ink-700 shadow-md">
        <div className="px-5 py-4 bg-ink-50 dark:bg-ink-800/50 border-b border-ink-100 dark:border-ink-700 flex justify-between items-center">
          <div>
            <span className="text-xs font-bold uppercase tracking-widest text-ink-500 flex items-center gap-2">
              <Filter className="w-3.5 h-3.5" />
              Student Summaries
              <span className="ml-2 bg-brand/10 text-brand px-2 py-0.5 rounded-full text-[10px]">
                {totalItems} Results
              </span>
            </span>
          </div>
        </div>

        {summaryQ.isLoading ? (
          <div className="flex flex-col items-center justify-center py-24 gap-4">
            <div className="relative">
              <div className="w-12 h-12 border-4 border-brand/10 border-t-brand rounded-full animate-spin" />
              <Users className="w-4 h-4 absolute inset-0 m-auto text-brand animate-pulse" />
            </div>
            <p className="text-sm text-ink-400 font-medium">
              Crunching financial data...
            </p>
          </div>
        ) : !yearId ? (
          <div className="py-24 text-center space-y-3">
            <div className="w-20 h-20 bg-ink-50 dark:bg-ink-800 rounded-3xl flex items-center justify-center mx-auto mb-4 rotate-12 group-hover:rotate-0 transition-transform shadow-inner">
              <TrendingUp className="w-10 h-10 text-ink-200" />
            </div>
            <h4 className="text-lg font-bold text-ink-900 dark:text-white">
              Ready to bill?
            </h4>
            <p className="text-ink-400 text-sm max-w-xs mx-auto">
              Select an academic year above to calculate student balances and
              generate invoices.
            </p>
          </div>
        ) : students.length === 0 ? (
          <div className="py-24 text-center space-y-4">
            <Search className="w-12 h-12 text-ink-200 mx-auto" />
            <div>
              <p className="text-ink-900 dark:text-white font-bold">
                No students found
              </p>
              <p className="text-ink-400 text-sm">
                Try adjusting your filters or search keywords.
              </p>
            </div>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-separate border-spacing-0">
              <thead className="bg-white dark:bg-ink-900 sticky top-0 z-10">
                <tr>
                  <th className="px-5 py-4 text-left font-bold text-[11px] uppercase tracking-wider text-ink-400 border-b border-ink-50 dark:border-ink-800">
                    Student
                  </th>
                  <th className="px-5 py-4 text-left font-bold text-[11px] uppercase tracking-wider text-ink-400 border-b border-ink-50 dark:border-ink-800 hidden lg:table-cell">
                    Dept / Faculty
                  </th>
                  <th className="px-5 py-4 text-right font-bold text-[11px] uppercase tracking-wider text-ink-400 border-b border-ink-50 dark:border-ink-800">
                    Structure
                  </th>
                  <th className="px-5 py-4 text-right font-bold text-[11px] uppercase tracking-wider text-ink-400 border-b border-ink-50 dark:border-ink-800">
                    Invoiced
                  </th>
                  <th className="px-5 py-4 text-right font-bold text-[11px] uppercase tracking-wider text-ink-400 border-b border-ink-50 dark:border-ink-800">
                    Paid
                  </th>
                  <th className="px-5 py-4 text-right font-bold text-[11px] uppercase tracking-wider text-ink-400 border-b border-ink-50 dark:border-ink-800">
                    Remaining
                  </th>

                  <th className="px-5 py-4 text-center font-bold text-[11px] uppercase tracking-wider text-ink-400 border-b border-ink-50 dark:border-ink-800">
                    Action
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink-50 dark:divide-ink-800">
                {students.map((s) => (
                  <tr
                    key={s.regnumber}
                    className="group hover:bg-brand/[0.03] dark:hover:bg-brand/[0.05] transition-colors"
                  >
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-ink-100 dark:bg-ink-700 flex items-center justify-center text-ink-500 font-bold text-sm shrink-0 group-hover:bg-brand/15 group-hover:text-brand group-hover:scale-105 transition-all">
                          {s.fname.charAt(0)}
                          {s.lname.charAt(0)}
                        </div>
                        <div>
                          <p className="font-bold text-ink-900 dark:text-white leading-tight">
                            {s.fname} {s.lname}
                          </p>
                          <p className="text-[11px] text-ink-400 font-mono mt-1">
                            {s.regnumber}
                          </p>
                        </div>
                      </div>
                    </td>
                    <td className="px-5 py-4 hidden lg:table-cell">
                      <p className="text-xs text-ink-700 dark:text-ink-200 font-semibold truncate max-w-[150px]">
                        {s.department}
                      </p>
                      <p className="text-[10px] text-ink-400 truncate max-w-[150px] mt-0.5 uppercase tracking-tighter">
                        {s.faculty}
                      </p>
                    </td>
                    <td className="px-5 py-4 text-right font-mono text-xs text-ink-400">
                      {formatRWF(s.structure_tuition || 0)}
                    </td>
                    <td className="px-5 py-4 text-right font-mono text-xs text-ink-900 dark:text-white font-bold">
                      {formatRWF(s.total_expected)}
                    </td>

                    <td className="px-5 py-4 text-right">
                      <span className="font-mono text-xs font-bold text-green-600">
                        {formatRWF(s.total_collected)}
                      </span>
                      {Number(s.total_bursary) > 0 && (
                        <div className="flex items-center justify-end gap-1 mt-1">
                          <div className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse" />
                          <p className="text-[10px] text-blue-500 font-bold">
                            {formatRWF(s.total_bursary)}
                          </p>
                        </div>
                      )}
                    </td>
                    <td className="px-5 py-4 text-right">
                      <div
                        className={`inline-flex items-center px-2.5 py-1 rounded-lg font-mono text-xs font-bold ${
                          Number(s.balance) <= 0
                            ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 border border-green-200 dark:border-green-800"
                            : "bg-red-50 text-red-600 dark:bg-red-900/20 dark:text-red-400 border border-red-100 dark:border-red-900/30"
                        }`}
                      >
                        {formatRWF(Math.max(0, s.balance))}
                      </div>
                    </td>
                    <td className="px-5 py-4 text-center">
                      <Link
                        to={`/finance/billing/${s.regnumber}`}
                        className="w-9 h-9 rounded-full bg-ink-50 dark:bg-ink-800 text-ink-400 hover:bg-brand hover:text-white flex items-center justify-center mx-auto transition-all shadow-sm hover:shadow-brand/20"
                        title="View Full Ledger"
                      >
                        <ArrowRight className="w-4 h-4" />
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {totalItems > 50 && (
          <div className="px-5 py-6 bg-ink-50/30 dark:bg-ink-900/30 border-t border-ink-100 dark:border-ink-700 flex justify-center">
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
    </div>
  );
}
