import { Link } from "react-router-dom";
import { useNavigate } from "react-router-dom";
import AuthLayout from "@/components/auth/AuthLayout";
import RegisterForm from "@/components/auth/RegisterForm";

export default function RegisterPage() {
  const navigate = useNavigate();

  const handleRegisterSuccess = (data: any) => {
    navigate("/verify-otp", { state: { email: data.email, devOtp: data.dev_otp } });
  };

  return (
    <AuthLayout 
      title="Create an account" 
      subtitle="Join CUR to start your academic journey. This account will be used to track your applications."
    >
      <RegisterForm onSuccess={handleRegisterSuccess} />

      <div className="mt-8 pt-6 border-t border-gray-100 dark:border-gray-800 text-center">
        <p className="text-gray-500 dark:text-gray-400 text-sm">
          Already have an account?{" "}
          <Link to="/login" className="text-primary-600 font-semibold hover:underline">
            Sign in here
          </Link>
        </p>
      </div>
    </AuthLayout>
  );
}
