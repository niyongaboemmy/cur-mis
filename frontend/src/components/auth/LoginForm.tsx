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

export default function LoginForm({ onSuccess }: { onSuccess?: (data: any) => void }) {
  const loginMutation = useLogin({ onSuccess });

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginFormValues>({ resolver: zodResolver(loginSchema) });

  const onSubmit = (data: LoginFormValues) => loginMutation.mutate(data);
  const busy = isSubmitting || loginMutation.isPending;

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-5">
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

      <PasswordInput
        label="Password"
        placeholder="••••••••"
        autoComplete="current-password"
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
