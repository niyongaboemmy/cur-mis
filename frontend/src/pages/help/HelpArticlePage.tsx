import { useEffect, useState } from "react";
import { Link, Navigate, useParams } from "react-router-dom";
import {
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  Check,
  Clock3,
  KeyRound,
  ThumbsDown,
  ThumbsUp,
} from "lucide-react";
import { KIND_META, getArticle, helpPath, siblingArticles } from "@/data/help";
import HelpBreadcrumbs from "@/components/help/HelpBreadcrumbs";
import HelpBlocks from "@/components/help/HelpBlocks";
import { KindPill, RolePill } from "@/components/help/HelpCards";
import { ACCENT, icon } from "@/components/help/helpUi";

export default function HelpArticlePage() {
  const { moduleId, articleId } = useParams();
  const found = getArticle(moduleId, articleId);
  const [rated, setRated] = useState<"up" | "down" | null>(null);

  // A different article is a different page — start at the top of it.
  useEffect(() => {
    window.scrollTo({ top: 0 });
    setRated(null);
  }, [moduleId, articleId]);

  if (!found) return <Navigate to="/help" replace />;

  const { module, article } = found;
  const { prev, next } = siblingArticles(module.id, article.id);
  const accent = ACCENT[module.accent];
  const ModuleIcon = icon(module.icon);

  return (
    <div className="max-w-3xl mx-auto pb-16">
      <div className="pt-6">
        <HelpBreadcrumbs
          trail={[
            { label: module.title, to: helpPath(module.id) },
            { label: article.title },
          ]}
        />
      </div>

      {/* ── Article header ───────────────────────────────────────── */}
      <header className="mt-4">
        <div className="flex flex-wrap items-center gap-2 mb-3">
          <KindPill kind={article.kind} />
          <span className="inline-flex items-center gap-1 text-[11.5px] text-ink-400">
            <Clock3 className="w-3 h-3" />
            {article.minutes} min
          </span>
          <span className={`inline-flex items-center gap-1.5 text-[11.5px] ${accent.text}`}>
            <ModuleIcon className="w-3.5 h-3.5" />
            {module.title}
          </span>
        </div>

        <h1 className="text-2xl font-semibold leading-tight text-ink-900 dark:text-white">
          {article.title}
        </h1>
        <p className="mt-2 text-[14.5px] leading-relaxed text-ink-600 dark:text-ink-300">
          {article.summary}
        </p>

        <p className="mt-3 text-[12px] text-ink-400">
          {KIND_META[article.kind].blurb}.
        </p>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          {article.audience.map((r) => (
            <RolePill key={r} role={r} />
          ))}
          {article.access && (
            <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10.5px] font-medium bg-amber-50 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300">
              <KeyRound className="w-3 h-3" />
              {article.access}
            </span>
          )}
        </div>

        {article.route && (
          <Link
            to={article.route}
            className="mt-4 inline-flex items-center gap-2 px-3.5 py-2 rounded-xl bg-primary-600 hover:bg-primary-700 text-white text-[13px] font-medium transition-colors"
          >
            Open the screen
            <ArrowUpRight className="w-3.5 h-3.5" />
          </Link>
        )}
      </header>

      <hr className="my-6 border-ink-100 dark:border-ink-700" />

      {/* ── Body ─────────────────────────────────────────────────── */}
      <HelpBlocks
        blocks={article.blocks}
        storageKey={`${module.id}/${article.id}`}
      />

      {/* ── Was this useful ──────────────────────────────────────── */}
      <section className="mt-10 rounded-2xl border border-ink-100 dark:border-ink-700 bg-ink-50/60 dark:bg-ink-800 px-5 py-4 flex flex-wrap items-center justify-between gap-3">
        {rated ? (
          <p className="inline-flex items-center gap-2 text-[13px] text-emerald-700 dark:text-emerald-300">
            <Check className="w-4 h-4" />
            {rated === "up"
              ? "Glad it helped."
              : "Noted — tell the system administrator what was missing and this guide can be fixed."}
          </p>
        ) : (
          <>
            <p className="text-[13px] text-ink-600 dark:text-ink-300">
              Did this answer your question?
            </p>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setRated("up")}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-ink-100 dark:border-ink-700 bg-white dark:bg-ink-800 text-[12.5px] text-ink-600 dark:text-ink-300 hover:border-emerald-300 hover:text-emerald-700 dark:hover:text-emerald-300 transition-colors"
              >
                <ThumbsUp className="w-3.5 h-3.5" /> Yes
              </button>
              <button
                type="button"
                onClick={() => setRated("down")}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-ink-100 dark:border-ink-700 bg-white dark:bg-ink-800 text-[12.5px] text-ink-600 dark:text-ink-300 hover:border-amber-300 hover:text-amber-700 dark:hover:text-amber-300 transition-colors"
              >
                <ThumbsDown className="w-3.5 h-3.5" /> Not quite
              </button>
            </div>
          </>
        )}
      </section>

      {/* ── Prev / next ──────────────────────────────────────────── */}
      <nav className="mt-6 grid gap-3 sm:grid-cols-2">
        {prev ? (
          <Link
            to={helpPath(module.id, prev.id)}
            className="group rounded-xl border border-ink-100 dark:border-ink-700 bg-white dark:bg-ink-800 p-4 hover:border-primary-300 dark:hover:border-primary-500/40 transition-colors"
          >
            <span className="inline-flex items-center gap-1.5 text-[11.5px] text-ink-400">
              <ArrowLeft className="w-3.5 h-3.5" /> Previous
            </span>
            <span className="mt-1 block text-[13.5px] font-medium text-ink-900 dark:text-white group-hover:text-primary-700 dark:group-hover:text-primary-300 transition-colors">
              {prev.title}
            </span>
          </Link>
        ) : (
          <span />
        )}
        {next && (
          <Link
            to={helpPath(module.id, next.id)}
            className="group rounded-xl border border-ink-100 dark:border-ink-700 bg-white dark:bg-ink-800 p-4 sm:text-right hover:border-primary-300 dark:hover:border-primary-500/40 transition-colors"
          >
            <span className="inline-flex items-center gap-1.5 text-[11.5px] text-ink-400 sm:justify-end sm:w-full">
              Next <ArrowRight className="w-3.5 h-3.5" />
            </span>
            <span className="mt-1 block text-[13.5px] font-medium text-ink-900 dark:text-white group-hover:text-primary-700 dark:group-hover:text-primary-300 transition-colors">
              {next.title}
            </span>
          </Link>
        )}
      </nav>

      <div className="mt-6 text-center">
        <Link
          to={helpPath(module.id)}
          className="text-[12.5px] text-ink-500 dark:text-ink-400 hover:text-primary-600 dark:hover:text-primary-300 transition-colors"
        >
          ← All {module.title} guides
        </Link>
      </div>
    </div>
  );
}
