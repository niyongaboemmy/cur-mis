/* Types for the Modules Management module. Mirror the backend schema
 * so the TS compiler catches drift between API and UI. */

export interface ModulePrereqRef {
  id:          number
  module_code: string
  module_name: string
}

export interface Module {
  module_id:      number
  module_name:    string
  module_code:    string
  module_credits: number | string
  department:     number | null
  d_option?:      number | null
  level:          number
  hours?:         number | null
  price?:         number | null
  school_id?:     number | null
  learning_mode?: 'day' | 'evening' | 'weekend' | 'holiday'
  description?:   string | null
  status:         'draft' | 'active' | 'archived'
  prerequisites?: ModulePrereqRef[]
  [k: string]:    unknown
}

export interface ModuleScheduleRow {
  id:                   number
  module_id:            number
  module_assignment_id: number | null
  academic_term_id:     number
  room_id:              number
  day_of_week:          number
  start_time:           string
  end_time:             string
  start_date?:          string | null   // YYYY-MM-DD — null means runs full term
  end_date?:            string | null
  session_type:         'lecture' | 'lab' | 'tutorial' | 'seminar' | 'exam'
  notes?:               string | null
  // joined
  module_code?:         string
  module_name?:         string
  room_name?:           string
  staff_id?:            number | null
  staff_name?:          string | null
}

export interface ScheduleConflict {
  type:          'room' | 'faculty'
  conflict_with: ModuleScheduleRow
}

export interface ModuleAssignment {
  id:                number
  module_id:         number
  staff_id:          number
  academic_year_id:  number
  academic_term_id:  number
  role:              'primary' | 'assistant'
  hours_per_week:    number | string
  notes?:            string | null
  // joined
  module_code?:      string
  module_name?:      string
  staff_name?:       string
  staff_email?:      string
  year_label?:       string
  term_label?:       string
}

export interface WorkloadRow {
  staff_id:     number
  staff_name:   string
  module_count: number
  total_hours:  number | string
}

export interface ModuleRegistration {
  id:                number
  module_id:         number
  student_regnumber: string
  academic_term_id:  number
  status:            'registered' | 'dropped' | 'completed' | 'failed'
  grade?:            string | null
  registered_at?:    string
  dropped_at?:       string | null
  // joined
  module_code?:           string
  module_name?:           string
  module_credits?:        number
  student_id?:            number | null
  student_fname?:         string
  student_lname?:         string
  student_std_option?:    string | null
  student_current_level?: string | null
  student_intake?:        string | null
  student_program_name?:  string | null
  student_program_code?:  string | null
  term_label?:            string
}

export interface CreateModulePayload {
  module_name:      string
  module_code:      string
  module_credits:   number
  department:       number
  level:            number
  description?:     string
  status?:          'draft' | 'active' | 'archived'
  d_option?:        number | null
  hours?:           number | null
  price?:           number | null
  school_id?:       number | null
  learning_mode?:   'day' | 'evening' | 'weekend' | 'holiday'
  prerequisite_ids?: number[]
}

export interface SchedulePayload {
  module_id:            number
  academic_term_id:     number
  room_id:              number
  day_of_week:          number
  start_time:           string
  end_time:             string
  start_date?:          string | null
  end_date?:            string | null
  session_type?:        ModuleScheduleRow['session_type']
  module_assignment_id?: number | null
  notes?:               string | null
  ignore_id?:           number
}

export interface AssignmentPayload {
  module_id:        number
  staff_id:         number
  academic_term_id: number
  role?:            'primary' | 'assistant'
  hours_per_week?:  number
  notes?:           string
}

export interface RegistrationPayload {
  module_id:         number
  student_regnumber: string
  academic_term_id:  number
  status?:           ModuleRegistration['status']
  grade?:            string
  force?:            boolean
}

export interface SelfRegisterPayload {
  module_id:        number
  academic_term_id: number
}
