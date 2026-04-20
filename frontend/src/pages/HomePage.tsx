import { useCurrentUser } from '@/hooks/useAuth'
import { useAuthStore } from '@/store/authStore'

export default function HomePage() {
  const { user }            = useAuthStore()
  const { isLoading }       = useCurrentUser()

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-gray-900">
          Welcome back{user?.full_name ? `, ${user.full_name}` : ''}
        </h2>
        <p className="text-gray-500 text-sm mt-1">
          Here is what is happening today.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {[1, 2, 3].map((i) => (
          <div key={i} className="card">
            <p className="text-sm font-medium text-gray-500">Metric {i}</p>
            <p className="text-3xl font-bold text-primary-700 mt-1">—</p>
          </div>
        ))}
      </div>

      {isLoading && (
        <div className="text-sm text-gray-400 animate-pulse">Loading user data...</div>
      )}
    </div>
  )
}
