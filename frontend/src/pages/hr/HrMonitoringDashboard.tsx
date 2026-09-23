import { useQuery } from '@tanstack/react-query';
import { AlertCircle, TrendingUp, Users, FileText } from 'lucide-react';
import PageHeader from '@/components/ui/PageHeader';
import Spinner from '@/components/ui/Spinner';
import { hrMonitoringService } from '@/services/hrMonitoringService';

interface DashboardStats {
  open_grievances: number;
  open_conflicts: number;
  pending_appraisals: number;
  open_recruitment_posts: number;
  avg_turnover_rate: number;
}

export default function HrMonitoringDashboard() {
  const { data, isLoading, error } = useQuery<DashboardStats>({
    queryKey: ['hr-monitoring-dashboard'],
    queryFn: async () => {
      try {
        return await hrMonitoringService.getDashboard();
      } catch {
        return { open_grievances: 0, open_conflicts: 0, pending_appraisals: 0, open_recruitment_posts: 0, avg_turnover_rate: 0 };
      }
    },
  });

  if (isLoading) return <Spinner />;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 dark:from-ink-900 dark:to-ink-950 p-6">
      <PageHeader
        title="HR Monitoring Dashboard"
        description="Monitor staff performance, recruitment, employee relations, and retention metrics"
      />

      {error && (
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4 mb-6 flex items-center gap-3">
          <AlertCircle className="w-5 h-5 text-red-600 dark:text-red-400" />
          <p className="text-red-700 dark:text-red-300">Failed to load monitoring dashboard</p>
        </div>
      )}

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4 mb-8">
        {/* Open Grievances */}
        <div className="bg-white dark:bg-ink-800 rounded-lg shadow p-6 border-l-4 border-red-500">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600 dark:text-gray-400">Open Grievances</p>
              <p className="text-3xl font-bold text-ink-900 dark:text-white">{data?.open_grievances ?? 0}</p>
            </div>
            <AlertCircle className="w-12 h-12 text-red-500 opacity-20" />
          </div>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">Require resolution</p>
        </div>

        {/* Open Conflicts */}
        <div className="bg-white dark:bg-ink-800 rounded-lg shadow p-6 border-l-4 border-orange-500">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600 dark:text-gray-400">Conflicts</p>
              <p className="text-3xl font-bold text-ink-900 dark:text-white">{data?.open_conflicts ?? 0}</p>
            </div>
            <Users className="w-12 h-12 text-orange-500 opacity-20" />
          </div>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">Under resolution</p>
        </div>

        {/* Pending Appraisals */}
        <div className="bg-white dark:bg-ink-800 rounded-lg shadow p-6 border-l-4 border-blue-500">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600 dark:text-gray-400">Pending Appraisals</p>
              <p className="text-3xl font-bold text-ink-900 dark:text-white">{data?.pending_appraisals ?? 0}</p>
            </div>
            <FileText className="w-12 h-12 text-blue-500 opacity-20" />
          </div>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">To be completed</p>
        </div>

        {/* Recruitment Posts */}
        <div className="bg-white dark:bg-ink-800 rounded-lg shadow p-6 border-l-4 border-green-500">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600 dark:text-gray-400">Open Positions</p>
              <p className="text-3xl font-bold text-ink-900 dark:text-white">{data?.open_recruitment_posts ?? 0}</p>
            </div>
            <Users className="w-12 h-12 text-green-500 opacity-20" />
          </div>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">Actively recruiting</p>
        </div>

        {/* Turnover Rate */}
        <div className="bg-white dark:bg-ink-800 rounded-lg shadow p-6 border-l-4 border-purple-500">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600 dark:text-gray-400">Turnover Rate</p>
              <p className="text-3xl font-bold text-ink-900 dark:text-white">
                {(data?.avg_turnover_rate ?? 0).toFixed(1)}%
              </p>
            </div>
            <TrendingUp className="w-12 h-12 text-purple-500 opacity-20" />
          </div>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">Annual average</p>
        </div>
      </div>

      {/* Quick Actions */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <a
          href="/hr/monitoring/performance"
          className="bg-white dark:bg-ink-800 rounded-lg shadow hover:shadow-lg p-6 transition-all border border-gray-200 dark:border-ink-700"
        >
          <FileText className="w-8 h-8 text-blue-500 mb-3" />
          <h3 className="font-semibold text-ink-900 dark:text-white">Performance</h3>
          <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">Appraisals & targets</p>
        </a>

        <a
          href="/hr/monitoring/recruitment"
          className="bg-white dark:bg-ink-800 rounded-lg shadow hover:shadow-lg p-6 transition-all border border-gray-200 dark:border-ink-700"
        >
          <Users className="w-8 h-8 text-green-500 mb-3" />
          <h3 className="font-semibold text-ink-900 dark:text-white">Recruitment</h3>
          <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">Posts & candidates</p>
        </a>

        <a
          href="/hr/monitoring/relations"
          className="bg-white dark:bg-ink-800 rounded-lg shadow hover:shadow-lg p-6 transition-all border border-gray-200 dark:border-ink-700"
        >
          <AlertCircle className="w-8 h-8 text-red-500 mb-3" />
          <h3 className="font-semibold text-ink-900 dark:text-white">Relations</h3>
          <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">Grievances & counseling</p>
        </a>

        <a
          href="/hr/monitoring/turnover"
          className="bg-white dark:bg-ink-800 rounded-lg shadow hover:shadow-lg p-6 transition-all border border-gray-200 dark:border-ink-700"
        >
          <TrendingUp className="w-8 h-8 text-purple-500 mb-3" />
          <h3 className="font-semibold text-ink-900 dark:text-white">Retention</h3>
          <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">Exit & retention</p>
        </a>
      </div>
    </div>
  );
}
