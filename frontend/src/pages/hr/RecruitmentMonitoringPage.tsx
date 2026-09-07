import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Edit2, Trash2, Download, Upload } from 'lucide-react';
import { useState } from 'react';
import PageHeader from '@/components/ui/PageHeader';
import Spinner from '@/components/ui/Spinner';
import { hrMonitoringService } from '@/services/hrMonitoringService';

export default function RecruitmentMonitoringPage() {
  const [showForm, setShowForm] = useState(false);
  const [showCandidatesModal, setShowCandidatesModal] = useState(false);
  const [selectedPostId, setSelectedPostId] = useState<number | null>(null);
  const [formData, setFormData] = useState({
    position_title: '',
    department_id: '',
    position_level: '',
    vacancy_count: '',
    posting_date: new Date().toISOString().split('T')[0],
    closing_date: '',
    description: '',
  });
  const queryClient = useQueryClient();

  const { data: posts, isLoading } = useQuery({
    queryKey: ['recruitment-posts'],
    queryFn: () => hrMonitoringService.getRecruitmentPosts(),
  });

  const { data: candidates } = useQuery({
    queryKey: ['recruitment-candidates', selectedPostId],
    queryFn: () => (selectedPostId ? hrMonitoringService.getCandidates(selectedPostId) : null),
    enabled: !!selectedPostId,
  });

  const createMutation = useMutation({
    mutationFn: (data: any) => hrMonitoringService.createRecruitmentPost(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['recruitment-posts'] });
      setShowForm(false);
      setFormData({
        position_title: '',
        department_id: '',
        position_level: '',
        vacancy_count: '',
        posting_date: new Date().toISOString().split('T')[0],
        closing_date: '',
        description: '',
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
        title="Recruitment Monitoring"
        description="Manage job postings and track candidates"
      />

      {/* Action Buttons */}
      <div className="flex gap-3 mb-6">
        <button
          onClick={() => setShowForm(!showForm)}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition"
        >
          <Plus className="w-4 h-4" />
          Post Job
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
          <h3 className="text-lg font-semibold mb-4">Post New Job Opening</h3>
          <form onSubmit={handleSubmit} className="grid grid-cols-2 gap-4">
            <input
              type="text"
              placeholder="Position Title"
              value={formData.position_title}
              onChange={(e) => setFormData({ ...formData, position_title: e.target.value })}
              className="col-span-2 px-3 py-2 border border-gray-300 dark:border-ink-700 rounded-lg bg-white dark:bg-ink-900 text-ink-900 dark:text-white"
              required
            />
            <input
              type="number"
              placeholder="Department ID"
              value={formData.department_id}
              onChange={(e) => setFormData({ ...formData, department_id: e.target.value })}
              className="px-3 py-2 border border-gray-300 dark:border-ink-700 rounded-lg bg-white dark:bg-ink-900 text-ink-900 dark:text-white"
              required
            />
            <input
              type="text"
              placeholder="Position Level (Lecturer, Officer, etc.)"
              value={formData.position_level}
              onChange={(e) => setFormData({ ...formData, position_level: e.target.value })}
              className="px-3 py-2 border border-gray-300 dark:border-ink-700 rounded-lg bg-white dark:bg-ink-900 text-ink-900 dark:text-white"
            />
            <input
              type="number"
              placeholder="Vacancy Count"
              value={formData.vacancy_count}
              onChange={(e) => setFormData({ ...formData, vacancy_count: e.target.value })}
              className="px-3 py-2 border border-gray-300 dark:border-ink-700 rounded-lg bg-white dark:bg-ink-900 text-ink-900 dark:text-white"
            />
            <input
              type="date"
              value={formData.posting_date}
              onChange={(e) => setFormData({ ...formData, posting_date: e.target.value })}
              className="px-3 py-2 border border-gray-300 dark:border-ink-700 rounded-lg bg-white dark:bg-ink-900 text-ink-900 dark:text-white"
              required
            />
            <input
              type="date"
              placeholder="Closing Date"
              value={formData.closing_date}
              onChange={(e) => setFormData({ ...formData, closing_date: e.target.value })}
              className="px-3 py-2 border border-gray-300 dark:border-ink-700 rounded-lg bg-white dark:bg-ink-900 text-ink-900 dark:text-white"
              required
            />
            <textarea
              placeholder="Job Description"
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              className="col-span-2 px-3 py-2 border border-gray-300 dark:border-ink-700 rounded-lg bg-white dark:bg-ink-900 text-ink-900 dark:text-white"
            />
            <div className="col-span-2 flex gap-2">
              <button
                type="submit"
                disabled={createMutation.isPending}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg disabled:opacity-50"
              >
                {createMutation.isPending ? 'Posting...' : 'Post Job'}
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

      {/* Recruitment Posts Table */}
      <div className="bg-white dark:bg-ink-800 rounded-lg shadow overflow-hidden">
        <table className="w-full">
          <thead className="bg-gray-100 dark:bg-ink-700">
            <tr>
              <th className="px-6 py-3 text-left text-sm font-semibold">Position</th>
              <th className="px-6 py-3 text-left text-sm font-semibold">Level</th>
              <th className="px-6 py-3 text-left text-sm font-semibold">Vacancies</th>
              <th className="px-6 py-3 text-left text-sm font-semibold">Posted</th>
              <th className="px-6 py-3 text-left text-sm font-semibold">Closes</th>
              <th className="px-6 py-3 text-left text-sm font-semibold">Status</th>
              <th className="px-6 py-3 text-center text-sm font-semibold">Candidates</th>
              <th className="px-6 py-3 text-center text-sm font-semibold">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200 dark:divide-ink-700">
            {(posts as any)?.data?.map((post: any) => (
              <tr key={post.id} className="hover:bg-gray-50 dark:hover:bg-ink-700/50">
                <td className="px-6 py-4 text-sm font-medium">{post.position_title}</td>
                <td className="px-6 py-4 text-sm">{post.position_level}</td>
                <td className="px-6 py-4 text-sm text-center font-semibold">{post.vacancy_count}</td>
                <td className="px-6 py-4 text-sm">{post.posting_date}</td>
                <td className="px-6 py-4 text-sm">{post.closing_date}</td>
                <td className="px-6 py-4">
                  <span
                    className={`px-3 py-1 rounded-full text-xs font-medium ${
                      post.status === 'open'
                        ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400'
                        : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-400'
                    }`}
                  >
                    {post.status}
                  </span>
                </td>
                <td className="px-6 py-4 text-center">
                  <button
                    onClick={() => {
                      setSelectedPostId(post.id);
                      setShowCandidatesModal(true);
                    }}
                    className="px-3 py-1 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 rounded text-xs hover:bg-blue-200 dark:hover:bg-blue-900/50"
                  >
                    View
                  </button>
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

      {/* Candidates Modal */}
      {showCandidatesModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-ink-800 rounded-lg shadow-lg max-w-2xl w-full mx-4 max-h-[80vh] overflow-y-auto">
            <div className="sticky top-0 bg-white dark:bg-ink-800 border-b border-gray-200 dark:border-ink-700 p-6 flex justify-between items-center">
              <h3 className="text-lg font-semibold">Candidates</h3>
              <button
                onClick={() => setShowCandidatesModal(false)}
                className="text-gray-500 hover:text-gray-700 dark:text-gray-400"
              >
                ✕
              </button>
            </div>
            <div className="p-6">
              <div className="space-y-3">
                {(candidates as any)?.data?.map((candidate: any, idx: number) => (
                  <div key={idx} className="border border-gray-200 dark:border-ink-700 rounded-lg p-4">
                    <div className="flex justify-between items-start">
                      <div>
                        <p className="font-medium">{candidate.candidate_name}</p>
                        <p className="text-sm text-gray-600 dark:text-gray-400">{candidate.candidate_email}</p>
                        <p className="text-sm text-gray-600 dark:text-gray-400">{candidate.candidate_phone}</p>
                      </div>
                      <span className="px-3 py-1 rounded-full text-xs font-medium bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400">
                        {candidate.stage}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
