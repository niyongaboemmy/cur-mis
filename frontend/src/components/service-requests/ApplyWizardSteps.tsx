import { Check } from "lucide-react";

export type WizardStepKey = "review" | "auth" | "form" | "confirm" | "payment" | "success";

const STEPS: { key: WizardStepKey; label: string }[] = [
  { key: "review", label: "Review" },
  { key: "auth", label: "Sign in" },
  { key: "form", label: "Details" },
  { key: "confirm", label: "Confirm" },
  { key: "payment", label: "Pay" },
];

/** Horizontal progress bar for the apply wizard — distinct from StepTracker, which renders vertical post-submission approval stages. */
export default function ApplyWizardSteps({
  current,
  skipAuth,
  includePayment,
}: {
  current: WizardStepKey;
  /** Hide the "Sign in" step entirely when the applicant is already authenticated. */
  skipAuth?: boolean;
  /** Only fee-based services pay before review — hide the "Pay" step otherwise. */
  includePayment?: boolean;
}) {
  let steps = skipAuth ? STEPS.filter((s) => s.key !== "auth") : STEPS;
  if (!includePayment) steps = steps.filter((s) => s.key !== "payment");
  const currentIndex = steps.findIndex((s) => s.key === current);

  return (
    <div className="flex items-center">
      {steps.map((step, i) => {
        const isDone = i < currentIndex || current === "success";
        const isCurrent = i === currentIndex && current !== "success";
        const isLast = i === steps.length - 1;

        return (
          <div key={step.key} className={`flex items-center ${isLast ? "" : "flex-1"}`}>
            <div className="flex flex-col items-center gap-1">
              <div
                className={`w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-bold shrink-0 transition-colors ${
                  isDone
                    ? "bg-emerald-500 text-white"
                    : isCurrent
                    ? "bg-brand text-white ring-4 ring-brand/15"
                    : "bg-ink-100 dark:bg-ink-800 text-ink-400"
                }`}
              >
                {isDone ? <Check className="w-3.5 h-3.5" /> : i + 1}
              </div>
              <span
                className={`text-[10.5px] font-semibold uppercase tracking-wide whitespace-nowrap ${
                  isCurrent ? "text-brand" : isDone ? "text-emerald-600 dark:text-emerald-400" : "text-ink-400"
                }`}
              >
                {step.label}
              </span>
            </div>
            {!isLast && (
              <div
                className={`h-0.5 flex-1 mx-2 -mt-4 transition-colors ${
                  isDone ? "bg-emerald-400" : "bg-ink-100 dark:bg-ink-800"
                }`}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}
