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
  academic_year_id:   number
  document_type_id:   number
  is_required:        boolean
  notes?:             string | null
  sort_order?:        number
  created_at?:        string
  /** Enriched fields some endpoints return */
  document_type_name?: string
  document_type_slug?: string
  document_name?:      string
  document_slug?:      string
  faculty_name?:      string
  allowed_extensions?: string
}

export type ApplicationStatus =
  | 'draft'
  | 'submitted'
  | 'documents_under_review'
  | 'documents_verified'
  | 'documents_rejected'
  | 'merit_listed'
  | 'offered'
  | 'offer_accepted'
  | 'offer_declined'
  | 'enrolled'
  | 'withdrawn'

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
  email:              string
  phone:              string
  gender:             'M' | 'F' | 'Other'
  birthdate:          string
  nationality:        string
  address?:           string | null

  prev_school:        string
  prev_qualification: string
  prev_grade:         string
  combination?:       string | null
  graduation_year:    number

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
}

export interface ApplicationDocument {
  id:                    number
  application_id:        number
  document_type_id:      number
  file_server_id?:       string | null
  file_original_name?:   string | null
  file_size?:            number | null
  file_mime?:            string | null
  verification_status:   'pending' | 'verified' | 'rejected'
  verified_by?:          number | null
  verified_at?:          string | null
  rejection_notes?:      string | null
  uploaded_at?:          string
  /* Enriched */
  document_type_name?:   string
  document_type_slug?:   string
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
  department_name?:       string
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
  institution_name:      string
  qualification:         string
  grade:                 string
  combination?:          string | null
  year_completed:        number
  is_primary:            0 | 1
  created_at?:           string
}
