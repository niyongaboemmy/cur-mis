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
              <input
                type="text"
                className="input mt-1"
                value={formData.first_name || ''}
                onChange={(e) => handleChange('first_name', e.target.value)}
              />
              <div className="flex items-center gap-1 mt-1">
                <span className="text-[11px] text-ink-500">Current:</span>
                <span className={`text-[11px] font-medium ${hasChanges('first_name') ? 'text-amber-600 dark:text-amber-400' : 'text-ink-600 dark:text-ink-400'}`}>
                  {application?.first_name || '—'}
                </span>
                {hasChanges('first_name') && <Check className="w-3 h-3 text-amber-600" />}
              </div>
            </div>
            <div>
              <label className="text-[12px] font-medium text-ink-700 dark:text-ink-200">
                Last Name
              </label>
              <input
                type="text"
                className="input mt-1"
                value={formData.last_name || ''}
                onChange={(e) => handleChange('last_name', e.target.value)}
              />
              <div className="flex items-center gap-1 mt-1">
                <span className="text-[11px] text-ink-500">Current:</span>
                <span className={`text-[11px] font-medium ${hasChanges('last_name') ? 'text-amber-600 dark:text-amber-400' : 'text-ink-600 dark:text-ink-400'}`}>
                  {application?.last_name || '—'}
                </span>
                {hasChanges('last_name') && <Check className="w-3 h-3 text-amber-600" />}
              </div>
            </div>
            <div>
              <label className="text-[12px] font-medium text-ink-700 dark:text-ink-200">
                Email
              </label>
              <input
                type="email"
                className="input mt-1"
                value={formData.email || ''}
                onChange={(e) => handleChange('email', e.target.value)}
              />
              <div className="flex items-center gap-1 mt-1">
                <span className="text-[11px] text-ink-500">Current:</span>
                <span className={`text-[11px] font-medium ${hasChanges('email') ? 'text-amber-600 dark:text-amber-400' : 'text-ink-600 dark:text-ink-400'}`}>
                  {application?.email || '—'}
                </span>
                {hasChanges('email') && <Check className="w-3 h-3 text-amber-600" />}
              </div>
            </div>
            <div>
              <label className="text-[12px] font-medium text-ink-700 dark:text-ink-200">
                Phone
              </label>
              <input
                type="tel"
                className="input mt-1"
                value={formData.phone || ''}
                onChange={(e) => handleChange('phone', e.target.value)}
              />
              <div className="flex items-center gap-1 mt-1">
                <span className="text-[11px] text-ink-500">Current:</span>
                <span className={`text-[11px] font-medium ${hasChanges('phone') ? 'text-amber-600 dark:text-amber-400' : 'text-ink-600 dark:text-ink-400'}`}>
                  {application?.phone || '—'}
                </span>
                {hasChanges('phone') && <Check className="w-3 h-3 text-amber-600" />}
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
              <input
                type="number"
                className="input mt-1"
                value={(formData as any).campus_id || ''}
                onChange={(e) => handleChange('campus_id' as any, parseInt(e.target.value))}
              />
              <div className="flex items-center gap-1 mt-1">
                <span className="text-[11px] text-ink-500">Current:</span>
                <span className={`text-[11px] font-medium ${hasChanges('campus_id') ? 'text-amber-600 dark:text-amber-400' : 'text-ink-600 dark:text-ink-400'}`}>
                  {(application as any)?.campus_id || '—'}
                </span>
                {hasChanges('campus_id') && <Check className="w-3 h-3 text-amber-600" />}
              </div>
            </div>
            <div>
              <label className="text-[12px] font-medium text-ink-700 dark:text-ink-200">
                Mode of Study ID
              </label>
              <select
                className="input mt-1"
                value={(formData as any).mode_of_study || ''}
                onChange={(e) => handleChange('mode_of_study' as any, parseInt(e.target.value))}
              >
                <option value="">Select Mode</option>
                <option value={1}>Day</option>
                <option value={2}>Evening</option>
                <option value={3}>Weekend</option>
                <option value={4}>Holiday</option>
                <option value={5}>Distance Learning</option>
              </select>
              <div className="flex items-center gap-1 mt-1">
                <span className="text-[11px] text-ink-500">Current:</span>
                <span className={`text-[11px] font-medium ${hasChanges('mode_of_study') ? 'text-amber-600 dark:text-amber-400' : 'text-ink-600 dark:text-ink-400'}`}>
                  {getModeOfStudyLabel((application as any)?.mode_of_study)}
                </span>
                {hasChanges('mode_of_study') && <Check className="w-3 h-3 text-amber-600" />}
              </div>
            </div>
            <div>
              <label className="text-[12px] font-medium text-ink-700 dark:text-ink-200">
                Level ID
              </label>
              <input
                type="number"
                className="input mt-1"
                value={(formData as any).level_id || ''}
                onChange={(e) => handleChange('level_id' as any, parseInt(e.target.value))}
              />
              <div className="flex items-center gap-1 mt-1">
                <span className="text-[11px] text-ink-500">Current:</span>
                <span className={`text-[11px] font-medium ${hasChanges('level_id') ? 'text-amber-600 dark:text-amber-400' : 'text-ink-600 dark:text-ink-400'}`}>
                  {(application as any)?.level_id || '—'}
                </span>
                {hasChanges('level_id') && <Check className="w-3 h-3 text-amber-600" />}
              </div>
            </div>
            <div>
              <label className="text-[12px] font-medium text-ink-700 dark:text-ink-200">
                Intake
              </label>
              <input
                type="text"
                className="input mt-1"
                value={formData.intake || ''}
                onChange={(e) => handleChange('intake', e.target.value)}
              />
              <div className="flex items-center gap-1 mt-1">
                <span className="text-[11px] text-ink-500">Current:</span>
                <span className={`text-[11px] font-medium ${hasChanges('intake') ? 'text-amber-600 dark:text-amber-400' : 'text-ink-600 dark:text-ink-400'}`}>
                  {application?.intake || '—'}
                </span>
                {hasChanges('intake') && <Check className="w-3 h-3 text-amber-600" />}
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
