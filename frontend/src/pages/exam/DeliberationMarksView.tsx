import { useEffect, useMemo, useState } from "react";
import { useQuery, keepPreviousData } from "@tanstack/react-query";
import {
  Loader2,
  Search,
  ChevronLeft,
  ChevronRight,
  Building2,
  GraduationCap,
  BookOpen,
  X,
  CheckCircle2,
  XCircle,
  Layers,
  ClipboardList,
  Download,
  ShieldCheck,
} from "lucide-react";
import * as XLSX from "xlsx";
import toast from "react-hot-toast";
import {
  deliberationService,
  type MarkStudentRow,
  type StudentMarkRow,
} from "@/services/deliberationService";
import { usePermission } from "@/utils/permissions";
import { PERMISSIONS } from "@/constants/permissions";
import ModalPortal from "@/components/ui/ModalPortal";
import { useLevels } from "@/hooks/useLevels";

const n = (v: unknown): number => {
  const x = Number(v);
  return Number.isFinite(x) ? x : 0;
};
const pct = (v: unknown): string => {
  if (v === null || v === undefined || v === "") return "—";
  const x = Number(v);
  return Number.isFinite(x) ? `${Math.round(x * 100) / 100}%` : "—";
};
const nameOf = (s: { lname?: string | null; fname?: string | null }) =>
  `${(s.lname ?? "").trim()} ${(s.fname ?? "").trim()}`.trim() || "—";

export default function DeliberationMarksView() {
  const { levels, levelName: levelNameOf } = useLevels();

  /* ── filters / hierarchy ─────────────────────────────────────── */
  const filtersQ = useQuery({
    queryKey: ["deliberation", "mark-filters"],
    queryFn: () => deliberationService.markFilters(),
    staleTime: 5 * 60_000,
  });
  const filters = filtersQ.data?.data;
  const departments = filters?.departments ?? [];
  const programs = filters?.programs ?? [];
  const passMark = filters?.pass_mark ?? 50;

  const [deptId, setDeptId] = useState<number>(0);
  const [optionId, setOptionId] = useState<number>(0);
  const [level, setLevel] = useState<string>("");
  const [q, setQ] = useState<string>("");
  const [qDebounced, setQDebounced] = useState<string>("");
  const [page, setPage] = useState<number>(1);
  const [perPage, setPerPage] = useState<number>(50);
  const [openReg, setOpenReg] = useState<string | null>(null);

  // Debounce the search box so we don't fire a query per keystroke.
  useEffect(() => {
    const t = setTimeout(() => setQDebounced(q.trim()), 350);
    return () => clearTimeout(t);
  }, [q]);

  useEffect(() => {
    setPage(1);
  }, [deptId, optionId, level, qDebounced, perPage]);

  // Programs belong to the selected department; clear program when the
  // department changes to a set that no longer contains it.
  const deptPrograms = useMemo(
    () =>
      deptId > 0
        ? programs.filter((p) => Number(p.department_id) === deptId)
        : programs,
    [programs, deptId],
  );
  useEffect(() => {
    if (optionId && !deptPrograms.some((p) => Number(p.id) === optionId)) {
      setOptionId(0);
    }
  }, [deptPrograms, optionId]);

  /* ── student list ────────────────────────────────────────────── */
  const listQ = useQuery({
    queryKey: [
      "deliberation",
      "mark-students",
      { deptId, optionId, level, qDebounced, page, perPage },
    ],
    queryFn: () =>
      deliberationService.markStudents({
        department_id: deptId || undefined,
        option_id: optionId || undefined,
        current_level: level || undefined,
        q: qDebounced || undefined,
        page,
        per_page: perPage,
      }),
    placeholderData: keepPreviousData,
    staleTime: 30_000,
  });
  const students: MarkStudentRow[] = listQ.data?.data?.students ?? [];
  const pagination = listQ.data?.data?.pagination ?? {
    page: 1,
    per_page: perPage,
    total: 0,
    last_page: 1,
  };

  /* ── Board actions: export + approve ──────────────────────────────────
   * Both take the CURRENT filter rather than the current page — a board
   * signs off a population (a department, a programme, a level), and an
   * export of only the 50 visible rows would be misleading. */
  const filterParams = {
    department_id: deptId || undefined,
    option_id: optionId || undefined,
    current_level: level || undefined,
    q: qDebounced || undefined,
  };

  const canApprove = usePermission(PERMISSIONS.CONFIRM_MODULE_MARKS);
  const [exporting, setExporting] = useState(false);
  const [approving, setApproving] = useState(false);
  const [confirmApprove, setConfirmApprove] = useState(false);

  const handleExport = async () => {
    setExporting(true);
    try {
      const res = await deliberationService.exportMarkStudents(filterParams);
      const rows = res.data?.rows ?? [];
      if (rows.length === 0) {
        toast.error("Nothing to export for these filters.");
        return;
      }
      const headers = [
        "Reg #", "First Name", "Surname", "Sex", "Level", "Intake", "State",
        "Programme", "Department", "Module Code", "Module", "Credits",
        "Term", "CAT", "Exam", "Total", "%", "Grade", "Decision",
        "Outcome", "Mark status", "Recorded",
      ];
      const aoa: any[][] = [headers];
      rows.forEach((r) => aoa.push([
        r.regnumber, r.fname ?? "", r.lname ?? "", r.sex ?? "",
        (r as any).current_level_name ?? levelNameOf(r.current_level, ""),
        r.intake ?? "", r.student_state ?? "",
        r.declared_program ?? "", r.department ?? "",
        r.module_code, r.module_name, r.module_credits ?? "",
        r.term_label ?? "", r.cat_marks ?? "", r.exam_marks ?? "",
        r.total ?? "", r.percentage ?? "", r.grade ?? "", r.decision ?? "",
        r.outcome, r.status ?? "", r.created_at ?? "",
      ]));
      const ws = XLSX.utils.aoa_to_sheet(aoa);
      // Force the Reg # column to text so Excel keeps leading zeros.
      for (let R = 1; R <= rows.length; R++) {
        const ref = XLSX.utils.encode_cell({ c: 0, r: R });
        if (ws[ref]) { ws[ref].t = "s"; ws[ref].v = String(ws[ref].v ?? ""); }
      }
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Deliberation");
      XLSX.writeFile(wb, `deliberation_marks_${rows.length}.xlsx`);
      if (res.data?.truncated) {
        toast.error(
          `Export capped at ${res.data.cap.toLocaleString()} rows — narrow the filters to get the rest.`,
          { duration: 8000 },
        );
      } else {
        toast.success(`Exported ${rows.length.toLocaleString()} marks.`);
      }
    } catch (e: any) {
      toast.error(e?.response?.data?.message ?? "Export failed.");
    } finally {
      setExporting(false);
    }
  };

  const handleApprove = async () => {
    setApproving(true);
    try {
      const res = await deliberationService.approveMarks(filterParams);
      toast.success(`Approved and locked ${(res.data?.approved ?? 0).toLocaleString()} mark(s).`);
      setConfirmApprove(false);
      listQ.refetch();
    } catch (e: any) {
      toast.error(e?.response?.data?.message ?? "Approval failed.");
    } finally {
      setApproving(false);
    }
  };

  const selectedDept = departments.find((d) => d.dep_id === deptId);
  const scopeMarks = selectedDept
    ? n(selectedDept.marks)
    : (filters?.totals.marks ?? 0);
  const scopeModules = selectedDept
    ? n(selectedDept.modules)
    : (filters?.totals.modules ?? 0);

  return (
    <div className="space-y-4">
      {/* Intro */}
      <p className="text-[13px] text-ink-500">
        Every student that has a recorded mark — each mark mapped up the
        hierarchy{" "}
        <span className="font-medium text-ink-600 dark:text-ink-300">
          marks → module → program → department
        </span>
        . Filter by department/program, then open a student to see their full
        mapped record. Pass mark is {passMark}%.
      </p>

      {/* Summary strip */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Stat
          icon={<Building2 className="w-4 h-4" />}
          label="Departments"
          value={departments.length}
        />
        <Stat
          icon={<GraduationCap className="w-4 h-4" />}
          label={selectedDept ? "Students (dept)" : "Students with marks"}
          value={pagination.total || (filters?.totals.students ?? 0)}
        />
        <Stat
          icon={<Layers className="w-4 h-4" />}
          label="Modules in scope"
          value={scopeModules}
        />
        <Stat
          icon={<ClipboardList className="w-4 h-4" />}
          label="Marks in scope"
          value={scopeMarks.toLocaleString()}
        />
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2 items-center">
        <div className="relative">
          <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-400" />
          <input
            className="input input-sm pl-8 w-60"
            placeholder="Search reg number or name…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>

        <select
          className="input input-sm w-64"
          value={deptId || ""}
          onChange={(e) => setDeptId(Number(e.target.value))}
          title="Filter by department"
        >
          <option value="">All departments ({departments.length})</option>
          {departments.map((d) => (
            <option key={d.dep_id} value={d.dep_id}>
              {d.dep_name} · {n(d.students)} std
            </option>
          ))}
        </select>

        <select
          className="input input-sm w-56"
          value={optionId || ""}
          onChange={(e) => setOptionId(Number(e.target.value))}
          title="Filter by program"
          disabled={deptPrograms.length === 0}
        >
          <option value="">
            {deptPrograms.length ? "All programs" : "No programs"}
          </option>
          {deptPrograms.map((p) => (
            <option key={p.id} value={p.id}>
              {p.acro ? `${p.acro} — ` : ""}
              {p.name} ({n(p.modules)} mod)
            </option>
          ))}
        </select>

        <select
          className="input input-sm w-32"
          value={level}
          onChange={(e) => setLevel(e.target.value)}
        >
          <option value="">All levels</option>
          {/* Named from the catalogue; the value stays the id the API filters on. */}
          {levels.map((l) => (
            <option key={l.id} value={l.id}>
              {l.name}
            </option>
          ))}
        </select>

        {(deptId || optionId || level || qDebounced) && (
          <button
            className="btn-ghost btn-sm"
            onClick={() => {
              setDeptId(0);
              setOptionId(0);
              setLevel("");
              setQ("");
            }}
          >
            <X className="w-3.5 h-3.5" /> Clear
          </button>
        )}

        {/* Board actions — always operate on the CURRENT filter, so what you
            export and what you approve is exactly what is on screen. */}
        <div className="ml-auto flex items-center gap-2">
          <button
            className="btn-ghost btn-sm"
            onClick={handleExport}
            disabled={exporting}
            title="Download every mark in the current filter as XLSX"
          >
            {exporting
              ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
              : <Download className="w-3.5 h-3.5" />}
            {exporting ? "Preparing…" : "Export"}
          </button>
          {canApprove && (
            <button
              className="btn-primary btn-sm"
              onClick={() => setConfirmApprove(true)}
              disabled={approving}
              title="Approve and lock every mark in the current filter"
            >
              {approving
                ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                : <ShieldCheck className="w-3.5 h-3.5" />}
              Approve marks
            </button>
          )}
        </div>
      </div>

      {/* Approving locks marks against further edits, and the scope is a filter
          rather than a visible list of rows — so the count is spelled out. */}
      {confirmApprove && (
        <ModalPortal>
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
            <div className="card p-5 max-w-md w-full space-y-3">
              <h3 className="text-base font-bold text-ink-900 dark:text-white">
                Approve marks?
              </h3>
              <p className="text-[13px] text-ink-600 dark:text-ink-300">
                This confirms every mark in the current filter —{" "}
                <span className="font-semibold">
                  {(pagination.total || 0).toLocaleString()} student
                  {pagination.total === 1 ? "" : "s"}
                </span>
                {deptId || optionId || level || qDebounced
                  ? " matching the filters above"
                  : " (no filters — the whole institution)"}
                . Approved marks are locked: recording them again is refused
                until the registry re-opens the sheet.
              </p>
              <div className="flex justify-end gap-2 pt-1">
                <button className="btn-ghost btn-sm" onClick={() => setConfirmApprove(false)}>
                  Cancel
                </button>
                <button className="btn-primary btn-sm" onClick={handleApprove} disabled={approving}>
                  {approving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  Approve &amp; lock
                </button>
              </div>
            </div>
          </div>
        </ModalPortal>
      )}

      {/* Student list */}
      {listQ.isLoading ? (
        <div className="card p-12 text-center text-ink-500">
          <Loader2 className="w-5 h-5 animate-spin mx-auto mb-2" />
          Loading students with marks…
        </div>
      ) : students.length === 0 ? (
        <div className="card p-8 text-center text-ink-500">
          No students with marks match these filters.
        </div>
      ) : (
        <div className="card overflow-auto max-h-[640px]">
          <table className="w-full text-left text-[12px]">
            <thead className="sticky top-0 z-10 bg-sky-50 dark:bg-ink-800 border-b border-ink-100 dark:border-ink-700">
              <tr className="text-[10px] uppercase text-ink-500">
                <Th className="w-10">No</Th>
                <Th>Student</Th>
                <Th className="w-28">Reg number</Th>
                <Th className="w-12 text-center">Sex</Th>
                <Th className="w-14 text-center">Level</Th>
                <Th>Department(s)</Th>
                <Th className="w-16 text-center">Modules</Th>
                <Th className="w-16 text-center">Avg %</Th>
                <Th className="w-24 text-center">Passed / Failed</Th>
                <Th className="w-16 text-center">View</Th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ink-100 dark:divide-ink-700">
              {students.map((s, i) => {
                const ordinal =
                  (pagination.page - 1) * pagination.per_page + i + 1;
                const avg = s.avg_pct === null ? null : Number(s.avg_pct);
                return (
                  <tr
                    key={s.regnumber}
                    className="hover:bg-ink-50/70 dark:hover:bg-ink-700/30 cursor-pointer"
                    onClick={() => setOpenReg(s.regnumber)}
                  >
                    <td className="px-2 py-1.5 text-ink-400">{ordinal}</td>
                    <td className="px-2 py-1.5 font-medium text-ink-900 dark:text-white">
                      {nameOf(s)}
                      {s.declared_program && (
                        <span className="block text-[10.5px] text-ink-400 font-normal">
                          {s.declared_program_acro ?? s.declared_program}
                        </span>
                      )}
                    </td>
                    <td className="px-2 py-1.5 font-mono whitespace-nowrap">
                      {s.regnumber}
                    </td>
                    <td className="px-2 py-1.5 text-center">{s.sex ?? "—"}</td>
                    <td className="px-2 py-1.5 text-center">
                      {(s as any).current_level_name ?? levelNameOf(s.current_level)}
                    </td>
                    <td className="px-2 py-1.5 text-ink-600 dark:text-ink-300">
                      <span className="line-clamp-1">
                        {s.departments ?? "—"}
                      </span>
                    </td>
                    <td className="px-2 py-1.5 text-center font-semibold">
                      {n(s.modules_count)}
                    </td>
                    <td className="px-2 py-1.5 text-center">
                      <span
                        className={
                          avg === null
                            ? ""
                            : avg >= passMark
                              ? "text-emerald-600 dark:text-emerald-400 font-semibold"
                              : "text-red-600 dark:text-red-400 font-semibold"
                        }
                      >
                        {avg === null ? "—" : `${avg}%`}
                      </span>
                    </td>
                    <td className="px-2 py-1.5 text-center whitespace-nowrap">
                      <span className="text-emerald-600 dark:text-emerald-400 font-semibold">
                        {n(s.passed)}
                      </span>
                      <span className="text-ink-300 mx-1">/</span>
                      <span className="text-red-600 dark:text-red-400 font-semibold">
                        {n(s.failed)}
                      </span>
                    </td>
                    <td className="px-2 py-1.5 text-center">
                      <button
                        className="text-brand hover:underline text-[11.5px]"
                        onClick={(e) => {
                          e.stopPropagation();
                          setOpenReg(s.regnumber);
                        }}
                      >
                        Marks →
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Pagination */}
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
              {pagination.total.toLocaleString()}
            </span>{" "}
            students
          </div>
          <div className="flex items-center gap-2">
            <select
              className="input input-sm w-24"
              value={perPage}
              onChange={(e) => setPerPage(Number(e.target.value))}
            >
              {[25, 50, 100, 200].map((x) => (
                <option key={x} value={x}>
                  {x} / page
                </option>
              ))}
            </select>
            <button
              className="btn-ghost btn-sm"
              disabled={pagination.page <= 1 || listQ.isFetching}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              <ChevronLeft className="w-3.5 h-3.5" /> Prev
            </button>
            <span className="px-1">
              Page{" "}
              <span className="font-semibold text-ink-900 dark:text-white">
                {pagination.page}
              </span>{" "}
              of {pagination.last_page}
            </span>
            <button
              className="btn-ghost btn-sm"
              disabled={
                pagination.page >= pagination.last_page || listQ.isFetching
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

      {openReg && (
        <StudentMarksModal
          regnumber={openReg}
          passMark={passMark}
          onClose={() => setOpenReg(null)}
        />
      )}
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════════
   STUDENT MARKS DETAIL — module → department → program, grouped by dept
   ══════════════════════════════════════════════════════════════════════ */
function StudentMarksModal({
  regnumber,
  passMark,
  onClose,
}: {
  regnumber: string;
  passMark: number;
  onClose: () => void;
}) {
  const { levelName } = useLevels();
  const detailQ = useQuery({
    queryKey: ["deliberation", "student-marks", regnumber],
    queryFn: () => deliberationService.studentMarks(regnumber),
  });
  const d = detailQ.data?.data;
  const student = d?.student;
  const marks = d?.marks ?? [];
  const summary = d?.summary;

  // Group marks by department so the hierarchy is visible at a glance.
  const groups = useMemo(() => {
    const map = new Map<string, StudentMarkRow[]>();
    for (const m of marks) {
      const key = m.dep_name ?? "Unmapped department";
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(m);
    }
    return Array.from(map.entries());
  }, [marks]);

  return (
    <ModalPortal>
      <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-ink-900/50 backdrop-blur-sm">
        <div className="bg-white dark:bg-ink-800 rounded-xl shadow-xl w-full max-w-4xl max-h-[92vh] overflow-hidden flex flex-col">
          {/* Header */}
          <div className="flex items-start justify-between px-6 py-4 border-b border-ink-100 dark:border-ink-700">
            <div className="min-w-0">
              <h3 className="text-[15px] font-semibold text-ink-900 dark:text-white">
                {student
                  ? nameOf(student) === "—"
                    ? regnumber
                    : nameOf(student)
                  : regnumber}
              </h3>
              <p className="text-[12px] text-ink-500 flex flex-wrap gap-x-3">
                <span className="font-mono">{regnumber}</span>
                {student?.current_level && (
                  <span>
                    {(student as any).current_level_name ??
                      levelName(student.current_level)}
                  </span>
                )}
                {student?.declared_program && (
                  <span>{student.declared_program}</span>
                )}
                {student?.intake && <span>{student.intake}</span>}
              </p>
            </div>
            <button onClick={onClose} className="icon-btn">
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Summary chips */}
          {summary && (
            <div className="flex flex-wrap gap-2 px-6 py-3 border-b border-ink-100 dark:border-ink-700 bg-ink-50/40 dark:bg-ink-700/20 text-[12px]">
              <Chip icon={<BookOpen className="w-3.5 h-3.5" />}>
                {summary.modules} modules
              </Chip>
              <Chip
                icon={<CheckCircle2 className="w-3.5 h-3.5" />}
                tone="green"
              >
                {summary.passed} passed
              </Chip>
              <Chip icon={<XCircle className="w-3.5 h-3.5" />} tone="red">
                {summary.failed} failed
              </Chip>
              <Chip>
                Avg{" "}
                <span className="font-semibold">
                  {summary.avg_pct === null ? "—" : `${summary.avg_pct}%`}
                </span>
              </Chip>
            </div>
          )}

          {/* Body */}
          <div className="flex-1 overflow-y-auto p-6 space-y-5">
            {detailQ.isLoading ? (
              <div className="text-center py-10 text-ink-500">
                <Loader2 className="w-5 h-5 animate-spin mx-auto" />
              </div>
            ) : marks.length === 0 ? (
              <div className="text-center py-10 text-ink-500">
                No marks recorded for this student.
              </div>
            ) : (
              groups.map(([dep, rows]) => (
                <div key={dep}>
                  <div className="flex items-center gap-2 mb-2">
                    <Building2 className="w-3.5 h-3.5 text-brand" />
                    <h4 className="text-[12px] font-semibold text-ink-700 dark:text-ink-200 uppercase tracking-wide">
                      {dep}
                    </h4>
                    <span className="text-[11px] text-ink-400">
                      ({rows.length})
                    </span>
                  </div>
                  <div className="overflow-x-auto rounded-lg border border-ink-100 dark:border-ink-700">
                    <table className="w-full text-left text-[12px]">
                      <thead className="bg-ink-50 dark:bg-ink-700/40 text-[10px] uppercase text-ink-500">
                        <tr>
                          <Th>Module</Th>
                          <Th>Program</Th>
                          <Th className="w-14 text-center">CR</Th>
                          <Th className="w-16 text-center">CA</Th>
                          <Th className="w-16 text-center">Exam</Th>
                          <Th className="w-16 text-center">Total</Th>
                          <Th className="w-16 text-center">%</Th>
                          <Th className="w-20 text-center">Verdict</Th>
                          <Th>Term</Th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-ink-100 dark:divide-ink-700">
                        {rows.map((m) => {
                          const p =
                            m.percentage === null || m.percentage === ""
                              ? null
                              : Number(m.percentage);
                          const pass = p !== null && p >= passMark;
                          return (
                            <tr key={m.id}>
                              <td className="px-2 py-1.5">
                                <div className="font-mono font-semibold text-ink-800 dark:text-ink-100">
                                  {m.module_code}
                                </div>
                                <div className="text-[11px] text-ink-500 line-clamp-1 max-w-[230px]">
                                  {m.module_name}
                                </div>
                              </td>
                              <td className="px-2 py-1.5 text-ink-500 text-[11px]">
                                {m.programs ?? (
                                  <span className="text-ink-300">—</span>
                                )}
                              </td>
                              <td className="px-2 py-1.5 text-center">
                                {n(m.module_credits) || "—"}
                              </td>
                              <td className="px-2 py-1.5 text-center">
                                {m.cat_marks ?? "—"}
                              </td>
                              <td className="px-2 py-1.5 text-center">
                                {m.exam_marks ?? "—"}
                              </td>
                              <td className="px-2 py-1.5 text-center font-medium">
                                {m.total ?? "—"}
                              </td>
                              <td className="px-2 py-1.5 text-center font-semibold">
                                {pct(m.percentage)}
                              </td>
                              <td className="px-2 py-1.5 text-center">
                                {p === null ? (
                                  <span className="text-ink-300">—</span>
                                ) : (
                                  <span
                                    className={`px-1.5 py-0.5 rounded-full text-[10px] font-bold ${
                                      pass
                                        ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300"
                                        : "bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-300"
                                    }`}
                                  >
                                    {m.decision ?? (pass ? "PASS" : "FAIL")}
                                  </span>
                                )}
                              </td>
                              <td className="px-2 py-1.5 text-[11px] text-ink-500">
                                {m.term_label ?? "—"}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </ModalPortal>
  );
}

/* ─── small UI bits ──────────────────────────────────────────────── */
function Th({
  children,
  className = "",
}: {
  children?: React.ReactNode;
  className?: string;
}) {
  return (
    <th className={`px-2 py-2 font-semibold whitespace-nowrap ${className}`}>
      {children}
    </th>
  );
}

function Chip({
  children,
  icon,
  tone = "ink",
}: {
  children: React.ReactNode;
  icon?: React.ReactNode;
  tone?: "ink" | "green" | "red";
}) {
  const tones: Record<string, string> = {
    ink: "bg-ink-100 dark:bg-ink-600 text-ink-600 dark:text-ink-200",
    green:
      "bg-emerald-100 dark:bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
    red: "bg-red-100 dark:bg-red-500/15 text-red-700 dark:text-red-300",
  };
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-md ${tones[tone]}`}
    >
      {icon}
      {children}
    </span>
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
      <div className="w-8 h-8 rounded-lg bg-primary-50 dark:bg-primary-500/10 text-primary-600 flex items-center justify-center shrink-0">
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
