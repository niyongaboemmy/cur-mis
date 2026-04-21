import type { LucideIcon } from 'lucide-react'

type Tone = 'lilac' | 'sky' | 'peach' | 'mint' | 'sun'

const toneMap: Record<Tone, { card: string; icon: string }> = {
  lilac: { card: 'bg-accent-lilac', icon: 'text-primary-600 bg-white/70' },
  sky:   { card: 'bg-accent-sky',   icon: 'text-sky-600 bg-white/70'     },
  peach: { card: 'bg-accent-peach', icon: 'text-orange-600 bg-white/70'  },
  mint:  { card: 'bg-accent-mint',  icon: 'text-emerald-600 bg-white/70' },
  sun:   { card: 'bg-accent-sun',   icon: 'text-amber-700 bg-white/70'   },
}

interface StatCardProps {
  label: string
  value: string
  icon:  LucideIcon
  tone?: Tone
}

export default function StatCard({ label, value, icon: Icon, tone = 'lilac' }: StatCardProps) {
  const t = toneMap[tone]

  return (
    <div className={`stat-card ${t.card} dark:bg-ink-800`}>
      <div className="min-w-0 flex-1">
        <p className="text-[13px] font-medium text-ink-700/80 dark:text-ink-300 truncate">
          {label}
        </p>
        <p className="mt-1 text-[26px] font-semibold text-ink-900 dark:text-white tabular-nums leading-tight tracking-tight">
          {value}
        </p>
      </div>

      <div className={`w-12 h-12 rounded-xl flex items-center justify-center shrink-0 ${t.icon} dark:bg-ink-700 dark:text-primary-200`}>
        <Icon className="w-6 h-6" />
      </div>
    </div>
  )
}
