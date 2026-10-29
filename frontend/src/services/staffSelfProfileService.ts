import { api } from '@/services/api'

export interface StaffExperience {
  organisation: string | null
  role: string | null
  start_year: string | null
  end_year: string | null
  details: string | null
}

export interface StaffReferee {
  name: string | null
  position: string | null
  organisation: string | null
  phone: string | null
  email: string | null
}

export interface StaffProfileFields {
  first_name: string | null
  last_name: string | null
  father_name: string | null
  mother_name: string | null
  gender: string | null
  disability_status: 'No' | 'Yes'
  disability_category: string | null
  age: string | null
  national_id_type: 'NATIONAL_ID' | 'PASSPORT'
  national_id_number: string | null
  place_of_birth: string | null
  address: string | null
  phone: string | null
  secondary_phone: string | null
  personal_email: string | null
  work_email: string | null
  nationality: string | null
  rssb_number: string | null
  bank_name: string | null
  bank_account: string | null
  post: string | null
  position: string | null
  academic_rank: string | null
  institution_name: string | null
  faculty: string | null
  department_name: string | null
  program_name: string | null
  highest_qualification: string | null
  area_specialization: string | null
  university: string | null
  university_country: string | null
  experience: StaffExperience[]
  referees: StaffReferee[]
}

export interface StaffDocument {
  id: number
  doc_type: string
  original_name: string | null
  mime: string | null
  file_size: number | null
  uploaded_at: string
}

export interface StaffProfileData {
  employee_id: number
  fields: StaffProfileFields
  contract_status: string | null
  documents: StaffDocument[]
  document_types: string[]
  required_documents: string[]
  missing_required_documents: string[]
}

export const staffSelfProfileService = {
  get: () => api.get<StaffProfileData>('/me/staff-profile'),

  save: (fields: StaffProfileFields) => api.put<StaffProfileData>('/me/staff-profile', fields),

  uploadDocument: (docType: string, file: File) => {
    const form = new FormData()
    form.append('doc_type', docType)
    form.append('document', file)
    return api.upload<StaffProfileData>('/me/staff-profile/documents', form)
  },
}
