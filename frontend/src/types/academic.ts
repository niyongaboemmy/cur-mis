/** Types for Academic Settings + Academics Management + System Basics. */

export interface AcademicYear {
  id:          number
  label:       string
  start_date:  string | null
  end_date:    string | null
  is_current:  0 | 1
  created_at?: string
}

export interface AcademicTerm {
  id:                number
  academic_year_id:  number
  label:             string
  start_date:        string | null
  end_date:          string | null
  is_current:        0 | 1
  created_at?:       string
  updated_at?:       string
}

export interface SystemBasics {
  active_year:  AcademicYear | false | null
  active_term:  AcademicTerm | false | null
  years:        AcademicYear[]
  terms?:       AcademicTerm[]
}

/* ── Academics Management entities (heterogeneous shapes) ────────── */

export interface Degree {
  id:              number
  department_id?:  number | null
  code:            string
  name:            string
  degree_type?:    string
  duration_years?: number
  total_credits?:  number
  is_active?:      0 | 1
  created_at?:     string
}

export interface School {
  school_id:        number
  school_name:      string
  school_descript?: string
  school_logo?:     string
  school_banner?:   string
  school_address?:  string
  school_phone?:    string
  school_email?:    string
  [k: string]:      unknown
}

export interface Department {
  dep_id:          number
  dep_name:        string
  dep_acronym?:    string
  dep_description?: string
  [k: string]:     unknown
}

export interface ModuleItem {
  module_id:       number
  module_name:     string
  module_code:     string
  module_credits?: number
  department?:     number
  level?:          number
  hours?:          number
  school_id?:      number
  [k: string]:     unknown
}

export interface Facility {
  id:         number
  name:       string
  building?:  string
  capacity?:  number
  room_type?: string
  is_active?: 0 | 1
}

export interface Option {
  id:             number
  department_id?: number
  name:           string
  is_active?:     0 | 1
}

export interface Level {
  id:   number
  name: string
}

export interface LeaveType {
  id:            number
  name:          string
  days_allowed?: number
  is_paid?:      0 | 1
}

/** Tagged union of entity names used by /api/academics-management/:entity */
export type AcMgmtEntity =
  | 'degrees'
  | 'schools'
  | 'departments'
  | 'modules'
  | 'facility'
  | 'options'
  | 'levels'
  | 'leave_types'

export interface AcMgmtEntityMeta {
  slug:       AcMgmtEntity
  label:      string
  singular:   string
  pkField:    string
  titleField: string
  subField?:  string
}

/* ── People ──────────────────────────────────────────────────────── */

export interface Student {
  id:                  number
  regnumber?:          string | null
  index_file?:         string | null
  index_number?:       string | null
  fname:               string
  lname:               string
  father?:             string | null
  mother?:             string | null
  phone?:              string | null
  email?:              string | null
  gender?:             string | null
  birthdate?:          string | null
  id_card?:            string | null
  photo?:              string | null
  nationality?:        string | null
  [k: string]:         unknown
}

export interface HrEmployee {
  id:             number
  emp_code:       string
  staff_id?:      string | null
  full_name:      string
  gender?:        'M' | 'F' | string | null
  department?:    string
  position?:      string
  contract_type?: string
  start_date?:    string | null
  end_date?:      string | null
  salary?:        string | number | null
  phone?:         string | null
  email?:         string | null
  status?:        string
  created_at?:    string
}
