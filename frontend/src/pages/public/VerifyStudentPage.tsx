import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useSearchParams } from 'react-router-dom'
import {
  ShieldCheck, ShieldX, ShieldAlert, Loader2, Search, GraduationCap,
} from 'lucide-react'
import { publicService, publicPhotoUrl, type StudentVerifyResult } from '@/services/publicService'

function fmt(d?: string | null) {
  if (!d) return '—'
  try { return new Date(d).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }) }
  catch { return d }
}

export default function VerifyStudentPage() {
  const [sp, setSp] = useSearchParams()
  const code = sp.get('code') ?? ''
  const [input, setInput] = useState(code)

  const q = useQuery({
    queryKey: ['verify-student', code],
    queryFn: () => publicService.verifyStudent(code),
    enabled: code.trim() !== '',
  })

  const result: StudentVerifyResult | null | undefined = q.data?.data
  const submit = (e: React.FormEvent) => { e.preventDefault(); setSp(input.trim() ? { code: input.trim() } : {}) }

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-slate-100 dark:from-ink-900 dark:to-ink-950 flex flex-col items-center py-10 px-4">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <div className="w-11 h-11 rounded-xl bg-blue-700 text-white grid place-items-center">
          <GraduationCap className="w-6 h-6" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-blue-800 dark:text-blue-300">Catholic University of Rwanda</h1>
          <p className="text-[13px] text-slate-500">Student ID card verification</p>
        </div>
      </div>

      {/* Search */}
      <form onSubmit={submit} className="w-full max-w-md flex gap-2 mb-6">
        <input
          className="input flex-1" value={input} placeholder="Enter card number / code"
          onChange={(e) => setInput(e.target.value)}
        />
        <button className="btn-primary btn-sm" type="submit">
          <Search className="w-4 h-4" /> Verify
        </button>
      </form>

      {/* Result */}
      <div className="w-full max-w-md">
        {code.trim() === '' ? (
          <div className="card p-8 text-center text-slate-400 text-[14px]">
            Scan a student card's QR code or enter its number above to verify the holder.
          </div>
        ) : q.isLoading ? (
          <div className="card p-10 text-center"><Loader2 className="w-7 h-7 animate-spin mx-auto text-blue-700" /></div>
        ) : q.isError ? (
          <div className="card p-8 text-center text-red-500">Could not reach the verification service. Try again.</div>
        ) : !result?.found ? (
          <div className="card p-8 text-center">
            <ShieldX className="w-12 h-12 mx-auto text-red-500 mb-2" />
            <h2 className="font-bold text-lg text-slate-800 dark:text-slate-100">No matching card</h2>
            <p className="text-[13px] text-slate-500 mt-1">No student ID card was found for this code. It may be invalid or mistyped.</p>
          </div>
        ) : (
          <ResultCard r={result} />
        )}
      </div>

      <p className="mt-8 text-[11px] text-slate-400 text-center max-w-md">
        This page confirms whether a CUR student ID card is genuine and currently valid. It shows only
        basic identity details for verification purposes.
      </p>
    </div>
  )
}

function ResultCard({ r }: { r: StudentVerifyResult }) {
  const tone = r.valid
    ? { icon: <ShieldCheck className="w-5 h-5" />, cls: 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-300', label: 'VALID CARD' }
    : r.status === 'expired'
      ? { icon: <ShieldAlert className="w-5 h-5" />, cls: 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-900/30 dark:text-amber-300', label: 'EXPIRED CARD' }
      : { icon: <ShieldX className="w-5 h-5" />, cls: 'bg-red-50 text-red-700 border-red-200 dark:bg-red-900/30 dark:text-red-300', label: 'REVOKED CARD' }

  return (
    <div className="card overflow-hidden">
      <div className={`flex items-center gap-2 px-4 py-2.5 border-b font-bold text-[13px] tracking-wide ${tone.cls}`}>
        {tone.icon} {tone.label}
      </div>
      <div className="p-5 flex gap-4">
        <div className="w-24 h-28 rounded-lg border border-slate-200 dark:border-ink-700 bg-slate-100 dark:bg-ink-800 overflow-hidden shrink-0 grid place-items-center">
          {r.photo_url
            ? <img src={publicPhotoUrl(r.photo_url)} alt="" className="w-full h-full object-cover"
                onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none' }} />
            : <GraduationCap className="w-8 h-8 text-slate-300" />}
        </div>
        <div className="flex-1 min-w-0 text-[13px]">
          <div className="text-lg font-bold text-slate-900 dark:text-slate-50">{r.full_name}</div>
          <div className="font-mono text-blue-700 dark:text-blue-300 mb-2">{r.regnumber}</div>
          <Row label="Faculty" value={r.faculty} />
          <Row label="Department" value={r.department} />
          <Row label="Level" value={r.level} />
          <Row label="Mode" value={r.program} />
        </div>
      </div>
      <div className="px-5 py-3 border-t border-slate-100 dark:border-ink-700 text-[12px] text-slate-500 flex justify-between">
        <span>Issued: {fmt(r.issued_at)}</span>
        <span>Expires: {fmt(r.expires_at)}</span>
      </div>
    </div>
  )
}

function Row({ label, value }: { label: string; value?: string | null }) {
  return (
    <div className="flex gap-1">
      <span className="font-semibold text-slate-700 dark:text-slate-300">{label}:</span>
      <span className="text-slate-600 dark:text-slate-400 truncate">{value ?? '—'}</span>
    </div>
  )
}
