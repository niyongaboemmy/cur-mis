import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useSearchParams } from 'react-router-dom'
import {
  ShieldCheck, ShieldX, AlertTriangle, Loader2, Search, GraduationCap,
} from 'lucide-react'
import {
  publicService,
  type TranscriptSheet,
  type TranscriptVerifyResult,
} from '@/services/publicService'

function fmt(d?: string | null) {
  if (!d) return '—'
  try { return new Date(d).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' }) }
  catch { return d }
}

/**
 * Public page a transcript's QR code opens: /verify/transcript?code=XXXX-XXXX-XXXX-XXXX.
 * Shows the transcript exactly as it was issued, sheet by sheet, so whoever
 * holds the paper copy can check every figure against the university's record.
 */
export default function VerifyTranscriptPage() {
  const [sp, setSp] = useSearchParams()
  const code = sp.get('code') ?? ''
  const [input, setInput] = useState(code)

  // The page shows a student's results: keep it out of search engines.
  useEffect(() => {
    const meta = document.createElement('meta')
    meta.name = 'robots'
    meta.content = 'noindex, nofollow'
    document.head.appendChild(meta)
    return () => { meta.remove() }
  }, [])

  const q = useQuery({
    queryKey: ['verify-transcript', code],
    queryFn: () => publicService.verifyTranscript(code),
    enabled: code.trim() !== '',
    retry: false,
  })

  const result: TranscriptVerifyResult | null | undefined = q.data?.data
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
          <p className="text-[13px] text-slate-500">Academic transcript verification</p>
        </div>
      </div>

      {/* Search */}
      <form onSubmit={submit} className="w-full max-w-md flex gap-2 mb-6">
        <input
          className="input flex-1 font-mono uppercase" value={input} placeholder="XXXX-XXXX-XXXX-XXXX"
          onChange={(e) => setInput(e.target.value)}
          aria-label="Verification code"
        />
        <button className="btn-primary btn-sm" type="submit">
          <Search className="w-4 h-4" /> Verify
        </button>
      </form>

      {/* Result */}
      <div className="w-full max-w-3xl">
        {code.trim() === '' ? (
          <div className="card p-8 text-center text-slate-400 text-[14px] max-w-md mx-auto">
            Scan the QR code on a CUR transcript to check it against the university's record.
          </div>
        ) : q.isLoading ? (
          <div className="card p-10 text-center max-w-md mx-auto"><Loader2 className="w-7 h-7 animate-spin mx-auto text-blue-700" /></div>
        ) : q.isError ? (
          <div className="card p-8 text-center text-red-500 max-w-md mx-auto">Could not reach the verification service. Try again.</div>
        ) : !result?.found ? (
          <div className="card p-8 text-center max-w-md mx-auto">
            <ShieldX className="w-12 h-12 mx-auto text-red-500 mb-2" />
            <h2 className="font-bold text-lg text-slate-800 dark:text-slate-100">No matching transcript</h2>
            <p className="text-[13px] text-slate-500 mt-1">
              The university has not issued a transcript with this code. Check the code, or treat the document as not genuine.
            </p>
          </div>
        ) : (
          <TranscriptResult r={result} />
        )}
      </div>

      <p className="mt-8 text-[11px] text-slate-400 text-center max-w-md">
        This page shows the transcript exactly as the Catholic University of Rwanda issued it. Every name,
        mark and grade on the paper copy must match what is shown here.
      </p>
    </div>
  )
}

function TranscriptResult({ r }: { r: TranscriptVerifyResult }) {
  const s = r.student
  return (
    <div className="space-y-4">
      <div className="card overflow-hidden">
        <div className="flex items-center gap-2 px-4 py-2.5 border-b font-bold text-[13px] tracking-wide bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-300">
          <ShieldCheck className="w-5 h-5" /> GENUINE TRANSCRIPT — issued by the Catholic University of Rwanda
        </div>

        {r.superseded_on && (
          <div className="flex gap-2 px-4 py-3 border-b border-amber-200 bg-amber-50 text-amber-800 dark:bg-amber-900/20 dark:text-amber-300 text-[13px]">
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>
              This copy is genuine, but the student's results changed after it was issued. A newer transcript was
              issued on {fmt(r.superseded_on)}; ask the holder for the latest copy.
            </span>
          </div>
        )}

        <div className="p-5 grid sm:grid-cols-2 gap-x-6 gap-y-1 text-[13px]">
          <Row label="Surname" value={s?.surname} />
          <Row label="Faculty" value={s?.faculty} />
          <Row label="Other names" value={s?.other_names} />
          <Row label="Department" value={s?.department} />
          <Row label="Registration number" value={s?.regnumber} mono />
          <Row label="Option" value={s?.option} />
        </div>

        <div className="px-5 py-3 border-t border-slate-100 dark:border-ink-700 text-[12px] text-slate-500 flex flex-wrap gap-x-6 gap-y-1">
          <span>Issued {r.issued_place ? `at ${r.issued_place} ` : ''}on {fmt(r.issued_on)}</span>
          {r.registrar && <span>Academic Registrar: {r.registrar}</span>}
          <span>Code: <span className="font-mono font-semibold text-slate-700 dark:text-slate-300">{r.code}</span></span>
        </div>
      </div>

      {(r.sheets ?? []).length === 0 ? (
        <div className="card p-6 text-center text-[13px] text-slate-500">
          This transcript was issued with no marks recorded.
        </div>
      ) : (
        (r.sheets ?? []).map((sheet, i) => <SheetCard key={i} sheet={sheet} />)
      )}
    </div>
  )
}

function SheetCard({ sheet }: { sheet: TranscriptSheet }) {
  const t = sheet.totals
  return (
    <div className="card overflow-hidden">
      <div className="px-4 py-2.5 border-b border-slate-100 dark:border-ink-700 font-bold text-[13px] text-slate-800 dark:text-slate-100">
        {sheet.level}
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-[12.5px]">
          <thead className="bg-slate-50 dark:bg-ink-800 text-slate-500 text-[11px] uppercase tracking-wide">
            <tr>
              <th className="text-left px-3 py-2 font-semibold">No</th>
              <th className="text-left px-3 py-2 font-semibold">Module code</th>
              <th className="text-left px-3 py-2 font-semibold">Module title</th>
              <th className="text-center px-3 py-2 font-semibold">Credits</th>
              <th className="text-center px-3 py-2 font-semibold">Marks/100</th>
              <th className="text-center px-3 py-2 font-semibold">Credit point</th>
              <th className="text-center px-3 py-2 font-semibold">Grade</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-ink-700">
            {sheet.modules.map((m, i) => (
              <tr key={i}>
                <td className="px-3 py-1.5 text-slate-500">{i + 1}</td>
                <td className="px-3 py-1.5 font-mono whitespace-nowrap">{m.code}</td>
                <td className="px-3 py-1.5">{m.title}</td>
                <td className="px-3 py-1.5 text-center">{m.credits}</td>
                <td className="px-3 py-1.5 text-center">{m.marks}</td>
                <td className="px-3 py-1.5 text-center">{m.credit_point}</td>
                <td className="px-3 py-1.5 text-center font-semibold">{m.grade}</td>
              </tr>
            ))}
            <tr className="font-bold bg-slate-50/60 dark:bg-ink-800/60">
              <td className="px-3 py-1.5" colSpan={3}>TOTAL</td>
              <td className="px-3 py-1.5 text-center">{t.credits}</td>
              <td className="px-3 py-1.5 text-center">{t.weighted_average != null ? `${t.weighted_average} %` : '—'}</td>
              <td className="px-3 py-1.5 text-center">{t.credit_points}</td>
              <td />
            </tr>
          </tbody>
        </table>
      </div>
      <div className="px-4 py-2.5 border-t border-slate-100 dark:border-ink-700 text-[12.5px] flex flex-wrap gap-x-6 gap-y-1">
        <span>Weighted average: <b>{t.weighted_average != null ? `${t.weighted_average} %` : '—'}</b></span>
        <span>Grade: <b>{t.grade ?? '—'}</b></span>
        <span>Decision: <b>{t.decision ?? '—'}</b></span>
      </div>
    </div>
  )
}

function Row({ label, value, mono }: { label: string; value?: string | null; mono?: boolean }) {
  return (
    <div className="flex gap-1.5 py-0.5">
      <span className="font-semibold text-slate-700 dark:text-slate-300 whitespace-nowrap">{label}:</span>
      <span className={`text-slate-600 dark:text-slate-400 ${mono ? 'font-mono' : ''}`}>{value || '—'}</span>
    </div>
  )
}
