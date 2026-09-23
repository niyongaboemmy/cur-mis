import { Link } from "react-router-dom";
import { ArrowUpRight, BookMarked } from "lucide-react";
import type { HelpBlock } from "@/data/help/types";
import { GLOSSARY_BY_ID } from "@/data/help/glossary";
import RichText from "./RichText";
import HelpCallout from "./HelpCallout";
import HelpStepper from "./HelpStepper";
import HelpFaq from "./HelpFaq";

/** Renders one article's blocks in order. */
export default function HelpBlocks({
  blocks,
  storageKey,
}: {
  blocks: HelpBlock[];
  storageKey: string;
}) {
  return (
    <div className="space-y-6">
      {blocks.map((block, i) => {
        switch (block.type) {
          case "paragraph":
            return (
              <p
                key={i}
                className="text-[14px] leading-[1.75] text-ink-700 dark:text-ink-200"
              >
                <RichText text={block.text} />
              </p>
            );

          case "steps":
            return (
              <HelpStepper
                key={i}
                storageKey={`${storageKey}:${i}`}
                title={block.title}
                steps={block.steps}
              />
            );

          case "callout":
            return (
              <HelpCallout key={i} tone={block.tone} title={block.title} text={block.text} />
            );

          case "list":
            return (
              <section key={i}>
                {block.title && (
                  <h3 className="text-[13.5px] font-semibold text-ink-900 dark:text-white mb-2.5">
                    {block.title}
                  </h3>
                )}
                {block.ordered ? (
                  <ol className="space-y-2">
                    {block.items.map((item, j) => (
                      <li key={j} className="flex gap-3">
                        <span className="shrink-0 mt-0.5 w-5 h-5 rounded-full bg-primary-50 dark:bg-primary-500/15 text-primary-700 dark:text-primary-300 grid place-items-center text-[11px] font-semibold">
                          {j + 1}
                        </span>
                        <span className="text-[13.5px] leading-relaxed text-ink-700 dark:text-ink-200">
                          <RichText text={item} />
                        </span>
                      </li>
                    ))}
                  </ol>
                ) : (
                  <ul className="space-y-2">
                    {block.items.map((item, j) => (
                      <li key={j} className="flex gap-3">
                        <span className="shrink-0 mt-[9px] w-1.5 h-1.5 rounded-full bg-primary-400" />
                        <span className="text-[13.5px] leading-relaxed text-ink-700 dark:text-ink-200">
                          <RichText text={item} />
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            );

          case "table":
            return (
              <section key={i}>
                {block.title && (
                  <h3 className="text-[13.5px] font-semibold text-ink-900 dark:text-white mb-2.5">
                    {block.title}
                  </h3>
                )}
                {/* Wide tables scroll inside their own box; the page never does. */}
                <div className="rounded-2xl border border-ink-100 dark:border-ink-700 overflow-x-auto">
                  <table className="w-full min-w-[420px] text-left border-collapse">
                    <thead>
                      <tr className="bg-ink-50 dark:bg-ink-700/50">
                        {block.head.map((h, j) => (
                          <th
                            key={j}
                            className="px-4 py-2.5 text-[11.5px] font-semibold uppercase tracking-wider text-ink-500 dark:text-ink-300 whitespace-nowrap"
                          >
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-ink-50 dark:divide-ink-700/60">
                      {block.rows.map((row, j) => (
                        <tr key={j} className="bg-white dark:bg-ink-800 align-top">
                          {row.map((cell, k) => (
                            <td
                              key={k}
                              className="px-4 py-3 text-[13px] leading-relaxed text-ink-700 dark:text-ink-200"
                            >
                              <RichText text={cell} />
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            );

          case "faq":
            return <HelpFaq key={i} title={block.title} items={block.items} />;

          case "terms":
            return (
              <section key={i}>
                <h3 className="flex items-center gap-2 text-[13.5px] font-semibold text-ink-900 dark:text-white mb-3">
                  <BookMarked className="w-4 h-4 text-primary-500" />
                  {block.title ?? "Words used on this page"}
                </h3>
                <div className="grid gap-2.5 sm:grid-cols-2">
                  {block.ids
                    .map((id) => GLOSSARY_BY_ID[id])
                    .filter(Boolean)
                    .map((term) => (
                      <Link
                        key={term.id}
                        to={`/help/glossary#${term.id}`}
                        className="group rounded-xl border border-ink-100 dark:border-ink-700 bg-white dark:bg-ink-800 p-3.5 hover:border-primary-300 dark:hover:border-primary-500/40 transition-colors"
                      >
                        <span className="flex items-center gap-1.5 text-[12.5px] font-semibold text-ink-900 dark:text-white">
                          {term.term}
                          <ArrowUpRight className="w-3 h-3 text-ink-300 group-hover:text-primary-500 transition-colors" />
                        </span>
                        <span className="mt-1 block text-[12px] leading-relaxed text-ink-500 dark:text-ink-400 line-clamp-3">
                          {term.definition}
                        </span>
                      </Link>
                    ))}
                </div>
              </section>
            );

          default:
            return null;
        }
      })}
    </div>
  );
}
