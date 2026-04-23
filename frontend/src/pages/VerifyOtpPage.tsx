import { Mail } from "lucide-react";
import { useLocation, useNavigate, Link } from "react-router-dom";
import { useEffect } from "react";
import AuthLayout from "@/components/auth/AuthLayout";
import VerifyOtpForm from "@/components/auth/VerifyOtpForm";

export default function VerifyOtpPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const email   = location.state?.email;
  const devOtp  = location.state?.devOtp as string | undefined;

  useEffect(() => {
    if (!email) {
      navigate("/login");
    }
  }, [email, navigate]);

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

      <VerifyOtpForm email={email} devOtp={devOtp} />

      <div className="mt-8 text-center">
        <Link to="/login" className="inline-block text-xs text-gray-400 hover:text-gray-600">
          Back to Sign In
        </Link>
      </div>
    </AuthLayout>
  );
}
