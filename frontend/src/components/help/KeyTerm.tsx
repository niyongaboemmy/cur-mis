import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowUpRight, BookMarked } from "lucide-react";
import { lookupTerm } from "@/data/help/glossary";

/**
 * An inline jargon chip. Click reveals the definition in place rather than
 * navigating away — the reader is mid-sentence, and sending them to a glossary
 * page loses their place.
 */
export default function KeyTerm({
  term,
  label,
}: {
  term: string;
  label?: string;
}) {
  const entry = lookupTerm(term);
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", esc);
    };
  }, [open]);

  // Unknown term — render the words plainly rather than a dead chip.
  if (!entry) return <>{label ?? term}</>;

  return (
    <span ref={wrapRef} className="relative inline-block">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        title={`What is ${entry.term}?`}
        className={`inline items-baseline text-left font-medium underline decoration-dotted underline-offset-[3px] decoration-primary-400 transition-colors ${
          open
            ? "text-primary-700 dark:text-primary-300"
            : "text-primary-600 hover:text-primary-700 dark:text-primary-300 dark:hover:text-primary-200"
        }`}
      >
        {label ?? term}
      </button>

      {open && (
        <span
          role="tooltip"
          className="absolute left-0 top-[calc(100%+6px)] z-40 block w-[min(320px,80vw)] rounded-xl border border-ink-100 dark:border-ink-700 bg-white dark:bg-ink-800 shadow-xl p-3.5 text-left"
        >
          <span className="flex items-center gap-2 mb-1.5">
            <BookMarked className="w-3.5 h-3.5 text-primary-500 shrink-0" />
            <span className="text-[12.5px] font-semibold text-ink-900 dark:text-white">
              {entry.term}
            </span>
          </span>
          <span className="block text-[12.5px] leading-relaxed text-ink-600 dark:text-ink-300 font-normal">
            {entry.definition}
          </span>
          {entry.seenIn && (
            <span className="block mt-2 text-[11.5px] text-ink-400">
              Seen in: {entry.seenIn}
            </span>
          )}
          <Link
            to={`/help/glossary#${entry.id}`}
            onClick={() => setOpen(false)}
            className="mt-2.5 inline-flex items-center gap-1 text-[11.5px] font-medium text-primary-600 dark:text-primary-300 hover:underline"
          >
            Open in glossary <ArrowUpRight className="w-3 h-3" />
          </Link>
        </span>
      )}
    </span>
  );
}
