import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import toast from "react-hot-toast";
import { Link, useNavigate } from "react-router-dom";
import {
  GraduationCap,
  Building2,
  User,
  ScrollText,
  CheckCircle2,
  Loader2,
  ArrowRight,
  ArrowLeft,
  Search,
  FileUp,
} from "lucide-react";
import Logo from "@/components/brand/Logo";
import { portalService } from "@/services/admissionService";
import DocumentsUploader from "@/components/ui/DocumentsUploader";

/* ─────────────────────────────────────────────────────────────
   Application form schema (frontend-side validation)
   ───────────────────────────────────────────────────────────── */
/** React-Hook-Form's `valueAsNumber: true` sends `NaN` for empty selects/inputs,
 *  which breaks `z.coerce.number()` ("Expected number, received nan"). This
 *  helper explicitly normalises falsy inputs → `undefined` so the user only
 *  ever sees the nice required-message below (no zod internals leaking through). */
const normaliseId = (v: unknown): unknown => {
  if (v === "" || v == null) return undefined;
  if (typeof v === "number" && Number.isNaN(v)) return undefined;
  if (typeof v === "string") {
    const n = Number(v);
    return Number.isFinite(n) ? n : undefined;
  }
  return v;
};
const numberId = (msg: string) =>
  z.preprocess(
    normaliseId,
    z
      .number({ required_error: msg, invalid_type_error: msg })
      .int()
      .positive(msg),
  );

const CURRENT_YEAR = new Date().getFullYear();
const MIN_APPLICANT_AGE = 15; // youngest plausible university applicant
const MAX_APPLICANT_AGE = 80;

const schema = z.object({
  // Step 2 (picked in step 1 but stored together)
  faculty_id: numberId("Please select a faculty"),
  department_id: numberId("Please select a department"),
  intake: z.string().min(1, "Required").default("2026-A"),

  // Step 3 — personal
  first_name: z.string().min(2, "Required"),
  last_name: z.string().min(2, "Required"),
  email: z.string().email("Valid email required"),
  phone: z.string().min(7, "Required"),
  gender: z.enum(["M", "F", "Other"]),
  birthdate: z
    .string()
    .min(1, "Date of birth is required")
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Use the date picker (YYYY-MM-DD)")
    .refine((v) => !Number.isNaN(Date.parse(v)), "Enter a valid date")
    .refine(
      (v) => new Date(v) <= new Date(),
      "Date of birth cannot be in the future",
    )
    .refine(
      (v) => yearsBetween(v, new Date()) >= MIN_APPLICANT_AGE,
      `You must be at least ${MIN_APPLICANT_AGE} years old to apply`,
    )
    .refine(
      (v) => yearsBetween(v, new Date()) <= MAX_APPLICANT_AGE,
      "Please check your date of birth",
    ),
  nationality: z.string().min(2, "Required").default("Rwandan"),
  address: z.string().optional(),

  // Step 4 — academic
  prev_school: z.string().min(2, "Required"),
  prev_qualification: z.string().min(2, "Required"),
  prev_grade: z.string().min(1, "Required"),
  combination: z.string().optional(),
  graduation_year: z.preprocess(
    normaliseId,
    z
      .number({
        required_error: "Graduation year is required",
        invalid_type_error: "Graduation year is required",
      })
      .int("Graduation year must be a whole number")
      .min(1990, "Graduation year must be 1990 or later")
      .max(
        CURRENT_YEAR,
        `Graduation year cannot be later than ${CURRENT_YEAR}`,
      ),
  ),

  // Step 5 — sponsorship
  sponsorship: z.enum(["government", "self", "private", "scholarship"]),
  sponsor_name: z.string().optional(),
});

/** Whole years between two dates, accounting for month/day (so a 17y11m person
 *  reports 17, not 18). */
function yearsBetween(from: string | Date, to: Date): number {
  const d = typeof from === "string" ? new Date(from) : from;
  if (Number.isNaN(d.getTime())) return -1;
  let y = to.getFullYear() - d.getFullYear();
  const m = to.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && to.getDate() < d.getDate())) y -= 1;
  return y;
}
type FormValues = z.infer<typeof schema>;

const STEPS = [
  { id: 1, label: "Department", icon: GraduationCap },
  { id: 2, label: "Personal", icon: User },
  { id: 3, label: "Academic", icon: ScrollText },
  { id: 4, label: "Sponsorship", icon: Building2 },
  { id: 5, label: "Review", icon: CheckCircle2 },
  { id: 6, label: "Documents", icon: FileUp },
] as const;

const REVIEW_STEP = 5;
const DOCUMENTS_STEP = 6;

/* ───────────────────────────────────────────────────────────── */

export default function ApplyPage() {
  const [step, setStep] = useState(1);
  const [successApp, setSuccessApp] = useState<{
    id: number;
    application_number: string;
  } | null>(null);
  const navigate = useNavigate();

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      intake: "2026-A",
      nationality: "Rwandan",
      gender: "M",
      sponsorship: "self",
    },
    mode: "onTouched",
  });

  // Load the active year (so we show the round users are applying to)
  const activeYearQ = useQuery({
    queryKey: ["portal", "active-year"],
    queryFn: () => portalService.getActiveYear(),
  });

  const facultyId = form.watch("faculty_id");
  const facultiesQ = useQuery({
    queryKey: ["portal", "faculties"],
    queryFn: () => portalService.getFaculties(),
  });
  const departmentsQ = useQuery({
    queryKey: ["portal", "departments", facultyId],
    queryFn: () => portalService.getFacultyDepartments(facultyId),
    enabled: !!facultyId,
  });
  const requirementsQ = useQuery({
    queryKey: ["portal", "requirements", facultyId],
    queryFn: () => portalService.getFacultyRequirements(facultyId),
    enabled: !!facultyId,
  });

  const submitM = useMutation({
    mutationFn: (data: FormValues) => portalService.submitApplication(data),
    onSuccess: (r) => {
      if (r.success && r.data) {
        setSuccessApp(r.data);
        setStep(DOCUMENTS_STEP);
        toast.success("Application submitted — now upload your documents");
      } else {
        toast.error(r.message || "Submission failed");
      }
    },
    onError: (e: any) =>
      toast.error(e?.response?.data?.message ?? "Submission failed"),
  });

  const goNext = async () => {
    // Validate only the fields on the current step. No submission ever
    // happens here — submission is its own explicit action on the Review step.
    const keys: (keyof FormValues)[][] = [
      ["faculty_id", "department_id"],
      [
        "first_name",
        "last_name",
        "email",
        "phone",
        "gender",
        "birthdate",
        "nationality",
      ],
      ["prev_school", "prev_qualification", "prev_grade", "graduation_year"],
      ["sponsorship"],
    ];
    const ok = await form.trigger(keys[step - 1]);
    if (ok) setStep((s) => Math.min(s + 1, REVIEW_STEP));
  };

  const goPrev = () => {
    // Once the app is submitted (step 6 Documents), Back is a no-op —
    // there's nothing to go back to, the application already exists.
    if (successApp) return;
    setStep((s) => Math.max(s - 1, 1));
  };

  /** Explicit submission — only ever called by the Submit button's onClick.
   *  The form's native submit event is neutralised (preventDefault) so Enter
   *  keys, focus changes, or rapid clicks cannot fire this. */
  const submitNow = async () => {
    if (submitM.isPending || successApp) return;
    const ok = await form.trigger();
    if (!ok) {
      toast.error("Please fix the errors before submitting.");
      return;
    }
    submitM.mutate(form.getValues());
  };

  const faculties = facultiesQ.data?.data ?? [];
  const departments = departmentsQ.data?.data ?? [];
  const requirements = requirementsQ.data?.data ?? [];
  const selectedFaculty = faculties.find((f) => f.id === facultyId);
  const selectedDepartment = departments.find(
    (p) => p.id === form.watch("department_id"),
  );

  return (
    <Shell>
      {/* Stepper */}
      <section className="card p-4 mb-4">
        <div className="flex items-center justify-between overflow-x-auto gap-2 no-scrollbar">
          {STEPS.map((s, i) => {
            const Icon = s.icon;
            const done = step > s.id;
            const current = step === s.id;
            return (
              <div key={s.id} className="flex items-center gap-2 shrink-0">
                <div
                  className={`w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-semibold ${
                    done
                      ? "bg-emerald-500 text-white"
                      : current
                        ? "bg-brand text-white"
                        : "bg-ink-100 text-ink-500"
                  }`}
                >
                  {done ? (
                    <CheckCircle2 className="w-3.5 h-3.5" />
                  ) : (
                    <Icon className="w-3.5 h-3.5" />
                  )}
                </div>
                <span
                  className={`text-[12.5px] font-medium ${current ? "text-ink-900" : "text-ink-500"}`}
                >
                  {s.label}
                </span>
                {i < STEPS.length - 1 && (
                  <span className="w-6 h-px bg-ink-200" />
                )}
              </div>
            );
          })}
        </div>
      </section>

      {/* Active round banner */}
      {activeYearQ.data?.data && (
        <p className="text-[12.5px] text-ink-500 text-center mb-4">
          Round:{" "}
          <span className="font-semibold text-brand">
            {(activeYearQ.data.data as any).label}
          </span>
        </p>
      )}

      <form
        noValidate
        // Submission is never routed through the form's native submit event —
        // the Submit button uses onClick only. This means Enter keys, rapid
        // button re-renders, or accidental clicks anywhere in the form cannot
        // fire the mutation. Kept here only to neutralise the browser default.
        onSubmit={(e) => e.preventDefault()}
        className="card p-6 md:p-8 space-y-6"
      >
        {/* ── Step 1: Department ── */}
        {step === 1 && (
          <div className="space-y-5 animate-fade-up">
            <SectionTitle
              title="Choose your department"
              sub="Pick the faculty then the specific department."
            />
            <div>
              <label className="label">Faculty</label>
              <select
                className="input"
                {...form.register("faculty_id", { valueAsNumber: true })}
              >
                <option value="">— select faculty —</option>
                {faculties.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.name} ({f.code})
                  </option>
                ))}
              </select>
              {form.formState.errors.faculty_id && (
                <p className="error-text">
                  {form.formState.errors.faculty_id.message}
                </p>
              )}
            </div>

            <div>
              <label className="label">Department</label>
              <select
                className="input"
                {...form.register("department_id", { valueAsNumber: true })}
                disabled={
                  !facultyId ||
                  departmentsQ.isLoading ||
                  departments.length === 0
                }
              >
                <option value="">
                  {!facultyId
                    ? "— pick a faculty first —"
                    : departmentsQ.isLoading
                      ? "Loading…"
                      : departments.length === 0
                        ? "No departments available for this faculty"
                        : "— select department —"}
                </option>
                {departments.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} ({p.code})
                  </option>
                ))}
              </select>

              {/* Only show zod error if the user touched AND there are departments to pick */}
              {form.formState.errors.department_id &&
                departments.length > 0 && (
                  <p className="error-text">
                    {form.formState.errors.department_id.message}
                  </p>
                )}

              {/* Empty-state explainer — helps when a faculty has no open departments yet */}
              {facultyId &&
                !departmentsQ.isLoading &&
                departments.length === 0 && (
                  <div className="mt-2 rounded-md border border-amber-200 bg-amber-50 p-3 text-[12.5px] text-amber-800 flex items-start gap-2">
                    <svg
                      className="w-4 h-4 shrink-0 mt-0.5"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                    >
                      <path
                        d="M12 9v4M12 17h.01M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                    <div>
                      <p className="font-semibold">
                        No departments open for this faculty
                      </p>
                      <p>
                        Please pick a different faculty, or check back later
                        when this round's departments are published.
                      </p>
                    </div>
                  </div>
                )}
            </div>

            <div>
              <label className="label">Intake</label>
              <select className="input" {...form.register("intake")}>
                <option>2026-A</option>
                <option>2026-B</option>
              </select>
            </div>

            {/* Requirements preview */}
            {requirements.length > 0 && (
              <div className="rounded-md border border-ink-100 bg-ink-50 p-4">
                <p className="text-[12px] font-semibold text-ink-700 mb-2">
                  You'll need to upload these documents after submission:
                </p>
                <ul className="space-y-1">
                  {requirements.map((r) => (
                    <li
                      key={r.id}
                      className="text-[12.5px] flex items-center gap-1.5 text-ink-700"
                    >
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                      {r.document_type_name ??
                        `Document #${r.document_type_id}`}
                      {r.is_required ? (
                        ""
                      ) : (
                        <span className="text-ink-400 ml-1">(optional)</span>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}

        {/* ── Step 2: Personal ── */}
        {step === 2 && (
          <div className="space-y-5 animate-fade-up">
            <SectionTitle
              title="Tell us about yourself"
              sub="Basic personal information."
            />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field
                label="First name"
                error={form.formState.errors.first_name?.message}
              >
                <input className="input" {...form.register("first_name")} />
              </Field>
              <Field
                label="Last name"
                error={form.formState.errors.last_name?.message}
              >
                <input className="input" {...form.register("last_name")} />
              </Field>
              <Field label="Email" error={form.formState.errors.email?.message}>
                <input
                  type="email"
                  className="input"
                  {...form.register("email")}
                />
              </Field>
              <Field label="Phone" error={form.formState.errors.phone?.message}>
                <input
                  className="input"
                  placeholder="+2507…"
                  {...form.register("phone")}
                />
              </Field>
              <Field
                label="Gender"
                error={form.formState.errors.gender?.message}
              >
                <select className="input" {...form.register("gender")}>
                  <option value="M">Male</option>
                  <option value="F">Female</option>
                  <option value="Other">Other</option>
                </select>
              </Field>
              <Field
                label="Date of birth"
                error={form.formState.errors.birthdate?.message}
              >
                <input
                  type="date"
                  className="input"
                  max={todayYMD()}
                  min={`${CURRENT_YEAR - MAX_APPLICANT_AGE}-01-01`}
                  {...form.register("birthdate")}
                />
              </Field>
              <Field
                label="Nationality"
                error={form.formState.errors.nationality?.message}
              >
                <input className="input" {...form.register("nationality")} />
              </Field>
              <Field label="Address (optional)">
                <input className="input" {...form.register("address")} />
              </Field>
            </div>
          </div>
        )}

        {/* ── Step 3: Academic ── */}
        {step === 3 && (
          <div className="space-y-5 animate-fade-up">
            <SectionTitle
              title="Academic background"
              sub="Where did you study before CUR?"
            />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field
                label="Previous school"
                error={form.formState.errors.prev_school?.message}
              >
                <input className="input" {...form.register("prev_school")} />
              </Field>
              <Field
                label="Qualification"
                error={form.formState.errors.prev_qualification?.message}
              >
                <input
                  className="input"
                  placeholder="e.g. Rwanda Leaving Certificate"
                  {...form.register("prev_qualification")}
                />
              </Field>
              <Field
                label="Grade"
                error={form.formState.errors.prev_grade?.message}
              >
                <input
                  className="input"
                  placeholder="e.g. 78%"
                  {...form.register("prev_grade")}
                />
              </Field>
              <Field label="Combination (A-level)">
                <input
                  className="input"
                  placeholder="e.g. MCB, PCB, HEG"
                  {...form.register("combination")}
                />
              </Field>
              <Field
                label="Graduation year"
                error={form.formState.errors.graduation_year?.message}
              >
                <input
                  type="number"
                  className="input"
                  placeholder={String(CURRENT_YEAR - 1)}
                  min={1990}
                  max={CURRENT_YEAR}
                  {...form.register("graduation_year", { valueAsNumber: true })}
                />
              </Field>
            </div>
          </div>
        )}

        {/* ── Step 4: Sponsorship ── */}
        {step === 4 && (
          <div className="space-y-5 animate-fade-up">
            <SectionTitle
              title="How will you fund your studies?"
              sub="Government, self, private sponsor, or scholarship."
            />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field
                label="Sponsorship"
                error={form.formState.errors.sponsorship?.message}
              >
                <select className="input" {...form.register("sponsorship")}>
                  <option value="self">Self-sponsored</option>
                  <option value="government">Government</option>
                  <option value="private">Private sponsor</option>
                  <option value="scholarship">Scholarship</option>
                </select>
              </Field>
              <Field label="Sponsor name (if applicable)">
                <input className="input" {...form.register("sponsor_name")} />
              </Field>
            </div>
          </div>
        )}

        {/* ── Step 5: Review ── */}
        {step === REVIEW_STEP && (
          <div className="space-y-5 animate-fade-up">
            <SectionTitle
              title="Review your application"
              sub="Make sure everything is correct. The next step will be document upload."
            />
            <div className="grid sm:grid-cols-2 gap-4 text-[13px]">
              <Info
                k="Faculty"
                v={
                  selectedFaculty
                    ? `${selectedFaculty.name} (${selectedFaculty.code})`
                    : "—"
                }
              />
              <Info
                k="Department"
                v={
                  selectedDepartment
                    ? `${selectedDepartment.name} (${selectedDepartment.code})`
                    : "—"
                }
              />
              <Info k="Intake" v={form.watch("intake")} />
              <Info
                k="Name"
                v={`${form.watch("first_name")} ${form.watch("last_name")}`}
              />
              <Info k="Email" v={form.watch("email")} />
              <Info k="Phone" v={form.watch("phone")} />
              <Info k="Gender" v={form.watch("gender")} />
              <Info k="Birthdate" v={form.watch("birthdate")} />
              <Info k="Previous school" v={form.watch("prev_school")} />
              <Info k="Qualification" v={form.watch("prev_qualification")} />
              <Info k="Grade" v={form.watch("prev_grade")} />
              <Info
                k="Graduation year"
                v={String(form.watch("graduation_year") ?? "—")}
              />
              <Info k="Sponsorship" v={form.watch("sponsorship")} />
            </div>

            {requirements.length > 0 && (
              <div className="rounded-md border border-ink-100 bg-ink-50 p-4">
                <p className="text-[12px] font-semibold text-ink-700 mb-2">
                  You'll upload these on the next step:
                </p>
                <ul className="space-y-1">
                  {requirements.map((r) => (
                    <li
                      key={r.id}
                      className="text-[12.5px] flex items-center gap-1.5 text-ink-700"
                    >
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                      {r.document_type_name ??
                        `Document #${r.document_type_id}`}
                      {r.is_required ? (
                        ""
                      ) : (
                        <span className="text-ink-400 ml-1">(optional)</span>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div className="rounded-md bg-amber-50 border border-amber-200 px-4 py-3 text-[12.5px] text-amber-800">
              Clicking <b>Submit application</b> creates your file. You'll then
              be taken to the Documents step to upload your supporting papers.
            </div>
          </div>
        )}

        {/* ── Step 6: Documents (post-submission) ── */}
        {step === DOCUMENTS_STEP && successApp && (
          <DocumentsStep
            appNumber={successApp.application_number}
            onFinish={() =>
              navigate(`/apply/track?no=${successApp.application_number}`)
            }
          />
        )}

        {/* Nav buttons */}
        {step !== DOCUMENTS_STEP && (
          <div className="flex items-center justify-between pt-4 border-t border-ink-100">
            <button
              type="button"
              onClick={goPrev}
              className="btn-secondary"
              disabled={step === 1 || submitM.isPending}
            >
              <ArrowLeft className="w-3.5 h-3.5" /> Back
            </button>
            {step < REVIEW_STEP ? (
              <button
                type="button"
                onClick={goNext}
                className="btn-primary"
                disabled={
                  step === 1 &&
                  !!facultyId &&
                  !departmentsQ.isLoading &&
                  departments.length === 0
                }
              >
                Next <ArrowRight className="w-3.5 h-3.5" />
              </button>
            ) : (
              <button
                type="button"
                onClick={submitNow}
                className="btn-primary"
                disabled={submitM.isPending || !!successApp}
              >
                {submitM.isPending && (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                )}
                Submit application
              </button>
            )}
          </div>
        )}
      </form>

      {/* Existing applicant shortcut */}
      <p className="text-center text-[13px] text-ink-500 mt-6">
        Already applied?{" "}
        <Link
          to="/apply/track"
          className="text-brand font-semibold hover:underline inline-flex items-center gap-1"
        >
          Track your application <Search className="w-3 h-3" />
        </Link>
      </p>
    </Shell>
  );
}

/* ── Shell: common wrapper for public pages ── */
function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-[rgb(var(--bg-app))]">
      <header className="bg-white border-b border-ink-100 py-4">
        <div className="max-w-5xl mx-auto px-6 flex items-center justify-between">
          <Logo />
          <Link
            to="/login"
            className="text-[13px] text-ink-600 hover:text-brand"
          >
            Staff login →
          </Link>
        </div>
      </header>
      <main className="max-w-3xl mx-auto px-4 py-10">
        <div className="text-center mb-6">
          <h1 className="text-[28px] font-semibold text-ink-900 tracking-tight">
            Apply to CUR
          </h1>
          <p className="text-ink-500 text-[14px] mt-1">
            Begin your journey at Catholic University of Rwanda.
          </p>
        </div>
        {children}
      </main>
    </div>
  );
}

function SectionTitle({ title, sub }: { title: string; sub?: string }) {
  return (
    <div>
      <h2 className="text-[16px] font-semibold text-ink-900">{title}</h2>
      {sub && <p className="text-[12.5px] text-ink-500">{sub}</p>}
    </div>
  );
}

function Field({
  label,
  error,
  children,
}: {
  label: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="label">{label}</label>
      {children}
      {error && <p className="error-text">{error}</p>}
    </div>
  );
}

function Info({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div className="rounded-md bg-ink-50 px-3 py-2">
      <p className="text-[10.5px] uppercase tracking-wider font-semibold text-ink-400">
        {k}
      </p>
      <p className="text-ink-900 font-medium truncate">{v || "—"}</p>
    </div>
  );
}

/** Returns today's date as YYYY-MM-DD (used as the `max` on the DOB picker). */
function todayYMD(): string {
  const d = new Date();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

/* ─────────────────────────────────────────────────────────────
   Step 6 — Documents. Rendered inside the form shell after
   submission succeeds. Fetches the just-submitted application
   (for faculty_id / academic_year_id), loads its requirements,
   and lets the applicant upload each file in place.
   ───────────────────────────────────────────────────────────── */
function DocumentsStep({
  appNumber,
  onFinish,
}: {
  appNumber: string;
  onFinish: () => void;
}) {
  const trackQ = useQuery({
    queryKey: ["portal", "track", appNumber],
    queryFn: () => portalService.trackApplication(appNumber),
  });
  const app = trackQ.data?.data;

  const reqQ = useQuery({
    queryKey: ["portal", "requirements", app?.faculty_id],
    queryFn: () => portalService.getFacultyRequirements(app!.faculty_id),
    enabled: !!app?.faculty_id,
  });

  const requirements = reqQ.data?.data ?? [];
  const uploaded = app?.documents ?? [];
  const loading = trackQ.isLoading || reqQ.isLoading;

  return (
    <div className="space-y-5 animate-fade-up">
      <div className="rounded-md bg-emerald-50 border border-emerald-200 px-4 py-3 flex items-start gap-3">
        <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
        <div>
          <p className="text-[14px] font-semibold text-emerald-900">
            Application submitted — tracking number{" "}
            <span className="font-mono">{appNumber}</span>
          </p>
          <p className="text-[12.5px] text-emerald-800 mt-0.5">
            Save this number. You can use it at any time on the tracking page.
          </p>
        </div>
      </div>

      <SectionTitle
        title="Upload your documents"
        sub="Upload each required document. You can come back later via the tracking page."
      />

      {loading ? (
        <p className="text-[13px] text-ink-500 py-6 text-center flex items-center justify-center gap-2">
          <Loader2 className="w-4 h-4 animate-spin" /> Loading your checklist…
        </p>
      ) : (
        <DocumentsUploader
          requirements={requirements}
          uploaded={uploaded}
          onUpload={({ document_type_id, file }) =>
            portalService.uploadDocument(appNumber, { document_type_id, file })
          }
          invalidateKeys={[["portal", "track", appNumber]]}
          emptyHint="Your faculty has no configured document requirements for this round. You can skip this step and continue — the admissions team will contact you if anything is missing."
        />
      )}

      <div className="flex flex-col sm:flex-row items-center justify-between gap-2 pt-4 border-t border-ink-100">
        <Link to="/" className="btn-secondary">
          Back to home
        </Link>
        <button type="button" onClick={onFinish} className="btn-primary">
          Finish &amp; go to tracking <ArrowRight className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}
