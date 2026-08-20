import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { useSystemStore } from '@/store/systemStore'
import { useCampusFilterStore } from '@/store/campusFilterStore'
import { useCategoryFilterStore } from '@/store/categoryFilterStore'
import { studentService, type StudentStats } from '@/services/studentService'
import { ActiveTab } from '@/pages/StudentsPage'

/**
 * Admin dashboard = the live Student Overview (active-student metrics, gender /
 * nationality splits, and the by-faculty / department / level / programme /
 * campus / intake breakdowns). Reuses the exact `ActiveTab` rendered on the
 * Students → Overview tab so the two stay in lock-step, and re-scopes with the
 * topbar academic-year / campus / category selectors. Clicking any card or bar
 * drills into the filtered Students list.
 */
export default function AdminDashboardPage() {
  const navigate = useNavigate()

  const selectedYear     = useSystemStore((s) => s.selectedYearLabel)
  const selectedCampus   = useCampusFilterStore((s) => s.selectedCampusId)
  const selectedCategory = useCategoryFilterStore((s) => s.selectedCategory)

  const statsQ = useQuery({
    queryKey: ['student-stats', 'dashboard', selectedYear || 'all', selectedCampus, selectedCategory ?? 'all'],
    queryFn: () => studentService.stats({ acc_year: selectedYear || undefined }),
    staleTime: 60_000,
  })
  const stats: StudentStats | null = statsQ.data?.data ?? null

  return (
    <div className="max-w-[1400px] mx-auto space-y-5">
      <ActiveTab
        stats={stats}
        loading={statsQ.isLoading}
        fetching={statsQ.isFetching}
        onDrill={(filters) => {
          const q = new URLSearchParams()
          q.set('tab', 'all')
          Object.entries(filters).forEach(([k, v]) => {
            if (v) q.set(k, String(v))
          })
          navigate(`/students?${q.toString()}`)
        }}
      />
    </div>
  )
}
