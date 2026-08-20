import { api } from '@/services/api'

export interface TimetableEntry {
  id:               number
  module_id:        number
  academic_term_id: number
  room_id:          number
  day_of_week:      number
  day_name:         string
  start_time:       string
  end_time:         string
  session_type:     'lecture' | 'lab' | 'tutorial' | 'seminar' | 'exam'
  notes:            string | null
  module_code:      string
  module_name:      string
  room_name:        string
  staff_id:         number | null
  staff_name:       string | null
}

export interface TimetableFilters {
  term_id?:   number
  option_id?: number
  level_id?:  number
  room_id?:   number
  staff_id?:  number
}

export interface TimetableResponse {
  entries: TimetableEntry[]
  term_id: number | null
  days:    Record<string, string>
  /** entry id → the reasons that session clashes with another. */
  clashes: Record<string, string[]>
  filters: {
    terms:   { id: number; label: string; is_current: number; year_label: string | null }[]
    options: { id: number; name: string }[]
    levels:  { id: number; name: string }[]
    rooms:   { id: number; name: string }[]
    staff:   { id: number; full_name: string }[]
  }
}

export const timetableService = {
  /** The whole term's sessions plus the options needed to narrow them. */
  get: (filters: TimetableFilters = {}, signal?: AbortSignal) =>
    api.get<TimetableResponse>('/api/timetable', filters as Record<string, unknown>, signal),
}
