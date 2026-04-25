import { useState } from 'react';
import { LogIn, UserPlus } from 'lucide-react';
import LoginForm from '@/components/auth/LoginForm';
import RegisterForm from '@/components/auth/RegisterForm';
import VerifyOtpForm from '@/components/auth/VerifyOtpForm';

interface Props {
  onSuccess: () => void;
}

export default function ApplicantAuthGate({ onSuccess }: Props) {
  const [mode, setMode] = useState<'login' | 'register'>('register');
  const [showOtp, setShowOtp] = useState(false);
  const [email, setEmail] = useState('');
  const [devOtp, setDevOtp] = useState<string | undefined>();

  const handleLoginSuccess = (response: any) => {
    if (response.otp_required) {
      setEmail(response.data.email);
      setDevOtp(response.data.dev_otp);
      setShowOtp(true);
    } else {
      onSuccess();
    }
  };

  const handleRegisterSuccess = (data: any) => {
    setEmail(data.email);
    setDevOtp(data.dev_otp);
    setShowOtp(true);
  };

  return (
    <div className="space-y-6 animate-fade-up max-w-md mx-auto p-4">
      <div className="text-center">
        <h2 className="text-[20px] font-bold text-ink-900 tracking-tight">
          {mode === 'register' ? 'Join CUR-MIS' : 'Welcome back'}
        </h2>
        <p className="text-[13px] text-ink-500 mt-1.5 leading-relaxed">
          {mode === 'register' 
            ? 'Create an account to save your progress and track your application.' 
            : 'Sign in to continue your existing application.'}
        </p>
      </div>

      {!showOtp && (
        <div className="flex p-1 bg-ink-100/50 dark:bg-ink-800 rounded-xl">
          <button
            onClick={() => setMode('register')}
            className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-[13px] font-semibold transition-all ${
              mode === 'register' ? 'bg-white dark:bg-ink-700 shadow-sm text-brand' : 'text-ink-500 hover:text-ink-700'
            }`}
          >
            <UserPlus className="w-3.5 h-3.5" /> Register
          </button>
          <button
            onClick={() => setMode('login')}
            className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-[13px] font-semibold transition-all ${
              mode === 'login' ? 'bg-white dark:bg-ink-700 shadow-sm text-brand' : 'text-ink-500 hover:text-ink-700'
            }`}
          >
            <LogIn className="w-3.5 h-3.5" /> Log In
          </button>
        </div>
      )}

      {showOtp ? (
        <VerifyOtpForm 
          email={email} 
          devOtp={devOtp} 
          onSuccess={onSuccess} 
        />
      ) : mode === 'login' ? (
        <LoginForm onSuccess={handleLoginSuccess} />
      ) : (
        <RegisterForm onSuccess={handleRegisterSuccess} />
      )}
    </div>
  );
}
