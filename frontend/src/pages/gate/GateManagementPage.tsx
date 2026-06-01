import { useCallback, useEffect, useRef, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  ScanLine,
  Search,
  CheckCircle2,
  XCircle,
  User,
  CreditCard,
  ClipboardList,
  RefreshCw,
  ShieldCheck,
  ShieldX,
  Activity,
  Clock,
  TrendingUp,
  Building2,
  ChevronLeft,
  ChevronRight,
  X,
  Filter,
  BarChart2,
  Wifi,
} from 'lucide-react'
import toast from 'react-hot-toast'
import { AnimatePresence, motion } from 'framer-motion'
import {
  gateService,
  type GateVerifyResult,
  type GateLog,
  type ScanType,
  type AccessResult,
} from '@/services/gateService'

// ── Constants ─────────────────────────────────────────────────────────────────

const SCAN_TYPES: { value: ScanType; label: string; icon: typeof ScanLine }[] = [
  { value: 'student_id',   label: 'Student ID',   icon: User },
  { value: 'receipt',      label: 'Payment',      icon: CreditCard },
  { value: 'registration', label: 'Registration', icon: ClipboardList },
]

const GATES = ['Main Gate', 'Library Gate', 'Exam Hall', 'Admin Block', 'Sports Ground']

function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
}
function fmtAmt(n: number) {
  return n.toLocaleString('en-US') + ' RWF'
}

// ── Sub-components ────────────────────────────────────────────────────────────

function StatCard({ icon: Icon, label, value, color }: {
  icon: typeof Activity; label: string; value: number | string; color: string
}) {
  return (
    <div className="bg-white dark:bg-ink-800 rounded-xl border border-ink-200 dark:border-ink-700 p-4 flex items-center gap-3">
      <div className={`w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 ${color}`}>
        <Icon size={20} />
      </div>
      <div>
        <p className="text-2xl font-bold text-ink-900 dark:text-ink-100">{value}</p>
        <p className="text-xs text-ink-500 dark:text-ink-400">{label}</p>
      </div>
    </div>
  )
}

function ResultBadge({ result }: { result: AccessResult }) {
  if (result === 'granted') {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400">
        <CheckCircle2 size={12} /> Granted
      </span>
    )
  }
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400">
      <XCircle size={12} /> Denied
    </span>
  )
}

// ── Verification Result Panel ─────────────────────────────────────────────────

function VerificationResult({ result, onDismiss }: { result: GateVerifyResult; onDismiss: () => void }) {
  const granted = result.access_result === 'granted'

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.95 }}
      transition={{ duration: 0.22 }}
      className={`relative rounded-2xl border-2 p-6 shadow-xl ${
        granted
          ? 'border-green-400 bg-green-50 dark:bg-green-900/20'
          : 'border-red-400 bg-red-50 dark:bg-red-900/20'
      }`}
    >
      {/* Dismiss */}
      <button
        onClick={onDismiss}
        className="absolute top-3 right-3 text-ink-400 hover:text-ink-700 dark:hover:text-ink-200"
      >
        <X size={18} />
      </button>

      {/* Big result icon */}
      <div className="flex flex-col items-center mb-6">
        {granted ? (
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ type: 'spring', stiffness: 260, damping: 20 }}
          >
            <ShieldCheck size={80} className="text-green-500" />
          </motion.div>
        ) : (
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ type: 'spring', stiffness: 260, damping: 20 }}
          >
            <ShieldX size={80} className="text-red-500" />
          </motion.div>
        )}
        <h2 className={`mt-2 text-3xl font-black tracking-wide ${granted ? 'text-green-600' : 'text-red-600'}`}>
          {granted ? 'ACCESS GRANTED' : 'ACCESS DENIED'}
        </h2>
        {result.deny_reason && (
          <p className="mt-1 text-sm font-medium text-red-600 dark:text-red-400 text-center">{result.deny_reason}</p>
        )}
      </div>

      {/* Student info */}
      <div className="flex gap-4 items-start mb-4">
        <div className="w-14 h-14 rounded-full bg-ink-200 dark:bg-ink-700 flex items-center justify-center overflow-hidden flex-shrink-0">
          {result.student.photo_url ? (
            <img src={result.student.photo_url} alt="" className="w-full h-full object-cover" />
          ) : (
            <User size={28} className="text-ink-400" />
          )}
        </div>
        <div>
          <p className="text-lg font-bold text-ink-900 dark:text-ink-100">{result.student.name}</p>
          <p className="text-sm text-ink-500">{result.student.regnumber}</p>
          <p className="text-sm text-ink-500">{result.student.program ?? '—'} • {result.student.level ?? '—'}</p>
        </div>
      </div>

      {/* Status grid */}
      <div className="grid grid-cols-2 gap-3">
        {/* Payment */}
        <div className={`rounded-xl p-4 flex items-center gap-3 ${
          result.payment_cleared
            ? 'bg-green-100 dark:bg-green-900/30'
            : 'bg-red-100 dark:bg-red-900/30'
        }`}>
          <CreditCard size={22} className={result.payment_cleared ? 'text-green-600' : 'text-red-600'} />
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-ink-500">Fees</p>
            <p className={`text-sm font-bold ${result.payment_cleared ? 'text-green-700 dark:text-green-300' : 'text-red-700 dark:text-red-300'}`}>
              {result.payment_cleared ? 'Cleared' : `Balance: ${fmtAmt(result.payment_balance)}`}
            </p>
          </div>
        </div>

        {/* Registration */}
        <div className={`rounded-xl p-4 flex items-center gap-3 ${
          result.registered
            ? 'bg-green-100 dark:bg-green-900/30'
            : 'bg-amber-100 dark:bg-amber-900/30'
        }`}>
          <ClipboardList size={22} className={result.registered ? 'text-green-600' : 'text-amber-600'} />
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-ink-500">Registration</p>
            <p className={`text-sm font-bold ${result.registered ? 'text-green-700 dark:text-green-300' : 'text-amber-700 dark:text-amber-300'}`}>
              {result.registered ? `${result.modules_count} module${result.modules_count !== 1 ? 's' : ''}` : 'Not registered'}
            </p>
          </div>
        </div>
      </div>

      {/* Footer */}
      <p className="mt-3 text-right text-xs text-ink-400">
        {result.scan_type} · {result.gate} · {fmtTime(result.verified_at)}
      </p>
    </motion.div>
  )
}

// ── Log Row ───────────────────────────────────────────────────────────────────

function LogRow({ log, animate }: { log: GateLog; animate?: boolean }) {
  const row = (
    <tr className="border-b border-ink-100 dark:border-ink-800 hover:bg-ink-50 dark:hover:bg-ink-800/50 transition-colors">
      <td className="px-4 py-3 text-sm font-medium text-ink-900 dark:text-ink-100 whitespace-nowrap">
        {log.student_id ?? <span className="text-ink-400 italic">unknown</span>}
      </td>
      <td className="px-4 py-3 text-sm text-ink-700 dark:text-ink-300">{log.student_name ?? '—'}</td>
      <td className="px-4 py-3 text-xs text-ink-500">{log.scan_type}</td>
      <td className="px-4 py-3 text-xs text-ink-500">{log.gate}</td>
      <td className="px-4 py-3"><ResultBadge result={log.result} /></td>
      <td className="px-4 py-3 text-xs text-ink-400 whitespace-nowrap">
        <span title={log.created_at}>{fmtTime(log.created_at)}</span>
      </td>
    </tr>
  )

  if (!animate) return row

  return (
    <motion.tr
      key={log.id}
      initial={{ opacity: 0, x: -10 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.25 }}
      className="border-b border-ink-100 dark:border-ink-800 hover:bg-ink-50 dark:hover:bg-ink-800/50 transition-colors"
    >
      <td className="px-4 py-3 text-sm font-medium text-ink-900 dark:text-ink-100 whitespace-nowrap">
        {log.student_id ?? <span className="text-ink-400 italic">unknown</span>}
      </td>
      <td className="px-4 py-3 text-sm text-ink-700 dark:text-ink-300">{log.student_name ?? '—'}</td>
      <td className="px-4 py-3 text-xs text-ink-500">{log.scan_type}</td>
      <td className="px-4 py-3 text-xs text-ink-500">{log.gate}</td>
      <td className="px-4 py-3"><ResultBadge result={log.result} /></td>
      <td className="px-4 py-3 text-xs text-ink-400 whitespace-nowrap">
        <span title={log.created_at}>{fmtTime(log.created_at)}</span>
      </td>
    </motion.tr>
  )
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function GateManagementPage() {
  const qc = useQueryClient()

  // ── Scanner state ─────────────────────────────────────────────────────────
  const [query,    setQuery]    = useState('')
  const [scanType, setScanType] = useState<ScanType>('student_id')
  const [gate,     setGate]     = useState('Main Gate')
  const [result,   setResult]   = useState<GateVerifyResult | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  // ── Log filters state ─────────────────────────────────────────────────────
  const [tab,          setTab]          = useState<'scanner' | 'logs' | 'stats'>('scanner')
  const [filterResult, setFilterResult] = useState<AccessResult | ''>('')
  const [filterSearch, setFilterSearch] = useState('')
  const [logPage,      setLogPage]      = useState(1)
  const [showFilters,  setShowFilters]  = useState(false)

  // ── Auto-refresh live feed ─────────────────────────────────────────────────
  const { data: recentRes, dataUpdatedAt } = useQuery({
    queryKey: ['gate', 'recent', gate],
    queryFn:  ({ signal }) => gateService.recentLogs({ limit: 20, gate }, signal),
    refetchInterval: 8000,
  })
  const recentLogs: GateLog[] = recentRes?.data ?? []
  const prevLogsRef = useRef<number[]>([])
  const newLogIds = recentLogs
    .filter(l => !prevLogsRef.current.includes(l.id))
    .map(l => l.id)
  useEffect(() => {
    prevLogsRef.current = recentLogs.map(l => l.id)
  }, [recentLogs])

  // ── Stats ─────────────────────────────────────────────────────────────────
  const { data: statsRes } = useQuery({
    queryKey: ['gate', 'stats', gate],
    queryFn:  ({ signal }) => gateService.getStats(gate, signal),
    refetchInterval: 15000,
  })
  const stats = statsRes?.data

  // ── Paginated logs ────────────────────────────────────────────────────────
  const { data: logsRes, isLoading: logsLoading } = useQuery({
    queryKey: ['gate', 'logs', { filterResult, filterSearch, logPage, gate }],
    queryFn:  ({ signal }) => gateService.listLogs({
      result:    (filterResult as AccessResult) || undefined,
      search:    filterSearch || undefined,
      gate:      gate || undefined,
      page:      logPage,
      per_page:  30,
    }, signal),
    enabled:        tab === 'logs',
    placeholderData: (prev) => prev,
  })
  const logs:     GateLog[] = logsRes?.data?.data    ?? []
  const logTotal: number    = logsRes?.data?.total   ?? 0
  const logLast:  number    = logsRes?.data?.last_page ?? 1

  // ── Verify mutation ───────────────────────────────────────────────────────
  const verifyMut = useMutation({
    mutationFn: () => gateService.verify({ query: query.trim(), scan_type: scanType, gate }),
    onSuccess: (res) => {
      const data = res.data!
      setResult(data)
      setQuery('')
      qc.invalidateQueries({ queryKey: ['gate', 'recent'] })
      qc.invalidateQueries({ queryKey: ['gate', 'stats'] })
      if (data.access_result === 'granted') {
        toast.success(`Access granted — ${data.student.name}`, { icon: '✅', duration: 3000 })
      } else {
        toast.error(`Access denied — ${data.deny_reason ?? ''}`, { icon: '🚫', duration: 4000 })
      }
      // Re-focus input for next scan
      setTimeout(() => inputRef.current?.focus(), 200)
    },
    onError: (e: any) => {
      const msg = e?.response?.data?.message ?? 'Verification failed'
      toast.error(msg)
      setQuery('')
      setTimeout(() => inputRef.current?.focus(), 200)
    },
  })

  const handleSubmit = useCallback((e?: React.FormEvent) => {
    e?.preventDefault()
    if (!query.trim()) return
    verifyMut.mutate()
  }, [query, verifyMut])

  // Auto-submit on barcode scan (ends with Enter rapidly)
  const lastKeyTime = useRef(0)
  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      handleSubmit()
      return
    }
    lastKeyTime.current = Date.now()
  }, [handleSubmit])

  // Focus input on mount and when tab is scanner
  useEffect(() => {
    if (tab === 'scanner') setTimeout(() => inputRef.current?.focus(), 50)
  }, [tab])

  return (
    <div className="max-w-6xl mx-auto px-4 py-6 space-y-6">

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-ink-900 dark:text-ink-100 flex items-center gap-2">
            <ScanLine size={26} className="text-blue-600" />
            Gate Management
          </h1>
          <p className="text-sm text-ink-500 mt-0.5">
            Verify student access · payment &amp; registration checks
          </p>
        </div>

        {/* Gate selector */}
        <div className="flex items-center gap-2">
          <Building2 size={16} className="text-ink-400" />
          <select
            value={gate}
            onChange={e => setGate(e.target.value)}
            className="text-sm border border-ink-200 dark:border-ink-700 rounded-lg px-3 py-1.5
                       bg-white dark:bg-ink-800 text-ink-800 dark:text-ink-200 focus:outline-none
                       focus:ring-2 focus:ring-blue-500"
          >
            {GATES.map(g => <option key={g}>{g}</option>)}
          </select>
          {/* Live indicator */}
          <span className="flex items-center gap-1 text-xs text-green-600 dark:text-green-400">
            <Wifi size={12} className="animate-pulse" /> Live
          </span>
        </div>
      </div>

      {/* ── Stat cards ─────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard icon={Activity}      label="Checks today"  value={stats?.today.total    ?? 0} color="bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400" />
        <StatCard icon={CheckCircle2}  label="Granted today" value={stats?.today.granted  ?? 0} color="bg-green-100 text-green-600 dark:bg-green-900/30 dark:text-green-400" />
        <StatCard icon={XCircle}       label="Denied today"  value={stats?.today.denied   ?? 0} color="bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400" />
        <StatCard icon={TrendingUp}    label="Pass rate"
          value={stats?.today.total
            ? Math.round((stats.today.granted / stats.today.total) * 100) + '%'
            : '—'}
          color="bg-purple-100 text-purple-600 dark:bg-purple-900/30 dark:text-purple-400"
        />
      </div>

      {/* ── Tabs ───────────────────────────────────────────────────────────── */}
      <div className="flex gap-1 p-1 bg-ink-100 dark:bg-ink-800 rounded-xl w-fit">
        {([
          { id: 'scanner', label: 'Scanner',   icon: ScanLine },
          { id: 'logs',    label: 'Audit Logs', icon: Clock },
          { id: 'stats',   label: 'Analytics',  icon: BarChart2 },
        ] as const).map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              tab === id
                ? 'bg-white dark:bg-ink-700 text-ink-900 dark:text-ink-100 shadow-sm'
                : 'text-ink-500 hover:text-ink-700 dark:hover:text-ink-300'
            }`}
          >
            <Icon size={15} />
            {label}
          </button>
        ))}
      </div>

      {/* ─────────────────────────────────────────────────────────────────── */}
      {/* TAB: Scanner                                                        */}
      {/* ─────────────────────────────────────────────────────────────────── */}
      {tab === 'scanner' && (
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">

          {/* Left: search + result */}
          <div className="lg:col-span-3 space-y-5">

            {/* Scan type selector */}
            <div className="flex gap-2">
              {SCAN_TYPES.map(({ value, label, icon: Icon }) => (
                <button
                  key={value}
                  onClick={() => setScanType(value)}
                  className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl border text-sm font-medium transition-all ${
                    scanType === value
                      ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300'
                      : 'border-ink-200 dark:border-ink-700 text-ink-500 hover:border-ink-300 dark:hover:border-ink-600'
                  }`}
                >
                  <Icon size={15} />
                  {label}
                </button>
              ))}
            </div>

            {/* Input */}
            <form onSubmit={handleSubmit} className="relative">
              <Search size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-ink-400 pointer-events-none" />
              <input
                ref={inputRef}
                type="text"
                value={query}
                onChange={e => setQuery(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Scan barcode or type reg. number / name…"
                autoFocus
                className="w-full pl-11 pr-24 py-4 text-base rounded-xl border-2 border-ink-200 dark:border-ink-700
                           bg-white dark:bg-ink-800 text-ink-900 dark:text-ink-100
                           focus:outline-none focus:border-blue-500 dark:focus:border-blue-400
                           placeholder:text-ink-400 transition-colors"
              />
              <button
                type="submit"
                disabled={!query.trim() || verifyMut.isPending}
                className="absolute right-3 top-1/2 -translate-y-1/2 px-4 py-2 rounded-lg bg-blue-600
                           text-white text-sm font-semibold disabled:opacity-50 hover:bg-blue-700
                           transition-colors flex items-center gap-1.5"
              >
                {verifyMut.isPending ? (
                  <RefreshCw size={14} className="animate-spin" />
                ) : (
                  <ScanLine size={14} />
                )}
                Verify
              </button>
            </form>

            {/* Result */}
            <AnimatePresence mode="wait">
              {result && (
                <VerificationResult
                  key={result.log_id ?? result.verified_at}
                  result={result}
                  onDismiss={() => setResult(null)}
                />
              )}
            </AnimatePresence>

            {/* Idle hint */}
            {!result && !verifyMut.isPending && (
              <div className="flex flex-col items-center justify-center py-12 text-ink-300 dark:text-ink-600">
                <ScanLine size={48} strokeWidth={1} />
                <p className="mt-3 text-sm">Ready to scan</p>
                <p className="text-xs mt-1">Scan a barcode or search by registration number</p>
              </div>
            )}
          </div>

          {/* Right: live feed */}
          <div className="lg:col-span-2">
            <div className="bg-white dark:bg-ink-800 rounded-xl border border-ink-200 dark:border-ink-700 overflow-hidden">
              <div className="flex items-center justify-between px-4 py-3 border-b border-ink-100 dark:border-ink-700">
                <h3 className="text-sm font-semibold text-ink-700 dark:text-ink-300 flex items-center gap-2">
                  <Activity size={14} className="text-blue-500 animate-pulse" />
                  Live Feed
                </h3>
                <span className="text-xs text-ink-400">
                  Updated {new Date(dataUpdatedAt).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                </span>
              </div>

              <div className="divide-y divide-ink-100 dark:divide-ink-700 max-h-[480px] overflow-y-auto">
                <AnimatePresence initial={false}>
                  {recentLogs.length === 0 && (
                    <div className="py-8 text-center text-ink-400 text-sm">No activity yet today</div>
                  )}
                  {recentLogs.map(log => (
                    <motion.div
                      key={log.id}
                      initial={newLogIds.includes(log.id) ? { opacity: 0, backgroundColor: '#dbeafe' } : false}
                      animate={{ opacity: 1, backgroundColor: 'transparent' }}
                      transition={{ duration: 0.6 }}
                      className="flex items-center gap-3 px-4 py-3"
                    >
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${
                        log.result === 'granted'
                          ? 'bg-green-100 dark:bg-green-900/30 text-green-600'
                          : 'bg-red-100 dark:bg-red-900/30 text-red-600'
                      }`}>
                        {log.result === 'granted' ? <CheckCircle2 size={16} /> : <XCircle size={16} />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-ink-800 dark:text-ink-200 truncate">
                          {log.student_name ?? log.student_id ?? 'Unknown'}
                        </p>
                        <p className="text-xs text-ink-400">{log.scan_type} · {log.gate}</p>
                      </div>
                      <span className="text-xs text-ink-400 flex-shrink-0">{fmtTime(log.created_at)}</span>
                    </motion.div>
                  ))}
                </AnimatePresence>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────────── */}
      {/* TAB: Audit Logs                                                     */}
      {/* ─────────────────────────────────────────────────────────────────── */}
      {tab === 'logs' && (
        <div className="space-y-4">
          {/* Filter toolbar */}
          <div className="flex flex-wrap gap-3 items-center">
            <div className="relative flex-1 min-w-48">
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-400 pointer-events-none" />
              <input
                type="text"
                value={filterSearch}
                onChange={e => { setFilterSearch(e.target.value); setLogPage(1) }}
                placeholder="Search by name or reg. number…"
                className="w-full pl-9 pr-3 py-2 text-sm rounded-lg border border-ink-200 dark:border-ink-700
                           bg-white dark:bg-ink-800 text-ink-800 dark:text-ink-200
                           focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <button
              onClick={() => setShowFilters(v => !v)}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-lg border text-sm transition-colors ${
                showFilters
                  ? 'border-blue-400 bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300'
                  : 'border-ink-200 dark:border-ink-700 text-ink-600 dark:text-ink-400'
              }`}
            >
              <Filter size={14} /> Filters
            </button>

            <button
              onClick={() => qc.invalidateQueries({ queryKey: ['gate', 'logs'] })}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-ink-200 dark:border-ink-700
                         text-sm text-ink-600 dark:text-ink-400 hover:bg-ink-50 dark:hover:bg-ink-800 transition-colors"
            >
              <RefreshCw size={14} /> Refresh
            </button>
          </div>

          {showFilters && (
            <motion.div
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex flex-wrap gap-3 p-4 bg-ink-50 dark:bg-ink-800 rounded-xl border border-ink-200 dark:border-ink-700"
            >
              <div>
                <label className="text-xs font-medium text-ink-500 block mb-1">Result</label>
                <select
                  value={filterResult}
                  onChange={e => { setFilterResult(e.target.value as AccessResult | ''); setLogPage(1) }}
                  className="text-sm border border-ink-200 dark:border-ink-700 rounded-lg px-3 py-1.5
                             bg-white dark:bg-ink-700 text-ink-800 dark:text-ink-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">All results</option>
                  <option value="granted">Granted</option>
                  <option value="denied">Denied</option>
                </select>
              </div>
            </motion.div>
          )}

          {/* Table */}
          <div className="bg-white dark:bg-ink-800 rounded-xl border border-ink-200 dark:border-ink-700 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="bg-ink-50 dark:bg-ink-900/50 border-b border-ink-200 dark:border-ink-700">
                    <th className="px-4 py-3 text-xs font-semibold text-ink-500 uppercase tracking-wide">Reg #</th>
                    <th className="px-4 py-3 text-xs font-semibold text-ink-500 uppercase tracking-wide">Name</th>
                    <th className="px-4 py-3 text-xs font-semibold text-ink-500 uppercase tracking-wide">Type</th>
                    <th className="px-4 py-3 text-xs font-semibold text-ink-500 uppercase tracking-wide">Gate</th>
                    <th className="px-4 py-3 text-xs font-semibold text-ink-500 uppercase tracking-wide">Result</th>
                    <th className="px-4 py-3 text-xs font-semibold text-ink-500 uppercase tracking-wide">Time</th>
                  </tr>
                </thead>
                <tbody>
                  {logsLoading && (
                    <tr>
                      <td colSpan={6} className="py-10 text-center text-ink-400 text-sm">
                        <RefreshCw size={18} className="animate-spin inline mr-2" /> Loading…
                      </td>
                    </tr>
                  )}
                  {!logsLoading && logs.length === 0 && (
                    <tr>
                      <td colSpan={6} className="py-10 text-center text-ink-400 text-sm">No log entries found</td>
                    </tr>
                  )}
                  {logs.map(log => <LogRow key={log.id} log={log} />)}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {logLast > 1 && (
              <div className="flex items-center justify-between px-4 py-3 border-t border-ink-100 dark:border-ink-700">
                <span className="text-xs text-ink-500">{logTotal} total entries</span>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setLogPage(p => Math.max(1, p - 1))}
                    disabled={logPage === 1}
                    className="p-1.5 rounded-lg border border-ink-200 dark:border-ink-700 disabled:opacity-40
                               hover:bg-ink-50 dark:hover:bg-ink-700 transition-colors"
                  >
                    <ChevronLeft size={14} />
                  </button>
                  <span className="text-xs text-ink-600 dark:text-ink-400">{logPage} / {logLast}</span>
                  <button
                    onClick={() => setLogPage(p => Math.min(logLast, p + 1))}
                    disabled={logPage === logLast}
                    className="p-1.5 rounded-lg border border-ink-200 dark:border-ink-700 disabled:opacity-40
                               hover:bg-ink-50 dark:hover:bg-ink-700 transition-colors"
                  >
                    <ChevronRight size={14} />
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────────── */}
      {/* TAB: Analytics                                                      */}
      {/* ─────────────────────────────────────────────────────────────────── */}
      {tab === 'stats' && (
        <div className="space-y-6">

          {/* Scan type breakdown */}
          {stats && (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {[
                { label: 'By Student ID',   value: stats.today.by_student_id,   color: 'bg-blue-500' },
                { label: 'By Payment',      value: stats.today.by_receipt,      color: 'bg-amber-500' },
                { label: 'By Registration', value: stats.today.by_registration, color: 'bg-purple-500' },
              ].map(({ label, value, color }) => (
                <div key={label} className="bg-white dark:bg-ink-800 rounded-xl border border-ink-200 dark:border-ink-700 p-5">
                  <div className={`w-2 h-2 rounded-full ${color} mb-3`} />
                  <p className="text-3xl font-bold text-ink-900 dark:text-ink-100">{value}</p>
                  <p className="text-sm text-ink-500 mt-1">{label} today</p>
                </div>
              ))}
            </div>
          )}

          {/* Weekly bar chart (CSS-only) */}
          {stats && stats.weekly.length > 0 && (
            <div className="bg-white dark:bg-ink-800 rounded-xl border border-ink-200 dark:border-ink-700 p-6">
              <h3 className="text-sm font-semibold text-ink-700 dark:text-ink-300 mb-5">7-Day Activity</h3>
              <div className="flex items-end gap-3 h-32">
                {stats.weekly.map(d => {
                  const maxVal = Math.max(...stats.weekly.map(x => x.total), 1)
                  const heightPct = Math.round((d.total / maxVal) * 100)
                  const grantedPct = d.total ? Math.round((d.granted / d.total) * 100) : 0
                  return (
                    <div key={d.day} className="flex-1 flex flex-col items-center gap-1">
                      <div className="w-full rounded-t overflow-hidden flex flex-col-reverse" style={{ height: `${Math.max(heightPct, 4)}%` }}>
                        <div className="w-full bg-green-400 dark:bg-green-500 flex-none" style={{ height: `${grantedPct}%` }} />
                        <div className="w-full bg-red-300 dark:bg-red-500 flex-1" />
                      </div>
                      <span className="text-[10px] text-ink-400 text-center">
                        {new Date(d.day).toLocaleDateString('en-GB', { weekday: 'short' })}
                      </span>
                    </div>
                  )
                })}
              </div>
              <div className="flex items-center gap-4 mt-3">
                <span className="flex items-center gap-1.5 text-xs text-ink-500"><span className="w-3 h-3 rounded-sm bg-green-400 inline-block" />Granted</span>
                <span className="flex items-center gap-1.5 text-xs text-ink-500"><span className="w-3 h-3 rounded-sm bg-red-300 inline-block" />Denied</span>
              </div>
            </div>
          )}

          {/* Active gates */}
          {stats && stats.gates.length > 0 && (
            <div className="bg-white dark:bg-ink-800 rounded-xl border border-ink-200 dark:border-ink-700 p-6">
              <h3 className="text-sm font-semibold text-ink-700 dark:text-ink-300 mb-4">Gate Activity Today</h3>
              <div className="space-y-3">
                {stats.gates.map(g => {
                  const max = Math.max(...stats.gates.map(x => x.checks), 1)
                  const pct = Math.round((g.checks / max) * 100)
                  return (
                    <div key={g.gate}>
                      <div className="flex justify-between text-sm mb-1">
                        <span className="font-medium text-ink-700 dark:text-ink-300">{g.gate}</span>
                        <span className="text-ink-500">{g.granted}✅ {g.denied}❌ / {g.checks}</span>
                      </div>
                      <div className="w-full bg-ink-100 dark:bg-ink-700 rounded-full h-2">
                        <div className="bg-blue-500 h-2 rounded-full transition-all" style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {(!stats || stats.today.total === 0) && (
            <div className="flex flex-col items-center py-16 text-ink-300 dark:text-ink-600">
              <BarChart2 size={48} strokeWidth={1} />
              <p className="mt-3 text-sm">No gate activity yet today</p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
