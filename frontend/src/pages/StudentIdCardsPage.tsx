import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient, keepPreviousData } from "@tanstack/react-query";
import toast from "react-hot-toast";
import {
  CreditCard,
  Search,
  Printer,
  BadgeCheck,
  Ban,
  RefreshCcw,
} from "lucide-react";
import {
  studentIdService,
  type StudentIdRosterRow,
} from "@/services/studentIdService";
import CardSizeDialog from "@/components/students/CardSizeDialog";
import { PERMISSIONS } from "@/constants/permissions";
import { usePermission } from "@/utils/permissions";
import { cn } from "@/utils/helpers";

/**
 * Student ID card workspace.
 *
 * MANAGE_STUDENT_IDS is described as "issue, re-issue, revoke and print
 * student identity cards" — a batch workflow. Until this page the only entry
 * point was the card panel embedded in a single student's detail page, so the
 * permission required VIEW_STUDENTS to be useful and could only ever be
 * exercised one student at a time.
 */

const STATES = [
  { value: "", label: "All students" },
  { value: "none", label: "Never issued" },
  { value: "active", label: "Card active" },
  { value: "expired", label: "Card expired" },
  { value: "revoked", label: "Card revoked" },
] as const;

const STATE_STYLES: Record<StudentIdRosterRow["card_state"], string> = {
  none: "bg-ink-100 text-ink-600 dark:bg-ink-800 dark:text-ink-300",
  active: "bg-emerald-50 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-400",
  expired: "bg-amber-50 text-amber-700 dark:bg-amber-900/20 dark:text-amber-400",
  revoked: "bg-red-50 text-red-700 dark:bg-red-900/20 dark:text-red-400",
};

const STATE_LABELS: Record<StudentIdRosterRow["card_state"], string> = {
  none: "Never issued",
  active: "Active",
  expired: "Expired",
  revoked: "Revoked",
};

const fmtDate = (v: string | null) =>
  v ? new Date(v).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }) : "—";

export default function StudentIdCardsPage() {
  const canManage = usePermission(PERMISSIONS.MANAGE_STUDENT_IDS);
  const queryClient = useQueryClient();

  const [page, setPage] = useState(1);
  const [keyword, setKeyword] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [state, setState] = useState("");
  const [validityYears, setValidityYears] = useState(4);
  const [selected, setSelected] = useState<number[]>([]);

  const rosterQ = useQuery({
    queryKey: ["student-ids", "roster", page, keyword, state],
    queryFn: ({ signal }) =>
      studentIdService.roster({ page, per_page: 25, keyword, state }, signal),
    placeholderData: keepPreviousData,
  });

  const rows = rosterQ.data?.data?.data ?? [];
  const pagination = rosterQ.data?.data?.pagination;

  const selectableIds = useMemo(() => rows.map((r) => r.student_id), [rows]);
  const allSelected = selectableIds.length > 0 && selectableIds.every((id) => selected.includes(id));

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ["student-ids", "roster"] });
    setSelected([]);
  };

  const issueM = useMutation({
    mutationFn: () => studentIdService.batchIssue(selected, validityYears),
    onSuccess: (res) => {
      const issued = res.data?.issued?.length ?? 0;
      const failed = res.data?.failed?.length ?? 0;
      if (failed > 0) {
        toast(`${issued} card(s) issued, ${failed} skipped.`, { icon: "⚠️" });
      } else {
        toast.success(`${issued} card(s) issued.`);
      }
      refresh();
    },
    onError: (e: any) => toast.error(e?.response?.data?.message ?? "Could not issue the cards."),
  });

  const revokeM = useMutation({
    mutationFn: (cardId: number) => studentIdService.revoke(cardId),
    onSuccess: () => { toast.success("Card revoked."); refresh(); },
    onError: (e: any) => toast.error(e?.response?.data?.message ?? "Could not revoke the card."),
  });

  // Per-row print / download. `pendingCard` tracks which row is busy so only
  // that row's buttons show a spinner, not every row's.
  const [pendingCard, setPendingCard] = useState<number | null>(null);

  /* ── Size is chosen before the PDF is built ────────────────────────────
   * The renderer scales the whole layout to the chosen size, so it has to be
   * known up front — there is no resizing a PDF afterwards. Every print and
   * download route goes through this dialog; `sizeFor` holds which run it is
   * about (a student id, or "selected" for the batch). */
  const [sizeFor, setSizeFor] = useState<number | "selected" | null>(null);
  const [printing, setPrinting] = useState(false);

  const runWithSize = async (size: string, action: "print" | "download") => {
    const target = sizeFor;
    if (target === null) return;
    setPrinting(true);
    if (typeof target === "number") setPendingCard(target);
    try {
      if (target === "selected") {
        action === "print"
          ? await studentIdService.batchPrint(selected, size)
          : await studentIdService.batchDownload(selected, size);
        if (action === "download") toast.success("Cards downloaded.");
      } else {
        action === "print"
          ? await studentIdService.print(target, size)
          : await studentIdService.download(target, size);
      }
      setSizeFor(null);
    } catch (e: any) {
      toast.error(e?.response?.data?.message ?? "Could not build the print file.");
    } finally {
      setPrinting(false);
      setPendingCard(null);
    }
  };

  const toggle = (id: number) =>
    setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));

  const toggleAll = () =>
    setSelected((s) =>
      allSelected ? s.filter((id) => !selectableIds.includes(id)) : [...new Set([...s, ...selectableIds])],
    );

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setKeyword(searchInput);
    setPage(1);
  };

  return (
    <div className="max-w-[1400px] mx-auto space-y-5">
      <header className="flex items-center gap-3">
        <div className="w-11 h-11 rounded-2xl bg-brand/10 flex items-center justify-center shrink-0">
          <CreditCard className="w-5 h-5 text-brand" />
        </div>
        <div>
          <h1 className="text-xl font-black text-ink-900 dark:text-ink-50">Student ID cards</h1>
          <p className="text-[12.5px] text-ink-500">
            Issue, re-issue, revoke and print identity cards in bulk.
          </p>
        </div>
      </header>

      <div className="card overflow-hidden">
        <div className="p-3 border-b border-ink-200 dark:border-ink-800 flex flex-col lg:flex-row gap-3 lg:items-center justify-between">
          <div className="flex flex-col sm:flex-row gap-2 sm:items-center">
            <form onSubmit={handleSearch} className="relative w-full sm:w-72">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-400" />
              <input
                type="text"
                placeholder="Search by name or registration number…"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                className="input pl-9 w-full"
              />
            </form>

            <label className="sr-only" htmlFor="card-state">Card state</label>
            <select
              id="card-state"
              className="input w-full sm:w-44"
              value={state}
              onChange={(e) => { setState(e.target.value); setPage(1); setSelected([]); }}
            >
              {STATES.map((s) => (
                <option key={s.value} value={s.value}>{s.label}</option>
              ))}
            </select>
          </div>

          {canManage && (
            <div className="flex flex-wrap items-center gap-2">
              <label className="sr-only" htmlFor="validity">Validity</label>
              <select
                id="validity"
                className="input w-32"
                value={validityYears}
                onChange={(e) => setValidityYears(Number(e.target.value))}
              >
                {[1, 2, 3, 4, 5, 6].map((y) => (
                  <option key={y} value={y}>{y} year{y > 1 ? "s" : ""}</option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => issueM.mutate()}
                disabled={selected.length === 0 || issueM.isPending}
                className="btn-primary disabled:opacity-50"
              >
                <BadgeCheck className="w-3.5 h-3.5" />
                {issueM.isPending ? "Issuing…" : `Issue ${selected.length || ""}`.trim()}
              </button>
              <button
                type="button"
                onClick={() => setSizeFor("selected")}
                disabled={selected.length === 0 || printing}
                className="btn-secondary disabled:opacity-50"
                title="Choose a size, then print or download the selected cards"
              >
                <Printer className="w-3.5 h-3.5" />
                {printing ? "Building…" : "Print selected"}
              </button>
            </div>
          )}
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left whitespace-nowrap">
            <thead className="bg-ink-50 dark:bg-ink-900/50 text-ink-500 uppercase text-[11px] font-semibold tracking-wider">
              <tr>
                <th className="px-4 py-3 w-10">
                  <input
                    type="checkbox"
                    aria-label="Select every student on this page"
                    checked={allSelected}
                    onChange={toggleAll}
                    disabled={selectableIds.length === 0}
                  />
                </th>
                <th className="px-4 py-3">Reg number</th>
                <th className="px-4 py-3">Student</th>
                <th className="px-4 py-3">Programme</th>
                <th className="px-4 py-3">Card</th>
                <th className="px-4 py-3">Issued</th>
                <th className="px-4 py-3">Expires</th>
                {/* Printing a card only needs VIEW_STUDENTS on the backend
                    (routes/api/student_ids.php), so this column is not gated
                    on canManage the way Revoke is. */}
                <th className="px-4 py-3 text-right">Card</th>
                {canManage && <th className="px-4 py-3 text-right">Action</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-ink-200 dark:divide-ink-800">
              {rosterQ.isLoading ? (
                <tr>
                  <td colSpan={canManage ? 9 : 8} className="px-4 py-12 text-center text-ink-500">
                    <RefreshCcw className="w-5 h-5 animate-spin mx-auto mb-2 text-brand" />
                    Loading students…
                  </td>
                </tr>
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={canManage ? 9 : 8} className="px-4 py-12 text-center text-ink-500">
                    No students match these filters.
                  </td>
                </tr>
              ) : (
                rows.map((r) => (
                  <tr key={r.student_id} className="hover:bg-ink-50/60 dark:hover:bg-ink-900/30">
                    <td className="px-4 py-2.5">
                      <input
                        type="checkbox"
                        aria-label={`Select ${r.regnumber}`}
                        checked={selected.includes(r.student_id)}
                        onChange={() => toggle(r.student_id)}
                      />
                    </td>
                    <td className="px-4 py-2.5 font-mono text-xs text-ink-500">{r.regnumber}</td>
                    <td className="px-4 py-2.5 font-semibold text-ink-900 dark:text-ink-50">
                      {`${r.fname ?? ""} ${r.lname ?? ""}`.trim() || "—"}
                    </td>
                    <td className="px-4 py-2.5 text-ink-500">{r.option_name ?? "—"}</td>
                    <td className="px-4 py-2.5">
                      <span className={cn("px-2 py-0.5 rounded-full text-[10px] font-bold uppercase", STATE_STYLES[r.card_state])}>
                        {STATE_LABELS[r.card_state]}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-ink-500 tabular-nums">{fmtDate(r.issue_date)}</td>
                    <td className="px-4 py-2.5 text-ink-500 tabular-nums">{fmtDate(r.expiry_date)}</td>
                    <td className="px-4 py-2.5 text-right">
                      {/* An expired card still prints — StudentIdModel::activeForStudent
                          keys on is_active, not the expiry date. Only a revoked
                          card (or none at all) has nothing to render. */}
                      {r.card_id && r.card_state !== "revoked" ? (
                        <div className="inline-flex items-center gap-3">
                          <button
                            type="button"
                            onClick={() => setSizeFor(r.student_id)}
                            disabled={pendingCard === r.student_id}
                            title={`Choose a size, then print or save ${r.regnumber}'s card`}
                            className="inline-flex items-center gap-1 text-xs font-bold text-ink-600 dark:text-ink-300 hover:text-brand hover:underline disabled:opacity-50"
                          >
                            <Printer className="w-3.5 h-3.5" /> Print
                          </button>
                        </div>
                      ) : (
                        <span className="text-xs text-ink-400">—</span>
                      )}
                    </td>
                    {canManage && (
                      <td className="px-4 py-2.5 text-right">
                        {r.card_id && r.card_state !== "revoked" ? (
                          <button
                            type="button"
                            onClick={() => revokeM.mutate(r.card_id as number)}
                            disabled={revokeM.isPending}
                            className="inline-flex items-center gap-1 text-xs font-bold text-red-600 hover:underline disabled:opacity-50"
                          >
                            <Ban className="w-3.5 h-3.5" /> Revoke
                          </button>
                        ) : (
                          <span className="text-xs text-ink-400">—</span>
                        )}
                      </td>
                    )}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {pagination && pagination.last_page > 1 && (
          <div className="p-3 border-t border-ink-200 dark:border-ink-800 flex items-center justify-between text-[12.5px] text-ink-500">
            <span className="tabular-nums">
              Page {pagination.current_page} of {pagination.last_page} · {pagination.total} students
            </span>
            <div className="flex gap-2">
              <button
                type="button"
                className="btn-secondary disabled:opacity-40"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
              >
                Previous
              </button>
              <button
                type="button"
                className="btn-secondary disabled:opacity-40"
                onClick={() => setPage((p) => Math.min(pagination.last_page, p + 1))}
                disabled={page >= pagination.last_page}
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>

      <CardSizeDialog
        open={sizeFor !== null}
        count={sizeFor === "selected" ? selected.length : 1}
        busy={printing}
        onCancel={() => setSizeFor(null)}
        onConfirm={runWithSize}
      />
    </div>
  );
}
