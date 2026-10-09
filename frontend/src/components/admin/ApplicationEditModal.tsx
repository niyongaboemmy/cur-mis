import { useState, useEffect } from 'react';
import { useMutation, useQueryClient, useQuery } from '@tanstack/react-query';
import { Loader2, Save } from 'lucide-react';
import toast from 'react-hot-toast';
import { applicationAdminService } from '@/services/admissionService';
import { academicsMgmtService } from '@/services/academicsMgmtService';
import Modal from '@/components/ui/Modal';
import { StudentApplication } from '@/types/admission';
import type { Faculty, Department } from '@/types/academic';

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

  const { data: facultiesData } = useQuery({
    queryKey: ['faculties'],
    queryFn: () => academicsMgmtService.list<Faculty>('faculties', { per_page: 100 }),
    enabled: open,
  });

  const { data: departmentsData } = useQuery({
    queryKey: ['departments'],
    queryFn: () => academicsMgmtService.list<Department>('departments', { per_page: 100 }),
    enabled: open,
  });

  const { data: campusesData } = useQuery({
    queryKey: ['campuses'],
    queryFn: () => academicsMgmtService.list<any>('campuses', { per_page: 100 }),
    enabled: open,
  });

  const { data: levelsData } = useQuery({
    queryKey: ['levels'],
    queryFn: () => academicsMgmtService.list<any>('levels', { per_page: 100 }),
    enabled: open,
  });

  const faculties = facultiesData?.data || [];
  const departments = departmentsData?.data || [];
  const campuses = campusesData?.data || [];
  const levels = levelsData?.data || [];

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
      return applicationAdminService.update(application.id, formData as any);
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

  if (!application) return null;

  return (
    <Modal open={open} onClose={onClose} title="Edit Application" size="lg">
      <div className="space-y-6 max-h-[70vh] overflow-y-auto">
        {/* Application Summary */}
        <section>
          <h3 className="text-[14px] font-bold text-ink-900 dark:text-white mb-4">Application Summary</h3>
          <div className="grid grid-cols-3 gap-3">
            <div className="p-3 rounded-lg bg-ink-50 dark:bg-ink-800/30 border border-ink-100 dark:border-ink-700">
              <p className="text-[11px] text-ink-500 dark:text-ink-400 uppercase tracking-wide font-medium">Application #</p>
              <p className="text-[13px] text-ink-900 dark:text-white font-medium mt-1">{application?.application_number}</p>
            </div>
            <div className="p-3 rounded-lg bg-ink-50 dark:bg-ink-800/30 border border-ink-100 dark:border-ink-700">
              <p className="text-[11px] text-ink-500 dark:text-ink-400 uppercase tracking-wide font-medium">Status</p>
              <p className="text-[13px] text-ink-900 dark:text-white font-medium mt-1">{application?.status}</p>
            </div>
            <div className="p-3 rounded-lg bg-ink-50 dark:bg-ink-800/30 border border-ink-100 dark:border-ink-700">
              <p className="text-[11px] text-ink-500 dark:text-ink-400 uppercase tracking-wide font-medium">Document Status</p>
              <p className="text-[13px] text-ink-900 dark:text-white font-medium mt-1">{application?.document_status}</p>
            </div>
          </div>
        </section>

        {/* Personal Information */}
        <section>
          <h3 className="text-[14px] font-bold text-ink-900 dark:text-white mb-4">Personal Information</h3>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-[12px] font-medium text-ink-700 dark:text-ink-200">First Name</label>
              <input
                type="text"
                className="input mt-1"
                value={(formData as any).first_name || ''}
                onChange={(e) => handleChange('first_name' as any, e.target.value)}
              />
            </div>
            <div>
              <label className="text-[12px] font-medium text-ink-700 dark:text-ink-200">Last Name</label>
              <input
                type="text"
                className="input mt-1"
                value={(formData as any).last_name || ''}
                onChange={(e) => handleChange('last_name' as any, e.target.value)}
              />
            </div>
            <div>
              <label className="text-[12px] font-medium text-ink-700 dark:text-ink-200">Email</label>
              <input
                type="email"
                className="input mt-1"
                value={(formData as any).email || ''}
                onChange={(e) => handleChange('email' as any, e.target.value)}
              />
            </div>
            <div>
              <label className="text-[12px] font-medium text-ink-700 dark:text-ink-200">Phone</label>
              <input
                type="tel"
                className="input mt-1"
                value={(formData as any).phone || ''}
                onChange={(e) => handleChange('phone' as any, e.target.value)}
              />
            </div>
            <div>
              <label className="text-[12px] font-medium text-ink-700 dark:text-ink-200">Gender</label>
              <select
                className="input appearance-none pr-8 mt-1"
                value={(formData as any).gender || ''}
                onChange={(e) => handleChange('gender' as any, e.target.value)}
              >
                <option value="">Select Gender</option>
                <option value="M">Male</option>
                <option value="F">Female</option>
                <option value="Other">Other</option>
              </select>
            </div>
            <div>
              <label className="text-[12px] font-medium text-ink-700 dark:text-ink-200">Birthdate</label>
              <input
                type="date"
                className="input mt-1"
                value={(formData as any).birthdate || ''}
                onChange={(e) => handleChange('birthdate' as any, e.target.value)}
              />
            </div>
          </div>
        </section>

        {/* Academic Information */}
        <section>
          <h3 className="text-[14px] font-bold text-ink-900 dark:text-white mb-4">Academic Information</h3>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-[12px] font-medium text-ink-700 dark:text-ink-200">Faculty</label>
              <select
                className="input appearance-none pr-8 mt-1"
                value={(formData as any).faculty_id || ''}
                onChange={(e) => handleChange('faculty_id' as any, parseInt(e.target.value) || '')}
              >
                <option value="">Select Faculty</option>
                {faculties.map((faculty: Faculty) => (
                  <option key={faculty.fac_id} value={faculty.fac_id}>
                    {faculty.fac_name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-[12px] font-medium text-ink-700 dark:text-ink-200">Department</label>
              <select
                className="input appearance-none pr-8 mt-1"
                value={(formData as any).department_id || ''}
                onChange={(e) => handleChange('department_id' as any, parseInt(e.target.value) || '')}
              >
                <option value="">Select Department</option>
                {departments.map((department: Department) => (
                  <option key={department.dep_id} value={department.dep_id}>
                    {department.dep_name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-[12px] font-medium text-ink-700 dark:text-ink-200">Intake</label>
              <input
                type="text"
                className="input mt-1"
                value={(formData as any).intake || ''}
                onChange={(e) => handleChange('intake' as any, e.target.value)}
              />
            </div>
            <div>
              <label className="text-[12px] font-medium text-ink-700 dark:text-ink-200">Previous School</label>
              <input
                type="text"
                className="input mt-1"
                value={(formData as any).prev_school || ''}
                onChange={(e) => handleChange('prev_school' as any, e.target.value)}
              />
            </div>
            <div>
              <label className="text-[12px] font-medium text-ink-700 dark:text-ink-200">Previous Qualification</label>
              <input
                type="text"
                className="input mt-1"
                value={(formData as any).prev_qualification || ''}
                onChange={(e) => handleChange('prev_qualification' as any, e.target.value)}
              />
            </div>
            <div>
              <label className="text-[12px] font-medium text-ink-700 dark:text-ink-200">Previous Grade</label>
              <input
                type="text"
                className="input mt-1"
                value={(formData as any).prev_grade || ''}
                onChange={(e) => handleChange('prev_grade' as any, e.target.value)}
              />
            </div>
            <div>
              <label className="text-[12px] font-medium text-ink-700 dark:text-ink-200">Combination (A-level)</label>
              <input
                type="text"
                className="input mt-1"
                value={(formData as any).combination || ''}
                onChange={(e) => handleChange('combination' as any, e.target.value)}
              />
            </div>
            <div>
              <label className="text-[12px] font-medium text-ink-700 dark:text-ink-200">Graduation Year</label>
              <input
                type="number"
                className="input mt-1"
                value={(formData as any).graduation_year || ''}
                onChange={(e) => handleChange('graduation_year' as any, parseInt(e.target.value) || '')}
              />
            </div>
            <div>
              <label className="text-[12px] font-medium text-ink-700 dark:text-ink-200">Sponsorship</label>
              <select
                className="input appearance-none pr-8 mt-1"
                value={(formData as any).sponsorship || ''}
                onChange={(e) => handleChange('sponsorship' as any, e.target.value)}
              >
                <option value="">Select Sponsorship</option>
                <option value="government">Government</option>
                <option value="self">Self</option>
                <option value="private">Private</option>
                <option value="scholarship">Scholarship</option>
              </select>
            </div>
            <div>
              <label className="text-[12px] font-medium text-ink-700 dark:text-ink-200">Sponsor Name</label>
              <input
                type="text"
                className="input mt-1"
                value={(formData as any).sponsor_name || ''}
                onChange={(e) => handleChange('sponsor_name' as any, e.target.value)}
              />
            </div>
          </div>
        </section>

        {/* Programme Selection */}
        <section>
          <h3 className="text-[14px] font-bold text-ink-900 dark:text-white mb-4">Programme Selection</h3>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-[12px] font-medium text-ink-700 dark:text-ink-200">Campus</label>
              <select
                className="input appearance-none pr-8 mt-1"
                value={(formData as any).campus_id || ''}
                onChange={(e) => handleChange('campus_id' as any, parseInt(e.target.value) || '')}
              >
                <option value="">Select Campus</option>
                {campuses.map((campus: any) => (
                  <option key={campus.id || campus.campus_id} value={campus.id || campus.campus_id}>
                    {campus.name || campus.campus_name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-[12px] font-medium text-ink-700 dark:text-ink-200">Level</label>
              <select
                className="input appearance-none pr-8 mt-1"
                value={(formData as any).level_id || ''}
                onChange={(e) => handleChange('level_id' as any, parseInt(e.target.value) || '')}
              >
                <option value="">Select Level</option>
                {levels.map((level: any) => (
                  <option key={level.id} value={level.id}>
                    {level.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-[12px] font-medium text-ink-700 dark:text-ink-200">Mode of Study</label>
              <select
                className="input appearance-none pr-8 mt-1"
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
            </div>
          </div>
        </section>

        {/* Address Information */}
        <section>
          <h3 className="text-[14px] font-bold text-ink-900 dark:text-white mb-4">Address Information</h3>
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <label className="text-[12px] font-medium text-ink-700 dark:text-ink-200">Address</label>
              <input
                type="text"
                className="input mt-1"
                value={(formData as any).address || ''}
                onChange={(e) => handleChange('address' as any, e.target.value)}
              />
            </div>
            <div>
              <label className="text-[12px] font-medium text-ink-700 dark:text-ink-200">Nationality</label>
              <input
                type="text"
                className="input mt-1"
                value={(formData as any).nationality || ''}
                onChange={(e) => handleChange('nationality' as any, e.target.value)}
              />
            </div>
            <div>
              <label className="text-[12px] font-medium text-ink-700 dark:text-ink-200">Country of Residence</label>
              <input
                type="text"
                className="input mt-1"
                value={(formData as any).country_of_residence || ''}
                onChange={(e) => handleChange('country_of_residence' as any, e.target.value)}
              />
            </div>
          </div>
        </section>

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
