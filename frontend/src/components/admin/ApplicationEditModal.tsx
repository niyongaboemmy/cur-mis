import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Loader2, AlertTriangle, Save, Check } from 'lucide-react';
import toast from 'react-hot-toast';
import { applicantService } from '@/services/admissionService';
import Modal from '@/components/ui/Modal';
import { StudentApplication } from '@/types/admission';

interface ApplicationEditModalProps {
  open: boolean;
  onClose: () => void;
  application?: any;
}

export default function ApplicationEditModal({
  open,
  onClose,
  application,
}: ApplicationEditModalProps) {
  const queryClient = useQueryClient();
  const [formData, setFormData] = useState<Partial<StudentApplication>>(
    application || {}
  );

  // Update form data when application changes
  const handleChange = (field: keyof StudentApplication, value: any) => {
    setFormData((prev) => ({
      ...prev,
      [field]: value,
    }));
  };

  const updateMutation = useMutation({
    mutationFn: async () => {
      if (!application?.id) throw new Error('Application ID missing');
      return applicantService.updateApplication(application.id, formData as any);
    },
    onSuccess: () => {
      toast.success('Application updated successfully');
      queryClient.invalidateQueries({ queryKey: ['admin', 'applications'] });
      onClose();
    },
    onError: (error: any) => {
      toast.error(error?.response?.data?.message || 'Failed to update application');
    },
  });

  const getModeOfStudyLabel = (id: number | undefined) => {
    const modes: Record<number, string> = {
      1: 'Day',
      2: 'Evening',
      3: 'Weekend',
      4: 'Holiday',
      5: 'Distance Learning',
    };
    return modes[id || 0] || 'Not set';
  };

  const hasChanges = (field: string) => {
    return formData[field as keyof StudentApplication] !== application?.[field];
  };

  if (!application) return null;

  return (
    <Modal open={open} onClose={onClose} title="Edit Application" size="lg">
      <div className="space-y-6">
        {/* Personal Info */}
        <section>
          <h3 className="text-[14px] font-bold text-ink-900 dark:text-white mb-4">
            Personal Information
          </h3>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-[12px] font-medium text-ink-700 dark:text-ink-200">
                First Name
              </label>
              <div className="relative mt-1">
                <input
                  type="text"
                  className="input"
                  placeholder={`Current: ${application?.first_name || 'Not set'}`}
                  value={formData.first_name || ''}
                  onChange={(e) => handleChange('first_name', e.target.value)}
                />
                {hasChanges('first_name') && (
                  <Check className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-amber-600" />
                )}
              </div>
            </div>
            <div>
              <label className="text-[12px] font-medium text-ink-700 dark:text-ink-200">
                Last Name
              </label>
              <div className="relative mt-1">
                <input
                  type="text"
                  className="input"
                  placeholder={`Current: ${application?.last_name || 'Not set'}`}
                  value={formData.last_name || ''}
                  onChange={(e) => handleChange('last_name', e.target.value)}
                />
                {hasChanges('last_name') && (
                  <Check className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-amber-600" />
                )}
              </div>
            </div>
            <div>
              <label className="text-[12px] font-medium text-ink-700 dark:text-ink-200">
                Email
              </label>
              <div className="relative mt-1">
                <input
                  type="email"
                  className="input"
                  placeholder={`Current: ${application?.email || 'Not set'}`}
                  value={formData.email || ''}
                  onChange={(e) => handleChange('email', e.target.value)}
                />
                {hasChanges('email') && (
                  <Check className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-amber-600" />
                )}
              </div>
            </div>
            <div>
              <label className="text-[12px] font-medium text-ink-700 dark:text-ink-200">
                Phone
              </label>
              <div className="relative mt-1">
                <input
                  type="tel"
                  className="input"
                  placeholder={`Current: ${application?.phone || 'Not set'}`}
                  value={formData.phone || ''}
                  onChange={(e) => handleChange('phone', e.target.value)}
                />
                {hasChanges('phone') && (
                  <Check className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-amber-600" />
                )}
              </div>
            </div>
          </div>
        </section>

        {/* Programme Info */}
        <section>
          <h3 className="text-[14px] font-bold text-ink-900 dark:text-white mb-4">
            Programme Selection
          </h3>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-[12px] font-medium text-ink-700 dark:text-ink-200">
                Campus ID
              </label>
              <div className="relative mt-1">
                <input
                  type="number"
                  className="input"
                  placeholder={`Current: ${(application as any)?.campus_id || 'Not set'}`}
                  value={(formData as any).campus_id || ''}
                  onChange={(e) => handleChange('campus_id' as any, parseInt(e.target.value))}
                />
                {hasChanges('campus_id') && (
                  <Check className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-amber-600" />
                )}
              </div>
            </div>
            <div>
              <label className="text-[12px] font-medium text-ink-700 dark:text-ink-200">
                Mode of Study
              </label>
              <div className="relative mt-1">
                <select
                  className="input appearance-none pr-8"
                  title={`Current: ${getModeOfStudyLabel((application as any)?.mode_of_study)}`}
                  value={(formData as any).mode_of_study || ''}
                  onChange={(e) => handleChange('mode_of_study' as any, parseInt(e.target.value))}
                >
                  <option value="" disabled>Current: {getModeOfStudyLabel((application as any)?.mode_of_study)}</option>
                  <option value={1}>Day</option>
                  <option value={2}>Evening</option>
                  <option value={3}>Weekend</option>
                  <option value={4}>Holiday</option>
                  <option value={5}>Distance Learning</option>
                </select>
                {hasChanges('mode_of_study') && (
                  <Check className="absolute right-8 top-1/2 -translate-y-1/2 w-4 h-4 text-amber-600" />
                )}
              </div>
            </div>
            <div>
              <label className="text-[12px] font-medium text-ink-700 dark:text-ink-200">
                Level ID
              </label>
              <div className="relative mt-1">
                <input
                  type="number"
                  className="input"
                  placeholder={`Current: ${(application as any)?.level_id || 'Not set'}`}
                  value={(formData as any).level_id || ''}
                  onChange={(e) => handleChange('level_id' as any, parseInt(e.target.value))}
                />
                {hasChanges('level_id') && (
                  <Check className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-amber-600" />
                )}
              </div>
            </div>
            <div>
              <label className="text-[12px] font-medium text-ink-700 dark:text-ink-200">
                Intake
              </label>
              <div className="relative mt-1">
                <input
                  type="text"
                  className="input"
                  placeholder={`Current: ${application?.intake || 'Not set'}`}
                  value={formData.intake || ''}
                  onChange={(e) => handleChange('intake', e.target.value)}
                />
                {hasChanges('intake') && (
                  <Check className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-amber-600" />
                )}
              </div>
            </div>
          </div>
        </section>

        {/* Warning */}
        <div className="p-4 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-900/40 flex items-start gap-3">
          <AlertTriangle className="w-4 h-4 text-amber-600 mt-0.5 shrink-0" />
          <div className="text-[12px] text-amber-700 dark:text-amber-300">
            <p className="font-medium">Editing will update the application immediately.</p>
            <p className="mt-1">Changes are logged and cannot be undone. Verify before saving.</p>
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center justify-end gap-3 pt-4 border-t border-ink-100 dark:border-ink-800">
          <button
            type="button"
            onClick={onClose}
            className="btn-secondary"
            disabled={updateMutation.isPending}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => updateMutation.mutate()}
            disabled={updateMutation.isPending}
            className="btn-primary"
          >
            {updateMutation.isPending ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" /> Saving...
              </>
            ) : (
              <>
                <Save className="w-4 h-4" /> Save Changes
              </>
            )}
          </button>
        </div>
      </div>
    </Modal>
  );
}
