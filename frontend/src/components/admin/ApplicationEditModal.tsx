import { useState, useEffect } from 'react';
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

  useEffect(() => {
    if (application) {
      setFormData({ ...application });
    }
  }, [application, open]);

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

  const hasChanges = (field: string) => {
    return formData[field as keyof StudentApplication] !== application?.[field];
  };

  const InputField = ({ label, field, type = 'text' }: any) => (
    <div>
      <label className="text-[12px] font-medium text-ink-700 dark:text-ink-200">{label}</label>
      <div className="relative mt-1">
        <input
          type={type}
          className="input"
          value={(formData as any)[field] || ''}
          onChange={(e) => handleChange(field as keyof StudentApplication, type === 'number' ? parseInt(e.target.value) || '' : e.target.value)}
        />
        {hasChanges(field) && (
          <Check className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-amber-600" />
        )}
      </div>
    </div>
  );

  const DisplayField = ({ label, value }: any) => (
    <div className="p-3 rounded-lg bg-ink-50 dark:bg-ink-800/30 border border-ink-100 dark:border-ink-700">
      <p className="text-[11px] text-ink-500 dark:text-ink-400 uppercase tracking-wide font-medium">{label}</p>
      <p className="text-[13px] text-ink-900 dark:text-white font-medium mt-1">{value || '—'}</p>
    </div>
  );

  if (!application) return null;

  return (
    <Modal open={open} onClose={onClose} title="Edit Application" size="xl">
      <div className="space-y-6 max-h-[70vh] overflow-y-auto">
        {/* Application Summary */}
        <section>
          <h3 className="text-[14px] font-bold text-ink-900 dark:text-white mb-4">Application Summary</h3>
          <div className="grid grid-cols-3 gap-3">
            <DisplayField label="Application #" value={application?.application_number} />
            <DisplayField label="Status" value={application?.status} />
            <DisplayField label="Document Status" value={application?.document_status} />
          </div>
        </section>

        {/* Personal Information */}
        <section>
          <h3 className="text-[14px] font-bold text-ink-900 dark:text-white mb-4">Personal Information</h3>
          <div className="grid grid-cols-2 gap-4">
            <InputField label="First Name" field="first_name" />
            <InputField label="Last Name" field="last_name" />
            <InputField label="Email" field="email" type="email" />
            <InputField label="Phone" field="phone" type="tel" />
            <DisplayField label="Gender" value={application?.gender} />
            <DisplayField label="Birthdate" value={application?.birthdate} />
          </div>
        </section>

        {/* Academic Information */}
        <section>
          <h3 className="text-[14px] font-bold text-ink-900 dark:text-white mb-4">Academic Information</h3>
          <div className="grid grid-cols-2 gap-4">
            <DisplayField label="Faculty" value={application?.faculty_name} />
            <DisplayField label="Department" value={application?.department_name} />
            <DisplayField label="Program" value={application?.program_name} />
            <DisplayField label="Academic Year" value={application?.academic_year} />
            <InputField label="Intake" field="intake" />
            <DisplayField label="Previous School" value={application?.prev_school} />
            <DisplayField label="Previous Qualification" value={application?.prev_qualification} />
            <DisplayField label="Previous Grade" value={application?.prev_grade} />
          </div>
        </section>

        {/* Programme Selection (Editable) */}
        <section>
          <h3 className="text-[14px] font-bold text-ink-900 dark:text-white mb-4">Programme Selection</h3>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-[12px] font-medium text-ink-700 dark:text-ink-200">Campus</label>
              <div className="relative mt-1">
                <input
                  type="number"
                  className="input"
                  placeholder={application?.campus_name || 'Campus ID'}
                  value={(formData as any).campus_id || ''}
                  onChange={(e) => handleChange('campus_id' as any, parseInt(e.target.value) || '')}
                />
                {hasChanges('campus_id') && (
                  <Check className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-amber-600" />
                )}
              </div>
              <p className="text-[11px] text-ink-500 dark:text-ink-400 mt-1">Current: {application?.campus_name}</p>
            </div>
            <div>
              <label className="text-[12px] font-medium text-ink-700 dark:text-ink-200">Mode of Study</label>
              <div className="relative mt-1">
                <select
                  className="input appearance-none pr-8"
                  value={(formData as any).mode_of_study || ''}
                  onChange={(e) => handleChange('mode_of_study' as any, parseInt(e.target.value) || '')}
                >
                  <option value="">Select Mode</option>
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
              <p className="text-[11px] text-ink-500 dark:text-ink-400 mt-1">Current: {application?.mode_of_study_name}</p>
            </div>
            <div>
              <label className="text-[12px] font-medium text-ink-700 dark:text-ink-200">Level</label>
              <div className="relative mt-1">
                <input
                  type="number"
                  className="input"
                  placeholder={application?.level_name || 'Level ID'}
                  value={(formData as any).level_id || ''}
                  onChange={(e) => handleChange('level_id' as any, parseInt(e.target.value) || '')}
                />
                {hasChanges('level_id') && (
                  <Check className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-amber-600" />
                )}
              </div>
              <p className="text-[11px] text-ink-500 dark:text-ink-400 mt-1">Current: {application?.level_name}</p>
            </div>
            <DisplayField label="Sponsorship" value={application?.sponsorship} />
          </div>
        </section>

        {/* Address Information */}
        <section>
          <h3 className="text-[14px] font-bold text-ink-900 dark:text-white mb-4">Address Information</h3>
          <div className="grid grid-cols-2 gap-4">
            <DisplayField label="Address" value={application?.address} />
            <DisplayField label="Nationality" value={application?.nationality} />
          </div>
        </section>

        {/* Warning */}
        <div className="p-4 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-900/40 flex items-start gap-3">
          <AlertTriangle className="w-4 h-4 text-amber-600 mt-0.5 shrink-0" />
          <div className="text-[12px] text-amber-700 dark:text-amber-300">
            <p className="font-medium"></p>
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center justify-end gap-3 pt-4 border-t border-ink-100 dark:border-ink-800 sticky bottom-0 bg-white dark:bg-ink-900">
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
