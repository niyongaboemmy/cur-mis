import { useEffect, useRef, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import {
  Plus,
  Trash2,
  Loader2,
  X,
  Users,
  CheckCircle2,
  Clock,
  XCircle,
  Wallet,
  Upload,
  Download,
  Building2,
  Pencil,
  FileSpreadsheet,
  ArrowLeft,
} from "lucide-react";
import toast from "react-hot-toast";
import * as XLSX from "xlsx";
import {
  bursaryService,
  sponsorService,
  ledgerService,
} from "@/services/financeService";
import { academicService } from "@/services/academicService";
import type {
  FeeBursary,
  CreateBursaryPayload,
  Sponsor,
  CreateSponsorPayload,
} from "@/types/finance";
import Pagination from "@/components/ui/Pagination";
import StudentSearchSelect from "@/components/finance/StudentSearchSelect";
import SearchableSelect from "@/components/ui/SearchableSelect";
import { useSystemStore } from "@/store/systemStore";
import ModalPortal from "@/components/ui/ModalPortal";
import { PERMISSIONS } from "@/constants";
import { usePermission } from "@/utils/permissions";

import { formatRWF } from "@/utils/formatCurrency";
import { useLevels } from "@/hooks/useLevels";

const BURSARY_TYPES = [
  "Government Scholarship",
  "University Grant",
  "Church/Diocese Sponsorship",
  "Corporate Sponsorship",
  "Merit-Based Award",
  "Hardship Grant",
  "Other",
];

const STATUS_OPTIONS = [
  { value: "", label: "All statuses" },
  { value: "pending", label: "Pending" },
  { value: "confirmed", label: "Confirmed" },
  { value: "cancelled", label: "Cancelled" },
];

const TYPE_OPTIONS = [
  { value: "", label: "All types" },
  ...BURSARY_TYPES.map((t) => ({ value: t, label: t })),
];

const PER_PAGE = 15;

type PageTab = "bursaries" | "sponsors";

export default function BursariesPage() {
  const canManage = usePermission(PERMISSIONS.MANAGE_FINANCE);
  const qc = useQueryClient();
  const basics = useSystemStore((s) => s.basics);
  const selectedYearLabel = useSystemStore((s) => s.selectedYearLabel);

  const resolveYearId = (label: string, b: typeof basics): number | string => {
    if (label) {
      const y = b?.years?.find((y: any) => y.label === label);
      if (y) return y.id;
    }
    return (b?.active_year as any)?.id ?? "";
  };

  const [activeTab, setActiveTab] = useState<PageTab>("bursaries");
  const [yearId, setYearId] = useState<number | string>(() =>
    resolveYearId(selectedYearLabel, basics),
  );
  const [studentId, setStudentId] = useState("");
  const [status, setStatus] = useState("");
  const [bursaryType, setBursaryType] = useState("");
  const [page, setPage] = useState(1);
  const [showForm, setShowForm] = useState(false);
  const [showBulk, setShowBulk] = useState(false);
  const [viewingBursary, setViewingBursary] = useState<FeeBursary | null>(null);
  const [searchParams, setSearchParams] = useSearchParams();
  const [editingSponsor, setEditingSponsor] = useState<Sponsor | null>(null);
  const [showSponsorForm, setShowSponsorForm] = useState(false);
  const [activeSponsor, setActiveSponsor] = useState<Sponsor | null>(null);
  const [sponsorSearch, setSponsorSearch] = useState("");

  useEffect(() => {
    setYearId(resolveYearId(selectedYearLabel, basics));
    setPage(1);
  }, [selectedYearLabel, basics?.years]);

  const yearsQ = useQuery({
    queryKey: ["academic-years"],
    queryFn: () => academicService.listYears(),
  });
  const years = yearsQ.data?.data ?? [];
  const yearOptions = years.map((y: any) => ({ value: y.id, label: y.label }));

  const sponsorsQ = useQuery({
    queryKey: ["finance", "sponsors", yearId],
    queryFn: () => sponsorService.list({ academic_year_id: Number(yearId) }),
  });
  const sponsors: any[] = sponsorsQ.data?.data ?? [];

  const deleteSponsorMut = useMutation({
    mutationFn: (id: number) => sponsorService.update(id, { is_active: 0 }),
    onSuccess: () => {
      toast.success("Sponsor deactivated");
      qc.invalidateQueries({ queryKey: ["finance", "sponsors"] });
    },
    onError: (e: any) => toast.error(e?.response?.data?.message ?? "Failed"),
  });

  const bursariesQ = useQuery({
    queryKey: [
      "finance",
      "bursaries",
      yearId,
      studentId,
      status,
      bursaryType,
      page,
      activeSponsor?.id,
    ],
    queryFn: () =>
      bursaryService.list({
        ...(yearId ? { academic_year_id: Number(yearId) } : {}),
        ...(studentId ? { student_id: studentId } : {}),
        ...(status ? { status: status as any } : {}),
        ...(bursaryType ? { bursary_type: bursaryType } : {}),
        ...(activeSponsor !== null ? { sponsor_id: activeSponsor.id } : {}),
        page,
        per_page: PER_PAGE,
      }),
  });

  const paginatedData = bursariesQ.data?.data;
  const rows: FeeBursary[] = (paginatedData as any)?.data ?? [];

  // Auto-open detail modal when navigated from dashboard with ?open=<id>
  useEffect(() => {
    const openId = searchParams.get("open");
    if (!openId || rows.length === 0 || viewingBursary) return;
    const found = rows.find((b) => String(b.id) === openId);
    if (found) {
      setViewingBursary(found);
      setSearchParams(
        (p) => {
          p.delete("open");
          return p;
        },
        { replace: true },
      );
    }
  }, [rows, searchParams]);
  const total = (paginatedData as any)?.total ?? 0;
  const lastPage = (paginatedData as any)?.last_page ?? 1;
  const currentPg = (paginatedData as any)?.current_page ?? 1;
  const agg = (paginatedData as any)?.aggregates ?? {};

  const totalAmount = (agg.total_amount ?? 0) as number;
  const confirmedAmount = (agg.confirmed_amount ?? 0) as number;
  const pendingAmount = (agg.pending_amount ?? 0) as number;
  const cancelledAmount = (agg.cancelled_amount ?? 0) as number;
  const confirmedCount = (agg.confirmed_count ?? 0) as number;
  const pendingCount = (agg.pending_count ?? 0) as number;
  const cancelledCount = (agg.cancelled_count ?? 0) as number;
  const distinctStudents = (agg.distinct_students ?? 0) as number;

  const deleteMutation = useMutation({
    mutationFn: (id: number) => bursaryService.delete(id),
    onSuccess: () => {
      toast.success("Bursary removed");
      qc.invalidateQueries({ queryKey: ["finance", "bursaries"] });
    },
    onError: (e: any) =>
      toast.error(e?.response?.data?.message ?? "Delete failed"),
  });

  const confirmMutation = useMutation({
    mutationFn: (id: number) => bursaryService.confirm(id),
    onSuccess: () => {
      toast.success("Bursary confirmed and applied");
      qc.invalidateQueries({ queryKey: ["finance", "bursaries"] });
      setViewingBursary(null);
    },
    onError: (e: any) =>
      toast.error(e?.response?.data?.message ?? "Confirmation failed"),
  });


  return (
    <div className="space-y-4 animate-fade-in">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-lg font-bold text-ink-900 dark:text-white">
            Bursary Management
          </h2>
          <p className="text-[13px] text-ink-500">
            Allocate scholarships, manage sponsors, and run bulk bursary
            uploads.
          </p>
        </div>
        <div className="flex gap-2">
          {activeTab === "bursaries" && canManage && (
            <>
              <button
                className="btn-ghost btn-sm"
                onClick={() => setShowBulk(true)}
              >
                <Upload className="w-3.5 h-3.5" /> Bulk Upload Students
              </button>
              <button
                className="btn-primary btn-sm"
                onClick={() => setShowForm(true)}
              >
                <Plus className="w-3.5 h-3.5" /> Allocate bursary
              </button>
            </>
          )}
          {activeTab === "sponsors" && canManage && (
            <button
              className="btn-primary btn-sm"
              onClick={() => {
                setEditingSponsor(null);
                setShowSponsorForm(true);
              }}
            >
              <Plus className="w-3.5 h-3.5" /> Add sponsor
            </button>
          )}
        </div>
      </div>

      {/* Tab switcher */}
      <div className="flex gap-1 bg-ink-100 dark:bg-ink-700/50 rounded-lg p-1 w-fit">
        {(["bursaries", "sponsors"] as PageTab[]).map((t) => (
          <button
            key={t}
            onClick={() => setActiveTab(t)}
            className={`px-4 py-1.5 text-xs font-semibold rounded-md capitalize transition-all ${
              activeTab === t
                ? "bg-white dark:bg-ink-800 shadow-sm text-ink-900 dark:text-white"
                : "text-ink-500 hover:text-ink-700"
            }`}
          >
            {t === "sponsors" ? (
              <span className="flex items-center gap-1.5">
                <Building2 className="w-3.5 h-3.5" />
                Sponsors
              </span>
            ) : (
              "Bursaries"
            )}
          </button>
        ))}
      </div>

      {activeTab === "sponsors" && (
        <div className="animate-in fade-in slide-in-from-bottom-2 duration-300">
          <SponsorsPanel
            sponsors={sponsors}
            loading={sponsorsQ.isLoading}
            onEdit={(s) => {
              setEditingSponsor(s);
              setShowSponsorForm(true);
            }}
            onDeactivate={(id) => deleteSponsorMut.mutate(id)}
          />
        </div>
      )}

      {activeTab === "bursaries" && (
        <>
          {!activeSponsor ? (
            <div className="flex flex-col gap-3 animate-in fade-in duration-200">
              <div className="flex items-center gap-2 text-xs text-ink-400 font-medium italic">
                <Building2 className="w-3 h-3" />
                Showing aggregates for all sponsors
              </div>
              <div className="relative max-w-sm">
                <Users className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-400" />
                <input
                  className="input input-sm pl-9 w-full bg-white dark:bg-ink-800"
                  placeholder="Filter sponsor names in grid..."
                  value={sponsorSearch}
                  onChange={(e) => setSponsorSearch(e.target.value)}
                />
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-3 animate-in fade-in slide-in-from-left-2 duration-200">
              <button
                className="flex items-center gap-1.5 text-sm font-bold text-white bg-brand px-3 py-1.5 rounded-lg hover:bg-brand/90 transition-all shadow-sm shrink-0"
                onClick={() => setActiveSponsor(null)}
              >
                <ArrowLeft className="w-4 h-4" />
                Back to Overview
              </button>
              <div className="flex items-center gap-1.5 text-sm text-ink-400">
                <span>All Sponsors</span>
                <span className="text-ink-300 dark:text-ink-600">/</span>
                <span className="font-bold text-ink-800 dark:text-white">
                  {activeSponsor.name}
                </span>
              </div>
            </div>
          )}

          {/* Filters */}
          <div className="card p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 items-end">
            <div>
              <label className="block text-[10px] font-bold text-ink-400 uppercase mb-1">
                Academic Year
              </label>
              <SearchableSelect
                options={yearOptions}
                value={yearId}
                onChange={(v) => setYearId(v)}
              />
            </div>
            <div>
              <label className="block text-[10px] font-bold text-ink-400 uppercase mb-1">
                Sponsor
              </label>
              <SearchableSelect
                options={[
                  { value: "", label: "All Sponsors" },
                  { value: "unassigned", label: "Unassigned / General" },
                  ...sponsors
                    .filter((s) => !s.is_virtual)
                    .map((s) => ({ value: s.id, label: s.name })),
                ]}
                value={activeSponsor?.id ?? ""}
                onChange={(v) => {
                  if (v === "") return setActiveSponsor(null);
                  if (v === "unassigned") {
                    return setActiveSponsor({
                      id: "unassigned",
                      name: "Unassigned / General",
                      is_virtual: true,
                    } as any);
                  }
                  const found = sponsors.find(
                    (s) => String(s.id) === String(v),
                  );
                  setActiveSponsor(found ?? null);
                }}
                placeholder="All Sponsors"
              />
            </div>
            <div>
              <label className="block text-[10px] font-bold text-ink-400 uppercase mb-1">
                Student
              </label>
              <StudentSearchSelect
                value={studentId}
                onChange={(id) => {
                  setStudentId(id);
                  setPage(1);
                }}
              />
            </div>
            <div>
              <label className="block text-[10px] font-bold text-ink-400 uppercase mb-1">
                Status
              </label>
              <SearchableSelect
                options={STATUS_OPTIONS}
                value={status}
                onChange={(v) => {
                  setStatus(String(v));
                  setPage(1);
                }}
              />
            </div>
            <div>
              <label className="block text-[10px] font-bold text-ink-400 uppercase mb-1">
                Bursary Type
              </label>
              <SearchableSelect
                options={TYPE_OPTIONS}
                value={bursaryType}
                onChange={(v) => {
                  setBursaryType(String(v));
                  setPage(1);
                }}
                placeholder="All types"
                allLabel="All types"
              />
            </div>
          </div>

          {/* KPI Cards */}
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-4 animate-in fade-in slide-in-from-bottom-1 duration-300">
            {[
              {
                label: "Total Allocated",
                value: formatRWF(totalAmount),
                sub: `${total} bursar${total !== 1 ? "ies" : "y"}`,
                icon: Wallet,
                color: "text-brand dark:text-blue-500",
                bg: "bg-brand/10",
              },
              {
                label: "Students Supported",
                value: String(distinctStudents),
                sub: "unique students",
                icon: Users,
                color: "text-violet-600",
                bg: "bg-violet-50 dark:bg-violet-900/20",
              },
              {
                label: "Confirmed",
                value: formatRWF(confirmedAmount),
                sub: `${confirmedCount} bursar${confirmedCount !== 1 ? "ies" : "y"}`,
                icon: CheckCircle2,
                color: "text-green-600",
                bg: "bg-green-50 dark:bg-green-900/20",
              },
              {
                label: "Pending",
                value: formatRWF(pendingAmount),
                sub: `${pendingCount} bursar${pendingCount !== 1 ? "ies" : "y"}`,
                icon: Clock,
                color: "text-yellow-600",
                bg: "bg-yellow-50 dark:bg-yellow-900/20",
              },
              {
                label: "Cancelled",
                value: formatRWF(cancelledAmount),
                sub: `${cancelledCount} bursar${cancelledCount !== 1 ? "ies" : "y"}`,
                icon: XCircle,
                color: "text-red-500",
                bg: "bg-red-50 dark:bg-red-900/20",
              },
            ].map((k, i) => (
              <div
                key={k.label}
                className="card p-4 flex items-center gap-3 shadow-sm animate-in fade-in slide-in-from-bottom-2 duration-300"
                style={{
                  animationDelay: `${i * 50}ms`,
                  animationFillMode: "both",
                }}
              >
                <div
                  className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 ${k.bg}`}
                >
                  <k.icon className={`w-5 h-5 ${k.color}`} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-ink-400 truncate">
                    {k.label}
                  </p>
                  <p className={`text-base font-bold leading-tight ${k.color}`}>
                    {k.value}
                  </p>
                  <p className="text-[10px] text-ink-400 truncate">{k.sub}</p>
                </div>
              </div>
            ))}
          </div>

          {/* Groups or Table */}
          {!activeSponsor ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 animate-in fade-in slide-in-from-bottom-2 duration-500">
              {sponsorsQ.isLoading && (
                <div className="col-span-full py-12 flex justify-center">
                  <Loader2 className="w-6 h-6 animate-spin text-brand" />
                </div>
              )}
              {!sponsorsQ.isLoading && sponsors.length === 0 && (
                <p className="col-span-full text-center py-10 text-ink-400">
                  No sponsors found for this year.
                </p>
              )}
              {sponsors
                .filter((s) =>
                  s.name.toLowerCase().includes(sponsorSearch.toLowerCase()),
                )
                .map((s: any, idx: number) => (
                  <div
                    key={s.id}
                    className="card p-5 hover:border-brand/30 hover:shadow-md transition-all cursor-pointer group flex flex-col justify-between animate-in fade-in slide-in-from-bottom-2 duration-300"
                    style={{
                      animationDelay: `${idx * 60}ms`,
                      animationFillMode: "both",
                    }}
                    onClick={() => setActiveSponsor(s)}
                  >
                    <div className="space-y-3">
                      <div className="flex justify-between items-start">
                        <div
                          className={`w-10 h-10 rounded-lg flex items-center justify-center transition-colors ${s.id === 0 ? "bg-orange-50 dark:bg-orange-900/20 text-orange-500" : "bg-ink-50 dark:bg-ink-700 text-ink-400 group-hover:bg-brand/10 group-hover:text-brand"}`}
                        >
                          {s.id === 0 ? (
                            <XCircle className="w-5 h-5" />
                          ) : (
                            <Building2 className="w-5 h-5" />
                          )}
                        </div>
                        <button
                          className="btn-ghost btn-xs opacity-0 group-hover:opacity-100 transition-opacity"
                          onClick={(e) => {
                            e.stopPropagation();
                            setActiveSponsor(s);
                          }}
                        >
                          View Students
                        </button>
                      </div>
                      <div>
                        <h4
                          className={`font-bold line-clamp-1 ${s.id === 0 ? "text-orange-600" : "text-ink-900 dark:text-white"}`}
                        >
                          {s.name}
                        </h4>
                        <p className="text-xs text-ink-500 mt-0.5">
                          {s.student_count ?? 0} students supported
                        </p>
                      </div>

                      <div className="pt-2 border-t border-ink-100 dark:border-gray-500/20 flex justify-between items-end">
                        <div>
                          <p className="text-[10px] font-bold text-ink-400 uppercase tracking-wider">
                            Total Allocated
                          </p>
                          <p className="text-lg font-bold text-brand dark:text-blue-500">
                            {formatRWF(s.total_amount ?? 0)}
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="text-[10px] font-bold text-ink-400 uppercase tracking-wider">
                            Confirmed
                          </p>
                          <p className="text-xs font-semibold text-green-600">
                            {formatRWF(s.confirmed_amount ?? 0)}
                          </p>
                        </div>
                      </div>

                      {(() => {
                        const total = Number(s.total_amount) || 0;
                        const confirmed = Number(s.confirmed_amount) || 0;
                        const progress =
                          total > 0 ? Math.round((confirmed / total) * 100) : 0;
                        return (
                          <div className="space-y-1">
                            <div className="flex justify-between text-[10px] font-semibold">
                              <span className="text-ink-400">
                                Application Progress
                              </span>
                              <span className="text-brand">{progress}%</span>
                            </div>
                            <div className="h-1.5 w-full bg-ink-100 dark:bg-ink-700 rounded-full overflow-hidden">
                              <div
                                className="h-full bg-brand transition-all duration-500"
                                style={{ width: `${progress}%` }}
                              />
                            </div>
                          </div>
                        );
                      })()}
                    </div>
                  </div>
                ))}
            </div>
          ) : (
            <div className="card overflow-hidden animate-in fade-in slide-in-from-right-2 duration-300">
              {bursariesQ.isLoading && (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="w-5 h-5 animate-spin text-brand" />
                </div>
              )}
              {!bursariesQ.isLoading && rows.length === 0 && (
                <p className="text-center py-10 text-ink-400 text-sm">
                  No bursaries found for {activeSponsor.name}.
                </p>
              )}
              {rows.length > 0 && (
                <>
                  <table className="w-full text-sm">
                    <thead className="bg-ink-50 dark:bg-ink-700/50 text-ink-500 text-xs uppercase">
                      <tr>
                        <th className="px-4 py-2.5 text-left">Student</th>
                        <th className="px-4 py-2.5 text-left">Bursary Type</th>
                        <th className="px-4 py-2.5 text-right">Amount (RWF)</th>
                        <th className="px-4 py-2.5 text-right">Coverage %</th>
                        <th className="px-4 py-2.5 text-left">Approved By</th>
                        <th className="px-4 py-2.5 text-left">Status</th>
                        <th className="px-4 py-2.5 text-left">Date</th>
                        <th className="px-4 py-2.5" />
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-ink-100 dark:divide-white/10">
                      {rows.map((b: FeeBursary) => (
                        <tr
                          key={b.id}
                          className="hover:bg-ink-50/50 dark:hover:bg-ink-700/30 cursor-pointer"
                          onClick={() => setViewingBursary(b)}
                        >
                          <td className="px-4 py-2.5 group/link">
                            <a
                              href={`/finance/ledger?student_id=${b.student_id}`}
                              className="font-medium hover:text-brand hover:underline block"
                              onClick={(e) => e.stopPropagation()}
                            >
                              {b.student_fname} {b.student_lname}
                            </a>
                            <p className="text-xs text-ink-400 font-mono">
                              {b.student_id}
                            </p>
                          </td>
                          <td className="px-4 py-2.5">{b.bursary_type}</td>
                          <td className="px-4 py-2.5 text-right font-mono font-semibold text-blue-500">
                            {formatRWF(b.amount)}
                          </td>
                          <td className="px-4 py-2.5 text-right">
                            {b.coverage_pct != null ? (
                              <div className="flex items-center justify-end gap-2">
                                <div className="w-16 h-1.5 bg-ink-200 dark:bg-white/20 rounded-full overflow-hidden shrink-0">
                                  <div
                                    className="h-full bg-blue-500 rounded-full"
                                    style={{
                                      width: `${Math.min(b.coverage_pct, 100)}%`,
                                    }}
                                  />
                                </div>
                                <span className="text-xs font-semibold text-blue-500 tabular-nums w-9 text-right">
                                  {b.coverage_pct}%
                                </span>
                              </div>
                            ) : (
                              "—"
                            )}
                          </td>
                          <td className="px-4 py-2.5 text-ink-500">
                            {b.approved_by_name ?? "—"}
                          </td>
                          <td className="px-4 py-2.5">
                            <span
                              className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                                b.status === "confirmed"
                                  ? "bg-green-100 text-green-700"
                                  : b.status === "pending"
                                    ? "bg-yellow-100 text-yellow-700"
                                    : "bg-red-100 text-red-700"
                              }`}
                            >
                              {b.status}
                            </span>
                          </td>
                          <td className="px-4 py-2.5 text-ink-500 text-xs">
                            {b.created_at
                              ? new Date(b.created_at).toLocaleDateString()
                              : "—"}
                          </td>
                          <td
                            className="px-4 py-2.5"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <button
                              className="btn-ghost btn-xs text-red-500"
                              onClick={() => {
                                if (confirm("Remove this bursary?"))
                                  deleteMutation.mutate(b.id);
                              }}
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>

                  {lastPage > 1 && (
                    <div className="px-4 py-3 border-t border-ink-100 dark:border-white/20">
                      <Pagination
                        currentPage={currentPg}
                        lastPage={lastPage}
                        total={total}
                        perPage={PER_PAGE}
                        onPageChange={setPage}
                      />
                    </div>
                  )}
                </>
              )}
            </div>
          )}
        </>
      )}

      {showForm && (
        <BursaryModal
          years={years}
          sponsors={sponsors}
          initial={viewingBursary}
          defaultYearId={
            yearId ? Number(yearId) : (basics?.active_year as any)?.id
          }
          defaultSponsorId={activeSponsor?.id}
          onClose={() => {
            setShowForm(false);
            setViewingBursary(null);
          }}
          onSaved={() => {
            setShowForm(false);
            setViewingBursary(null);
            // Invalidate everything finance-related to ensure dashboard & list consistency
            qc.invalidateQueries({ queryKey: ["finance"] });
            toast.success(
              viewingBursary ? "Bursary updated" : "Bursary allocated",
            );
          }}
        />
      )}

      {showBulk && (
        <BulkUploadModal
          years={years}
          sponsors={sponsors}
          defaultYearId={
            yearId ? Number(yearId) : (basics?.active_year as any)?.id
          }
          onClose={() => setShowBulk(false)}
          onSaved={() => {
            setShowBulk(false);
            qc.invalidateQueries({ queryKey: ["finance", "bursaries"] });
          }}
        />
      )}

      {!showForm && viewingBursary && (
        <BursaryDetailModal
          bursary={viewingBursary}
          confirming={confirmMutation.isPending}
          onClose={() => setViewingBursary(null)}
          onEdit={() => {
            setShowForm(true);
          }}
          onConfirm={() => confirmMutation.mutate(viewingBursary.id)}
          onDelete={() => {
            if (confirm("Remove this bursary?")) {
              deleteMutation.mutate(viewingBursary.id);
              setViewingBursary(null);
            }
          }}
        />
      )}

      {showSponsorForm && (
        <SponsorModal
          initial={editingSponsor}
          onClose={() => setShowSponsorForm(false)}
          onSaved={() => {
            setShowSponsorForm(false);
            qc.invalidateQueries({ queryKey: ["finance", "sponsors"] });
          }}
        />
      )}
    </div>
  );
}

// ─── Sponsors Panel ───────────────────────────────────────────────────────────

function SponsorsPanel({
  sponsors,
  loading,
  onEdit,
  onDeactivate,
}: {
  sponsors: Sponsor[];
  loading: boolean;
  onEdit: (s: Sponsor) => void;
  onDeactivate: (id: number) => void;
}) {
  return (
    <div className="card overflow-hidden">
      {loading && (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-5 h-5 animate-spin text-brand" />
        </div>
      )}
      {!loading && sponsors.length === 0 && (
        <p className="text-center py-10 text-ink-400 text-sm">
          No sponsors configured yet.
        </p>
      )}
      {sponsors.length > 0 && (
        <table className="w-full text-sm">
          <thead className="bg-ink-50 dark:bg-ink-700/50 text-ink-500 text-xs uppercase">
            <tr>
              <th className="px-4 py-2.5 text-left">Name</th>
              <th className="px-4 py-2.5 text-left">Email</th>
              <th className="px-4 py-2.5 text-left">Phone</th>
              <th className="px-4 py-2.5 text-center">Active</th>
              <th className="px-4 py-2.5" />
            </tr>
          </thead>
          <tbody className="divide-y divide-ink-100 dark:divide-white/10">
            {sponsors.map((s: Sponsor) => (
              <tr
                key={s.id}
                className="hover:bg-ink-50/50 dark:hover:bg-ink-700/30"
              >
                <td className="px-4 py-2.5 font-medium flex items-center gap-2">
                  <Building2 className="w-4 h-4 text-ink-400 shrink-0" />
                  {s.name}
                </td>
                <td className="px-4 py-2.5 text-ink-500">{s.email ?? "—"}</td>
                <td className="px-4 py-2.5 text-ink-500">{s.phone ?? "—"}</td>
                <td className="px-4 py-2.5 text-center">
                  <span
                    className={`inline-block w-2 h-2 rounded-full ${s.is_active ? "bg-green-500" : "bg-ink-300"}`}
                  />
                </td>
                <td className="px-4 py-2.5 text-right">
                  <div className="flex gap-1 justify-end">
                    <button
                      className="btn-ghost btn-xs"
                      onClick={() => onEdit(s)}
                    >
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                    {s.is_active === 1 && (
                      <button
                        className="btn-ghost btn-xs text-red-500"
                        onClick={() => {
                          if (confirm("Deactivate this sponsor?"))
                            onDeactivate(s.id);
                        }}
                      >
                        <XCircle className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

// ─── Sponsor Modal ────────────────────────────────────────────────────────────

function SponsorModal({
  initial,
  onClose,
  onSaved,
}: {
  initial: Sponsor | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [form, setForm] = useState<CreateSponsorPayload>({
    name: initial?.name ?? "",
    email: initial?.email ?? null,
    phone: initial?.phone ?? null,
    is_active: initial?.is_active ?? 1,
  });
  const set = (k: keyof typeof form, v: any) =>
    setForm((f) => ({ ...f, [k]: v }));

  const mutation = useMutation({
    mutationFn: (): Promise<any> =>
      initial
        ? sponsorService.update(initial.id, form)
        : sponsorService.create(form),
    onSuccess: () => {
      toast.success(initial ? "Sponsor updated" : "Sponsor created");
      onSaved();
    },
    onError: (e: any) =>
      toast.error(e?.response?.data?.message ?? "Save failed"),
  });

  return (
    <ModalPortal>
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black/50 animate-in fade-in duration-150">
      <div className="flex min-h-full items-center justify-center p-4">
        <div className="bg-white dark:bg-ink-800 rounded-xl shadow-xl w-full max-w-sm p-6 space-y-4 animate-in fade-in zoom-in-95 duration-200">
          <div className="flex items-center justify-between">
            <h3 className="text-base font-semibold">
              {initial ? "Edit" : "Add"} Sponsor
            </h3>
            <button className="btn-ghost btn-xs" onClick={onClose}>
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="space-y-3 text-sm">
            <div>
              <label className="block text-xs text-ink-500 mb-1">Name *</label>
              <input
                className="input input-sm w-full"
                value={form.name}
                onChange={(e) => set("name", e.target.value)}
                placeholder="e.g. MINEDUC Bursary Fund"
              />
            </div>
            <div>
              <label className="block text-xs text-ink-500 mb-1">
                Email (optional)
              </label>
              <input
                type="email"
                className="input input-sm w-full"
                value={form.email ?? ""}
                onChange={(e) => set("email", e.target.value || null)}
              />
            </div>
            <div>
              <label className="block text-xs text-ink-500 mb-1">
                Phone (optional)
              </label>
              <input
                className="input input-sm w-full"
                value={form.phone ?? ""}
                onChange={(e) => set("phone", e.target.value || null)}
              />
            </div>
            {initial && (
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="sp-active"
                  checked={form.is_active === 1}
                  onChange={(e) => set("is_active", e.target.checked ? 1 : 0)}
                />
                <label htmlFor="sp-active" className="text-xs cursor-pointer">
                  Active
                </label>
              </div>
            )}
          </div>

          <div className="flex gap-2 justify-end pt-2">
            <button className="btn-ghost btn-sm" onClick={onClose}>
              Cancel
            </button>
            <button
              className="btn-primary btn-sm"
              disabled={mutation.isPending || !form.name}
              onClick={() => mutation.mutate()}
            >
              {mutation.isPending && (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              )}
              {initial ? "Save" : "Create"}
            </button>
          </div>
        </div>
      </div>
    </div>
    </ModalPortal>
  );
}

// ─── Bulk Upload Modal ────────────────────────────────────────────────────────

interface ExcelRow {
  student_id: string;
  amount_rwf: number | null;
  coverage_pct: number | null;
  notes: string;
}

function downloadTemplate() {
  const ws = XLSX.utils.aoa_to_sheet([
    ["student_id", "amount_rwf", "coverage_pct", "notes"],
    ["1CUR21AK06286", 50000, 50, "Government grant"],
    ["2CUR25AK00677", 120000, 60, ""],
    ["1CUR26AK012460", "", "", ""],
  ]);
  ws["!cols"] = [{ wch: 20 }, { wch: 14 }, { wch: 14 }, { wch: 30 }];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Bursaries");
  XLSX.writeFile(wb, "bursary_upload_template.xlsx");
}

function parseExcelFile(file: File): Promise<ExcelRow[]> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target!.result as ArrayBuffer);
        const wb = XLSX.read(data, { type: "array" });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const jsons = XLSX.utils.sheet_to_json<any>(ws, { defval: "" });
        const parsed: ExcelRow[] = jsons
          .map((r: any) => ({
            student_id: String(
              r["student_id"] ?? r["Student ID"] ?? r["StudentID"] ?? "",
            ).trim(),
            amount_rwf:
              r["amount_rwf"] !== "" && r["amount_rwf"] != null
                ? Number(r["amount_rwf"])
                : null,
            coverage_pct:
              r["coverage_pct"] !== "" && r["coverage_pct"] != null
                ? Number(r["coverage_pct"])
                : null,
            notes: String(r["notes"] ?? r["Notes"] ?? "").trim(),
          }))
          .filter((r: ExcelRow) => r.student_id.length > 0);
        resolve(parsed);
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = reject;
    reader.readAsArrayBuffer(file);
  });
}

function BulkUploadModal({
  years,
  sponsors,
  defaultYearId,
  onClose,
  onSaved,
}: {
  years: any[];
  sponsors: Sponsor[];
  defaultYearId?: number;
  onClose: () => void;
  onSaved: () => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);

  const [form, setForm] = useState({
    academic_year_id: defaultYearId ?? 0,
    bursary_type: BURSARY_TYPES[0],
    default_amount: 0,
    sponsor_id: null as number | null,
  });
  const set = (k: keyof typeof form, v: any) =>
    setForm((f) => ({ ...f, [k]: v }));

  const [rows, setRows] = useState<ExcelRow[]>([]);
  const [parsing, setParsing] = useState(false);
  const [progress, setProgress] = useState<{
    done: number;
    total: number;
  } | null>(null);

  const yearOptions = years.map((y: any) => ({ value: y.id, label: y.label }));
  const sponsorOptions = [
    { value: "", label: "No sponsor (direct grant)" },
    ...sponsors
      .filter((s) => s.is_active)
      .map((s) => ({ value: s.id, label: s.name })),
  ];

  const handleFile = async (file: File) => {
    setParsing(true);
    try {
      const parsed = await parseExcelFile(file);
      setRows(parsed);
      if (parsed.length === 0)
        toast.error("No valid rows found — check the student_id column");
    } catch {
      toast.error("Could not parse file. Use the provided Excel template.");
    } finally {
      setParsing(false);
    }
  };

  const canSubmit =
    !!form.academic_year_id &&
    rows.length > 0 &&
    rows.every((r) => (r.amount_rwf ?? form.default_amount) > 0);

  const handleSubmit = async () => {
    setProgress({ done: 0, total: rows.length });
    let created = 0,
      skipped = 0;

    // If all rows share the same effective amount and have no per-row extras → fast bulk API
    const effectiveAmounts = rows.map(
      (r) => r.amount_rwf ?? form.default_amount,
    );
    const allSame = effectiveAmounts.every((a) => a === effectiveAmounts[0]);
    if (
      allSame &&
      rows.every((r) => r.coverage_pct == null && r.notes === "")
    ) {
      try {
        const res = await bursaryService.bulkCreate({
          academic_year_id: form.academic_year_id,
          bursary_type: form.bursary_type,
          amount_per_student: effectiveAmounts[0],
          sponsor_id: form.sponsor_id,
          student_ids_text: rows.map((r) => r.student_id).join("\n"),
        });
        toast.success(
          `Done: ${res.data?.created} created, ${res.data?.skipped} skipped`,
        );
      } catch (e: any) {
        toast.error(e?.response?.data?.message ?? "Bulk upload failed");
      }
      setProgress(null);
      onSaved();
      return;
    }

    // Per-row individual creates (different amounts or per-row data)
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      try {
        await bursaryService.create({
          student_id: row.student_id,
          academic_year_id: form.academic_year_id,
          bursary_type: form.bursary_type,
          amount: row.amount_rwf ?? form.default_amount,
          coverage_pct: row.coverage_pct,
          notes: row.notes || "",
          status: "confirmed",
          ...(form.sponsor_id ? { sponsor_id: form.sponsor_id } : {}),
        } as any);
        created++;
      } catch {
        skipped++;
      }
      setProgress({ done: i + 1, total: rows.length });
    }

    toast.success(`Done: ${created} created, ${skipped} skipped`);
    setProgress(null);
    onSaved();
  };

  const isUploading = progress !== null;

  return (
    <ModalPortal>
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black/50 animate-in fade-in duration-150">
      <div className="flex min-h-full items-center justify-center p-4">
        <div className="bg-white dark:bg-ink-800 rounded-xl shadow-xl w-full max-w-2xl p-6 space-y-4 animate-in fade-in zoom-in-95 duration-200">
          <div className="flex items-center justify-between">
            <h3 className="text-base font-semibold flex items-center gap-2">
              <FileSpreadsheet className="w-4 h-4" /> Bulk Bursary Upload
            </h3>
            <button
              className="btn-ghost btn-xs"
              onClick={onClose}
              disabled={isUploading}
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Settings row */}
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <label className="block text-xs text-ink-500 mb-1">
                Academic Year *
              </label>
              <SearchableSelect
                options={yearOptions}
                value={form.academic_year_id}
                onChange={(v) => set("academic_year_id", Number(v))}
                placeholder="Select year…"
              />
            </div>
            <div>
              <label className="block text-xs text-ink-500 mb-1">
                Bursary Type *
              </label>
              <SearchableSelect
                options={BURSARY_TYPES.map((t) => ({ value: t, label: t }))}
                value={form.bursary_type}
                onChange={(v) => set("bursary_type", String(v))}
                placeholder="Select type…"
              />
            </div>
            <div>
              <label className="block text-xs text-ink-500 mb-1">
                Default Amount (RWF)
              </label>
              <input
                type="number"
                className="input input-sm w-full"
                value={form.default_amount || ""}
                min={0}
                onChange={(e) => set("default_amount", Number(e.target.value))}
                placeholder="Fallback when row has no amount"
              />
            </div>
            <div>
              <label className="block text-xs text-ink-500 mb-1">
                Sponsor (optional)
              </label>
              <SearchableSelect
                options={sponsorOptions}
                value={form.sponsor_id ?? ""}
                onChange={(v) => set("sponsor_id", v ? Number(v) : null)}
                placeholder="No sponsor"
                allLabel="No sponsor"
              />
            </div>
          </div>

          {/* Template + drop zone */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-ink-600 dark:text-ink-300">
                Upload Excel file
              </span>
              <button
                className="btn-ghost btn-xs text-brand flex items-center gap-1"
                onClick={downloadTemplate}
              >
                <Download className="w-3.5 h-3.5" /> Download Template
              </button>
            </div>

            <div
              className="border-2 border-dashed border-ink-200 dark:border-ink-600 rounded-lg p-6 text-center cursor-pointer hover:border-brand transition-colors"
              onDrop={(e) => {
                e.preventDefault();
                const f = e.dataTransfer.files[0];
                if (f) handleFile(f);
              }}
              onDragOver={(e) => e.preventDefault()}
              onClick={() => fileRef.current?.click()}
            >
              <input
                ref={fileRef}
                type="file"
                accept=".xlsx,.xls,.csv"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) handleFile(f);
                }}
              />
              {parsing ? (
                <div className="flex items-center justify-center gap-2 text-sm text-ink-500">
                  <Loader2 className="w-4 h-4 animate-spin" /> Parsing file…
                </div>
              ) : rows.length > 0 ? (
                <p className="text-sm text-green-600 font-medium">
                  {rows.length} student row{rows.length !== 1 ? "s" : ""} loaded
                  — click to replace
                </p>
              ) : (
                <div className="space-y-1">
                  <Upload className="w-6 h-6 mx-auto text-ink-400" />
                  <p className="text-sm text-ink-500">
                    Drag & drop or click to upload .xlsx / .csv
                  </p>
                  <p className="text-xs text-ink-400">
                    Columns: student_id · amount_rwf · coverage_pct · notes
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* Preview table */}
          {rows.length > 0 && (
            <div className="border border-ink-100 dark:border-white/20 rounded-lg overflow-hidden max-h-52 overflow-y-auto">
              <table className="w-full text-xs">
                <thead className="bg-ink-50 dark:bg-ink-700/50 sticky top-0">
                  <tr>
                    <th className="px-3 py-2 text-left text-ink-500">#</th>
                    <th className="px-3 py-2 text-left text-ink-500">
                      Student ID
                    </th>
                    <th className="px-3 py-2 text-right text-ink-500">
                      Amount (RWF)
                    </th>
                    <th className="px-3 py-2 text-right text-ink-500">
                      Coverage %
                    </th>
                    <th className="px-3 py-2 text-left text-ink-500">Notes</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-ink-100 dark:divide-ink-700">
                  {rows.map((r, i) => {
                    const amt = r.amount_rwf ?? form.default_amount;
                    const missing = amt <= 0;
                    return (
                      <tr
                        key={i}
                        className={
                          missing ? "bg-red-50 dark:bg-red-900/10" : ""
                        }
                      >
                        <td className="px-3 py-1.5 text-ink-400">{i + 1}</td>
                        <td className="px-3 py-1.5 font-mono font-medium">
                          {r.student_id}
                        </td>
                        <td
                          className={`px-3 py-1.5 text-right font-mono ${missing ? "text-red-500 font-bold" : "text-blue-500"}`}
                        >
                          {missing ? "⚠ missing" : formatRWF(amt)}
                        </td>
                        <td className="px-3 py-1.5 text-right text-ink-500">
                          {r.coverage_pct != null ? `${r.coverage_pct}%` : "—"}
                        </td>
                        <td className="px-3 py-1.5 text-ink-500 truncate max-w-[160px]">
                          {r.notes || "—"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* Progress bar */}
          {isUploading && progress && (
            <div className="space-y-1">
              <div className="flex justify-between text-xs text-ink-500">
                <span>Uploading…</span>
                <span>
                  {progress.done} / {progress.total}
                </span>
              </div>
              <div className="h-2 bg-ink-200 dark:bg-ink-600 rounded-full overflow-hidden">
                <div
                  className="h-full bg-brand rounded-full transition-all"
                  style={{
                    width: `${(progress.done / progress.total) * 100}%`,
                  }}
                />
              </div>
            </div>
          )}

          <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-3 text-xs text-blue-700 dark:text-blue-300">
            Download the template, fill in student IDs and amounts, then upload.
            Per-row amounts override the default. Students that already have a
            confirmed bursary of the same type for the year will be skipped.
          </div>

          <div className="flex gap-2 justify-end pt-1">
            <button
              className="btn-ghost btn-sm"
              onClick={onClose}
              disabled={isUploading}
            >
              Cancel
            </button>
            <button
              className="btn-primary btn-sm"
              disabled={isUploading || !canSubmit}
              onClick={handleSubmit}
            >
              {isUploading ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" /> Uploading…
                </>
              ) : (
                <>
                  <Upload className="w-3.5 h-3.5" /> Upload{" "}
                  {rows.length > 0 ? `(${rows.length})` : ""}
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
    </ModalPortal>
  );
}

// ─── Bursary Detail Modal ─────────────────────────────────────────────────────

function BursaryDetailModal({
  bursary: b,
  confirming,
  onClose,
  onEdit,
  onConfirm,
  onDelete,
}: {
  bursary: FeeBursary;
  confirming: boolean;
  onClose: () => void;
  onEdit: () => void;
  onConfirm: () => void;
  onDelete: () => void;
}) {
  return (
    <ModalPortal>
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black/50 animate-in fade-in duration-150 flex items-center justify-center p-4">
      <div className="bg-white dark:bg-ink-800 rounded-2xl shadow-2xl w-full max-w-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        <div className="flex items-center justify-between p-5 border-b border-ink-100 dark:border-white/20 bg-ink-50/50 dark:bg-ink-700/30">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-brand/10 flex items-center justify-center text-brand">
              <Wallet className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-ink-900 dark:text-white">
                Bursary Record Details
              </h3>
              <p className="text-xs text-ink-500">
                View and manage this student's allocation
              </p>
            </div>
          </div>
          <button className="btn-ghost btn-xs" onClick={onClose}>
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-6 space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-3">
              <p className="text-[10px] font-bold text-ink-400 uppercase tracking-wider">
                Student Information
              </p>
              <BRow
                label="Full Name"
                value={
                  <span className="font-bold text-brand dark:text-blue-500">
                    {b.student_fname} {b.student_lname}
                  </span>
                }
              />
              <BRow
                label="Registration #"
                value={
                  <span className="font-mono text-xs">{b.student_id}</span>
                }
              />
              <BRow
                label="Academic Year"
                value={b.academic_year_label ?? "—"}
              />
            </div>

            <div className="space-y-3">
              <p className="text-[10px] font-bold text-ink-400 uppercase tracking-wider">
                Approval Details
              </p>
              <BRow label="Bursary Type" value={b.bursary_type} />
              <BRow
                label="Sponsor"
                value={
                  <span className="font-semibold text-ink-700 dark:text-ink-200">
                    {b.sponsor_name ?? "Unassigned"}
                  </span>
                }
              />
              <BRow
                label="Status"
                value={
                  <span
                    className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                      b.status === "confirmed"
                        ? "bg-green-100 text-green-700"
                        : b.status === "pending"
                          ? "bg-yellow-100 text-yellow-700"
                          : "bg-red-100 text-red-700"
                    }`}
                  >
                    {b.status}
                  </span>
                }
              />
            </div>
          </div>

          <div className="bg-brand/5 dark:bg-brand/10 p-5 rounded-2xl border border-brand/10 grid grid-cols-1 md:grid-cols-3 gap-6 items-center">
            <div className="md:col-span-2 space-y-3">
              <div className="flex justify-between items-center">
                <span className="text-sm text-ink-500 font-medium">
                  Allocated Amount
                </span>
                <span className="text-2xl font-black text-brand dark:text-blue-500 tabular-nums">
                  {formatRWF(b.amount)}
                </span>
              </div>
              {b.coverage_pct != null && (
                <div className="space-y-1.5">
                  <div className="flex justify-between text-xs">
                    <span className="text-ink-500 font-medium">
                      Coverage of Tuition
                    </span>
                    <span className="font-bold text-brand dark:text-blue-500">
                      {b.coverage_pct}%
                    </span>
                  </div>
                  <div className="h-2 bg-ink-200 dark:bg-ink-600 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-brand dark:bg-blue-500 rounded-full transition-all duration-500"
                      style={{ width: `${Math.min(b.coverage_pct, 100)}%` }}
                    />
                  </div>
                  {b.coverage_pct < 100 && (
                    <p className="text-[10px] text-orange-600 font-bold text-right pt-1">
                      Remaining to be paid:{" "}
                      {formatRWF(
                        Math.max(
                          0,
                          b.amount / (b.coverage_pct / 100) - b.amount,
                        ),
                      )}
                    </p>
                  )}
                </div>
              )}
            </div>
            <div className="bg-white dark:bg-ink-800 p-3 rounded-xl border border-ink-100 dark:border-white/20 text-center">
              <p className="text-[9px] font-bold text-ink-400 uppercase mb-1">
                Created Date
              </p>
              <p className="text-xs font-bold text-ink-700 dark:text-ink-200">
                {b.created_at
                  ? new Date(b.created_at).toLocaleDateString(undefined, {
                      dateStyle: "medium",
                    })
                  : "—"}
              </p>
            </div>
          </div>

          {b.notes && (
            <div className="p-4 bg-ink-50 dark:bg-ink-700/30 rounded-xl border border-ink-100 dark:border-white/20">
              <p className="text-[10px] font-bold text-ink-400 uppercase tracking-wider mb-1">
                Administrative Notes
              </p>
              <p className="text-sm text-ink-600 dark:text-ink-300 italic">
                "{b.notes}"
              </p>
            </div>
          )}

          {b.status === "pending" && (
            <div className="bg-blue-50 dark:bg-blue-900/20 p-4 rounded-xl border border-blue-100 dark:border-blue-800 flex items-center gap-4 animate-in slide-in-from-bottom-2">
              <div className="w-10 h-10 rounded-full bg-blue-100 dark:bg-blue-800 flex items-center justify-center text-blue-600 dark:text-blue-200 shrink-0">
                <Clock className="w-5 h-5" />
              </div>
              <div className="flex-1">
                <p className="text-sm font-bold text-blue-800 dark:text-blue-300">
                  Action Required: Receipt Confirmation
                </p>
                <p className="text-xs text-blue-600 dark:text-blue-400">
                  Confirming will immediately credit the student's invoices.
                </p>
              </div>
              <button
                className="btn-primary btn-sm px-6"
                onClick={onConfirm}
                disabled={confirming}
              >
                {confirming ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  "Confirm Now"
                )}
              </button>
            </div>
          )}
        </div>

        <div className="flex gap-2 justify-end p-5 bg-ink-50 dark:bg-ink-700/30 border-t border-ink-100 dark:border-white/20">
          <button
            className="btn-ghost btn-sm text-red-500 font-bold"
            onClick={onDelete}
          >
            <Trash2 className="w-3.5 h-3.5 mr-1.5" /> Remove
          </button>
          <div className="flex-1" />
          <button className="btn-ghost btn-sm font-bold" onClick={onClose}>
            Close
          </button>
          <button
            className="btn-primary btn-sm px-8 font-bold"
            onClick={onEdit}
          >
            <Pencil className="w-3.5 h-3.5 mr-1.5" /> Edit Details
          </button>
        </div>
      </div>
    </div>
    </ModalPortal>
  );
}

function BRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-4">
      <span className="text-ink-500 shrink-0">{label}</span>
      <span className="text-right font-medium text-ink-800 dark:text-ink-100">
        {value}
      </span>
    </div>
  );
}

// ─── Allocate Modal ───────────────────────────────────────────────────────────

function BursaryModal({
  years,
  sponsors,
  initial,
  defaultYearId,
  defaultSponsorId,
  onClose,
  onSaved,
}: {
  years: any[];
  sponsors: Sponsor[];
  initial?: FeeBursary | null;
  defaultYearId?: number;
  defaultSponsorId?: number;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { levelName } = useLevels();
  const [form, setForm] = useState<CreateBursaryPayload>({
    student_id: initial?.student_id ?? "",
    academic_year_id: initial?.academic_year_id ?? defaultYearId ?? 0,
    bursary_type: initial?.bursary_type ?? BURSARY_TYPES[0],
    amount: initial?.amount ?? 0,
    coverage_pct: initial?.coverage_pct ?? null,
    notes: initial?.notes ?? "",
    status: initial?.status ?? "pending",
    sponsor_id: initial?.sponsor_id ?? defaultSponsorId ?? null,
  });

  const yearOptions = years.map((y: any) => ({ value: y.id, label: y.label }));
  const set = (k: keyof typeof form, v: any) =>
    setForm((f: any) => ({ ...f, [k]: v }));

  // Live balance for selected student + year
  const balanceQ = useQuery({
    queryKey: [
      "finance",
      "ledger-totals",
      form.student_id,
      form.academic_year_id,
    ],
    queryFn: () =>
      ledgerService.getStudentLedger(form.student_id, {
        academic_year_id: form.academic_year_id,
      }),
    enabled: !!form.student_id && !!form.academic_year_id,
    staleTime: 30_000,
  });
  const ledger = balanceQ.data?.data;
  const totals = ledger?.totals;
  const student = ledger?.student;
  const invoices = ledger?.invoices ?? [];

  // Track which invoices are selected for this bursary
  const [selectedInvoices, setSelectedInvoices] = useState<number[]>([]);

  // Auto-select all invoices on first load of student/year
  useEffect(() => {
    if (invoices.length > 0 && selectedInvoices.length === 0) {
      setSelectedInvoices(invoices.map((i) => i.id));
    }
  }, [invoices.length]);

  const balance = totals
    ? Math.max(
        0,
        Number(totals.total_due ?? 0) -
          Number(totals.total_paid ?? 0) -
          Number(totals.total_bursary ?? 0),
      )
    : null;

  // Auto-calculate amount based on coverage and selected invoices
  useEffect(() => {
    if (form.coverage_pct != null) {
      const selectedTotal = invoices
        .filter((i) => selectedInvoices.includes(i.id))
        .reduce((sum, i) => sum + Number(i.amount_due), 0);

      const base =
        selectedTotal > 0 ? selectedTotal : Number(totals?.total_due) || 0;
      const calculated = Math.round(base * (form.coverage_pct / 100));

      if (calculated !== form.amount) {
        setForm((f) => ({ ...f, amount: calculated }));
      }
    }
  }, [form.coverage_pct, selectedInvoices, invoices, totals?.total_due]);

  const mutation = useMutation<any, any, void>({
    mutationFn: () =>
      initial
        ? bursaryService.update(initial.id, form)
        : bursaryService.create(form),
    onSuccess: () => {
      toast.success(initial ? "Bursary updated" : "Bursary allocated");
      onSaved();
    },
    onError: (e: any) =>
      toast.error(e?.response?.data?.message ?? "Save failed"),
  });

  return (
    <ModalPortal>
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black/50 animate-in fade-in duration-150 flex items-center justify-center p-4">
      <div className="bg-white dark:bg-ink-800 rounded-2xl shadow-2xl w-full max-w-5xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        <div className="flex items-center justify-between p-5 border-b border-ink-100 dark:border-white/20 bg-ink-50/50 dark:bg-ink-700/30">
          <h3 className="text-lg font-bold text-ink-900 dark:text-white">
            {initial ? "Update" : "Allocate"} Bursary
          </h3>
          <button className="btn-ghost btn-xs" onClick={onClose}>
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-6 grid grid-cols-1 lg:grid-cols-12 gap-8">
          {/* Left Column: Student & Financials */}
          <div className="lg:col-span-5 space-y-6">
            <div className="space-y-4">
              <div className="p-4 bg-brand/5 dark:bg-brand/10 rounded-xl border border-brand/10 space-y-4">
                <div>
                  <label className="block text-xs font-bold text-brand dark:text-blue-500 uppercase tracking-wider mb-2">
                    1. Select Student *
                  </label>
                  <StudentSearchSelect
                    value={form.student_id}
                    onChange={(regnum) => set("student_id", regnum)}
                    placeholder="Search by name or ID..."
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-brand dark:text-blue-500 uppercase tracking-wider mb-2">
                    Academic Year *
                  </label>
                  <SearchableSelect
                    options={yearOptions}
                    value={form.academic_year_id}
                    onChange={(v) => set("academic_year_id", Number(v))}
                    placeholder="Select year…"
                  />
                </div>
              </div>

              {student && (
                <div className="bg-white dark:bg-ink-800 p-4 rounded-xl border border-ink-100 dark:border-white/20 shadow-sm animate-in fade-in slide-in-from-top-2">
                  <div className="flex items-center gap-3 mb-3">
                    <div className="w-10 h-10 rounded-full bg-brand/10 flex items-center justify-center text-brand dark:text-blue-500 font-bold">
                      {student.fname?.[0]}
                      {student.lname?.[0]}
                    </div>
                    <div>
                      <p className="text-sm font-bold text-ink-900 dark:text-white leading-tight">
                        {student.fname} {student.lname}
                      </p>
                      <p className="text-[10px] text-ink-400 font-mono">
                        {student.student_id}
                      </p>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-y-2 gap-x-4 text-[10px]">
                    <div>
                      <span className="text-ink-400 uppercase tracking-tighter">
                        Program
                      </span>
                      <p
                        className="font-bold text-ink-700 truncate"
                        title={student.program_name}
                      >
                        {student.program_name ?? "—"}
                      </p>
                    </div>
                    <div>
                      <span className="text-ink-400 uppercase tracking-tighter">
                        Level/Class
                      </span>
                      <p className="font-bold text-ink-700">
                        {student.level_name ?? levelName(student.level)}
                      </p>
                    </div>
                    <div>
                      <span className="text-ink-400 uppercase tracking-tighter">
                        Gender
                      </span>
                      <p className="font-bold text-ink-700">
                        {student.gender ?? "—"}
                      </p>
                    </div>
                    <div>
                      <span className="text-ink-400 uppercase tracking-tighter">
                        Faculty
                      </span>
                      <p className="font-bold text-ink-700 truncate">
                        {student.faculty_name ?? "—"}
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {totals && (
                <div className="bg-ink-50 dark:bg-ink-700/50 p-5 rounded-xl border border-ink-100 dark:border-white/20 space-y-3">
                  <p className="font-bold text-ink-400 uppercase tracking-wider text-[10px]">
                    Financial Summary
                  </p>
                  <div className="flex justify-between items-center text-sm">
                    <span className="text-ink-500">Aggregate Fees</span>
                    <span className="font-bold text-ink-900 dark:text-white">
                      {formatRWF(totals.total_due)}
                    </span>
                  </div>
                  <div className="flex justify-between items-center text-sm">
                    <span className="text-ink-500">Amount Paid</span>
                    <span className="font-bold text-green-600">
                      {formatRWF(totals.total_paid)}
                    </span>
                  </div>
                  <div className="pt-3 border-t border-ink-200 dark:border-ink-600 space-y-2">
                    <div className="flex justify-between items-center">
                      <span className="text-xs font-bold text-ink-600 uppercase">
                        Outstanding
                      </span>
                      <span className="text-xl font-black text-brand dark:text-blue-500 tabular-nums">
                        {formatRWF(balance ?? 0)}
                      </span>
                    </div>
                    {form.amount > 0 && form.amount < (balance ?? 0) && (
                      <div className="flex justify-between items-center px-3 py-2 bg-orange-50 dark:bg-orange-900/20 rounded-lg border border-orange-100 dark:border-orange-800 animate-in slide-in-from-right-2">
                        <span className="text-[10px] font-bold text-orange-700 dark:text-orange-300 uppercase">
                          Remaining After Bursary
                        </span>
                        <span className="text-sm font-black text-orange-600 dark:text-orange-400 tabular-nums">
                          {formatRWF((balance ?? 0) - form.amount)}
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              )}
              <div className="h-48 border-2 border-dashed border-ink-100 dark:border-white/20 rounded-xl flex flex-col items-center justify-center text-ink-400 p-6 text-center italic text-sm">
                <Users className="w-8 h-8 mb-2 opacity-20" />
                Select a student to view their current fee structure and
                balance.
              </div>
            </div>
          </div>

          {/* Right Column: Bursary Details & Invoice Selection */}
          <div className="lg:col-span-7 space-y-6">
            <div className="space-y-4">
              <label className="block text-xs font-bold text-ink-400 uppercase tracking-wider">
                2. Select Fees to Cover
              </label>
              <div className="max-h-[200px] overflow-y-auto border border-ink-100 dark:border-white/20 rounded-xl overflow-hidden shadow-inner">
                <table className="w-full text-xs text-left">
                  <thead className="bg-ink-50 dark:bg-ink-700/50 sticky top-0">
                    <tr>
                      <th className="px-3 py-2 w-10">
                        <input
                          type="checkbox"
                          className="checkbox checkbox-xs"
                          checked={
                            invoices.length > 0 &&
                            selectedInvoices.length === invoices.length
                          }
                          onChange={(e) =>
                            setSelectedInvoices(
                              e.target.checked ? invoices.map((i) => i.id) : [],
                            )
                          }
                        />
                      </th>
                      <th className="px-3 py-2">Invoice / Fee Type</th>
                      <th className="px-3 py-2 text-right">Amount (RWF)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-ink-100 dark:divide-ink-800">
                    {invoices.length > 0 ? (
                      invoices.map((i) => (
                        <tr
                          key={i.id}
                          className={
                            selectedInvoices.includes(i.id) ? "bg-brand/5" : ""
                          }
                        >
                          <td className="px-3 py-2">
                            <input
                              type="checkbox"
                              className="checkbox checkbox-xs"
                              checked={selectedInvoices.includes(i.id)}
                              onChange={(e) => {
                                if (e.target.checked)
                                  setSelectedInvoices((prev) => [
                                    ...prev,
                                    i.id,
                                  ]);
                                else
                                  setSelectedInvoices((prev) =>
                                    prev.filter((id) => id !== i.id),
                                  );
                              }}
                            />
                          </td>
                          <td className="px-3 py-2 font-medium">
                            {i.description || i.fee_type}
                            <p className="text-[9px] text-ink-400">
                              Due: {i.due_date ?? "—"}
                            </p>
                          </td>
                          <td className="px-3 py-2 text-right font-mono font-bold">
                            {formatRWF(i.amount_due)}
                          </td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td
                          colSpan={3}
                          className="px-4 py-8 text-center text-ink-400 italic"
                        >
                          No active invoices found for this student and year.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
              <p className="text-[10px] text-ink-400 italic">
                Bursary coverage % will be applied to the total of selected fees
                (
                {formatRWF(
                  invoices
                    .filter((i) => selectedInvoices.includes(i.id))
                    .reduce((s, i) => s + Number(i.amount_due), 0),
                )}
                ).
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="sm:col-span-2">
                <label className="block text-xs font-bold text-ink-400 uppercase tracking-wider mb-1.5">
                  3. Bursary Configuration
                </label>
              </div>

              <div>
                <label className="block text-xs text-ink-500 mb-1">
                  Bursary Type *
                </label>
                <SearchableSelect
                  options={BURSARY_TYPES.map((t) => ({ value: t, label: t }))}
                  value={form.bursary_type}
                  onChange={(v) => set("bursary_type", String(v))}
                  placeholder="Select type…"
                />
              </div>

              <div>
                <label className="block text-xs text-ink-500 mb-1">
                  Sponsor *
                </label>
                <SearchableSelect
                  options={sponsors
                    .filter((s) => s.is_active && s.id !== 0)
                    .map((s) => ({ value: s.id, label: s.name }))}
                  value={form.sponsor_id ?? ""}
                  onChange={(v) => set("sponsor_id", v ? Number(v) : null)}
                  placeholder="Select sponsor…"
                />
              </div>

              <div className="sm:col-span-2 bg-ink-50/50 dark:bg-ink-700/20 p-4 rounded-xl border border-ink-100 dark:border-white/20 grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-xs font-bold text-ink-500">
                      Coverage % *
                    </label>
                    <div className="flex gap-1">
                      {[25, 50, 75, 100].map((p) => (
                        <button
                          key={p}
                          type="button"
                          className={`px-1.5 py-0.5 rounded text-[10px] font-bold transition-all ${form.coverage_pct === p ? "bg-brand text-white scale-110" : "bg-white dark:bg-ink-700 text-ink-500 hover:bg-brand/10 hover:text-brand dark:hover:dark:text-blue-500"}`}
                          onClick={() => set("coverage_pct", p)}
                        >
                          {p}%
                        </button>
                      ))}
                    </div>
                  </div>
                  <input
                    type="number"
                    className="input input-sm w-full font-bold text-brand dark:text-blue-500"
                    value={form.coverage_pct ?? ""}
                    min={0}
                    max={100}
                    onChange={(e) =>
                      set(
                        "coverage_pct",
                        e.target.value ? Number(e.target.value) : null,
                      )
                    }
                    placeholder="e.g. 100"
                  />
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-xs font-bold text-ink-500">
                      Amount (RWF) *
                    </label>
                    {balance !== null && (
                      <button
                        type="button"
                        className="text-[10px] font-bold text-brand dark:text-blue-500 hover:underline"
                        onClick={() => set("amount", balance)}
                      >
                        Use Balance ↑
                      </button>
                    )}
                  </div>
                  <input
                    type="number"
                    className="input input-sm w-full font-bold tabular-nums"
                    value={form.amount}
                    onChange={(e) => set("amount", Number(e.target.value))}
                    placeholder="0"
                  />
                  {balance !== null && form.amount > balance && (
                    <p className="text-[10px] text-orange-500 mt-0.5 font-bold">
                      ⚠ Exceeds balance
                    </p>
                  )}
                </div>
              </div>

              <div className="sm:col-span-2">
                <label className="block text-xs text-ink-500 mb-1.5">
                  Application Status
                </label>
                <div className="flex p-1 bg-ink-100 dark:bg-ink-700/50 rounded-lg gap-1">
                  <button
                    className={`flex-1 py-1.5 text-xs font-bold rounded-md transition-all ${form.status === "pending" ? "bg-white dark:bg-ink-600 shadow-sm text-ink-900 dark:text-white" : "text-ink-500 hover:text-ink-700"}`}
                    onClick={() => set("status", "pending")}
                  >
                    Pending
                  </button>
                  <button
                    className={`flex-1 py-1.5 text-xs font-bold rounded-md transition-all ${form.status === "confirmed" ? "bg-brand shadow-sm text-white" : "text-ink-500 hover:text-brand dark:hover:dark:text-blue-500"}`}
                    onClick={() => set("status", "confirmed")}
                  >
                    Confirmed
                  </button>
                </div>
              </div>

              <div className="sm:col-span-2">
                <label className="block text-xs text-ink-500 mb-1">
                  Internal Notes (optional)
                </label>
                <textarea
                  className="input input-sm w-full resize-none min-h-[60px]"
                  rows={2}
                  value={form.notes ?? ""}
                  onChange={(e) => set("notes", e.target.value)}
                  placeholder="Reason for bursary or specific instructions..."
                />
              </div>
            </div>
          </div>
        </div>

        <div className="flex gap-3 justify-end p-5 bg-ink-50 dark:bg-ink-700/30 border-t border-ink-100 dark:border-white/20">
          <button className="btn-ghost btn-sm font-bold" onClick={onClose}>
            Cancel
          </button>
          <button
            className="btn-primary btn-md px-8 shadow-lg shadow-brand/20"
            onClick={() => mutation.mutate()}
            disabled={
              mutation.isPending ||
              !form.student_id ||
              !form.academic_year_id ||
              !form.amount ||
              form.sponsor_id === null ||
              form.coverage_pct === null
            }
          >
            {mutation.isPending ? (
              <Loader2 className="w-4 h-4 animate-spin mr-2" />
            ) : (
              <CheckCircle2 className="w-4 h-4 mr-2" />
            )}
            {initial ? "Update Record" : "Allocate Bursary"}
          </button>
        </div>
      </div>
    </div>
    </ModalPortal>
  );
}
