import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { CornerDownLeft, Search, X } from "lucide-react";
import { searchHelp, helpPath, KIND_META } from "@/data/help";

const SUGGESTIONS = [
  "record marks",
  "approve leave",
  "generate invoices",
  "register modules",
  "verify documents",
  "merit list",
  "request a transcript",
  "reset my password",
];

/**
 * The Help Centre's own search. Instant and local — the whole corpus ships
 * with the bundle, so there is no reason to make the reader wait for a network
 * round-trip to find out how to take a register.
 */
export default function HelpSearchBar({
  autoFocus = false,
  initialQuery = "",
  size = "lg",
}: {
  autoFocus?: boolean;
  initialQuery?: string;
  size?: "lg" | "md";
}) {
  const navigate = useNavigate();
  const [query, setQuery] = useState(initialQuery);
  // `open` governs the results/suggestions panel. Autofocus focuses the box but
  // must NOT pop the panel open over the hero before the user has done
  // anything — so focus alone does not open it; a click or a keystroke does.
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const wrapRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const results = useMemo(() => searchHelp(query, 8), [query]);

  useEffect(() => setActive(0), [query]);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  const go = (moduleId: string, articleId: string) => {
    setOpen(false);
    navigate(helpPath(moduleId, articleId));
  };

  const seeAll = () => {
    setOpen(false);
    navigate(`/help/search?q=${encodeURIComponent(query.trim())}`);
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((i) => Math.min(i + 1, results.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const hit = results[active];
      if (hit) go(hit.moduleId, hit.articleId);
      else if (query.trim().length >= 2) seeAll();
    } else if (e.key === "Escape") {
      setOpen(false);
      inputRef.current?.blur();
    }
  };

  const tall = size === "lg";

  return (
    <div ref={wrapRef} className="relative w-full">
      <Search
        className={`absolute left-4 top-1/2 -translate-y-1/2 text-ink-400 pointer-events-none ${
          tall ? "w-[18px] h-[18px]" : "w-4 h-4"
        }`}
      />
      <input
        ref={inputRef}
        autoFocus={autoFocus}
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
        }}
        onClick={() => setOpen(true)}
        onKeyDown={onKeyDown}
        placeholder="Search the guides — try “record marks” or “approve leave”"
        aria-label="Search help"
        className={`w-full rounded-2xl border border-ink-100 dark:border-ink-700 bg-white dark:bg-ink-800 pl-12 pr-10 placeholder-ink-400 focus:outline-none focus:border-primary-300 focus:ring-4 focus:ring-primary-100 dark:focus:ring-primary-900/30 transition ${
          tall ? "h-[52px] text-[14.5px]" : "h-11 text-[13.5px]"
        }`}
      />
      {query && (
        <button
          type="button"
          onClick={() => {
            setQuery("");
            inputRef.current?.focus();
          }}
          aria-label="Clear search"
          className="absolute right-3.5 top-1/2 -translate-y-1/2 text-ink-400 hover:text-ink-600 dark:hover:text-ink-200"
        >
          <X className="w-4 h-4" />
        </button>
      )}

      {/* Suggestions when the box is empty */}
      {open && query.trim().length === 0 && (
        <div className="absolute z-40 top-[calc(100%+8px)] left-0 w-full rounded-2xl border border-ink-100 dark:border-ink-700 bg-white dark:bg-ink-800 shadow-xl p-4">
          <p className="text-[10.5px] font-semibold uppercase tracking-wider text-ink-400 mb-2.5">
            Popular searches
          </p>
          <div className="flex flex-wrap gap-2">
            {SUGGESTIONS.map((s) => (
              <button
                key={s}
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault();
                  setQuery(s);
                }}
                className="px-2.5 py-1 rounded-full text-[12px] bg-ink-50 dark:bg-ink-700 text-ink-600 dark:text-ink-300 hover:bg-primary-50 hover:text-primary-700 dark:hover:bg-primary-500/15 dark:hover:text-primary-200 transition-colors"
              >
                {s}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Results */}
      {open && query.trim().length > 0 && (
        <div className="absolute z-40 top-[calc(100%+8px)] left-0 w-full rounded-2xl border border-ink-100 dark:border-ink-700 bg-white dark:bg-ink-800 shadow-xl overflow-hidden">
          {results.length === 0 ? (
            <div className="px-5 py-8 text-center">
              <p className="text-[13px] text-ink-500 dark:text-ink-400">
                Nothing matches{" "}
                <span className="font-medium text-ink-700 dark:text-ink-200">“{query}”</span>
              </p>
              <p className="mt-1 text-[12px] text-ink-400">
                Try a word you can see on the screen you are stuck on.
              </p>
            </div>
          ) : (
            <>
              <ul className="max-h-[380px] overflow-y-auto py-1.5">
                {results.map((hit, i) => (
                  <li key={`${hit.moduleId}-${hit.articleId}`}>
                    <button
                      type="button"
                      onMouseEnter={() => setActive(i)}
                      onMouseDown={(e) => {
                        e.preventDefault();
                        go(hit.moduleId, hit.articleId);
                      }}
                      className={`w-full text-left px-4 py-2.5 transition-colors ${
                        active === i
                          ? "bg-primary-50 dark:bg-primary-500/10"
                          : "hover:bg-ink-50 dark:hover:bg-ink-700/50"
                      }`}
                    >
                      <span className="flex items-center gap-2">
                        <span className="text-[13px] font-medium text-ink-900 dark:text-white truncate">
                          {hit.title}
                        </span>
                        <span className="text-[10.5px] text-ink-400 shrink-0">
                          {KIND_META[hit.kind].label} · {hit.moduleTitle}
                        </span>
                      </span>
                      <span className="mt-0.5 block text-[12px] text-ink-500 dark:text-ink-400 truncate">
                        {hit.matchedStep ?? hit.summary}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
              <button
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault();
                  seeAll();
                }}
                className="w-full flex items-center justify-between px-4 py-2.5 border-t border-ink-100 dark:border-ink-700 text-[12px] text-ink-500 dark:text-ink-400 hover:bg-ink-50 dark:hover:bg-ink-700/50 transition-colors"
              >
                <span>See all results for “{query}”</span>
                <span className="inline-flex items-center gap-1">
                  <CornerDownLeft className="w-3 h-3" /> Enter
                </span>
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
