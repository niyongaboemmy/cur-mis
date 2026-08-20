import { useState } from 'react'
import { useQuery, useMutation } from '@tanstack/react-query'
import {
  Bell, Send, ChevronLeft, ChevronRight, AlertTriangle,
  Clock, Mail, Monitor, CheckCircle2, RefreshCw,
} from 'lucide-react'
import toast from 'react-hot-toast'
import {
  overdueAlertService,
  type OverdueInvoice, type OverdueAlert, type SendAlertsPayload,
} from '@/services/financeService'
import ModalPortal from '@/components/ui/ModalPortal'

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtAmt(n: number | string) {
  return Number(n).toLocaleString('en-US', { minimumFractionDigits: 0 }) + ' RWF'
}

const LEVEL_COLORS = {
  reminder: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  warning:  'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
  final:    'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
}

// ── OverdueAlertsPage ─────────────────────────────────────────────────────────

export default function OverdueAlertsPage() {
  const [tab, setTab] = useState<'overdue' | 'history'>('overdue')

  // Overdue invoice selection for targeted send
  const [selected, setSelected] = useState<Set<number>>(new Set())

  // Alert dispatch modal
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [alertLevel, setAlertLevel]   = useState<'reminder' | 'warning' | 'final'>('reminder')
  const [channel, setChannel]         = useState<'email' | 'system' | 'both'>('both')

  // History filters
  const [historyPage, setHistoryPage]       = useState(1)
  const [historyLevel, setHistoryLevel]     = useState('')

  // ── Data queries ──────────────────────────────────────────────────────────

  const { data: overdueRes, isLoading: overdueLoading, refetch: refetchOverdue } = useQuery({
    queryKey: ['fines', 'overdue'],
    queryFn:  ({ signal }) => overdueAlertService.getOverdueInvoices({ limit: 300 }, signal),
  })
  const overdueInvoices: OverdueInvoice[] = overdueRes?.data?.invoices ?? []
  const overdueStats                      = overdueRes?.data?.stats

  const { data: historyRes, isLoading: historyLoading } = useQuery({
    queryKey: ['fines', 'alerts', 'history', { historyPage, historyLevel }],
    queryFn:  ({ signal }) =>
      overdueAlertService.listAlerts({
        alert_level: historyLevel || undefined,
        page:        historyPage,
        per_page:    20,
      }, signal),
    enabled: tab === 'history',
  })
  const historyAlerts: OverdueAlert[] = historyRes?.data?.data     ?? []
  const historyTotal:  number         = historyRes?.data?.total    ?? 0
  const historyLastPg: number         = historyRes?.data?.last_page ?? 1

  // ── Alert dispatch mutation ───────────────────────────────────────────────

  const sendMut = useMutation({
    mutationFn: (payload: SendAlertsPayload) => overdueAlertService.sendAlerts(payload),
    onSuccess: (res) => {
      const r = (res as any)?.data
      toast.success(`${r?.sent ?? 0} alert(s) sent, ${r?.skipped ?? 0} skipped (24h cooldown).`)
      setIsModalOpen(false)
      setSelected(new Set())
      refetchOverdue()
    },
    onError: (e: any) => toast.error(e?.response?.data?.message ?? 'Send failed'),
  })

  function handleSend() {
    const payload: SendAlertsPayload = {
      alert_level: alertLevel,
      channel,
      invoice_ids: selected.size > 0 ? Array.from(selected) : undefined,
    }
    sendMut.mutate(payload)
  }

  function toggleAll() {
    if (selected.size === overdueInvoices.length) {
      setSelected(new Set())
    } else {
      setSelected(new Set(overdueInvoices.map((i) => i.id)))
    }
  }

  function toggleOne(id: number) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-4 pb-12">

      {/* Page header */}
      <div className="bg-white dark:bg-ink-900 p-5 rounded-xl border border-ink-200 dark:border-ink-800 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-amber-500/10 text-amber-500 rounded-lg">
              <Bell className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-base font-bold text-ink-900 dark:text-ink-50">Overdue Fee Alerts</h1>
              <p className="text-xs text-ink-500">
                Monitor overdue invoices and dispatch payment reminder notifications to students.
              </p>
            </div>
          </div>
          <button
            onClick={() => setIsModalOpen(true)}
            className="btn btn-primary flex items-center gap-2 text-sm"
          >
            <Send className="w-4 h-4" />
            Send Alerts
          </button>
        </div>

        {/* Stats row */}
        {overdueStats && (
          <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { label: 'Total Overdue',   value: overdueStats.total_overdue, color: 'red',   sub: fmtAmt(overdueStats.total_balance) },
              { label: '0–7 days late',   value: overdueStats.due_0_7d,     color: 'amber', sub: null },
              { label: '8–30 days late',  value: overdueStats.due_8_30d,    color: 'orange',sub: null },
              { label: '30+ days late',   value: overdueStats.due_30d_plus, color: 'red',   sub: null },
            ].map((s) => (
              <div key={s.label} className="p-3 rounded-lg bg-ink-50 dark:bg-ink-800 border border-ink-100 dark:border-ink-700">
                <p className="text-xs text-ink-500 font-medium">{s.label}</p>
                <p className={`text-2xl font-bold mt-0.5 ${s.color === 'red' ? 'text-red-500' : s.color === 'amber' ? 'text-amber-500' : 'text-orange-500'}`}>
                  {s.value}
                </p>
                {s.sub && <p className="text-xs text-ink-400 mt-0.5">{s.sub}</p>}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 p-1 bg-ink-100 dark:bg-ink-800 rounded-lg w-fit">
        {(['overdue', 'history'] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-1.5 text-sm font-medium rounded-md transition-colors ${
              tab === t
                ? 'bg-white dark:bg-ink-700 text-ink-900 dark:text-ink-50 shadow-sm'
                : 'text-ink-500 hover:text-ink-700 dark:hover:text-ink-300'
            }`}
          >
            {t === 'overdue' ? 'Overdue Invoices' : 'Alert History'}
          </button>
        ))}
      </div>

      {/* ── Overdue Invoices Tab ── */}
      {tab === 'overdue' && (
        <div className="bg-white dark:bg-ink-900 rounded-xl border border-ink-200 dark:border-ink-800 shadow-sm overflow-hidden">
          {/* Toolbar */}
          <div className="p-4 border-b border-ink-100 dark:border-ink-800 flex items-center gap-3">
            {selected.size > 0 && (
              <span className="text-xs text-brand font-medium">
                {selected.size} selected
              </span>
            )}
            <button
              onClick={() => refetchOverdue()}
              className="ml-auto p-1.5 text-ink-400 hover:text-ink-600 hover:bg-ink-100 dark:hover:bg-ink-800 rounded-md"
              title="Refresh"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="bg-ink-50/60 dark:bg-ink-800/60 border-b border-ink-200 dark:border-ink-800">
                  <th className="px-4 py-3">
                    <input
                      type="checkbox"
                      checked={selected.size === overdueInvoices.length && overdueInvoices.length > 0}
                      onChange={toggleAll}
                      className="rounded"
                    />
                  </th>
                  <th className="px-5 py-3 font-semibold text-ink-500 text-xs uppercase tracking-wide">Student</th>
                  <th className="px-5 py-3 font-semibold text-ink-500 text-xs uppercase tracking-wide">Invoice</th>
                  <th className="px-5 py-3 font-semibold text-ink-500 text-xs uppercase tracking-wide text-right">Balance</th>
                  <th className="px-5 py-3 font-semibold text-ink-500 text-xs uppercase tracking-wide">Due Date</th>
                  <th className="px-5 py-3 font-semibold text-ink-500 text-xs uppercase tracking-wide text-center">Days Overdue</th>
                  <th className="px-5 py-3 font-semibold text-ink-500 text-xs uppercase tracking-wide text-center">Alerts Sent</th>
                  <th className="px-5 py-3 font-semibold text-ink-500 text-xs uppercase tracking-wide">Last Alert</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink-100 dark:divide-ink-800">
                {overdueLoading
                  ? Array.from({ length: 8 }).map((_, i) => (
                      <tr key={i} className="animate-pulse">
                        <td colSpan={8} className="px-5 py-4">
                          <div className="h-4 bg-ink-100 dark:bg-ink-800 rounded w-full" />
                        </td>
                      </tr>
                    ))
                  : overdueInvoices.length === 0
                  ? (
                    <tr>
                      <td colSpan={8} className="px-5 py-16 text-center">
                        <CheckCircle2 className="w-10 h-10 text-green-400 mx-auto mb-3" />
                        <p className="text-ink-500 font-medium">No overdue invoices</p>
                        <p className="text-ink-400 text-xs mt-1">All students are up to date with their payments.</p>
                      </td>
                    </tr>
                  )
                  : overdueInvoices.map((inv) => {
                      const urgency = inv.days_overdue > 30
                        ? 'text-red-600 dark:text-red-400 font-bold'
                        : inv.days_overdue > 7
                        ? 'text-amber-600 dark:text-amber-400 font-semibold'
                        : 'text-ink-700 dark:text-ink-300'

                      return (
                        <tr
                          key={inv.id}
                          className={`hover:bg-ink-50/40 dark:hover:bg-ink-800/40 transition-colors ${selected.has(inv.id) ? 'bg-brand/5 dark:bg-brand/10' : ''}`}
                        >
                          <td className="px-4 py-3.5">
                            <input
                              type="checkbox"
                              checked={selected.has(inv.id)}
                              onChange={() => toggleOne(inv.id)}
                              className="rounded"
                            />
                          </td>
                          <td className="px-5 py-3.5">
                            <p className="font-semibold text-ink-900 dark:text-ink-50 text-xs">{inv.student_name}</p>
                            <p className="text-ink-400 text-xs font-mono">{inv.student_id}</p>
                            <p className="text-ink-400 text-[10px]">{inv.student_email}</p>
                          </td>
                          <td className="px-5 py-3.5">
                            <span className="text-xs font-mono text-brand dark:text-gold-400">{inv.invoice_number}</span>
                            <p className="text-[10px] text-ink-400 mt-0.5">{inv.description}</p>
                          </td>
                          <td className="px-5 py-3.5 text-right font-mono font-bold text-sm text-red-600 dark:text-red-400">
                            {fmtAmt(inv.balance)}
                          </td>
                          <td className="px-5 py-3.5 text-xs text-ink-600 dark:text-ink-400">
                            {inv.due_date}
                          </td>
                          <td className="px-5 py-3.5 text-center">
                            <span className={`text-sm ${urgency}`}>
                              {inv.days_overdue}d
                            </span>
                          </td>
                          <td className="px-5 py-3.5 text-center">
                            <span className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-bold ${
                              inv.alert_count > 0
                                ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400'
                                : 'bg-ink-100 text-ink-500 dark:bg-ink-800 dark:text-ink-400'
                            }`}>
                              {inv.alert_count}
                            </span>
                          </td>
                          <td className="px-5 py-3.5 text-xs text-ink-400">
                            {inv.last_alert_at
                              ? new Date(inv.last_alert_at).toLocaleDateString()
                              : <span className="italic">Never</span>
                            }
                          </td>
                        </tr>
                      )
                    })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Alert History Tab ── */}
      {tab === 'history' && (
        <div className="bg-white dark:bg-ink-900 rounded-xl border border-ink-200 dark:border-ink-800 shadow-sm overflow-hidden">
          {/* History filter */}
          <div className="p-4 border-b border-ink-100 dark:border-ink-800 flex gap-3 items-center">
            <select
              className="px-3 py-2 bg-ink-50 dark:bg-ink-800 border border-ink-200 dark:border-ink-700 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand/30"
              value={historyLevel}
              onChange={(e) => { setHistoryLevel(e.target.value); setHistoryPage(1) }}
            >
              <option value="">All levels</option>
              <option value="reminder">Reminder</option>
              <option value="warning">Warning</option>
              <option value="final">Final</option>
            </select>
            <span className="text-xs text-ink-400 ml-auto">{historyTotal} record(s)</span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="bg-ink-50/60 dark:bg-ink-800/60 border-b border-ink-200 dark:border-ink-800">
                  <th className="px-5 py-3 font-semibold text-ink-500 text-xs uppercase tracking-wide">Student</th>
                  <th className="px-5 py-3 font-semibold text-ink-500 text-xs uppercase tracking-wide">Invoice</th>
                  <th className="px-5 py-3 font-semibold text-ink-500 text-xs uppercase tracking-wide text-right">Balance</th>
                  <th className="px-5 py-3 font-semibold text-ink-500 text-xs uppercase tracking-wide text-center">Level</th>
                  <th className="px-5 py-3 font-semibold text-ink-500 text-xs uppercase tracking-wide text-center">Channel</th>
                  <th className="px-5 py-3 font-semibold text-ink-500 text-xs uppercase tracking-wide text-center">Email Sent</th>
                  <th className="px-5 py-3 font-semibold text-ink-500 text-xs uppercase tracking-wide">Sent By</th>
                  <th className="px-5 py-3 font-semibold text-ink-500 text-xs uppercase tracking-wide">Sent At</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink-100 dark:divide-ink-800">
                {historyLoading
                  ? Array.from({ length: 6 }).map((_, i) => (
                      <tr key={i} className="animate-pulse">
                        <td colSpan={8} className="px-5 py-4">
                          <div className="h-4 bg-ink-100 dark:bg-ink-800 rounded w-full" />
                        </td>
                      </tr>
                    ))
                  : historyAlerts.length === 0
                  ? (
                    <tr>
                      <td colSpan={8} className="px-5 py-12 text-center text-ink-400 italic text-sm">
                        No alerts have been sent yet.
                      </td>
                    </tr>
                  )
                  : historyAlerts.map((alert) => (
                      <tr key={alert.id} className="hover:bg-ink-50/40 dark:hover:bg-ink-800/40 transition-colors">
                        <td className="px-5 py-3.5">
                          <p className="font-semibold text-ink-900 dark:text-ink-50 text-xs">{alert.student_name}</p>
                          <p className="text-ink-400 text-xs font-mono">{alert.student_id}</p>
                        </td>
                        <td className="px-5 py-3.5">
                          <span className="text-xs font-mono text-brand dark:text-gold-400">{alert.invoice_number}</span>
                        </td>
                        <td className="px-5 py-3.5 text-right font-mono font-bold text-sm text-red-600 dark:text-red-400">
                          {fmtAmt(alert.amount_due)}
                        </td>
                        <td className="px-5 py-3.5 text-center">
                          <span className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-bold capitalize ${LEVEL_COLORS[alert.alert_level]}`}>
                            {alert.alert_level}
                          </span>
                        </td>
                        <td className="px-5 py-3.5 text-center">
                          <div className="flex justify-center items-center gap-1 text-ink-400">
                            {(alert.channel === 'email' || alert.channel === 'both') && <Mail className="w-3.5 h-3.5" />}
                            {(alert.channel === 'system' || alert.channel === 'both') && <Monitor className="w-3.5 h-3.5" />}
                          </div>
                        </td>
                        <td className="px-5 py-3.5 text-center">
                          {alert.email_sent
                            ? <CheckCircle2 className="w-4 h-4 text-green-500 mx-auto" />
                            : <span title="Email not delivered"><AlertTriangle className="w-4 h-4 text-amber-400 mx-auto" /></span>
                          }
                        </td>
                        <td className="px-5 py-3.5 text-xs text-ink-500">{alert.sent_by_name ?? '—'}</td>
                        <td className="px-5 py-3.5 text-xs text-ink-400">
                          <div className="flex items-center gap-1.5">
                            <Clock className="w-3 h-3" />
                            {new Date(alert.sent_at).toLocaleString()}
                          </div>
                        </td>
                      </tr>
                    ))}
              </tbody>
            </table>
          </div>

          {historyLastPg > 1 && (
            <div className="px-5 py-3 border-t border-ink-100 dark:border-ink-800 flex items-center justify-between">
              <p className="text-xs text-ink-400">{historyTotal} alert(s) total</p>
              <div className="flex items-center gap-2">
                <button
                  disabled={historyPage <= 1}
                  onClick={() => setHistoryPage((p) => p - 1)}
                  className="p-1.5 rounded text-ink-500 hover:bg-ink-100 dark:hover:bg-ink-800 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <span className="text-xs text-ink-500">Page {historyPage} of {historyLastPg}</span>
                <button
                  disabled={historyPage >= historyLastPg}
                  onClick={() => setHistoryPage((p) => p + 1)}
                  className="p-1.5 rounded text-ink-500 hover:bg-ink-100 dark:hover:bg-ink-800 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Send Alerts Modal */}
      {isModalOpen && (
        <ModalPortal>
          <div className="fixed inset-0 z-50 overflow-y-auto bg-black/50 backdrop-blur-sm">
            <div className="flex min-h-full items-center justify-center p-4">
              <div className="bg-white dark:bg-ink-800 rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
                <div className="flex items-center justify-between px-6 py-4 border-b border-ink-100 dark:border-ink-700">
                  <h3 className="text-base font-semibold text-ink-900 dark:text-white flex items-center gap-2">
                    <Bell className="w-4 h-4 text-amber-500" />
                    Send Overdue Alerts
                  </h3>
                </div>

                <div className="p-6 space-y-5">
                  {selected.size > 0 && (
                    <div className="p-3 bg-brand/5 dark:bg-brand/10 rounded-lg text-sm text-brand dark:text-brand-300 font-medium">
                      Sending to {selected.size} selected invoice{selected.size !== 1 ? 's' : ''}
                    </div>
                  )}
                  {selected.size === 0 && (
                    <div className="flex items-start gap-2 p-3 bg-amber-50 dark:bg-amber-900/20 rounded-lg text-xs text-amber-700 dark:text-amber-300">
                      <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
                      <span>
                        No invoices selected — alerts will be sent to <strong>all</strong> overdue
                        invoices (24-hour cooldown per invoice per level applies).
                      </span>
                    </div>
                  )}

                  {/* Alert level */}
                  <div className="space-y-2">
                    <label className="text-xs font-semibold text-ink-600 dark:text-ink-300">Alert Level</label>
                    <div className="grid grid-cols-3 gap-2">
                      {([['reminder', 'Reminder', 'blue'], ['warning', 'Warning', 'amber'], ['final', 'Final Notice', 'red']] as const).map(([val, label, color]) => (
                        <button
                          key={val}
                          type="button"
                          onClick={() => setAlertLevel(val)}
                          className={`p-3 rounded-lg text-xs font-semibold border-2 transition-colors ${
                            alertLevel === val
                              ? color === 'blue'  ? 'border-blue-500  bg-blue-50  text-blue-700  dark:bg-blue-900/30 dark:text-blue-300'
                              : color === 'amber' ? 'border-amber-500 bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300'
                              :                    'border-red-500   bg-red-50   text-red-700   dark:bg-red-900/30 dark:text-red-300'
                              : 'border-ink-200 dark:border-ink-700 text-ink-500 hover:border-ink-300'
                          }`}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Channel */}
                  <div className="space-y-2">
                    <label className="text-xs font-semibold text-ink-600 dark:text-ink-300">Notification Channel</label>
                    <div className="grid grid-cols-3 gap-2">
                      {([['email', 'Email', Mail], ['system', 'System', Monitor], ['both', 'Both', Bell]] as const).map(([val, label, Icon]) => (
                        <button
                          key={val}
                          type="button"
                          onClick={() => setChannel(val)}
                          className={`p-3 rounded-lg text-xs font-semibold border-2 flex flex-col items-center gap-1 transition-colors ${
                            channel === val
                              ? 'border-brand bg-brand/5 dark:bg-brand/10 text-brand dark:text-brand-300'
                              : 'border-ink-200 dark:border-ink-700 text-ink-500 hover:border-ink-300'
                          }`}
                        >
                          <Icon className="w-4 h-4" />
                          {label}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="flex justify-end gap-3 px-6 pb-6">
                  <button
                    onClick={() => setIsModalOpen(false)}
                    className="btn btn-secondary text-sm px-5"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleSend}
                    disabled={sendMut.isPending}
                    className="btn btn-primary flex items-center gap-2 text-sm px-6"
                  >
                    <Send className="w-4 h-4" />
                    {sendMut.isPending ? 'Sending…' : 'Send Alerts'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </ModalPortal>
      )}
    </div>
  )
}
