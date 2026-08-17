import { useEffect, useMemo, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { BookMarked, Search, X } from "lucide-react";
import { GLOSSARY, GLOSSARY_BY_ID } from "@/data/help/glossary";
import HelpBreadcrumbs from "@/components/help/HelpBreadcrumbs";

export default function HelpGlossaryPage() {
  const [query, setQuery] = useState("");
  const { hash } = useLocation();

  // Deep links from [[term]] chips land on #term-id.
  useEffect(() => {
    if (!hash) return;
    const el = document.getElementById(hash.slice(1));
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
      el.classList.add("ring-2", "ring-primary-300");
      const t = setTimeout(() => el.classList.remove("ring-2", "ring-primary-300"), 2200);
      return () => clearTimeout(t);
    }
  }, [hash]);

  const sorted = useMemo(
    () => [...GLOSSARY].sort((a, b) => a.term.localeCompare(b.term)),
    [],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return sorted;
    return sorted.filter(
      (t) =>
        t.term.toLowerCase().includes(q) ||
        (t.aliases ?? []).some((a) => a.includes(q)) ||
        t.definition.toLowerCase().includes(q),
    );
  }, [query, sorted]);

  const grouped = useMemo(() => {
    const map = new Map<string, typeof filtered>();
    for (const t of filtered) {
      const letter = t.term[0].toUpperCase();
      map.set(letter, [...(map.get(letter) ?? []), t]);
    }
    return [...map.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [filtered]);

  return (
    <div className="max-w-4xl mx-auto pb-16">
      <div className="pt-6">
        <HelpBreadcrumbs trail={[{ label: "Glossary" }]} />
      </div>

      <header className="mt-4">
        <h1 className="flex items-center gap-2.5 text-2xl font-semibold text-ink-900 dark:text-white">
          <BookMarked className="w-6 h-6 text-primary-500" />
          Glossary
        </h1>
        <p className="mt-2 text-[14px] leading-relaxed text-ink-600 dark:text-ink-300 max-w-2xl">
          {GLOSSARY.length} words CUR-MIS uses on screen, each explained without
          relying on another word you would also have to look up.
        </p>
      </header>

      {/* Search */}
      <div className="mt-5 relative">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-400 pointer-events-none" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Filter terms…"
          aria-label="Filter glossary"
          className="w-full h-11 rounded-2xl border border-ink-100 dark:border-ink-700 bg-white dark:bg-ink-800 pl-11 pr-10 text-[13.5px] placeholder-ink-400 focus:outline-none focus:border-primary-300 focus:ring-4 focus:ring-primary-100 dark:focus:ring-primary-900/30 transition"
        />
        {query && (
          <button
            type="button"
            onClick={() => setQuery("")}
            aria-label="Clear filter"
            className="absolute right-3.5 top-1/2 -translate-y-1/2 text-ink-400 hover:text-ink-600 dark:hover:text-ink-200"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Alphabet jump bar */}
      {!query && (
        <div className="mt-4 flex flex-wrap gap-1">
          {grouped.map(([letter]) => (
            <a
              key={letter}
              href={`#letter-${letter}`}
              className="w-7 h-7 grid place-items-center rounded-lg text-[12px] font-medium bg-ink-50 dark:bg-ink-700 text-ink-500 dark:text-ink-300 hover:bg-primary-50 hover:text-primary-700 dark:hover:bg-primary-500/15 transition-colors"
            >
              {letter}
            </a>
          ))}
        </div>
      )}

      {filtered.length === 0 && (
        <p className="mt-8 text-center text-[13px] text-ink-400">
          No term matches “{query}”.
        </p>
      )}

      {/* Terms */}
      <div className="mt-6 space-y-8">
        {grouped.map(([letter, terms]) => (
          <section key={letter}>
            <h2
              id={`letter-${letter}`}
              className="scroll-mt-20 text-[11px] font-semibold uppercase tracking-widest text-ink-400 mb-3"
            >
              {letter}
            </h2>
            <div className="space-y-3">
              {terms.map((t) => (
                <article
                  key={t.id}
                  id={t.id}
                  className="scroll-mt-24 rounded-2xl border border-ink-100 dark:border-ink-700 bg-white dark:bg-ink-800 p-5 transition-shadow"
                >
                  <h3 className="text-[14.5px] font-semibold text-ink-900 dark:text-white">
                    {t.term}
                  </h3>
                  {t.aliases && t.aliases.length > 0 && (
                    <p className="mt-0.5 text-[11.5px] text-ink-400">
                      Also called: {t.aliases.join(", ")}
                    </p>
                  )}
                  <p className="mt-2 text-[13.5px] leading-relaxed text-ink-600 dark:text-ink-300">
                    {t.definition}
                  </p>
                  {t.seenIn && (
                    <p className="mt-2.5 text-[12px] text-ink-400">
                      <span className="font-medium">Seen in:</span> {t.seenIn}
                    </p>
                  )}
                  {t.related && t.related.length > 0 && (
                    <div className="mt-3 flex flex-wrap items-center gap-1.5">
                      <span className="text-[11.5px] text-ink-400 mr-0.5">Related:</span>
                      {t.related
                        .map((id) => GLOSSARY_BY_ID[id])
                        .filter(Boolean)
                        .map((r) => (
                          <Link
                            key={r.id}
                            to={`/help/glossary#${r.id}`}
                            className="px-2 py-0.5 rounded-full text-[11.5px] bg-ink-50 dark:bg-ink-700 text-ink-600 dark:text-ink-300 hover:bg-primary-50 hover:text-primary-700 dark:hover:bg-primary-500/15 transition-colors"
                          >
                            {r.term}
                          </Link>
                        ))}
                    </div>
                  )}
                </article>
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
