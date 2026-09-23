import { AlertTriangle, CheckCircle2, Info, Lightbulb } from "lucide-react";
import type { CalloutTone } from "@/data/help/types";
import RichText from "./RichText";

const TONE = {
  info: {
    icon: Info,
    wrap: "border-sky-200 bg-sky-50/70 dark:border-sky-500/30 dark:bg-sky-500/10",
    accent: "text-sky-600 dark:text-sky-300",
    label: "Note",
  },
  tip: {
    icon: Lightbulb,
    wrap: "border-emerald-200 bg-emerald-50/70 dark:border-emerald-500/30 dark:bg-emerald-500/10",
    accent: "text-emerald-600 dark:text-emerald-300",
    label: "Tip",
  },
  warning: {
    icon: AlertTriangle,
    wrap: "border-amber-300 bg-amber-50/80 dark:border-amber-500/30 dark:bg-amber-500/10",
    accent: "text-amber-600 dark:text-amber-300",
    label: "Careful",
  },
  success: {
    icon: CheckCircle2,
    wrap: "border-emerald-200 bg-emerald-50/70 dark:border-emerald-500/30 dark:bg-emerald-500/10",
    accent: "text-emerald-600 dark:text-emerald-300",
    label: "Done",
  },
} as const satisfies Record<CalloutTone, unknown>;

export default function HelpCallout({
  tone,
  title,
  text,
}: {
  tone: CalloutTone;
  title?: string;
  text: string;
}) {
  const meta = TONE[tone];
  const Icon = meta.icon;

  return (
    <div className={`rounded-xl border px-4 py-3.5 flex gap-3 ${meta.wrap}`}>
      <Icon className={`w-4 h-4 mt-0.5 shrink-0 ${meta.accent}`} />
      <div className="min-w-0">
        <p className={`text-[12.5px] font-semibold mb-0.5 ${meta.accent}`}>
          {title ?? meta.label}
        </p>
        <p className="text-[13px] leading-relaxed text-ink-700 dark:text-ink-200">
          <RichText text={text} />
        </p>
      </div>
    </div>
  );
}
