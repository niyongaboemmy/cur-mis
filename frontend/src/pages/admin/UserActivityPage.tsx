import { useState, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  Activity, Clock, LogIn, Eye, Users, Search, RefreshCw, X,
  ChevronLeft, ChevronRight, Globe, Monitor,
} from 'lucide-react'
import {
  userActivityService,
  type UserActivityRow,
  type UserActivityDetail,
  type UserSessionRow,
  type UserActivityItem,
} from '@/services/userActivityService'

// ─── Formatting helpers ──────────────────────────────────────────────────────

function initials(name: string): string {
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? '')
    .join('') || '?'
}

function fmtDuration(totalSeconds: number): string {
  const s = Math.max(0, Math.round(totalSeconds))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  if (h > 0) return `${h}h ${m}m`
  if (m > 0) return `${m}m`
  return `${s}s`
}

function fmtDateTime(value: string | null): string {
  if (!value) return '—'
  const d = new Date(value.replace(' ', 'T'))
  return isNaN(d.getTime())
    ? value
    : d.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
}

function timeAgo(value: string | null): string {
  if (!value) return 'Never'
  const d = new Date(value.replace(' ', 'T')).getTime()
  if (isNaN(d)) return value
  const diff = Math.max(0, Date.now() - d) / 1000
  if (diff < 60) return 'Just now'
  if (diff < 3600) return `${Math.floor(diff / 60)} min ago`
  if (diff < 86400) return `${Math.floor(diff / 3600)} h ago`
  if (diff < 604800) return `${Math.floor(diff / 86400)} d ago`
  return fmtDateTime(value)
}

const MODULE_LABEL: Record<string, string> = {
  home: 'Home', students: 'Students', admissions: 'Admissions', finance: 'Finance',
  academics: 'Academics', hr: 'HR', timetable: 'Timetable', attendance: 'Attendance',
  logs: 'System logs', admin: 'Admin', auth: 'Account',
}
const moduleLabel = (m: string) => MODULE_LABEL[m] ?? (m ? m.charAt(0).toUpperCase() + m.slice(1) : 'Other')

// ─── Small presentational pieces ─────────────────────────────────────────────

function StatusBadge({ status }: { status: UserActivityRow['status'] | UserSessionRow['status'] }) {
  const map: Record<string, { label: string; cls: string }> = {
    online:    { label: 'Online',     cls: 'bg-emerald-50 text-emerald-700 ring-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-300 dark:ring-emerald-500/30' },
    active:    { label: 'Active',     cls: 'bg-emerald-50 text-emerald-700 ring-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-300 dark:ring-emerald-500/30' },
    offline:   { label: 'Offline',    cls: 'bg-ink-100 text-ink-600 ring-ink-200 dark:bg-ink-800 dark:text-ink-300 dark:ring-ink-700' },
    logged_out:{ label: 'Logged out', cls: 'bg-ink-100 text-ink-600 ring-ink-200 dark:bg-ink-800 dark:text-ink-300 dark:ring-ink-700' },
    timed_out: { label: 'Timed out',  cls: 'bg-amber-50 text-amber-700 ring-amber-200 dark:bg-amber-500/10 dark:text-amber-300 dark:ring-amber-500/30' },
    never:     { label: 'Never signed in', cls: 'bg-ink-50 text-ink-500 ring-ink-200 dark:bg-ink-900 dark:text-ink-400 dark:ring-ink-700' },
  }
  const m = map[status] ?? map.offline
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset ${m.cls}`}>
      {(status === 'online' || status === 'active') && (
        <span className="relative flex h-1.5 w-1.5">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
          <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-500" />
        </span>
      )}
      {m.label}
    </span>
  )
}

function StatCard({ label, value, hint, icon: Icon, tone }: {
  label: string; value: string | number; hint?: string; icon: React.ElementType; tone: string
}) {
  return (
    <div className="card p-5 flex items-start gap-4">
      <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${tone}`}>
        <Icon className="h-5 w-5" />
      </div>
      <div className="min-w-0">
        <p className="text-xs font-medium uppercase tracking-wide text-ink-500 dark:text-ink-400">{label}</p>
        <p className="mt-1 text-2xl font-semibold text-ink-900 dark:text-ink-50 tabular-nums">{value}</p>
        {hint && <p className="mt-0.5 text-xs text-ink-500 dark:text-ink-400">{hint}</p>}
      </div>
    </div>
  )
}

// ─── User detail panel ───────────────────────────────────────────────────────

type DetailTab = 'overview' | 'sessions' | 'activity'

function UserDetailPanel({ userId, onClose }: { userId: number; onClose: () => void }) {
  const [tab, setTab] = useState<DetailTab>('overview')

  const detailQ = useQuery({
    queryKey: ['user-activity', 'detail', userId],
    queryFn: () => userActivityService.userDetail(userId),
  })
  const detail: UserActivityDetail | null = detailQ.data?.data ?? null

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const tabs: { id: DetailTab; label: string }[] = [
    { id: 'overview', label: 'Overview' },
    { id: 'sessions', label: `Sessions${detail ? ` (${detail.summary.sessions})` : ''}` },
    { id: 'activity', label: 'Activity' },
  ]

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-ink-900/40 backdrop-blur-[1px]" onClick={onClose}>
      <aside
        onClick={(e) => e.stopPropagation()}
        className="flex h-full w-full max-w-2xl flex-col bg-white shadow-2xl dark:bg-ink-950"
        role="dialog"
        aria-label="User activity details"
      >
        <header className="flex items-start justify-between gap-4 border-b border-ink-200 p-5 dark:border-ink-800">
          <div className="flex min-w-0 items-center gap-4">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-brand/10 text-base font-semibold text-brand">
              {detail ? initials(detail.user.full_name) : '…'}
            </div>
            <div className="min-w-0">
              <h2 className="truncate text-lg font-semibold text-ink-900 dark:text-ink-50">
                {detail?.user.full_name ?? 'Loading…'}
              </h2>
              <p className="truncate text-sm text-ink-500 dark:text-ink-400">{detail?.user.email}</p>
              {detail && (
                <div className="mt-1.5 flex flex-wrap items-center gap-2">
                  <span className="rounded-md bg-ink-100 px-2 py-0.5 text-xs font-medium text-ink-700 dark:bg-ink-800 dark:text-ink-200">
                    {detail.user.role_name ?? 'No role'}
                  </span>
                  {!detail.user.is_active && (
                    <span className="rounded-md bg-red-50 px-2 py-0.5 text-xs font-medium text-red-700 dark:bg-red-500/10 dark:text-red-300">
                      Account disabled
                    </span>
                  )}
                </div>
              )}
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-2 text-ink-500 hover:bg-ink-100 hover:text-ink-900 dark:hover:bg-ink-800"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </header>

        <nav className="flex gap-1 border-b border-ink-200 px-5 dark:border-ink-800">
          {tabs.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`-mb-px border-b-2 px-3 py-3 text-sm font-medium transition-colors ${
                tab === t.id
                  ? 'border-brand text-brand'
                  : 'border-transparent text-ink-500 hover:text-ink-800 dark:text-ink-400 dark:hover:text-ink-100'
              }`}
            >
              {t.label}
            </button>
          ))}
        </nav>

        <div className="flex-1 overflow-y-auto p-5">
          {detailQ.isLoading && <p className="py-12 text-center text-sm text-ink-500">Loading activity…</p>}
          {detailQ.isError && <p className="py-12 text-center text-sm text-red-600">Could not load this user's activity.</p>}

          {detail && tab === 'overview' && (
            <div className="space-y-6">
              <div className="grid grid-cols-2 gap-3">
                <StatCard label="Logins" value={detail.summary.sessions} icon={LogIn} tone="bg-brand/10 text-brand" />
                <StatCard label="Time in system" value={fmtDuration(detail.summary.total_seconds)} icon={Clock} tone="bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-300" />
                <StatCard
                  label="Average session"
                  value={detail.summary.sessions ? fmtDuration(detail.summary.total_seconds / detail.summary.sessions) : '—'}
                  icon={Activity}
                  tone="bg-violet-50 text-violet-600 dark:bg-violet-500/10 dark:text-violet-300"
                />
                <StatCard label="Last login" value={timeAgo(detail.summary.last_login)} hint={fmtDateTime(detail.summary.last_login)} icon={Monitor} tone="bg-amber-50 text-amber-600 dark:bg-amber-500/10 dark:text-amber-300" />
              </div>

              <section>
                <h3 className="mb-3 text-sm font-semibold text-ink-900 dark:text-ink-100">Most used modules</h3>
                {detail.top_modules.length === 0 ? (
                  <p className="text-sm text-ink-500">No page visits recorded yet.</p>
                ) : (
                  <ul className="space-y-3">
                    {detail.top_modules.map((m) => {
                      const max = detail.top_modules[0]?.views || 1
                      return (
                        <li key={m.module}>
                          <div className="mb-1 flex justify-between text-sm">
                            <span className="text-ink-700 dark:text-ink-200">{moduleLabel(m.module)}</span>
                            <span className="tabular-nums text-ink-500">{m.views}</span>
                          </div>
                          <div className="h-2 rounded-full bg-ink-100 dark:bg-ink-800">
                            <div className="h-2 rounded-full bg-brand" style={{ width: `${Math.round((m.views / max) * 100)}%` }} />
                          </div>
                        </li>
                      )
                    })}
                  </ul>
                )}
              </section>
            </div>
          )}

          {detail && tab === 'sessions' && <SessionList sessions={detail.sessions} />}
          {detail && tab === 'activity' && <ActivityList items={detail.activity} />}
        </div>
      </aside>
    </div>
  )
}

function SessionList({ sessions }: { sessions: UserSessionRow[] }) {
  if (sessions.length === 0) return <p className="py-12 text-center text-sm text-ink-500">No sign-ins recorded.</p>
  return (
    <ul className="space-y-3">
      {sessions.map((s) => (
        <li key={s.id} className="rounded-xl border border-ink-200 p-4 dark:border-ink-800">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm font-medium text-ink-900 dark:text-ink-100">{fmtDateTime(s.login_at)}</p>
            <StatusBadge status={s.status} />
          </div>
          <div className="mt-3 grid grid-cols-2 gap-3 text-xs sm:grid-cols-3">
            <div>
              <p className="text-ink-500">Duration</p>
              <p className="mt-0.5 font-medium text-ink-800 dark:text-ink-100 tabular-nums">{fmtDuration(s.duration_seconds)}</p>
            </div>
            <div>
              <p className="text-ink-500">Signed out</p>
              <p className="mt-0.5 font-medium text-ink-800 dark:text-ink-100">{s.logout_at ? fmtDateTime(s.logout_at) : '—'}</p>
            </div>
            <div className="col-span-2 sm:col-span-1">
              <p className="text-ink-500">IP address</p>
              <p className="mt-0.5 flex items-center gap-1 font-medium text-ink-800 dark:text-ink-100">
                <Globe className="h-3 w-3" /> {s.ip_address || '—'}
              </p>
            </div>
          </div>
        </li>
      ))}
    </ul>
  )
}

function ActivityList({ items }: { items: UserActivityItem[] }) {
  if (items.length === 0) return <p className="py-12 text-center text-sm text-ink-500">No activity recorded yet.</p>
  return (
    <ol className="relative space-y-4 border-l border-ink-200 pl-6 dark:border-ink-800">
      {items.map((it, i) => (
        <li key={`${it.type}-${it.at}-${i}`} className="relative">
          <span className={`absolute -left-[31px] top-1 flex h-3 w-3 rounded-full ring-4 ring-white dark:ring-ink-950 ${it.type === 'page' ? 'bg-sky-500' : 'bg-brand'}`} />
          <div className="flex flex-wrap items-center gap-2 text-xs text-ink-500">
            <span className="font-medium text-ink-700 dark:text-ink-200">{moduleLabel(it.module)}</span>
            <span>·</span>
            <span>{it.type === 'page' ? 'Opened page' : it.action}</span>
            <span>·</span>
            <span>{fmtDateTime(it.at)}</span>
          </div>
          <p className="mt-1 break-words text-sm text-ink-800 dark:text-ink-100">
            {it.type === 'page' ? (
              <span className="inline-flex items-center gap-1 font-mono text-xs"><Eye className="h-3 w-3" />{it.path}</span>
            ) : (
              it.description
            )}
          </p>
        </li>
      ))}
    </ol>
  )
}

// ─── Page ────────────────────────────────────────────────────────────────────

export default function UserActivityPage() {
  const [search, setSearch] = useState('')
  const [debounced, setDebounced] = useState('')
  const [onlineOnly, setOnlineOnly] = useState(false)
  const [page, setPage] = useState(1)
  const [selectedId, setSelectedId] = useState<number | null>(null)

  useEffect(() => {
    const t = window.setTimeout(() => {
      setDebounced(search.trim())
      setPage(1)
    }, 300)
    return () => window.clearTimeout(t)
  }, [search])

  const statsQ = useQuery({
    queryKey: ['user-activity', 'stats'],
    queryFn: () => userActivityService.stats(),
    refetchInterval: 60_000,
  })
  const listQ = useQuery({
    queryKey: ['user-activity', 'users', page, debounced, onlineOnly],
    queryFn: () => userActivityService.listUsers({ page, per_page: 25, search: debounced, online: onlineOnly }),
    refetchInterval: 60_000,
  })

  const stats = statsQ.data?.data
  const list = listQ.data?.data
  const rows = list?.data ?? []
  const pg = list?.pagination

  const refreshing = statsQ.isFetching || listQ.isFetching
  const refresh = () => {
    statsQ.refetch()
    listQ.refetch()
  }

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-4 sm:p-6">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-ink-900 dark:text-ink-50">User activity</h1>
          <p className="mt-1 text-sm text-ink-500 dark:text-ink-400">
            Who signed in, when, how long they stayed, and what they opened.
          </p>
        </div>
        <button
          onClick={refresh}
          className="inline-flex items-center gap-2 self-start rounded-lg border border-ink-200 bg-white px-3 py-2 text-sm font-medium text-ink-700 shadow-sm hover:bg-ink-50 dark:border-ink-700 dark:bg-ink-900 dark:text-ink-200 dark:hover:bg-ink-800 sm:self-auto"
        >
          <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-6">
        <StatCard label="Users" value={stats?.total_users ?? '—'} hint={stats ? `${stats.ever_logged_in} have signed in` : undefined} icon={Users} tone="bg-brand/10 text-brand" />
        <StatCard label="Online now" value={stats?.online_now ?? '—'} hint="Active in the last 5 min" icon={Activity} tone="bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-300" />
        <StatCard label="Logins today" value={stats?.logins_today ?? '—'} icon={LogIn} tone="bg-sky-50 text-sky-600 dark:bg-sky-500/10 dark:text-sky-300" />
        <StatCard label="Logins · 7 days" value={stats?.logins_7_days ?? '—'} icon={Monitor} tone="bg-violet-50 text-violet-600 dark:bg-violet-500/10 dark:text-violet-300" />
        <StatCard label="Hours · 7 days" value={stats?.hours_7_days ?? '—'} icon={Clock} tone="bg-amber-50 text-amber-600 dark:bg-amber-500/10 dark:text-amber-300" />
        <StatCard label="Pages · 7 days" value={stats?.page_views_7_days ?? '—'} icon={Eye} tone="bg-rose-50 text-rose-600 dark:bg-rose-500/10 dark:text-rose-300" />
      </div>

      {/* Filters */}
      <div className="card flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name or email"
            className="w-full rounded-lg border border-ink-200 bg-white py-2 pl-9 pr-3 text-sm text-ink-900 placeholder:text-ink-400 focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20 dark:border-ink-700 dark:bg-ink-900 dark:text-ink-100"
          />
        </div>
        <label className="inline-flex cursor-pointer items-center gap-2 text-sm text-ink-700 dark:text-ink-200">
          <input
            type="checkbox"
            checked={onlineOnly}
            onChange={(e) => { setOnlineOnly(e.target.checked); setPage(1) }}
            className="h-4 w-4 rounded border-ink-300 text-brand focus:ring-brand"
          />
          Online only
        </label>
      </div>

      {/* User list — table on desktop, cards on phones. One row per user. */}
      <div className="card overflow-hidden">
        <div className="hidden overflow-x-auto md:block">
          <table className="min-w-full divide-y divide-ink-200 text-sm dark:divide-ink-800">
            <thead className="bg-ink-50 dark:bg-ink-900/60">
              <tr className="text-left text-xs font-semibold uppercase tracking-wide text-ink-500 dark:text-ink-400">
                <th className="px-5 py-3">User</th>
                <th className="px-5 py-3">Role</th>
                <th className="px-5 py-3">Status</th>
                <th className="px-5 py-3 text-right">Logins</th>
                <th className="px-5 py-3 text-right">Time in system</th>
                <th className="px-5 py-3">Last login</th>
                <th className="px-5 py-3">Last active</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ink-100 bg-white dark:divide-ink-800 dark:bg-ink-950">
              {rows.map((u) => (
                <UserTableRow key={u.id} user={u} onOpen={() => setSelectedId(u.id)} />
              ))}
            </tbody>
          </table>
        </div>

        <ul className="divide-y divide-ink-100 dark:divide-ink-800 md:hidden">
          {rows.map((u) => (
            <li key={u.id}>
              <button onClick={() => setSelectedId(u.id)} className="flex w-full items-center gap-3 p-4 text-left">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand/10 text-sm font-semibold text-brand">
                  {initials(u.full_name)}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <p className="truncate font-medium text-ink-900 dark:text-ink-100">{u.full_name}</p>
                    <StatusBadge status={u.status} />
                  </div>
                  <p className="truncate text-xs text-ink-500">{u.email}</p>
                  <p className="mt-1 text-xs text-ink-500">
                    {u.login_count} logins · {fmtDuration(u.total_seconds)} · {timeAgo(u.last_login)}
                  </p>
                </div>
              </button>
            </li>
          ))}
        </ul>

        {listQ.isLoading && <p className="py-12 text-center text-sm text-ink-500">Loading users…</p>}
        {listQ.isError && <p className="py-12 text-center text-sm text-red-600">Could not load user activity.</p>}
        {list && rows.length === 0 && (
          <p className="py-12 text-center text-sm text-ink-500">No users match these filters.</p>
        )}

        {pg && pg.total > 0 && (
          <div className="flex items-center justify-between border-t border-ink-200 px-5 py-3 text-sm text-ink-600 dark:border-ink-800 dark:text-ink-300">
            <span className="tabular-nums">
              Page {pg.page} of {pg.total_pages} · {pg.total} users
            </span>
            <div className="flex gap-2">
              <button
                disabled={pg.page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                className="inline-flex items-center gap-1 rounded-lg border border-ink-200 px-3 py-1.5 hover:bg-ink-50 disabled:opacity-40 dark:border-ink-700 dark:hover:bg-ink-800"
              >
                <ChevronLeft className="h-4 w-4" /> Prev
              </button>
              <button
                disabled={pg.page >= pg.total_pages}
                onClick={() => setPage((p) => p + 1)}
                className="inline-flex items-center gap-1 rounded-lg border border-ink-200 px-3 py-1.5 hover:bg-ink-50 disabled:opacity-40 dark:border-ink-700 dark:hover:bg-ink-800"
              >
                Next <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}
      </div>

      {selectedId !== null && (
        <UserDetailPanel userId={selectedId} onClose={() => setSelectedId(null)} />
      )}
    </div>
  )
}

function UserTableRow({ user: u, onOpen }: { user: UserActivityRow; onOpen: () => void }) {
  return (
    <tr onClick={onOpen} className="cursor-pointer transition-colors hover:bg-ink-50 dark:hover:bg-ink-900/60">
      <td className="px-5 py-3">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand/10 text-xs font-semibold text-brand">
            {initials(u.full_name)}
          </div>
          <div className="min-w-0">
            <p className="truncate font-medium text-ink-900 dark:text-ink-100">{u.full_name}</p>
            <p className="truncate text-xs text-ink-500 dark:text-ink-400">{u.email}</p>
          </div>
        </div>
      </td>
      <td className="px-5 py-3">
        <span className="rounded-md bg-ink-100 px-2 py-0.5 text-xs font-medium text-ink-700 dark:bg-ink-800 dark:text-ink-200">
          {u.role_name ?? 'No role'}
        </span>
      </td>
      <td className="px-5 py-3"><StatusBadge status={u.status} /></td>
      <td className="px-5 py-3 text-right tabular-nums text-ink-800 dark:text-ink-100">{u.login_count}</td>
      <td className="px-5 py-3 text-right tabular-nums text-ink-800 dark:text-ink-100">{fmtDuration(u.total_seconds)}</td>
      <td className="px-5 py-3 text-ink-700 dark:text-ink-200">{fmtDateTime(u.last_login)}</td>
      <td className="px-5 py-3 text-ink-700 dark:text-ink-200">{timeAgo(u.last_page_at ?? u.last_seen)}</td>
    </tr>
  )
}
