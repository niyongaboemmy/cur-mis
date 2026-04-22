import { motion } from 'framer-motion'
import { Mail, Phone, UserCircle, ShieldCheck, Clock, CheckCircle2, Calendar } from 'lucide-react'
import { useAuthStore } from '@/store/authStore'
import { useCurrentUser } from '@/hooks/useAuth'

export default function ProfilePage() {
  const { user } = useAuthStore()
  const { isLoading } = useCurrentUser()

  if (!user) return null

  const initials = user.full_name
    ? user.full_name.split(' ').map((n) => n[0]).join('').substring(0, 2).toUpperCase()
    : 'U'

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="max-w-5xl mx-auto space-y-6"
    >
      {/* ─── Header card ─── */}
      <section className="card p-6 md:p-8 relative overflow-hidden">
        <div className="absolute inset-x-0 top-0 h-24 bg-gradient-primary" />
        <div className="relative flex flex-col md:flex-row md:items-end gap-5 pt-8 md:pt-14">
          <div className="w-24 h-24 md:w-28 md:h-28 rounded-2xl bg-brand dark:bg-brand-active flex items-center justify-center text-white text-3xl font-semibold shadow-card shrink-0 ring-4 ring-white dark:ring-ink-800">
            {initials}
          </div>
          <div className="flex-1 min-w-0">
            <h1 className="text-[24px] font-semibold text-ink-900 dark:text-white tracking-tight truncate">
              {user.full_name}
            </h1>
            <p className="text-ink-500 dark:text-ink-400 text-[13.5px] mt-1 truncate flex items-center gap-1.5">
              <Mail className="w-3.5 h-3.5 shrink-0" /> {user.email}
            </p>
            <div className="mt-3 flex flex-wrap items-center gap-1.5">
              <span className="chip-primary capitalize">
                <ShieldCheck className="w-3 h-3" /> {user.role ?? 'member'}
              </span>
              {(user as any).is_active ? (
                <span className="chip-success">
                  <CheckCircle2 className="w-3 h-3" /> Active
                </span>
              ) : (
                <span className="chip-soft">Disabled</span>
              )}
              {(user as any).username && (
                <span className="chip-soft">@{(user as any).username}</span>
              )}
            </div>
          </div>
        </div>
      </section>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* ─── Account details ─── */}
        <section className="card p-6 lg:col-span-2">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="section-title">Account details</h2>
              <p className="section-sub">Your CUR-MIS profile information</p>
            </div>
          </div>

          <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-4">
            <Detail icon={UserCircle} label="Full name" value={user.full_name} />
            <Detail icon={Mail}       label="Email"     value={user.email} />
            <Detail icon={Phone}      label="Phone"     value={(user as any).phone || '—'} />
            <Detail icon={ShieldCheck}label="Role"      value={<span className="capitalize">{user.role ?? 'member'}</span>} />
            <Detail icon={Clock}      label="Last login" value={fmt((user as any).last_login)} />
            <Detail icon={Calendar}   label="Member since" value={fmt((user as any).created_at)} />
          </dl>

          {isLoading && (
            <p className="text-xs text-ink-400 mt-4 animate-pulse">Refreshing profile…</p>
          )}
        </section>

        {/* ─── Permissions ─── */}
        <section className="card p-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="section-title">Permissions</h2>
              <p className="section-sub">What you can access</p>
            </div>
            <span className="chip-soft">{user.permissions?.length ?? 0}</span>
          </div>

          {user.permissions && user.permissions.length > 0 ? (
            <ul className="space-y-1.5 max-h-72 overflow-y-auto pr-1">
              {user.permissions.map((p) => (
                <li key={p} className="flex items-center gap-2 text-[12.5px] text-ink-700 dark:text-ink-200">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                  <code className="font-mono">{p}</code>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-ink-500 text-[13px]">No permissions assigned.</p>
          )}
        </section>
      </div>
    </motion.div>
  )
}

/* ------------------------------------------------------------------ */
function Detail({
  icon: Icon,
  label,
  value,
}: {
  icon: any
  label: string
  value: React.ReactNode
}) {
  return (
    <div className="flex gap-3">
      <div className="w-8 h-8 shrink-0 rounded-md bg-primary-50 dark:bg-ink-700 text-brand dark:text-gold-400 flex items-center justify-center">
        <Icon className="w-4 h-4" />
      </div>
      <div className="min-w-0">
        <dt className="text-[11px] font-medium text-ink-400 uppercase tracking-wider">{label}</dt>
        <dd className="text-[13.5px] text-ink-900 dark:text-ink-100 truncate">{value}</dd>
      </div>
    </div>
  )
}

function fmt(v: string | null | undefined) {
  if (!v) return '—'
  try {
    const d = new Date(v.replace(' ', 'T'))
    if (isNaN(d.getTime())) return v
    return d.toLocaleString(undefined, { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
  } catch {
    return v
  }
}
