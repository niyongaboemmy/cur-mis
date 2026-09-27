import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { motion } from "framer-motion";
import { Loader2, ArrowRight } from "lucide-react";
import { useEffect, useState } from "react";
import { useVerifyOtp, useResendOtp } from "@/hooks/useAuth";
import OtpInput from "@/components/auth/OtpInput";

const otpSchema = z.object({
  otp: z.string().length(6, "Verification code must be 6 digits"),
});

export type OtpFormValues = z.infer<typeof otpSchema>;

export default function VerifyOtpForm({ 
  email, 
  devOtp, 
  onSuccess 
}: { 
  email: string; 
  devOtp?: string; 
  onSuccess?: (data: any) => void;
}) {
  const verifyMutation = useVerifyOtp({ onSuccess });
  const [resendTimer, setResendTimer] = useState(60);

  // `devOtp` arrives via router state and is frozen for the life of the page,
  // but a resend rotates the code server-side. Track the live one separately so
  // the banner and the inputs can never show a code the backend has replaced.
  const [activeOtp, setActiveOtp] = useState<string | undefined>(devOtp);

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
    setValue,
  } = useForm<OtpFormValues>({
    resolver: zodResolver(otpSchema),
    defaultValues: { otp: devOtp ?? "" },
  });

  const resendMutation = useResendOtp({
    onNewCode: (code) => {
      setActiveOtp(code);
      // Whether or not a dev code came back, whatever is in the boxes belongs
      // to the superseded OTP — never leave it there to be submitted.
      setValue("otp", code && code.length === 6 ? code : "");
    },
  });

  useEffect(() => {
    setActiveOtp(devOtp);
  }, [devOtp]);

  useEffect(() => {
    if (activeOtp && activeOtp.length === 6) {
      setValue("otp", activeOtp);
    }
  }, [activeOtp, setValue]);

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

  return (
    <div className="space-y-6">
      {activeOtp && (
        <div className="rounded-xl border border-blue-200 bg-blue-50 dark:bg-blue-900/20 dark:border-blue-900/40 px-4 py-3 text-blue-800 dark:text-blue-200 text-xs mb-2">
          <p className="font-semibold flex items-center gap-1.5">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-blue-500"></span>
            </span>
            Dev Mode — Verification Code
          </p>
          <p className="mt-0.5 ml-3.5">Auto-filled: <span className="font-mono font-bold tracking-widest">{activeOtp}</span></p>
        </div>
      )}

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
          <span className="ml-2">{busy ? "Verifying..." : "Confirm & Sign In"}</span>
        </motion.button>
      </form>

      <div className="pt-4 border-t border-gray-100 dark:border-gray-800 text-center">
        <p className="text-gray-500 dark:text-gray-400 text-sm">
          Didn't receive the code?{" "}
          {resendTimer > 0 ? (
            <span className="text-gray-400 font-medium">Resend in {resendTimer}s</span>
          ) : (
            <button
              type="button"
              onClick={onResend}
              disabled={resendMutation.isPending}
              className="text-primary-600 font-semibold hover:underline"
            >
              Resend code
            </button>
          )}
        </p>
      </div>
    </div>
  );
}
