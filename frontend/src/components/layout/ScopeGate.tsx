import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import toast from "react-hot-toast";
import { useLogout } from "@/hooks/useAuth";
import { academicScopeService } from "@/services/academicScopeService";
import type { AcademicScope } from "@/hooks/useAcademicScope";

/**
 * Full-screen gate for Dean / HOD accounts that have no approved faculty or
 * department yet. Shown instead of the whole app until an admin approves the
 * request, so nothing behind it is visible.
 */
export default function ScopeGate({
  scope,
  onSubmitted,
}: {
  scope: AcademicScope;
  onSubmitted: () => void;
}) {
  const logout = useLogout();
  const optionsQ = useQuery({
    queryKey: ["academic-scope", "options"],
    queryFn: () => academicScopeService.options(),
    enabled: scope.needs_choice,
  });
  const optionsPayload: any = optionsQ.data;
  const options = optionsPayload?.data ?? optionsPayload ?? { faculties: [], departments: [] };

  const [kind, setKind] = useState<"faculty" | "department">("faculty");
  const [id, setId] = useState<number | "">("");
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (id === "") return;
    setBusy(true);
    try {
      await academicScopeService.requestScope(
        kind === "faculty" ? { fac_id: Number(id) } : { dep_id: Number(id) },
      );
      toast.success("Request sent. Waiting for approval.");
      onSubmitted();
    } catch {
      toast.error("Could not send the request. Try again.");
    } finally {
      setBusy(false);
    }
  };

  const req = scope.request;

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-[rgb(var(--bg-app))] p-4">
      <div className="card-tight w-full max-w-md space-y-4">
        <div>
          <h1 className="text-lg font-semibold">
            {scope.waiting ? "Waiting for approval" : "Choose your faculty or department"}
          </h1>
          <p className="text-sm text-gray-600 mt-1">
            {scope.waiting
              ? `Your request for ${req?.fac_name ?? req?.dep_name ?? "your unit"} has been sent. An administrator will approve it. You will see your data once it is approved.`
              : "Your account is a Dean or Head of Department. Choose the faculty (Dean) or department (HOD) you manage. An administrator will confirm it before you see any data."}
          </p>
          {req?.status === "rejected" && req.decision_note && (
            <p className="text-sm text-red-700 mt-2">Previous request was not approved: {req.decision_note}</p>
          )}
        </div>

        {scope.needs_choice && (
          <div className="space-y-3">
            <div className="flex gap-2 text-sm">
              <label className="flex items-center gap-1">
                <input type="radio" checked={kind === "faculty"} onChange={() => { setKind("faculty"); setId(""); }} />
                Dean — faculty
              </label>
              <label className="flex items-center gap-1">
                <input type="radio" checked={kind === "department"} onChange={() => { setKind("department"); setId(""); }} />
                Head of Department
              </label>
            </div>
            <select
              className="w-full border rounded px-2 py-2 text-sm"
              value={id}
              onChange={(e) => setId(e.target.value ? Number(e.target.value) : "")}
            >
              <option value="">{kind === "faculty" ? "Select faculty" : "Select department"}</option>
              {kind === "faculty"
                ? options.faculties.map((f: any) => (
                    <option key={f.fac_id} value={f.fac_id}>{f.fac_name}</option>
                  ))
                : options.departments.map((d: any) => (
                    <option key={d.dep_id} value={d.dep_id}>{d.dep_name}</option>
                  ))}
            </select>
            <button
              className="w-full bg-blue-700 text-white rounded px-3 py-2 text-sm disabled:opacity-50"
              disabled={id === "" || busy}
              onClick={submit}
            >
              {busy ? "Sending…" : "Send request"}
            </button>
          </div>
        )}

        <button
          className="w-full border rounded px-3 py-2 text-sm"
          onClick={() => logout.mutate()}
          disabled={logout.isPending}
        >
          Sign out
        </button>
      </div>
    </div>
  );
}
