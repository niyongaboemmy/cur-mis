import { useState, useEffect } from 'react'
import { useMutation } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { Loader2, Mail, RefreshCw } from 'lucide-react'
import { applicantService } from '@/services/admissionService'

interface Props {
  email: string
  onSuccess: () => void
}

const COOLDOWN_SECONDS = 60

export default function VerificationStep({ email, onSuccess }: Props) {
  const [code, setCode] = useState('')
  const [cooldown, setCooldown] = useState(COOLDOWN_SECONDS)

  useEffect(() => {
    if (cooldown <= 0) return
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000)
    return () => clearTimeout(t)
  }, [cooldown])

  const verifyM = useMutation({
    mutationFn: (c: string) => applicantService.verifyApplication({ code: c }),
    onSuccess: () => {
      toast.success('Application verified successfully!')
      onSuccess()
    },
    onError: (e: any) => toast.error(e?.response?.data?.message || 'Verification failed'),
  })

  const resendM = useMutation({
    mutationFn: () => applicantService.resendVerificationCode(),
    onSuccess: () => {
      toast.success('New code sent — check your inbox')
      setCooldown(COOLDOWN_SECONDS)
      setCode('')
    },
    onError: (e: any) => toast.error(e?.response?.data?.message || 'Failed to resend'),
  })

  return (
    <div className="card p-8 space-y-6 text-center max-w-md mx-auto animate-fade-up">
      <div className="w-16 h-16 bg-brand/10 text-brand rounded-full flex items-center justify-center mx-auto mb-2">
        <Mail className="w-8 h-8" />
      </div>
      <div className="space-y-2">
        <h2 className="text-[20px] font-bold text-ink-900 dark:text-white">Verify your application</h2>
        <p className="text-[13px] text-ink-500 leading-relaxed dark:text-ink-400">
          We've sent a 6-digit verification code to{' '}
          <span className="font-semibold text-ink-900 dark:text-white">{email}</span>.
          Please enter it below to complete your submission.
        </p>
      </div>

      <div className="space-y-4">
        <input
          type="text"
          inputMode="numeric"
          maxLength={6}
          placeholder="000000"
          className="input text-center text-[24px] tracking-[0.5em] font-bold h-16"
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
        />
        <button
          onClick={() => verifyM.mutate(code)}
          disabled={code.length !== 6 || verifyM.isPending}
          className="btn-primary w-full h-12"
        >
          {verifyM.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Verify & Finish'}
        </button>
      </div>

      <div className="text-[12px] text-ink-400">
        Didn't receive the code? Check your spam folder or{' '}
        {cooldown > 0 ? (
          <span className="text-ink-500">resend in {cooldown}s</span>
        ) : (
          <button
            className="text-brand hover:underline inline-flex items-center gap-1"
            onClick={() => resendM.mutate()}
            disabled={resendM.isPending}
          >
            {resendM.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
            resend code
          </button>
        )}
      </div>
    </div>
  )
}
