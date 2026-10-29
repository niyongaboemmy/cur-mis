import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Loader2, Plus, Trash2, Upload } from "lucide-react";
import {
  staffSelfProfileService,
  type StaffExperience,
  type StaffProfileData,
  type StaffProfileFields,
  type StaffReferee,
} from "@/services/staffSelfProfileService";

const QUERY_KEY = ["me-staff-profile"];

const DOC_LABELS: Record<string, string> = {
  NATIONAL_ID: "National ID or passport copy",
  QUALIFICATION: "Highest qualification certificate",
  RSSB: "RSSB pension proof",
  BANK: "Bank letter or account proof",
  DISABILITY: "Disability card or medical letter",
  EXPERIENCE: "Experience letters",
};

const MAX_REFEREES = 5;
const MAX_EXPERIENCE = 20;

type Form = Omit<StaffProfileFields, "experience" | "referees"> & {
  experience: StaffExperience[];
  referees: StaffReferee[];
};

const TEXT_KEYS = [
  "first_name", "last_name", "father_name", "mother_name", "gender", "disability_category",
  "age", "national_id_number", "place_of_birth", "address", "phone", "secondary_phone",
  "personal_email", "work_email", "nationality", "rssb_number", "bank_name", "bank_account",
  "post", "position", "academic_rank", "institution_name", "faculty", "department_name",
  "program_name", "highest_qualification", "area_specialization", "university",
  "university_country",
] as const;

function toForm(f: StaffProfileFields): Form {
  const out = { ...f } as Form;
  for (const k of TEXT_KEYS) {
    out[k] = (f[k] ?? "") as never;
  }
  out.disability_status = f.disability_status ?? "No";
  out.national_id_type = f.national_id_type ?? "NATIONAL_ID";
  out.experience = f.experience ?? [];
  out.referees = f.referees ?? [];
  return out;
}

/** Empty strings become null, so the server stores NULL rather than "". */
function toPayload(f: Form): StaffProfileFields {
  const out = { ...f } as StaffProfileFields;
  for (const k of TEXT_KEYS) {
    out[k] = ((f[k] as string).trim() || null) as never;
  }
  out.experience = f.experience.map((e) => ({
    organisation: e.organisation?.trim() || null,
    role: e.role?.trim() || null,
    start_year: e.start_year?.trim() || null,
    end_year: e.end_year?.trim() || null,
    details: e.details?.trim() || null,
  }));
  out.referees = f.referees.map((r) => ({
    name: r.name?.trim() || null,
    position: r.position?.trim() || null,
    organisation: r.organisation?.trim() || null,
    phone: r.phone?.trim() || null,
    email: r.email?.trim() || null,
  }));
  return out;
}

export default function StaffSelfProfileCard() {
  const queryClient = useQueryClient();
  const [form, setForm] = useState<Form | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const q = useQuery({
    queryKey: QUERY_KEY,
    queryFn: () => staffSelfProfileService.get(),
    select: (res) => res.data as StaffProfileData | undefined,
    retry: false,
  });
  const data = q.data;

  useEffect(() => {
    if (data) setForm(toForm(data.fields));
  }, [data]);

  const save = useMutation({
    mutationFn: () => staffSelfProfileService.save(toPayload(form as Form)),
    onSuccess: (res) => {
      setErrors({});
      toast.success(res.message ?? "Staff profile saved.");
      queryClient.setQueryData(QUERY_KEY, res);
    },
    onError: (e: any) => {
      const serverErrors = e?.response?.data?.errors ?? {};
      setErrors(
        Object.fromEntries(
          Object.entries(serverErrors).map(([k, v]) => [k, Array.isArray(v) ? String(v[0]) : String(v)]),
        ),
      );
      toast.error(e?.response?.data?.message || "Could not save the staff profile.");
    },
  });

  const upload = useMutation({
    mutationFn: ({ docType, file }: { docType: string; file: File }) =>
      staffSelfProfileService.uploadDocument(docType, file),
    onSuccess: (res) => {
      toast.success(res.message ?? "Document uploaded.");
      queryClient.setQueryData(QUERY_KEY, res);
    },
    onError: (e: any) => toast.error(e?.response?.data?.message || "Upload failed."),
  });

  if (q.isLoading) {
    return (
      <div className="card p-5 flex items-center justify-center">
        <Loader2 className="w-5 h-5 text-brand animate-spin" />
      </div>
    );
  }

  // No linked employee record: say so instead of showing an empty form.
  if (q.isError || !data || !form) {
    const msg =
      (q.error as any)?.response?.data?.message ??
      "Your staff profile could not be loaded.";
    return (
      <div className="card p-5">
        <p className="text-[13px] text-ink-600">{msg}</p>
      </div>
    );
  }

  const set = <K extends keyof Form>(key: K, value: Form[K]) =>
    setForm((prev) => (prev ? { ...prev, [key]: value } : prev));

  const textField = (key: (typeof TEXT_KEYS)[number], label: string, opts?: { type?: string; full?: boolean }) => (
    <Field label={label} error={errors[key]} full={opts?.full}>
      <input
        className="input"
        type={opts?.type ?? "text"}
        value={form[key] as string}
        onChange={(e) => set(key, e.target.value as never)}
      />
    </Field>
  );

  const missing = data.missing_required_documents;
  const latestByType = Object.fromEntries(data.documents.map((d) => [d.doc_type, d]));

  return (
    <div className="space-y-6">
      {/* Read-only status */}
      <div className="card p-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-[12px] uppercase tracking-wide text-ink-500 font-semibold">Contract status</p>
          <p className="text-[15px] font-bold text-ink-900">{data.contract_status ?? "Not set by HR"}</p>
        </div>
        {missing.length > 0 && (
          <p className="text-[12px] text-amber-700 flex items-center gap-1.5">
            <AlertTriangle className="w-4 h-4" />
            Upload required: {missing.map((t) => DOC_LABELS[t] ?? t).join(", ")}
          </p>
        )}
      </div>

      <form
        className="card p-5 space-y-6"
        onSubmit={(e) => {
          e.preventDefault();
          save.mutate();
        }}
      >
        <Section title="Personal details">
          {textField("first_name", "First name")}
          {textField("last_name", "Last name")}
          {textField("father_name", "Father's name")}
          {textField("mother_name", "Mother's name")}
          <Field label="Gender" error={errors.gender}>
            <select className="input" value={form.gender ?? ""} onChange={(e) => set("gender", e.target.value)}>
              <option value="">Select</option>
              <option value="M">Male</option>
              <option value="F">Female</option>
            </select>
          </Field>
          {textField("age", "Age", { type: "number" })}
          <Field label="Disability status" error={errors.disability_status}>
            <select
              className="input"
              value={form.disability_status}
              onChange={(e) => set("disability_status", e.target.value as "No" | "Yes")}
            >
              <option value="No">No</option>
              <option value="Yes">Yes</option>
            </select>
          </Field>
          {form.disability_status === "Yes" &&
            textField("disability_category", "Disability category", { full: true })}
          <Field label="National ID or passport" error={errors.national_id_type}>
            <select
              className="input"
              value={form.national_id_type}
              onChange={(e) => set("national_id_type", e.target.value as "NATIONAL_ID" | "PASSPORT")}
            >
              <option value="NATIONAL_ID">National ID</option>
              <option value="PASSPORT">Passport</option>
            </select>
          </Field>
          {textField("national_id_number", "ID / passport number")}
          {textField("place_of_birth", "Place of birth (village, cell, sector, district, province or country)", { full: true })}
          {textField("nationality", "Nationality")}
        </Section>

        <Section title="Contact">
          {textField("address", "Address (village, cell, sector, district, province or country)", { full: true })}
          {textField("phone", "Phone number")}
          {textField("secondary_phone", "Second phone number")}
          {textField("personal_email", "Personal email", { type: "email" })}
          {textField("work_email", "Work email", { type: "email" })}
        </Section>

        <Section title="Employment">
          {textField("post", "Function / post")}
          {textField("position", "Position name")}
          {textField("academic_rank", "Academic rank")}
          {textField("institution_name", "Institution name")}
          {textField("faculty", "School / faculty")}
          {textField("department_name", "Department")}
          {textField("program_name", "Program")}
          {textField("rssb_number", "RSSB pension number")}
          {textField("bank_name", "Bank name")}
          {textField("bank_account", "Bank account number")}
        </Section>

        <Section title="Qualifications">
          {textField("highest_qualification", "Highest qualification obtained")}
          {textField("area_specialization", "Area of specialisation")}
          {textField("university", "University attended")}
          {textField("university_country", "Country of the university")}
        </Section>

        <ListSection
          title="Years of experience"
          max={MAX_EXPERIENCE}
          addLabel="Add experience"
          rows={form.experience}
          onChange={(rows) => set("experience", rows)}
          blank={() => ({ organisation: "", role: "", start_year: "", end_year: "", details: "" } as StaffExperience)}
          fields={[
            { key: "organisation", label: "Organisation" },
            { key: "role", label: "Role" },
            { key: "start_year", label: "From (year)" },
            { key: "end_year", label: "To (year)" },
            { key: "details", label: "Details" },
          ]}
          errors={errors}
          errorPrefix="experience"
        />

        <ListSection
          title="Referees"
          max={MAX_REFEREES}
          addLabel="Add referee"
          rows={form.referees}
          onChange={(rows) => set("referees", rows)}
          blank={() => ({ name: "", position: "", organisation: "", phone: "", email: "" } as StaffReferee)}
          fields={[
            { key: "name", label: "Full name" },
            { key: "position", label: "Position" },
            { key: "organisation", label: "Organisation" },
            { key: "phone", label: "Phone" },
            { key: "email", label: "Email" },
          ]}
          errors={errors}
          errorPrefix="referees"
        />

        <div className="flex justify-end">
          <button type="submit" className="btn-primary" disabled={save.isPending}>
            {save.isPending ? <><Loader2 className="w-4 h-4 animate-spin" /> Saving…</> : "Save staff profile"}
          </button>
        </div>
      </form>

      {/* Documents */}
      <div className="card p-5 space-y-4">
        <div>
          <h3 className="text-[15px] font-bold text-ink-900">Supporting documents</h3>
          <p className="text-[12px] text-ink-500">PDF, JPG, PNG or WebP, up to 5 MB. Uploading again replaces the document in use.</p>
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          {data.document_types.map((type) => {
            const current = latestByType[type];
            const required = data.required_documents.includes(type);
            return (
              <div key={type} className="rounded-xl border border-ink-200 p-4 space-y-2">
                <p className="text-[13px] font-semibold text-ink-900">
                  {DOC_LABELS[type] ?? type}
                  {required && <span className="ml-2 text-[11px] text-red-600">Required</span>}
                </p>
                {current ? (
                  <p className="text-[12px] text-green-700 truncate">
                    Uploaded: {current.original_name ?? "file"} · {new Date(current.uploaded_at).toLocaleDateString()}
                  </p>
                ) : (
                  <p className="text-[12px] text-ink-500">Not uploaded yet</p>
                )}
                <label className="inline-flex items-center gap-2 text-[12px] font-semibold text-brand cursor-pointer">
                  {upload.isPending && upload.variables?.docType === type
                    ? <Loader2 className="w-4 h-4 animate-spin" />
                    : <Upload className="w-4 h-4" />}
                  {current ? "Replace file" : "Upload file"}
                  <input
                    type="file"
                    className="hidden"
                    accept="application/pdf,image/jpeg,image/png,image/webp"
                    disabled={upload.isPending}
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      e.target.value = "";
                      if (file) upload.mutate({ docType: type, file });
                    }}
                  />
                </label>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-3">
      <h3 className="text-[13px] font-bold uppercase tracking-wide text-ink-500">{title}</h3>
      <div className="grid gap-4 md:grid-cols-2">{children}</div>
    </div>
  );
}

function Field({
  label,
  error,
  full,
  children,
}: {
  label: string;
  error?: string;
  full?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className={`block ${full ? "md:col-span-2" : ""}`}>
      <span className="text-[11.5px] font-semibold uppercase tracking-wide text-ink-500 block mb-1">{label}</span>
      {children}
      {error && <span className="text-[11.5px] text-red-600 mt-1 block">{error}</span>}
    </label>
  );
}

function ListSection<T extends object>({
  title,
  max,
  addLabel,
  rows,
  onChange,
  blank,
  fields,
  errors,
  errorPrefix,
}: {
  title: string;
  max: number;
  addLabel: string;
  rows: T[];
  onChange: (rows: T[]) => void;
  blank: () => T;
  fields: { key: keyof T & string; label: string }[];
  errors: Record<string, string>;
  errorPrefix: string;
}) {
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-[13px] font-bold uppercase tracking-wide text-ink-500">{title}</h3>
        <button
          type="button"
          className="btn-secondary text-[12px]"
          disabled={rows.length >= max}
          onClick={() => onChange([...rows, blank()])}
        >
          <Plus className="w-4 h-4" /> {addLabel}
        </button>
      </div>
      {rows.length === 0 && <p className="text-[12px] text-ink-500">Nothing added yet.</p>}
      {rows.map((row, i) => (
        <div key={i} className="rounded-xl border border-ink-200 p-4 space-y-3">
          <div className="grid gap-4 md:grid-cols-2">
            {fields.map((f) => (
              <Field key={f.key} label={f.label} error={errors[`${errorPrefix}.${i}.${f.key}`]}>
                <input
                  className="input"
                  value={(row[f.key] as string | null | undefined) ?? ""}
                  onChange={(e) => {
                    const next = [...rows];
                    next[i] = { ...row, [f.key]: e.target.value } as T;
                    onChange(next);
                  }}
                />
              </Field>
            ))}
          </div>
          <div className="flex justify-end">
            <button
              type="button"
              className="text-[12px] text-red-600 inline-flex items-center gap-1"
              onClick={() => onChange(rows.filter((_, j) => j !== i))}
            >
              <Trash2 className="w-4 h-4" /> Remove
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
