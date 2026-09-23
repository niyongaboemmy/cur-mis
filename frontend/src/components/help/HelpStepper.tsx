import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowUpRight, Check, RotateCcw, Sparkles } from "lucide-react";
import type { HelpStep } from "@/data/help/types";
import RichText from "./RichText";

/**
 * Steps you can tick off.
 *
 * Progress is kept per (article × stepper) in localStorage, because the common
 * case is somebody doing a long procedure across two sittings — a term rollover
 * or a payroll run — and losing their place is the whole problem.
 */
export default function HelpStepper({
  storageKey,
  title,
  steps,
}: {
  storageKey: string;
  title?: string;
  steps: HelpStep[];
}) {
  const key = `cur-mis:help-progress:${storageKey}`;
  const [done, setDone] = useState<Set<number>>(new Set());

  useEffect(() => {
    try {
      const raw = localStorage.getItem(key);
      if (raw) setDone(new Set(JSON.parse(raw) as number[]));
      else setDone(new Set());
    } catch {
      setDone(new Set());
    }
  }, [key]);

  const persist = useCallback(
    (next: Set<number>) => {
      setDone(next);
      try {
        localStorage.setItem(key, JSON.stringify([...next]));
      } catch {
        /* storage full or blocked — progress simply is not remembered */
      }
    },
    [key],
  );

  const toggle = (i: number) => {
    const next = new Set(done);
    if (next.has(i)) next.delete(i);
    else next.add(i);
    persist(next);
  };

  const pct = useMemo(
    () => (steps.length ? Math.round((done.size / steps.length) * 100) : 0),
    [done, steps.length],
  );
  const complete = done.size === steps.length && steps.length > 0;

  return (
    <section className="rounded-2xl border border-ink-100 dark:border-ink-700 bg-white dark:bg-ink-800 overflow-hidden">
      {/* Header + progress */}
      <header className="px-4 sm:px-5 pt-4 pb-3 border-b border-ink-100 dark:border-ink-700">
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-[13.5px] font-semibold text-ink-900 dark:text-white">
            {title ?? "Steps"}
          </h3>
          <div className="flex items-center gap-2 shrink-0">
            <span className="text-[11.5px] tabular-nums text-ink-400">
              {done.size}/{steps.length}
            </span>
            {done.size > 0 && (
              <button
                type="button"
                onClick={() => persist(new Set())}
                className="inline-flex items-center gap-1 text-[11.5px] text-ink-400 hover:text-ink-600 dark:hover:text-ink-200 transition-colors"
                title="Clear my progress on these steps"
              >
                <RotateCcw className="w-3 h-3" /> Reset
              </button>
            )}
          </div>
        </div>
        <div className="mt-2.5 h-1.5 rounded-full bg-ink-100 dark:bg-ink-700 overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-500 ${
              complete ? "bg-emerald-500" : "bg-primary-500"
            }`}
            style={{ width: `${pct}%` }}
          />
        </div>
      </header>

      <ol className="divide-y divide-ink-50 dark:divide-ink-700/60">
        {steps.map((step, i) => {
          const isDone = done.has(i);
          return (
            <li key={i} className="group">
              <div className="flex gap-3 px-4 sm:px-5 py-3.5">
                {/* Tick / number */}
                <button
                  type="button"
                  onClick={() => toggle(i)}
                  aria-pressed={isDone}
                  aria-label={isDone ? `Mark step ${i + 1} as not done` : `Mark step ${i + 1} as done`}
                  className={`mt-0.5 shrink-0 w-6 h-6 rounded-full grid place-items-center text-[11px] font-semibold transition-all ${
                    isDone
                      ? "bg-emerald-500 text-white"
                      : "bg-ink-100 text-ink-500 dark:bg-ink-700 dark:text-ink-300 hover:bg-primary-100 hover:text-primary-700 dark:hover:bg-primary-500/20"
                  }`}
                >
                  {isDone ? <Check className="w-3.5 h-3.5" /> : i + 1}
                </button>

                <div className="min-w-0 flex-1">
                  <p
                    className={`text-[13.5px] leading-relaxed ${
                      isDone
                        ? "text-ink-400 line-through decoration-ink-300"
                        : "text-ink-800 dark:text-ink-100"
                    }`}
                  >
                    <RichText text={step.title} />
                  </p>

                  {step.detail && !isDone && (
                    <p className="mt-1 text-[12.5px] leading-relaxed text-ink-500 dark:text-ink-400">
                      <RichText text={step.detail} />
                    </p>
                  )}

                  {step.tip && !isDone && (
                    <p className="mt-1.5 inline-flex items-start gap-1.5 text-[12px] leading-relaxed text-emerald-700 dark:text-emerald-300">
                      <Sparkles className="w-3.5 h-3.5 mt-[2px] shrink-0" />
                      <span>
                        <RichText text={step.tip} />
                      </span>
                    </p>
                  )}

                  {step.route && !isDone && (
                    <Link
                      to={step.route}
                      className="mt-2 inline-flex items-center gap-1 text-[12px] font-medium text-primary-600 dark:text-primary-300 hover:underline"
                    >
                      Open this screen <ArrowUpRight className="w-3 h-3" />
                    </Link>
                  )}
                </div>
              </div>
            </li>
          );
        })}
      </ol>

      {complete && (
        <p className="px-5 py-3 bg-emerald-50 dark:bg-emerald-500/10 text-[12.5px] font-medium text-emerald-700 dark:text-emerald-300">
          All steps done. Nice work.
        </p>
      )}
    </section>
  );
}
