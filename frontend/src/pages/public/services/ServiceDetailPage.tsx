import { useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { useQuery, useMutation } from "@tanstack/react-query";
import toast from "react-hot-toast";
import { ArrowLeft, CheckCircle2, Clock, FileUp, Loader2 } from "lucide-react";
import { serviceCatalogService } from "@/services/serviceCatalogService";
import { serviceRequestService } from "@/services/serviceRequestService";
import { useAuthStore } from "@/store/authStore";
import Modal from "@/components/ui/Modal";
import ApplicantAuthGate from "@/pages/public/ApplicantAuthGate";
import { Shell } from "./ServiceCatalogPage";

export default function ServiceDetailPage() {
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();
  const { isAuthenticated } = useAuthStore();

  const [showAuthModal, setShowAuthModal] = useState(false);
  const [showFormModal, setShowFormModal] = useState(false);
  const [notes, setNotes] = useState("");
  const [files, setFiles] = useState<Record<string, File>>({});

  const detailQ = useQuery({
    queryKey: ["services", "public", "detail", slug],
    queryFn: ({ signal }) => serviceCatalogService.getPublicDetail(slug!, signal),
    enabled: !!slug,
  });

  const service = detailQ.data?.data;

  const submitM = useMutation({
    mutationFn: () => {
      const fields: Record<string, string> = {};
      if (notes) fields.notes = notes;
      return serviceRequestService.submit(slug!, fields, files);
    },
    onSuccess: (res) => {
      toast.success(`Request submitted! Your tracking code is ${res.data?.request_code}.`);
      setShowFormModal(false);
      navigate("/my/service-requests");
    },
    onError: (e: any) => toast.error(e.response?.data?.message || "Failed to submit request."),
  });

  const handleApplyClick = () => {
    if (!isAuthenticated) {
      setShowAuthModal(true);
      return;
    }
    setShowFormModal(true);
  };

  if (detailQ.isLoading) {
    return (
      <Shell>
        <p className="text-center text-ink-400 py-20">Loading...</p>
      </Shell>
    );
  }

  if (!service) {
    return (
      <Shell>
        <div className="text-center py-20 space-y-4">
          <p className="text-ink-500">Service not found or is no longer available.</p>
          <Link to="/services" className="btn-secondary inline-flex">
            <ArrowLeft className="w-4 h-4" /> Back to catalog
          </Link>
        </div>
      </Shell>
    );
  }

  const missingRequired = service.required_attachments.filter((a) => a.required && !files[a.key]);

  return (
    <Shell>
      <div className="max-w-3xl mx-auto space-y-6">
        <Link to="/services" className="inline-flex items-center gap-1.5 text-[13px] text-ink-500 hover:text-brand">
          <ArrowLeft className="w-4 h-4" /> Back to catalog
        </Link>

        <div className="card p-6 sm:p-8 space-y-6">
          <div>
            {service.category && (
              <p className="text-[11px] uppercase tracking-wide text-ink-400 font-semibold">{service.category}</p>
            )}
            <h1 className="text-2xl font-bold text-ink-900 dark:text-white mt-1">{service.name}</h1>
            <p className="text-[14px] text-ink-500 dark:text-ink-400 mt-2 leading-relaxed">
              {service.full_description}
            </p>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
            <Stat label="Fee" value={service.requires_payment ? `${service.fee_amount.toLocaleString()} ${service.fee_currency}` : "Free"} />
            <Stat label="Processing Time" value={service.processing_sla_days ? `${service.processing_sla_days} day(s)` : "N/A"} />
            <Stat label="Approval Stages" value={String(service.stage_count)} />
          </div>

          {service.requirements.length > 0 && (
            <div>
              <h3 className="text-[13px] font-bold text-ink-700 dark:text-ink-200 uppercase tracking-wide mb-2">
                Requirements
              </h3>
              <ul className="space-y-1.5">
                {service.requirements.map((r, i) => (
                  <li key={i} className="flex items-start gap-2 text-[13.5px] text-ink-600 dark:text-ink-300">
                    <CheckCircle2 className="w-4 h-4 text-emerald-500 mt-0.5 shrink-0" /> {r}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {service.required_attachments.length > 0 && (
            <div>
              <h3 className="text-[13px] font-bold text-ink-700 dark:text-ink-200 uppercase tracking-wide mb-2">
                Required Attachments
              </h3>
              <ul className="space-y-1.5">
                {service.required_attachments.map((a) => (
                  <li key={a.key} className="flex items-start gap-2 text-[13.5px] text-ink-600 dark:text-ink-300">
                    <FileUp className="w-4 h-4 text-ink-400 mt-0.5 shrink-0" />
                    {a.label} {a.required && <span className="text-red-500">*</span>}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {service.stages.length > 0 && (
            <div>
              <h3 className="text-[13px] font-bold text-ink-700 dark:text-ink-200 uppercase tracking-wide mb-2">
                Approval Process
              </h3>
              <ol className="space-y-2">
                {service.stages.map((s) => (
                  <li key={s.stage_order} className="flex items-center gap-3 text-[13.5px] text-ink-600 dark:text-ink-300">
                    <span className="w-6 h-6 rounded-full bg-brand/10 text-brand text-[11px] font-bold flex items-center justify-center shrink-0">
                      {s.stage_order}
                    </span>
                    {s.stage_label}
                  </li>
                ))}
                {service.requires_payment && (
                  <li className="flex items-center gap-3 text-[13.5px] text-ink-600 dark:text-ink-300">
                    <span className="w-6 h-6 rounded-full bg-brand/10 text-brand text-[11px] font-bold flex items-center justify-center shrink-0">
                      {service.stages.length + 1}
                    </span>
                    Payment
                  </li>
                )}
              </ol>
            </div>
          )}

          <div className="flex items-center gap-2 text-[12.5px] text-ink-400">
            <Clock className="w-3.5 h-3.5" /> Approve-then-pay: your document is generated and downloadable only after all approval stages are complete and payment is confirmed.
          </div>

          <button onClick={handleApplyClick} className="btn-primary w-full justify-center">
            Apply for this service
          </button>
        </div>
      </div>

      <Modal open={showAuthModal} onClose={() => setShowAuthModal(false)} title="">
        <ApplicantAuthGate onSuccess={() => { setShowAuthModal(false); setShowFormModal(true); }} />
      </Modal>

      <Modal open={showFormModal} onClose={() => setShowFormModal(false)} title={`Apply — ${service.name}`} size="lg">
        <div className="space-y-4">
          <div>
            <label className="text-[13px] font-medium text-ink-700 dark:text-ink-200">
              Additional notes (optional)
            </label>
            <textarea
              rows={3}
              className="input mt-1"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="e.g. purpose of this request"
            />
          </div>

          {service.required_attachments.map((a) => (
            <div key={a.key}>
              <label className="text-[13px] font-medium text-ink-700 dark:text-ink-200">
                {a.label} {a.required && <span className="text-red-500">*</span>}
              </label>
              <input
                type="file"
                className="input mt-1"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  setFiles((prev) => {
                    const next = { ...prev };
                    if (file) next[a.key] = file;
                    else delete next[a.key];
                    return next;
                  });
                }}
              />
            </div>
          ))}

          <button
            onClick={() => submitM.mutate()}
            disabled={submitM.isPending || missingRequired.length > 0}
            className="btn-primary w-full justify-center"
          >
            {submitM.isPending ? (
              <><Loader2 className="w-4 h-4 animate-spin" /> Submitting...</>
            ) : (
              "Submit Request"
            )}
          </button>
        </div>
      </Modal>
    </Shell>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-slate-50 dark:bg-ink-800/60 p-3 text-center">
      <p className="text-[10px] uppercase tracking-wide text-ink-400 font-bold">{label}</p>
      <p className="text-[14px] font-bold text-ink-900 dark:text-white mt-0.5">{value}</p>
    </div>
  );
}
