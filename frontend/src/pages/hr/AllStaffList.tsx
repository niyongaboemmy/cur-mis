import { useQuery } from '@tanstack/react-query';
import { ChevronDown, ChevronRight } from 'lucide-react';
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
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <div className="bg-white dark:bg-ink-800 rounded-lg p-4 border-l-4 border-blue-500">
          <p className="text-sm text-gray-600 dark:text-gray-400">Unique Staff</p>
          <p className="text-2xl font-bold text-ink-900 dark:text-white">{dedupedStaff?.length || 0}</p>
        </div>
        <div className="bg-white dark:bg-ink-800 rounded-lg p-4 border-l-4 border-green-500">
          <p className="text-sm text-gray-600 dark:text-gray-400">Total Records</p>
          <p className="text-2xl font-bold text-ink-900 dark:text-white">
            {dedupedStaff?.reduce((sum, s) => sum + s.total_records, 0) || 0}
          </p>
        </div>
        <div className="bg-white dark:bg-ink-800 rounded-lg p-4 border-l-4 border-orange-500">
          <p className="text-sm text-gray-600 dark:text-gray-400">Duplicates Found</p>
          <p className="text-2xl font-bold text-ink-900 dark:text-white">
            {dedupedStaff?.reduce((sum, s) => sum + s.duplicate_records.length, 0) || 0}
          </p>
        </div>
        <div className="bg-white dark:bg-ink-800 rounded-lg p-4 border-l-4 border-purple-500">
          <p className="text-sm text-gray-600 dark:text-gray-400">Removed</p>
          <p className="text-2xl font-bold text-ink-900 dark:text-white">
            {(dedupedStaff?.reduce((sum, s) => sum + s.total_records, 0) || 0) - (dedupedStaff?.length || 0)}
          </p>
        </div>
      </div>

      {/* Staff List */}
      <div className="bg-white dark:bg-ink-800 rounded-lg shadow overflow-hidden">
        <table className="w-full">
          <thead className="bg-gray-100 dark:bg-ink-700 border-b border-gray-200 dark:border-ink-600">
            <tr>
              <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700 dark:text-gray-300 w-12"></th>
              <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700 dark:text-gray-300">Name</th>
              <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700 dark:text-gray-300">Gender</th>
              <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700 dark:text-gray-300">Position</th>
              <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700 dark:text-gray-300">Department</th>
              <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700 dark:text-gray-300">Phone</th>
              <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700 dark:text-gray-300">Status</th>
              <th className="px-4 py-3 text-center text-sm font-semibold text-gray-700 dark:text-gray-300">Duplicates</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200 dark:divide-ink-700">
            {dedupedStaff?.map((staff) => (
              <div key={staff.full_name}>
                {/* Primary Record */}
                <tr
                  className="hover:bg-gray-50 dark:hover:bg-ink-700/50 cursor-pointer transition"
                  onClick={() => staff.duplicate_records.length > 0 && toggleExpanded(staff.full_name)}
                >
                  <td className="px-4 py-3">
                    {staff.duplicate_records.length > 0 ? (
                      expandedStaff.has(staff.full_name) ? (
                        <ChevronDown className="w-5 h-5 text-gray-600 dark:text-gray-400" />
                      ) : (
                        <ChevronRight className="w-5 h-5 text-gray-600 dark:text-gray-400" />
                      )
                    ) : null}
                  </td>
                  <td className="px-4 py-3 font-medium text-ink-900 dark:text-white capitalize">{staff.full_name}</td>
                  <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-400">
                    {staff.primary_record.employee_gender || '—'}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-400">
                    {staff.primary_record.employee_position || '—'}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-400">
                    {staff.primary_record.employee_post || '—'}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-400">
                    {staff.primary_record.employee_phone || '—'}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`px-2 py-1 rounded text-xs font-medium ${
                        staff.primary_record.employee_status === 'Active'
                          ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400'
                          : staff.primary_record.employee_status === 'Terminated'
                          ? 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400'
                          : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-400'
                      }`}
                    >
                      {staff.primary_record.employee_status || 'Unknown'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-center">
                    {staff.duplicate_records.length > 0 ? (
                      <span className="px-2 py-1 bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-400 rounded text-xs font-medium">
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
                    <tr key={`${staff.full_name}-dup-${idx}`} className="bg-gray-50 dark:bg-ink-700/30 border-l-4 border-orange-400">
                      <td className="px-4 py-3"></td>
                      <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-400 italic">
                        ID: {dup.employee_id}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-400">
                        {dup.employee_gender || '—'}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-400">
                        {dup.employee_position || '—'}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-400">
                        {dup.employee_post || '—'}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-400">
                        {dup.employee_phone || '—'}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`px-2 py-1 rounded text-xs font-medium ${
                            dup.employee_status === 'Active'
                              ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400'
                              : dup.employee_status === 'Terminated'
                              ? 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400'
                              : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-400'
                          }`}
                        >
                          {dup.employee_status || 'Unknown'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className="text-xs text-gray-500 dark:text-gray-400">Duplicate</span>
                      </td>
                    </tr>
                  ))}
              </div>
            ))}
          </tbody>
        </table>
      </div>

      {(!dedupedStaff || dedupedStaff.length === 0) && !isLoading && (
        <div className="bg-gray-100 dark:bg-ink-800 rounded-lg p-8 text-center">
          <p className="text-gray-600 dark:text-gray-400">No staff members found</p>
        </div>
      )}
    </div>
  );
}
