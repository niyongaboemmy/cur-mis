import { useState } from "react";
import { ChevronDown, HelpCircle } from "lucide-react";
import RichText from "./RichText";

export default function HelpFaq({
  title,
  items,
}: {
  title?: string;
  items: { q: string; a: string }[];
}) {
  const [open, setOpen] = useState<number | null>(0);

  return (
    <section>
      <h3 className="flex items-center gap-2 text-[13.5px] font-semibold text-ink-900 dark:text-white mb-3">
        <HelpCircle className="w-4 h-4 text-primary-500" />
        {title ?? "Common questions"}
      </h3>
      <div className="rounded-2xl border border-ink-100 dark:border-ink-700 bg-white dark:bg-ink-800 divide-y divide-ink-50 dark:divide-ink-700/60 overflow-hidden">
        {items.map((item, i) => {
          const isOpen = open === i;
          return (
            <div key={i}>
              <button
                type="button"
                onClick={() => setOpen(isOpen ? null : i)}
                aria-expanded={isOpen}
                className="w-full flex items-center gap-3 px-4 sm:px-5 py-3.5 text-left hover:bg-ink-50/60 dark:hover:bg-ink-700/40 transition-colors"
              >
                <span className="flex-1 text-[13px] font-medium text-ink-800 dark:text-ink-100">
                  <RichText text={item.q} />
                </span>
                <ChevronDown
                  className={`w-4 h-4 shrink-0 text-ink-400 transition-transform ${
                    isOpen ? "rotate-180" : ""
                  }`}
                />
              </button>
              {isOpen && (
                <p className="px-4 sm:px-5 pb-4 -mt-1 text-[13px] leading-relaxed text-ink-600 dark:text-ink-300">
                  <RichText text={item.a} />
                </p>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
