import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowLeft, Menu, Search, SlidersHorizontal } from "lucide-react";
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

/** Shared ghost icon-button styling so every control in the bar matches. */
const iconBtn =
  "grid place-items-center h-9 w-9 rounded-xl transition-colors active:scale-95 " +
  "text-ink-500 hover:text-ink-900 hover:bg-ink-100 " +
  "dark:text-ink-300 dark:hover:bg-ink-700 dark:hover:text-white";
const iconBtnActive =
  "bg-brand/10 text-brand hover:bg-brand/10 hover:text-brand " +
  "dark:bg-brand/25 dark:text-gold-400";

/**
 * Application top bar.
 *
 * Layout
 * ──────
 *  • Left  — hamburger (mobile) + current page title (mobile).
 *  • Right — a single, evenly-spaced action rail: search · scope filters ·
 *            alerts · messages · help │ account.
 *
 * Space-saving behaviour
 * ──────────────────────
 *  • Search is a 36px icon by default and expands into an overlaid field on
 *    click (⌘K also opens it). It collapses on Escape, on pick, or on an
 *    outside click while empty.
 *  • Below `xl`, the four scope selectors (year · term · campus · category)
 *    fold into one "Filters" popover so the rail never wraps.
 *  • `scrolled` fades in a soft drop shadow once page content moves.
 */
export default function TopBar({
  title,
  onOpenSidebar,
  scrolled,
  showSearch,
  showFilters,
}: {
  title: string;
  onOpenSidebar: () => void;
  scrolled: boolean;
  showSearch: boolean;
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

  // ⌘K / Ctrl+K opens the search field (GlobalSearch itself focuses the input).
  useEffect(() => {
    if (!showSearch) return;
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setSearchOpen(true);
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [showSearch]);

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
      <div className="relative h-16 flex items-center gap-2 px-3 sm:px-4 lg:px-6">
        {/* ── Left ─────────────────────────────────────────────────── */}
        <button
          onClick={onOpenSidebar}
          className={cn(iconBtn, "lg:hidden")}
          aria-label="Open navigation"
        >
          <Menu className="h-5 w-5" />
        </button>

        <h1 className="lg:hidden min-w-0 flex-1 truncate text-[14px] font-semibold text-ink-900 dark:text-white">
          {title}
        </h1>

        <div className="hidden lg:block flex-1" />

        {/* ── Right rail ───────────────────────────────────────────── */}
        <div className="flex items-center gap-0.5 sm:gap-1">
          {showSearch && (
            <button
              onClick={() => setSearchOpen(true)}
              className={cn(iconBtn, searchOpen && iconBtnActive)}
              aria-label="Search"
            >
              <Search className="h-[18px] w-[18px]" />
            </button>
          )}

          {showFilters &&
            (isXl ? (
              <div className="flex items-center gap-1 rounded-xl border border-ink-100 dark:border-ink-700/70 bg-ink-50/60 dark:bg-ink-800/50 p-1">
                <AcademicContextSwitcher />
                <CampusFilterSwitcher />
                <CategoryFilterSwitcher />
              </div>
            ) : (
              <div ref={filtersRef} className="relative">
                <button
                  onClick={() => setFiltersOpen((v) => !v)}
                  className={cn(iconBtn, filtersOpen && iconBtnActive)}
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
                      <div className="flex flex-col gap-2 [&_button]:w-full [&_button]:justify-start">
                        <AcademicContextSwitcher variant="stacked" />
                        <CampusFilterSwitcher />
                        <CategoryFilterSwitcher />
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            ))}

          <div className="mx-1 hidden sm:block h-6 w-px bg-ink-200/70 dark:bg-ink-700" />

          <NotificationBell />
          <MessageNotificationBell />
          <div className="hidden sm:block">
            <HelpLauncher />
          </div>

          <div className="mx-1 h-6 w-px bg-ink-200/70 dark:bg-ink-700" />

          <UserDropdown />
        </div>

        {/* ── Search takeover — opaque strip over the whole bar ──────── */}
        <AnimatePresence>
          {searchOpen && showSearch && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.13, ease: "easeOut" }}
              className="absolute inset-0 z-40 flex items-center gap-2 px-3 sm:px-4 lg:px-6 bg-[rgb(var(--bg-app))] dark:bg-ink-900"
            >
              <button
                onClick={() => setSearchOpen(false)}
                className={cn(iconBtn, "shrink-0")}
                aria-label="Close search"
              >
                <ArrowLeft className="h-5 w-5" />
              </button>
              <div className="flex-1 min-w-0 max-w-[680px]">
                <GlobalSearch
                  fluid
                  autoFocus
                  solid
                  onRequestCollapse={() => setSearchOpen(false)}
                />
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </header>
  );
}
