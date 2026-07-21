import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Search, Loader2 } from "lucide-react";
import { serviceRequestService, type ServiceRequestTrackResult } from "@/services/serviceRequestService";
import { Shell } from "./ServiceCatalogPage";
import StepTracker from "@/components/service-requests/StepTracker";

const STATUS_STYLES: Record<string, string> = {
  Processing: "bg-amber-50 text-amber-700 dark:bg-amber-900/20 dark:text-amber-400",
  "Awaiting Payment": "bg-blue-50 text-blue-700 dark:bg-blue-900/20 dark:text-blue-400",
  Ready: "bg-emerald-50 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-400",
  Completed: "bg-emerald-50 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-400",
  Rejected: "bg-red-50 text-red-700 dark:bg-red-900/20 dark:text-red-400",
  Cancelled: "bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400",
  Expired: "bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400",
};

export default function TrackServiceRequestPage() {
  const [requestCode, setRequestCode] = useState("");
  const [identifier, setIdentifier] = useState("");
  const [result, setResult] = useState<ServiceRequestTrackResult | null>(null);

  const trackM = useMutation({
    mutationFn: () => serviceRequestService.track(requestCode.trim(), identifier.trim()),
    onSuccess: (res) => setResult(res.data ?? null),
    onError: () => setResult(null),
  });

  return (
    <Shell>
      <div className="max-w-lg mx-auto space-y-6">
        <div className="text-center space-y-2">
          <h1 className="text-2xl font-bold text-ink-900 dark:text-white">Track Your Request</h1>
          <p className="text-[13.5px] text-ink-500 dark:text-ink-400">
            Enter your request code and the phone, email, national ID, or registration number you used.
          </p>
        </div>

        <form
          onSubmit={(e) => { e.preventDefault(); trackM.mutate(); }}
          className="card p-6 space-y-4"
        >
          <div>
            <label className="text-[13px] font-medium text-ink-700 dark:text-ink-200">Request Code</label>
            <input
              required
              className="input mt-1"
              placeholder="SR-2026-000123"
              value={requestCode}
              onChange={(e) => setRequestCode(e.target.value)}
            />
          </div>
          <div>
            <label className="text-[13px] font-medium text-ink-700 dark:text-ink-200">Identifier</label>
            <input
              required
              className="input mt-1"
              placeholder="Phone, email, national ID, or reg. number"
              value={identifier}
              onChange={(e) => setIdentifier(e.target.value)}
            />
          </div>
          <button type="submit" disabled={trackM.isPending} className="btn-primary w-full justify-center">
            {trackM.isPending ? <><Loader2 className="w-4 h-4 animate-spin" /> Searching...</> : <><Search className="w-4 h-4" /> Track Status</>}
          </button>
        </form>

        {trackM.isError && (
          <div className="card p-4 text-center text-[13.5px] text-red-600 dark:text-red-400">
            No matching request found. Check your request code and identifier.
          </div>
        )}

        {result && (
          <div className="card p-6 space-y-5">
            <div className="flex items-center justify-between">
              <span className="font-mono font-semibold text-ink-900 dark:text-white">{result.request_code}</span>
              <span className={`px-2.5 py-1 rounded-full text-[11px] font-bold ${STATUS_STYLES[result.status] ?? "bg-gray-100 text-gray-500"}`}>
                {result.status}
              </span>
            </div>
            <p className="text-[13.5px] text-ink-600 dark:text-ink-300 -mt-2">{result.service_name}</p>

            <StepTracker steps={result.steps} currentStep={result.current_step} totalSteps={result.total_steps} />

            <div className="text-[12px] text-ink-400 space-y-0.5 pt-1 border-t border-ink-100 dark:border-ink-800">
              {result.submitted_at && <p>Submitted: {new Date(result.submitted_at).toLocaleString()}</p>}
              {result.completed_at && <p>Completed: {new Date(result.completed_at).toLocaleString()}</p>}
            </div>
          </div>
        )}
      </div>
    </Shell>
  );
}
