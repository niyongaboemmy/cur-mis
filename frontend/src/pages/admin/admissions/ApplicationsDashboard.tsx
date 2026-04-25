import { useQuery } from "@tanstack/react-query";
import { applicationAdminService } from "@/services/admissionService";
import { 
  Users, 
  FileCheck2, 
  AlertCircle, 
  Clock, 
  TrendingUp,
  Building2,
  PieChart as PieIcon,
  CheckCircle2,
  ChevronRight,
  ArrowUpRight
} from "lucide-react";
import { Link } from "react-router-dom";
import StatCard from "@/components/dashboard/StatCard";
import DonutChart from "@/components/dashboard/DonutChart";
import LineChart from "@/components/dashboard/LineChart";
import { ApplicationStatus } from "@/types/admission";

const STATUS_COLORS: Record<string, string> = {
  submitted: "#4FB4FF",
  documents_under_review: "#F5C400",
  documents_verified: "#10B981",
  documents_rejected: "#EF4444",
  requested_changes: "#F97316",
  merit_listed: "#8B5CF6",
  offered: "#EC4899",
  offer_accepted: "#059669",
  enrolled: "#0D9488",
  withdrawn: "#64748B",
  draft: "#94A3B8",
};

export default function ApplicationsDashboard() {
  const { data, isLoading } = useQuery({
    queryKey: ["admin", "applications", "stats"],
    queryFn: () => applicationAdminService.getStats(),
  });

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 animate-pulse">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-32 bg-ink-100 dark:bg-ink-800 rounded-2xl" />
          ))}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 animate-pulse">
          <div className="lg:col-span-2 h-96 bg-ink-100 dark:bg-ink-800 rounded-2xl" />
          <div className="h-96 bg-ink-100 dark:bg-ink-800 rounded-2xl" />
        </div>
      </div>
    );
  }

  const stats = data?.data;
  if (!stats) return null;

  const byStatus = (stats.by_status || []).map((s: any) => ({
    label: (s.status || "Unknown").replace(/_/g, " "),
    value: Number(s.cnt || 0),
    color: STATUS_COLORS[s.status] || "#CBD5E1",
  }));

  const trendLabels = (stats.trend || []).map((t: any) => {
    const d = new Date(t.date);
    return d.toLocaleDateString(undefined, { weekday: 'short' });
  });
  
  const trendSeries = [
    { name: 'Applications', color: '#0A2A5E', data: (stats.trend || []).map((t: any) => Number(t.cnt || 0)) }
  ];

  const genderSegments = (stats.by_gender || []).map((g: any) => ({
    label: g.label || 'Unknown',
    value: Number(g.cnt || 0),
    color: g.label === 'M' ? '#0A2A5E' : g.label === 'F' ? '#F5C400' : '#4FB4FF'
  }));

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500 pb-12">
      {/* Stats Overview */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard 
          label="Total Applications" 
          value={stats.total.toLocaleString()} 
          icon={Users} 
          tone="sky" 
        />
        <StatCard 
          label="Ready for Merit List" 
          value={Number(stats.by_status.find((s: any) => s.status === ApplicationStatus.DOCUMENTS_VERIFIED)?.cnt || 0).toLocaleString()} 
          icon={CheckCircle2} 
          tone="mint" 
        />
        <StatCard 
          label="Action Required" 
          value={Number(stats.by_status.find((s: any) => s.status === ApplicationStatus.REQUESTED_CHANGES)?.cnt || 0).toLocaleString()} 
          icon={AlertCircle} 
          tone="peach" 
        />
        <StatCard 
          label="Under Review" 
          value={Number(stats.by_status.find((s: any) => s.status === ApplicationStatus.DOCUMENTS_UNDER_REVIEW)?.cnt || 0).toLocaleString()} 
          icon={Clock} 
          tone="lilac" 
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Trend Chart */}
        <div className="lg:col-span-2 card-pad">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h3 className="text-[16px] font-bold text-ink-900 dark:text-white">Submission Trend</h3>
              <p className="text-[12px] text-ink-500">New applications over the last 7 days</p>
            </div>
            <div className="px-3 py-1 bg-brand/5 text-brand text-[11px] font-bold rounded-full flex items-center gap-1">
              <TrendingUp className="w-3 h-3" />
              Live Updates
            </div>
          </div>
          <LineChart labels={trendLabels} series={trendSeries} height={300} />
        </div>

        {/* Status Distribution */}
        <div className="card-pad flex flex-col">
          <h3 className="text-[16px] font-bold text-ink-900 dark:text-white mb-6 flex items-center gap-2">
            <PieIcon className="w-5 h-5 text-brand" />
            Status Funnel
          </h3>
          <div className="flex-1 flex items-center justify-center">
            <DonutChart 
              segments={byStatus} 
              centerTop="Applications"
              centerBig={stats.total.toString()}
            />
          </div>
          <div className="space-y-2 mt-6 max-h-[120px] overflow-y-auto pr-2 custom-scrollbar">
            {byStatus.map((s: any) => (
              <div key={s.label} className="flex items-center justify-between group">
                <div className="flex items-center gap-2">
                  <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: s.color }} />
                  <span className="text-[11px] font-bold uppercase tracking-tight text-ink-500 group-hover:text-ink-700 transition-colors">
                    {s.label}
                  </span>
                </div>
                <span className="text-[11px] font-black text-ink-900 dark:text-white">{s.value}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Popular Departments */}
        <div className="card-pad flex flex-col">
          <h3 className="text-[16px] font-bold text-ink-900 dark:text-white mb-6 flex items-center gap-2">
            <Building2 className="w-5 h-5 text-brand" />
            Popular Departments
          </h3>
          <div className="space-y-4 flex-1">
            {(stats.by_dept || []).slice(0, 5).map((d: any) => (
              <div key={d.label} className="relative">
                <div className="flex items-center justify-between mb-1.5 relative z-10 px-1">
                  <span className="text-[13px] font-bold text-ink-800 dark:text-ink-100">{d.label}</span>
                  <span className="text-[12px] font-black text-brand">{Number(d.cnt).toLocaleString()}</span>
                </div>
                <div className="h-2 w-full bg-ink-100 dark:bg-ink-800 rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-brand rounded-full transition-all duration-1000 delay-300"
                    style={{ width: stats.total > 0 ? `${(Number(d.cnt) / stats.total) * 100}%` : '0%' }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Gender Balance */}
        <div className="card-pad flex flex-col">
          <h3 className="text-[16px] font-bold text-ink-900 dark:text-white mb-6 flex items-center gap-2">
            <Users className="w-5 h-5 text-brand" />
            Gender Diversity
          </h3>
          <div className="flex-1 flex items-center justify-center">
            <DonutChart 
              segments={genderSegments} 
              centerTop="Balance"
              centerBig={stats.total > 0 ? `${Math.round(((genderSegments.find(g => g.label === 'F')?.value || 0) / stats.total) * 100)}% ♀` : '0%'}
            />
          </div>
          <div className="flex items-center justify-center gap-6 mt-6">
            {genderSegments.map((s: any) => (
              <div key={s.label} className="flex items-center gap-1.5">
                <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: s.color }} />
                <span className="text-[12px] font-bold text-ink-600 dark:text-ink-300">{s.label === 'M' ? 'Male' : s.label === 'F' ? 'Female' : 'Other'}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Recent Applications */}
        <div className="card-pad flex flex-col">
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-[16px] font-bold text-ink-900 dark:text-white flex items-center gap-2">
              <Clock className="w-5 h-5 text-brand" />
              Latest Submissions
            </h3>
            <Link to="/admin/admissions/applications" className="text-[11px] font-black text-brand uppercase tracking-widest hover:underline flex items-center gap-1">
              See All <ChevronRight className="w-3 h-3" />
            </Link>
          </div>
          <div className="space-y-3 flex-1 overflow-y-auto max-h-[300px] pr-2 custom-scrollbar">
            {(stats.recent || []).map((r: any) => (
              <div key={r.application_number} className="group flex items-center gap-3 p-2.5 hover:bg-ink-50 dark:hover:bg-ink-800/40 rounded-xl transition-all border border-transparent hover:border-ink-100 dark:hover:border-ink-700">
                <div className="w-10 h-10 rounded-xl bg-ink-100 dark:bg-ink-800 flex items-center justify-center font-bold text-xs text-ink-600 group-hover:bg-brand group-hover:text-white transition-colors">
                  {(r.first_name?.[0] || "")}{(r.last_name?.[0] || "")}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[13.5px] font-bold text-ink-900 dark:text-white truncate leading-tight">
                    {r.first_name} {r.last_name}
                  </p>
                  <p className="text-[11px] text-ink-500 truncate mt-0.5">{r.department_name}</p>
                </div>
                <div className="text-right shrink-0">
                  <div className={`w-2 h-2 rounded-full ml-auto mb-1 ${
                    r.status === 'enrolled' ? 'bg-emerald-500' :
                    r.status === 'submitted' ? 'bg-blue-500' :
                    'bg-ink-300'
                  }`} />
                  <p className="text-[10px] font-black text-ink-400 uppercase tracking-tighter">
                    {r.application_number.split('-').pop()}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
