import React, { useEffect, useRef, useState } from "react";
import { serviceCatalogService, type ServiceDocumentType } from "@/services/serviceCatalogService";
import { rbacService, type PermissionCategory } from "@/services/rbacService";
import type {
  ServiceCatalogAdmin,
  ServiceCatalogStage,
} from "@/types/serviceRequest";
import {
  FileText,
  Plus,
  Edit,
  Ban,
  X,
  Search,
  ListChecks,
  ChevronUp,
  ChevronDown,
  Trash2,
} from "lucide-react";
import toast from "react-hot-toast";
import ModalPortal from "@/components/ui/ModalPortal";

const FALLBACK_PERMISSION_SLUG = "APPROVE_SERVICE_REQUEST_FINAL";

interface CatalogForm {
  code: string;
  name: string;
  slug: string;
  category: string;
  short_description: string;
  full_description: string;
  fee_amount: string;
  fee_currency: string;
  requires_payment: boolean;
  processing_sla_days: string;
  is_active: boolean;
  document_type_id: string;
  stages: ServiceCatalogStage[];
}

const emptyForm = (): CatalogForm => ({
  code: "",
  name: "",
  slug: "",
  category: "",
  short_description: "",
  full_description: "",
  fee_amount: "0",
  fee_currency: "RWF",
  requires_payment: true,
  processing_sla_days: "",
  is_active: true,
  document_type_id: "",
  stages: [
    {
      stage_order: 1,
      stage_key: "final_approval",
      stage_label: "Final Approval",
      required_permission_slug: "APPROVE_SERVICE_REQUEST_FINAL",
      is_final_approval: true,
    },
  ],
});

export default function ServiceCatalogManagementPage() {
  const [services, setServices] = useState<ServiceCatalogAdmin[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingService, setEditingService] =
    useState<ServiceCatalogAdmin | null>(null);
  const [form, setForm] = useState<CatalogForm>(emptyForm());
  const [saving, setSaving] = useState(false);

  // Approval-stage permission choices are RBAC data, not a hardcoded list —
  // any permission in the system can gate a stage, so the number of
  // meaningfully distinct stages is unbounded (not capped at 3).
  const [permissionCategories, setPermissionCategories] = useState<
    PermissionCategory[]
  >([]);
  const allPermissions = permissionCategories.flatMap(
    (c) => c.permissions || [],
  );
  const [documentTypes, setDocumentTypes] = useState<ServiceDocumentType[]>([]);

  const abortController = useRef<AbortController | null>(null);

  useEffect(() => {
    fetchData();
    rbacService
      .getPermissions()
      .then((res) => setPermissionCategories((res.data as any) || []))
      .catch(() => {});
    serviceCatalogService
      .listDocumentTypes()
      .then((res) => setDocumentTypes(res.data || []))
      .catch(() => {});
    return () => abortController.current?.abort();
  }, []);

  const fetchData = async () => {
    if (abortController.current) abortController.current.abort();
    abortController.current = new AbortController();
    setLoading(true);
    try {
      const res = await serviceCatalogService.listAdmin(
        abortController.current.signal,
      );
      setServices((res.data as any) || []);
    } catch (err: any) {
      if (err.name === "CanceledError" || err.name === "AbortError") return;
      toast.error("Failed to load service catalog");
    } finally {
      setLoading(false);
    }
  };

  const openForm = (service?: ServiceCatalogAdmin) => {
    if (service) {
      setEditingService(service);
      setForm({
        code: service.code,
        name: service.name,
        slug: service.slug,
        category: service.category || "",
        short_description: service.short_description || "",
        full_description: service.full_description || "",
        fee_amount: String(service.fee_amount),
        fee_currency: service.fee_currency,
        requires_payment: !!service.requires_payment,
        processing_sla_days:
          service.processing_sla_days != null
            ? String(service.processing_sla_days)
            : "",
        is_active: !!service.is_active,
        document_type_id: service.document_type_id != null ? String(service.document_type_id) : "",
        stages: service.stages.length ? service.stages : emptyForm().stages,
      });
    } else {
      setEditingService(null);
      setForm(emptyForm());
    }
    setIsModalOpen(true);
  };

  const addStage = () => {
    const defaultSlug = allPermissions[0]?.slug ?? FALLBACK_PERMISSION_SLUG;
    setForm((f) => ({
      ...f,
      stages: [
        ...f.stages.map((s) => ({ ...s, is_final_approval: false })),
        {
          stage_order: f.stages.length + 1,
          stage_key: `stage_${f.stages.length + 1}`,
          stage_label: "",
          required_permission_slug: defaultSlug,
          is_final_approval: true,
        },
      ],
    }));
  };

  const removeStage = (index: number) => {
    setForm((f) => {
      const stages = f.stages
        .filter((_, i) => i !== index)
        .map((s, i) => ({ ...s, stage_order: i + 1 }));
      if (stages.length && !stages.some((s) => s.is_final_approval)) {
        stages[stages.length - 1].is_final_approval = true;
      }
      return { ...f, stages };
    });
  };

  const moveStage = (index: number, direction: -1 | 1) => {
    setForm((f) => {
      const target = index + direction;
      if (target < 0 || target >= f.stages.length) return f;
      const stages = [...f.stages];
      [stages[index], stages[target]] = [stages[target], stages[index]];
      return {
        ...f,
        stages: stages.map((s, i) => ({ ...s, stage_order: i + 1 })),
      };
    });
  };

  const updateStage = (index: number, patch: Partial<ServiceCatalogStage>) => {
    setForm((f) => ({
      ...f,
      stages: f.stages.map((s, i) => {
        if (i !== index) {
          return patch.is_final_approval
            ? { ...s, is_final_approval: false }
            : s;
        }
        return { ...s, ...patch };
      }),
    }));
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.stages.length) {
      toast.error("At least one approval stage is required.");
      return;
    }
    setSaving(true);
    try {
      const payload = {
        code: form.code,
        name: form.name,
        slug: form.slug,
        category: form.category || null,
        short_description: form.short_description || null,
        full_description: form.full_description || null,
        fee_amount: Number(form.fee_amount) || 0,
        fee_currency: form.fee_currency,
        requires_payment: form.requires_payment,
        processing_sla_days: form.processing_sla_days
          ? Number(form.processing_sla_days)
          : null,
        is_active: form.is_active,
        document_type_id: form.document_type_id ? Number(form.document_type_id) : null,
        stages: form.stages,
      };

      if (editingService) {
        await serviceCatalogService.update(editingService.id, payload);
        toast.success("Service updated successfully.");
      } else {
        await serviceCatalogService.create(payload);
        toast.success("Service created successfully.");
      }
      setIsModalOpen(false);
      fetchData();
    } catch (err: any) {
      toast.error(err.response?.data?.message || "Failed to save service.");
    } finally {
      setSaving(false);
    }
  };

  const handleDeactivate = async (service: ServiceCatalogAdmin) => {
    if (
      !window.confirm(
        `Deactivate "${service.name}"? It will disappear from the public catalog.`,
      )
    )
      return;
    try {
      await serviceCatalogService.deactivate(service.id);
      toast.success("Service deactivated.");
      fetchData();
    } catch (err: any) {
      toast.error(
        err.response?.data?.message || "Failed to deactivate service.",
      );
    }
  };

  const filteredServices = services.filter(
    (s) =>
      s.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      s.code.toLowerCase().includes(searchQuery.toLowerCase()),
  );

  return (
    <div className="space-y-6 p-4 md:p-6">
      <div className="flex flex-col xl:flex-row items-start xl:items-center justify-between gap-6">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 rounded-2xl bg-primary-50 dark:bg-primary-900/20 flex items-center justify-center">
            <FileText className="w-7 h-7 text-primary-600" />
          </div>
          <div>
            <h1 className="text-2xl font-black text-gray-900 dark:text-white">
              Service Catalog
            </h1>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Configure public service requests and their approval chains.
            </p>
          </div>
        </div>
      </div>

      <div className="flex flex-col md:flex-row items-center justify-between gap-4 bg-white/50 dark:bg-gray-900/60 backdrop-blur-md p-4 rounded-3xl border border-white/20 dark:border-gray-800/60">
        <div className="relative w-full md:w-80 group">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            placeholder="Search services by name or code..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-11 pr-4 py-3 bg-gray-100 dark:bg-gray-900 border-transparent focus:bg-white dark:focus:bg-gray-800 focus:ring-2 focus:ring-primary-500/20 rounded-2xl text-sm transition-all outline-none font-medium"
          />
        </div>
        <button
          onClick={() => openForm()}
          className="flex items-center justify-center gap-2 px-5 py-2.5 bg-primary-600 hover:bg-primary-700 text-white rounded-xl transition-all duration-300 font-bold text-sm"
        >
          <Plus className="w-4 h-4" />
          <span>Add Service</span>
        </button>
      </div>

      <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100 dark:border-gray-800 text-left text-[11px] font-bold text-gray-400 uppercase tracking-widest">
              <th className="px-5 py-3">Service</th>
              <th className="px-5 py-3">Fee</th>
              <th className="px-5 py-3">Stages</th>
              <th className="px-5 py-3">Requests</th>
              <th className="px-5 py-3">Status</th>
              <th className="px-5 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td colSpan={6} className="px-5 py-8 text-center text-gray-400">
                  Loading...
                </td>
              </tr>
            )}
            {!loading && filteredServices.length === 0 && (
              <tr>
                <td colSpan={6} className="px-5 py-8 text-center text-gray-400">
                  No services found.
                </td>
              </tr>
            )}
            {filteredServices.map((service) => (
              <tr
                key={service.id}
                className="border-b border-gray-50 dark:border-gray-800/60"
              >
                <td className="px-5 py-3">
                  <div className="font-bold text-gray-900 dark:text-white">
                    {service.name}
                  </div>
                  <div className="text-xs text-gray-400">
                    {service.code} &middot; /{service.slug}
                  </div>
                </td>
                <td className="px-5 py-3">
                  {service.requires_payment
                    ? `${service.fee_amount} ${service.fee_currency}`
                    : "Free"}
                </td>
                <td className="px-5 py-3">
                  <span className="inline-flex items-center gap-1 text-gray-600 dark:text-gray-300">
                    <ListChecks className="w-3.5 h-3.5" />{" "}
                    {service.stages.length}
                  </span>
                </td>
                <td className="px-5 py-3">{service.request_count ?? 0}</td>
                <td className="px-5 py-3">
                  <span
                    className={`px-2.5 py-1 rounded-full text-[11px] font-bold ${
                      service.is_active
                        ? "bg-green-50 text-green-700 dark:bg-green-900/20 dark:text-green-400"
                        : "bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400"
                    }`}
                  >
                    {service.is_active ? "Active" : "Inactive"}
                  </span>
                </td>
                <td className="px-5 py-3 text-right">
                  <div className="flex items-center justify-end gap-2">
                    <button
                      onClick={() => openForm(service)}
                      className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-500"
                      title="Edit"
                    >
                      <Edit className="w-4 h-4" />
                    </button>
                    {!!service.is_active && (
                      <button
                        onClick={() => handleDeactivate(service)}
                        className="p-2 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 text-red-500"
                        title="Deactivate"
                      >
                        <Ban className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {isModalOpen && (
        <ModalPortal>
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
            <div className="bg-white dark:bg-gray-900 rounded-3xl w-full max-w-5xl max-h-[90vh] overflow-y-auto p-6 space-y-5">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-black text-gray-900 dark:text-white">
                  {editingService ? "Edit Service" : "Add Service"}
                </h2>
                <button
                  onClick={() => setIsModalOpen(false)}
                  className="p-1 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <form onSubmit={handleSave} className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-bold text-gray-500">
                      Code
                    </label>
                    <input
                      required
                      value={form.code}
                      onChange={(e) =>
                        setForm({ ...form, code: e.target.value.toUpperCase() })
                      }
                      className="w-full mt-1 px-3 py-2 rounded-xl bg-gray-100 dark:bg-gray-800 outline-none text-sm"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-bold text-gray-500">
                      Slug
                    </label>
                    <input
                      required
                      value={form.slug}
                      onChange={(e) =>
                        setForm({ ...form, slug: e.target.value })
                      }
                      className="w-full mt-1 px-3 py-2 rounded-xl bg-gray-100 dark:bg-gray-800 outline-none text-sm"
                    />
                  </div>
                </div>

                <div>
                  <label className="text-xs font-bold text-gray-500">
                    Name
                  </label>
                  <input
                    required
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    className="w-full mt-1 px-3 py-2 rounded-xl bg-gray-100 dark:bg-gray-800 outline-none text-sm"
                  />
                </div>

                <div>
                  <label className="text-xs font-bold text-gray-500">
                    Short description
                  </label>
                  <input
                    value={form.short_description}
                    onChange={(e) =>
                      setForm({ ...form, short_description: e.target.value })
                    }
                    className="w-full mt-1 px-3 py-2 rounded-xl bg-gray-100 dark:bg-gray-800 outline-none text-sm"
                  />
                </div>

                <div>
                  <label className="text-xs font-bold text-gray-500">
                    Full description
                  </label>
                  <textarea
                    rows={3}
                    value={form.full_description}
                    onChange={(e) =>
                      setForm({ ...form, full_description: e.target.value })
                    }
                    className="w-full mt-1 px-3 py-2 rounded-xl bg-gray-100 dark:bg-gray-800 outline-none text-sm"
                  />
                </div>

                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className="text-xs font-bold text-gray-500">
                      Fee amount
                    </label>
                    <input
                      type="number"
                      min={0}
                      value={form.fee_amount}
                      onChange={(e) =>
                        setForm({ ...form, fee_amount: e.target.value })
                      }
                      className="w-full mt-1 px-3 py-2 rounded-xl bg-gray-100 dark:bg-gray-800 outline-none text-sm"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-bold text-gray-500">
                      Currency
                    </label>
                    <input
                      value={form.fee_currency}
                      onChange={(e) =>
                        setForm({ ...form, fee_currency: e.target.value })
                      }
                      className="w-full mt-1 px-3 py-2 rounded-xl bg-gray-100 dark:bg-gray-800 outline-none text-sm"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-bold text-gray-500">
                      SLA (days)
                    </label>
                    <input
                      type="number"
                      min={0}
                      value={form.processing_sla_days}
                      onChange={(e) =>
                        setForm({
                          ...form,
                          processing_sla_days: e.target.value,
                        })
                      }
                      className="w-full mt-1 px-3 py-2 rounded-xl bg-gray-100 dark:bg-gray-800 outline-none text-sm"
                    />
                  </div>
                </div>

                <div>
                  <label className="text-xs font-bold text-gray-500">
                    Generates document
                  </label>
                  <select
                    value={form.document_type_id}
                    onChange={(e) =>
                      setForm({ ...form, document_type_id: e.target.value })
                    }
                    className="w-full mt-1 px-3 py-2 rounded-xl bg-gray-100 dark:bg-gray-800 outline-none text-sm"
                  >
                    <option value="">Generic Service Letter (default)</option>
                    {documentTypes
                      .filter((dt) => dt.key !== "generic_service_letter")
                      .map((dt) => (
                        <option key={dt.id} value={dt.id}>
                          {dt.name}
                        </option>
                      ))}
                  </select>
                  <p className="text-[11px] text-gray-400 mt-1">
                    What gets generated once this request is fully approved and paid. Specific document types (visa letter, degree certificate, etc.) require the requester to have a linked student profile — otherwise the generic letter is used automatically.
                  </p>
                </div>

                <label className="flex items-center gap-2 text-sm font-medium text-gray-700 dark:text-gray-300">
                  <input
                    type="checkbox"
                    checked={form.requires_payment}
                    onChange={(e) =>
                      setForm({ ...form, requires_payment: e.target.checked })
                    }
                  />
                  Requires payment before document is downloadable
                </label>

                <label className="flex items-center gap-2 text-sm font-medium text-gray-700 dark:text-gray-300">
                  <input
                    type="checkbox"
                    checked={form.is_active}
                    onChange={(e) =>
                      setForm({ ...form, is_active: e.target.checked })
                    }
                  />
                  Active (visible on public catalog)
                </label>

                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-bold text-gray-500 uppercase tracking-widest">
                      Approval Stages
                    </label>
                    <button
                      type="button"
                      onClick={addStage}
                      className="text-xs font-bold text-primary-600 flex items-center gap-1"
                    >
                      <Plus className="w-3.5 h-3.5" /> Add Stage
                    </button>
                  </div>

                  {form.stages.map((stage, i) => {
                    const currentSlugKnown = allPermissions.some(
                      (p) => p.slug === stage.required_permission_slug,
                    );
                    return (
                      <div
                        key={i}
                        className="flex items-center gap-2 bg-gray-50 dark:bg-gray-800/60 rounded-xl p-2"
                      >
                        <div className="flex flex-col shrink-0">
                          <button
                            type="button"
                            onClick={() => moveStage(i, -1)}
                            disabled={i === 0}
                            title="Move up"
                            className="text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 disabled:opacity-25 disabled:cursor-not-allowed"
                          >
                            <ChevronUp className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => moveStage(i, 1)}
                            disabled={i === form.stages.length - 1}
                            title="Move down"
                            className="text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 disabled:opacity-25 disabled:cursor-not-allowed"
                          >
                            <ChevronDown className="w-3.5 h-3.5" />
                          </button>
                        </div>
                        <span className="text-xs font-bold text-gray-400 w-5 shrink-0">
                          {stage.stage_order}
                        </span>
                        <input
                          placeholder="Stage label"
                          required
                          value={stage.stage_label}
                          onChange={(e) =>
                            updateStage(i, { stage_label: e.target.value })
                          }
                          className="flex-1 min-w-0 px-2 py-1.5 rounded-lg bg-white dark:bg-gray-900 outline-none text-xs"
                        />
                        <select
                          value={stage.required_permission_slug}
                          onChange={(e) =>
                            updateStage(i, {
                              required_permission_slug: e.target.value,
                            })
                          }
                          className="px-2 py-1.5 rounded-lg bg-white dark:bg-gray-900 outline-none text-xs max-w-[200px]"
                        >
                          {!currentSlugKnown && (
                            <option value={stage.required_permission_slug}>
                              {stage.required_permission_slug}
                            </option>
                          )}
                          {permissionCategories.map((cat) => (
                            <optgroup key={cat.id} label={cat.name}>
                              {(cat.permissions || []).map((p) => (
                                <option key={p.slug} value={p.slug}>
                                  {p.name}
                                </option>
                              ))}
                            </optgroup>
                          ))}
                        </select>
                        <label className="flex items-center gap-1 text-[11px] font-bold text-gray-500 shrink-0">
                          <input
                            type="checkbox"
                            checked={!!stage.is_final_approval}
                            onChange={(e) =>
                              updateStage(i, {
                                is_final_approval: e.target.checked,
                              })
                            }
                          />
                          Final
                        </label>
                        {form.stages.length > 1 && (
                          <button
                            type="button"
                            onClick={() => removeStage(i)}
                            className="text-red-500 shrink-0"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>

                <div className="flex items-center justify-end gap-3 pt-2">
                  <button
                    type="button"
                    onClick={() => setIsModalOpen(false)}
                    className="px-4 py-2 rounded-xl text-sm font-bold text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={saving}
                    className="px-5 py-2 rounded-xl bg-primary-600 hover:bg-primary-700 text-white text-sm font-bold disabled:opacity-50"
                  >
                    {saving
                      ? "Saving..."
                      : editingService
                        ? "Save Changes"
                        : "Create Service"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </ModalPortal>
      )}
    </div>
  );
}
