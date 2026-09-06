import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Menu, Search, SlidersHorizontal, X } from "lucide-react";
import { cn } from "@/utils/helpers";
import { useMediaQuery } from "@/hooks/useMediaQuery";
import GlobalSearch from "@/components/layout/GlobalSearch";
import AcademicContextSwitcher from "@/components/layout/AcademicContextSwitcher";
import CampusFilterSwitcher from "@/components/layout/CampusFilterSwitcher";
import CategoryFilterSwitcher from "@/components/layout/CategoryFilterSwitcher";
import NotificationBell from "@/components/layout/NotificationBell";
import MessageNotificationBell from "@/components/layout/MessageNotificationBell";
import HelpLauncher from "@/components/help/HelpLauncher";
import UserDropdown from "@/components/layout/UserDropdown";

/**
 * Responsive application top bar.
 *
 * Breakpoint behaviour
 * ────────────────────
 *  • `< md`  — hamburger + current page title, a search *icon* that drops a
 *              full-width search sheet, and the essential actions (alerts,
 *              messages, help live behind the filters/▾ menu when space is
 *              tight; alerts + avatar always visible).
 *  • `md`    — inline global search appears.
 *  • `< xl`  — academic-year / term / campus / category selectors collapse
 *              into a single "Filters" popover so they never overflow.
 *  • `≥ xl`  — every selector sits inline, as designed.
 *
 * `scrolled` toggles a soft elevation shadow once the page content moves,
 * giving the sticky bar a sense of depth without a permanent hard border.
 */
export default function TopBar({
  title,
  onOpenSidebar,
  scrolled,
  showContextControls,
  showFilters,
}: {
  title: string;
  onOpenSidebar: () => void;
  scrolled: boolean;
  /** Applicants have no global search. */
  showContextControls: boolean;
  /** Only staff scope the app by year/term/campus/category. */
  showFilters: boolean;
}) {
  const isXl = useMediaQuery("(min-width: 1280px)");
  const [searchOpen, setSearchOpen] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const filtersRef = useRef<HTMLDivElement>(null);

  // Close the filters popover on outside-click / Escape.
  useEffect(() => {
    if (!filtersOpen) return;
    const onClick = (e: MouseEvent) => {
      if (filtersRef.current && !filtersRef.current.contains(e.target as Node))
        setFiltersOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setFiltersOpen(false);
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [filtersOpen]);

  // Collapse the mobile search sheet as soon as we grow into the inline search.
  const isMd = useMediaQuery("(min-width: 768px)");
  useEffect(() => {
    if (isMd) setSearchOpen(false);
  }, [isMd]);

  return (
    <header
      className={cn(
        "sticky top-0 z-30 shrink-0",
        "bg-[rgb(var(--bg-app))]/85 dark:bg-ink-900/85 backdrop-blur-xl",
        "border-b transition-[box-shadow,border-color] duration-300",
        scrolled
          ? "border-ink-200/70 dark:border-ink-700 shadow-[0_6px_24px_-12px_rgba(4,20,47,0.28)]"
          : "border-ink-100/70 dark:border-ink-800",
      )}
    >
      <div className="h-16 flex items-center gap-1.5 sm:gap-3 px-3 sm:px-5 lg:px-8">
        {/* ── Left cluster ─────────────────────────────────────────── */}
        <button
          onClick={onOpenSidebar}
          className="lg:hidden grid place-items-center h-9 w-9 rounded-xl text-ink-500 hover:text-ink-900 hover:bg-ink-100 dark:text-ink-300 dark:hover:bg-ink-700 dark:hover:text-white transition-colors active:scale-95"
          aria-label="Open navigation"
        >
          <Menu className="h-5 w-5" />
        </button>

        <h1 className="lg:hidden min-w-0 truncate text-[14px] font-semibold text-ink-900 dark:text-white">
          {title}
        </h1>

        {showContextControls && (
          <div className="hidden md:block flex-1 max-w-[440px]">
            <GlobalSearch />
          </div>
        )}

        {/* Push the action cluster to the right on small screens. */}
        <div className="flex-1 md:hidden" />

        {/* ── Right cluster ────────────────────────────────────────── */}
        <div className="flex items-center gap-0.5 sm:gap-1.5">
          {showContextControls && (
            <button
              onClick={() => setSearchOpen((v) => !v)}
              className={cn(
                "md:hidden grid place-items-center h-9 w-9 rounded-xl transition-colors active:scale-95",
                searchOpen
                  ? "bg-brand/10 text-brand dark:bg-brand/25 dark:text-gold-400"
                  : "text-ink-500 hover:text-ink-900 hover:bg-ink-100 dark:text-ink-300 dark:hover:bg-ink-700 dark:hover:text-white",
              )}
              aria-label="Search"
              aria-expanded={searchOpen}
            >
              {searchOpen ? <X className="h-[18px] w-[18px]" /> : <Search className="h-[18px] w-[18px]" />}
            </button>
          )}

          {/* Context selectors — inline on xl, popover below it. */}
          {showFilters &&
            (isXl ? (
              <div className="flex items-center gap-1.5">
                <AcademicContextSwitcher />
                <CampusFilterSwitcher />
                <CategoryFilterSwitcher />
              </div>
            ) : (
              <div ref={filtersRef} className="relative">
                <button
                  onClick={() => setFiltersOpen((v) => !v)}
                  className={cn(
                    "grid place-items-center h-9 w-9 rounded-xl transition-colors active:scale-95",
                    filtersOpen
                      ? "bg-brand/10 text-brand dark:bg-brand/25 dark:text-gold-400"
                      : "text-ink-500 hover:text-ink-900 hover:bg-ink-100 dark:text-ink-300 dark:hover:bg-ink-700 dark:hover:text-white",
                  )}
                  aria-label="Scope filters"
                  aria-expanded={filtersOpen}
                  title="Academic year, term & campus scope"
                >
                  <SlidersHorizontal className="h-[18px] w-[18px]" />
                </button>

                <AnimatePresence>
                  {filtersOpen && (
                    <motion.div
                      initial={{ opacity: 0, y: -6, scale: 0.98 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, y: -6, scale: 0.98 }}
                      transition={{ duration: 0.15, ease: "easeOut" }}
                      className="absolute right-0 mt-2 w-[min(20rem,calc(100vw-1.5rem))] rounded-2xl border border-ink-100 dark:border-ink-700 bg-white dark:bg-ink-800 shadow-xl p-3 z-50"
                    >
                      <p className="px-1 pb-2 text-[10.5px] font-semibold uppercase tracking-wider text-ink-400">
                        Scope every page to
                      </p>
                      <div className="flex flex-col gap-2">
                        <AcademicContextSwitcher variant="stacked" />
                        <CampusFilterSwitcher />
                        <CategoryFilterSwitcher />
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            ))}

          <NotificationBell />
          <MessageNotificationBell />
          <div className="hidden sm:block">
            <HelpLauncher />
          </div>
          <div className="mx-0.5 hidden sm:block h-6 w-px bg-ink-200/70 dark:bg-ink-700" />
          <UserDropdown />
        </div>
      </div>

      {/* ── Mobile search sheet ──────────────────────────────────── */}
      <AnimatePresence>
        {searchOpen && showContextControls && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.18, ease: "easeOut" }}
            className="md:hidden overflow-visible px-3 pb-3"
          >
            <GlobalSearch fluid autoFocus />
          </motion.div>
        )}
      </AnimatePresence>
    </header>
  );
}
