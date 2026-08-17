import * as Icons from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { AccentName, ArticleKind } from "@/data/help/types";

/** Resolve a lucide icon by name, with a safe fallback. */
export function icon(name?: string): LucideIcon {
  const found = name
    ? (Icons as unknown as Record<string, LucideIcon>)[name]
    : undefined;
  return found ?? Icons.BookOpen;
}

/**
 * Accent palettes. Tailwind cannot see dynamically-built class names, so each
 * combination is written out in full here.
 */
export const ACCENT: Record<
  AccentName,
  { chip: string; ring: string; bar: string; text: string; soft: string }
> = {
  sky: {
    chip: "bg-sky-100 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300",
    ring: "group-hover:border-sky-300 dark:group-hover:border-sky-500/40",
    bar: "bg-sky-500",
    text: "text-sky-700 dark:text-sky-300",
    soft: "bg-sky-50 dark:bg-sky-500/10",
  },
  violet: {
    chip: "bg-violet-100 text-violet-700 dark:bg-violet-500/15 dark:text-violet-300",
    ring: "group-hover:border-violet-300 dark:group-hover:border-violet-500/40",
    bar: "bg-violet-500",
    text: "text-violet-700 dark:text-violet-300",
    soft: "bg-violet-50 dark:bg-violet-500/10",
  },
  emerald: {
    chip: "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300",
    ring: "group-hover:border-emerald-300 dark:group-hover:border-emerald-500/40",
    bar: "bg-emerald-500",
    text: "text-emerald-700 dark:text-emerald-300",
    soft: "bg-emerald-50 dark:bg-emerald-500/10",
  },
  amber: {
    chip: "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300",
    ring: "group-hover:border-amber-300 dark:group-hover:border-amber-500/40",
    bar: "bg-amber-500",
    text: "text-amber-700 dark:text-amber-300",
    soft: "bg-amber-50 dark:bg-amber-500/10",
  },
  rose: {
    chip: "bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300",
    ring: "group-hover:border-rose-300 dark:group-hover:border-rose-500/40",
    bar: "bg-rose-500",
    text: "text-rose-700 dark:text-rose-300",
    soft: "bg-rose-50 dark:bg-rose-500/10",
  },
  cyan: {
    chip: "bg-cyan-100 text-cyan-700 dark:bg-cyan-500/15 dark:text-cyan-300",
    ring: "group-hover:border-cyan-300 dark:group-hover:border-cyan-500/40",
    bar: "bg-cyan-500",
    text: "text-cyan-700 dark:text-cyan-300",
    soft: "bg-cyan-50 dark:bg-cyan-500/10",
  },
  indigo: {
    chip: "bg-indigo-100 text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-300",
    ring: "group-hover:border-indigo-300 dark:group-hover:border-indigo-500/40",
    bar: "bg-indigo-500",
    text: "text-indigo-700 dark:text-indigo-300",
    soft: "bg-indigo-50 dark:bg-indigo-500/10",
  },
  teal: {
    chip: "bg-teal-100 text-teal-700 dark:bg-teal-500/15 dark:text-teal-300",
    ring: "group-hover:border-teal-300 dark:group-hover:border-teal-500/40",
    bar: "bg-teal-500",
    text: "text-teal-700 dark:text-teal-300",
    soft: "bg-teal-50 dark:bg-teal-500/10",
  },
  orange: {
    chip: "bg-orange-100 text-orange-700 dark:bg-orange-500/15 dark:text-orange-300",
    ring: "group-hover:border-orange-300 dark:group-hover:border-orange-500/40",
    bar: "bg-orange-500",
    text: "text-orange-700 dark:text-orange-300",
    soft: "bg-orange-50 dark:bg-orange-500/10",
  },
  slate: {
    chip: "bg-slate-200 text-slate-700 dark:bg-slate-500/20 dark:text-slate-300",
    ring: "group-hover:border-slate-300 dark:group-hover:border-slate-500/40",
    bar: "bg-slate-500",
    text: "text-slate-700 dark:text-slate-300",
    soft: "bg-slate-100 dark:bg-slate-500/10",
  },
};

export const KIND_STYLE: Record<ArticleKind, string> = {
  walkthrough:
    "bg-primary-50 text-primary-700 dark:bg-primary-500/15 dark:text-primary-200",
  howto: "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300",
  reference: "bg-ink-100 text-ink-600 dark:bg-ink-700 dark:text-ink-200",
  concept: "bg-amber-50 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300",
};

/** Stable anchor id for a block heading, so a section can be deep-linked. */
export function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, "$1")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}
