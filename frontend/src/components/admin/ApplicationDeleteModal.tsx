import { useMutation } from '@tanstack/react-query';
import { Loader2, AlertTriangle, Trash2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { useNavigate } from 'react-router-dom';
import Modal from '@/components/ui/Modal';
import { StudentApplication } from '@/types/admission';

interface ApplicationDeleteModalProps {
  open: boolean;
  onClose: () => void;
  application?: any;
}

export default function ApplicationDeleteModal({
  open,
  onClose,
  application,
}: ApplicationDeleteModalProps) {
  const navigate = useNavigate();

  const deleteMutation = useMutation({
    mutationFn: async () => {
      if (!application?.id) throw new Error('Application ID missing');

      // Delete via API endpoint (you'll need to add this endpoint)
      const response = await fetch(`/api/admin/applications/${application.id}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token') || ''}`,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Failed to delete application');
      }

      return response.json();
    },
    onSuccess: () => {
      toast.success('Application deleted successfully. Applicant can resubmit.');
      navigate('/umis/admin/admissions/applications');
    },
    onError: (error: any) => {
      toast.error(error?.message || 'Failed to delete application');
    },
  });

  if (!application) return null;

  return (
    <Modal open={open} onClose={onClose} title="Delete Application" size="sm">
      <div className="space-y-6">
        {/* Warning Icon */}
        <div className="flex justify-center">
          <div className="w-16 h-16 rounded-full bg-red-50 dark:bg-red-900/20 flex items-center justify-center">
            <Trash2 className="w-8 h-8 text-red-600" />
          </div>
        </div>

        {/* Warning Message */}
        <div className="space-y-2 text-center">
          <h3 className="text-[15px] font-bold text-ink-900 dark:text-white">
            Delete Application?
          </h3>
          <p className="text-[13px] text-ink-600 dark:text-ink-400">
            This will permanently remove the application for{' '}
            <span className="font-semibold">
              {application.first_name} {application.last_name}
            </span>
            .
          </p>
        </div>

        {/* Details */}
        <div className="p-4 rounded-lg bg-ink-50 dark:bg-ink-900/30 space-y-2 text-[12px]">
          <div className="flex items-center justify-between">
            <span className="text-ink-600 dark:text-ink-400">Application #:</span>
            <span className="font-mono font-semibold text-ink-900 dark:text-white">
              {application.application_number}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-ink-600 dark:text-ink-400">Email:</span>
            <span className="text-ink-900 dark:text-white">{application.email}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-ink-600 dark:text-ink-400">Status:</span>
            <span className="text-ink-900 dark:text-white">{application.status}</span>
          </div>
        </div>

        {/* Important Notes */}
        <div className="space-y-3 p-4 rounded-lg bg-amber-50 dark:bg-amber-900/10 border border-amber-200 dark:border-amber-900/30">
          <div className="flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-600 mt-0.5 shrink-0" />
            <div className="text-[12px] text-amber-700 dark:text-amber-300 space-y-1">
              <p className="font-medium">Before deleting:</p>
              <ul className="list-disc list-inside space-y-0.5">
                <li>Attached documents will be deleted</li>
                <li>Status history will be removed</li>
                <li>Application cannot be recovered</li>
                <li>Applicant should be notified to resubmit</li>
              </ul>
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center justify-end gap-3 pt-4 border-t border-ink-100 dark:border-ink-800">
          <button
            type="button"
            onClick={onClose}
            className="btn-secondary"
            disabled={deleteMutation.isPending}
          >
            Keep Application
          </button>
          <button
            type="button"
            onClick={() => {
              if (
                window.confirm(
                  `Are you absolutely sure? This cannot be undone.\n\n${application.first_name} ${application.last_name} will need to resubmit their application.`
                )
              ) {
                deleteMutation.mutate();
              }
            }}
            disabled={deleteMutation.isPending}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-red-600 hover:bg-red-700 text-white font-medium text-[13px] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {deleteMutation.isPending ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" /> Deleting...
              </>
            ) : (
              <>
                <Trash2 className="w-4 h-4" /> Delete Application
              </>
            )}
          </button>
        </div>
      </div>
    </Modal>
  );
}
