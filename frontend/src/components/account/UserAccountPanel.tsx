import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import toast from "react-hot-toast";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  User,
  Mail,
  Phone,
  AtSign,
  Lock,
  Save,
  Loader2,
  Eye,
  EyeOff,
  Shield,
} from "lucide-react";

import { authService } from "@/services/authService";
import { useAuthStore } from "@/store/authStore";

interface ProfileForm {
  full_name: string;
  email:     string;
  username:  string;
  phone:     string;
}

interface PasswordForm {
  current_password: string;
  new_password:     string;
  confirm_password: string;
}

export default function UserAccountPanel() {
  const queryClient = useQueryClient();
  const setUser     = useAuthStore((s) => s.setUser);
  const storeUser   = useAuthStore((s) => s.user);

  // Fetch fresh /me so phone & other server-only fields are present.
  const meQ = useQuery({
    queryKey: ["auth", "me"],
    queryFn:  () => authService.me(),
    staleTime: 30_000,
  });
  const me = meQ.data?.data ?? storeUser ?? null;

  /* ── Profile form ─────────────────────────────────────────────── */
  const profileForm = useForm<ProfileForm>({
    defaultValues: { full_name: "", email: "", username: "", phone: "" },
  });

  useEffect(() => {
    if (!me) return;
    profileForm.reset({
      full_name: me.full_name ?? "",
      email:     me.email     ?? "",
      username:  me.username  ?? "",
      phone:     me.phone     ?? "",
    });
  }, [me?.id, me?.full_name, me?.email, me?.username, me?.phone]);  

  const updateProfileM = useMutation({
    mutationFn: (vals: ProfileForm) =>
      authService.updateMe({
        full_name: vals.full_name.trim(),
        email:     vals.email.trim(),
        username:  vals.username.trim(),
        phone:     vals.phone.trim(),
      }),
    onSuccess: (res) => {
      toast.success("Profile updated.");
      if (res?.data) setUser(res.data);
      queryClient.invalidateQueries({ queryKey: ["auth", "me"] });
    },
    onError: (err: any) => {
      const fieldErrors = err?.response?.data?.errors;
      if (fieldErrors && typeof fieldErrors === "object") {
        Object.entries(fieldErrors).forEach(([field, msgs]) => {
          const msg = Array.isArray(msgs) ? msgs[0] : String(msgs);
          profileForm.setError(field as keyof ProfileForm, { message: msg });
        });
      }
      toast.error(
        err?.response?.data?.message ?? err?.message ?? "Could not update profile."
      );
    },
  });

  /* ── Password form ────────────────────────────────────────────── */
  const pwForm = useForm<PasswordForm>({
    defaultValues: { current_password: "", new_password: "", confirm_password: "" },
  });
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew,     setShowNew]     = useState(false);

  const changePwM = useMutation({
    mutationFn: (vals: PasswordForm) =>
      authService.changePassword({
        current_password: vals.current_password,
        new_password:     vals.new_password,
      }),
    onSuccess: () => {
      toast.success("Password changed.");
      pwForm.reset();
    },
    onError: (err: any) =>
      toast.error(
        err?.response?.data?.message ?? err?.message ?? "Could not change password."
      ),
  });

  const onSubmitProfile  = profileForm.handleSubmit((v) => updateProfileM.mutate(v));
  const onSubmitPassword = pwForm.handleSubmit((v) => {
    if (v.new_password !== v.confirm_password) {
      pwForm.setError("confirm_password", { message: "Passwords do not match." });
      return;
    }
    changePwM.mutate(v);
  });

  if (meQ.isLoading && !me) {
    return (
      <div className="flex items-center justify-center p-20">
        <Loader2 className="w-6 h-6 text-brand animate-spin" />
      </div>
    );
  }

  const initials =
    (me?.full_name ?? "")
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((p) => p[0]?.toUpperCase())
      .join("") || (me?.email?.[0]?.toUpperCase() ?? "?");

  return (
    <div className="max-w-[1000px] mx-auto p-4 md:p-6 space-y-6 animate-fade-in">
      {/* Header card */}
      <div className="card p-5 flex items-center gap-4">
        <div className="w-14 h-14 rounded-full bg-brand text-brand-ink flex items-center justify-center text-lg font-bold">
          {initials}
        </div>
        <div className="min-w-0">
          <div className="text-lg font-bold text-ink-900 dark:text-white truncate">
            {me?.full_name || "—"}
          </div>
          <div className="text-[13px] text-ink-500 flex items-center gap-2 flex-wrap">
            <Shield className="w-3.5 h-3.5" />
            <span className="font-medium">{me?.role_name ?? me?.role ?? "User"}</span>
            <span className="text-ink-300">•</span>
            <span>{me?.email}</span>
          </div>
        </div>
      </div>

      {/* Profile form */}
      <form className="card p-5 space-y-4" onSubmit={onSubmitProfile}>
        <div className="flex items-center gap-2 mb-1">
          <User className="w-4 h-4 text-brand" />
          <h3 className="text-base font-semibold text-ink-900 dark:text-white">
            My profile
          </h3>
        </div>
        <p className="text-[12.5px] text-ink-500 -mt-1">
          Update the personal details linked to your account.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Field label="Full name" icon={<User className="w-3.5 h-3.5" />}>
            <input
              className="input"
              {...profileForm.register("full_name", { required: "Full name is required." })}
            />
            <FieldError msg={profileForm.formState.errors.full_name?.message} />
          </Field>

          <Field label="Email" icon={<Mail className="w-3.5 h-3.5" />}>
            <input
              className="input"
              type="email"
              {...profileForm.register("email", { required: "Email is required." })}
            />
            <FieldError msg={profileForm.formState.errors.email?.message} />
          </Field>

          <Field label="Username" icon={<AtSign className="w-3.5 h-3.5" />}>
            <input
              className="input"
              {...profileForm.register("username", { required: "Username is required." })}
            />
            <FieldError msg={profileForm.formState.errors.username?.message} />
          </Field>

          <Field label="Phone" icon={<Phone className="w-3.5 h-3.5" />}>
            <input
              className="input"
              type="tel"
              {...profileForm.register("phone")}
            />
            <FieldError msg={profileForm.formState.errors.phone?.message} />
          </Field>
        </div>

        <div className="flex justify-end pt-1">
          <button
            type="submit"
            className="btn-primary inline-flex items-center gap-2"
            disabled={updateProfileM.isPending || !profileForm.formState.isDirty}
          >
            {updateProfileM.isPending
              ? <Loader2 className="w-4 h-4 animate-spin" />
              : <Save className="w-4 h-4" />}
            Save changes
          </button>
        </div>
      </form>

      {/* Password form */}
      <form className="card p-5 space-y-4" onSubmit={onSubmitPassword}>
        <div className="flex items-center gap-2 mb-1">
          <Lock className="w-4 h-4 text-brand" />
          <h3 className="text-base font-semibold text-ink-900 dark:text-white">
            Change password
          </h3>
        </div>
        <p className="text-[12.5px] text-ink-500 -mt-1">
          Pick a strong password — at least 8 characters.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Field label="Current password" icon={<Lock className="w-3.5 h-3.5" />}>
            <div className="relative">
              <input
                className="input pr-9"
                type={showCurrent ? "text" : "password"}
                autoComplete="current-password"
                {...pwForm.register("current_password", { required: "Required." })}
              />
              <button
                type="button"
                className="absolute right-2 top-1/2 -translate-y-1/2 text-ink-400 hover:text-ink-700"
                onClick={() => setShowCurrent((v) => !v)}
                tabIndex={-1}
              >
                {showCurrent ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            <FieldError msg={pwForm.formState.errors.current_password?.message} />
          </Field>

          <div /> {/* spacer for grid alignment */}

          <Field label="New password" icon={<Lock className="w-3.5 h-3.5" />}>
            <div className="relative">
              <input
                className="input pr-9"
                type={showNew ? "text" : "password"}
                autoComplete="new-password"
                {...pwForm.register("new_password", {
                  required: "Required.",
                  minLength: { value: 8, message: "At least 8 characters." },
                })}
              />
              <button
                type="button"
                className="absolute right-2 top-1/2 -translate-y-1/2 text-ink-400 hover:text-ink-700"
                onClick={() => setShowNew((v) => !v)}
                tabIndex={-1}
              >
                {showNew ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            <FieldError msg={pwForm.formState.errors.new_password?.message} />
          </Field>

          <Field label="Confirm new password" icon={<Lock className="w-3.5 h-3.5" />}>
            <input
              className="input"
              type={showNew ? "text" : "password"}
              autoComplete="new-password"
              {...pwForm.register("confirm_password", { required: "Required." })}
            />
            <FieldError msg={pwForm.formState.errors.confirm_password?.message} />
          </Field>
        </div>

        <div className="flex justify-end pt-1">
          <button
            type="submit"
            className="btn-primary inline-flex items-center gap-2"
            disabled={changePwM.isPending}
          >
            {changePwM.isPending
              ? <Loader2 className="w-4 h-4 animate-spin" />
              : <Save className="w-4 h-4" />}
            Update password
          </button>
        </div>
      </form>
    </div>
  );
}

function Field({
  label,
  icon,
  children,
}: {
  label: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="text-[11.5px] font-semibold uppercase tracking-wide text-ink-500 inline-flex items-center gap-1.5 mb-1">
        {icon}
        {label}
      </span>
      {children}
    </label>
  );
}

function FieldError({ msg }: { msg?: string }) {
  if (!msg) return null;
  return <p className="text-[11.5px] text-red-600 mt-1">{msg}</p>;
}
