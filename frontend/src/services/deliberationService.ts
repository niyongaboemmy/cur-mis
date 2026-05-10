import { api } from '@/services/api'

export interface DeliberationModule {
  module_id:      number
  module_code:    string
  module_name:    string
  module_credits: number | string | null
  level:          number | string | null
}

export interface DeliberationCell {
  cats_60:        number | null
  fat_40:         number | null
  total_100:      number | null
  credits_points: number | null
  grade:          string | null
  decision:       string | null
  is_exempted:    boolean
}

export interface DeliberationStudent {
  student_id:       number
  regnumber:        string
  fname:            string
  lname:            string
  sex:              string | null
  intake:           string | null
  current_level:    string | null
  std_option:       string | null
  student_program:  string | null
  program_name:     string | null
  program_acronym:  string | null
  marks:            Record<number, DeliberationCell>
}

export interface DeliberationPagination {
  page:      number
  per_page:  number
  total:     number
  last_page: number
}

export interface DeliberationResponse {
  modules:       DeliberationModule[]
  students:      DeliberationStudent[]
  academic_year: { id: number; label: string } | null
  counts:        { students: number; modules: number }
  pagination:    DeliberationPagination
}

export interface DeliberationParams {
  std_option?:       string | number
  current_level?:    string | number
  intake?:           string
  academic_year_id?: number
  page?:             number
  per_page?:         number
}

export const deliberationService = {
  grid: (params: DeliberationParams = {}, signal?: AbortSignal) =>
    api.get<DeliberationResponse>('/api/deliberation', params as Record<string, unknown>, signal),
}
