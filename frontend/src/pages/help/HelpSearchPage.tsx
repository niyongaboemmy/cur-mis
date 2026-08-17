import { useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { CornerDownRight, SearchX } from "lucide-react";
import { KIND_META, helpPath, searchHelp } from "@/data/help";
import { GLOSSARY } from "@/data/help/glossary";
import type { ArticleKind } from "@/data/help/types";
import HelpBreadcrumbs from "@/components/help/HelpBreadcrumbs";
import HelpSearchBar from "@/components/help/HelpSearchBar";
import { KindPill } from "@/components/help/HelpCards";

export default function HelpSearchPage() {
  const [params] = useSearchParams();
  const query = params.get("q") ?? "";
  const [kind, setKind] = useState<ArticleKind | "all">("all");

  const hits = useMemo(() => searchHelp(query, 60), [query]);
  const filtered = useMemo(
    () => hits.filter((h) => kind === "all" || h.kind === kind),
    [hits, kind],
  );

  const termHits = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (q.length < 2) return [];
    return GLOSSARY.filter(
      (t) =>
        t.term.toLowerCase().includes(q) ||
        (t.aliases ?? []).some((a) => a.includes(q)) ||
        t.definition.toLowerCase().includes(q),
    ).slice(0, 6);
  }, [query]);

  const kindsPresent = Array.from(new Set(hits.map((h) => h.kind)));

  return (
    <div className="max-w-4xl mx-auto pb-16">
      <div className="pt-6">
        <HelpBreadcrumbs trail={[{ label: "Search" }]} />
      </div>

      <div className="mt-4">
        <HelpSearchBar initialQuery={query} autoFocus />
      </div>

      <p className="mt-4 text-[13px] text-ink-500 dark:text-ink-400">
        {hits.length === 0 ? (
          <>No guides match “{query}”.</>
        ) : (
          <>
            <span className="font-medium text-ink-800 dark:text-ink-100">
              {hits.length}
            </span>{" "}
            {hits.length === 1 ? "guide" : "guides"} match “{query}”
          </>
        )}
      </p>

      {kindsPresent.length > 1 && (
        <div className="mt-4 flex flex-wrap gap-2">
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

      {/* Glossary matches — often the actual answer to a one-word search */}
      {termHits.length > 0 && (
        <section className="mt-6">
          <h2 className="text-[11px] font-semibold uppercase tracking-wider text-ink-400 mb-2.5">
            Words that match
          </h2>
          <div className="flex flex-wrap gap-2">
            {termHits.map((t) => (
              <Link
                key={t.id}
                to={`/help/glossary#${t.id}`}
                className="px-3 py-1.5 rounded-lg text-[12.5px] bg-primary-50 dark:bg-primary-500/15 text-primary-700 dark:text-primary-200 hover:bg-primary-100 dark:hover:bg-primary-500/25 transition-colors"
              >
                {t.term}
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* Results */}
      {filtered.length > 0 ? (
        <ul className="mt-6 space-y-3">
          {filtered.map((hit) => (
            <li key={`${hit.moduleId}-${hit.articleId}`}>
              <Link
                to={helpPath(hit.moduleId, hit.articleId)}
                className="group block rounded-2xl border border-ink-100 dark:border-ink-700 bg-white dark:bg-ink-800 p-4 sm:p-5 hover:border-primary-300 dark:hover:border-primary-500/40 transition-colors"
              >
                <div className="flex flex-wrap items-center gap-2 mb-1.5">
                  <KindPill kind={hit.kind} />
                  <span className="text-[11.5px] text-ink-400">{hit.moduleTitle}</span>
                  <span className="text-[11.5px] text-ink-400">· {hit.minutes} min</span>
                </div>
                <h3 className="text-[14.5px] font-semibold text-ink-900 dark:text-white group-hover:text-primary-700 dark:group-hover:text-primary-300 transition-colors">
                  {hit.title}
                </h3>
                <p className="mt-1 text-[13px] leading-relaxed text-ink-500 dark:text-ink-400">
                  {hit.summary}
                </p>
                {hit.matchedStep && (
                  <p className="mt-2 inline-flex items-start gap-1.5 text-[12.5px] text-ink-600 dark:text-ink-300">
                    <CornerDownRight className="w-3.5 h-3.5 mt-0.5 shrink-0 text-primary-400" />
                    <span className="italic">{hit.matchedStep}</span>
                  </p>
                )}
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <div className="mt-8 rounded-2xl border border-dashed border-ink-200 dark:border-ink-700 p-10 text-center">
          <SearchX className="w-8 h-8 mx-auto text-ink-300 mb-3" />
          <p className="text-[13.5px] font-medium text-ink-700 dark:text-ink-200">
            Nothing here matches that
          </p>
          <p className="mt-1.5 text-[12.5px] text-ink-500 dark:text-ink-400 max-w-sm mx-auto leading-relaxed">
            Try a word that appears on the screen you are stuck on — the guides
            use the same wording as the buttons and menus.
          </p>
          <Link
            to="/help"
            className="mt-4 inline-block text-[12.5px] font-medium text-primary-600 dark:text-primary-300 hover:underline"
          >
            Browse all modules instead
          </Link>
        </div>
      )}
    </div>
  );
}
