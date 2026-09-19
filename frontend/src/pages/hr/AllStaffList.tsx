import { useQuery } from '@tanstack/react-query';
import { ChevronDown, ChevronRight, Users, AlertCircle, CheckCircle2, Trash2 } from 'lucide-react';
import { useState } from 'react';
import PageHeader from '@/components/ui/PageHeader';
import Spinner from '@/components/ui/Spinner';
import { staffDeduplicationService, DedupedStaff } from '@/services/staffDeduplicationService';

export default function AllStaffList() {
  const [expandedStaff, setExpandedStaff] = useState<Set<string>>(new Set());

  const { data: dedupedStaff, isLoading, error } = useQuery<DedupedStaff[]>({
    queryKey: ['staff-deduplicated'],
    queryFn: async () => {
      try {
        return await staffDeduplicationService.getAllStaffDeduped();
      } catch (err) {
        console.error('Failed to load staff:', err);
        return [];
      }
    },
  });

  const toggleExpanded = (fullName: string) => {
    const newSet = new Set(expandedStaff);
    if (newSet.has(fullName)) {
      newSet.delete(fullName);
    } else {
      newSet.add(fullName);
    }
    setExpandedStaff(newSet);
  };

  if (isLoading) return <Spinner />;

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-ink-950 p-6">
      <PageHeader
        title="All Staff"
        description={`${dedupedStaff?.length || 0} unique employees (click to view duplicates)`}
      />

      {error && (
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4 mb-6">
          <p className="text-red-700 dark:text-red-300">Failed to load staff list</p>
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
        <div className="bg-gradient-to-br from-blue-50 to-blue-100 dark:from-blue-900/30 dark:to-blue-800/30 rounded-xl p-5 border border-blue-200 dark:border-blue-700/50 shadow-sm hover:shadow-md transition">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-blue-600 dark:text-blue-400">Unique Staff</p>
              <p className="text-3xl font-bold text-blue-900 dark:text-blue-100 mt-1">{dedupedStaff?.length || 0}</p>
            </div>
            <Users className="w-10 h-10 text-blue-300 dark:text-blue-600" />
          </div>
        </div>
        <div className="bg-gradient-to-br from-green-50 to-green-100 dark:from-green-900/30 dark:to-green-800/30 rounded-xl p-5 border border-green-200 dark:border-green-700/50 shadow-sm hover:shadow-md transition">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-green-600 dark:text-green-400">Total Records</p>
              <p className="text-3xl font-bold text-green-900 dark:text-green-100 mt-1">
                {dedupedStaff?.reduce((sum, s) => sum + s.total_records, 0) || 0}
              </p>
            </div>
            <CheckCircle2 className="w-10 h-10 text-green-300 dark:text-green-600" />
          </div>
        </div>
        <div className="bg-gradient-to-br from-orange-50 to-orange-100 dark:from-orange-900/30 dark:to-orange-800/30 rounded-xl p-5 border border-orange-200 dark:border-orange-700/50 shadow-sm hover:shadow-md transition">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-orange-600 dark:text-orange-400">Duplicates Found</p>
              <p className="text-3xl font-bold text-orange-900 dark:text-orange-100 mt-1">
                {dedupedStaff?.reduce((sum, s) => sum + s.duplicate_records.length, 0) || 0}
              </p>
            </div>
            <AlertCircle className="w-10 h-10 text-orange-300 dark:text-orange-600" />
          </div>
        </div>
        <div className="bg-gradient-to-br from-red-50 to-red-100 dark:from-red-900/30 dark:to-red-800/30 rounded-xl p-5 border border-red-200 dark:border-red-700/50 shadow-sm hover:shadow-md transition">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-red-600 dark:text-red-400">Removed</p>
              <p className="text-3xl font-bold text-red-900 dark:text-red-100 mt-1">
                {(dedupedStaff?.reduce((sum, s) => sum + s.total_records, 0) || 0) - (dedupedStaff?.length || 0)}
              </p>
            </div>
            <Trash2 className="w-10 h-10 text-red-300 dark:text-red-600" />
          </div>
        </div>
      </div>

      {/* Staff List */}
      <div className="bg-white dark:bg-ink-800 rounded-xl shadow-lg overflow-hidden border border-gray-100 dark:border-ink-700">
        <table className="w-full">
          <thead className="bg-gradient-to-r from-slate-900 to-slate-800 dark:from-slate-800 dark:to-slate-900">
            <tr>
              <th className="px-6 py-4 text-left w-12"></th>
              <th className="px-6 py-4 text-left text-sm font-semibold text-white uppercase tracking-wider">Name</th>
              <th className="px-6 py-4 text-left text-sm font-semibold text-white uppercase tracking-wider">Gender</th>
              <th className="px-6 py-4 text-left text-sm font-semibold text-white uppercase tracking-wider">Position</th>
              <th className="px-6 py-4 text-left text-sm font-semibold text-white uppercase tracking-wider">Department</th>
              <th className="px-6 py-4 text-left text-sm font-semibold text-white uppercase tracking-wider">Phone</th>
              <th className="px-6 py-4 text-left text-sm font-semibold text-white uppercase tracking-wider">Status</th>
              <th className="px-6 py-4 text-center text-sm font-semibold text-white uppercase tracking-wider">Duplicates</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200 dark:divide-ink-700/50">
            {dedupedStaff?.map((staff) => (
              <div key={staff.full_name}>
                {/* Primary Record */}
                <tr
                  className={`hover:bg-slate-50 dark:hover:bg-ink-700/40 transition-all ${staff.duplicate_records.length > 0 ? 'cursor-pointer' : ''}`}
                  onClick={() => staff.duplicate_records.length > 0 && toggleExpanded(staff.full_name)}
                >
                  <td className="px-6 py-4">
                    {staff.duplicate_records.length > 0 ? (
                      expandedStaff.has(staff.full_name) ? (
                        <ChevronDown className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                      ) : (
                        <ChevronRight className="w-5 h-5 text-gray-400 dark:text-gray-600" />
                      )
                    ) : null}
                  </td>
                  <td className="px-6 py-4 font-semibold text-ink-900 dark:text-white capitalize">{staff.full_name}</td>
                  <td className="px-6 py-4 text-sm text-gray-600 dark:text-gray-400">
                    {staff.primary_record.employee_gender || '—'}
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-600 dark:text-gray-400">
                    {staff.primary_record.employee_position || '—'}
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-600 dark:text-gray-400">
                    {staff.primary_record.employee_post || '—'}
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-600 dark:text-gray-400 font-mono">
                    {staff.primary_record.employee_phone || '—'}
                  </td>
                  <td className="px-6 py-4">
                    <span
                      className={`inline-flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-semibold ${
                        staff.primary_record.employee_status === 'Active'
                          ? 'bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-300'
                          : staff.primary_record.employee_status === 'Terminated'
                          ? 'bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300'
                          : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-400'
                      }`}
                    >
                      <span className={`w-2 h-2 rounded-full ${
                        staff.primary_record.employee_status === 'Active'
                          ? 'bg-green-600 dark:bg-green-400'
                          : staff.primary_record.employee_status === 'Terminated'
                          ? 'bg-red-600 dark:bg-red-400'
                          : 'bg-gray-500'
                      }`}></span>
                      {staff.primary_record.employee_status || 'Unknown'}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-center">
                    {staff.duplicate_records.length > 0 ? (
                      <span className="inline-flex items-center gap-1 px-3 py-1.5 bg-orange-100 dark:bg-orange-900/40 text-orange-700 dark:text-orange-300 rounded-full text-xs font-semibold">
                        <AlertCircle className="w-3.5 h-3.5" />
                        {staff.duplicate_records.length}
                      </span>
                    ) : (
                      '—'
                    )}
                  </td>
                </tr>

                {/* Duplicate Records */}
                {expandedStaff.has(staff.full_name) &&
                  staff.duplicate_records.map((dup, idx) => (
                    <tr key={`${staff.full_name}-dup-${idx}`} className="bg-orange-50/50 dark:bg-orange-900/10 border-l-4 border-orange-400">
                      <td className="px-6 py-4"></td>
                      <td className="px-6 py-4 text-sm text-gray-600 dark:text-gray-400 italic font-mono">
                        ID: {dup.employee_id}
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-600 dark:text-gray-400">
                        {dup.employee_gender || '—'}
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-600 dark:text-gray-400">
                        {dup.employee_position || '—'}
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-600 dark:text-gray-400">
                        {dup.employee_post || '—'}
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-600 dark:text-gray-400 font-mono">
                        {dup.employee_phone || '—'}
                      </td>
                      <td className="px-6 py-4">
                        <span
                          className={`inline-flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-semibold ${
                            dup.employee_status === 'Active'
                              ? 'bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-300'
                              : dup.employee_status === 'Terminated'
                              ? 'bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300'
                              : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-400'
                          }`}
                        >
                          <span className={`w-2 h-2 rounded-full ${
                            dup.employee_status === 'Active'
                              ? 'bg-green-600 dark:bg-green-400'
                              : dup.employee_status === 'Terminated'
                              ? 'bg-red-600 dark:bg-red-400'
                              : 'bg-gray-500'
                          }`}></span>
                          {dup.employee_status || 'Unknown'}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-center">
                        <span className="inline-flex items-center gap-1 px-2 py-1 bg-orange-100 dark:bg-orange-900/40 text-orange-600 dark:text-orange-300 rounded text-xs font-semibold">
                          <Trash2 className="w-3 h-3" /> Duplicate
                        </span>
                      </td>
                    </tr>
                  ))}
              </div>
            ))}
          </tbody>
        </table>
      </div>

      {(!dedupedStaff || dedupedStaff.length === 0) && !isLoading && (
        <div className="bg-blue-50 dark:bg-blue-900/10 border-2 border-dashed border-blue-300 dark:border-blue-700 rounded-xl p-12 text-center">
          <Users className="w-16 h-16 text-blue-300 dark:text-blue-600 mx-auto mb-4" />
          <p className="text-lg font-semibold text-blue-900 dark:text-blue-100">No staff members found</p>
          <p className="text-sm text-blue-700 dark:text-blue-300 mt-2">Staff records will appear here once added to the system</p>
        </div>
      )}
    </div>
  );
}
