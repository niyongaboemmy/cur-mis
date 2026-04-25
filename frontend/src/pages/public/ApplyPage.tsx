import { useState, useEffect } from "react";
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
  FileUp,
} from "lucide-react";
import Logo from "@/components/brand/Logo";
import { portalService, applicantService } from "@/services/admissionService";
import { useAuthStore } from "@/store/authStore";
import { useLogout } from "@/hooks/useAuth";
import DocumentsUploader from "@/components/ui/DocumentsUploader";
import ApplicantAuthGate from "./ApplicantAuthGate";
import Modal from "@/components/ui/Modal";

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

const schema = z.object({
  faculty_id: numberId("Please select a faculty"),
  department_id: numberId("Please select a department"),
  intake: z.string().min(1, "Required"),
  first_name: z.string().min(2, "Required"),
  last_name: z.string().min(2, "Required"),
  email: z.string().email("Valid email required"),
  phone: z.string().min(7, "Required"),
  gender: z.enum(["M", "F", "Other"]),
  birthdate: z.string().min(1, "Date of birth is required"),
  nationality: z.string().min(2, "Required").default("Rwandan"),
  address: z.string().optional(),
  prev_school: z.string().min(2, "Required"),
  prev_qualification: z.string().min(2, "Required"),
  prev_grade: z.string().min(1, "Required"),
  combination: z.string().optional(),
  graduation_year: z.preprocess(
    normaliseId,
    z.number().int().min(1990).max(CURRENT_YEAR),
  ),
  sponsorship: z.enum(["government", "self", "private", "scholarship"]),
  sponsor_name: z.string().optional(),
});

type FormValues = z.infer<typeof schema>;

const STEPS = [
  { id: 1, label: "Program", icon: GraduationCap },
  { id: 2, label: "Personal", icon: User },
  { id: 3, label: "Academic", icon: ScrollText },
  { id: 4, label: "Sponsorship", icon: Building2 },
  { id: 5, label: "Documents", icon: FileUp },
  { id: 6, label: "Review", icon: CheckCircle2 },
] as const;

export default function ApplyPage() {
  const [step, setStep] = useState(1);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [draftApp, setDraftApp] = useState<{
    id: number;
    application_number: string;
  } | null>(null);
  const { isAuthenticated, user } = useAuthStore();
  const navigate = useNavigate();

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      nationality: "Rwandan",
      gender: "M",
      sponsorship: "self",
    },
    mode: "onTouched",
  });

  useEffect(() => {
    if (isAuthenticated && user && step === 2) {
      const names = (user.full_name || "").split(" ");
      form.setValue("first_name", names[0] || "");
      form.setValue("last_name", names.slice(1).join(" ") || "");
      form.setValue("email", user.email);
    }
  }, [isAuthenticated, user, step, form]);

  const intakesQ = useQuery({
    queryKey: ["portal", "intakes"],
    queryFn: () => portalService.getIntakes(),
  });

  const facultyId    = form.watch("faculty_id");
  const departmentId = form.watch("department_id");

  const facultiesQ = useQuery({
    queryKey: ["portal", "faculties"],
    queryFn: () => portalService.getFaculties(),
  });

  const departmentsQ = useQuery({
    queryKey: ["portal", "departments", facultyId],
    queryFn: () => portalService.getFacultyDepartments(facultyId),
    enabled: !!facultyId,
  });


  const draftM = useMutation({
    mutationFn: (data: {
      faculty_id: number;
      department_id: number;
      intake: string;
    }) => applicantService.draftApplication(data),
    onSuccess: (r) => {
      setDraftApp(r.data);
      setStep(2);
    },
    onError: (e: any) =>
      toast.error(e?.response?.data?.message || "Failed to create draft"),
  });

  const submitM = useMutation({
    mutationFn: (data: FormValues) => applicantService.submitApplication(data),
    onSuccess: () => {
      toast.success("Application submitted successfully!");
      navigate("/applicant");
    },
    onError: (e: any) =>
      toast.error(e?.response?.data?.message || "Submission failed"),
  });

  const goNext = async () => {
    if (step === 1) {
      const ok = await form.trigger(["faculty_id", "department_id", "intake"]);
      if (!ok) return;
      if (!isAuthenticated) {
        setShowAuthModal(true);
        return;
      }
      draftM.mutate({
        faculty_id: form.getValues("faculty_id"),
        department_id: form.getValues("department_id"),
        intake: form.getValues("intake"),
      });
      return;
    }
    const stepKeys: Record<number, (keyof FormValues)[]> = {
      2: [
        "first_name",
        "last_name",
        "email",
        "phone",
        "gender",
        "birthdate",
        "nationality",
      ],
      3: ["prev_school", "prev_qualification", "prev_grade", "graduation_year"],
      4: ["sponsorship"],
    };
    const keys = stepKeys[step];
    if (keys) {
      const ok = await form.trigger(keys);
      if (ok) setStep((s) => s + 1);
    } else setStep((s) => s + 1);
  };

  const handleAuthSuccess = () => {
    setShowAuthModal(false);
    draftM.mutate({
      faculty_id: form.getValues("faculty_id"),
      department_id: form.getValues("department_id"),
      intake: form.getValues("intake"),
    });
  };

  const goPrev = () => setStep((s) => Math.max(s - 1, 1));


  const faculties    = facultiesQ.data?.data ?? [];
  const departments  = departmentsQ.data?.data ?? [];
  const intakes      = intakesQ.data?.data ?? [];

  // Combinations allowed by the selected department (from allowed_combinations JSON column)
  const selectedDeptCombinations: string[] = (() => {
    const dept = (departments as any[]).find((d: any) => Number(d.id) === Number(departmentId));
    try { return JSON.parse(dept?.allowed_combinations ?? '[]') } catch { return [] }
  })();

  return (
    <Shell>
      <section className="card p-4 mb-4">
        <div className="flex items-center justify-between overflow-x-auto gap-2 no-scrollbar">
          {STEPS.map((s, i) => {
            const Icon = s.icon;
            const done = step > s.id;
            const current = step === s.id;
            return (
              <div key={s.id} className="flex items-center gap-2 shrink-0">
                <div
                  className={`w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-semibold ${done ? "bg-emerald-500 text-white" : current ? "bg-brand text-white" : "bg-ink-100 text-ink-500"}`}
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

      <form
        onSubmit={(e) => e.preventDefault()}
        className="card p-6 md:p-8 space-y-6"
      >
        {step === 1 && (
          <div className="space-y-5 animate-fade-up">
            <SectionTitle
              title="Choose your program"
              sub="Select your desired faculty, department and intake."
            />
            <Field
              label="Faculty"
              error={form.formState.errors.faculty_id?.message}
            >
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
            </Field>
            <Field
              label="Department"
              error={form.formState.errors.department_id?.message}
            >
              <select
                className="input"
                {...form.register("department_id", { valueAsNumber: true })}
                disabled={!facultyId || departmentsQ.isLoading}
              >
                <option value="">
                  {departmentsQ.isLoading
                    ? "Loading..."
                    : "— select department —"}
                </option>
                {departments.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name} ({d.code})
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Intake" error={form.formState.errors.intake?.message}>
              <select className="input" {...form.register("intake")}>
                <option value="">— select intake —</option>
                {intakes.map((it) => (
                  <option key={it.id} value={it.name}>
                    {it.name}
                  </option>
                ))}
              </select>
            </Field>

            {intakes.length === 0 && !departmentsQ.isLoading && (
              <div className="p-4 bg-red-50 border border-red-100 rounded-lg text-red-700 text-[13px]">
                Applications are currently closed as there are no active intake
                periods. Please check back later.
              </div>
            )}
          </div>
        )}
        {step === 2 && (
          <div className="space-y-5 animate-fade-up">
            <SectionTitle
              title="Personal information"
              sub="Help us get to know you."
            />
            <div className="grid grid-cols-2 gap-4">
              <Field
                label="First Name"
                error={form.formState.errors.first_name?.message}
              >
                <input className="input" {...form.register("first_name")} />
              </Field>
              <Field
                label="Last Name"
                error={form.formState.errors.last_name?.message}
              >
                <input className="input" {...form.register("last_name")} />
              </Field>
            </div>
            <Field
              label="Email Address"
              error={form.formState.errors.email?.message}
            >
              <input
                className="input"
                type="email"
                {...form.register("email")}
                readOnly={isAuthenticated}
              />
            </Field>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Phone" error={form.formState.errors.phone?.message}>
                <input className="input" {...form.register("phone")} />
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
            </div>
            <div className="grid grid-cols-2 gap-4">
              <Field
                label="Date of Birth"
                error={form.formState.errors.birthdate?.message}
              >
                <input
                  type="date"
                  className="input"
                  {...form.register("birthdate")}
                />
              </Field>
              <Field
                label="Nationality"
                error={form.formState.errors.nationality?.message}
              >
                <input className="input" {...form.register("nationality")} />
              </Field>
            </div>
          </div>
        )}
        {step === 3 && (
          <div className="space-y-5 animate-fade-up">
            <SectionTitle
              title="Academic history"
              sub="Your previous educational attainments."
            />
            <Field
              label="Previous School"
              error={form.formState.errors.prev_school?.message}
            >
              <input className="input" {...form.register("prev_school")} />
            </Field>
            <div className="grid grid-cols-2 gap-4">
              <Field
                label="Qualification"
                error={form.formState.errors.prev_qualification?.message}
              >
                <input
                  className="input"
                  {...form.register("prev_qualification")}
                />
              </Field>
              <Field
                label="Grade/Points"
                error={form.formState.errors.prev_grade?.message}
              >
                <input className="input" {...form.register("prev_grade")} />
              </Field>
            </div>
            <Field
              label="Graduation Year"
              error={form.formState.errors.graduation_year?.message}
            >
              <input
                type="number"
                className="input"
                {...form.register("graduation_year", { valueAsNumber: true })}
              />
            </Field>
            <Field
              label="Subject Combination"
              error={form.formState.errors.combination?.message}
            >
              {selectedDeptCombinations.length > 0 ? (
                <div className="space-y-2">
                  <div className="flex flex-wrap gap-2">
                    {selectedDeptCombinations.map((c) => {
                      const selected = form.watch("combination") === c
                      return (
                        <button
                          key={c}
                          type="button"
                          onClick={() => form.setValue("combination", selected ? "" : c, { shouldValidate: true })}
                          className={`px-4 py-2 rounded-xl text-[13px] font-black uppercase tracking-wider border-2 transition-all ${
                            selected
                              ? "border-brand bg-brand text-white shadow-md shadow-brand/20"
                              : "border-ink-200 dark:border-ink-700 text-ink-600 dark:text-ink-300 hover:border-brand/50"
                          }`}
                        >
                          {c}
                        </button>
                      )
                    })}
                  </div>
                  <p className="text-[11px] text-ink-400">
                    Select the subject combination you studied in secondary school.
                  </p>
                </div>
              ) : (
                <input
                  className="input"
                  placeholder="e.g. PCM, PCB, MCE, HEG"
                  {...form.register("combination")}
                />
              )}
            </Field>
          </div>
        )}
        {step === 4 && (
          <div className="space-y-5 animate-fade-up">
            <SectionTitle
              title="Sponsorship"
              sub="How will your studies be funded?"
            />
            <Field
              label="Sponsorship Type"
              error={form.formState.errors.sponsorship?.message}
            >
              <select className="input" {...form.register("sponsorship")}>
                <option value="self">Self-sponsored</option>
                <option value="government">Government</option>
                <option value="private">Private</option>
                <option value="scholarship">Scholarship</option>
              </select>
            </Field>
            {form.watch("sponsorship") !== "self" && (
              <Field
                label="Sponsor Name"
                error={form.formState.errors.sponsor_name?.message}
              >
                <input className="input" {...form.register("sponsor_name")} />
              </Field>
            )}
          </div>
        )}
        {step === 5 && draftApp && (
          <div className="space-y-5 animate-fade-up">
            <SectionTitle
              title="Documents"
              sub="Upload required attachments."
            />
            <DocumentsStep
              appNumber={draftApp.application_number}
              onFinish={() => setStep(6)}
            />
          </div>
        )}
        {step === 6 && (
          <div className="space-y-5 animate-fade-up">
            <SectionTitle
              title="Final Review"
              sub="Please verify your details before submitting."
            />

            {/* Program */}
            <ReviewSection title="Program">
              <ReviewRow k="Faculty" v={faculties.find((f) => f.id === facultyId)?.name} />
              <ReviewRow k="Department" v={departments.find((d) => d.id === form.getValues("department_id"))?.name} />
              <ReviewRow k="Intake" v={form.getValues("intake")} />
            </ReviewSection>

            {/* Personal */}
            <ReviewSection title="Personal information">
              <ReviewRow k="Full name" v={`${form.getValues("first_name")} ${form.getValues("last_name")}`} />
              <ReviewRow k="Email" v={form.getValues("email")} />
              <ReviewRow k="Phone" v={form.getValues("phone")} />
              <ReviewRow k="Gender" v={form.getValues("gender") === "M" ? "Male" : form.getValues("gender") === "F" ? "Female" : "Other"} />
              <ReviewRow k="Date of birth" v={form.getValues("birthdate")} />
              <ReviewRow k="Nationality" v={form.getValues("nationality")} />
            </ReviewSection>

            {/* Academic */}
            <ReviewSection title="Academic history">
              <ReviewRow k="Previous school" v={form.getValues("prev_school")} />
              <ReviewRow k="Qualification" v={form.getValues("prev_qualification")} />
              <ReviewRow k="Grade / Points" v={form.getValues("prev_grade")} />
              <ReviewRow k="Graduation year" v={String(form.getValues("graduation_year") ?? "")} />
            </ReviewSection>

            {/* Sponsorship */}
            <ReviewSection title="Financing">
              <ReviewRow k="Sponsorship" v={form.getValues("sponsorship")} />
              {form.getValues("sponsor_name") && (
                <ReviewRow k="Sponsor name" v={form.getValues("sponsor_name")} />
              )}
            </ReviewSection>

            <div className="p-4 bg-brand/5 border border-brand/10 rounded-lg">
              <p className="text-[12.5px] text-brand-700 leading-relaxed">
                By submitting this application, you confirm that all information
                provided is accurate. A verification code will be sent to your
                email.
              </p>
            </div>
          </div>
        )}
        {step !== 5 && (
          <div className="flex justify-between items-center pt-6 border-t border-ink-100">
            <button
              type="button"
              onClick={goPrev}
              disabled={step === 1}
              className="btn-secondary"
            >
              <ArrowLeft className="w-4 h-4" /> Back
            </button>
            {step === 6 ? (
              <button
                type="button"
                onClick={() => submitM.mutate(form.getValues())}
                className="btn-primary"
                disabled={submitM.isPending}
              >
                {submitM.isPending ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  "Submit Application"
                )}
              </button>
            ) : (
              <button
                type="button"
                onClick={goNext}
                className="btn-primary"
                disabled={step === 1 && intakes.length === 0}
              >
                Next <ArrowRight className="w-4 h-4" />
              </button>
            )}
          </div>
        )}
      </form>

      <Modal
        open={showAuthModal}
        onClose={() => setShowAuthModal(false)}
        title=""
      >
        <ApplicantAuthGate onSuccess={handleAuthSuccess} />
      </Modal>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, user } = useAuthStore();
  const logoutM = useLogout();

  return (
    <div className="min-h-screen bg-slate-50/50">
      <header className="bg-white border-b border-ink-100 py-4 px-6 sticky top-0 z-50">
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <Logo />
          <div className="flex items-center gap-4">
            {isAuthenticated && user ? (
              <div className="flex items-center gap-3">
                <span className="text-[13px] font-medium text-ink-900">
                  Welcome, {user.full_name || user.username || 'Applicant'}
                </span>
                <div className="w-px h-4 bg-ink-200" />
                <button
                  onClick={() => logoutM.mutate()}
                  disabled={logoutM.isPending}
                  className="text-[13px] text-ink-600 hover:text-red-600 transition-colors"
                >
                  {logoutM.isPending ? 'Signing out...' : 'Sign Out'}
                </button>
              </div>
            ) : (
              <>
                <Link
                  to="/apply/track"
                  className="text-[13px] text-ink-600 hover:text-brand"
                >
                  Track Status
                </Link>
                <div className="w-px h-4 bg-ink-200" />
                <Link
                  to="/login"
                  className="text-[13px] text-ink-600 hover:text-brand"
                >
                  Staff Access
                </Link>
              </>
            )}
          </div>
        </div>
      </header>
      <main className="max-w-3xl mx-auto px-4 py-12">{children}</main>
    </div>
  );
}

function SectionTitle({ title, sub }: { title: string; sub?: string }) {
  return (
    <div className="space-y-1">
      <h2 className="text-[18px] font-semibold text-ink-900 tracking-tight">
        {title}
      </h2>
      {sub && <p className="text-[13px] text-ink-500 leading-relaxed">{sub}</p>}
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
    <div className="space-y-1.5">
      <label className="text-[13px] font-medium text-ink-700">{label}</label>
      {children}
      {error && (
        <p className="text-[12px] text-red-500 animate-in fade-in slide-in-from-top-1">
          {error}
        </p>
      )}
    </div>
  );
}

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
  const requirements = reqQ.data?.data?.requirements ?? [];
  const uploaded = app?.documents ?? [];

  const handleFinish = () => {
    const missing = requirements.filter(r => 
      r.is_required && !uploaded.some(u => u.document_type_id === r.document_type_id)
    );

    if (missing.length > 0) {
      toast.error(`Please upload all required documents: ${missing.map(m => m.document_type_name || m.document_name || 'Document').join(', ')}`);
      return;
    }

    onFinish();
  };

  return (
    <div className="space-y-6">
      <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-lg flex items-start gap-3">
        <CheckCircle2 className="w-5 h-5 text-emerald-600 mt-0.5" />
        <div>
          <p className="text-[13px] font-semibold text-emerald-900">
            Draft saved successfully
          </p>
          <p className="text-[12px] text-emerald-800">
            Your application number is {appNumber}.
          </p>
        </div>
      </div>
      <DocumentsUploader
        requirements={requirements}
        uploaded={uploaded}
        onUpload={({ document_type_id, file }) =>
          applicantService.uploadDocument({ document_type_id, file })
        }
        invalidateKeys={[["portal", "track", appNumber]]}
      />
      <div className="flex justify-end pt-4 border-t border-ink-100">
        <button onClick={handleFinish} className="btn-primary">
          Continue to Review <ArrowRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}

function ReviewSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-ink-100 overflow-hidden">
      <div className="bg-ink-50 dark:bg-ink-800 px-4 py-2 border-b border-ink-100">
        <p className="text-[11px] uppercase tracking-wider font-semibold text-ink-500">{title}</p>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-0 divide-y sm:divide-y-0 sm:divide-x divide-ink-100">
        {children}
      </div>
    </div>
  );
}

function ReviewRow({ k, v }: { k: string; v: string | undefined | null }) {
  return (
    <div className="px-4 py-3">
      <p className="text-[11px] text-ink-400 uppercase tracking-wider">{k}</p>
      <p className="text-[13px] font-medium text-ink-900 mt-0.5">{v || '—'}</p>
    </div>
  );
}
