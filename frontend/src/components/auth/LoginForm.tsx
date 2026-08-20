import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { motion, AnimatePresence } from "framer-motion";
import { Mail, Loader2, ArrowRight } from "lucide-react";
import { useLogin } from "@/hooks/useAuth";
import PasswordInput from "@/components/ui/PasswordInput";

const loginSchema = z.object({
  email: z
    .string()
    .min(1, "Email is required")
    .email("Enter a valid email address"),
  password: z
    .string()
    .min(1, "Password is required")
    .min(6, "Password must be at least 6 characters"),
});

export type LoginFormValues = z.infer<typeof loginSchema>;

interface LoginFormProps {
  onSuccess?: (data: any) => void
  /** Pre-filled email from a parent flow (e.g. apply wizard step 1). */
  prefill?: { email?: string }
}

export default function LoginForm({ onSuccess, prefill }: LoginFormProps) {
  const loginMutation = useLogin({ onSuccess });

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: prefill?.email ?? '' },
  });

  const hasEmail = !!prefill?.email;

  const onSubmit = (data: LoginFormValues) => loginMutation.mutate(data);
  const busy = isSubmitting || loginMutation.isPending;

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-5">
      {hasEmail ? (
        <>
          <div className="rounded-lg border border-ink-100 dark:border-ink-700 bg-ink-50/60 dark:bg-ink-800/40 p-3 text-[12.5px] leading-snug">
            <p className="text-ink-500">Signing in as</p>
            <p className="font-semibold text-ink-900 dark:text-white truncate">{prefill!.email}</p>
          </div>
          <input type="hidden" {...register("email")} />
        </>
      ) : (
        <div>
          <label htmlFor="email" className="label">
            Email address
          </label>
          <div className="relative">
            <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
            <input
              id="email"
              type="email"
              autoComplete="email"
              autoFocus
              placeholder="you@example.com"
              className={`input pl-10 ${errors.email ? "border-red-400 ring-1 ring-red-400 focus:ring-red-400" : ""}`}
              {...register("email")}
            />
          </div>
          <AnimatePresence>
            {errors.email && (
              <motion.p
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                className="error-text"
              >
                {errors.email.message}
              </motion.p>
            )}
          </AnimatePresence>
        </div>
      )}

      <PasswordInput
        label="Password"
        placeholder="••••••••"
        autoComplete="current-password"
        autoFocus={hasEmail}
        forgotPasswordLink="/forgot-password"
        error={errors.password?.message}
        {...register("password")}
      />

      <motion.button
        type="submit"
        disabled={busy}
        whileTap={{ scale: 0.98 }}
        className="btn-primary w-full mt-2 h-11 text-base"
      >
        {busy ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <ArrowRight className="h-4 w-4" />
        )}
        <span className="ml-2">{busy ? "Signing in..." : "Sign in"}</span>
      </motion.button>
    </form>
  );
}
