import { Link } from "react-router-dom";
import { ArrowRight, Clock3 } from "lucide-react";
import type { ArticleKind, HelpArticle, HelpModule, RoleTag } from "@/data/help/types";
import { KIND_META, helpPath } from "@/data/help";
import { ACCENT, KIND_STYLE, icon } from "./helpUi";

export function KindPill({ kind }: { kind: ArticleKind }) {
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10.5px] font-semibold uppercase tracking-wide ${KIND_STYLE[kind]}`}
      title={KIND_META[kind].blurb}
    >
      {KIND_META[kind].label}
    </span>
  );
}

export function RolePill({ role }: { role: RoleTag }) {
  return (
    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10.5px] font-medium bg-ink-100 text-ink-600 dark:bg-ink-700 dark:text-ink-300">
      {role}
    </span>
  );
}

export function ModuleCard({ module }: { module: HelpModule }) {
  const Icon = icon(module.icon);
  const accent = ACCENT[module.accent];

  return (
    <Link
      to={helpPath(module.id)}
      className={`group relative flex flex-col rounded-2xl border border-ink-100 dark:border-ink-700 bg-white dark:bg-ink-800 p-5 transition-all hover:shadow-card ${accent.ring}`}
    >
      <span className={`w-10 h-10 rounded-xl grid place-items-center mb-3.5 ${accent.chip}`}>
        <Icon className="w-[18px] h-[18px]" />
      </span>
      <h3 className="text-[14.5px] font-semibold text-ink-900 dark:text-white">
        {module.title}
      </h3>
      <p className="mt-1.5 text-[12.5px] leading-relaxed text-ink-500 dark:text-ink-400 flex-1">
        {module.summary}
      </p>
      <span className="mt-3.5 flex items-center justify-between">
        <span className="text-[11.5px] text-ink-400">
          {module.articles.length} {module.articles.length === 1 ? "guide" : "guides"}
        </span>
        <ArrowRight className="w-4 h-4 text-ink-300 group-hover:text-primary-500 group-hover:translate-x-0.5 transition-all" />
      </span>
    </Link>
  );
}

export function ArticleCard({
  moduleId,
  article,
  moduleTitle,
}: {
  moduleId: string;
  article: HelpArticle;
  moduleTitle?: string;
}) {
  return (
    <Link
      to={helpPath(moduleId, article.id)}
      className="group block rounded-xl border border-ink-100 dark:border-ink-700 bg-white dark:bg-ink-800 p-4 hover:border-primary-300 dark:hover:border-primary-500/40 transition-colors"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-1.5 mb-1.5">
            <KindPill kind={article.kind} />
            {moduleTitle && (
              <span className="text-[11px] text-ink-400">{moduleTitle}</span>
            )}
          </div>
          <h4 className="text-[13.5px] font-semibold text-ink-900 dark:text-white group-hover:text-primary-700 dark:group-hover:text-primary-300 transition-colors">
            {article.title}
          </h4>
          <p className="mt-1 text-[12.5px] leading-relaxed text-ink-500 dark:text-ink-400">
            {article.summary}
          </p>
        </div>
        <span className="shrink-0 inline-flex items-center gap-1 text-[11px] text-ink-400 whitespace-nowrap">
          <Clock3 className="w-3 h-3" />
          {article.minutes} min
        </span>
      </div>
    </Link>
  );
}
