import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { motion } from "framer-motion";
import { Loader2, ArrowRight, Mail } from "lucide-react";
import { useLocation, useNavigate, Link } from "react-router-dom";
import { useEffect, useState } from "react";
import { useVerifyOtp, useResendOtp } from "@/hooks/useAuth";
import AuthLayout from "@/components/auth/AuthLayout";
import OtpInput from "@/components/auth/OtpInput";
import { Controller } from "react-hook-form";

const otpSchema = z.object({
  otp: z.string().length(6, "Verification code must be 6 digits"),
});

type OtpFormValues = z.infer<typeof otpSchema>;

export default function VerifyOtpPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const email = location.state?.email;

  const verifyMutation = useVerifyOtp();
  const resendMutation = useResendOtp();

  const [resendTimer, setResendTimer] = useState(60);

  useEffect(() => {
    if (!email) {
      navigate("/login");
    }
  }, [email, navigate]);

  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (resendTimer > 0) {
      interval = setInterval(() => {
        setResendTimer((prev) => prev - 1);
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [resendTimer]);

  const {
    control,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<OtpFormValues>({ resolver: zodResolver(otpSchema) });

  const onSubmit = (data: OtpFormValues) => {
    if (email) verifyMutation.mutate({ email, otp: data.otp });
  };

  const onResend = () => {
    if (email && resendTimer === 0) {
      resendMutation.mutate(email);
      setResendTimer(60);
    }
  };

  const busy = isSubmitting || verifyMutation.isPending;

  if (!email) return null;

  return (
    <AuthLayout 
      title="Verify your identity" 
      subtitle={`Code sent to ${email}`}
    >
      <div className="text-center mb-8 lg:hidden">
        <p className="text-gray-500 dark:text-gray-400 mt-2 text-sm flex items-center justify-center gap-1">
          <Mail className="w-4 h-4" /> Code sent to <span className="font-medium text-gray-900 dark:text-gray-100">{email}</span>
        </p>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-8">
        <div>
          <label className="label text-center block mb-6">Enter 6-digit code</label>
          <Controller
            control={control}
            name="otp"
            render={({ field }) => (
              <OtpInput
                value={field.value || ""}
                onChange={(val) => {
                  field.onChange(val);
                  if (val.length === 6) {
                    handleSubmit(onSubmit)();
                  }
                }}
                disabled={busy}
              />
            )}
          />
          {errors.otp && (
            <motion.p 
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              className="error-text text-center mt-4"
            >
              {errors.otp.message}
            </motion.p>
          )}
        </div>

        <motion.button
          type="submit"
          disabled={busy}
          whileTap={{ scale: 0.98 }}
          className="btn-primary w-full h-12 text-lg"
        >
          {busy ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <ArrowRight className="h-4 w-4" />
          )}
          {busy ? "Verifying..." : "Confirm & Sign In"}
        </motion.button>
      </form>

      <div className="mt-8 pt-6 border-t border-gray-100 dark:border-gray-800 text-center">
        <p className="text-gray-500 dark:text-gray-400 text-sm">
          Didn't receive the code?{" "}
          {resendTimer > 0 ? (
            <span className="text-gray-400 font-medium">Resend in {resendTimer}s</span>
          ) : (
            <button
              onClick={onResend}
              disabled={resendMutation.isPending}
              className="text-primary-600 font-bold hover:underline"
            >
              Resend code
            </button>
          )}
        </p>
        <Link to="/login" className="mt-4 inline-block text-xs text-gray-400 hover:text-gray-600">
          Back to Sign In
        </Link>
      </div>
    </AuthLayout>
  );
}
