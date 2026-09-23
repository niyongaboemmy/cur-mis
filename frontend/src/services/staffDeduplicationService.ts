import { api } from './api';

export interface StaffMember {
  employee_id: number;
  user_id: number | null;
  employee_fname: string;
  employee_lname: string;
  employee_gender: string;
  employee_phone: string;
  employee_post: string;
  employee_position: string;
  employee_status: string;
  [key: string]: any;
}

export interface DedupedStaff {
  full_name: string;
  primary_record: StaffMember;
  duplicate_records: StaffMember[];
  total_records: number;
}

export const staffDeduplicationService = {
  // Deduplicate staff by full name
  deduplicateByName: (staff: StaffMember[]): DedupedStaff[] => {
    const grouped = new Map<string, StaffMember[]>();

    // Group by full name (case-insensitive)
    staff.forEach((member) => {
      const fullName = `${member.employee_fname || ''} ${member.employee_lname || ''}`.trim().toLowerCase();
      if (fullName) {
        if (!grouped.has(fullName)) {
          grouped.set(fullName, []);
        }
        grouped.get(fullName)!.push(member);
      }
    });

    // Create deduped list with primary record + duplicates
    const deduped: DedupedStaff[] = Array.from(grouped.entries()).map(
      ([fullName, records]) => {
        // Primary record: prefer active status, then most complete data
        const primaryRecord = records.reduce((best, current) => {
          const currentScore =
            (current.employee_status === 'Active' ? 10 : 0) +
            (current.user_id !== null ? 5 : 0) +
            (current.employee_phone ? 3 : 0) +
            (current.employee_gender ? 2 : 0);

          const bestScore =
            (best.employee_status === 'Active' ? 10 : 0) +
            (best.user_id !== null ? 5 : 0) +
            (best.employee_phone ? 3 : 0) +
            (best.employee_gender ? 2 : 0);

          return currentScore >= bestScore ? current : best;
        });

        return {
          full_name: fullName,
          primary_record: primaryRecord,
          duplicate_records: records.filter((r) => r.employee_id !== primaryRecord.employee_id),
          total_records: records.length,
        };
      }
    );

    return deduped.sort((a, b) => a.full_name.localeCompare(b.full_name));
  },

  // Get all staff with deduplication applied
  getAllStaffDeduped: async (filters?: any) => {
    const res = await api.get('/api/hr/staff', { params: filters });
    const staff = (res as any).data?.data || (res as any).data || [];
    return staffDeduplicationService.deduplicateByName(staff);
  },

  // Get single staff with all duplicate records
  getStaffWithDuplicates: async (fullName: string) => {
    const res = await api.get('/api/hr/staff', { params: { search: fullName } });
    const staff = (res as any).data?.data || (res as any).data || [];
    const deduped = staffDeduplicationService.deduplicateByName(staff);
    return deduped.find((d) => d.full_name === fullName.toLowerCase());
  },
};
