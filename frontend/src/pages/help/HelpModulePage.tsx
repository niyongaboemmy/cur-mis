import { useMemo, useState } from "react";
import { Link, Navigate, useParams } from "react-router-dom";
import { ArrowUpRight, Clock3, Filter } from "lucide-react";
import { KIND_META, getModule, helpPath } from "@/data/help";
import type { ArticleKind } from "@/data/help/types";
import HelpBreadcrumbs from "@/components/help/HelpBreadcrumbs";
import HelpSearchBar from "@/components/help/HelpSearchBar";
import { KindPill, RolePill } from "@/components/help/HelpCards";
import { ACCENT, icon } from "@/components/help/helpUi";

export default function HelpModulePage() {
  const { moduleId } = useParams();
  const module = getModule(moduleId);
  const [kind, setKind] = useState<ArticleKind | "all">("all");

  const articles = useMemo(
    () => (module ? module.articles.filter((a) => kind === "all" || a.kind === kind) : []),
    [module, kind],
  );

  if (!module) return <Navigate to="/help" replace />;

  const Icon = icon(module.icon);
  const accent = ACCENT[module.accent];
  const kindsPresent = Array.from(new Set(module.articles.map((a) => a.kind)));

  return (
    <div className="max-w-5xl mx-auto pb-16">
      <div className="pt-6">
        <HelpBreadcrumbs trail={[{ label: module.title }]} />
      </div>

      {/* Module header */}
      <header className="mt-4 rounded-2xl border border-ink-100 dark:border-ink-700 bg-white dark:bg-ink-800 p-6">
        <div className="flex items-start gap-4">
          <span className={`w-12 h-12 rounded-2xl grid place-items-center shrink-0 ${accent.chip}`}>
            <Icon className="w-5 h-5" />
          </span>
          <div className="min-w-0">
            <h1 className="text-xl font-semibold text-ink-900 dark:text-white">
              {module.title}
            </h1>
            <p className="mt-1.5 text-[13.5px] leading-relaxed text-ink-600 dark:text-ink-300">
              {module.summary}
            </p>
            <div className="mt-3 flex flex-wrap gap-1.5">
              {module.audience.map((r) => (
                <RolePill key={r} role={r} />
              ))}
            </div>
          </div>
        </div>

        <p className="mt-5 pt-5 border-t border-ink-50 dark:border-ink-700/60 text-[13.5px] leading-[1.75] text-ink-600 dark:text-ink-300">
          {module.intro.replace(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, (_m, a, b) => b || a)}
        </p>
      </header>

      {/* Search within help */}
      <div className="mt-5">
        <HelpSearchBar size="md" />
      </div>

      {/* Filter */}
      {kindsPresent.length > 1 && (
        <div className="mt-6 flex items-center gap-2 flex-wrap">
          <span className="inline-flex items-center gap-1.5 text-[11.5px] text-ink-400 mr-1">
            <Filter className="w-3.5 h-3.5" /> Show
          </span>
          {(["all", ...kindsPresent] as (ArticleKind | "all")[]).map((k) => (
            <button
              key={k}
              type="button"
              onClick={() => setKind(k)}
              className={`px-3 py-1.5 rounded-lg text-[12px] font-medium transition-colors ${
                kind === k
                  ? "bg-primary-600 text-white"
                  : "bg-ink-50 dark:bg-ink-700 text-ink-600 dark:text-ink-300 hover:bg-ink-100 dark:hover:bg-ink-600"
              }`}
            >
              {k === "all" ? "Everything" : KIND_META[k].label}
            </button>
          ))}
        </div>
      )}

      {/* Article list — numbered, because module articles are written in order */}
      <ol className="mt-5 space-y-3">
        {articles.map((a, i) => (
          <li key={a.id}>
            <Link
              to={helpPath(module.id, a.id)}
              className="group flex gap-4 rounded-2xl border border-ink-100 dark:border-ink-700 bg-white dark:bg-ink-800 p-4 sm:p-5 hover:border-primary-300 dark:hover:border-primary-500/40 transition-colors"
            >
              <span className={`shrink-0 w-8 h-8 rounded-full grid place-items-center text-[12px] font-semibold ${accent.chip}`}>
                {i + 1}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2 mb-1.5">
                  <KindPill kind={a.kind} />
                  <span className="inline-flex items-center gap-1 text-[11px] text-ink-400">
                    <Clock3 className="w-3 h-3" />
                    {a.minutes} min
                  </span>
                  {a.access && (
                    <span className="text-[11px] text-ink-400 truncate">· {a.access}</span>
                  )}
                </div>
                <h2 className="text-[14.5px] font-semibold text-ink-900 dark:text-white group-hover:text-primary-700 dark:group-hover:text-primary-300 transition-colors">
                  {a.title}
                </h2>
                <p className="mt-1 text-[13px] leading-relaxed text-ink-500 dark:text-ink-400">
                  {a.summary}
                </p>
              </div>
              {a.route && (
                <span className="hidden sm:inline-flex shrink-0 self-start items-center gap-1 text-[11.5px] text-ink-400 group-hover:text-primary-500 transition-colors">
                  <ArrowUpRight className="w-3.5 h-3.5" />
                </span>
              )}
            </Link>
          </li>
        ))}
      </ol>
    </div>
  );
}
