import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import toast from "react-hot-toast";
import { useAuthStore } from "@/store/authStore";
import { useLogout } from "@/hooks/useAuth";
import { moduleRequestService, ModuleOption } from "@/services/moduleRequestService";

/**
 * Shown to a lecturer who has no modules assigned yet. They choose the modules
 * they teach and send the request; an administrator or the Dean / HOD of the
 * module's department approves it. Until then the rest of the app is hidden.
 */
export default function ModuleRequestGate() {
  const { isAuthenticated } = useAuthStore();
  const qc = useQueryClient();
  const logout = useLogout();

  const statusQ = useQuery({
    queryKey: ["module-requests", "status"],
    queryFn: () => moduleRequestService.status(),
    enabled: isAuthenticated,
    staleTime: 60_000,
    refetchInterval: (q) => {
      const d: any = q.state.data;
      return (d?.data ?? d)?.waiting ? 30_000 : false;
    },
  });
  const statusRaw: any = statusQ.data;
  const status = statusRaw?.data ?? statusRaw;

  const optionsQ = useQuery({
    queryKey: ["module-requests", "options"],
    queryFn: () => moduleRequestService.options(),
    enabled: !!status?.needs_request,
  });
  const optionsRaw: any = optionsQ.data;
  const options: ModuleOption[] = optionsRaw?.data?.modules ?? optionsRaw?.modules ?? [];

  const [picked, setPicked] = useState<number[]>([]);
  const [busy, setBusy] = useState(false);
  const [filter, setFilter] = useState("");

  const visible = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return options;
    return options.filter((m) =>
      `${m.module_code} ${m.module_name}`.toLowerCase().includes(q),
    );
  }, [options, filter]);

  if (!status || !(status.needs_request || status.waiting)) {
    return null;
  }

  const toggle = (id: number) =>
    setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));

  const submit = async () => {
    if (picked.length === 0) return;
    setBusy(true);
    try {
      await moduleRequestService.submit(picked);
      toast.success("Request sent. Waiting for approval.");
      await qc.invalidateQueries({ queryKey: ["module-requests"] });
    } catch {
      toast.error("Could not send the request. Try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-[rgb(var(--bg-app))] p-4">
      <div className="card-tight w-full max-w-lg space-y-4">
        <div>
          <h1 className="text-lg font-semibold">
            {status.waiting ? "Waiting for module approval" : "Choose the modules you teach"}
          </h1>
          <p className="text-sm text-gray-600 mt-1">
            {status.waiting
              ? "Your module request has been sent. Your Dean, Head of Department or an administrator will approve it. You will see your modules and students once it is approved."
              : "You have no modules assigned yet. Choose the modules you teach and send the request. Your Dean, Head of Department or an administrator will confirm it."}
          </p>
        </div>

        {status.needs_request && (
          <div className="space-y-3">
            <input
              className="w-full border rounded px-2 py-2 text-sm"
              placeholder="Search by code or name"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
            />
            <ul className="max-h-72 overflow-y-auto divide-y border rounded">
              {visible.length === 0 && (
                <li className="p-3 text-sm text-gray-500">No modules match.</li>
              )}
              {visible.map((m) => (
                <li key={m.module_id}>
                  <label className="flex items-start gap-2 p-2 text-sm cursor-pointer hover:bg-gray-50">
                    <input
                      type="checkbox"
                      className="mt-1"
                      checked={picked.includes(m.module_id)}
                      onChange={() => toggle(m.module_id)}
                    />
                    <span>
                      <span className="font-medium">{m.module_code}</span> {m.module_name}
                      {m.dep_name && <span className="block text-xs text-gray-500">{m.dep_name}</span>}
                    </span>
                  </label>
                </li>
              ))}
            </ul>
            <button
              className="w-full bg-blue-700 text-white rounded px-3 py-2 text-sm disabled:opacity-50"
              disabled={picked.length === 0 || busy}
              onClick={submit}
            >
              {busy ? "Sending…" : `Send request (${picked.length} selected)`}
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
