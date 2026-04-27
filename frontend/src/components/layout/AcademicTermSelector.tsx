import { useState, useRef, useEffect, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Hash, ChevronDown, Check } from "lucide-react";
import { useSystemStore } from "@/store/systemStore";
import type { AcademicTerm } from "@/types/academic";

/**
 * Global academic-term selector — lives in the topnav. Reads/writes
 * `selectedTermId` in `useSystemStore`.
 */
export default function AcademicTermSelector() {
  const [isOpen, setIsOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  const basics = useSystemStore((s) => s.basics);
  const selectedYearLabel = useSystemStore((s) => s.selectedYearLabel);
  const selectedTermId = useSystemStore((s) => s.selectedTermId);
  const setSelected = useSystemStore((s) => s.setSelectedTermId);

  // Filter terms by the globally selected year label
  const terms: AcademicTerm[] = useMemo(() => {
    let list = basics?.terms ?? [];
    if (selectedYearLabel) {
      const year = basics?.years?.find((y) => y.label === selectedYearLabel);
      if (year) {
        list = list.filter((t) => t.academic_year_id === year.id);
      }
    }
    return list;
  }, [basics?.terms, basics?.years, selectedYearLabel]);

  const activeTermId =
    basics?.active_term && typeof basics.active_term === "object"
      ? (basics.active_term as AcademicTerm).id
      : null;

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node))
        setIsOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  const selectedTerm = terms.find((t) => t.id === selectedTermId);
  const displayLabel = selectedTerm ? selectedTerm.label : "All terms";

  const disabled = !selectedYearLabel || terms.length === 0;

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => !disabled && setIsOpen((v) => !v)}
        disabled={disabled}
        title={!selectedYearLabel ? "Select a year first" : "Academic term"}
        aria-label="Select academic term"
        className="h-10 inline-flex items-center gap-2 px-3 rounded-full border border-ink-100 dark:border-ink-700 bg-white dark:bg-ink-800 text-[12.5px] font-medium text-ink-700 dark:text-ink-200 hover:text-primary-700 hover:border-primary-200 dark:hover:bg-ink-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
      >
        <Hash className="w-[16px] h-[16px] text-ink-500" />
        <span className="hidden sm:inline">Term:</span>
        <span>{displayLabel}</span>
        <ChevronDown
          className={`w-3.5 h-3.5 text-ink-400 transition-transform ${isOpen ? "rotate-180" : ""}`}
        />
      </button>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.14 }}
            className="absolute right-0 mt-2 w-56 rounded-lg bg-white dark:bg-ink-800 border border-ink-100 dark:border-ink-700 shadow-lg overflow-hidden z-40"
          >
            <div className="max-h-[320px] overflow-y-auto py-1">
              <TermOption
                label="All terms"
                selected={selectedTermId === null}
                onClick={() => {
                  setSelected(null);
                  setIsOpen(false);
                }}
              />
              <div className="h-px bg-ink-100 dark:bg-ink-700 my-1" />
              {terms.map((t) => (
                <TermOption
                  key={t.id}
                  label={t.label}
                  badge={t.id === activeTermId ? "Active" : undefined}
                  selected={t.id === selectedTermId}
                  onClick={() => {
                    setSelected(t.id);
                    setIsOpen(false);
                  }}
                />
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function TermOption({
  label,
  badge,
  selected,
  onClick,
}: {
  label: string;
  badge?: string;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full flex items-center gap-2 px-3 py-2 text-[12.5px] text-left transition-colors ${
        selected
          ? "bg-primary-50 text-primary-800 dark:bg-primary-900/30 dark:text-primary-100"
          : "text-ink-700 dark:text-ink-200 hover:bg-ink-50 dark:hover:bg-ink-700/50"
      }`}
    >
      <Check
        className={`w-3.5 h-3.5 shrink-0 ${selected ? "text-primary-700 dark:text-primary-200" : "text-transparent"}`}
      />
      <span className="flex-1 tabular-nums">{label}</span>
      {badge && (
        <span className="text-[10px] uppercase tracking-wider font-semibold px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300">
          {badge}
        </span>
      )}
    </button>
  );
}
