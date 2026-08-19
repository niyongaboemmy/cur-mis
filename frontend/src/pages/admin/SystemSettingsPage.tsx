import { useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Settings, Video, Landmark, Coins } from 'lucide-react'
import { systemService } from '@/services/systemService'
import type { AcademicTerm, AcademicYear } from '@/types/academic'
import GuidanceVideosPanel from '@/components/admin/GuidanceVideosPanel'
import FeeMappingPanel from '@/pages/finance/FeeMappingPanel'
import { PERMISSIONS } from '@/constants/permissions'
import { usePermission } from '@/utils/permissions'
import { cn } from '@/utils/helpers'

/**
 * System settings — the home for the three endpoints VIEW_SETTINGS and
 * MANAGE_SETTINGS actually guard: /api/system/basics, /api/system/guidance-videos
 * and /api/system/fee-mapping.
 *
 * Before this page the two slugs granted nothing navigable: guidance videos sat
 * as an ungated tab inside Academic settings and fee mapping was mounted inside
 * the Finance fee-types screen, so holding the permission opened no door.
 */

interface TabDef {
  slug: string
  label: string
  icon: typeof Settings
  /** Omitted means "any holder of VIEW_SETTINGS". */
  permission?: string
  render: () => JSX.Element
}

export default function SystemSettingsPage() {
  const canManage = usePermission(PERMISSIONS.MANAGE_SETTINGS)

  const tabs = useMemo<TabDef[]>(() => {
    const all: TabDef[] = [
      { slug: 'institution', label: 'Institution', icon: Landmark, render: () => <InstitutionPanel /> },
      { slug: 'guidance-videos', label: 'Guidance videos', icon: Video, render: () => <GuidanceVideosPanel /> },
      // Fee mapping has no read-only mode, so it is limited to the write grant.
      { slug: 'fee-mapping', label: 'Application fee mapping', icon: Coins, permission: PERMISSIONS.MANAGE_SETTINGS, render: () => <FeeMappingPanel /> },
    ]
    return all.filter((t) => !t.permission || canManage)
  }, [canManage])

  const [searchParams, setSearchParams] = useSearchParams()
  const requested = searchParams.get('tab') ?? ''
  const active = tabs.find((t) => t.slug === requested) ?? tabs[0]

  return (
    <div className="max-w-[1400px] mx-auto space-y-5">
      <header className="flex items-center gap-3">
        <div className="w-11 h-11 rounded-2xl bg-brand/10 flex items-center justify-center shrink-0">
          <Settings className="w-5 h-5 text-brand" />
        </div>
        <div>
          <h1 className="text-xl font-black text-ink-900 dark:text-ink-50">System settings</h1>
          <p className="text-[12.5px] text-ink-500">
            Institution-wide configuration. {canManage ? 'Changes apply immediately.' : 'You have read-only access.'}
          </p>
        </div>
      </header>

      <div className="flex flex-wrap gap-1.5 border-b border-ink-200 dark:border-ink-800" role="tablist" aria-label="System settings sections">
        {tabs.map((t) => {
          const Icon = t.icon
          const isActive = t.slug === active?.slug
          return (
            <button
              key={t.slug}
              type="button"
              role="tab"
              aria-selected={isActive}
              onClick={() => setSearchParams({ tab: t.slug }, { replace: false })}
              className={cn(
                'flex items-center gap-1.5 px-3.5 py-2 text-[12.5px] font-bold rounded-t-lg -mb-px border-b-2 transition-colors',
                isActive
                  ? 'border-brand text-brand'
                  : 'border-transparent text-ink-500 hover:text-ink-800 dark:hover:text-ink-200',
              )}
            >
              <Icon className="w-3.5 h-3.5" />
              {t.label}
            </button>
          )
        })}
      </div>

      {active?.render()}
    </div>
  )
}

/* ─────────────────────────────────────────────────────────────── */

/** Read-only summary of what /api/system/basics reports about the institution. */
function InstitutionPanel() {
  const { data, isLoading, isError } = useQuery({
    queryKey: ['system', 'basics'],
    queryFn: ({ signal }) => systemService.getBasics(signal),
  })

  const basics = data?.data

  const labelOf = (v: AcademicYear | AcademicTerm | false | null | undefined) =>
    v && typeof v === 'object' ? (v as AcademicYear).label ?? '—' : 'None set'

  if (isLoading) {
    return <section className="card p-6 max-w-3xl"><p className="text-[12.5px] text-ink-500">Loading…</p></section>
  }

  if (isError || !basics) {
    return (
      <section className="card p-6 max-w-3xl">
        <p className="text-[12.5px] text-ink-500">
          Could not load the institution basics. Refresh the page to try again.
        </p>
      </section>
    )
  }

  const rows: { label: string; value: string }[] = [
    { label: 'Active academic year', value: labelOf(basics.active_year) },
    { label: 'Active term', value: labelOf(basics.active_term) },
    { label: 'Academic years on record', value: String(basics.years?.length ?? 0) },
    { label: 'Terms on record', value: String(basics.terms?.length ?? 0) },
  ]

  const settings = Object.entries(basics.settings ?? {})

  return (
    <section className="card p-6 max-w-3xl space-y-5">
      <div className="flex items-center gap-2">
        <Landmark className="w-5 h-5 text-brand" />
        <div>
          <h2 className="section-title">Institution</h2>
          <p className="section-sub">
            The current academic calendar. Years and terms are edited under Academics → Years &amp; terms.
          </p>
        </div>
      </div>

      <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3">
        {rows.map((r) => (
          <div key={r.label} className="flex flex-col gap-0.5">
            <dt className="text-[11px] font-bold uppercase tracking-wider text-ink-400">{r.label}</dt>
            <dd className="text-[13.5px] font-semibold text-ink-900 dark:text-ink-50 tabular-nums">{r.value}</dd>
          </div>
        ))}
      </dl>

      {settings.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-[11px] font-bold uppercase tracking-wider text-ink-400">Stored settings</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-[12.5px]">
              <tbody className="divide-y divide-ink-200 dark:divide-ink-800">
                {settings.map(([k, v]) => (
                  <tr key={k}>
                    <td className="py-1.5 pr-4 font-mono text-ink-500 whitespace-nowrap">{k}</td>
                    <td className="py-1.5 text-ink-900 dark:text-ink-50 break-all">{v || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </section>
  )
}
