import { LucideIcon, Sparkles, CheckCircle2, Clock } from 'lucide-react'
import { motion } from 'framer-motion'

interface FeatureItem {
  label:  string
  status: 'done' | 'soon' | 'planned'
}

interface ModulePreviewProps {
  icon:     LucideIcon
  title:    string
  subtitle: string
  tone?:    'lilac' | 'sky' | 'peach' | 'mint'
  features: FeatureItem[]
}

const toneMap = {
  lilac: 'bg-primary-100 text-primary-700 dark:bg-primary-900/40 dark:text-primary-200',
  sky:   'bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-200',
  peach: 'bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-200',
  mint:  'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-200',
}

const statusMap: Record<FeatureItem['status'], { chip: string; label: string; icon: LucideIcon }> = {
  done:    { chip: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300', label: 'Live',     icon: CheckCircle2 },
  soon:    { chip: 'bg-primary-50 text-primary-700 dark:bg-primary-900/30 dark:text-primary-200', label: 'Soon',     icon: Sparkles },
  planned: { chip: 'bg-ink-100 text-ink-600 dark:bg-ink-700 dark:text-ink-200',                   label: 'Planned',  icon: Clock },
}

export default function ModulePreview({
  icon: Icon,
  title,
  subtitle,
  tone = 'lilac',
  features,
}: ModulePreviewProps) {
  return (
    <div className="max-w-5xl mx-auto">
      {/* Hero */}
      <motion.div
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        className="card p-6 md:p-8"
      >
        <div className="flex flex-col md:flex-row md:items-center gap-5">
          <div className={`w-14 h-14 rounded-md ${toneMap[tone]} flex items-center justify-center shrink-0`}>
            <Icon className="w-7 h-7" />
          </div>
          <div className="min-w-0">
            <span className="chip-primary">
              <Sparkles className="w-3 h-3" /> Module preview
            </span>
            <h1 className="mt-2 text-[22px] md:text-[26px] font-semibold text-ink-900 dark:text-white tracking-tight leading-tight">
              {title}
            </h1>
            <p className="mt-1 text-ink-500 dark:text-ink-400 text-[13.5px] max-w-xl leading-relaxed">{subtitle}</p>
          </div>
        </div>
      </motion.div>

      {/* Feature roadmap */}
      <motion.div
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.08 }}
        className="card-pad mt-5"
      >
        <div className="flex items-start justify-between mb-4">
          <div>
            <h3 className="section-title">Roadmap</h3>
            <p className="section-sub">What's coming in this module</p>
          </div>
        </div>

        <ul className="grid sm:grid-cols-2 gap-2.5">
          {features.map((f) => {
            const s = statusMap[f.status]
            const SIcon = s.icon
            return (
              <li
                key={f.label}
                className="flex items-center justify-between gap-3 rounded-md border border-ink-100 dark:border-ink-700 bg-ink-50/60 dark:bg-ink-800/40 px-4 py-3 transition hover:border-ink-200 hover:bg-white dark:hover:bg-ink-800"
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <SIcon className="w-4 h-4 text-ink-500 shrink-0" />
                  <span className="text-[13px] font-medium text-ink-800 dark:text-ink-100 truncate">{f.label}</span>
                </div>
                <span className={`chip ${s.chip}`}>{s.label}</span>
              </li>
            )
          })}
        </ul>
      </motion.div>
    </div>
  )
}
