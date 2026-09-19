import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useSearchParams, Link, useNavigate } from "react-router-dom";
import {
  Search,
  Loader2,
  Mail,
  Phone,
  ArrowLeft,
  ArrowRight,
  GraduationCap,
  BadgeCheck,
  Globe2,
  Building2,
  Filter,
  X,
  Eye,
  Download,
  Upload,
  FileText,
} from "lucide-react";
import {
  studentService,
  type StudentStats,
  type StudentListParams,
  type FacetOption,
  type BreakdownRow,
} from "@/services/studentService";
import { useDebounce } from "@/hooks/useDebounce";
import { useSystemStore } from "@/store/systemStore";
import { useCampusFilterStore } from "@/store/campusFilterStore";
import { useCategoryFilterStore } from "@/store/categoryFilterStore";
import StatCard from "@/components/dashboard/StatCard";
import DonutChart from "@/components/dashboard/DonutChart";
import BarChart, { type BarDatum } from "@/components/dashboard/BarChart";
import SearchableSelect from "@/components/ui/SearchableSelect";
import StudentExportModal from "@/components/admin/StudentExportModal";
import BulkUploadModal from "@/components/admin/BulkUploadModal";
import DocumentCompletionBadge, {
  type DocumentStatus,
} from "@/components/admin/DocumentCompletionBadge";
import { academicsMgmtService } from "@/services/academicsMgmtService";
import type { Student } from "@/types/academic";
import ProfileChangeReviewPanel from '@/components/students/ProfileChangeReviewPanel'
import GenderEditPopover from '@/components/students/GenderEditPopover'
import DocumentGenerateMenu from '@/components/students/DocumentGenerateMenu'
import { useAuthStore } from "@/store/authStore";

const PER_PAGE = 15;

/* ─────────────────────────────────────────────────────────────
   Tabs: Active students (default) and All students.
   URL-driven state — card clicks navigate with filter params.
   ───────────────────────────────────────────────────────────── */
type Tab = "active" | "all";

export default function StudentsPage() {
  const [sp, setSp] = useSearchParams();
  const tab = (sp.get("tab") as Tab) || "active";

  const setTab = (next: Tab) => {
    const clone = new URLSearchParams(sp);
    clone.set("tab", next);
    // Clear page on tab switch
    clone.delete("page");
    setSp(clone, { replace: true });
  };

  // Global academic year (topnav selector). Empty string = all years.
  const selectedYear = useSystemStore((s) => s.selectedYearLabel);
  const selectedCampus = useCampusFilterStore((s) => s.selectedCampusId);
  const selectedCategory = useCategoryFilterStore((s) => s.selectedCategory);

  // Shared stats — refetched when the global year / campus / category
  // change so every metric (counts, charts, breakdowns) re-scopes.
  const statsQ = useQuery({
    queryKey: ["student-stats", selectedYear || "all", selectedCampus, selectedCategory ?? "all"],
    queryFn: () =>
      studentService.stats({ acc_year: selectedYear || undefined }),
    staleTime: 60_000,
  });
  const stats: StudentStats | null = statsQ.data?.data ?? null;

  return (
    <div className="max-w-[1400px] mx-auto space-y-5">
      {/* ── Tabs ── */}
      <section className="card p-1.5">
        <div className="flex items-center gap-1">
          <TabButton
            active={tab === "active"}
            icon={BadgeCheck}
            label="Overview"
            onClick={() => setTab("active")}
          />
          <TabButton
            active={tab === "all"}
            icon={GraduationCap}
            label="Students list"
            onClick={() => setTab("all")}
          />
        </div>
      </section>

      {tab === "active" ? (
        <ActiveTab
          stats={stats}
          loading={statsQ.isLoading}
          fetching={statsQ.isFetching}
          onDrill={(filters) => {
            const next = new URLSearchParams();
            next.set("tab", "all");
            Object.entries(filters).forEach(([k, v]) => {
              if (v) next.set(k, String(v));
            });
            setSp(next, { replace: false });
          }}
        />
      ) : (
        <AllTab stats={stats} />
      )}
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────
   Active Students tab — real metrics, no K shortening. Click a
   card to drill to "All students" with that filter applied.
   ───────────────────────────────────────────────────────────── */
export function ActiveTab({
  stats,
  loading,
  fetching,
  onDrill,
}: {
  stats: StudentStats | null;
  loading: boolean;
  fetching: boolean;
  onDrill: (filters: Record<string, string | undefined>) => void;
}) {
  const s = stats;

  // Fetch cumulative stats (all years) for the main number
  const allYearsStatsQ = useQuery({
    queryKey: ["student-stats-all-years"],
    queryFn: () => studentService.stats({ acc_year: undefined }),
    staleTime: 60_000,
  });

  const cumulativeStats = allYearsStatsQ.data?.data ?? null;
  const cumulativeTotal = cumulativeStats?.active ?? 0;
  const activeTotal = s?.active ?? 0;

  // Get year-by-year breakdown from cumulative stats facets
  const yearBreakdown = useMemo(() => {
    if (!cumulativeStats?.facets?.acc_year) return [];
    const years = cumulativeStats.facets.acc_year.map(f => f.label);
    return years;
  }, [cumulativeStats]);
  // All buckets (including Unknown) sum to the full active total so nothing on this tab
  // exceeds the active count.
  const activeGenderTot = activeTotal;
  const activeNationTot = activeTotal;
  const unknownGender = s?.active_unknown_gender ?? 0;
  const unknownNation = s?.active_unknown_nationality ?? 0;

  return (
    <div className="space-y-5">
      <section className="card p-6">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <div className="flex items-center gap-2">
              <span className="chip-success">
                <BadgeCheck className="w-3 h-3" /> Active students
              </span>
              <h2 className="text-[18px] font-semibold text-ink-900 dark:text-white tracking-tight">
                Overview
              </h2>
            </div>
            <p className="text-[12.5px] text-ink-500 mt-1">
              Live metrics scoped to {fmt(activeTotal)} active student
              {activeTotal === 1 ? "" : "s"} only. Click any card or chart to
              open the list pre-filtered.
            </p>
          </div>
          {(loading || fetching) && (
            <Loader2 className="w-4 h-4 text-ink-400 animate-spin" />
          )}
        </div>

        <div className="mt-5 grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
          <div
            className="bg-gradient-to-br from-green-50 to-green-100 dark:from-green-900/20 dark:to-green-800/20 rounded-lg p-4 border border-green-200 dark:border-green-700/50 shadow-sm hover:shadow-md transition cursor-pointer"
            onClick={() => onDrill({ student_state: "active" })}
          >
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <p className="text-sm font-medium text-green-600 dark:text-green-400">Active students</p>
                <p className="text-3xl font-bold text-green-900 dark:text-green-100 mt-2">{fmt(cumulativeTotal)}</p>
                <p className="text-xs text-green-600 dark:text-green-400 mt-1">
                  Cumulative across all years
                </p>
                {yearBreakdown.length > 0 && (
                  <p className="text-xs text-green-700 dark:text-green-300 mt-2 leading-relaxed">
                    {yearBreakdown.join(' • ')}
                  </p>
                )}
              </div>
              <div className="bg-green-200 dark:bg-green-900/40 p-3 rounded-lg">
                <BadgeCheck className="w-6 h-6 text-green-600 dark:text-green-400" />
              </div>
            </div>
          </div>
          <ClickableStat
            label="Faculties"
            value={fmt(s?.active_faculties)}
            icon={Building2}
            tone="sky"
          />
          <ClickableStat
            label="Departments"
            value={fmt(s?.active_departments)}
            icon={GraduationCap}
            tone="lilac"
          />
          <ClickableStat
            label="Academic years"
            value={fmt(s?.active_academic_years)}
            icon={Globe2}
            tone="peach"
          />
        </div>
      </section>

      {/* Active students — gender split donut */}
      {s && activeGenderTot > 0 && (
        <section className="card p-6">
          <div className="flex items-start justify-between gap-3 flex-wrap mb-2">
            <div>
              <div className="flex items-center gap-2">
                <span className="chip-success">
                  <BadgeCheck className="w-3 h-3" /> Active students
                </span>
                <h3 className="text-[15px] font-semibold text-ink-900 dark:text-white">
                  Gender split
                </h3>
              </div>
              <p className="text-[12px] text-ink-500 mt-1">
                Every active student is counted — including those with no
                recorded gender. Click a card to open the filtered list.
              </p>
            </div>
          </div>

          <div className="flex flex-col md:flex-row items-center gap-8">
            <DonutChart
              segments={[
                { label: "Male", value: s.active_male, color: "#0A2A5E" },
                { label: "Female", value: s.active_female, color: "#F5C400" },
                { label: "Unknown", value: unknownGender, color: "#94A3B8" },
              ]}
              centerTop="Active"
              centerBig={activeGenderTot.toLocaleString()}
            />
            <div className="flex-1 w-full grid grid-cols-1 sm:grid-cols-3 gap-3">
              <LegendCard
                label="Male"
                value={s.active_male}
                percent={pct(s.active_male, activeGenderTot)}
                color="#0A2A5E"
                onClick={() =>
                  onDrill({ student_state: "active", gender: "M" })
                }
              />
              <LegendCard
                label="Female"
                value={s.active_female}
                percent={pct(s.active_female, activeGenderTot)}
                color="#F5C400"
                onClick={() =>
                  onDrill({ student_state: "active", gender: "F" })
                }
              />
              <LegendCard
                label="Not specified"
                value={unknownGender}
                percent={pct(unknownGender, activeGenderTot)}
                color="#94A3B8"
                onClick={() =>
                  onDrill({ student_state: "active", gender: "unknown" })
                }
              />
            </div>
          </div>
        </section>
      )}

      {/* Nationality — active-only, with percentages; Unknown included */}
      {s && activeNationTot > 0 && (
        <section className="card p-6">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="chip-success">
              <BadgeCheck className="w-3 h-3" /> Active students
            </span>
            <h3 className="text-[15px] font-semibold text-ink-900 dark:text-white">
              Nationality
            </h3>
          </div>
          <p className="text-[12px] text-ink-500 mt-1">
            Share of active students by origin. Click a card to open the
            filtered list.
          </p>

          <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-4">
            <NationalityCard
              label="Rwandan"
              value={s.active_rwandan}
              percent={pct(s.active_rwandan, activeNationTot)}
              color="#10B981"
              onClick={() =>
                onDrill({ student_state: "active", nationality: "rwandan" })
              }
            />
            <NationalityCard
              label="Foreign"
              value={s.active_foreign}
              percent={pct(s.active_foreign, activeNationTot)}
              color="#4FB4FF"
              onClick={() =>
                onDrill({ student_state: "active", nationality: "foreign" })
              }
            />
            <NationalityCard
              label="Not specified"
              value={unknownNation}
              percent={pct(unknownNation, activeNationTot)}
              color="#94A3B8"
              onClick={() =>
                onDrill({ student_state: "active", nationality: "unknown" })
              }
            />
          </div>
        </section>
      )}

      {/* Active students — breakdown column charts */}
      {s && (
        <section className="card p-6 space-y-6">
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="chip-success">
                <BadgeCheck className="w-3 h-3" /> Active students
              </span>
              <h3 className="text-[15px] font-semibold text-ink-900 dark:text-white">
                Breakdown
              </h3>
            </div>
            <p className="text-[12px] text-ink-500 mt-1">
              {fmt(s.active)} active student{s.active === 1 ? "" : "s"} only.
              Click a bar to open the list pre-filtered.
            </p>
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
            <BreakdownChart
              title="By faculty"
              rows={s.active_breakdown?.by_faculty}
              color="#0A2A5E"
              cleanLabel={(l) => l.replace(/^faculty of\s+/i, "").trim()}
              onPick={(r) =>
                onDrill({ student_state: "active", faculty: r.value })
              }
            />
            <BreakdownChart
              title="By department"
              rows={s.active_breakdown?.by_department}
              color="#4FB4FF"
              onPick={(r) =>
                onDrill({ student_state: "active", department: r.value })
              }
            />
            <BreakdownChart
              title="By level"
              rows={s.active_breakdown?.by_level}
              color="#F5C400"
              labelPrefix="Level "
              onPick={(r) =>
                onDrill({ student_state: "active", current_level: r.value })
              }
            />
            <BreakdownChart
              title="By program"
              rows={s.active_breakdown?.by_program}
              color="#10B981"
              onPick={(r) =>
                onDrill({ student_state: "active", program: r.value })
              }
            />
            <BreakdownChart
              title="By learning mode"
              rows={s.active_breakdown?.by_learning_mode}
              color="#EC4899"
              onPick={(r) =>
                onDrill({ student_state: "active", learning_mode: r.value })
              }
            />
            <BreakdownChart
              title="By campus"
              rows={s.active_breakdown?.by_campus}
              color="#8B5CF6"
              onPick={(r) =>
                onDrill({ student_state: "active", campus: r.value })
              }
            />
            <BreakdownChart
              title="By intake"
              rows={s.active_breakdown?.by_intake}
              color="#F97316"
              onPick={(r) =>
                onDrill({ student_state: "active", intake: r.value })
              }
            />
          </div>
        </section>
      )}
    </div>
  );
}

function BreakdownChart({
  title,
  rows,
  color,
  labelPrefix,
  cleanLabel,
  onPick,
}: {
  title: string;
  rows?: BreakdownRow[];
  color: string;
  labelPrefix?: string;
  cleanLabel?: (label: string) => string;
  onPick: (row: BreakdownRow) => void;
}) {
  const data: BarDatum[] = (rows ?? []).map((r) => {
    const rawLabel =
      r.label && String(r.label).trim() ? String(r.label) : r.value;
    const cleaned = cleanLabel ? cleanLabel(rawLabel) : rawLabel;
    return {
      value: r.value,
      label: `${labelPrefix ?? ""}${cleaned}`,
      total: Number(r.total) || 0,
      color,
    };
  });

  return (
    <div className="rounded-lg border border-ink-100 dark:border-ink-700 p-4 bg-white dark:bg-ink-800">
      <h4 className="text-[13px] font-semibold text-ink-700 dark:text-ink-200 mb-3">
        {title}
      </h4>
      {data.length === 0 ? (
        <p className="text-[12px] text-ink-400 py-8 text-center">No data.</p>
      ) : (
        <BarChart
          data={data}
          onPick={(d) => {
            const original = (rows ?? []).find((r) => r.value === d.value);
            if (original) onPick(original);
          }}
        />
      )}
    </div>
  );
}

function LegendCard({
  label,
  value,
  percent,
  color,
  onClick,
}: {
  label: string;
  value: number;
  percent: number;
  color: string;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!onClick}
      className="text-left rounded-lg border border-ink-100 dark:border-ink-700 px-4 py-3 bg-white dark:bg-ink-800 hover:border-brand/40 hover:bg-brand/5 transition-colors disabled:cursor-default"
    >
      <div className="flex items-center gap-2">
        <span
          className="w-3 h-3 rounded-full"
          style={{ backgroundColor: color }}
        />
        <span className="text-[12.5px] font-medium text-ink-700 dark:text-ink-200">
          {label}
        </span>
        <span className="ml-auto text-[11px] text-ink-400 tabular-nums">
          {percent}%
        </span>
      </div>
      <p className="text-[22px] font-semibold text-ink-900 dark:text-white tabular-nums mt-1">
        {value.toLocaleString()}
      </p>
    </button>
  );
}

function NationalityCard({
  label,
  value,
  percent,
  color,
  onClick,
}: {
  label: string;
  value: number;
  percent: number;
  color: string;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!onClick}
      className="group relative overflow-hidden text-left w-full rounded-xl border border-ink-100 dark:border-ink-700 bg-white dark:bg-ink-800 p-5 hover:border-brand/40 hover:shadow-sm transition-all disabled:cursor-default"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <span
              className="w-2.5 h-2.5 rounded-full"
              style={{ backgroundColor: color }}
            />
            <span className="text-[12px] uppercase tracking-wider font-semibold text-ink-500">
              {label}
            </span>
          </div>
          <p className="mt-2 text-[30px] font-semibold text-ink-900 dark:text-white tabular-nums leading-none">
            {value.toLocaleString()}
          </p>
          <p className="text-[12px] text-ink-500 mt-1">active students</p>
        </div>

        <div
          className="shrink-0 rounded-full px-3 py-1 text-[12px] font-semibold tabular-nums"
          style={{ color, backgroundColor: `${color}1A` }}
        >
          {percent}%
        </div>
      </div>

      {/* Progress bar */}
      <div className="mt-4 h-2 rounded-full bg-ink-100 dark:bg-ink-700/50 overflow-hidden">
        <div
          className="h-full rounded-full transition-[width] duration-500"
          style={{ width: `${percent}%`, backgroundColor: color }}
        />
      </div>
    </button>
  );
}

function pct(part: number, total: number): number {
  if (!total) return 0;
  return Math.round((part / total) * 100);
}

/* ─────────────────────────────────────────────────────────────
   All students tab — search + filters + paginated table.
   ───────────────────────────────────────────────────────────── */
function AllTab({ stats }: { stats: StudentStats | null }) {
  const [sp, setSp] = useSearchParams();
  const facets = stats?.facets;

  const selectedCampusId = useCampusFilterStore((s) => s.selectedCampusId);
  const selectedCategory = useCategoryFilterStore((s) => s.selectedCategory);

  const user = useAuthStore((s) => s.user);

  // Only Academic Secretary, Admin, registrar, superadmin, and Director of Finance and Administration can generate documents
  const allowedRoles = ['Academic Secretary', 'Admin', 'registrar', 'superadmin', 'Director of Finance and Administration'];
  const canGenerateDocuments = !!(user?.role_name && allowedRoles.includes(user.role_name));

  // Entity data for filters. Departments + programs are loaded once and
  // shown flat — no faculty cascade — so the user can pick either directly.
  // Departments now come from /students/filter-options together with their
  // faculty, so the picker can narrow to the selected faculty.
  const programsQ = useQuery({ queryKey: ['acmgmt', 'options', 'all'], queryFn: () => academicsMgmtService.list<any>('options', { per_page: 500 }), staleTime: 5 * 60_000 });
  const allPrograms: any[] = programsQ.data?.data?.data ?? [];

  const q = sp.get("q") ?? "";
  const gender = sp.get("gender") ?? "";
  const state = sp.get("student_state") ?? "active";
  const nationality = sp.get("nationality") ?? "";
  const department = sp.get("department") ?? "";
  const level = sp.get("current_level") ?? "";
  // The Program filter now stores the option id (not the free-text name) so
  // the backend can resolve it through the permissive std_option matcher,
  // catching legacy student rows that don't have the canonical option id set.
  const program = sp.get("program") ?? "";
  // Learning mode (Day / Evening / Weekend) — lives in the legacy
  // `student.program` column server-side, but exposed here under its
  // semantic name so the UI doesn't mix it up with the real programme.
  const learning_mode = sp.get("learning_mode") ?? "";
  const campus = sp.get("campus") ?? "";
  const intake = sp.get("intake") ?? "";
  const faculty = sp.get("faculty") ?? "";
  const country = sp.get("country") ?? "";
  const province = sp.get("province") ?? "";
  const district = sp.get("district") ?? "";
  const sector = sp.get("sector") ?? "";
  const ageMin = sp.get("age_min") ?? "";
  const ageMax = sp.get("age_max") ?? "";
  // Explicit academic-year filter only. The registry deliberately does NOT
  // inherit the topbar's year: `student.acc_year` is maintained only while a
  // student is active, so an implicit current-year scope silently hid every
  // inactive and graduated student — "All students" showed half the registry.
  const accYear = sp.get("acc_year") ?? "";
  // Documents — derived server-side from the student's application documents.
  const documentStatus = sp.get("document_status") ?? "";
  const sort_by = sp.get("sort_by") ?? "";
  const sort_dir = (sp.get("sort_dir") as "asc" | "desc") ?? "desc";
  const page = Math.max(1, Number(sp.get("page") || 1));

  const debouncedQ = useDebounce(q, 350);

  const update = (patch: Record<string, string | undefined>) => {
    const next = new URLSearchParams(sp);
    Object.entries(patch).forEach(([k, v]) => {
      if (v) next.set(k, v);
      else next.delete(k);
    });
    next.delete("page");
    setSp(next, { replace: false });
  };

  const setPage = (p: number) => {
    const next = new URLSearchParams(sp);
    next.set("page", String(p));
    setSp(next, { replace: false });
  };

  const handleSort = (field: string) => {
    if (sort_by === field) {
      if (sort_dir === "asc") {
        update({ sort_by: field, sort_dir: "desc" });
      } else {
        update({ sort_by: "", sort_dir: "" });
      }
    } else {
      update({ sort_by: field, sort_dir: "asc" });
    }
  };

  // Every filter composes — Option included. It used to be exclusive (picking
  // one dropped all the others) because an auto-derived department could AND
  // with `std_option` and zero the result set. Department is now chosen by
  // hand and the Option list is scoped to it, so the pair always agrees:
  // measured across the Education options, 99.4% of students matched by an
  // option also carry that option's department. Exclusivity only survived as
  // a way to silently discard the nine other filters the user had set.
  const listParams: StudentListParams = useMemo(() => {
    return {
      page,
      per_page: PER_PAGE,
      q: debouncedQ || undefined,
      std_option: program || undefined,
      gender: gender || undefined,
      student_state: state === "all" ? undefined : state,
      nationality: nationality || undefined,
      faculty: faculty || undefined,
      department: department || undefined,
      current_level: level || undefined,
      acc_year: accYear || undefined,
      country: country || undefined,
      province: province || undefined,
      district: district || undefined,
      sector: sector || undefined,
      age_min: ageMin || undefined,
      age_max: ageMax || undefined,
      document_status: documentStatus || undefined,
      campus: campus || undefined,
      intake: intake || undefined,
      learning_mode: learning_mode || undefined,
      sort_by: sort_by || undefined,
      sort_dir: sort_dir || undefined,
    };
  }, [
    page,
    debouncedQ,
    gender,
    state,
    nationality,
    faculty,
    department,
    level,
    accYear,
    country,
    province,
    district,
    sector,
    ageMin,
    ageMax,
    documentStatus,
    program,
    campus,
    intake,
    learning_mode,
    sort_by,
    sort_dir,
  ]);

  const listQ = useQuery({
    queryKey: ["students", listParams, selectedCampusId, selectedCategory ?? "all"],
    queryFn: () => studentService.list(listParams),
    placeholderData: (prev) => prev,
  });

  // Values for the filter bar, each carrying the number of students it would
  // yield. Counts are faceted server-side — every dimension is counted with
  // the other active filters applied but its own excluded — so the active
  // filters have to be sent, and the panel re-reads whenever they change.
  const facetParams = useMemo(() => {
    const { page: _p, per_page: _pp, sort_by: _sb, sort_dir: _sd, ...rest } = listParams;
    return rest;
  }, [listParams]);
  const filterOptsQ = useQuery({
    queryKey: ['students', 'filter-options', facetParams, selectedCampusId, selectedCategory ?? 'all'],
    queryFn: ({ signal }) => studentService.filterOptions(facetParams, signal),
    placeholderData: (prev) => prev,
    staleTime: 60_000,
  });
  const filterOpts = filterOptsQ.data?.data;

  /** Case-insensitive compare — the location columns hold mixed casing. */
  const sameValue = (a?: string | null, b?: string | null) =>
    (a ?? '').trim().toLowerCase() === (b ?? '').trim().toLowerCase();

  /** "Huye (1,308)" — showing the count before the click is the point of the
   *  faceted endpoint, so every picker below labels its options this way. */
  const withCount = (f: { value: string; label: string; total: number }): FacetOption => ({
    value: f.value,
    label: `${f.label} (${f.total.toLocaleString()})`,
  });

  const facultyFacets: FacetOption[] = useMemo(
    () => (filterOpts?.faculties ?? []).map(withCount),
    [filterOpts],
  );

  // Departments narrow to the chosen faculty; with none chosen, all are shown.
  // The counts already respect the faculty — the server excludes only the
  // dimension being counted — so this filter is purely about what to offer.
  const departmentFacetsScoped: FacetOption[] = useMemo(() => {
    const all = filterOpts?.departments ?? [];
    const scoped = faculty ? all.filter((d) => d.faculty_id === faculty) : all;
    return scoped.map(withCount);
  }, [filterOpts, faculty]);

  // Districts belong to a province, sectors to a district — the pairings come
  // from the data, so cascading never offers a combination nobody lives in.
  const provinceFacets: FacetOption[] = useMemo(
    () => (filterOpts?.provinces ?? []).map(withCount),
    [filterOpts],
  );
  const districtFacets: FacetOption[] = useMemo(
    () => (filterOpts?.districts ?? [])
      .filter((d) => !province || sameValue(d.province, province))
      .map(withCount),
    [filterOpts, province],
  );
  const sectorFacets: FacetOption[] = useMemo(
    () => (filterOpts?.sectors ?? [])
      .filter((x) => !district || sameValue(x.district, district))
      .map(withCount),
    [filterOpts, district],
  );
  const countryFacets: FacetOption[] = useMemo(
    () => (filterOpts?.countries ?? []).map(withCount),
    [filterOpts],
  );
  const accYearFacets: FacetOption[] = useMemo(
    () => (filterOpts?.academic_years ?? []).map(withCount),
    [filterOpts],
  );

  const statusFacets: FacetOption[] = useMemo(
    () => (filterOpts?.statuses ?? []).map(withCount),
    [filterOpts],
  );

  /** Document-verification buckets, counted server-side like every other
   *  facet. Falls back to the plain buckets when the endpoint is older than
   *  this filter, so the picker is never empty. */
  const documentStatusFacets: FacetOption[] = useMemo(() => {
    const rows = filterOpts?.document_statuses ?? [];
    if (rows.length) return rows.map(withCount);
    return [
      { value: "verified", label: "Verified" },
      { value: "pending", label: "Not verified" },
      { value: "rejected", label: "Rejected" },
      { value: "none", label: "No documents" },
    ];
  }, [filterOpts]);

  /**
   * The Option picker is specific to Education, per the registry's request:
   * only that faculty's intake is tracked at option level, so showing it for
   * every department would offer a choice that means nothing elsewhere.
   */
  const educationFacultyIds = useMemo(
    () => new Set(
      (filterOpts?.faculties ?? [])
        .filter((f) => f.is_education)
        .map((f) => f.value),
    ),
    [filterOpts],
  );
  const selectedDeptFacultyId = useMemo(() => {
    const d = (filterOpts?.departments ?? []).find((x) => x.value === department);
    return d?.faculty_id ?? '';
  }, [filterOpts, department]);
  const showOptionFilter =
    (!!faculty && educationFacultyIds.has(faculty)) ||
    (!!selectedDeptFacultyId && educationFacultyIds.has(selectedDeptFacultyId));

  const campusesQ = useQuery({ queryKey: ['acmgmt', 'campuses', 'all'], queryFn: () => academicsMgmtService.list<any>('campuses', { per_page: 200 }), staleTime: 5 * 60_000 });
  const allCampuses: any[] = campusesQ.data?.data?.data ?? [];

  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [isBulkUpdating, setIsBulkUpdating] = useState(false);
  const [bulkCampusId, setBulkCampusId] = useState<string>("");
  const [exportOpen, setExportOpen] = useState(false);
  const [bulkUploadOpen, setBulkUploadOpen] = useState(false);

  const handleBulkUpdate = async () => {
    if (!bulkCampusId || selectedIds.size === 0) return;
    try {
      setIsBulkUpdating(true);
      await studentService.bulkUpdateCampus(Array.from(selectedIds), Number(bulkCampusId));
      setSelectedIds(new Set());
      listQ.refetch();
    } catch (e) {
      console.error(e);
    } finally {
      setIsBulkUpdating(false);
    }
  };

  const rows = listQ.data?.data?.data ?? [];
  const total = listQ.data?.data?.total ?? 0;
  const last = listQ.data?.data?.last_page ?? 1;

  // Clear selection when page/filters change
  useMemo(() => { setSelectedIds(new Set()) }, [listParams]);

  const activeFilterCount = [
    gender,
    state === "active" ? "" : state,
    nationality,
    faculty,
    country,
    province,
    district,
    sector,
    ageMin,
    ageMax,
    accYear,
    department,
    level,
    program,
    learning_mode,
    campus,
    intake,
  ].filter(Boolean).length;

  /* ── Filter option lists ──
     Backend filter expectations:
       - department → departements.dep_id (numeric, stored as varchar in `student`)
       - std_option → option id; backend resolves to id/name/code/acro/admission chain. */
  // Programmes are gated behind a department: the picker only renders once a
  // department is chosen, and its options are scoped to that department.
  const programFacets: FacetOption[] = useMemo(() => {
    let progs = allPrograms;
    if (department) {
      const depId = Number(department);
      progs = progs.filter((o: any) => Number(o.department_id) === depId);
    }
    return progs.map((o: any) => ({ value: String(o.id), label: String(o.name) }));
  }, [allPrograms, department]);

  /** Department is the entry point: choosing one reveals the (dept-scoped)
   *  programme picker. Switching department clears any programme that belonged
   *  to the previous one so we never send a mismatched pair. */
  const onDepartmentChange = (v: string | undefined) => {
    update({ department: v || undefined, program: undefined });
  };

  const onProgramChange = (v: string | undefined) => {
    update({ program: v || undefined });
  };

  const clearAll = () =>
    setSp({ tab: "all", student_state: "active" }, { replace: false });

  return (
    <div className="space-y-5">
      {/* Student-proposed identity corrections (migration 147). Renders
          nothing when the queue is empty. */}
      <ProfileChangeReviewPanel />

      {/* Search + filters */}
      <section className="card p-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div className="flex flex-col md:flex-row items-center gap-2 w-full md:w-auto flex-1">
            <div className="relative w-full md:w-80">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-400 pointer-events-none" />
              <input
                value={q}
                onChange={(e) => update({ q: e.target.value })}
                placeholder="Search by name, email, reg #…"
                className="input pl-9"
              />
            </div>
          </div>

          <div className="flex items-center gap-2 text-[12.5px] text-ink-500 shrink-0">
            {selectedIds.size > 0 && (
              <div className="flex items-center gap-2 bg-brand/5 border border-brand/20 px-3 py-1.5 rounded-md">
                <span className="text-brand font-medium">{selectedIds.size} selected</span>
                <select 
                  className="input input-sm py-0 h-7" 
                  value={bulkCampusId} 
                  onChange={e => setBulkCampusId(e.target.value)}
                >
                  <option value="">Select campus...</option>
                  {allCampuses.map(c => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
                <button 
                  onClick={handleBulkUpdate}
                  disabled={!bulkCampusId || isBulkUpdating}
                  className="btn-primary btn-sm h-7"
                >
                  {isBulkUpdating ? "Updating..." : "Update"}
                </button>
              </div>
            )}
            <Filter className="w-3.5 h-3.5" />
            <span>
              {total.toLocaleString()} result{total === 1 ? "" : "s"}
            </span>
            {activeFilterCount > 0 && (
              <button onClick={clearAll} className="btn-secondary btn-sm">
                <X className="w-3 h-3" /> Clear filters
              </button>
            )}
            <button
              type="button"
              onClick={() => setBulkUploadOpen(true)}
              className="btn-secondary btn-sm flex items-center gap-1.5"
              title="Import or update many students from an Excel/CSV template"
            >
              <Upload className="w-3.5 h-3.5" /> Bulk upload
            </button>
            <button
              type="button"
              onClick={() => setExportOpen(true)}
              disabled={total === 0}
              className="btn-primary btn-sm flex items-center gap-1.5"
              title="Download the filtered student list as Excel or CSV"
            >
              <Download className="w-3.5 h-3.5" /> Export
            </button>
          </div>
        </div>

        <div className="mt-3 flex flex-wrap items-end gap-2">
          {/* Sole owner of `student_state`. The picker's own "All" entry
              reports the empty string, but an ABSENT student_state means
              Active on this page — so clearing has to say "all" out loud, and
              "all" maps back to empty here to keep that entry highlighted. */}
          <FilterSelect
            label="Status"
            value={state === "all" ? "" : state}
            onChange={(v) => update({ student_state: v || "all" })}
            options={statusFacets}
            placeholder="All statuses"
            className="w-full sm:w-44"
          />
          <FilterSelect
            label="Academic year"
            value={accYear}
            onChange={(v) => update({ acc_year: v })}
            options={accYearFacets}
            placeholder="All years"
            className="w-full sm:w-48"
          />
          {/* Faculty narrows the department list below it. */}
          <FilterSelect
            label="Faculty"
            value={faculty}
            onChange={(v) => update({ faculty: v, department: "", program: "" })}
            options={facultyFacets}
            placeholder="All faculties"
            className="w-full sm:w-64"
          />
          {/* Department — scoped to the faculty when one is picked. */}
          <FilterSelect
            label="Department"
            value={department}
            onChange={onDepartmentChange}
            options={departmentFacetsScoped}
            placeholder="Select department…"
            className="w-full sm:w-56"
          />
          {/* Option is Education-only — see showOptionFilter. */}
          {showOptionFilter && (
            <FilterSelect
              label="Option"
              value={program}
              onChange={onProgramChange}
              options={programFacets}
              placeholder="All options"
              className="w-full sm:w-64"
            />
          )}
          <FilterSelect
            label="Level"
            value={level}
            onChange={(v) => update({ current_level: v })}
            options={facets?.current_level}
            className="w-full sm:w-28"
          />
          <FilterSelect
            label="Gender"
            value={gender}
            onChange={(v) => update({ gender: v })}
            options={[
              { value: "M", label: "Male" },
              { value: "F", label: "Female" },
              { value: "unknown", label: "Not specified" },
            ]}
            className="w-full sm:w-40"
          />
          <FilterSelect
            label="Nationality"
            value={nationality}
            onChange={(v) => update({ nationality: v })}
            options={[
              { value: "rwandan", label: "Rwandan" },
              { value: "foreign", label: "Foreign" },
              { value: "unknown", label: "Not specified" },
            ]}
            className="w-full sm:w-40"
          />
          {/* Documents — one bucket per badge shown in the table, so a
              registrar can pull "everyone still unverified" in one click. */}
          <FilterSelect
            label="Documents"
            value={documentStatus}
            onChange={(v) => update({ document_status: v })}
            options={documentStatusFacets}
            placeholder="All documents"
            className="w-full sm:w-44"
          />
          <FilterSelect
            label="Learning mode"
            value={learning_mode}
            onChange={(v) => update({ learning_mode: v })}
            options={(stats?.active_breakdown?.by_learning_mode ?? []).map(
              (r: BreakdownRow) => ({
                value: r.value,
                label: r.label ?? r.value,
              }),
            )}
            placeholder="Select mode…"
            className="w-full sm:w-44"
          />
          <FilterSelect
            label="Country"
            value={country}
            onChange={(v) => update({ country: v })}
            options={countryFacets}
            placeholder="All countries"
            className="w-full sm:w-48"
          />
          {/* Province → District → Sector. Choosing a parent clears its
              children so a stale pairing can never be submitted. */}
          <FilterSelect
            label="Province"
            value={province}
            onChange={(v) => update({ province: v, district: "", sector: "" })}
            options={provinceFacets}
            placeholder="All provinces"
            className="w-full sm:w-44"
          />
          <FilterSelect
            label="District"
            value={district}
            onChange={(v) => update({ district: v, sector: "" })}
            options={districtFacets}
            placeholder={province ? "All districts" : "All districts"}
            className="w-full sm:w-44"
          />
          <FilterSelect
            label="Sector"
            value={sector}
            onChange={(v) => update({ sector: v })}
            options={sectorFacets}
            placeholder="All sectors"
            className="w-full sm:w-44"
          />
          <div className="w-full sm:w-auto">
            <label className="block text-[11px] font-medium text-ink-500 dark:text-ink-400 mb-1">
              Age
            </label>
            <div className="flex items-center gap-1.5">
              <input
                type="number" min={0} max={120} inputMode="numeric"
                value={ageMin}
                onChange={(e) => update({ age_min: e.target.value })}
                placeholder="Min"
                className="input w-20"
                aria-label="Minimum age"
              />
              <span className="text-ink-400 text-[12px]">–</span>
              <input
                type="number" min={0} max={120} inputMode="numeric"
                value={ageMax}
                onChange={(e) => update({ age_max: e.target.value })}
                placeholder="Max"
                className="input w-20"
                aria-label="Maximum age"
              />
            </div>
          </div>
        </div>

        {/* Age is derived from date of birth, which most records don't carry.
            Saying so up front stops the shrunken count reading as a bug. */}
        {(ageMin || ageMax) && filterOpts?.age && (
          <p className="mt-2 text-[11px] text-amber-600 dark:text-amber-400">
            Age comes from date of birth, which only{" "}
            {filterOpts.age.known.toLocaleString()} of{" "}
            {filterOpts.total.toLocaleString()} students have on record.
            Students without a usable date of birth are not included while an
            age filter is set.
          </p>
        )}
      </section>

      {/* Table */}
      <section className="card p-0 overflow-hidden">
        <Header
          title="Student Registry"
          sub={`${total.toLocaleString()} students${activeFilterCount ? " · filtered" : ""}`}
          loading={listQ.isLoading || listQ.isFetching}
        />

        {listQ.isLoading ? (
          <Skel />
        ) : listQ.isError ? (
          <Empty label="Failed to load students." />
        ) : rows.length === 0 ? (
          <Empty
            label={
              q || activeFilterCount
                ? "No students match your filters."
                : "No students yet."
            }
          />
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="data-table">
                <thead>
                  <tr>
                    <th className="w-[40px] pl-4">
                      <input
                        type="checkbox"
                        checked={rows.length > 0 && selectedIds.size === rows.length}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setSelectedIds(new Set(rows.map(r => r.id)));
                          } else {
                            setSelectedIds(new Set());
                          }
                        }}
                        className="rounded border-ink-300 text-brand focus:ring-brand"
                      />
                    </th>
                    <SortableHeader
                      label="Student"
                      field="fname"
                      currentSort={sort_by}
                      currentDir={sort_dir}
                      onSort={handleSort}
                    />
                    <SortableHeader
                      label="Reg / Index"
                      field="regnumber"
                      currentSort={sort_by}
                      currentDir={sort_dir}
                      onSort={handleSort}
                    />
                    <SortableHeader
                      label="Contact"
                      field="email"
                      currentSort={sort_by}
                      currentDir={sort_dir}
                      onSort={handleSort}
                    />
                    <SortableHeader
                      label="Campus"
                      field="campus"
                      currentSort={sort_by}
                      currentDir={sort_dir}
                      onSort={handleSort}
                    />
                    <SortableHeader
                      label="Gender"
                      field="gender"
                      currentSort={sort_by}
                      currentDir={sort_dir}
                      onSort={handleSort}
                    />
                    <SortableHeader
                      label="Nationality"
                      field="nationality"
                      currentSort={sort_by}
                      currentDir={sort_dir}
                      onSort={handleSort}
                    />
                    <th className="text-sm font-semibold text-ink-700 dark:text-ink-300 px-4">Documents</th>
                    <th className="w-[120px]"></th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((s) => (
                    <StudentRow
                      key={s.id}
                      s={s}
                      searchParams={sp}
                      isSelected={selectedIds.has(s.id)}
                      canGenerateDocuments={canGenerateDocuments}
                      onToggleSelect={(checked) => {
                        const next = new Set(selectedIds);
                        if (checked) next.add(s.id);
                        else next.delete(s.id);
                        setSelectedIds(next);
                      }}
                    />
                  ))}
                </tbody>
              </table>
            </div>
            <Pager page={page} last={last} onPage={setPage} />
          </>
        )}
      </section>

      <StudentExportModal
        open={exportOpen}
        onClose={() => setExportOpen(false)}
        totalRecords={total}
        filters={
          // Derived from listParams, never hand-copied: the export must always
          // describe the cohort on screen, and a second hand-maintained list
          // silently drifts every time a filter is added. Paging and sorting
          // are dropped — an export covers the whole filtered set, not a page.
          // Global campus + category live in the topbar stores and are
          // injected by the service layer.
          (() => {
            const { page: _p, per_page: _pp, sort_by: _sb, sort_dir: _sd, ...rest } = listParams;
            return rest as Record<string, string | number | undefined>;
          })()
        }
      />

      <BulkUploadModal
        open={bulkUploadOpen}
        onClose={() => setBulkUploadOpen(false)}
        title="Bulk import students"
        description="Download the Excel-compatible CSV template, fill it in (new rows are added, rows whose reg number already exists get updated), then re-upload to preview."
        templateUrl={studentService.bulkUploadTemplateUrl()}
        requiredFields={["fname", "lname", "std_option"]}
        fieldLabels={{
          fname: "First name",
          lname: "Last name",
          std_option: "Program (name or id)",
          campus: "Campus (name or id)",
          current_level: "Current level",
          regnumber: "Reg number",
          acc_year: "Academic year",
          id_card: "National ID / ID card",
          marital_status: "Marital status",
          student_state: "State",
          registration_date: "Registration date",
          birthdate: "Birthdate (YYYY-MM-DD)",
          gender: "Gender (M/F)",
        }}
        onValidate={(file) => studentService.bulkValidate(file)}
        onUpload={(file, patches) => studentService.bulkUpload(file, patches)}
        onSuccess={() => listQ.refetch()}
      />
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────
   Gender cell — click the chip to open a tiny popover and change it
   in place, with a success toast on save.
   ───────────────────────────────────────────────────────────── */
function GenderCell({
  studentId,
  gender,
}: {
  studentId: number;
  gender: string | null | undefined;
}) {
  const [anchor, setAnchor] = useState<DOMRect | null>(null);

  return (
    <>
      <button
        type="button"
        onClick={(e) => setAnchor(e.currentTarget.getBoundingClientRect())}
        className="chip-soft uppercase hover:ring-2 hover:ring-brand/30 transition-shadow cursor-pointer"
        title="Click to change gender"
      >
        {gender ? String(gender).slice(0, 1) : "—"}
      </button>
      {anchor && (
        <GenderEditPopover
          studentId={studentId}
          currentGender={gender}
          anchorRect={anchor}
          onClose={() => setAnchor(null)}
        />
      )}
    </>
  );
}

/* ─────────────────────────────────────────────────────────────
   Row + bits
   ───────────────────────────────────────────────────────────── */
function StudentRow({
  s,
  searchParams,
  isSelected,
  canGenerateDocuments,
  onToggleSelect,
}: {
  s: Student;
  searchParams?: URLSearchParams;
  isSelected?: boolean;
  canGenerateDocuments?: boolean;
  onToggleSelect?: (checked: boolean) => void;
}) {
  const navigate = useNavigate();
  const [docMenuAnchor, setDocMenuAnchor] = useState<DOMRect | null>(null);
  const name = [s.fname, s.lname].filter(Boolean).join(" ") || "—";
  const initials = name
    .split(" ")
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
  const photoSrc = s.photo
    ? studentService.photoUrl(s.id, s.photo as string)
    : null;

  const open = () =>
    navigate(`/students/${s.id}`, {
      state: { fromSearch: searchParams?.toString() },
    });

  // Cmd/Ctrl-click and middle-click should open in a new tab; the inner Link
  // handles those natively, so we only intercept plain clicks on the row.
  const onRowClick = (e: React.MouseEvent<HTMLTableRowElement>) => {
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
    if ((e.target as HTMLElement).closest("a,button")) return;
    open();
  };

  // Document verification badge. `document_status` is derived server-side
  // (StudentController::deriveDocumentStatus) from the documents attached to
  // the student's admission application, so it changes as soon as a document
  // is verified or rejected on the student's Documents tab.
  const documentStatus: DocumentStatus =
    (s.document_status as DocumentStatus | undefined) ?? "none";

  return (
    <tr
      onClick={onRowClick}
      className="cursor-pointer hover:bg-ink-50/60 dark:hover:bg-ink-800/40 transition-colors"
      title="Open student"
    >
      <td className="pl-4" onClick={(e) => e.stopPropagation()}>
        <input
          type="checkbox"
          checked={isSelected || false}
          onChange={(e) => onToggleSelect?.(e.target.checked)}
          className="rounded border-ink-300 text-brand focus:ring-brand"
        />
      </td>
      <td>
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-md bg-brand/10 text-brand dark:bg-brand/25 dark:text-gold-400 flex items-center justify-center font-semibold text-[12px] shrink-0 overflow-hidden relative">
            <span>{initials}</span>
            {photoSrc && (
              <img
                src={photoSrc}
                alt={name}
                className="w-full h-full object-cover absolute inset-0"
                onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none' }}
              />
            )}
          </div>
          <div className="min-w-0">
            <p className="font-semibold text-ink-900 dark:text-ink-100 truncate">
              {name}
            </p>
            <p className="text-[11.5px] text-ink-500 truncate">ID #{s.id}</p>
          </div>
        </div>
      </td>
      <td>
        <span className="font-mono text-[12px] text-ink-700 dark:text-ink-200">
          {s.regnumber || s.index_number || s.index_file || "—"}
        </span>
      </td>
      <td>
        <div className="flex flex-col gap-0.5">
          {s.email && (
            <span className="text-[12.5px] flex items-center gap-1 text-ink-700 dark:text-ink-200">
              <Mail className="w-3 h-3 shrink-0" /> {s.email}
            </span>
          )}
          {s.phone && (
            <span className="text-[12px] flex items-center gap-1 text-ink-500">
              <Phone className="w-3 h-3 shrink-0" /> {s.phone}
            </span>
          )}
          {!s.email && !s.phone && <span className="text-ink-400">—</span>}
        </div>
      </td>
      <td>
        <span className="text-[12.5px] text-ink-700 dark:text-ink-200">
          {String(s.campus_name || s.campus || "—")}
        </span>
      </td>
      <td onClick={(e) => e.stopPropagation()}>
        <GenderCell studentId={s.id} gender={s.gender as string | null | undefined} />
      </td>
      <td>{s.nationality || "—"}</td>
      <td className="px-4">
        <DocumentCompletionBadge
          status={documentStatus}
          onClick={() => {
            navigate(`/students/${s.id}?tab=documents`, {
              state: { fromSearch: searchParams?.toString() },
            });
          }}
        />
      </td>
      <td className="text-right pr-4">
        <div className="flex items-center justify-end gap-1.5" style={{ position: 'relative' }}>
          {canGenerateDocuments && (
            <>
              <button
                type="button"
                className="btn-secondary btn-sm px-2.5 py-1.5 rounded-md text-ink-600 dark:text-ink-300 hover:text-brand inline-flex items-center gap-1.5 whitespace-nowrap"
                title="Generate document"
                onClick={(e) => {
                  e.stopPropagation();
                  setDocMenuAnchor((e.currentTarget as HTMLElement).getBoundingClientRect());
                }}
              >
                <FileText className="w-3.5 h-3.5" />
              </button>
              {docMenuAnchor && (
                <DocumentGenerateMenu
                  studentId={s.id}
                  anchorRect={docMenuAnchor}
                  onClose={() => setDocMenuAnchor(null)}
                />
              )}
            </>
          )}
          <Link
            to={`/students/${s.id}`}
            state={{ fromSearch: searchParams?.toString() }}
            className="btn-secondary btn-sm px-3 py-1.5 rounded-md text-ink-600 dark:text-ink-300 hover:text-brand inline-flex items-center gap-1.5 whitespace-nowrap"
            title="View Student"
          >
            <Eye className="w-3.5 h-3.5" />
            <span>View</span>
          </Link>
        </div>
      </td>
    </tr>
  );
}

/* ─────────────────────────────────────────────────────────────
   Shared UI bits
   ───────────────────────────────────────────────────────────── */
function TabButton({
  active,
  icon: Icon,
  label,
  onClick,
}: {
  active: boolean;
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 px-3 py-2 text-[13px] rounded-md transition-colors ${
        active
          ? "bg-brand text-white font-semibold shadow-sm"
          : "text-ink-600 dark:text-ink-300 hover:text-ink-900 hover:bg-ink-50 dark:hover:text-white dark:hover:bg-ink-700/40"
      }`}
    >
      <Icon className="w-3.5 h-3.5" />
      {label}
    </button>
  );
}

function ClickableStat({
  label,
  value,
  icon,
  tone,
  onClick,
}: {
  label: string;
  value: string;
  icon: React.ComponentType<{ className?: string }>;
  tone: "lilac" | "sky" | "peach" | "mint" | "sun";
  onClick?: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="text-left hover:-translate-y-0.5 transition-transform focus:outline-none focus-visible:ring-2 focus-visible:ring-brand/40 rounded-xl"
      type="button"
    >
      <StatCard label={label} value={value} icon={icon as any} tone={tone} />
    </button>
  );
}

function FilterSelect({
  label,
  value,
  onChange,
  options,
  disabled,
  placeholder,
  className,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options?: FacetOption[];
  disabled?: boolean;
  placeholder?: string;
  className?: string;
}) {
  return (
    <div className={`block ${className ?? ""}`}>
      <span className={`text-[11px] uppercase tracking-wider block mb-1 ${disabled ? 'text-ink-300' : 'text-ink-400'}`}>
        {label}
      </span>
      <div className={disabled ? 'opacity-50 pointer-events-none' : ''}>
        <SearchableSelect
          options={options ?? []}
          value={value}
          onChange={(v) => onChange(v === 0 || v === "" ? "" : String(v))}
          allLabel={placeholder ?? "All"}
          placeholder={placeholder ?? "All"}
        />
      </div>
    </div>
  );
}

function Header({
  title,
  sub,
  loading,
}: {
  title: string;
  sub: string;
  loading: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-4 px-6 pt-5 pb-3 border-b border-ink-100 dark:border-ink-700">
      <div>
        <h2 className="section-title">{title}</h2>
        <p className="section-sub">{sub}</p>
      </div>
      {loading && <Loader2 className="w-4 h-4 text-ink-400 animate-spin" />}
    </div>
  );
}

function Empty({ label }: { label: string }) {
  return (
    <div className="p-10 text-center text-ink-500 text-[13px]">{label}</div>
  );
}

function Skel() {
  return (
    <div className="p-6 space-y-2">
      {Array.from({ length: 6 }).map((_, i) => (
        <div
          key={i}
          className="h-10 rounded-md bg-ink-50 dark:bg-ink-700/30 animate-pulse"
        />
      ))}
    </div>
  );
}

function Pager({
  page,
  last,
  onPage,
}: {
  page: number;
  last: number;
  onPage: (p: number) => void;
}) {
  if (last <= 1) return null;
  return (
    <div className="flex items-center justify-between px-6 py-3 border-t border-ink-100 dark:border-ink-700 text-[12.5px] text-ink-500">
      <span>
        Page {page} of {last}
      </span>
      <div className="flex gap-1">
        <button
          className="btn-secondary btn-sm"
          onClick={() => onPage(Math.max(1, page - 1))}
          disabled={page <= 1}
        >
          <ArrowLeft className="w-3 h-3" /> Prev
        </button>
        <button
          className="btn-secondary btn-sm"
          onClick={() => onPage(Math.min(last, page + 1))}
          disabled={page >= last}
        >
          Next <ArrowRight className="w-3 h-3" />
        </button>
      </div>
    </div>
  );
}

function SortableHeader({
  label,
  field,
  currentSort,
  currentDir,
  onSort,
}: {
  label: string;
  field: string;
  currentSort: string;
  currentDir: "asc" | "desc";
  onSort: (field: string) => void;
}) {
  const active = currentSort === field;
  return (
    <th
      onClick={() => onSort(field)}
      className="cursor-pointer group hover:bg-ink-50/50 dark:hover:bg-ink-800/50 transition-colors select-none"
    >
      <div className="flex items-center gap-1.5">
        {label}
        <span
          className={`flex flex-col text-[8px] leading-[8px] ${active ? "text-brand" : "text-ink-300 opacity-0 group-hover:opacity-100"}`}
        >
          <span
            className={
              active && currentDir === "asc" ? "text-brand" : "text-ink-300"
            }
          >
            ▲
          </span>
          <span
            className={
              active && currentDir === "desc" ? "text-brand" : "text-ink-300"
            }
          >
            ▼
          </span>
        </span>
      </div>
    </th>
  );
}

function fmt(n?: number | null): string {
  if (n === null || n === undefined) return "—";
  const num = typeof n === "string" ? Number(n) : n;
  if (Number.isNaN(num)) return "—";
  return num.toLocaleString();
}
