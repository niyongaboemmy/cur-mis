import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import toast from "react-hot-toast";
import { Link, useNavigate } from "react-router-dom";
import {
  GraduationCap,
  User,
  ScrollText,
  CheckCircle2,
  Loader2,
  ArrowRight,
  ArrowLeft,
  FileUp,
  CreditCard,
  Camera,
  X as XIcon,
  Info,
  Hash,
  PlayCircle,
  Copy,
} from "lucide-react";
import Logo from "@/components/brand/Logo";
import { portalService, applicantService } from "@/services/admissionService";
import { systemService } from "@/services/systemService";
import { useAuthStore } from "@/store/authStore";
import { useLogout } from "@/hooks/useAuth";
import DocumentsUploader from "@/components/ui/DocumentsUploader";
import CountrySelect from "@/components/ui/CountrySelect";
import LocationSelect from "@/components/ui/LocationSelect";
import { ALL_DISTRICTS } from "@/data/rwandaLocations";
import ApplicantAuthGate from "./ApplicantAuthGate";
import Modal from "@/components/ui/Modal";

const GUEST_DRAFT_KEY = "apply_guest_draft_v1";

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
  // Personal — step 1
  first_name:           z.string().min(2, "Required"),
  last_name:            z.string().min(2, "Required"),
  father:               z.string().min(2, "Required"),
  mother:               z.string().min(2, "Required"),
  gender:               z.enum(["M", "F", "Other"]),
  birthdate:            z.string().min(1, "Date of birth is required"),
  marital_status:       z.enum(["single", "married", "divorced", "widowed", "other"]),
  phone:                z.string().min(7, "Required"),
  reference_phone:      z.string().min(7, "Required"),
  email:                z.string().email("Valid email required"),
  national_id:          z.string().min(5, "Required"),
  nationality:          z.string().min(2, "Required").default("Rwandan"),
  country_of_residence: z.string().min(2, "Required"),
  sponsorship:          z.enum(["government", "self", "private", "scholarship"]),
  sponsor_name:         z.string().optional(),
  disability:           z.string().optional(),
  // Residency — only the country is mandatory; the rest is optional
  // because applicants outside Rwanda may not have a 1:1 mapping.
  province:             z.string().optional(),
  district:             z.string().optional(),
  sector:               z.string().optional(),
  residence_district:   z.string().optional(),
  address:              z.string().optional(),

  // Academic — step 2
  prev_school:        z.string().min(2, "Required"),
  combination:        z.string().min(1, "Required"),
  a2_grades:          z.string().min(1, "Required"),
  // No practical upper bound: applicants with combined A-Level + equivalents
  // can legitimately list many principal passes. We keep a sanity ceiling
  // (20) to catch fat-finger entries.
  principal_passes:   z.preprocess(normaliseId, z.number().int().min(0).max(20)),
  graduation_year:    z.preprocess(
    normaliseId,
    z.number().int().min(1990).max(CURRENT_YEAR),
  ),
  serial_number:      z.string().min(1, "Required"),
  // Task 1.11 — credit transfer / upgrading. Optional flag + free-text
  // previous institution. Required only when the box is ticked.
  is_credit_transfer:   z.preprocess((v) => v === true || v === 'true' || v === '1' || v === 1, z.boolean()).optional(),
  credit_transfer_from: z.string().max(255).optional().or(z.literal('')),

  // Programs — step 3
  program_id:    numberId("Please select a program"),
  campus_id:     numberId("Please select a campus"),
  mode_of_study: z.string().min(1, "Please select a mode of study"),
  level_id:      numberId("Please select a level"),
  intake:        z.string().min(1, "Please select an intake"),
});

type FormValues = z.infer<typeof schema>;

const STEPS = [
  { id: 1, label: "Personal Info",  icon: User },
  { id: 2, label: "Academic Info",  icon: ScrollText },
  { id: 3, label: "Programs",       icon: GraduationCap },
  { id: 4, label: "Documents",      icon: FileUp },
  { id: 5, label: "Payment",        icon: CreditCard },
] as const;

const PERSONAL_FIELDS = [
  "first_name","last_name","father","mother","gender","birthdate","marital_status",
  "phone","reference_phone","email","national_id","nationality","country_of_residence",
  "sponsorship","sponsor_name","disability","province","district","sector","residence_district",
] as const;

const ACADEMIC_FIELDS = [
  "prev_school","combination","a2_grades","principal_passes","graduation_year","serial_number",
  "is_credit_transfer","credit_transfer_from",
] as const;

const PROGRAM_FIELDS = ["program_id","campus_id","mode_of_study","level_id","intake"] as const;

const MODE_OF_STUDY_OPTIONS = [
  'Day',
  'Evening',
  'Weekend',
  'Distance Learning',
] as const;

export default function ApplyPage() {
  const [step, setStep] = useState(1);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [draftApp, setDraftApp] = useState<{
    id: number;
    application_number: string;
  } | null>(null);
  const [draftLoaded, setDraftLoaded] = useState(false);
  const { isAuthenticated, user } = useAuthStore();
  const navigate = useNavigate();

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      nationality: "Rwandan",
      country_of_residence: "Rwanda",
      gender: "M",
      marital_status: "single",
      sponsorship: "self",
      disability: "None",
    },
    mode: "onTouched",
  });

  // Required-documents checklist for the current draft. Shares its react-query
  // cache with DocumentsStep, so the gate below and the list the applicant sees
  // can never disagree.
  const docs = useDocumentRequirements(draftApp?.application_number);

  // Local-only state for the passport photo (uploaded after the draft exists).
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);

  // Payment step (5) — held in component state because the slip is a File.
  // Urubuto Pay — the application fee must be confirmed by the gateway before
  // the applicant can submit. `paid` is driven by the status poll in PaymentStep.
  const [paid, setPaid] = useState(false);
  const [confirmAccurate, setConfirmAccurate] = useState(false);

  // Application fee amount — resolved from server (admin-configurable, public endpoint).
  // Falls back to 5000 RWF while loading or if the setting is not configured.
  const appFeeQ = useQuery({
    queryKey: ['portal', 'application-fee'],
    queryFn:  ({ signal }) => systemService.getPublicApplicationFee(signal),
    staleTime: 5 * 60_000,
  });
  const APPLICATION_FEE = appFeeQ.data?.data?.amount || 5000;

  // Persistent draft cache: holds every value the applicant types until a
  // server-side draft application has been created (which only happens at
  // step 3). Works for both anonymous and freshly-logged-in users — since
  // the draft is created late in the wizard, we need our own client-side
  // store to survive page refreshes and the auth gate.
  //
  // Hydrates form state from the cache on mount, regardless of auth — that
  // way a user who typed a few fields, refreshed, and is now logged in
  // doesn't lose anything.
  const hydrateFromCache = (overrideExisting = false) => {
    try {
      const raw = localStorage.getItem(GUEST_DRAFT_KEY);
      if (!raw) return null;
      const cached = JSON.parse(raw) as Partial<FormValues> & { _step?: number };
      const { _step, ...values } = cached;
      const current = form.getValues();
      const merged: Partial<FormValues> = {};
      (Object.keys(values) as (keyof FormValues)[]).forEach((k) => {
        const cur       = (current as any)[k];
        const cached_v  = (values as any)[k];
        const empty     = cur === undefined || cur === "" || cur === null;
        if ((overrideExisting || empty) && cached_v !== undefined && cached_v !== "") {
          (merged as any)[k] = cached_v;
        }
      });
      if (Object.keys(merged).length > 0) form.reset({ ...current, ...merged });
      return _step ?? null;
    } catch { return null; }
  };

  useEffect(() => {
    const cachedStep = hydrateFromCache();
    if (cachedStep && cachedStep >= 1 && cachedStep <= 3) setStep(cachedStep);
     
  }, []);

  // Autosave every form change to localStorage until a server draft has been
  // created. After that, the database is the source of truth and we stop
  // duplicating writes. Debounced 300 ms so typing isn't IO-bound, and step
  // is read through a ref so the subscription doesn't re-register on every
  // wizard advance (which previously caused frozen UI).
  const stepRef = useRef(step);
  useEffect(() => { stepRef.current = step; }, [step]);

  useEffect(() => {
    if (draftApp) return; // server draft exists → server is authoritative
    let timer: ReturnType<typeof setTimeout> | null = null;
    const flush = (values: any) => {
      try {
        const cleaned = Object.fromEntries(
          Object.entries(values).filter(([, v]) => v !== undefined && v !== "" && v !== null),
        );
        if (Object.keys(cleaned).length === 0) {
          localStorage.removeItem(GUEST_DRAFT_KEY);
        } else {
          localStorage.setItem(GUEST_DRAFT_KEY, JSON.stringify({ ...cleaned, _step: stepRef.current }));
        }
      } catch { /* quota / private mode — ignore */ }
    };
    const sub = form.watch((values) => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => flush(values), 300);
    });
    return () => {
      if (timer) clearTimeout(timer);
      sub.unsubscribe();
    };
  }, [draftApp, form]);

  // Detect an existing draft on mount and resume it instead of starting a new one.
  const draftsQ = useQuery({
    queryKey: ["applicant", "applications", "for-apply"],
    queryFn: () => applicantService.listApplications(),
    enabled: isAuthenticated && !draftLoaded,
  });

  useEffect(() => {
    if (draftLoaded || !draftsQ.data?.data) return;
    const draft = draftsQ.data.data.find((a) => a.status === "draft");
    if (!draft) {
      setDraftLoaded(true);
      return;
    }

    setDraftApp({ id: draft.id, application_number: draft.application_number });
    form.reset({
      // Personal
      first_name: draft.first_name || "",
      last_name: draft.last_name || "",
      father: (draft as any).father || "",
      mother: (draft as any).mother || "",
      email: draft.email || user?.email || "",
      phone: draft.phone && draft.phone !== "0000000000" ? draft.phone : "",
      reference_phone: (draft as any).reference_phone || "",
      gender: (draft.gender as any) || "M",
      birthdate: draft.birthdate || "",
      marital_status: ((draft as any).marital_status as any) || "single",
      nationality: draft.nationality || "Rwandan",
      country_of_residence: (draft as any).country_of_residence || "Rwanda",
      national_id: (draft as any).national_id || "",
      disability: (draft as any).disability || "None",
      address: draft.address || "",
      province: (draft as any).province || "",
      district: (draft as any).district || "",
      sector: (draft as any).sector || "",
      residence_district: (draft as any).residence_district || "",
      // Academic
      prev_school: draft.prev_school && draft.prev_school !== "N/A" ? draft.prev_school : "",
      combination: (draft as any).combination || "",
      a2_grades: (draft as any).a2_grades || "",
      principal_passes: (draft as any).principal_passes ?? undefined,
      graduation_year: draft.graduation_year || CURRENT_YEAR,
      serial_number: (draft as any).serial_number || "",
      // Programs
      program_id:    (draft as any).program_id    ?? undefined,
      campus_id:     (draft as any).campus_id     ?? undefined,
      mode_of_study: (draft as any).mode_of_study ?? "",
      level_id:      (draft as any).level_id      ?? undefined,
      intake: draft.intake,
      // Sponsorship (lives inside Personal Info now)
      sponsorship: (draft.sponsorship as any) || "self",
      sponsor_name: draft.sponsor_name || "",
    });
    const savedStep = Number(
      localStorage.getItem(`apply_wizard_step:${draft.id}`) || "",
    );
    const resumeStep = savedStep >= 1 && savedStep <= 5 ? savedStep : 1;
    setStep(resumeStep);
    setDraftLoaded(true);
    toast.success(`Resumed draft ${draft.application_number}`);
  }, [draftsQ.data, draftLoaded, form, user]);

  useEffect(() => {
    if (isAuthenticated && user && step === 1 && !draftApp) {
      const names = (user.full_name || "").split(" ");
      if (!form.getValues("first_name")) form.setValue("first_name", names[0] || "");
      if (!form.getValues("last_name"))  form.setValue("last_name", names.slice(1).join(" ") || "");
      if (!form.getValues("email"))      form.setValue("email", user.email);
    }
  }, [isAuthenticated, user, step, form, draftApp]);

  const intakesQ = useQuery({
    queryKey: ["portal", "intakes"],
    queryFn: () => portalService.getIntakes(),
  });

  const programId = form.watch("program_id");

  const programsQ = useQuery({
    queryKey: ["portal", "programs"],
    queryFn: () => portalService.getPrograms(),
  });

  const levelsQ = useQuery({
    queryKey: ["portal", "levels"],
    queryFn: () => portalService.getLevels(),
  });


  const draftM = useMutation({
    mutationFn: (data: {
      program_id?: number;
      faculty_id?: number;
      department_id?: number;
      campus_id?: number;
      mode_of_study?: string;
      level_id?: number;
      intake: string;
    }) => applicantService.draftApplication(data as any),
    onSuccess: async (r) => {
      const created = r.data;
      if (!created) return;
      setDraftApp(created);
      // Push all the personal + academic values we've been holding in form
      // state into the freshly-created draft. We also pull from the
      // localStorage cache as a backstop, so anything the user typed
      // pre-auth — but that for any reason isn't visible in current form
      // state — still lands in the database.
      try {
        const values = form.getValues();
        let cached: Record<string, any> = {};
        try {
          const raw = localStorage.getItem(GUEST_DRAFT_KEY);
          if (raw) {
            const parsed = JSON.parse(raw);
            delete parsed._step;
            cached = parsed;
          }
        } catch { /* ignore */ }

        const keys = [...PERSONAL_FIELDS, ...ACADEMIC_FIELDS] as (keyof FormValues)[];
        const payload: Record<string, any> = {};
        for (const k of keys) {
          const v = (values as any)[k];
          const cv = cached[k];
          // Prefer current form state if non-empty, else fall back to cache.
          const final = (v !== undefined && v !== "" && v !== null) ? v : cv;
          if (final !== undefined && final !== "" && final !== null) {
            payload[k] = final;
          }
        }
        if (Object.keys(payload).length > 0) {
          await applicantService.updateApplication(created.id, payload as any);
        }
        // If the user uploaded a passport photo before the draft existed,
        // push it now. Surface the failure as a toast so they know to retry —
        // previously this was silently swallowed and admins saw initials
        // forever, thinking they'd uploaded.
        if (photoFile) {
          try {
            await applicantService.uploadPhoto(photoFile);
          } catch (e: any) {
            toast.error(
              e?.response?.data?.message ??
              'We saved your application but couldn\'t upload your photo. Please retry from your profile.',
            );
          }
        }
      } catch (err: any) {
        toast.error(err?.response?.data?.message || "Saved program but couldn't sync earlier steps.");
      }
      // Successfully synced — clear the guest cache, the DB is now authoritative.
      try { localStorage.removeItem(GUEST_DRAFT_KEY); } catch { /* ignore */ }
      localStorage.setItem(`apply_wizard_step:${created.id}`, "4");
      setStep(4);
    },
    onError: (e: any) => {
      // Server returned an existing draft → resume it instead of failing.
      const existing = e?.response?.data?.errors?.draft;
      if (existing?.id) {
        toast.success(`Resuming your draft ${existing.application_number}`);
        navigate("/applicant");
        return;
      }
      toast.error(e?.response?.data?.message || "Failed to create draft");
    },
  });

  // Final submit. The application fee must already be confirmed by Urubuto Pay
  // (the backend also enforces this); we only call submitApplication here.
  const submitWithPaymentM = useMutation({
    mutationFn: async () => {
      if (!paid)            throw new Error("Please complete the application fee with Urubuto Pay first.");
      if (!confirmAccurate) throw new Error("Please confirm your information is accurate.");
      return applicantService.submitApplication(form.getValues() as any);
    },
    onSuccess: () => {
      if (draftApp) localStorage.removeItem(`apply_wizard_step:${draftApp.id}`);
      toast.success("Application submitted successfully!");
      navigate("/applicant");
    },
    onError: (e: any) =>
      toast.error(e?.response?.data?.message || e?.message || "Submission failed"),
  });

  // Per-step save: persist the current step's data on the draft so the user can resume.
  const saveStepM = useMutation({
    mutationFn: (payload: { id: number; data: Partial<FormValues> }) =>
      applicantService.updateApplication(payload.id, payload.data as any),
    onError: (e: any) =>
      toast.error(e?.response?.data?.message || "Could not save progress"),
  });

  const STEP_FIELDS: Record<number, readonly (keyof FormValues)[]> = {
    1: PERSONAL_FIELDS,
    2: ACADEMIC_FIELDS,
    3: PROGRAM_FIELDS,
  };

  const persistStep = async (currentStep: number, nextStep: number) => {
    if (!draftApp) return;
    const fields = STEP_FIELDS[currentStep];
    if (fields) {
      const values = form.getValues();
      const payload = Object.fromEntries(
        fields
          .map((k) => [k, values[k]])
          .filter(([, v]) => v !== undefined && v !== ""),
      ) as Partial<FormValues>;
      if (Object.keys(payload).length > 0) {
        await saveStepM.mutateAsync({ id: draftApp.id, data: payload });
      }
    }
    localStorage.setItem(
      `apply_wizard_step:${draftApp.id}`,
      String(nextStep),
    );
  };

  const goNext = async () => {
    // Validate the current step's fields
    const keys = STEP_FIELDS[step];
    if (keys) {
      const ok = await form.trigger(keys as any);
      if (!ok) return;
    }

    // Step 4 (Documents) has no form fields, so STEP_FIELDS has no entry for it
    // and the loop above waves it through — that let applicants click straight
    // past the upload step without attaching anything. Gate it on the
    // requirements checklist instead.
    if (step === 4 && !docs.canProceed) {
      toast.error(
        `Please upload: ${docs.missingRequired.join(", ")}`,
      );
      return;
    }

    // Step 1 (Personal) requires the applicant to be authenticated before
    // we can persist anything to a draft. Show the auth gate here.
    if (step === 1 && !isAuthenticated) {
      setShowAuthModal(true);
      return;
    }

    // Step 3 (Programs) is where the draft is created. Up until now we've
    // only been holding form state. Once program/campus/mode/level/intake
    // are set we materialise a draft application, then immediately push
    // the already-collected Personal & Academic values into it.
    if (step === 3 && !draftApp) {
      draftM.mutate({
        program_id:    form.getValues("program_id"),
        campus_id:     form.getValues("campus_id"),
        mode_of_study: form.getValues("mode_of_study"),
        level_id:      form.getValues("level_id"),
        intake:        form.getValues("intake"),
      });
      return;
    }

    // Otherwise: persist the current step on the existing draft and advance.
    try {
      await persistStep(step, step + 1);
    } catch {
      return;
    }
    setStep((s) => s + 1);
  };

  const handleAuthSuccess = () => {
    setShowAuthModal(false);
    // Backstop: re-merge any localStorage cache into form state so values
    // typed before sign-in/registration are guaranteed to survive the auth
    // round-trip (some browsers can drop in-flight form state during the
    // OTP modal redraw). We only fill empty fields so we never clobber
    // anything the user just typed.
    hydrateFromCache();
    setStep(2);
  };

  const goPrev = () => setStep((s) => Math.max(s - 1, 1));

  // Track which steps the applicant has completed so the top rail can be
  // navigated freely to anywhere they've already been (or where they
  // currently are). Forward-jumps to unvisited steps are not allowed.
  const [maxStepReached, setMaxStepReached] = useState(1);
  useEffect(() => {
    setMaxStepReached((m) => Math.max(m, step));
  }, [step]);

  const jumpToStep = async (target: number) => {
    if (target === step) return;
    if (target > maxStepReached) return; // can't fast-forward
    if (target > step) {
      // Navigating forward — validate steps in between as a courtesy.
      for (let s = step; s < target; s++) {
        const keys = STEP_FIELDS[s];
        if (keys) {
          const ok = await form.trigger(keys as any);
          if (!ok) { setStep(s); return; }
        }
        // Same documents gate as goNext(), so the step rail can't be used to
        // walk around it.
        if (s === 4 && !docs.canProceed) {
          toast.error(`Please upload: ${docs.missingRequired.join(", ")}`);
          setStep(4);
          return;
        }
      }
    }
    setStep(target);
    if (draftApp) localStorage.setItem(`apply_wizard_step:${draftApp.id}`, String(target));
  };

  const programs   = programsQ.data?.data ?? [];
  const levels     = levelsQ.data?.data ?? [];
  const rawIntakes = intakesQ.data?.data ?? [];
  const intakes    = rawIntakes.filter(
    (it: any, idx: number, arr: any[]) => arr.findIndex((x: any) => x.name === it.name) === idx
  );

  const selectedProgram = programs.find((p) => p.id === Number(programId));
  const selectedProgramCampuses = selectedProgram?.campuses ?? [];

  // Business rule: an applicant who already has a non-draft application
  // cannot start a new one — they're routed back to their applications list.
  const blockingApp = (draftsQ.data?.data ?? []).find(
    (a) => a.status !== 'draft',
  );
  if (isAuthenticated && blockingApp && !draftApp) {
    return (
      <Shell>
        <section className="card p-8 sm:p-10 max-w-xl mx-auto text-center space-y-5">
          <div className="w-14 h-14 rounded-2xl bg-amber-50 dark:bg-amber-900/20 flex items-center justify-center mx-auto text-amber-600">
            <Info className="w-7 h-7" />
          </div>
          <div>
            <h2 className="text-[20px] font-bold text-ink-900 dark:text-white">
              You already have an active application
            </h2>
            <p className="text-[13.5px] text-ink-500 dark:text-ink-400 mt-2 leading-relaxed">
              Your application{' '}
              <span className="font-mono font-semibold text-brand">
                {blockingApp.application_number}
              </span>{' '}
              is currently <span className="font-semibold capitalize">{String(blockingApp.status).replace(/_/g, ' ')}</span>.
              You can only start a new application once all your previous applications are still in draft.
            </p>
          </div>
          <div className="flex items-center justify-center gap-3 flex-wrap pt-2">
            <Link to="/applicant" className="btn-primary">
              View My Applications <ArrowRight className="w-4 h-4" />
            </Link>
            <Link to="/" className="btn-secondary">Back to Home</Link>
          </div>
        </section>
      </Shell>
    );
  }

  return (
    <Shell>
      <section className="card p-4 mb-4">
        <div className="flex items-center justify-between overflow-x-auto gap-2 no-scrollbar">
          {STEPS.map((s, i) => {
            const Icon = s.icon;
            const done = step > s.id;
            const current = step === s.id;
            const reachable = s.id <= maxStepReached;
            return (
              <div key={s.id} className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => reachable && jumpToStep(s.id)}
                  disabled={!reachable}
                  title={reachable ? `Go to ${s.label}` : 'Complete the previous steps first'}
                  className={`flex items-center gap-2 rounded-full pl-1 pr-2.5 py-1 transition-colors ${
                    reachable ? 'cursor-pointer hover:bg-ink-50 dark:hover:bg-ink-800/50' : 'cursor-not-allowed opacity-60'
                  }`}
                >
                  <span
                    className={`w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-semibold ${
                      done ? 'bg-emerald-500 text-white'
                           : current ? 'bg-brand text-white'
                                     : 'bg-ink-100 dark:bg-ink-700 text-ink-500 dark:text-ink-400'
                    }`}
                  >
                    {done ? <CheckCircle2 className="w-3.5 h-3.5" /> : <Icon className="w-3.5 h-3.5" />}
                  </span>
                  <span className={`text-[12.5px] font-medium ${current ? 'text-ink-900 dark:text-white' : 'text-ink-500'}`}>
                    {s.label}
                  </span>
                </button>
                {i < STEPS.length - 1 && (
                  <span className="w-6 h-px bg-ink-200 shrink-0" />
                )}
              </div>
            );
          })}
        </div>
      </section>

      <form
        onSubmit={(e) => e.preventDefault()}
        className="card p-4 sm:p-6 md:p-8 lg:p-10 space-y-6"
      >
        {step === 1 && (
          <PersonalInfoStep
            form={form}
            isAuthenticated={isAuthenticated}
            photoFile={photoFile}
            photoPreview={photoPreview}
            onPickPhoto={(file) => {
              if (!file) {
                setPhotoFile(null);
                if (photoPreview) URL.revokeObjectURL(photoPreview);
                setPhotoPreview(null);
                return;
              }
              if (file.size > 2 * 1024 * 1024) {
                toast.error("Photo must be 2 MB or smaller");
                return;
              }
              if (!/^image\/(jpe?g|png)$/i.test(file.type)) {
                toast.error("Photo must be JPG or PNG");
                return;
              }
              if (photoPreview) URL.revokeObjectURL(photoPreview);
              setPhotoFile(file);
              setPhotoPreview(URL.createObjectURL(file));
            }}
          />
        )}

        {step === 2 && (
          <AcademicInfoStep form={form} />
        )}

        {step === 3 && (
          <ProgramsStep
            form={form}
            programs={programs}
            campuses={selectedProgramCampuses}
            levels={levels}
            intakes={intakes}
          />
        )}

        {step === 4 && draftApp && (
          <div className="space-y-5 animate-fade-up">
            <SectionTitle title="Documents" sub="Step 4 of 5 — Upload your required attachments." />
            <DocumentsStep appNumber={draftApp.application_number} />
          </div>
        )}

        {step === 5 && (
          <PaymentStep
            form={form}
            fee={APPLICATION_FEE}
            programs={programs}
            campuses={selectedProgramCampuses}
            levels={levels}
            paid={paid}
            onPaidChange={setPaid}
            confirmAccurate={confirmAccurate}
            onConfirmChange={setConfirmAccurate}
          />
        )}

        {/* Always-visible bottom nav: Previous + Continue/Submit. */}
        <div className="flex justify-between items-center pt-6 border-t border-ink-100 dark:border-ink-700 gap-3 flex-wrap">
          <button
            type="button"
            onClick={goPrev}
            disabled={step === 1}
            className="btn-secondary"
          >
            <ArrowLeft className="w-4 h-4" /> Previous
          </button>
          {step === 5 ? (
            <button
              type="button"
              onClick={() => submitWithPaymentM.mutate()}
              className="btn-primary"
              disabled={submitWithPaymentM.isPending || !confirmAccurate || !paid}
            >
              {submitWithPaymentM.isPending ? (
                <><Loader2 className="w-4 h-4 animate-spin" /> Submitting…</>
              ) : (
                <>Submit Application <ArrowRight className="w-4 h-4" /></>
              )}
            </button>
          ) : (
            <button
              type="button"
              onClick={goNext}
              className="btn-primary"
              disabled={
                (step === 3 && (intakes.length === 0 || programs.length === 0)) ||
                (step === 4 && (docs.isLoading || !docs.canProceed)) ||
                saveStepM.isPending ||
                draftM.isPending
              }
              title={
                step === 4 && !docs.canProceed
                  ? `Upload ${docs.missingRequired.join(", ")} to continue`
                  : undefined
              }
            >
              {saveStepM.isPending || draftM.isPending ? (
                <><Loader2 className="w-4 h-4 animate-spin" /> Saving…</>
              ) : step === 4 ? (
                <>Proceed to Payment <ArrowRight className="w-4 h-4" /></>
              ) : (
                <>Continue <ArrowRight className="w-4 h-4" /></>
              )}
            </button>
          )}
        </div>
      </form>

      <Modal
        open={showAuthModal}
        onClose={() => setShowAuthModal(false)}
        title=""
      >
        <ApplicantAuthGate
          onSuccess={handleAuthSuccess}
          prefill={{
            first_name: form.getValues("first_name"),
            last_name:  form.getValues("last_name"),
            email:      form.getValues("email"),
          }}
        />
      </Modal>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, user } = useAuthStore();
  const logoutM = useLogout();
  const videosQ = useQuery({
    queryKey: ['portal', 'guidance-videos'],
    queryFn: () => systemService.getGuidanceVideos(),
    staleTime: 60_000,
  });
  const applyUrl = videosQ.data?.data?.video_application_guide_url ?? '';

  return (
    <div className="min-h-screen bg-slate-50/50 dark:bg-ink-900">
      <header className="bg-white dark:bg-ink-800 border-b border-ink-100 dark:border-ink-700 py-4 px-4 sm:px-6 sticky top-0 z-50">
        <div className="w-full max-w-7xl mx-auto flex items-center justify-between">
          <Logo />
          <div className="flex items-center gap-4">
            {applyUrl && (
              <>
                <a
                  href={applyUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1.5 text-[13px] font-medium text-brand hover:underline"
                  title="Watch the step-by-step guide on how to apply"
                >
                  <PlayCircle className="w-4 h-4" />
                  Watch: How to apply
                </a>
                <div className="w-px h-4 bg-ink-200 dark:bg-ink-700" />
              </>
            )}
            {isAuthenticated && user ? (
              <div className="flex items-center gap-3">
                <span className="text-[13px] font-medium text-ink-900 dark:text-white">
                  Welcome, {user.full_name || user.username || 'Applicant'}
                </span>
                <div className="w-px h-4 bg-ink-200 dark:bg-ink-700" />
                <button
                  onClick={() => logoutM.mutate()}
                  disabled={logoutM.isPending}
                  className="text-[13px] text-ink-600 dark:text-ink-300 hover:text-red-600 dark:hover:text-red-400 transition-colors"
                >
                  {logoutM.isPending ? 'Signing out...' : 'Sign Out'}
                </button>
              </div>
            ) : (
              <>
                <Link
                  to="/apply/track"
                  className="text-[13px] text-ink-600 dark:text-ink-300 hover:text-brand"
                >
                  Track Status
                </Link>
                <div className="w-px h-4 bg-ink-200 dark:bg-ink-700" />
                <Link
                  to="/login"
                  className="text-[13px] text-ink-600 dark:text-ink-300 hover:text-brand"
                >
                  Staff Access
                </Link>
              </>
            )}
          </div>
        </div>
      </header>
      <main className="w-full max-w-[min(1280px,100%-2rem)] sm:max-w-[min(1280px,100%-2.5rem)] lg:max-w-6xl xl:max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 md:py-12">{children}</main>
    </div>
  );
}

function SectionTitle({ title, sub }: { title: string; sub?: string }) {
  return (
    <div className="space-y-1">
      <h2 className="text-[18px] font-semibold text-ink-900 dark:text-white tracking-tight">
        {title}
      </h2>
      {sub && <p className="text-[13px] text-ink-500 dark:text-ink-400 leading-relaxed">{sub}</p>}
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
      <label className="text-[13px] font-medium text-ink-700 dark:text-ink-200">{label}</label>
      {children}
      {error && (
        <p className="text-[12px] text-red-500 animate-in fade-in slide-in-from-top-1">
          {error}
        </p>
      )}
    </div>
  );
}

/**
 * Requirements checklist + upload state for a draft application.
 *
 * Shared by DocumentsStep (which renders it) and ApplyPage (which gates the
 * "Proceed to Payment" button on it). Both call it with the same query keys, so
 * react-query serves one cached result rather than fetching twice.
 */
function useDocumentRequirements(appNumber: string | undefined) {
  const trackQ = useQuery({
    queryKey: ["portal", "track", appNumber],
    queryFn: () => portalService.trackApplication(appNumber!),
    enabled: !!appNumber,
  });
  const app = trackQ.data?.data;

  const reqQ = useQuery({
    queryKey: ["portal", "requirements", app?.faculty_id],
    queryFn: () => portalService.getFacultyRequirements(app!.faculty_id),
    enabled: !!app?.faculty_id,
  });

  const requirements = reqQ.data?.data?.requirements ?? [];
  const uploaded     = app?.documents ?? [];

  const uploadedTypeIds = new Set(uploaded.map((d) => d.document_type_id));
  const missingRequired = requirements
    .filter((r) => r.is_required && !uploadedTypeIds.has(r.document_type_id))
    .map((r) => r.document_type_name || r.document_name || "Required document");

  return {
    requirements,
    uploaded,
    missingRequired,
    // Don't gate on data we haven't loaded yet — an applicant must never be
    // blocked by a still-in-flight request.
    isLoading: trackQ.isLoading || reqQ.isLoading,
    canProceed: missingRequired.length === 0,
  };
}

function DocumentsStep({
  appNumber,
}: {
  appNumber: string;
}) {
  const { requirements, uploaded, missingRequired } = useDocumentRequirements(appNumber);

  return (
    <div className="space-y-6">
      {missingRequired.length > 0 && (
        <div className="p-4 bg-amber-50 dark:bg-amber-900/10 border border-amber-200 dark:border-amber-900/40 rounded-lg flex items-start gap-3">
          <Info className="w-5 h-5 text-amber-600 mt-0.5 shrink-0" />
          <div>
            <p className="text-[13px] font-semibold text-amber-900 dark:text-amber-200">
              {missingRequired.length} required document
              {missingRequired.length > 1 ? "s" : ""} still missing
            </p>
            <p className="text-[12px] text-amber-800 dark:text-amber-300/90 mt-0.5">
              Upload {missingRequired.join(", ")} to continue.
            </p>
          </div>
        </div>
      )}
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
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────────
 * Personal Info — step 1
 * Mirrors the layout shown in the design (passport photo upload + a
 * dense two-column grid of personal/contact/residency/sponsor fields).
 * ──────────────────────────────────────────────────────────────────── */

function PersonalInfoStep({
  form, isAuthenticated, photoFile, photoPreview, onPickPhoto,
}: {
  form: ReturnType<typeof useForm<FormValues>>;
  isAuthenticated: boolean;
  photoFile: File | null;
  photoPreview: string | null;
  onPickPhoto: (file: File | null) => void;
}) {
  const sponsorship = form.watch("sponsorship");
  const errors = form.formState.errors;

  return (
    <div className="space-y-8 animate-fade-up">
      <SectionTitle title="Tell us about yourself" sub="Step 1 of 5 — Personal information" />

      {/* ── Identity ─────────────────────────────────────────────── */}
      <FieldGroup title="Identity">
        <div className="grid grid-cols-1 md:grid-cols-[180px_1fr] gap-6 items-start">
          <div className="flex flex-col items-center text-center">
            <label
              className="relative w-32 h-32 rounded-full overflow-hidden bg-ink-100 dark:bg-ink-800 flex items-center justify-center cursor-pointer hover:ring-2 hover:ring-brand/30 transition"
              title="Click to choose a passport photo"
            >
              {photoPreview ? (
                <img src={photoPreview} alt="Passport preview" className="w-full h-full object-cover" />
              ) : (
                <Camera className="w-8 h-8 text-ink-400 dark:text-ink-500" />
              )}
              <input
                type="file"
                accept="image/jpeg,image/png"
                className="hidden"
                onChange={(e) => onPickPhoto(e.target.files?.[0] ?? null)}
              />
            </label>
            {photoFile && (
              <button
                type="button"
                onClick={() => onPickPhoto(null)}
                className="mt-2 inline-flex items-center gap-1 text-[11px] text-rose-600 hover:underline"
              >
                <XIcon className="w-3 h-3" /> Remove
              </button>
            )}
            <p className="mt-2 text-[11px] font-bold uppercase tracking-wider text-ink-700 dark:text-ink-200">
              Upload Passport Photo
            </p>
            <p className="text-[11px] text-ink-500 dark:text-ink-400">(Max 2MB, JPG/PNG)</p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <Field label="First Name *" error={errors.first_name?.message}>
              <input className="input" placeholder="John" {...form.register("first_name")} />
            </Field>
            <Field label="Last Name *" error={errors.last_name?.message}>
              <input className="input" placeholder="Doe" {...form.register("last_name")} />
            </Field>
            <Field label="Gender *" error={errors.gender?.message}>
              <select className="input" {...form.register("gender")}>
                <option value="">Select Gender</option>
                <option value="M">Male</option>
                <option value="F">Female</option>
                <option value="Other">Other</option>
              </select>
            </Field>
            <Field label="Father's Name *" error={errors.father?.message}>
              <input className="input" placeholder="Father's full name" {...form.register("father")} />
            </Field>
            <Field label="Mother's Name *" error={errors.mother?.message}>
              <input className="input" placeholder="Mother's full name" {...form.register("mother")} />
            </Field>
            <Field label="Marital Status *" error={errors.marital_status?.message}>
              <select className="input" {...form.register("marital_status")}>
                <option value="single">Single</option>
                <option value="married">Married</option>
                <option value="divorced">Divorced</option>
                <option value="widowed">Widowed</option>
                <option value="other">Other</option>
              </select>
            </Field>
            <Field label="Date of Birth *" error={errors.birthdate?.message}>
              <input type="date" className="input" {...form.register("birthdate")} />
            </Field>
            <Field label="National ID / Passport Number *" error={errors.national_id?.message}>
              <input className="input" placeholder="National ID or Passport No." {...form.register("national_id")} />
            </Field>
            <Field label="Nationality *" error={errors.nationality?.message}>
              <CountrySelect
                mode="nationality"
                value={form.watch("nationality") || ""}
                onChange={(v) => form.setValue("nationality", v, { shouldValidate: true, shouldDirty: true })}
                placeholder="Select nationality"
              />
            </Field>
          </div>
        </div>
      </FieldGroup>

      {/* ── Contact ──────────────────────────────────────────────── */}
      <FieldGroup title="Contact">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <Field label="Phone Number *" error={errors.phone?.message}>
            <input className="input" placeholder="0781234567" {...form.register("phone")} />
          </Field>
          <Field label="Reference Person Phone *" error={errors.reference_phone?.message}>
            <input className="input" placeholder="0721234567" {...form.register("reference_phone")} />
          </Field>
          <Field label="Email Address *" error={errors.email?.message}>
            <input
              className="input"
              type="email"
              placeholder="example@domain.com"
              {...form.register("email")}
              readOnly={isAuthenticated}
            />
          </Field>
        </div>
      </FieldGroup>

      {/* ── Sponsor / Disability ─────────────────────────────────── */}
      <FieldGroup title="Sponsorship & Accessibility">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <Field label="Sponsor *" error={errors.sponsorship?.message}>
            <select className="input" {...form.register("sponsorship")}>
              <option value="self">Self-sponsored</option>
              <option value="government">Government</option>
              <option value="private">Private</option>
              <option value="scholarship">Scholarship</option>
            </select>
          </Field>
          {sponsorship !== 'self' && (
            <Field label="Sponsor Name" error={errors.sponsor_name?.message}>
              <input className="input" placeholder="Name of sponsor" {...form.register("sponsor_name")} />
            </Field>
          )}
          <Field label="Disability" error={errors.disability?.message}>
            <select className="input" {...form.register("disability")}>
              <option value="None">None</option>
              <option value="Visual">Visual</option>
              <option value="Hearing">Hearing</option>
              <option value="Physical / Mobility">Physical / Mobility</option>
              <option value="Cognitive">Cognitive</option>
              <option value="Other">Other</option>
            </select>
          </Field>
        </div>
      </FieldGroup>

      {/* ── Residency ────────────────────────────────────────────── */}
      <FieldGroup
        title="Residency"
        sub="Country is required. Province, district and sector are optional and only relevant for residents of Rwanda."
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <Field label="Country of Residence *" error={errors.country_of_residence?.message}>
            <CountrySelect
              mode="country"
              value={form.watch("country_of_residence") || ""}
              onChange={(v) => form.setValue("country_of_residence", v, { shouldValidate: true, shouldDirty: true })}
              placeholder="Select country"
            />
          </Field>
          {/* Cascading picker: choosing a province narrows the district list to
              that province's districts, so an impossible pairing can't be
              typed. Sector falls back to free text until the official sector
              dataset is loaded — see @/data/rwandaLocations. */}
          <LocationSelect
            levels={["province", "district", "sector"]}
            value={{
              province: form.watch("province") ?? "",
              district: form.watch("district") ?? "",
              sector:   form.watch("sector")   ?? "",
            }}
            onChange={(next) => {
              const opts = { shouldValidate: true, shouldDirty: true } as const;
              form.setValue("province", next.province ?? "", opts);
              form.setValue("district", next.district ?? "", opts);
              form.setValue("sector",   next.sector   ?? "", opts);
            }}
            renderField={({ label, control, level }) => (
              <Field
                label={label}
                error={errors[level as "province" | "district" | "sector"]?.message}
              >
                {control}
              </Field>
            )}
          />
          <Field label="Residence District" error={errors.residence_district?.message}>
            <select className="input" {...form.register("residence_district")}>
              <option value="">District you currently live in</option>
              {ALL_DISTRICTS.map((d) => <option key={d} value={d}>{d}</option>)}
            </select>
          </Field>
        </div>
      </FieldGroup>
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────────
 * Academic Info — step 2
 * Mirrors the NESA / A-level transcript so applicants can copy from
 * their physical document directly: school, combination, A2 grades,
 * principal passes, completion year, serial number.
 * ──────────────────────────────────────────────────────────────────── */

function AcademicInfoStep({ form }: { form: ReturnType<typeof useForm<FormValues>> }) {
  const errors = form.formState.errors;
  return (
    <div className="space-y-6 animate-fade-up">
      <SectionTitle
        title="Academic background"
        sub="Step 2 of 5 — Tell us about your secondary-school results."
      />

      <div className="rounded-xl border border-ink-100 dark:border-ink-800 bg-white/40 dark:bg-ink-900/40 p-4 sm:p-5">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <Field label="Attended Secondary School *" error={errors.prev_school?.message}>
            <input className="input" placeholder="Nyamata TSS" {...form.register("prev_school")} />
          </Field>
          <Field label="Combination / Section *" error={errors.combination?.message}>
            <input className="input" placeholder="CEL" {...form.register("combination")} />
          </Field>
          <Field
            label="A2 Grades (separated by commas) *"
            error={errors.a2_grades?.message}
          >
            <input className="input" placeholder="A,A,B,C" {...form.register("a2_grades")} />
          </Field>
          <Field label="Principal Passes *" error={errors.principal_passes?.message}>
            <input
              type="number"
              min={0}
              max={20}
              className="input"
              placeholder="4"
              {...form.register("principal_passes", { valueAsNumber: true })}
            />
          </Field>
          <Field label="Completion Year *" error={errors.graduation_year?.message}>
            <input
              type="number"
              className="input"
              placeholder="2024"
              {...form.register("graduation_year", { valueAsNumber: true })}
            />
          </Field>
          <Field label="Serial Number *" error={errors.serial_number?.message}>
            <input
              className="input"
              placeholder="From your A-level certificate"
              {...form.register("serial_number")}
            />
          </Field>
        </div>

        {/* Task 1.11 — credit transfer flag */}
        <div className="mt-4 pt-4 border-t border-ink-100 dark:border-ink-700/60">
          <label className="flex items-start gap-2 cursor-pointer">
            <input
              type="checkbox"
              className="mt-0.5 accent-brand"
              {...form.register("is_credit_transfer")}
            />
            <div className="text-[13px] text-ink-700 dark:text-ink-200">
              <strong>I am applying via credit transfer / upgrading.</strong>
              <p className="text-[12px] text-ink-500 dark:text-ink-400 mt-0.5">
                Check this if you have prior study credits from another institution. The
                faculty will then issue an exemption letter before your admission letter is released.
              </p>
            </div>
          </label>
          {form.watch("is_credit_transfer") && (
            <div className="mt-3">
              <Field
                label="Previous institution / programme"
                error={errors.credit_transfer_from?.message}
              >
                <input
                  className="input"
                  placeholder="e.g. UR Huye — BBA, 2022–2024"
                  {...form.register("credit_transfer_from")}
                />
              </Field>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────────
 * Programs — step 3
 * Two-column layout: left side is a searchable, scrollable list of
 * available programs (single select); right side reveals campus / mode
 * / level / intake once a program has been chosen.
 * ──────────────────────────────────────────────────────────────────── */

function ProgramsStep({
  form, programs, campuses, levels, intakes,
}: {
  form: ReturnType<typeof useForm<FormValues>>;
  programs: Array<{
    id: number; name: string;
    department_name: string | null; faculty_name: string | null;
    campuses: Array<{ id: number; name: string; code: string | null; location: string | null }>;
  }>;
  campuses: Array<{ id: number; name: string; code: string | null; location: string | null }>;
  levels: Array<{ id: number; name: string }>;
  intakes: Array<{ id: number; name: string }>;
}) {
  const [search, setSearch] = useState('');
  const errors = form.formState.errors;
  const selectedProgramId = Number(form.watch("program_id"));

  const filtered = programs.filter((p) => {
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return (
      p.name.toLowerCase().includes(q) ||
      (p.department_name ?? '').toLowerCase().includes(q) ||
      (p.faculty_name ?? '').toLowerCase().includes(q)
    );
  });

  const pickProgram = (id: number) => {
    form.setValue("program_id", id, { shouldValidate: true, shouldDirty: true });
    // Reset campus when program changes — the available set may differ.
    form.setValue("campus_id", undefined as any, { shouldValidate: false });
  };

  return (
    <div className="space-y-6 animate-fade-up">
      <SectionTitle
        title="Select your preferred program"
        sub="Step 3 of 5 — Pick a program first, then set your campus, mode of study and level."
      />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* ── Program list ───────────────────────────────────────── */}
        <FieldGroup title="Choose Program *">
          <div className="relative mb-3">
            <input
              className="input pr-9"
              placeholder="Search by name, department or faculty…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          {programs.length === 0 ? (
            <div className="rounded-md border border-dashed border-ink-200 dark:border-ink-700 p-4 text-center text-ink-500 dark:text-ink-400 text-[13px]">
              No active programs to display.
            </div>
          ) : (
            <div className="max-h-[420px] overflow-y-auto rounded-md border border-ink-100 dark:border-ink-700 divide-y divide-ink-100 dark:divide-ink-800">
              {filtered.map((p) => {
                const checked = p.id === selectedProgramId;
                return (
                  <label
                    key={p.id}
                    className={`flex items-start gap-3 p-3 cursor-pointer transition-colors ${
                      checked ? 'bg-brand/10' : 'hover:bg-ink-50 dark:hover:bg-ink-800/40'
                    }`}
                  >
                    <input
                      type="radio"
                      className="mt-1 accent-brand"
                      name="program_id"
                      checked={checked}
                      onChange={() => pickProgram(p.id)}
                    />
                    <div className="min-w-0 flex-1">
                      <p className={`text-[13.5px] font-semibold leading-snug ${checked ? 'text-brand' : 'text-ink-900 dark:text-white'}`}>
                        {p.name}
                      </p>
                      <p className="text-[11.5px] text-ink-500 dark:text-ink-400 truncate mt-0.5">
                        {p.department_name ?? '—'}
                        {p.faculty_name ? ` · ${p.faculty_name}` : ''}
                      </p>
                      {p.campuses.length > 0 && (
                        <p className="text-[10.5px] text-ink-400 dark:text-ink-500 truncate mt-0.5">
                          Available on: {p.campuses.map((c) => c.name).join(', ')}
                        </p>
                      )}
                    </div>
                  </label>
                );
              })}
              {filtered.length === 0 && (
                <p className="p-4 text-center text-ink-400 dark:text-ink-500 text-[12.5px]">No programs match your search.</p>
              )}
            </div>
          )}
          {errors.program_id?.message && <p className="error-text mt-2">{errors.program_id.message}</p>}
        </FieldGroup>

        {/* ── Campus / Mode / Level / Intake ─────────────────────── */}
        <FieldGroup title="Study options">
          {!selectedProgramId ? (
            <div className="rounded-md border border-dashed border-ink-200 dark:border-ink-700 p-6 text-center text-ink-500 dark:text-ink-400 text-[13px]">
              Select a program on the left to choose your campus, mode of study, level and intake.
            </div>
          ) : (
            <div className="space-y-4">
              <Field label="Choose Campus *" error={errors.campus_id?.message}>
                {campuses.length === 0 ? (
                  <p className="text-[12.5px] text-amber-600 italic">
                    This program has no campuses configured yet — please contact admissions.
                  </p>
                ) : (
                  <select
                    className="input"
                    {...form.register("campus_id", { valueAsNumber: true })}
                  >
                    <option value="">— select campus —</option>
                    {campuses.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}{c.location ? ` · ${c.location}` : ''}
                      </option>
                    ))}
                  </select>
                )}
              </Field>

              <Field label="Mode of Study *" error={errors.mode_of_study?.message}>
                <select className="input" {...form.register("mode_of_study")}>
                  <option value="">— select mode —</option>
                  {MODE_OF_STUDY_OPTIONS.map((m) => (
                    <option key={m} value={m}>{m}</option>
                  ))}
                </select>
              </Field>

              <Field label="Level *" error={errors.level_id?.message}>
                <select
                  className="input"
                  {...form.register("level_id", { valueAsNumber: true })}
                >
                  <option value="">— select level —</option>
                  {levels.map((l) => (
                    <option key={l.id} value={l.id}>{l.name}</option>
                  ))}
                </select>
              </Field>

              <Field label="Intake *" error={errors.intake?.message}>
                <select className="input" {...form.register("intake")}>
                  <option value="">— select intake —</option>
                  {intakes.map((it) => (
                    <option key={it.id} value={it.name}>{it.name}</option>
                  ))}
                </select>
              </Field>

              {intakes.length === 0 && (
                <div className="p-3 bg-red-50 border border-red-100 rounded-lg text-red-700 text-[12.5px]">
                  Applications are currently closed — no active intake periods.
                </div>
              )}
            </div>
          )}
        </FieldGroup>
      </div>
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────────
 * Payment — step 5
 * Shows the application fee, a slip uploader + transaction ID, an
 * inline review of every step, a checklist confirming completeness,
 * and the final consent checkbox. Submit lives in the wizard nav.
 * ──────────────────────────────────────────────────────────────────── */

function PaymentStep({
  form, fee, programs, campuses, levels,
  paid, onPaidChange,
  confirmAccurate, onConfirmChange,
}: {
  form: ReturnType<typeof useForm<FormValues>>
  fee: number
  programs: Array<{ id: number; name: string }>
  campuses: Array<{ id: number; name: string }>
  levels:   Array<{ id: number; name: string }>
  paid: boolean
  onPaidChange: (v: boolean) => void
  confirmAccurate: boolean
  onConfirmChange: (v: boolean) => void
}) {
  const v = form.getValues();
  const formatFee = new Intl.NumberFormat('en-US').format(fee);

  const [opened, setOpened] = useState(false);
  const [showAlreadyPaid, setShowAlreadyPaid] = useState(false);
  const [transactionId, setTransactionId] = useState('');
  const [invoiceFile, setInvoiceFile] = useState<File | null>(null);

  // Load checkout details once when the step opens: merchant code, payer code
  // (= application number), the fixed fee, and the hosted-checkout URL.
  const checkoutQuery = useQuery({
    queryKey: ['applicant-payment-checkout'],
    queryFn: ({ signal }) => applicantService.getPaymentCheckout(signal),
    retry: false,
    staleTime: Infinity,
  });
  const checkout = checkoutQuery.data?.data;

  // Poll the server for gateway confirmation. Runs once on mount (to catch a
  // fee already paid on a resumed application) and every few seconds after the
  // applicant opens the Urubuto checkout, until the payment is confirmed.
  const statusQuery = useQuery({
    queryKey: ['applicant-payment-status'],
    queryFn: ({ signal }) => applicantService.getPaymentStatus(signal),
    refetchInterval: !paid && opened ? 4000 : false,
    refetchIntervalInBackground: true,
    retry: false,
  });

  const status = statusQuery.data?.data;
  const txId = status?.transaction_id ?? checkout?.transaction_id ?? null;

  useEffect(() => {
    if (status?.paid || checkout?.paid) onPaidChange(true);
  }, [status?.paid, checkout?.paid, onPaidChange]);

  const copy = (label: string, value?: string | null) => {
    if (!value) return;
    navigator.clipboard?.writeText(value).then(
      () => toast.success(`${label} copied`),
      () => toast.error('Could not copy'),
    );
  };

  const payNow = () => {
    if (!checkout?.checkout_url) {
      toast.error('Preparing your payment link — please try again in a moment.');
      checkoutQuery.refetch();
      return;
    }
    window.open(checkout.checkout_url, '_blank', 'noopener,noreferrer');
    setOpened(true);
    toast.success('Complete your payment in the Urubuto Pay tab, then return here.');
    statusQuery.refetch();
  };

  const submitAlreadyPaid = async () => {
    if (!transactionId.trim()) {
      toast.error('Please enter your transaction ID');
      return;
    }
    if (!invoiceFile) {
      toast.error('Please upload an invoice or proof of payment');
      return;
    }

    try {
      await applicantService.submitInvoicePayment(transactionId, invoiceFile);
      onPaidChange(true);
      setShowAlreadyPaid(false);
      setTransactionId('');
      setInvoiceFile(null);
      toast.success('Payment verified successfully!');
      statusQuery.refetch();
    } catch (e: any) {
      toast.error(e?.response?.data?.message || 'Failed to verify payment. Please check your details.');
    }
  };

  return (
    <div className="space-y-6 animate-fade-up">
      <SectionTitle
        title="Complete your application payment"
        sub="Step 5 of 5 — Pay the application processing fee and review your details before submitting."
      />

      {/* Fee notice */}
      <div className="flex items-start gap-3 rounded-lg bg-blue-50 dark:bg-blue-900/20 border border-blue-100 dark:border-blue-900/40 px-4 py-3">
        <Info className="w-5 h-5 text-blue-600 mt-0.5 shrink-0" />
        <div className="text-[13px] text-blue-900 dark:text-blue-100 leading-snug">
          <p className="font-semibold">Application fee: {formatFee} RWF</p>
          <p className="text-blue-700 dark:text-blue-200/80 mt-0.5">
            Pay securely with Urubuto Pay (MTN MoMo / Airtel Money). Click “Pay Now”, complete the
            payment, and this page unlocks automatically once it’s confirmed.
          </p>
        </div>
      </div>

      {/* Urubuto Pay */}
      <FieldGroup title="Payment">
        {/* Tab selector for new vs already-paid */}
        {!paid && (
          <div className="flex gap-2 mb-4 pb-4 border-b border-ink-100 dark:border-ink-700">
            <button
              type="button"
              onClick={() => setShowAlreadyPaid(false)}
              className={`px-3 py-1.5 text-[13px] font-medium rounded transition-colors ${
                !showAlreadyPaid
                  ? 'bg-brand text-white'
                  : 'bg-ink-100 dark:bg-ink-800 text-ink-700 dark:text-ink-300'
              }`}
            >
              Pay Now
            </button>
            <button
              type="button"
              onClick={() => setShowAlreadyPaid(true)}
              className={`px-3 py-1.5 text-[13px] font-medium rounded transition-colors ${
                showAlreadyPaid
                  ? 'bg-brand text-white'
                  : 'bg-ink-100 dark:bg-ink-800 text-ink-700 dark:text-ink-300'
              }`}
            >
              Already Paid
            </button>
          </div>
        )}

        {showAlreadyPaid ? (
          /* Already paid — invoice upload form */
          <div className="space-y-4">
            <div className="rounded-lg border border-amber-200 dark:border-amber-900/40 bg-amber-50/60 dark:bg-amber-900/10 px-4 py-3">
              <p className="text-[13px] text-amber-800 dark:text-amber-200">
                If you've already paid via bank transfer or another method, please provide your transaction ID and upload proof of payment.
              </p>
            </div>

            <Field label="Transaction ID / Reference Number *" error={undefined}>
              <input
                type="text"
                className="input"
                placeholder="e.g., TXN-12345, Receipt #001"
                value={transactionId}
                onChange={(e) => setTransactionId(e.target.value)}
              />
            </Field>

            <Field label="Invoice / Proof of Payment *" error={undefined}>
              <label className="flex items-center justify-center w-full px-4 py-6 border-2 border-dashed border-ink-300 dark:border-ink-600 rounded-lg cursor-pointer hover:bg-ink-50 dark:hover:bg-ink-900/20 transition">
                <div className="text-center">
                  <FileUp className="w-6 h-6 mx-auto text-ink-400 dark:text-ink-500 mb-2" />
                  <p className="text-[13px] font-medium text-ink-700 dark:text-ink-200">
                    {invoiceFile ? invoiceFile.name : 'Click to upload or drag and drop'}
                  </p>
                  <p className="text-[12px] text-ink-500 dark:text-ink-400">PDF, JPG, or PNG (max 5 MB)</p>
                </div>
                <input
                  type="file"
                  className="hidden"
                  accept=".pdf,.jpg,.jpeg,.png"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) {
                      if (file.size > 5 * 1024 * 1024) {
                        toast.error('File must be 5 MB or smaller');
                        return;
                      }
                      setInvoiceFile(file);
                    }
                  }}
                />
              </label>
            </Field>

            <button
              type="button"
              onClick={submitAlreadyPaid}
              className="btn-primary w-full"
            >
              <FileUp className="w-4 h-4" /> Verify Payment
            </button>
          </div>
        ) : (
          /* Pay Now flow */
          <>
            {(checkoutQuery.isLoading || (!paid && statusQuery.isLoading)) ? (
              /* While checking server-side payment status, show a neutral skeleton
                 so we never flash the "Pay Now" form to someone who already paid. */
              <div className="flex items-center gap-3 py-4 text-ink-400 dark:text-ink-500 text-[13px]">
                <Loader2 className="w-4 h-4 animate-spin shrink-0" />
                Checking payment status…
              </div>
            ) : paid ? (
          <div className="rounded-lg border border-emerald-300 bg-emerald-50/60 dark:bg-emerald-900/10 px-4 py-4 flex items-start gap-3">
            <CheckCircle2 className="w-6 h-6 text-emerald-600 mt-0.5 shrink-0" />
            <div>
              <p className="text-[14px] font-semibold text-emerald-800 dark:text-emerald-200">Payment confirmed</p>
              <p className="text-[12.5px] text-emerald-700 dark:text-emerald-300/90 mt-0.5">
                Your {formatFee} RWF application fee was received{txId ? <> · Ref <span className="font-mono">{txId}</span></> : null}.
                You can now submit your application.
              </p>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            {/* Payment details — already filled for you. On the Urubuto Pay page
                these are pre-filled; if not, tap to copy. The amount is fixed. */}
            <div className="rounded-lg border border-ink-100 dark:border-ink-800 bg-ink-50/60 dark:bg-ink-900/40 divide-y divide-ink-100 dark:divide-ink-800">
              <PayDetailRow label="Amount" value={`${formatFee} RWF`} hint="Fixed — cannot be changed" />
              <PayDetailRow label="Merchant code" value={checkout?.merchant_code ?? '…'} onCopy={() => copy('Merchant code', checkout?.merchant_code)} />
              <PayDetailRow label="Payer code" value={checkout?.payer_code ?? '…'} hint="Your application number" onCopy={() => copy('Payer code', checkout?.payer_code)} />
            </div>

            <button
              type="button"
              onClick={payNow}
              disabled={checkoutQuery.isLoading}
              className="btn-primary w-full sm:w-auto"
            >
              {checkoutQuery.isLoading ? (
                <><Loader2 className="w-4 h-4 animate-spin" /> Preparing payment…</>
              ) : (
                <><CreditCard className="w-4 h-4" /> Pay {formatFee} RWF with Urubuto Pay</>
              )}
            </button>

            {opened && (
              <div className="rounded-lg border border-amber-200 dark:border-amber-900/40 bg-amber-50/60 dark:bg-amber-900/10 px-4 py-3 flex items-center gap-3">
                <Loader2 className="w-4 h-4 animate-spin text-amber-600 shrink-0" />
                <p className="text-[12.5px] text-amber-800 dark:text-amber-200">
                  Waiting for Urubuto Pay to confirm your payment…
                </p>
                <button
                  type="button"
                  onClick={() => statusQuery.refetch()}
                  className="ml-auto text-[12px] font-medium text-brand hover:underline shrink-0"
                >
                  Check now
                </button>
              </div>
            )}

            <p className="text-[11.5px] text-ink-400 dark:text-ink-500">
              A secure Urubuto Pay window opens in a new tab — just enter your MoMo number or card and
              confirm. The {formatFee} RWF amount is fixed. Keep this page open; it unlocks automatically
              once your payment is confirmed.
            </p>
          </div>
        )}
          </>
        )}
      </FieldGroup>

      {/* Application review */}
      <FieldGroup title="Review your application" sub="Click any completed step in the top bar to edit before you submit.">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          <ReviewSection title="Personal information">
            <ReviewRow k="Full name" v={[v.first_name, v.last_name].filter(Boolean).join(' ') || '—'} />
            <ReviewRow k="Email"     v={v.email} />
            <ReviewRow k="Phone"     v={v.phone} />
            <ReviewRow k="Reference phone" v={v.reference_phone} />
            <ReviewRow k="Date of birth"   v={v.birthdate} />
            <ReviewRow k="National ID / Passport" v={v.national_id} />
            <ReviewRow k="Nationality"            v={v.nationality} />
            <ReviewRow k="Country of residence"   v={v.country_of_residence} />
            <ReviewRow k="Sponsor"   v={v.sponsorship} />
            <ReviewRow k="Disability" v={v.disability} />
          </ReviewSection>

          <ReviewSection title="Academic background">
            <ReviewRow k="School"          v={v.prev_school} />
            <ReviewRow k="Combination"     v={v.combination} />
            <ReviewRow k="A2 Grades"       v={v.a2_grades} />
            <ReviewRow k="Principal passes" v={v.principal_passes != null ? String(v.principal_passes) : ''} />
            <ReviewRow k="Completion year"  v={v.graduation_year != null ? String(v.graduation_year) : ''} />
            <ReviewRow k="Serial number"    v={v.serial_number} />
          </ReviewSection>

          <ReviewSection title="Programs">
            <ReviewRow k="Program" v={programs.find((p) => p.id === Number(v.program_id))?.name} />
            <ReviewRow k="Campus"  v={campuses.find((c) => c.id === Number(v.campus_id))?.name} />
            <ReviewRow k="Mode of study" v={v.mode_of_study} />
            <ReviewRow k="Level"   v={levels.find((l) => l.id === Number(v.level_id))?.name} />
            <ReviewRow k="Intake"  v={v.intake} />
          </ReviewSection>

          <ReviewSection title="Payment">
            <ReviewRow k="Fee" v={`${formatFee} RWF`} />
            <ReviewRow k="Method" v="Urubuto Pay" />
            <ReviewRow k="Status" v={paid ? 'Paid' : 'Not paid'} />
            <ReviewRow k="Reference" v={txId || '—'} />
          </ReviewSection>
        </div>
      </FieldGroup>

      {/* Checklist + confirmation */}
      <div className="rounded-xl border border-ink-100 dark:border-ink-800 bg-ink-50/60 dark:bg-ink-900/40 p-4 sm:p-5 space-y-4">
        <div className="flex items-center gap-2 text-emerald-700 dark:text-emerald-300">
          <CheckCircle2 className="w-5 h-5" />
          <h3 className="text-[14px] font-semibold">Application Checklist</h3>
        </div>
        <ul className="text-[13px] text-ink-700 dark:text-ink-200 list-disc pl-6 space-y-1">
          <ChecklistItem ok={!!v.first_name && !!v.last_name && !!v.email && !!v.phone}>All personal information provided</ChecklistItem>
          <ChecklistItem ok={!!v.prev_school && !!v.combination && !!v.a2_grades}>Academic background filled</ChecklistItem>
          <ChecklistItem ok={!!v.program_id && !!v.campus_id && !!v.mode_of_study && !!v.level_id}>Program selection made</ChecklistItem>
          <ChecklistItem ok={paid}>Application fee paid (Urubuto Pay)</ChecklistItem>
        </ul>

        <label className="flex items-start gap-2 pt-2 border-t border-ink-100 dark:border-ink-800 cursor-pointer">
          <input
            type="checkbox"
            checked={confirmAccurate}
            onChange={(e) => onConfirmChange(e.target.checked)}
            className="mt-1 rounded border-ink-300 dark:border-ink-600 text-brand focus:ring-brand/30"
          />
          <span className="text-[13px] text-ink-700 dark:text-ink-200">
            I confirm that all information provided is accurate.
          </span>
        </label>
      </div>
    </div>
  );
}

function PayDetailRow({
  label, value, hint, onCopy,
}: {
  label: string
  value: string
  hint?: string
  onCopy?: () => void
}) {
  return (
    <div className="flex items-center gap-3 px-4 py-2.5">
      <div className="min-w-0">
        <p className="text-[11px] uppercase tracking-wide text-ink-400 dark:text-ink-500">{label}</p>
        <p className="text-[13.5px] font-semibold text-ink-800 dark:text-ink-100 font-mono truncate">{value}</p>
        {hint && <p className="text-[11px] text-ink-400 dark:text-ink-500">{hint}</p>}
      </div>
      {onCopy && (
        <button
          type="button"
          onClick={onCopy}
          className="ml-auto shrink-0 inline-flex items-center gap-1 text-[12px] font-medium text-brand hover:underline"
        >
          <Copy className="w-3.5 h-3.5" /> Copy
        </button>
      )}
    </div>
  );
}

function ChecklistItem({ ok, children }: { ok: boolean; children: React.ReactNode }) {
  return (
    <li className={ok ? 'text-emerald-700 dark:text-emerald-300' : 'text-ink-500'}>
      <span className="inline-flex items-center gap-1.5">
        {ok ? <CheckCircle2 className="w-3.5 h-3.5 inline" /> : <Hash className="w-3.5 h-3.5 inline opacity-50" />}
        {children}
      </span>
    </li>
  );
}

function FieldGroup({
  title, sub, children,
}: { title: string; sub?: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-ink-100 dark:border-ink-800 bg-white/40 dark:bg-ink-900/40 p-4 sm:p-5">
      <div className="mb-4 pb-3 border-b border-ink-100 dark:border-ink-800">
        <h3 className="text-[14px] font-semibold text-ink-900 dark:text-white">{title}</h3>
        {sub && <p className="text-[12px] text-ink-500 dark:text-ink-400 mt-0.5">{sub}</p>}
      </div>
      {children}
    </div>
  );
}

function ReviewSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-ink-100 dark:border-ink-700 overflow-hidden">
      <div className="bg-ink-50 dark:bg-ink-800 px-4 py-2 border-b border-ink-100 dark:border-ink-700">
        <p className="text-[11px] uppercase tracking-wider font-semibold text-ink-500 dark:text-ink-400">{title}</p>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-0 divide-y sm:divide-y-0 sm:divide-x divide-ink-100 dark:divide-ink-700">
        {children}
      </div>
    </div>
  );
}

function ReviewRow({ k, v }: { k: string; v: string | undefined | null }) {
  return (
    <div className="px-4 py-3">
      <p className="text-[11px] text-ink-400 dark:text-ink-500 uppercase tracking-wider">{k}</p>
      <p className="text-[13px] font-medium text-ink-900 dark:text-white mt-0.5">{v || '—'}</p>
    </div>
  );
}
