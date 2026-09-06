import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Edit2, Trash2, Download, Upload } from 'lucide-react';
import { useState } from 'react';
import PageHeader from '@/components/ui/PageHeader';
import Spinner from '@/components/ui/Spinner';
import { hrMonitoringService } from '@/services/hrMonitoringService';

export default function PerformanceMonitoringPage() {
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [formData, setFormData] = useState({
    employee_id: '',
    appraisal_period: '',
    appraisal_date: new Date().toISOString().split('T')[0],
    rating: '',
    comments: '',
    appraiser_id: '',
  });
  const [fileUpload, setFileUpload] = useState<File | null>(null);
  const queryClient = useQueryClient();

  const { data: appraisals, isLoading } = useQuery({
    queryKey: ['appraisals'],
    queryFn: () => hrMonitoringService.getAppraisals(1, 50),
  });

  const createMutation = useMutation({
    mutationFn: (data: any) => hrMonitoringService.createAppraisal(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['appraisals'] });
      setShowForm(false);
      setFormData({
        employee_id: '',
        appraisal_period: '',
        appraisal_date: new Date().toISOString().split('T')[0],
        rating: '',
        comments: '',
        appraiser_id: '',
      });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    createMutation.mutate(formData);
  };

  if (isLoading) return <Spinner />;

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-ink-950 p-6">
      <PageHeader
        title="Performance Monitoring"
        description="Manage performance appraisals and performance targets"
      />

      {/* Action Buttons */}
      <div className="flex gap-3 mb-6">
        <button
          onClick={() => setShowForm(!showForm)}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition"
        >
          <Plus className="w-4 h-4" />
          Add Appraisal
        </button>
        <button className="flex items-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg transition">
          <Upload className="w-4 h-4" />
          Import
        </button>
        <button className="flex items-center gap-2 px-4 py-2 bg-gray-600 hover:bg-gray-700 text-white rounded-lg transition">
          <Download className="w-4 h-4" />
          Export
        </button>
      </div>

      {/* Form */}
      {showForm && (
        <div className="bg-white dark:bg-ink-800 rounded-lg shadow p-6 mb-6">
          <h3 className="text-lg font-semibold mb-4">Add Performance Appraisal</h3>
          <form onSubmit={handleSubmit} className="grid grid-cols-2 gap-4">
            <input
              type="number"
              placeholder="Employee ID"
              value={formData.employee_id}
              onChange={(e) => setFormData({ ...formData, employee_id: e.target.value })}
              className="px-3 py-2 border border-gray-300 dark:border-ink-700 rounded-lg bg-white dark:bg-ink-900 text-ink-900 dark:text-white"
              required
            />
            <input
              type="text"
              placeholder="Appraisal Period (e.g., 2026-Q3)"
              value={formData.appraisal_period}
              onChange={(e) => setFormData({ ...formData, appraisal_period: e.target.value })}
              className="px-3 py-2 border border-gray-300 dark:border-ink-700 rounded-lg bg-white dark:bg-ink-900 text-ink-900 dark:text-white"
              required
            />
            <input
              type="date"
              value={formData.appraisal_date}
              onChange={(e) => setFormData({ ...formData, appraisal_date: e.target.value })}
              className="px-3 py-2 border border-gray-300 dark:border-ink-700 rounded-lg bg-white dark:bg-ink-900 text-ink-900 dark:text-white"
              required
            />
            <input
              type="number"
              placeholder="Rating (1-5)"
              min="1"
              max="5"
              step="0.1"
              value={formData.rating}
              onChange={(e) => setFormData({ ...formData, rating: e.target.value })}
              className="px-3 py-2 border border-gray-300 dark:border-ink-700 rounded-lg bg-white dark:bg-ink-900 text-ink-900 dark:text-white"
              required
            />
            <input
              type="number"
              placeholder="Appraiser ID"
              value={formData.appraiser_id}
              onChange={(e) => setFormData({ ...formData, appraiser_id: e.target.value })}
              className="px-3 py-2 border border-gray-300 dark:border-ink-700 rounded-lg bg-white dark:bg-ink-900 text-ink-900 dark:text-white"
            />
            <textarea
              placeholder="Comments"
              value={formData.comments}
              onChange={(e) => setFormData({ ...formData, comments: e.target.value })}
              className="col-span-2 px-3 py-2 border border-gray-300 dark:border-ink-700 rounded-lg bg-white dark:bg-ink-900 text-ink-900 dark:text-white"
            />
            <div className="col-span-2">
              <label className="block text-sm font-medium mb-2">Upload Supporting Document (Optional)</label>
              <input
                type="file"
                onChange={(e) => setFileUpload(e.target.files?.[0] || null)}
                className="px-3 py-2 border border-gray-300 dark:border-ink-700 rounded-lg bg-white dark:bg-ink-900 text-ink-900 dark:text-white w-full"
              />
            </div>
            <div className="col-span-2 flex gap-2">
              <button
                type="submit"
                disabled={createMutation.isPending}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg disabled:opacity-50"
              >
                {createMutation.isPending ? 'Saving...' : 'Save Appraisal'}
              </button>
              <button
                type="button"
                onClick={() => setShowForm(false)}
                className="px-4 py-2 bg-gray-400 hover:bg-gray-500 text-white rounded-lg"
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Appraisals Table */}
      <div className="bg-white dark:bg-ink-800 rounded-lg shadow overflow-hidden">
        <table className="w-full">
          <thead className="bg-gray-100 dark:bg-ink-700">
            <tr>
              <th className="px-6 py-3 text-left text-sm font-semibold">Employee ID</th>
              <th className="px-6 py-3 text-left text-sm font-semibold">Period</th>
              <th className="px-6 py-3 text-left text-sm font-semibold">Date</th>
              <th className="px-6 py-3 text-left text-sm font-semibold">Rating</th>
              <th className="px-6 py-3 text-left text-sm font-semibold">Comments</th>
              <th className="px-6 py-3 text-left text-sm font-semibold">Status</th>
              <th className="px-6 py-3 text-center text-sm font-semibold">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200 dark:divide-ink-700">
            {appraisals?.data?.map((appraisal: any) => (
              <tr key={appraisal.id} className="hover:bg-gray-50 dark:hover:bg-ink-700/50">
                <td className="px-6 py-4 text-sm">{appraisal.employee_id}</td>
                <td className="px-6 py-4 text-sm">{appraisal.appraisal_period}</td>
                <td className="px-6 py-4 text-sm">{appraisal.appraisal_date}</td>
                <td className="px-6 py-4 text-sm font-semibold text-blue-600 dark:text-blue-400">{appraisal.rating}</td>
                <td className="px-6 py-4 text-sm text-gray-600 dark:text-gray-400 truncate max-w-xs">
                  {appraisal.comments}
                </td>
                <td className="px-6 py-4">
                  <span
                    className={`px-3 py-1 rounded-full text-xs font-medium ${
                      appraisal.status === 'completed'
                        ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400'
                        : 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400'
                    }`}
                  >
                    {appraisal.status}
                  </span>
                </td>
                <td className="px-6 py-4 text-center">
                  <div className="flex justify-center gap-2">
                    <button className="text-blue-600 hover:text-blue-700 dark:text-blue-400">
                      <Edit2 className="w-4 h-4" />
                    </button>
                    <button className="text-red-600 hover:text-red-700 dark:text-red-400">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
