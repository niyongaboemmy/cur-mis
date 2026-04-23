import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import toast from "react-hot-toast";
import {
  Loader2,
  GraduationCap,
  ArrowRight,
  FileText,
  CheckCircle2,
  AlertCircle,
  UploadCloud,
} from "lucide-react";
import { applicantService } from "@/services/admissionService";
import Modal from "@/components/ui/Modal";
import VerificationStep from "@/components/admission/VerificationStep";
import { Field } from "@/components/applicant/ApplicantPortalShared";
import ApplicationDetailsView from "@/components/applicant/ApplicationDetailsView";
import DocumentsUploader from "@/components/ui/DocumentsUploader";

export default function ApplicantOverviewPage() {
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ["applicant", "applications"],
    queryFn: () => applicantService.listApplications(),
  });
  const apps = q.data?.data ?? [];
  const [selectedId, setSelectedId] = useState<number | null>(null);

  if (q.isLoading)
    return (
      <div className="max-w-5xl mx-auto p-12 text-center">
        <Loader2 className="w-8 h-8 animate-spin mx-auto text-brand" />
        <p className="text-ink-500 mt-4">Loading your applications...</p>
      </div>
    );

  // If there's an application that needs email verification
  const primaryApp = apps.find(
    (a) => Number(a.email_verified) === 0 && a.status !== "draft",
  );
  if (primaryApp) {
    return (
      <div className="max-w-xl mx-auto py-12 px-4">
        <VerificationStep
          email={primaryApp.email}
          onSuccess={() =>
            qc.invalidateQueries({ queryKey: ["applicant", "applications"] })
          }
        />
      </div>
    );
  }

  if (apps.length === 0)
    return (
      <div className="max-w-xl mx-auto py-20 px-4 text-center">
        <div className="w-20 h-20 bg-primary-50 dark:bg-primary-900/30 rounded-3xl flex items-center justify-center mx-auto mb-6 rotate-3 shadow-xl shadow-primary-500/10">
          <GraduationCap className="w-10 h-10 text-primary-600" />
        </div>
        <h2 className="text-2xl font-bold text-ink-900 dark:text-white mb-2">
          Ready to start your journey?
        </h2>
        <p className="text-ink-500 mb-8 leading-relaxed max-w-sm mx-auto">
          Join the Catholic University of Rwanda today. Start your application
          in just a few minutes.
        </p>
        <a
          href="/apply"
          className="btn-primary py-3.5 px-10 text-[16px] rounded-2xl shadow-xl shadow-primary-500/20 hover:shadow-primary-500/40 transition-all active:scale-95"
        >
          Start New Application
        </a>
      </div>
    );

  const selectedApp = selectedId
    ? apps.find((a) => a.id === selectedId)
    : apps[0];

  return (
    <div className="max-w-6xl mx-auto space-y-8 pb-12">
      {/* 1. Group Cards Listing */}
      <div className="space-y-3">
        <h3 className="text-[12px] uppercase tracking-widest font-black text-ink-400 px-1 flex items-center gap-2">
          <div className="w-4 h-1 bg-primary-500 rounded-full" /> My
          Applications ({apps.length})
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {apps.map((a) => (
            <ApplicationCard
              key={a.id}
              app={a}
              active={selectedApp?.id === a.id}
              onSelect={() => setSelectedId(a.id)}
            />
          ))}
        </div>
      </div>

      {/* 2. Focused View */}
      {selectedApp && <ApplicationView app={selectedApp} />}
    </div>
  );
}

function ApplicationCard({
  app,
  active,
  onSelect,
}: {
  app: any;
  active: boolean;
  onSelect: () => void;
}) {
  const isDraft = app.status === "draft";

  return (
    <button
      onClick={onSelect}
      className={`relative w-full text-left p-5 rounded-3xl border-2 transition-all group overflow-hidden ${active ? "bg-white dark:bg-ink-800 border-primary-500 shadow-xl shadow-primary-500/10" : "bg-white dark:bg-ink-800 border-ink-100 dark:border-ink-700 hover:border-primary-200 dark:hover:border-primary-800"}`}
    >
      {active && (
        <div className="absolute top-0 right-0 p-3">
          <CheckCircle2 className="w-4 h-4 text-primary-500" />
        </div>
      )}

      <p className="text-[11px] font-bold text-ink-400 uppercase tracking-wider mb-2">
        {app.application_number}
      </p>
      <h4 className="text-[16px] font-black text-ink-900 dark:text-white truncate mb-1">
        {app.department_name}
      </h4>
      <p className="text-[13px] text-ink-500 truncate mb-4">
        {app.faculty_name}
      </p>

      <div className="flex items-center justify-between mt-auto pt-4 border-t border-ink-50 dark:border-ink-800">
        <span
          className={`text-[11px] font-bold px-2.5 py-1 rounded-lg uppercase tracking-tight ${isDraft ? "bg-amber-50 text-amber-600 dark:bg-amber-900/20" : "bg-primary-50 text-primary-700 dark:bg-primary-900/20"}`}
        >
          {app.status}
        </span>
        <div className="flex items-center gap-1 text-[12px] font-bold text-primary-600 opacity-0 group-hover:opacity-100 transition-opacity">
          View <ArrowRight className="w-3.5 h-3.5" />
        </div>
      </div>
    </button>
  );
}

function ApplicationView({ app }: { app: any }) {
  const [editing, setEditing] = useState(false);
  const qc = useQueryClient();

  return (
    <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
      <ApplicationDetailsView
        application={app}
        onEdit={() => setEditing(true)}
      />

      {editing && (
        <EditApplicationModal
          appId={app.id}
          onClose={() => setEditing(false)}
          onSuccess={() => {
            setEditing(false);
            qc.invalidateQueries({ queryKey: ["applicant", "applications"] });
            qc.invalidateQueries({
              queryKey: ["applicant", "application", app.id],
            });
          }}
        />
      )}
    </div>
  );
}

function EditApplicationModal({
  appId,
  onClose,
  onSuccess,
}: {
  appId: number;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [activeTab, setActiveTab] = useState<"details" | "documents">(
    "details",
  );
  const applicationQ = useQuery({
    queryKey: ["applicant", "application", appId],
    queryFn: () => applicantService.getApplicationDetails(appId),
  });
  const app = applicationQ.data?.data;
  const [form, setForm] = useState<any>(null);

  useEffect(() => {
    if (app && !form) {
      setForm({
        first_name: app.first_name,
        last_name: app.last_name,
        phone: app.phone,
        gender: app.gender,
        birthdate: app.birthdate,
        nationality: app.nationality,
        address: app.address,
        prev_school: app.prev_school,
        prev_qualification: app.prev_qualification,
        prev_grade: app.prev_grade,
        graduation_year: app.graduation_year,
        sponsorship: app.sponsorship,
        sponsor_name: app.sponsor_name,
      });
    }
  }, [app, form]);

  const mutation = useMutation({
    mutationFn: (d: any) => applicantService.updateApplication(appId, d),
    onSuccess: () => {
      toast.success("Application details updated");
      onSuccess();
    },
    onError: (e: any) =>
      toast.error(e?.response?.data?.message ?? "Failed to update"),
  });

  if (!app || !form) return null;

  return (
    <Modal
      open
      onClose={onClose}
      title={`Manage Application: ${app.application_number}`}
      size="xl"
      footer={
        <div className="flex items-center justify-between w-full">
          <p className="text-[11px] text-ink-400 font-medium">
            Last saved:{" "}
            {new Date(app.updated_at || app.created_at!).toLocaleString()}
          </p>
          <div className="flex gap-2">
            <button className="btn-secondary" onClick={onClose}>
              Close
            </button>
            {activeTab === "details" && (
              <button
                className="btn-primary"
                onClick={() => mutation.mutate(form)}
                disabled={mutation.isPending}
              >
                {mutation.isPending && (
                  <Loader2 className="w-4 h-4 animate-spin" />
                )}{" "}
                Save Details
              </button>
            )}
          </div>
        </div>
      }
    >
      <div className="flex border-b border-ink-100 dark:border-ink-800 mb-6">
        <TabBtn
          active={activeTab === "details"}
          onClick={() => setActiveTab("details")}
          label="General Details"
          icon={FileText}
        />
        <TabBtn
          active={activeTab === "documents"}
          onClick={() => setActiveTab("documents")}
          label="Documents Checklist"
          icon={UploadCloud}
        />
      </div>

      {activeTab === "details" ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
          <Field label="First name">
            <input
              className="input"
              value={form.first_name}
              onChange={(e) => setForm({ ...form, first_name: e.target.value })}
            />
          </Field>
          <Field label="Last name">
            <input
              className="input"
              value={form.last_name}
              onChange={(e) => setForm({ ...form, last_name: e.target.value })}
            />
          </Field>
          <Field label="Phone number">
            <input
              className="input"
              value={form.phone}
              onChange={(e) => setForm({ ...form, phone: e.target.value })}
            />
          </Field>
          <Field label="Gender">
            <select
              className="input"
              value={form.gender}
              onChange={(e) => setForm({ ...form, gender: e.target.value })}
            >
              <option value="Male">Male</option>
              <option value="Female">Female</option>
              <option value="Other">Other</option>
            </select>
          </Field>
          <Field label="Birthdate">
            <input
              type="date"
              className="input"
              value={form.birthdate}
              onChange={(e) => setForm({ ...form, birthdate: e.target.value })}
            />
          </Field>
          <Field label="Nationality">
            <input
              className="input"
              value={form.nationality}
              onChange={(e) =>
                setForm({ ...form, nationality: e.target.value })
              }
            />
          </Field>
          <div className="sm:col-span-2">
            <Field label="Address">
              <textarea
                className="input h-20"
                value={form.address}
                onChange={(e) => setForm({ ...form, address: e.target.value })}
              />
            </Field>
          </div>

          <div className="sm:col-span-2 pt-4 border-t border-ink-50 dark:border-ink-800 mt-2">
            <h4 className="text-[13px] font-bold text-ink-900 dark:text-white">
              Academic History
            </h4>
          </div>
          <Field label="Previous school">
            <input
              className="input"
              value={form.prev_school}
              onChange={(e) =>
                setForm({ ...form, prev_school: e.target.value })
              }
            />
          </Field>
          <Field label="Qualification">
            <input
              className="input"
              value={form.prev_qualification}
              onChange={(e) =>
                setForm({ ...form, prev_qualification: e.target.value })
              }
            />
          </Field>
          <Field label="Grade/Result">
            <input
              className="input"
              value={form.prev_grade}
              onChange={(e) => setForm({ ...form, prev_grade: e.target.value })}
            />
          </Field>
          <Field label="Graduation year">
            <input
              type="number"
              className="input"
              value={form.graduation_year}
              onChange={(e) =>
                setForm({ ...form, graduation_year: Number(e.target.value) })
              }
            />
          </Field>
        </div>
      ) : (
        <div className="space-y-6">
          <div className="p-4 bg-amber-50 dark:bg-amber-900/10 border border-amber-100 dark:border-amber-900/50 rounded-2xl flex gap-3">
            <AlertCircle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
            <div className="min-w-0">
              <p className="text-[13px] font-bold text-amber-900 dark:text-amber-200">
                Required Documents Checklist
              </p>
              <p className="text-[12px] text-amber-800 dark:text-amber-300 leading-relaxed mt-1">
                Ensure all required files are uploaded and readable. You can
                replace files until they are verified by the admissions office.
              </p>
            </div>
          </div>

          <DocumentsUploader
            requirements={app.document_checklist ?? []}
            uploaded={
              (app.document_checklist ?? [])
                .filter((i: any) => i.uploaded)
                .map((i: any) => ({
                  id: i.document_id,
                  document_type_id: i.document_type_id,
                  file_original_name: i.file_original_name,
                  verification_status: i.verification_status,
                  rejection_notes: i.rejection_notes,
                })) as any
            }
            onUpload={({ document_type_id, file }) =>
              applicantService.uploadDocument({ document_type_id, file })
            }
            invalidateKeys={[["applicant", "application", appId]]}
          />
        </div>
      )}
    </Modal>
  );
}

function TabBtn({
  active,
  onClick,
  label,
  icon: Icon,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  icon: any;
}) {
  return (
    <button
      onClick={onClick}
      className={`px-6 py-4 text-[13.5px] font-bold flex items-center gap-2 border-b-2 transition-all ${active ? "border-primary-500 text-primary-600" : "border-transparent text-ink-400 hover:text-ink-600"}`}
    >
      <Icon className="w-4 h-4" /> {label}
    </button>
  );
}
