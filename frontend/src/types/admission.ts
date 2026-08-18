/** Types for the Student Management / Admissions module. */

export interface Faculty {
  id:           number
  name:         string
  code:         string
  description?: string
  school_id?:   number
  school_name?: string
}

export interface PortalDepartment {
  id:          number
  name:        string
  code:        string
  description?: string
  fac_id?:     number
}

export interface DocumentType {
  id:          number
  name:        string
  slug:        string
  description?: string
  allowed_extensions?: string
  is_active?:  0 | 1
  sort_order?: number
  created_at?: string
  updated_at?: string
}

export interface AdmissionRequirement {
  id:                 number
  faculty_id:         number
  document_type_id:   number
  is_required:        boolean
  notes?:             string | null
  sort_order?:        number
  created_at?:        string
  /** Enriched fields some endpoints return */
  document_type_name?:   string
  document_type_slug?:   string
  document_type_active?: 0 | 1
  document_name?:        string
  document_slug?:        string
  faculty_name?:         string
  allowed_extensions?:   string
}

export enum ApplicationStatus {
  DRAFT = 'draft',
  SUBMITTED = 'submitted',
  DOCUMENTS_UNDER_REVIEW = 'documents_under_review',
  DOCUMENTS_VERIFIED = 'documents_verified',
  DOCUMENTS_REJECTED = 'documents_rejected',
  REQUESTED_CHANGES = 'requested_changes',
  MERIT_LISTED = 'merit_listed',
  OFFERED = 'offered',
  OFFER_ACCEPTED = 'offer_accepted',
  OFFER_DECLINED = 'offer_declined',
  ENROLLED = 'enrolled',
  WITHDRAWN = 'withdrawn',
}

export enum VerificationStatus {
  PENDING = 'pending',
  VERIFIED = 'verified',
  REJECTED = 'rejected',
}

export type DocStatus = 'incomplete' | 'under_review' | 'verified' | 'rejected'

export interface StudentApplication {
  id:                 number
  application_number: string

  academic_year_id:   number
  faculty_id:         number
  department_id:      number
  intake:             string

  first_name:         string
  last_name:          string
  father?:            string | null
  mother?:            string | null
  email:              string
  phone:              string
  reference_phone?:   string | null
  gender:             'M' | 'F' | 'Other'
  birthdate:          string
  marital_status?:    'single' | 'married' | 'divorced' | 'widowed' | 'other' | null
  nationality:        string
  country_of_residence?: string | null
  national_id?:       string | null
  disability?:        string | null
  address?:           string | null
  province?:          string | null
  district?:          string | null
  sector?:            string | null
  residence_district?: string | null

  prev_school:        string
  prev_qualification: string
  prev_grade:         string
  combination?:       string | null
  graduation_year:    number
  a2_grades?:         string | null
  principal_passes?:  number | null
  serial_number?:     string | null

  program_id?:        number | null
  campus_id?:         number | null
  mode_of_study?:     string | null
  level_id?:          number | null

  transaction_id?:       string | null
  payment_slip_file_id?: string | null
  payment_slip_mime?:    string | null
  payment_amount?:       number | null
  payment_currency?:     string | null
  paid_at?:              string | null

  sponsorship:        'government' | 'self' | 'private' | 'scholarship'
  sponsor_name?:      string | null

  status:             ApplicationStatus
  document_status:    DocStatus
  email_verified:     0 | 1
  verification_code?: string | null
  merit_score?:       number | null
  merit_rank?:        number | null

  submitted_at?:      string | null
  reviewed_by?:       number | null
  reviewed_at?:       string | null
  internal_notes?:    string | null
  rejection_reason?:  string | null

  created_at:         string
  updated_at:         string

  /* Enrichments from server */
  department_name?:  string
  faculty_name?:     string
  academic_year_label?: string
  student_id?:       number | null
  offer_letter_reference?: string | null
  program_name?:     string | null
  campus_name?:      string | null
  campus_code?:      string | null
  campus_location?:  string | null
  level_name?:       string | null
}

export interface ApplicationDocument {
  /** null for a faculty requirement the applicant has not uploaded yet */
  id:                    number | null
  applicant_profile_id:  number
  application_id?:       number | null
  document_type_id:      number
  file_server_id?:       string | null
  file_original_name?:   string | null
  file_size?:            number | null
  file_mime?:            string | null
  verification_status:   VerificationStatus
  verified_by?:          number | null
  verified_at?:          string | null
  verification_comment?:      string | null
  uploaded_at?:          string
  /* Enriched */
  document_type_name?:   string
  document_type_slug?:   string
  type_name?:            string
  type_slug?:            string
  verifier_name?:       string
  usage?:                string[]
  /* Requirement checklist fields (admin application detail) */
  is_requirement?:       boolean
  is_required?:          number
  is_uploaded?:          boolean
  requirement_notes?:    string | null
  type_description?:     string | null
  allowed_extensions?:   string | null
}

export interface ApplicationStatusLog {
  id:             number
  application_id: number
  from_status:    string | null
  to_status:      string
  actor_id?:      number | null
  actor_type:     'applicant' | 'admin' | 'system'
  notes?:         string | null
  created_at:     string
}

export interface ApplicationPendingNote {
  id:                number
  application_id:    number
  note:              string
  created_by:        number | null
  created_by_name:   string | null
  created_by_email?: string | null
  created_at:        string
}

export interface MeritCriteria {
  id?:                    number
  department_id:          number
  intake:                 string
  academic_year_id:       number
  grade_weight:           number
  combination_weight:     number
  other_weight:           number
  min_grade?:             string | null
  required_combinations?: string | null  // JSON array as string
  cutoff_score?:          number | null
  max_capacity?:          number | null
  algorithm_type:         'merit_based' | 'first_come_first_served' | 'manual'
  is_published?:          0 | 1
}

export interface MeritListRow {
  id:               number
  application_id:   number
  application_number: string
  applicant_name:   string
  merit_score:      number
  rank:             number
  is_qualified:     0 | 1
  generated_at:     string
}

export interface AdmissionOffer {
  id:                     number
  application_id:         number
  offer_letter_reference: string
  offered_at:             string
  offered_by?:            number | null
  expires_at:             string
  status:                 'pending' | 'accepted' | 'declined' | 'expired'
  responded_at?:          string | null
  response_notes?:        string | null
  enrollment_initiated:   0 | 1
  student_id?:            number | null
  enrolled_at?:           string | null
  /* Enriched */
  applicant_name?:        string
  first_name:             string
  last_name:              string
  email:                  string
  phone?:                 string
  department_name:        string
  department_code?:       string
  application_number:     string
  application_status?:    string
  intake?:                string
}

/* ── Applicant self-service ──────────────────────────────────────── */

export interface ApplicantProfile {
  id:                        number
  user_id:                   number
  application_id:            number
  middle_name?:              string | null
  id_type?:                  'national_id' | 'passport' | 'birth_certificate' | null
  id_number?:                string | null
  province?:                 string | null
  district?:                 string | null
  sector?:                   string | null
  emergency_contact_name?:   string | null
  emergency_contact_phone?:  string | null
  profile_photo_id?:         string | null
  profile_photo_url?:        string | null
  created_at?:               string
  updated_at?:               string
}

export interface AcademicRecord {
  id:                    number
  applicant_profile_id:  number
  document_id?:          number | null
  institution_name:      string
  qualification:         string
  grade:                 string
  combination?:          string | null
  year_completed:        number
  is_primary:            0 | 1
  created_at?:           string
  /* Joined fields */
  file_original_name?:   string | null
  file_server_id?:       string | null
  doc_status?:           string | null
}
