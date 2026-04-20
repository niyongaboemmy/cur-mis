import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { motion, AnimatePresence } from "framer-motion";
import {
  Mail,
  ArrowRight,
  Loader2,
  CheckCircle2,
  ArrowLeft,
} from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import {
  useForgotPassword,
  useVerifyResetOtp,
  useResetPassword,
} from "@/hooks/useAuth";
import AuthLayout from "@/components/auth/AuthLayout";
import OtpInput from "@/components/auth/OtpInput";
import PasswordInput from "@/components/ui/PasswordInput";
import { Controller } from "react-hook-form";

// Step 1 Schema: Email
const emailSchema = z.object({
  email: z
    .string()
    .min(1, "Email is required")
    .email("Enter a valid email address"),
});

// Step 2 Schema: OTP
const otpSchema = z.object({
  otp: z
    .string()
    .min(6, "Code must be 6 digits")
    .max(6, "Code must be 6 digits"),
});

// Step 3 Schema: Password
const passwordSchema = z
  .object({
    password: z.string().min(8, "Password must be at least 8 characters"),
    confirmPassword: z.string().min(1, "Please confirm your password"),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Passwords don't match",
    path: ["confirmPassword"],
  });

type Step = "email" | "otp" | "password" | "success";

export default function ForgotPasswordPage() {
  const [step, setStep] = useState<Step>("email");
  const [email, setEmail] = useState("");
  const [resetToken, setResetToken] = useState("");

  const forgotMutation = useForgotPassword();
  const verifyMutation = useVerifyResetOtp();
  const resetMutation = useResetPassword();

  const navigate = useNavigate();

  // Step 1: Submit Email
  const emailForm = useForm<{ email: string }>({
    resolver: zodResolver(emailSchema),
  });

  const onEmailSubmit = async (data: { email: string }) => {
    try {
      const res = await forgotMutation.mutateAsync(data);
      if (res.success) {
        setEmail(data.email);
        setStep("otp");
      }
    } catch (e) {
      // Error is handled by toast in hook
    }
  };

  // Step 2: Submit OTP
  const otpForm = useForm<{ otp: string }>({
    resolver: zodResolver(otpSchema),
  });

  const onOtpSubmit = async (data: { otp: string }) => {
    try {
      const res = await verifyMutation.mutateAsync({ email, otp: data.otp });
      if (res.success && res.data?.token) {
        setResetToken(res.data.token);
        setStep("password");
      }
    } catch (e) {
      // Error is handled by toast in hook
    }
  };

  // Step 3: Submit New Password
  const passwordForm = useForm<z.infer<typeof passwordSchema>>({
    resolver: zodResolver(passwordSchema),
  });

  const onPasswordSubmit = async (data: z.infer<typeof passwordSchema>) => {
    try {
      const res = await resetMutation.mutateAsync({
        token: resetToken,
        password: data.password,
      });
      if (res.success) {
        setStep("success");
      }
    } catch (e) {
      // Error is handled by toast in hook
    }
  };

  const steps = [
    { id: "email", label: "Email" },
    { id: "otp", label: "Verify" },
    { id: "password", label: "Reset" },
  ];

  const currentStepIndex = steps.findIndex((s) => s.id === step);

  return (
    <AuthLayout
      title={
        step === "success"
          ? "Password Reset"
          : step === "password"
            ? "Set new password"
            : step === "otp"
              ? "Check your email"
              : "Forgot password?"
      }
      subtitle={
        step === "success"
          ? "Your password has been successfully updated."
          : step === "password"
            ? "Choose a strong password you haven't used before."
            : step === "otp"
              ? `We've sent a 6-digit code to ${email}`
              : "No worries, we'll send you reset instructions."
      }
    >
      {/* Progress Indicator */}
      {step !== "success" && (
        <div className="flex items-center justify-center gap-4 mb-8">
          {steps.map((s, idx) => (
            <div key={s.id} className="flex items-center gap-2">
              <div
                className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold transition-colors ${
                  idx <= currentStepIndex
                    ? "bg-primary-600 text-white"
                    : "bg-gray-200 text-gray-500 dark:bg-gray-800"
                }`}
              >
                {idx < currentStepIndex ? (
                  <CheckCircle2 className="w-3 h-3" />
                ) : (
                  idx + 1
                )}
              </div>
              <span
                className={`text-xs font-medium ${idx <= currentStepIndex ? "text-primary-600" : "text-gray-400"}`}
              >
                {s.label}
              </span>
              {idx < steps.length - 1 && (
                <div
                  className={`w-8 h-[1px] ${idx < currentStepIndex ? "bg-primary-600" : "bg-gray-200 dark:bg-gray-800"}`}
                />
              )}
            </div>
          ))}
        </div>
      )}

      <AnimatePresence mode="wait">
        {step === "email" && (
          <motion.div
            key="email"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            transition={{ duration: 0.2 }}
          >
            <form
              onSubmit={emailForm.handleSubmit(onEmailSubmit)}
              noValidate
              className="space-y-6"
            >
              <div>
                <label className="label">Email address</label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
                  <input
                    type="email"
                    placeholder="you@example.com"
                    autoFocus
                    className={`input pl-10 ${emailForm.formState.errors.email ? "border-red-400 ring-1 ring-red-400" : ""}`}
                    {...emailForm.register("email")}
                  />
                </div>
                {emailForm.formState.errors.email && (
                  <p className="error-text">
                    {emailForm.formState.errors.email.message}
                  </p>
                )}
              </div>

              <motion.button
                type="submit"
                disabled={forgotMutation.isPending}
                whileTap={{ scale: 0.98 }}
                className="btn-primary w-full h-11"
              >
                {forgotMutation.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <ArrowRight className="h-4 w-4" />
                )}
                {forgotMutation.isPending
                  ? "Sending code..."
                  : "Send reset code"}
              </motion.button>
            </form>
          </motion.div>
        )}

        {step === "otp" && (
          <motion.div
            key="otp"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            transition={{ duration: 0.2 }}
          >
            <form
              onSubmit={otpForm.handleSubmit(onOtpSubmit)}
              noValidate
              className="space-y-8"
            >
              <div>
                <div className="flex items-center justify-between mb-6">
                  <label className="label">Verification Code</label>
                  <button
                    type="button"
                    onClick={() => setStep("email")}
                    className="text-xs text-primary-600 hover:underline flex items-center gap-1"
                  >
                    <ArrowLeft className="w-3 h-3" /> Change Email
                  </button>
                </div>

                <Controller
                  control={otpForm.control}
                  name="otp"
                  render={({ field }) => (
                    <OtpInput
                      value={field.value || ""}
                      onChange={(val) => {
                        field.onChange(val);
                        if (val.length === 6) {
                          otpForm.handleSubmit(onOtpSubmit)();
                        }
                      }}
                      disabled={verifyMutation.isPending}
                    />
                  )}
                />

                {otpForm.formState.errors.otp && (
                  <p className="error-text text-center mt-4">
                    {otpForm.formState.errors.otp.message}
                  </p>
                )}
              </div>

              <motion.button
                type="submit"
                disabled={verifyMutation.isPending}
                whileTap={{ scale: 0.98 }}
                className="btn-primary w-full h-11"
              >
                {verifyMutation.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : null}
                {verifyMutation.isPending ? "Verifying..." : "Verify Code"}
              </motion.button>

              <div className="text-center">
                <button
                  type="button"
                  disabled={forgotMutation.isPending}
                  onClick={() => forgotMutation.mutate({ email })}
                  className="text-sm text-gray-500 hover:text-primary-600 transition-colors disabled:opacity-50"
                >
                  {forgotMutation.isPending
                    ? "Sending..."
                    : "Didn't receive the code? Resend"}
                </button>
              </div>
            </form>
          </motion.div>
        )}

        {step === "password" && (
          <motion.div
            key="password"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            transition={{ duration: 0.2 }}
          >
            <form
              onSubmit={passwordForm.handleSubmit(onPasswordSubmit)}
              noValidate
              className="space-y-5"
            >
              <PasswordInput
                label="New Password"
                placeholder="••••••••"
                error={passwordForm.formState.errors.password?.message}
                {...passwordForm.register("password")}
              />

              <PasswordInput
                label="Confirm New Password"
                placeholder="••••••••"
                error={passwordForm.formState.errors.confirmPassword?.message}
                {...passwordForm.register("confirmPassword")}
              />

              <motion.button
                type="submit"
                disabled={resetMutation.isPending}
                whileTap={{ scale: 0.98 }}
                className="btn-primary w-full h-11"
              >
                {resetMutation.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <CheckCircle2 className="w-4 h-4" />
                )}
                {resetMutation.isPending ? "Saving..." : "Change Password"}
              </motion.button>
            </form>
          </motion.div>
        )}

        {step === "success" && (
          <motion.div
            key="success"
            initial={{ scale: 0.95, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="text-center py-4"
          >
            <div className="w-16 h-16 bg-green-100 dark:bg-green-900/30 text-green-600 rounded-full flex items-center justify-center mx-auto mb-6">
              <CheckCircle2 className="w-8 h-8" />
            </div>
            <p className="text-sm text-gray-500 mb-8 dark:text-gray-400">
              You've successfully secured your account. You can now go back to
              sign in.
            </p>
            <motion.button
              onClick={() => navigate("/login")}
              whileTap={{ scale: 0.98 }}
              className="btn-primary w-full h-11"
            >
              Sign in with new password
            </motion.button>
          </motion.div>
        )}
      </AnimatePresence>

      {step !== "success" && (
        <div className="mt-8 text-center">
          <Link
            to="/login"
            className="text-sm font-medium text-gray-500 hover:text-primary-600 transition-colors inline-flex items-center gap-1"
          >
            Back to sign in
          </Link>
        </div>
      )}
    </AuthLayout>
  );
}
