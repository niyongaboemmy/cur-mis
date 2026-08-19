import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import toast from "react-hot-toast";
import { ClipboardCheck, Check, X, MessageSquareWarning } from "lucide-react";
import { serviceRequestApprovalService } from "@/services/serviceRequestApprovalService";
import ModalPortal from "@/components/ui/ModalPortal";
import VoidRequestButton from "@/components/service-requests/VoidRequestButton";

export default function ServiceRequestApprovalQueuePage() {
  const queryClient = useQueryClient();
  const [activeRow, setActiveRow] = useState<{ id: number; decision: "rejected" | "changes_requested" } | null>(null);
  const [comment, setComment] = useState("");

  const queueQ = useQuery({
    queryKey: ["service-requests", "approvals", "queue"],
    queryFn: ({ signal }) => serviceRequestApprovalService.getQueue(signal),
  });

  const queue = queueQ.data?.data ?? [];

  const decideM = useMutation({
    mutationFn: ({ id, decision, comment }: { id: number; decision: "approved" | "rejected" | "changes_requested"; comment?: string }) =>
      serviceRequestApprovalService.decide(id, decision, comment),
    onSuccess: () => {
      toast.success("Decision recorded.");
      queryClient.invalidateQueries({ queryKey: ["service-requests", "approvals", "queue"] });
      setActiveRow(null);
      setComment("");
    },
    onError: (e: any) => toast.error(e.response?.data?.message || "Failed to record decision."),
  });

  return (
    <div className="space-y-6 p-4 md:p-6">
      <div className="flex items-center gap-4">
        <div className="w-12 h-12 rounded-2xl bg-primary-50 dark:bg-primary-900/20 flex items-center justify-center">
          <ClipboardCheck className="w-6 h-6 text-primary-600" />
        </div>
        <div>
          <h1 className="text-xl font-black text-gray-900 dark:text-white">Service Request Approvals</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Requests currently at a stage you hold approval permission for.
          </p>
        </div>
      </div>

      <div className="space-y-3">
        {queueQ.isLoading && <p className="text-center text-gray-400 py-8">Loading...</p>}
        {!queueQ.isLoading && queue.length === 0 && (
          <p className="text-center text-gray-400 py-8">Nothing awaiting your review.</p>
        )}
        {queue.map((r) => (
          <div key={r.id} className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 p-5 flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-2">
                <span className="font-mono text-xs text-gray-400">{r.request_code}</span>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase bg-amber-50 text-amber-700 dark:bg-amber-900/20 dark:text-amber-400">
                  {r.stage_label}
                </span>
                {!!r.is_final_approval && (
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase bg-primary-50 text-primary-700 dark:bg-primary-900/20 dark:text-primary-400">
                    Final Stage
                  </span>
                )}
              </div>
              <p className="font-bold text-gray-900 dark:text-white mt-1">{r.service_name}</p>
              <p className="text-xs text-gray-400 mt-0.5">
                {r.full_name} &middot; Submitted {r.submitted_at ? new Date(r.submitted_at).toLocaleDateString() : "-"}
              </p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button
                onClick={() => decideM.mutate({ id: r.id, decision: "approved" })}
                disabled={decideM.isPending}
                className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold"
              >
                <Check className="w-3.5 h-3.5" /> Approve
              </button>
              <button
                onClick={() => setActiveRow({ id: r.id, decision: "changes_requested" })}
                className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-orange-500 hover:bg-orange-600 text-white text-xs font-bold"
              >
                <MessageSquareWarning className="w-3.5 h-3.5" /> Request Changes
              </button>
              <button
                onClick={() => setActiveRow({ id: r.id, decision: "rejected" })}
                className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-red-600 hover:bg-red-700 text-white text-xs font-bold"
              >
                <X className="w-3.5 h-3.5" /> Reject
              </button>
              {/* Supervisory override — only rendered for holders of
                  VOID_SERVICE_REQUEST, and only while the request is still
                  live. Rejecting decides the stage; voiding pulls the request
                  out of the chain entirely. */}
              <VoidRequestButton
                requestId={r.id}
                requestCode={r.request_code}
                status={r.status}
                invalidateKeys={[["service-requests", "approvals", "queue"]]}
              />
            </div>
          </div>
        ))}
      </div>

      {activeRow && (
        <ModalPortal>
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
            <div className="bg-white dark:bg-gray-900 rounded-3xl w-full max-w-md p-6 space-y-4">
              <h2 className="text-lg font-black text-gray-900 dark:text-white">
                {activeRow.decision === "rejected" ? "Reject Request" : "Request Changes"}
              </h2>
              <textarea
                autoFocus
                rows={4}
                placeholder="Reason (visible in the audit trail)"
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-gray-100 dark:bg-gray-800 outline-none text-sm"
              />
              <div className="flex items-center justify-end gap-3">
                <button
                  onClick={() => { setActiveRow(null); setComment(""); }}
                  className="px-4 py-2 rounded-xl text-sm font-bold text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800"
                >
                  Cancel
                </button>
                <button
                  onClick={() => decideM.mutate({ id: activeRow.id, decision: activeRow.decision, comment })}
                  disabled={decideM.isPending}
                  className="px-5 py-2 rounded-xl bg-red-600 hover:bg-red-700 text-white text-sm font-bold disabled:opacity-50"
                >
                  Confirm
                </button>
              </div>
            </div>
          </div>
        </ModalPortal>
      )}
    </div>
  );
}
