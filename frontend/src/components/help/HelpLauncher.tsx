import { useEffect, useRef, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import {
  ArrowUpRight,
  BookMarked,
  Compass,
  HelpCircle,
  LifeBuoy,
  Sparkles,
} from "lucide-react";
import { helpForRoute, helpPath } from "@/data/help";

/**
 * The `?` in the top bar.
 *
 * Its first offer is always *this screen* — a user clicking help is, almost by
 * definition, stuck on the page they are looking at, and making them search for
 * its name is the commonest way help centres waste people's time.
 */
export default function HelpLauncher() {
  const [open, setOpen] = useState(false);
  const { pathname } = useLocation();
  const wrapRef = useRef<HTMLDivElement>(null);
  const contextual = helpForRoute(pathname);

  useEffect(() => setOpen(false), [pathname]);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onEsc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onEsc);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onEsc);
    };
  }, [open]);

  return (
    <div ref={wrapRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label="Help"
        aria-expanded={open}
        title="Help & guides"
        className="w-9 h-9 grid place-items-center rounded-full text-ink-500 dark:text-ink-300 hover:bg-ink-100 dark:hover:bg-ink-700 transition-colors"
      >
        <HelpCircle className="w-[18px] h-[18px]" />
      </button>

      {open && (
        <div className="absolute right-0 top-[calc(100%+8px)] z-50 w-[300px] rounded-2xl border border-ink-100 dark:border-ink-700 bg-white dark:bg-ink-800 shadow-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-ink-100 dark:border-ink-700">
            <p className="inline-flex items-center gap-2 text-[13px] font-semibold text-ink-900 dark:text-white">
              <LifeBuoy className="w-4 h-4 text-primary-500" />
              Help &amp; guides
            </p>
          </div>

          {contextual && (
            <Link
              to={helpPath(contextual.moduleId, contextual.articleId)}
              className="block px-4 py-3 bg-primary-50/60 dark:bg-primary-500/10 hover:bg-primary-50 dark:hover:bg-primary-500/15 transition-colors"
            >
              <span className="inline-flex items-center gap-1.5 text-[10.5px] font-semibold uppercase tracking-wider text-primary-600 dark:text-primary-300">
                <Sparkles className="w-3 h-3" />
                For this screen
              </span>
              <span className="mt-1 flex items-center gap-1.5 text-[13px] font-medium text-ink-900 dark:text-white">
                {contextual.title}
                <ArrowUpRight className="w-3.5 h-3.5 text-ink-400" />
              </span>
            </Link>
          )}

          <div className="py-1.5">
            <Link
              to="/help"
              className="flex items-center gap-3 px-4 py-2.5 hover:bg-ink-50 dark:hover:bg-ink-700/50 transition-colors"
            >
              <Compass className="w-4 h-4 text-ink-400" />
              <span className="text-[13px] text-ink-700 dark:text-ink-200">
                Browse all modules
              </span>
            </Link>
            <Link
              to="/help/glossary"
              className="flex items-center gap-3 px-4 py-2.5 hover:bg-ink-50 dark:hover:bg-ink-700/50 transition-colors"
            >
              <BookMarked className="w-4 h-4 text-ink-400" />
              <span className="text-[13px] text-ink-700 dark:text-ink-200">
                Glossary of terms
              </span>
            </Link>
          </div>

          <p className="px-4 py-2.5 border-t border-ink-100 dark:border-ink-700 text-[11.5px] text-ink-400">
            Tip: search anything in the top bar — help results appear alongside
            records.
          </p>
        </div>
      )}
    </div>
  );
}
