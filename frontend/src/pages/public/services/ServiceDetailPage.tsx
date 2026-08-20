import { useEffect, useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import toast from "react-hot-toast";
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Clock,
  Copy,
  CreditCard,
  Download,
  ExternalLink,
  FileUp,
  Loader2,
  PartyPopper,
} from "lucide-react";
import { serviceCatalogService } from "@/services/serviceCatalogService";
import { serviceRequestService } from "@/services/serviceRequestService";
import { useAuthStore, useAuthHydrated } from "@/store/authStore";
import Modal from "@/components/ui/Modal";
import ApplicantAuthGate from "@/pages/public/ApplicantAuthGate";
import FileDropzone from "@/components/service-requests/FileDropzone";
import ApplyWizardSteps, { type WizardStepKey } from "@/components/service-requests/ApplyWizardSteps";
import { Shell } from "./ServiceCatalogPage";

const NOTES_MAX = 500;
const persistKey = (slug: string) => `service_apply:${slug}`;

export default function ServiceDetailPage() {
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();
  const { isAuthenticated } = useAuthStore();
  const authHydrated = useAuthHydrated();
  const queryClient = useQueryClient();

  const [showWizard, setShowWizard] = useState(false);
  const [step, setStep] = useState<WizardStepKey>("review");
  const [notes, setNotes] = useState("");
  const [files, setFiles] = useState<Record<string, File>>({});
  const [submittedCode, setSubmittedCode] = useState<string | null>(null);
  const [pendingRequestId, setPendingRequestId] = useState<number | null>(null);
  const [autoPrompted, setAutoPrompted] = useState(false);

  const detailQ = useQuery({
    queryKey: ["services", "public", "detail", slug],
    queryFn: ({ signal }) => serviceCatalogService.getPublicDetail(slug!, signal),
    enabled: !!slug,
  });

  const service = detailQ.data?.data;

  // An authenticated applicant may already have an unpaid request for this exact
  // service (created earlier, payment abandoned). Check "my requests" so we can
  // resume payment on it instead of ever starting a duplicate application.
  const myRequestsQ = useQuery({
    queryKey: ["service-requests", "mine"],
    queryFn: ({ signal }) => serviceRequestService.myRequests(signal),
    enabled: isAuthenticated,
  });
  const pendingPayment = myRequestsQ.data?.data?.find(
    (r) => r.service_slug === slug && (r.status === "draft" || r.status === "awaiting_payment"),
  );
  // Most recent finished request for this service with a document actually
  // ready — so revisiting a service you've already been approved for offers
  // the download right here instead of only surfacing it via email/My Requests.
  const readyForDownload = myRequestsQ.data?.data?.find(
    (r) => r.service_slug === slug && (r.status === "paid" || r.status === "completed") && r.download_token,
  );

  // "Settled" means we can trust pendingPayment either way: either there's
  // nothing to check (guest), or the "mine" query has actually completed at
  // least one attempt. `isFetched` (unlike `isLoading`, which in v5 only
  // reflects an *active* fetch) stays reliably false until that has happened,
  // even across a disabled→enabled flip right after auth hydration finishes.
  const authCheckSettled = authHydrated && (!isAuthenticated || myRequestsQ.isFetched);

  // On landing on this service's page, resume whatever's unfinished: an unpaid
  // request found on the server takes priority (it's real, submitted, billable
  // work), otherwise fall back to a wizard step interrupted mid-form.
  useEffect(() => {
    if (!slug || autoPrompted || !authCheckSettled) return;

    if (pendingPayment) {
      setPendingRequestId(pendingPayment.id);
      setSubmittedCode(pendingPayment.request_code);
      setStep("payment");
      setShowWizard(true);
      setAutoPrompted(true);
      return;
    }

    try {
      const raw = sessionStorage.getItem(persistKey(slug));
      if (raw) {
        const saved = JSON.parse(raw) as { step: WizardStepKey; notes: string };
        if (saved.step && saved.step !== "success" && saved.step !== "payment") {
          setStep(saved.step);
          setNotes(saved.notes ?? "");
          setShowWizard(true);
        }
      }
    } catch { /* corrupt/unavailable storage — ignore */ }
    setAutoPrompted(true);
  }, [slug, autoPrompted, authCheckSettled, pendingPayment]);

  useEffect(() => {
    if (!slug || !showWizard || step === "success" || step === "payment") return;
    try {
      sessionStorage.setItem(persistKey(slug), JSON.stringify({ step, notes }));
    } catch { /* quota / private mode — ignore */ }
  }, [slug, showWizard, step, notes]);

  const clearPersisted = () => {
    if (slug) {
      try { sessionStorage.removeItem(persistKey(slug)); } catch { /* ignore */ }
    }
  };

  const submitM = useMutation({
    mutationFn: () => {
      const fields: Record<string, string> = {};
      if (notes) fields.notes = notes;
      return serviceRequestService.submit(slug!, fields, files);
    },
    onSuccess: (res) => {
      const code = res.data?.request_code ?? null;
      setSubmittedCode(code);
      clearPersisted();
      if (res.data?.status === "awaiting_payment") {
        setPendingRequestId(res.data.id);
        setStep("payment");
        toast.success("Request received — payment is required to start processing.");
      } else {
        setStep("success");
        toast.success("Request submitted successfully!");
      }
    },
    onError: (e: any) => toast.error(e.response?.data?.message || "Failed to submit request."),
  });

  const checkoutM = useMutation({
    mutationFn: (id: number) => serviceRequestService.getCheckoutLink(id),
    onSuccess: (res) => {
      const url = res.data?.checkout_url;
      if (url) window.open(url, "_blank", "noopener,noreferrer");
    },
    onError: (e: any) => toast.error(e.response?.data?.message || "Failed to generate checkout link."),
  });

  const downloadM = useMutation({
    mutationFn: () =>
      serviceRequestService.download(readyForDownload!.id, readyForDownload!.download_token!, readyForDownload!.request_code),
    onError: (e: any) => toast.error(e.response?.data?.message || "Failed to download document."),
  });

  // While the payment step is open, poll for the UrubutoPay webhook confirming
  // payment so the applicant sees it land without needing to refresh manually.
  // Stops polling itself the instant it's confirmed — no point hammering the
  // API for a status that can only ever be terminal from here on.
  const progressQ = useQuery({
    queryKey: ["services", "public", "progress", pendingRequestId],
    queryFn: ({ signal }) => serviceRequestService.getProgress(pendingRequestId!, signal),
    enabled: step === "payment" && !!pendingRequestId,
    refetchInterval: (query) => {
      const status = query.state.data?.data?.status;
      return status && status !== "awaiting_payment" && status !== "draft" ? false : 4000;
    },
  });
  const paymentConfirmed = progressQ.data?.data?.status && progressQ.data.data.status !== "awaiting_payment" && progressQ.data.data.status !== "draft";

  // The instant payment lands, this is no longer a decision the applicant is
  // waiting on — auto-dismiss the modal and refresh "my requests" so the CTA
  // on this page reverts from "Complete Payment" back to normal on its own,
  // instead of leaving them staring at a stale popup they have to close manually.
  useEffect(() => {
    if (!paymentConfirmed) return;
    const timer = setTimeout(() => {
      setShowWizard(false);
      queryClient.invalidateQueries({ queryKey: ["service-requests", "mine"] });
    }, 2200);
    return () => clearTimeout(timer);
  }, [paymentConfirmed, queryClient]);

  const openWizard = () => {
    if (pendingPayment) {
      setPendingRequestId(pendingPayment.id);
      setSubmittedCode(pendingPayment.request_code);
      setStep("payment");
      setShowWizard(true);
      return;
    }
    setStep(isAuthenticated ? "form" : "review");
    setShowWizard(true);
  };

  const closeWizard = () => {
    setShowWizard(false);
  };

  const startOver = () => {
    setNotes("");
    setFiles({});
    setSubmittedCode(null);
    setPendingRequestId(null);
    setStep("review");
    clearPersisted();
    setShowWizard(false);
  };

  if (detailQ.isLoading) {
    return (
      <Shell>
        <div className="max-w-3xl mx-auto space-y-6 animate-pulse">
          <div className="h-4 w-24 rounded bg-ink-100 dark:bg-ink-700" />
          <div className="card p-6 sm:p-8 space-y-6">
            <div className="space-y-2">
              <div className="h-3 w-20 rounded bg-ink-100 dark:bg-ink-700" />
              <div className="h-7 w-2/3 rounded bg-ink-100 dark:bg-ink-700" />
              <div className="h-4 w-full rounded bg-ink-100 dark:bg-ink-700" />
            </div>
            <div className="grid grid-cols-3 gap-4">
              {[0, 1, 2].map((i) => <div key={i} className="h-16 rounded-xl bg-ink-100 dark:bg-ink-700" />)}
            </div>
          </div>
        </div>
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
  const canContinueForm = missingRequired.length === 0;

  return (
    <Shell>
      <div className="max-w-5xl mx-auto space-y-6">
        <Link to="/services" className="inline-flex items-center gap-1.5 text-[13px] text-ink-500 hover:text-brand">
          <ArrowLeft className="w-4 h-4" /> Back to catalog
        </Link>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
          <div className="lg:col-span-2 card p-6 sm:p-8 space-y-6">
            <div>
              {service.category && (
                <p className="text-[11px] uppercase tracking-wide text-ink-400 font-semibold">{service.category}</p>
              )}
              <h1 className="text-2xl font-bold text-ink-900 dark:text-white mt-1">{service.name}</h1>
              <p className="text-[14px] text-ink-500 dark:text-ink-400 mt-2 leading-relaxed">
                {service.full_description}
              </p>
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
                  {service.requires_payment && (
                    <li className="flex items-center gap-3 text-[13.5px] text-ink-600 dark:text-ink-300">
                      <span className="w-6 h-6 rounded-full bg-brand/10 text-brand text-[11px] font-bold flex items-center justify-center shrink-0">
                        1
                      </span>
                      Payment
                    </li>
                  )}
                  {service.stages.map((s) => (
                    <li key={s.stage_order} className="flex items-center gap-3 text-[13.5px] text-ink-600 dark:text-ink-300">
                      <span className="w-6 h-6 rounded-full bg-brand/10 text-brand text-[11px] font-bold flex items-center justify-center shrink-0">
                        {(service.requires_payment ? 1 : 0) + s.stage_order}
                      </span>
                      {s.stage_label}
                    </li>
                  ))}
                </ol>
              </div>
            )}

            <div className="flex items-center gap-2 text-[12.5px] text-ink-400 border-t border-ink-100 dark:border-ink-800 pt-4">
              <Clock className="w-3.5 h-3.5 shrink-0" />
              {service.requires_payment
                ? "Pay first, then we review: payment is required right after you submit, before your request enters the approval queue."
                : "Your document is generated and downloadable as soon as all approval stages are complete."}
            </div>
          </div>

          <div className="lg:sticky lg:top-24 card p-5 space-y-4">
            <Stat label="Fee" value={service.requires_payment ? `${service.fee_amount.toLocaleString()} ${service.fee_currency}` : "Free"} />
            <Stat label="Processing Time" value={service.processing_sla_days ? `${service.processing_sla_days} day(s)` : "N/A"} />
            <Stat label="Approval Stages" value={String(service.stage_count)} />
            <button onClick={openWizard} className="btn-primary w-full justify-center">
              {pendingPayment ? (
                <><CreditCard className="w-4 h-4" /> Complete Payment</>
              ) : (
                <>Apply for this service <ArrowRight className="w-4 h-4" /></>
              )}
            </button>
            {pendingPayment && (
              <p className="text-[11px] text-center text-amber-600 dark:text-amber-400">
                You have an unpaid request ({pendingPayment.request_code}) for this service.
              </p>
            )}

            {readyForDownload && (
              <div className="rounded-xl bg-emerald-50 dark:bg-emerald-900/20 p-3 space-y-2">
                <p className="text-[11.5px] text-emerald-700 dark:text-emerald-400 text-center">
                  Your document for <span className="font-mono font-semibold">{readyForDownload.request_code}</span> is ready.
                </p>
                <button
                  onClick={() => downloadM.mutate()}
                  disabled={downloadM.isPending}
                  className="btn-secondary w-full justify-center !bg-white dark:!bg-ink-800"
                >
                  {downloadM.isPending ? (
                    <><Loader2 className="w-4 h-4 animate-spin" /> Preparing...</>
                  ) : (
                    <><Download className="w-4 h-4" /> Download Document</>
                  )}
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      <Modal
        open={showWizard}
        onClose={closeWizard}
        title={step === "success" || step === "payment" ? "" : `Apply — ${service.name}`}
        size="lg"
      >
        <div className="space-y-6">
          {step !== "success" && (
            <ApplyWizardSteps current={step} skipAuth={isAuthenticated} includePayment={service.requires_payment} />
          )}

          {step === "review" && (
            <div className="space-y-4">
              <p className="text-[13.5px] text-ink-500 dark:text-ink-400">
                Here's what you'll need before you start:
              </p>
              {service.requirements.length > 0 && (
                <ul className="space-y-1.5">
                  {service.requirements.map((r, i) => (
                    <li key={i} className="flex items-start gap-2 text-[13.5px] text-ink-600 dark:text-ink-300">
                      <CheckCircle2 className="w-4 h-4 text-emerald-500 mt-0.5 shrink-0" /> {r}
                    </li>
                  ))}
                </ul>
              )}
              {service.required_attachments.length > 0 && (
                <ul className="space-y-1.5">
                  {service.required_attachments.map((a) => (
                    <li key={a.key} className="flex items-start gap-2 text-[13.5px] text-ink-600 dark:text-ink-300">
                      <FileUp className="w-4 h-4 text-ink-400 mt-0.5 shrink-0" />
                      {a.label} {a.required && <span className="text-red-500">*</span>}
                    </li>
                  ))}
                </ul>
              )}
              <button
                onClick={() => setStep(isAuthenticated ? "form" : "auth")}
                className="btn-primary w-full justify-center"
              >
                Continue <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          )}

          {step === "auth" && (
            <ApplicantAuthGate onSuccess={() => setStep("form")} />
          )}

          {step === "form" && (
            <div className="space-y-4">
              <div>
                <div className="flex items-center justify-between">
                  <label className="text-[13px] font-medium text-ink-700 dark:text-ink-200">
                    Additional notes (optional)
                  </label>
                  <span className="text-[11px] text-ink-400">{notes.length}/{NOTES_MAX}</span>
                </div>
                <textarea
                  rows={3}
                  maxLength={NOTES_MAX}
                  className="input mt-1"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="e.g. purpose of this request"
                />
              </div>

              {service.required_attachments.map((a) => (
                <FileDropzone
                  key={a.key}
                  attachment={a}
                  file={files[a.key]}
                  onChange={(file) => {
                    setFiles((prev) => {
                      const next = { ...prev };
                      if (file) next[a.key] = file;
                      else delete next[a.key];
                      return next;
                    });
                  }}
                />
              ))}

              <button
                onClick={() => setStep("confirm")}
                disabled={!canContinueForm}
                className="btn-primary w-full justify-center"
              >
                Continue to review <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          )}

          {step === "confirm" && (
            <div className="space-y-4">
              <div className="rounded-xl bg-slate-50 dark:bg-ink-800/60 p-4 space-y-3 text-[13.5px]">
                <div className="flex justify-between">
                  <span className="text-ink-400">Service</span>
                  <span className="font-medium text-ink-900 dark:text-white">{service.name}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-ink-400">Fee</span>
                  <span className="font-medium text-ink-900 dark:text-white">
                    {service.requires_payment ? `${service.fee_amount.toLocaleString()} ${service.fee_currency}` : "Free"}
                  </span>
                </div>
                {notes && (
                  <div>
                    <span className="text-ink-400 block mb-1">Notes</span>
                    <p className="text-ink-700 dark:text-ink-200">{notes}</p>
                  </div>
                )}
                {service.required_attachments.length > 0 && (
                  <div>
                    <span className="text-ink-400 block mb-1">Attachments</span>
                    <ul className="space-y-1">
                      {service.required_attachments.map((a) => (
                        <li key={a.key} className="flex items-center gap-2 text-ink-700 dark:text-ink-200">
                          <CheckCircle2 className={`w-3.5 h-3.5 shrink-0 ${files[a.key] ? "text-emerald-500" : "text-ink-300"}`} />
                          {a.label}{files[a.key] ? `: ${files[a.key].name}` : a.required ? " (missing)" : " (not attached)"}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>

              <div className="flex gap-2">
                <button onClick={() => setStep("form")} className="btn-secondary flex-1 justify-center">
                  <ArrowLeft className="w-4 h-4" /> Back
                </button>
                <button
                  onClick={() => submitM.mutate()}
                  disabled={submitM.isPending}
                  className="btn-primary flex-1 justify-center"
                >
                  {submitM.isPending ? (
                    <><Loader2 className="w-4 h-4 animate-spin" /> Submitting...</>
                  ) : (
                    "Submit Request"
                  )}
                </button>
              </div>
            </div>
          )}

          {step === "payment" && (
            <div className="text-center space-y-5 py-2">
              {paymentConfirmed ? (
                <>
                  <div className="w-14 h-14 rounded-full bg-emerald-50 dark:bg-emerald-900/20 text-emerald-500 flex items-center justify-center mx-auto">
                    <CheckCircle2 className="w-7 h-7" />
                  </div>
                  <div>
                    <h3 className="text-[18px] font-bold text-ink-900 dark:text-white">Payment confirmed!</h3>
                    <p className="text-[13.5px] text-ink-500 dark:text-ink-400 mt-1">
                      Your request is now in the review queue.
                    </p>
                  </div>
                </>
              ) : (
                <>
                  <div className="w-14 h-14 rounded-full bg-amber-50 dark:bg-amber-900/20 text-amber-500 flex items-center justify-center mx-auto">
                    <CreditCard className="w-7 h-7" />
                  </div>
                  <div>
                    <h3 className="text-[18px] font-bold text-ink-900 dark:text-white">Payment required</h3>
                    <p className="text-[13.5px] text-ink-500 dark:text-ink-400 mt-1">
                      Your request is held until payment is confirmed — this usually takes a moment.
                    </p>
                  </div>
                </>
              )}

              <div className="rounded-xl bg-slate-50 dark:bg-ink-800/60 p-4 space-y-2 text-[13.5px] text-left">
                <div className="flex justify-between">
                  <span className="text-ink-400">Reference</span>
                  <span className="font-mono font-semibold text-ink-900 dark:text-white">{submittedCode}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-ink-400">Amount due</span>
                  <span className="font-semibold text-ink-900 dark:text-white">
                    {service.fee_amount.toLocaleString()} {service.fee_currency}
                  </span>
                </div>
              </div>

              {!paymentConfirmed && (
                <button
                  onClick={() => pendingRequestId && checkoutM.mutate(pendingRequestId)}
                  disabled={checkoutM.isPending}
                  className="btn-primary w-full justify-center"
                >
                  {checkoutM.isPending ? (
                    <><Loader2 className="w-4 h-4 animate-spin" /> Preparing checkout...</>
                  ) : (
                    <><CreditCard className="w-4 h-4" /> Pay with UrubutoPay <ExternalLink className="w-3.5 h-3.5" /></>
                  )}
                </button>
              )}

              <div className="flex flex-col sm:flex-row gap-2 pt-1">
                <button
                  onClick={() => { startOver(); navigate("/services/track"); }}
                  className="btn-secondary flex-1 justify-center"
                >
                  Track this request
                </button>
                <button
                  onClick={() => { startOver(); navigate("/my/service-requests"); }}
                  className="btn-primary flex-1 justify-center"
                >
                  View my requests
                </button>
              </div>
            </div>
          )}

          {step === "success" && (
            <div className="text-center space-y-5 py-2">
              <div className="w-14 h-14 rounded-full bg-emerald-50 dark:bg-emerald-900/20 text-emerald-500 flex items-center justify-center mx-auto">
                <PartyPopper className="w-7 h-7" />
              </div>
              <div>
                <h3 className="text-[18px] font-bold text-ink-900 dark:text-white">Request submitted!</h3>
                <p className="text-[13.5px] text-ink-500 dark:text-ink-400 mt-1">
                  Your tracking code is:
                </p>
              </div>
              <div className="flex items-center justify-center gap-2">
                <span className="font-mono font-bold text-[16px] text-ink-900 dark:text-white bg-slate-50 dark:bg-ink-800 rounded-lg px-3 py-1.5">
                  {submittedCode}
                </span>
                <button
                  onClick={() => {
                    if (submittedCode) {
                      navigator.clipboard.writeText(submittedCode);
                      toast.success("Copied to clipboard");
                    }
                  }}
                  className="p-2 rounded-lg text-ink-400 hover:text-brand hover:bg-brand/10 transition-colors"
                  title="Copy code"
                >
                  <Copy className="w-4 h-4" />
                </button>
              </div>
              <div className="flex flex-col sm:flex-row gap-2 pt-2">
                <button
                  onClick={() => { startOver(); navigate("/services/track"); }}
                  className="btn-secondary flex-1 justify-center"
                >
                  Track this request
                </button>
                <button
                  onClick={() => { startOver(); navigate("/my/service-requests"); }}
                  className="btn-primary flex-1 justify-center"
                >
                  View my requests
                </button>
              </div>
            </div>
          )}
        </div>
      </Modal>
    </Shell>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-slate-50 dark:bg-ink-800/60 p-3 flex items-center justify-between">
      <p className="text-[11px] uppercase tracking-wide text-ink-400 font-bold">{label}</p>
      <p className="text-[14px] font-bold text-ink-900 dark:text-white">{value}</p>
    </div>
  );
}
