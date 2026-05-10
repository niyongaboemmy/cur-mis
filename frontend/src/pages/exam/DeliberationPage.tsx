import { useEffect, useMemo, useState } from "react";
import { useQuery, keepPreviousData } from "@tanstack/react-query";
import {
  Loader2,
  Download,
  GraduationCap,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import * as XLSX from "xlsx";
import toast from "react-hot-toast";
import { academicService } from "@/services/academicService";
import { academicsMgmtService } from "@/services/academicsMgmtService";
import { intakeService } from "@/services/admissionService";
import {
  deliberationService,
  type DeliberationModule,
  type DeliberationStudent,
  type DeliberationCell,
} from "@/services/deliberationService";

const MODULE_COL_COUNT = 6; // CAT/60, FAT/40, TOT/100, CP, Grade, Verdict

// Fixed left columns — pinned (position: sticky) so the student identity
// stays visible while the user scrolls horizontally through every module.
// `w` is the column width in pixels; `left` is the cumulative offset from
// the scroll container's left edge and is computed below. INTAKE is kept
// in the Excel export below but intentionally omitted from the grid.
const FIXED_COL_DEFS = [
  { key: "NO", label: "NO", w: 40 },
  { key: "SURNAME", label: "SURNAME", w: 140 },
  { key: "FIRST_NAME", label: "FIRST NAME", w: 140 },
  { key: "SEX", label: "SEX", w: 44 },
  { key: "REG_NUMBER", label: "REG NUMBER", w: 120 },
] as const;

const FIXED_COL_LEFT = FIXED_COL_DEFS.reduce<number[]>((acc, _c, i) => {
  acc.push(i === 0 ? 0 : acc[i - 1] + FIXED_COL_DEFS[i - 1].w);
  return acc;
}, []);

// Excel export keeps the legacy 6-column layout (INTAKE included) — the
// xlsx is the place to slice/filter by intake even when the on-screen grid
// hides it.
const FIXED_COLS = [
  "INTAKE",
  "NO",
  "SURNAME",
  "FIRST NAME",
  "SEX",
  "REG NUMBER",
];

const num = (v: unknown): number | null => {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

const fmt = (v: number | null): string =>
  v === null ? "—" : (Math.round(v * 100) / 100).toString();

const cellFor = (
  s: DeliberationStudent,
  mid: number,
): DeliberationCell | null => s.marks?.[mid] ?? null;

export default function DeliberationPage() {
  /* ── filters ──────────────────────────────────────────────────── */
  const yearsQ = useQuery({
    queryKey: ["academic", "years"],
    queryFn: () => academicService.listYears(),
  });
  const years = yearsQ.data?.data ?? [];
  const [yearId, setYearId] = useState<number>(0);

  const programsQ = useQuery({
    queryKey: ["acmgmt", "options", "all"],
    queryFn: () => academicsMgmtService.list<any>("options", { per_page: 500 }),
    staleTime: 5 * 60_000,
  });
  const programs: any[] = programsQ.data?.data?.data ?? [];

  const intakesQ = useQuery({
    queryKey: ["admin", "intakes"],
    queryFn: () => intakeService.list(),
    staleTime: 5 * 60_000,
  });
  const intakes: any[] = intakesQ.data?.data ?? [];

  const [stdOption, setStdOption] = useState<string>("");
  const [level, setLevel] = useState<string>("");
  const [intake, setIntake] = useState<string>("");
  const [page, setPage] = useState<number>(1);
  const [perPage, setPerPage] = useState<number>(50);

  // Reset to page 1 whenever any filter changes — otherwise the user may end
  // up paging into an empty range that exists only in the previous filter.
  useEffect(() => {
    setPage(1);
  }, [yearId, stdOption, level, intake, perPage]);

  /* ── grid query ──────────────────────────────────────────────── */
  const gridQ = useQuery({
    queryKey: [
      "deliberation",
      "grid",
      { yearId, stdOption, level, intake, page, perPage },
    ],
    queryFn: () =>
      deliberationService.grid({
        academic_year_id: yearId || undefined,
        std_option: stdOption || undefined,
        current_level: level || undefined,
        intake: intake || undefined,
        page,
        per_page: perPage,
      }),
    placeholderData: keepPreviousData,
    staleTime: 30_000,
  });
  const data = gridQ.data?.data;
  const modules: DeliberationModule[] = data?.modules ?? [];
  const students: DeliberationStudent[] = data?.students ?? [];
  const yearLabel = data?.academic_year?.label ?? "";
  const pagination = data?.pagination ?? {
    page: 1,
    per_page: perPage,
    total: 0,
    last_page: 1,
  };

  /* ── selected program label (for headers/export filename) ─────── */
  const selectedProgram = useMemo(
    () => programs.find((p) => String(p.id) === String(stdOption)),
    [programs, stdOption],
  );

  /* ── Excel export — pulls every page so the file is the full set ─── */
  const [exporting, setExporting] = useState(false);
  const handleExport = async () => {
    if (pagination.total === 0) {
      toast.error("Nothing to export yet.");
      return;
    }
    setExporting(true);
    try {
      // Fetch every page back-to-back with the largest allowed per_page so
      // the Excel covers the full filtered dataset, not just the visible
      // rows. The backend clamps per_page at 200.
      const pageSize = 200;
      const pages = Math.ceil(pagination.total / pageSize);
      const allStudents: DeliberationStudent[] = [];
      for (let p = 1; p <= pages; p++) {
        const res = await deliberationService.grid({
          academic_year_id: yearId || undefined,
          std_option: stdOption || undefined,
          current_level: level || undefined,
          intake: intake || undefined,
          page: p,
          per_page: pageSize,
        });
        allStudents.push(...(res?.data?.students ?? []));
      }

      // Two-row header. Top row spans 6 fixed columns then 6 columns per
      // module labelled with the module name; the row below shows the
      // sub-column codes.
      const topHeader: any[] = [...FIXED_COLS];
      const subHeader: any[] = ["", "", "", "", "", ""];
      for (const m of modules) {
        topHeader.push(m.module_code, m.module_name, "", "", "", "");
        subHeader.push("CAT/60", "FAT/40", "TOT/100", "CP", "GRADE", "VERDICT");
      }
      const aoa: any[][] = [topHeader, subHeader];

      allStudents.forEach((s, i) => {
        const row: any[] = [
          s.intake ?? "",
          i + 1,
          s.lname,
          s.fname,
          s.sex ?? "",
          s.regnumber,
        ];
        for (const m of modules) {
          const c = cellFor(s, m.module_id);
          row.push(
            c?.cats_60 ?? "",
            c?.fat_40 ?? "",
            c?.total_100 ?? "",
            c?.credits_points ?? "",
            c?.grade ?? "",
            c?.decision ?? "",
          );
        }
        aoa.push(row);
      });

      const ws = XLSX.utils.aoa_to_sheet(aoa);

      // Merge the top row across each module's 6 sub-columns so the module
      // name reads as a single cell in Excel.
      const merges: XLSX.Range[] = [];
      modules.forEach((_m, idx) => {
        const startCol = FIXED_COLS.length + idx * MODULE_COL_COUNT;
        merges.push({
          s: { r: 0, c: startCol },
          e: { r: 0, c: startCol + MODULE_COL_COUNT - 1 },
        });
      });
      ws["!merges"] = merges;

      // Force the Reg # column to text so leading zeros aren't stripped.
      const regCol = 5;
      for (let R = 2; R < aoa.length; R++) {
        const ref = XLSX.utils.encode_cell({ r: R, c: regCol });
        if (ws[ref]) {
          ws[ref].t = "s";
          ws[ref].v = String(ws[ref].v ?? "");
        }
      }

      // Reasonable widths.
      ws["!cols"] = [
        { wch: 18 },
        { wch: 4 },
        { wch: 18 },
        { wch: 18 },
        { wch: 5 },
        { wch: 18 },
        ...modules.flatMap(() => [
          { wch: 8 },
          { wch: 8 },
          { wch: 9 },
          { wch: 9 },
          { wch: 7 },
          { wch: 9 },
        ]),
      ];

      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Deliberation");
      const slug = (s: string) =>
        s.replace(/[^a-z0-9]+/gi, "-").replace(/^-+|-+$/g, "");
      const parts = [
        slug(selectedProgram?.name ?? "all-programs"),
        level ? `level-${level}` : "",
        intake ? slug(intake) : "",
        yearLabel ? slug(yearLabel) : "",
      ].filter(Boolean);
      XLSX.writeFile(wb, `deliberation-${parts.join("-")}.xlsx`);
      toast.success(`Exported ${allStudents.length} student(s).`);
    } catch (e: any) {
      toast.error(e?.response?.data?.message ?? e?.message ?? "Export failed.");
    } finally {
      setExporting(false);
    }
  };

  /* ── derived row totals ──────────────────────────────────────── */
  const studentTotals = useMemo(() => {
    const out: Record<
      string,
      {
        totalPct: number | null;
        totalCp: number;
        passed: number;
        failed: number;
      }
    > = {};
    for (const s of students) {
      let totalCp = 0;
      let pctSum = 0;
      let pctCount = 0;
      let passed = 0;
      let failed = 0;
      for (const m of modules) {
        const c = cellFor(s, m.module_id);
        if (!c) continue;
        const cp = num(c.credits_points);
        const pc = num(c.total_100);
        if (cp !== null) totalCp += cp;
        if (pc !== null) {
          pctSum += pc;
          pctCount++;
        }
        if (c.decision === "P") passed++;
        else if (c.decision === "F&R") failed++;
      }
      out[s.regnumber] = {
        totalPct: pctCount > 0 ? +(pctSum / pctCount).toFixed(2) : null,
        totalCp: +totalCp.toFixed(2),
        passed,
        failed,
      };
    }
    return out;
  }, [students, modules]);

  return (
    <div className="space-y-4 animate-fade-in">
      {/* Header + filters */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-lg font-bold text-ink-900 dark:text-white">
            Deliberation
          </h2>
          <p className="text-[13px] text-ink-500">
            Per-program deliberation grid — every active student on the rows,
            every module in the program's curriculum on the columns. Cells stay
            empty until a registration & marks exist.
          </p>
        </div>
        <div className="flex gap-2 items-center flex-wrap">
          <select
            className="input input-sm w-44"
            value={yearId || ""}
            onChange={(e) => setYearId(Number(e.target.value))}
          >
            <option value="">Current year</option>
            {years.map((y: any) => (
              <option key={y.id} value={y.id}>
                {y.label}
                {y.is_current ? " (current)" : ""}
              </option>
            ))}
          </select>

          <select
            className="input input-sm w-56"
            value={stdOption}
            onChange={(e) => setStdOption(e.target.value)}
          >
            <option value="">All programs</option>
            {programs.map((p: any) => (
              <option key={p.id} value={p.id}>
                {p.acro ? `${p.acro} — ` : ""}
                {p.name}
              </option>
            ))}
          </select>

          <select
            className="input input-sm w-32"
            value={level}
            onChange={(e) => setLevel(e.target.value)}
          >
            <option value="">All levels</option>
            {[1, 2, 3, 4, 5, 6, 7, 8].map((l) => (
              <option key={l} value={l}>
                Level {l}
              </option>
            ))}
          </select>

          <select
            className="input input-sm w-44"
            value={intake}
            onChange={(e) => setIntake(e.target.value)}
          >
            <option value="">All intakes</option>
            {intakes.map((it: any) => (
              <option key={it.id} value={it.name ?? it.label ?? ""}>
                {it.label ?? it.name ?? `Intake ${it.id}`}
              </option>
            ))}
          </select>

          <button
            className="btn-ghost btn-sm"
            disabled={pagination.total === 0 || gridQ.isLoading || exporting}
            onClick={handleExport}
            title="Export every student in the current filter set as Excel"
          >
            {exporting ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Download className="w-3.5 h-3.5" />
            )}
            {exporting ? "Exporting…" : "Export"}
          </button>
        </div>
      </div>

      {/* Summary strip */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Stat
          icon={<GraduationCap className="w-4 h-4" />}
          label="Students"
          value={pagination.total}
        />
        <Stat
          icon={<GraduationCap className="w-4 h-4" />}
          label="Modules"
          value={modules.length}
        />
        <Stat
          icon={<GraduationCap className="w-4 h-4" />}
          label="Year"
          value={yearLabel || "—"}
        />
        <Stat
          icon={<GraduationCap className="w-4 h-4" />}
          label="Program"
          value={selectedProgram?.name ?? "—"}
        />
      </div>

      {gridQ.isLoading ? (
        <div className="card p-12 text-center text-ink-500">
          <Loader2 className="w-5 h-5 animate-spin mx-auto mb-2" />
          Loading deliberation data…
        </div>
      ) : students.length === 0 ? (
        <div className="card p-8 text-center text-ink-500">
          No active students match these filters.
        </div>
      ) : (
        <>
          {modules.length === 0 && (
            <div className="card p-3 text-[12.5px] text-amber-800 bg-amber-50 dark:bg-amber-500/10 dark:text-amber-200 border border-amber-200 dark:border-amber-500/30">
              {stdOption ? (
                <>
                  No modules are mapped to this program's curriculum yet —
                  showing the student roster only. Add modules to the program
                  under{" "}
                  <span className="font-mono">
                    Academics → Modules / Courses
                  </span>
                  , then they will appear here as columns.
                </>
              ) : (
                <>
                  Pick a program above to view its curriculum. Without a program
                  filter the grid falls back to modules students are registered
                  for{yearLabel ? ` in ${yearLabel}` : ""}, which is empty for
                  this selection.
                </>
              )}
            </div>
          )}
          <div className="card overflow-auto max-h-[700px]">
            <table
              className="w-full text-left text-[11.5px]"
              style={{
                minWidth:
                  modules.length === 0 ? 600 : 900 + modules.length * 360,
              }}
            >
              <thead className="sticky top-0 z-20">
                {/* Module-name row (or single header row when there are no modules) */}
                <tr className="bg-sky-50 dark:bg-ink-800 border-b border-ink-100 dark:border-ink-700">
                  {FIXED_COL_DEFS.map((c, i) => (
                    <th
                      key={c.key}
                      rowSpan={modules.length > 0 ? 2 : 1}
                      // sticky top + sticky left → corner cell; z-30 keeps it
                      // above both the column-only sticky body cells (z-10)
                      // and the row-only sticky header (z-20).
                      className="sticky top-0 z-30 px-2 py-2 font-bold text-ink-500 text-[10px] uppercase border-r border-ink-100 dark:border-ink-700 align-bottom whitespace-nowrap bg-sky-50 dark:bg-ink-800"
                      style={{
                        left: FIXED_COL_LEFT[i],
                        width: c.w,
                        minWidth: c.w,
                      }}
                    >
                      {c.label}
                    </th>
                  ))}
                  {modules.map((m) => (
                    <th
                      key={m.module_id}
                      colSpan={MODULE_COL_COUNT}
                      className="px-2 py-1.5 font-semibold text-ink-700 dark:text-ink-100 text-[11px] uppercase text-center border-r border-ink-100 dark:border-ink-700 bg-amber-50/60 dark:bg-amber-500/10"
                      title={`${m.module_code} — ${m.module_name} (${m.module_credits ?? "?"} credits)`}
                    >
                      <div className="font-bold">{m.module_code}</div>
                      <div className="text-[10px] font-normal text-ink-500 truncate max-w-[300px] mx-auto">
                        {m.module_name}{" "}
                        <span className="font-semibold text-ink-700 dark:text-ink-200">
                          ·{m.module_credits ?? "?"}cr
                        </span>
                      </div>
                    </th>
                  ))}
                  {modules.length > 0 && (
                    <>
                      <th
                        rowSpan={2}
                        className="px-2 py-2 font-bold text-ink-500 text-[10px] uppercase text-center border-l border-ink-100 dark:border-ink-700 align-bottom bg-emerald-50/50 dark:bg-emerald-500/10"
                      >
                        TOT %
                      </th>
                      <th
                        rowSpan={2}
                        className="px-2 py-2 font-bold text-ink-500 text-[10px] uppercase text-center align-bottom bg-emerald-50/50 dark:bg-emerald-500/10"
                      >
                        Σ CP
                      </th>
                    </>
                  )}
                </tr>
                {/* Sub-column row only renders when there are modules.
                     Opaque bg so scrolling body rows don't show through under
                     the sticky header. */}
                {modules.length > 0 && (
                  <tr className="bg-sky-50 dark:bg-ink-800 border-b border-ink-100 dark:border-ink-700">
                    {modules.flatMap((m) => [
                      <th
                        key={`${m.module_id}-cat`}
                        className="px-1.5 py-1 font-semibold text-ink-500 text-[9.5px] uppercase text-center border-r border-ink-100 dark:border-ink-700 bg-sky-50 dark:bg-ink-800"
                      >
                        CAT/60
                      </th>,
                      <th
                        key={`${m.module_id}-fat`}
                        className="px-1.5 py-1 font-semibold text-ink-500 text-[9.5px] uppercase text-center border-r border-ink-100 dark:border-ink-700 bg-sky-50 dark:bg-ink-800"
                      >
                        FAT/40
                      </th>,
                      <th
                        key={`${m.module_id}-tot`}
                        className="px-1.5 py-1 font-semibold text-ink-500 text-[9.5px] uppercase text-center border-r border-ink-100 dark:border-ink-700 bg-sky-50 dark:bg-ink-800"
                      >
                        TOT/100
                      </th>,
                      <th
                        key={`${m.module_id}-cp`}
                        className="px-1.5 py-1 font-semibold text-ink-500 text-[9.5px] uppercase text-center border-r border-ink-100 dark:border-ink-700 bg-sky-50 dark:bg-ink-800"
                      >
                        CP
                      </th>,
                      <th
                        key={`${m.module_id}-gr`}
                        className="px-1.5 py-1 font-semibold text-ink-500 text-[9.5px] uppercase text-center border-r border-ink-100 dark:border-ink-700 bg-sky-50 dark:bg-ink-800"
                      >
                        GR
                      </th>,
                      <th
                        key={`${m.module_id}-vd`}
                        className="px-1.5 py-1 font-semibold text-ink-500 text-[9.5px] uppercase text-center border-r border-ink-100 dark:border-ink-700 bg-sky-50 dark:bg-ink-800"
                      >
                        VD
                      </th>,
                    ])}
                  </tr>
                )}
              </thead>
              <tbody className="divide-y divide-ink-100 dark:divide-ink-700">
                {students.map((s, i) => {
                  const tot = studentTotals[s.regnumber];
                  // Number across the full filtered set, not just the page slice.
                  const ordinal =
                    (pagination.page - 1) * pagination.per_page + i + 1;
                  return (
                    <tr key={s.regnumber} className="group">
                      {/*
                        Pinned student-identity columns. Each is `position: sticky`
                        with an explicit `left` so the column stays put while the
                        user scrolls horizontally through the modules. Solid bg is
                        required — otherwise the scrolling module columns bleed
                        through. z-10 keeps these above unpinned body cells (z-0)
                        and below the sticky header (z-20 / corner z-30).
                      */}
                      <td
                        className="sticky z-10 px-2 py-1.5 border-r border-ink-100 dark:border-ink-700 text-ink-500 bg-white dark:bg-ink-900 group-hover:bg-ink-50/80 dark:group-hover:bg-ink-700/30"
                        style={{
                          left: FIXED_COL_LEFT[0],
                          width: FIXED_COL_DEFS[0].w,
                          minWidth: FIXED_COL_DEFS[0].w,
                        }}
                      >
                        {ordinal}
                      </td>
                      <td
                        className="sticky z-10 px-2 py-1.5 border-r border-ink-100 dark:border-ink-700 font-medium bg-white dark:bg-ink-900 group-hover:bg-ink-50/80 dark:group-hover:bg-ink-700/30"
                        style={{
                          left: FIXED_COL_LEFT[1],
                          width: FIXED_COL_DEFS[1].w,
                          minWidth: FIXED_COL_DEFS[1].w,
                        }}
                      >
                        {(s.lname ?? "").trim() || "—"}
                      </td>
                      <td
                        className="sticky z-10 px-2 py-1.5 border-r border-ink-100 dark:border-ink-700 bg-white dark:bg-ink-900 group-hover:bg-ink-50/80 dark:group-hover:bg-ink-700/30"
                        style={{
                          left: FIXED_COL_LEFT[2],
                          width: FIXED_COL_DEFS[2].w,
                          minWidth: FIXED_COL_DEFS[2].w,
                        }}
                      >
                        {(s.fname ?? "").trim() || "—"}
                      </td>
                      <td
                        className="sticky z-10 px-2 py-1.5 text-center border-r border-ink-100 dark:border-ink-700 bg-white dark:bg-ink-900 group-hover:bg-ink-50/80 dark:group-hover:bg-ink-700/30"
                        style={{
                          left: FIXED_COL_LEFT[3],
                          width: FIXED_COL_DEFS[3].w,
                          minWidth: FIXED_COL_DEFS[3].w,
                        }}
                      >
                        {s.sex ?? "—"}
                      </td>
                      <td
                        className="sticky z-10 px-2 py-1.5 font-mono border-r border-ink-100 dark:border-ink-700 whitespace-nowrap bg-white dark:bg-ink-900 group-hover:bg-ink-50/80 dark:group-hover:bg-ink-700/30"
                        style={{
                          left: FIXED_COL_LEFT[4],
                          width: FIXED_COL_DEFS[4].w,
                          minWidth: FIXED_COL_DEFS[4].w,
                        }}
                      >
                        {s.regnumber}
                      </td>
                      {modules.map((m) => {
                        const c = cellFor(s, m.module_id);
                        const exempted = c?.is_exempted;
                        return (
                          <Cell6 key={m.module_id} c={c} exempted={exempted} />
                        );
                      })}
                      {modules.length > 0 && (
                        <>
                          <td className="px-2 py-1.5 text-center font-semibold border-l border-ink-100 dark:border-ink-700 bg-emerald-50/40 dark:bg-emerald-500/5">
                            {tot?.totalPct === null ||
                            tot?.totalPct === undefined
                              ? "—"
                              : `${tot.totalPct}%`}
                          </td>
                          <td className="px-2 py-1.5 text-center font-semibold bg-emerald-50/40 dark:bg-emerald-500/5">
                            {fmt(tot?.totalCp ?? null)}
                          </td>
                        </>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* Pagination footer — always visible while there's data so the user
          can keep their bearings as they browse. */}
      {pagination.total > 0 && (
        <div className="flex items-center justify-between gap-3 flex-wrap text-[12.5px] text-ink-600 dark:text-ink-300">
          <div>
            Showing{" "}
            <span className="font-semibold text-ink-900 dark:text-white">
              {(pagination.page - 1) * pagination.per_page + 1}
              {"–"}
              {Math.min(
                pagination.page * pagination.per_page,
                pagination.total,
              )}
            </span>{" "}
            of{" "}
            <span className="font-semibold text-ink-900 dark:text-white">
              {pagination.total}
            </span>{" "}
            students
          </div>
          <div className="flex items-center gap-2">
            <select
              className="input input-sm w-24"
              value={perPage}
              onChange={(e) => setPerPage(Number(e.target.value))}
              title="Rows per page"
            >
              {[25, 50, 100, 200].map((n) => (
                <option key={n} value={n}>
                  {n} / page
                </option>
              ))}
            </select>
            <button
              className="btn-ghost btn-sm"
              disabled={pagination.page <= 1 || gridQ.isFetching}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              <ChevronLeft className="w-3.5 h-3.5" /> Prev
            </button>
            <span className="px-2">
              Page{" "}
              <span className="font-semibold text-ink-900 dark:text-white">
                {pagination.page}
              </span>{" "}
              of {pagination.last_page}
            </span>
            <button
              className="btn-ghost btn-sm"
              disabled={
                pagination.page >= pagination.last_page || gridQ.isFetching
              }
              onClick={() =>
                setPage((p) => Math.min(pagination.last_page, p + 1))
              }
            >
              Next <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/* ─── small UI bits ──────────────────────────────────────────────── */

function Cell6({
  c,
  exempted,
}: {
  c: DeliberationCell | null;
  exempted?: boolean;
}) {
  const base =
    "px-1 py-1 text-center border-r border-ink-100 dark:border-ink-700 whitespace-nowrap";
  if (!c) {
    return (
      <>
        <td className={base}>—</td>
        <td className={base}>—</td>
        <td className={base}>—</td>
        <td className={base}>—</td>
        <td className={base}>—</td>
        <td className={base}>—</td>
      </>
    );
  }
  if (exempted) {
    return (
      <>
        <td
          className={`${base} text-violet-700 dark:text-violet-300`}
          colSpan={6}
        >
          EXEMPTED
        </td>
      </>
    );
  }
  return (
    <>
      <td className={base}>{fmt(c.cats_60)}</td>
      <td className={base}>{fmt(c.fat_40)}</td>
      <td className={`${base} font-semibold`}>
        {c.total_100 === null ? "—" : `${fmt(c.total_100)}`}
      </td>
      <td className={base}>{fmt(c.credits_points)}</td>
      <td className={`${base} font-semibold`}>{c.grade ?? "—"}</td>
      <td className={base}>
        {c.decision ? (
          <span
            className={`px-1.5 py-0.5 rounded-full text-[10px] font-bold ${
              c.decision === "P"
                ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300"
                : "bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-300"
            }`}
          >
            {c.decision}
          </span>
        ) : (
          <span className="text-ink-400">—</span>
        )}
      </td>
    </>
  );
}

function Stat({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string | number;
}) {
  return (
    <div className="card p-3 flex items-center gap-3">
      <div className="w-8 h-8 rounded-lg bg-primary-50 dark:bg-primary-500/10 text-primary-600 flex items-center justify-center">
        {icon}
      </div>
      <div className="min-w-0">
        <div className="text-[10.5px] uppercase font-bold text-ink-400 tracking-wide">
          {label}
        </div>
        <div className="text-[15px] font-semibold text-ink-900 dark:text-white truncate">
          {value}
        </div>
      </div>
    </div>
  );
}
