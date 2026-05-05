import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { motion } from "framer-motion";
import { Loader2 } from "lucide-react";
import toast from "react-hot-toast";
import { authService } from "@/services/authService";
import PasswordInput from "@/components/ui/PasswordInput";

const registerSchema = z.object({
  first_name: z.string().min(2, "First name is required"),
  last_name: z.string().min(2, "Last name is required"),
  email: z
    .string()
    .min(1, "Email is required")
    .email("Enter a valid email address"),
  password: z
    .string()
    .min(1, "Password is required")
    .min(8, "Password must be at least 8 characters"),
});

export type RegisterFormValues = z.infer<typeof registerSchema>;

interface RegisterFormProps {
  onSuccess?: (data: any) => void
  /** Pre-filled values from a parent flow (e.g. apply wizard step 1). */
  prefill?: Partial<Pick<RegisterFormValues, 'first_name' | 'last_name' | 'email'>>
}

export default function RegisterForm({ onSuccess, prefill }: RegisterFormProps) {
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<RegisterFormValues>({
    resolver: zodResolver(registerSchema),
    defaultValues: {
      first_name: prefill?.first_name ?? '',
      last_name:  prefill?.last_name  ?? '',
      email:      prefill?.email      ?? '',
    },
  });

  // If the parent already collected all three identity fields, collapse the
  // form down to just the password — the applicant only types their secret.
  const hasAllIdentity = !!(prefill?.first_name && prefill?.last_name && prefill?.email);

  const onSubmit = async (data: RegisterFormValues) => {
    try {
      const res = await authService.registerApplicantAccount(data);
      if (res.success && res.data) {
        toast.success(res.message || "Account created! Please verify your email.");
        if (onSuccess) {
          onSuccess(res.data);
        }
      } else {
        toast.error(res.message || "Registration failed");
      }
    } catch (err: any) {
      toast.error(err?.response?.data?.message || "Registration failed");
    }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">
      {hasAllIdentity ? (
        <>
          <div className="rounded-lg border border-ink-100 dark:border-ink-700 bg-ink-50/60 dark:bg-ink-800/40 p-3 text-[12.5px] leading-snug">
            <p className="text-ink-500">You'll register as</p>
            <p className="font-semibold text-ink-900 dark:text-white truncate">
              {prefill!.first_name} {prefill!.last_name}
            </p>
            <p className="text-ink-500 truncate">{prefill!.email}</p>
          </div>
          {/* Carry the values through the form without showing the inputs again */}
          <input type="hidden" {...register("first_name")} />
          <input type="hidden" {...register("last_name")} />
          <input type="hidden" {...register("email")} />
        </>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label htmlFor="first_name" className="label">First name</label>
              <input
                id="first_name"
                type="text"
                placeholder="John"
                className={`input ${errors.first_name ? "border-red-400 ring-1 ring-red-400 focus:ring-red-400" : ""}`}
                {...register("first_name")}
              />
              {errors.first_name && <p className="error-text">{errors.first_name.message}</p>}
            </div>
            <div>
              <label htmlFor="last_name" className="label">Last name</label>
              <input
                id="last_name"
                type="text"
                placeholder="Doe"
                className={`input ${errors.last_name ? "border-red-400 ring-1 ring-red-400 focus:ring-red-400" : ""}`}
                {...register("last_name")}
              />
              {errors.last_name && <p className="error-text">{errors.last_name.message}</p>}
            </div>
          </div>

          <div>
            <label htmlFor="email" className="label">Email address</label>
            <input
              id="email"
              type="email"
              autoComplete="email"
              placeholder="you@example.com"
              className={`input ${errors.email ? "border-red-400 ring-1 ring-red-400 focus:ring-red-400" : ""}`}
              {...register("email")}
            />
            {errors.email && <p className="error-text">{errors.email.message}</p>}
          </div>
        </>
      )}

      <PasswordInput
        label="Password"
        placeholder="••••••••"
        autoComplete="new-password"
        autoFocus={hasAllIdentity}
        error={errors.password?.message}
        {...register("password")}
      />

      <motion.button
        type="submit"
        disabled={isSubmitting}
        whileTap={{ scale: 0.98 }}
        className="btn-primary w-full mt-2 h-11 text-base"
      >
        {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
        Create account
      </motion.button>
    </form>
  );
}
