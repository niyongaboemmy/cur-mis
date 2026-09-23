import { Check, X, MessageSquareWarning, Ban, Circle } from "lucide-react";
import type { RequestStep } from "@/types/serviceRequest";

const STATE_STYLES: Record<string, { circle: string; line: string; label: string }> = {
  completed: {
    circle: "bg-emerald-500 text-white",
    line: "bg-emerald-500",
    label: "text-emerald-700 dark:text-emerald-400",
  },
  current: {
    circle: "bg-primary-600 text-white ring-4 ring-primary-100 dark:ring-primary-900/40",
    line: "bg-gray-200 dark:bg-gray-700",
    label: "text-primary-700 dark:text-primary-400 font-bold",
  },
  pending: {
    circle: "bg-gray-100 dark:bg-gray-800 text-gray-400",
    line: "bg-gray-200 dark:bg-gray-700",
    label: "text-gray-400",
  },
  rejected: {
    circle: "bg-red-500 text-white",
    line: "bg-gray-200 dark:bg-gray-700",
    label: "text-red-600 dark:text-red-400 font-bold",
  },
  changes_requested: {
    circle: "bg-orange-500 text-white",
    line: "bg-gray-200 dark:bg-gray-700",
    label: "text-orange-600 dark:text-orange-400 font-bold",
  },
  cancelled: {
    circle: "bg-gray-400 text-white",
    line: "bg-gray-200 dark:bg-gray-700",
    label: "text-gray-500 font-bold",
  },
  skipped: {
    circle: "bg-gray-100 dark:bg-gray-800 text-gray-300",
    line: "bg-gray-200 dark:bg-gray-700",
    label: "text-gray-300 dark:text-gray-600",
  },
};

function StepIcon({ state }: { state: string }) {
  switch (state) {
    case "completed":
      return <Check className="w-4 h-4" />;
    case "rejected":
      return <X className="w-4 h-4" />;
    case "changes_requested":
      return <MessageSquareWarning className="w-4 h-4" />;
    case "cancelled":
      return <Ban className="w-4 h-4" />;
    default:
      return <Circle className="w-2.5 h-2.5 fill-current" />;
  }
}

export default function StepTracker({ steps, currentStep, totalSteps }: { steps: RequestStep[]; currentStep: number; totalSteps: number }) {
  return (
    <div>
      <p className="text-[11px] font-bold text-gray-400 uppercase tracking-widest mb-3">
        Step {currentStep} of {totalSteps}
      </p>
      <div className="space-y-0">
        {steps.map((step, i) => {
          const style = STATE_STYLES[step.state] ?? STATE_STYLES.pending;
          const isLast = i === steps.length - 1;
          return (
            <div key={step.key} className="flex gap-3">
              <div className="flex flex-col items-center">
                <div className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 transition-colors ${style.circle}`}>
                  <StepIcon state={step.state} />
                </div>
                {!isLast && <div className={`w-0.5 flex-1 min-h-[20px] ${style.line}`} />}
              </div>
              <div className={`pb-5 text-sm ${style.label}`}>
                {step.label}
                {step.state === "current" && (
                  <span className="block text-[11px] font-normal text-gray-400 mt-0.5">In progress</span>
                )}
                {step.state === "rejected" && (
                  <span className="block text-[11px] font-normal text-gray-400 mt-0.5">Rejected at this step</span>
                )}
                {step.state === "changes_requested" && (
                  <span className="block text-[11px] font-normal text-gray-400 mt-0.5">Changes requested</span>
                )}
                {step.state === "cancelled" && (
                  <span className="block text-[11px] font-normal text-gray-400 mt-0.5">Cancelled</span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
