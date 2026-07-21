import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import toast from "react-hot-toast";
import { FileText, CreditCard, Download, ExternalLink, RefreshCcw, ChevronDown, ChevronUp } from "lucide-react";
import { serviceRequestService } from "@/services/serviceRequestService";
import type { ServiceRequestSummary } from "@/types/serviceRequest";
import ModalPortal from "@/components/ui/ModalPortal";
import StepTracker from "@/components/service-requests/StepTracker";

const STATUS_STYLES: Record<string, string> = {
  submitted: "bg-amber-50 text-amber-700 dark:bg-amber-900/20 dark:text-amber-400",
  in_review: "bg-amber-50 text-amber-700 dark:bg-amber-900/20 dark:text-amber-400",
  changes_requested: "bg-orange-50 text-orange-700 dark:bg-orange-900/20 dark:text-orange-400",
  approved: "bg-blue-50 text-blue-700 dark:bg-blue-900/20 dark:text-blue-400",
  awaiting_payment: "bg-blue-50 text-blue-700 dark:bg-blue-900/20 dark:text-blue-400",
  paid: "bg-emerald-50 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-400",
  completed: "bg-emerald-50 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-400",
  rejected: "bg-red-50 text-red-700 dark:bg-red-900/20 dark:text-red-400",
  cancelled: "bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400",
  expired: "bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400",
};

export default function MyServiceRequestsPage() {
  const queryClient = useQueryClient();
  const [resubmitId, setResubmitId] = useState<number | null>(null);
  const [note, setNote] = useState("");

  const requestsQ = useQuery({
    queryKey: ["service-requests", "mine"],
    queryFn: ({ signal }) => serviceRequestService.myRequests(signal),
  });

  const requests = requestsQ.data?.data ?? [];

  const checkoutM = useMutation({
    mutationFn: (id: number) => serviceRequestService.getCheckoutLink(id),
    onSuccess: (res) => {
      const url = res.data?.checkout_url;
      if (url) window.open(url, "_blank");
    },
    onError: (e: any) => toast.error(e.response?.data?.message || "Failed to generate checkout link."),
  });

  const resubmitM = useMutation({
    mutationFn: (id: number) => serviceRequestService.resubmit(id, note ? { notes: note } : {}, {}),
    onSuccess: () => {
      toast.success("Request resubmitted for review.");
      queryClient.invalidateQueries({ queryKey: ["service-requests", "mine"] });
      setResubmitId(null);
      setNote("");
    },
    onError: (e: any) => toast.error(e.response?.data?.message || "Failed to resubmit request."),
  });

  return (
    <div className="space-y-6 p-4 md:p-6">
      <div className="flex items-center gap-4">
        <div className="w-12 h-12 rounded-2xl bg-primary-50 dark:bg-primary-900/20 flex items-center justify-center">
          <FileText className="w-6 h-6 text-primary-600" />
        </div>
        <div>
          <h1 className="text-xl font-black text-gray-900 dark:text-white">My Service Requests</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">Track your submitted service requests and download documents once ready.</p>
        </div>
      </div>

      <div className="space-y-3">
        {requestsQ.isLoading && <p className="text-center text-gray-400 py-8">Loading...</p>}
        {!requestsQ.isLoading && requests.length === 0 && (
          <p className="text-center text-gray-400 py-8">No service requests yet.</p>
        )}
        {requests.map((r) => (
          <RequestRow
            key={r.id}
            request={r}
            onResubmit={() => setResubmitId(r.id)}
            onPay={() => checkoutM.mutate(r.id)}
            payPending={checkoutM.isPending}
          />
        ))}
      </div>

      {resubmitId !== null && (
        <ModalPortal>
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
            <div className="bg-white dark:bg-gray-900 rounded-3xl w-full max-w-md p-6 space-y-4">
              <h2 className="text-lg font-black text-gray-900 dark:text-white">Resubmit Request</h2>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                Address the reviewer's feedback, then resubmit — it will go back to the same reviewer.
              </p>
              <textarea
                autoFocus
                rows={4}
                placeholder="What changed?"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-gray-100 dark:bg-gray-800 outline-none text-sm"
              />
              <div className="flex items-center justify-end gap-3">
                <button
                  onClick={() => { setResubmitId(null); setNote(""); }}
                  className="px-4 py-2 rounded-xl text-sm font-bold text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800"
                >
                  Cancel
                </button>
                <button
                  onClick={() => resubmitM.mutate(resubmitId)}
                  disabled={resubmitM.isPending}
                  className="px-5 py-2 rounded-xl bg-orange-500 hover:bg-orange-600 text-white text-sm font-bold disabled:opacity-50"
                >
                  {resubmitM.isPending ? "Resubmitting..." : "Resubmit"}
                </button>
              </div>
            </div>
          </div>
        </ModalPortal>
      )}
    </div>
  );
}

function RequestRow({
  request: r, onResubmit, onPay, payPending,
}: {
  request: ServiceRequestSummary;
  onResubmit: () => void;
  onPay: () => void;
  payPending: boolean;
}) {
  const [expanded, setExpanded] = useState(false);

  const progressQ = useQuery({
    queryKey: ["service-requests", "progress", r.id],
    queryFn: ({ signal }) => serviceRequestService.getProgress(r.id, signal),
    enabled: expanded,
  });

  return (
    <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 p-5">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="font-mono text-xs text-gray-400">{r.request_code}</span>
            <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${STATUS_STYLES[r.status] ?? "bg-gray-100 text-gray-500"}`}>
              {r.status.replace(/_/g, " ")}
            </span>
          </div>
          <p className="font-bold text-gray-900 dark:text-white mt-1">{r.service_name}</p>
          <p className="text-xs text-gray-400 mt-0.5">
            Submitted {r.submitted_at ? new Date(r.submitted_at).toLocaleDateString() : "-"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setExpanded((v) => !v)}
            className="flex items-center gap-1 px-3 py-2 rounded-xl text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800 text-xs font-bold"
          >
            {expanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
            Progress
          </button>
          {r.status === "changes_requested" && (
            <button
              onClick={onResubmit}
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-orange-500 hover:bg-orange-600 text-white text-xs font-bold"
            >
              <RefreshCcw className="w-3.5 h-3.5" /> Resubmit
            </button>
          )}
          {r.status === "awaiting_payment" && (
            <button
              onClick={onPay}
              disabled={payPending}
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-primary-600 hover:bg-primary-700 text-white text-xs font-bold"
            >
              <CreditCard className="w-3.5 h-3.5" /> Pay Now <ExternalLink className="w-3 h-3" />
            </button>
          )}
          {(r.status === "paid" || r.status === "completed") && r.download_token && (
            <button
              onClick={() => serviceRequestService.download(r.id, r.download_token!, r.request_code)}
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold"
            >
              <Download className="w-3.5 h-3.5" /> Download
            </button>
          )}
        </div>
      </div>

      {expanded && (
        <div className="mt-4 pt-4 border-t border-gray-100 dark:border-gray-800">
          {progressQ.isLoading && <p className="text-xs text-gray-400">Loading progress...</p>}
          {progressQ.data?.data && (
            <StepTracker
              steps={progressQ.data.data.steps}
              currentStep={progressQ.data.data.current_step}
              totalSteps={progressQ.data.data.total_steps}
            />
          )}
        </div>
      )}
    </div>
  );
}
