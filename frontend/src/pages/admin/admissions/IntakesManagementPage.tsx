import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Pencil, Trash2, Power, Loader2 } from "lucide-react";
import toast from "react-hot-toast";
import { intakeService } from "@/services/admissionService";
import Modal from "@/components/ui/Modal";
import { PERMISSIONS } from "@/constants";
import { usePermission } from "@/utils/permissions";

export default function IntakesManagementPage() {
  const canManage = usePermission(PERMISSIONS.MANAGE_ADMISSIONS);
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ["admin", "intakes"],
    queryFn: () => intakeService.list(),
  });
  const [editing, setEditing] = useState<any>(null);

  const remove = useMutation({
    mutationFn: (id: number) => intakeService.remove(id),
    onSuccess: () => {
      toast.success("Intake removed");
      qc.invalidateQueries({ queryKey: ["admin", "intakes"] });
    },
    onError: (e: any) =>
      toast.error(e?.response?.data?.message ?? "Delete failed"),
  });

  const toggle = useMutation({
    mutationFn: (id: number) => intakeService.toggle(id),
    onSuccess: () => {
      toast.success("Status updated");
      qc.invalidateQueries({ queryKey: ["admin", "intakes"] });
    },
  });

  const intakes = q.data?.data ?? [];

  return (
    <div className="space-y-4 animate-fade-in">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold text-ink-900 dark:text-white">
            Admission Intakes
          </h2>
          <p className="text-[13px] text-ink-500">
            Manage intake periods and their activation status.
          </p>
        </div>
        {canManage && (
          <button className="btn-primary btn-sm" onClick={() => setEditing({})}>
            <Plus className="w-3.5 h-3.5" /> Create Intake
          </button>
        )}
      </div>

      <div className="card overflow-hidden">
        <table className="w-full text-left text-[13px]">
          <thead>
            <tr className="bg-ink-50 dark:bg-ink-800/50 border-b border-ink-100 dark:border-ink-700">
              <th className="px-4 py-2.5 font-bold text-ink-400 uppercase tracking-wider text-[10px]">
                Name
              </th>
              <th className="px-4 py-2.5 font-bold text-ink-400 uppercase tracking-wider text-[10px]">
                Start Date
              </th>
              <th className="px-4 py-2.5 font-bold text-ink-400 uppercase tracking-wider text-[10px]">
                End Date
              </th>
              <th className="px-4 py-2.5 font-bold text-ink-400 uppercase tracking-wider text-[10px]">
                Status
              </th>
              <th className="px-4 py-2.5 font-bold text-ink-400 uppercase tracking-wider text-[10px] text-right">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-ink-100 dark:divide-ink-700">
            {q.isLoading ? (
              <tr>
                <td colSpan={5} className="p-8 text-center">
                  <Loader2 className="w-6 h-6 animate-spin mx-auto text-brand" />
                </td>
              </tr>
            ) : intakes.length === 0 ? (
              <tr>
                <td colSpan={5} className="p-8 text-center text-ink-400">
                  No intakes found.
                </td>
              </tr>
            ) : (
              intakes.map((it: any) => (
                <tr
                  key={it.id}
                  className="hover:bg-ink-50/50 dark:hover:bg-ink-700/20"
                >
                  <td className="px-4 py-3 font-bold text-ink-900 dark:text-white">
                    {it.name}
                  </td>
                  <td className="px-4 py-3 text-ink-600 dark:text-ink-400">
                    {it.start_date}
                  </td>
                  <td className="px-4 py-3 text-ink-600 dark:text-ink-400">
                    {it.end_date}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`chip-xs ${it.is_active ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-400" : "bg-ink-100 text-ink-600 dark:bg-ink-700 dark:text-ink-400"}`}
                    >
                      {it.is_active ? "Active" : "Inactive"}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-1">
                      {canManage && (
                        <>
                          <button
                            className="icon-btn"
                            title="Toggle Active"
                            onClick={() => toggle.mutate(it.id)}
                          >
                            <Power
                              className={`w-3.5 h-3.5 ${it.is_active ? "text-emerald-500" : "text-ink-400"}`}
                            />
                          </button>
                          <button
                            className="icon-btn"
                            onClick={() => setEditing(it)}
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                          <button
                            className="icon-btn text-red-500 hover:bg-red-50"
                            onClick={() =>
                              confirm("Delete this intake?") && remove.mutate(it.id)
                            }
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {editing && (
        <IntakeModal
          intake={editing}
          onClose={() => setEditing(null)}
          onSuccess={() => {
            setEditing(null);
            qc.invalidateQueries({ queryKey: ["admin", "intakes"] });
          }}
        />
      )}
    </div>
  );
}

function IntakeModal({
  intake,
  onClose,
  onSuccess,
}: {
  intake: any;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [form, setForm] = useState({
    name: intake.name ?? "",
    start_date: intake.start_date ?? "",
    end_date: intake.end_date ?? "",
    is_active: intake.is_active ?? 0,
  });

  const save = useMutation({
    mutationFn: (d: any) =>
      intake.id ? intakeService.update(intake.id, d) : intakeService.create(d),
    onSuccess: () => {
      toast.success(intake.id ? "Intake updated" : "Intake created");
      onSuccess();
    },
    onError: (e: any) =>
      toast.error(e?.response?.data?.message ?? "Save failed"),
  });

  return (
    <Modal
      open
      onClose={onClose}
      title={intake.id ? "Edit Intake" : "New Intake"}
      footer={
        <>
          <button className="btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button
            className="btn-primary"
            onClick={() => save.mutate(form)}
            disabled={save.isPending}
          >
            {save.isPending && <Loader2 className="w-3.5 h-3.5 animate-spin" />}{" "}
            Save Intake
          </button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="Intake Name">
          <input
            className="input"
            placeholder="e.g. 2026-A"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
          />
        </Field>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Start Date">
            <input
              type="date"
              className="input"
              value={form.start_date}
              onChange={(e) => setForm({ ...form, start_date: e.target.value })}
            />
          </Field>
          <Field label="End Date">
            <input
              type="date"
              className="input"
              value={form.end_date}
              onChange={(e) => setForm({ ...form, end_date: e.target.value })}
            />
          </Field>
        </div>
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            className="w-4 h-4 rounded text-brand focus:ring-brand"
            checked={!!form.is_active}
            onChange={(e) =>
              setForm({ ...form, is_active: e.target.checked ? 1 : 0 })
            }
          />
          <span className="text-[13px] text-ink-700 dark:text-ink-300">
            Set as active intake period
          </span>
        </label>
      </div>
    </Modal>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1">
      <label className="text-[11px] font-bold text-ink-500 uppercase tracking-wider">
        {label}
      </label>
      {children}
    </div>
  );
}
