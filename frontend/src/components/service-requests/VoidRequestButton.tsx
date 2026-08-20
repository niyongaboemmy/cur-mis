import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import toast from "react-hot-toast";
import { Ban } from "lucide-react";
import ModalPortal from "@/components/ui/ModalPortal";
import { serviceRequestApprovalService } from "@/services/serviceRequestApprovalService";
import { PERMISSIONS } from "@/constants/permissions";
import { usePermission } from "@/utils/permissions";

/**
 * Supervisory void — cancels a service request that is stuck outside the
 * normal per-stage approval chain.
 *
 * `POST /api/admin/service-requests/:id/void` has been implemented and gated
 * on VOID_SERVICE_REQUEST since the approval chain shipped, but nothing in the
 * app ever called it, so holding the permission granted nothing. This is that
 * caller.
 */

/** Statuses the server refuses to void — mirrors ServiceRequestService::TERMINAL_STATUSES. */
const TERMINAL_STATUSES = ["completed", "rejected", "cancelled", "expired"];

interface Props {
  requestId: number;
  requestCode: string;
  status: string;
  /** Query keys to refresh once the request is voided. */
  invalidateKeys?: unknown[][];
  className?: string;
}

export default function VoidRequestButton({
  requestId,
  requestCode,
  status,
  invalidateKeys = [],
  className = "",
}: Props) {
  const canVoid = usePermission(PERMISSIONS.VOID_SERVICE_REQUEST);
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");

  const voidM = useMutation({
    mutationFn: () => serviceRequestApprovalService.voidRequest(requestId, reason.trim()),
    onSuccess: () => {
      toast.success(`${requestCode} voided.`);
      invalidateKeys.forEach((key) => queryClient.invalidateQueries({ queryKey: key }));
      setOpen(false);
      setReason("");
    },
    onError: (e: any) =>
      toast.error(e.response?.data?.message || "Could not void this request."),
  });

  // Hidden rather than disabled once a request is terminal: the server refuses
  // it anyway, and a permanently greyed-out control reads as a bug.
  if (!canVoid || TERMINAL_STATUSES.includes(status)) return null;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={
          className ||
          "flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-red-200 dark:border-red-900/50 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 text-xs font-bold"
        }
      >
        <Ban className="w-3.5 h-3.5" /> Void
      </button>

      {open && (
        <ModalPortal>
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
            <div className="bg-white dark:bg-gray-900 rounded-3xl w-full max-w-md p-6 space-y-4">
              <div className="space-y-1">
                <h2 className="text-lg font-black text-gray-900 dark:text-white">
                  Void {requestCode}?
                </h2>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  This cancels the request outside the approval chain and notifies
                  the requester. It cannot be undone.
                </p>
              </div>

              <div className="space-y-1.5">
                <label
                  htmlFor={`void-reason-${requestId}`}
                  className="text-xs font-bold uppercase tracking-wider text-gray-400"
                >
                  Reason
                </label>
                <textarea
                  id={`void-reason-${requestId}`}
                  autoFocus
                  rows={4}
                  placeholder="Why is this request being voided? (recorded in the audit trail)"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-gray-100 dark:bg-gray-800 outline-none text-sm"
                />
              </div>

              <div className="flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => { setOpen(false); setReason(""); }}
                  className="px-4 py-2 rounded-xl text-sm font-bold text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => voidM.mutate()}
                  disabled={voidM.isPending || reason.trim().length < 5}
                  title={reason.trim().length < 5 ? "Give a reason of at least 5 characters" : undefined}
                  className="px-5 py-2 rounded-xl bg-red-600 hover:bg-red-700 text-white text-sm font-bold disabled:opacity-50"
                >
                  {voidM.isPending ? "Voiding…" : "Void request"}
                </button>
              </div>
            </div>
          </div>
        </ModalPortal>
      )}
    </>
  );
}
