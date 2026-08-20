import { useMemo, useState } from "react";
import { useQuery, keepPreviousData } from "@tanstack/react-query";
import { CalendarClock, AlertTriangle, Printer, RefreshCcw } from "lucide-react";
import {
  timetableService,
  type TimetableEntry,
} from "@/services/timetableService";
import { cn } from "@/utils/helpers";

/**
 * Institutional timetable — the read surface for VIEW_TIMETABLE.
 *
 * Renders `module_schedules` as a day × time grid. Sessions that double-book
 * a room or a lecturer are flagged in place, so the clash is visible where the
 * reader is already looking rather than in a separate report.
 */

const SESSION_STYLES: Record<TimetableEntry["session_type"], string> = {
  lecture:  "bg-brand/10 border-brand/30 text-brand",
  lab:      "bg-violet-50 border-violet-200 text-violet-700 dark:bg-violet-900/20 dark:border-violet-800 dark:text-violet-300",
  tutorial: "bg-sky-50 border-sky-200 text-sky-700 dark:bg-sky-900/20 dark:border-sky-800 dark:text-sky-300",
  seminar:  "bg-emerald-50 border-emerald-200 text-emerald-700 dark:bg-emerald-900/20 dark:border-emerald-800 dark:text-emerald-300",
  exam:     "bg-amber-50 border-amber-200 text-amber-800 dark:bg-amber-900/20 dark:border-amber-800 dark:text-amber-300",
};

/** Trim "08:00:00" down to "08:00". */
const hhmm = (t: string) => (t ?? "").slice(0, 5);

export default function TimetablePage() {
  const [filters, setFilters] = useState<{
    term_id?: number; option_id?: number; level_id?: number; room_id?: number; staff_id?: number;
  }>({});

  const timetableQ = useQuery({
    queryKey: ["timetable", filters],
    queryFn: ({ signal }) => timetableService.get(filters, signal),
    placeholderData: keepPreviousData,
  });

  const payload = timetableQ.data?.data;
  const entries = payload?.entries ?? [];
  const clashes = payload?.clashes ?? {};
  const opts = payload?.filters;

  // Days present in the data, in calendar order — an institution that never
  // schedules Saturdays should not get an empty Saturday column.
  const days = useMemo(() => {
    const present = [...new Set(entries.map((e) => e.day_of_week))].sort((a, b) => a - b);
    return present.map((d) => ({
      value: d,
      label: entries.find((e) => e.day_of_week === d)?.day_name ?? String(d),
    }));
  }, [entries]);

  const byDay = useMemo(() => {
    const map = new Map<number, TimetableEntry[]>();
    entries.forEach((e) => {
      const list = map.get(e.day_of_week) ?? [];
      list.push(e);
      map.set(e.day_of_week, list);
    });
    map.forEach((list) => list.sort((a, b) => a.start_time.localeCompare(b.start_time)));
    return map;
  }, [entries]);

  const clashCount = Object.keys(clashes).length;

  const setFilter = (key: string, value: string) =>
    setFilters((f) => {
      const next = { ...f };
      if (value === "") delete (next as Record<string, unknown>)[key];
      else (next as Record<string, unknown>)[key] = Number(value);
      return next;
    });

  const pickers: { key: string; label: string; items: { id: number; label: string }[] }[] = [
    {
      key: "term_id",
      label: "Term",
      items: (opts?.terms ?? []).map((t) => ({
        id: t.id,
        label: `${t.year_label ? `${t.year_label} · ` : ""}${t.label}${t.is_current ? " (current)" : ""}`,
      })),
    },
    { key: "option_id", label: "Programme", items: (opts?.options ?? []).map((o) => ({ id: o.id, label: o.name })) },
    { key: "level_id",  label: "Level",     items: (opts?.levels  ?? []).map((l) => ({ id: l.id, label: l.name })) },
    { key: "room_id",   label: "Room",      items: (opts?.rooms   ?? []).map((r) => ({ id: r.id, label: r.name })) },
    { key: "staff_id",  label: "Lecturer",  items: (opts?.staff   ?? []).map((s) => ({ id: s.id, label: s.full_name })) },
  ];

  return (
    <div className="max-w-[1400px] mx-auto space-y-5">
      <header className="flex flex-wrap items-center gap-3 justify-between">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-2xl bg-brand/10 flex items-center justify-center shrink-0">
            <CalendarClock className="w-5 h-5 text-brand" />
          </div>
          <div>
            <h1 className="text-xl font-black text-ink-900 dark:text-ink-50">Timetable</h1>
            <p className="text-[12.5px] text-ink-500">
              Every scheduled session for the selected term.
            </p>
          </div>
        </div>
        <button type="button" onClick={() => window.print()} className="btn-secondary print:hidden">
          <Printer className="w-3.5 h-3.5" /> Print
        </button>
      </header>

      <div className="card p-3 flex flex-wrap gap-2 print:hidden">
        {pickers.map((p) => (
          <div key={p.key} className="flex flex-col gap-1">
            <label htmlFor={`tt-${p.key}`} className="text-[10.5px] font-bold uppercase tracking-wider text-ink-400">
              {p.label}
            </label>
            <select
              id={`tt-${p.key}`}
              className="input w-44"
              value={String((filters as Record<string, number | undefined>)[p.key] ?? "")}
              onChange={(e) => setFilter(p.key, e.target.value)}
            >
              <option value="">{p.key === "term_id" ? "Current term" : `All ${p.label.toLowerCase()}s`}</option>
              {p.items.map((i) => (
                <option key={i.id} value={i.id}>{i.label}</option>
              ))}
            </select>
          </div>
        ))}
      </div>

      {clashCount > 0 && (
        <div className="flex items-start gap-2 rounded-xl border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20 px-4 py-3">
          <AlertTriangle className="w-4 h-4 text-amber-600 mt-0.5 shrink-0" />
          <p className="text-[12.5px] text-amber-800 dark:text-amber-300">
            {clashCount} session{clashCount > 1 ? "s" : ""} double-book a room or a lecturer.
            The affected sessions are outlined below.
          </p>
        </div>
      )}

      {timetableQ.isLoading ? (
        <div className="card p-12 text-center text-ink-500">
          <RefreshCcw className="w-5 h-5 animate-spin mx-auto mb-2 text-brand" />
          Loading the timetable…
        </div>
      ) : entries.length === 0 ? (
        <div className="card p-12 text-center text-ink-500">
          Nothing is scheduled for this selection. Sessions are created under
          Academics → Scheduling.
        </div>
      ) : (
        <div className="overflow-x-auto">
          <div
            className="grid gap-3 min-w-[900px]"
            style={{ gridTemplateColumns: `repeat(${days.length}, minmax(11rem, 1fr))` }}
          >
            {days.map((d) => (
              <section key={d.value} className="flex flex-col gap-2">
                <h2 className="text-[11px] font-bold uppercase tracking-wider text-ink-400 sticky top-0 bg-page py-1">
                  {d.label}
                </h2>
                {(byDay.get(d.value) ?? []).map((e) => {
                  const entryClashes = clashes[String(e.id)] ?? [];
                  return (
                    <article
                      key={e.id}
                      className={cn(
                        "rounded-xl border px-3 py-2 text-[12px] leading-snug",
                        SESSION_STYLES[e.session_type] ?? SESSION_STYLES.lecture,
                        entryClashes.length > 0 && "ring-2 ring-amber-400 dark:ring-amber-500",
                      )}
                    >
                      <div className="font-bold tabular-nums">
                        {hhmm(e.start_time)}–{hhmm(e.end_time)}
                      </div>
                      <div className="font-semibold text-ink-900 dark:text-ink-50 mt-0.5">
                        {e.module_code}
                      </div>
                      <div className="text-ink-600 dark:text-ink-300 truncate" title={e.module_name}>
                        {e.module_name}
                      </div>
                      <div className="text-ink-500 mt-1">
                        {e.room_name}
                        {e.staff_name ? ` · ${e.staff_name}` : ""}
                      </div>
                      <div className="text-[10px] uppercase font-bold tracking-wider mt-1 opacity-70">
                        {e.session_type}
                      </div>
                      {entryClashes.length > 0 && (
                        <ul className="mt-1.5 space-y-0.5 text-[10.5px] text-amber-800 dark:text-amber-300">
                          {entryClashes.map((c, i) => (
                            <li key={i} className="flex gap-1">
                              <AlertTriangle className="w-3 h-3 shrink-0 mt-0.5" />
                              <span>{c}</span>
                            </li>
                          ))}
                        </ul>
                      )}
                    </article>
                  );
                })}
              </section>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
