import { api } from '@/services/api'
import type { PaginatedResponse } from '@/types'
import type { AcMgmtEntity } from '@/types/academic'

/** Generic CRUD for /api/academics-management/:entity — all endpoints follow
 *  the same list(paginate) / show / create / update / delete pattern. */

export const academicsMgmtService = {
  list: <T = any>(
    entity: AcMgmtEntity,
    params: { page?: number; per_page?: number } & Record<string, unknown> = {},
    signal?: AbortSignal,
  ) => api.get<PaginatedResponse<T>>(`/api/academics-management/${entity}`, params, signal),

  show: <T = any>(entity: AcMgmtEntity, id: number | string, signal?: AbortSignal) =>
    api.get<T>(`/api/academics-management/${entity}/${id}`, {}, signal),

  create: <T = { id: number }>(entity: AcMgmtEntity, data: Record<string, unknown>) =>
    api.post<T>(`/api/academics-management/${entity}`, data),

  update: (entity: AcMgmtEntity, id: number | string, data: Record<string, unknown>) =>
    api.put<null>(`/api/academics-management/${entity}/${id}`, data),

  remove: (entity: AcMgmtEntity, id: number | string) =>
    api.delete<null>(`/api/academics-management/${entity}/${id}`),

  /** Campuses linked to a program (`options`). */
  listOptionCampuses: (optionId: number | string, signal?: AbortSignal) =>
    api.get<{ option_id: number; campus_ids: number[]; campuses: Array<Record<string, any>> }>(
      `/api/academics-management/options/${optionId}/campuses`, {}, signal,
    ),

  setOptionCampuses: (optionId: number | string, campusIds: number[]) =>
    api.put<{ option_id: number; campus_ids: number[] }>(
      `/api/academics-management/options/${optionId}/campuses`,
      { campus_ids: campusIds },
    ),

  /**
   * Compute the next department code for a faculty. Returns
   * `<fac_code>.<seq>` or empty string when the faculty has no fac_code.
   */
  nextDepartmentCode: (facId: number, signal?: AbortSignal) =>
    api.get<{ code: string; fac_code: string | null; next_seq: number | null }>(
      `/api/academics-management/departments/next-code`, { fac_id: facId }, signal,
    ),

  /**
   * Compute the next program/option code for a department. Returns
   * `<dep_code>.<seq>` or empty string when the department has no dep_code.
   */
  nextOptionCode: (depId: number, signal?: AbortSignal) =>
    api.get<{ code: string; dep_code: string | null; next_seq: number | null }>(
      `/api/academics-management/options/next-code`, { dep_id: depId }, signal,
    ),

  /**
   * Per-program, per-mode schedule plan — the modules linked to a program
   * (with their curricular order) plus the start/end dates already saved
   * for the chosen mode. Empty `start_date`/`end_date` means the module is
   * in the program but hasn't been planned for that mode yet.
   */
  getSchedules: (
    programId: number,
    mode: string,
    signal?: AbortSignal,
  ) =>
    api.get<{
      count: number
      rows: Array<{
        module_id:      number
        module_order:   number | null
        module_code:    string
        module_name:    string
        module_credits: number | null
        level:          number | null
        blocks: Array<{
          id:              number
          start_date:      string | null
          end_date:        string | null
          semesters:       string | null
          academic_year:   string | null
          day_of_week:     number | null
          day_pattern:     string | null
          start_time:      string | null
          end_time:        string | null
          instructor_id:   number | null
          instructor_name: string | null
          activity:        string | null
          year_of_study:   number | null
          campus_id:       number | null
        }>
      }>
    }>(`/api/academics-management/schedules`, { program_id: programId, mode }, signal),

  saveSchedules: (body: {
    program_id: number
    mode: string
    blocks: Array<{
      id?:              number
      module_id:        number
      start_date:       string | null
      end_date:         string | null
      semesters?:       string | null
      day_of_week?:     number | null
      day_pattern?:     string | null
      start_time?:      string | null
      end_time?:        string | null
      instructor_id?:   number | null
      instructor_name?: string | null
      activity?:        string | null
      year_of_study?:   number | null
      campus_id?:       number | null
      academic_year?:   string | null
    }>
    delete_ids?: number[]
  }) =>
    api.post<{
      created: number
      updated: number
      deleted: number
      failed:  Array<{ index: number | string; error: string }>
    }>(`/api/academics-management/schedules`, body),

  deleteScheduleBlock: (id: number) =>
    api.delete<null>(`/api/academics-management/schedules/${id}`),

  /**
   * Bulk-import the university's timetable spreadsheet. The frontend
   * normalises rows (parses dates / times, splits the Period column,
   * etc.) before sending — the backend just resolves FK lookups and
   * inserts module_offerings rows.
   */
  importTimetable: (body: {
    academic_year?: string | null
    mode_default:   string
    replace:        boolean
    rows: Array<{
      /** module_offerings.id from a prior export. When present and the row
       *  still exists, the backend updates that block in place — letting
       *  admins edit the exported xlsx and re-upload without dupes. */
      id?:             number | null
      option_acro:     string
      module_code:     string
      module_name?:    string
      start_date?:     string | null
      end_date?:       string | null
      start_time?:     string | null
      end_time?:       string | null
      semesters?:      string | null
      activity?:       string | null
      lecturer_name?:  string | null
      level?:          number | null
      year_of_study?:  number | null
      campus_name?:    string | null
      attendance_mode?: string | null
    }>
  }) =>
    api.post<{
      modules_created:  number
      blocks_created:   number
      blocks_updated:   number
      blocks_replaced:  number
      failed:           Array<{ index: number; error: string }>
      unknown_opts:     string[]
      unknown_staff:    string[]
      unknown_campuses: string[]
      unknown_levels:   string[]
    }>(`/api/academics-management/schedules/import-timetable`, body),

  /** Flat dump of every block + its surrounding context for export. */
  exportTimetable: (signal?: AbortSignal) =>
    api.get<{
      count: number
      rows: Array<{
        id:                   number
        start_date:           string | null
        end_date:             string | null
        start_time:           string | null
        end_time:             string | null
        semesters:            string | null
        activity:             string | null
        year_of_study:        number | null
        academic_year:        string | null
        mode:                 string | null
        module_code:          string
        module_name:          string
        module_credits:       number | null
        level:                number | null
        /** Resolved `levels.name` — the export prints this, not the id. */
        level_name:           string | null
        option_acro:          string | null
        option_code:          string | null
        option_name:          string | null
        dep_acronym:          string | null
        dep_code:             string | null
        dep_name:             string | null
        instructor_full_name: string | null
        instructor_name_raw:  string | null
        campus_name:          string | null
      }>
    }>(`/api/academics-management/schedules/export-timetable`, {}, signal),

  /**
   * Staff directory used to populate the instructor selector on the
   * Scheduling tab. Tiny payload, no pagination.
   */
  getInstructors: (signal?: AbortSignal) =>
    api.get<{
      count: number
      rows: Array<{ id: number; full_name: string; position: string | null }>
    }>(`/api/academics-management/instructors`, {}, signal),

  /**
   * Per-program module import — the flow the Modules tab uses. The
   * program is selected up-front via the import-context dialog; the file
   * only carries module-catalog columns plus a per-program order. Backend
   * upserts modules and links them to the chosen program in
   * `module_programs.module_order`.
   */
  programModuleImport: (body: {
    program_id: number
    rows: Array<{
      module_order?:  number | null
      module_code:    string
      module_name?:   string | null
      module_credits?: number | null
      level?:         string | number | null
    }>
    action: 'skip' | 'update'
  }) =>
    api.post<{
      modules: { created: number; updated: number }
      links:   { created: number; updated: number; skipped: number }
      failed:  Array<{ index: number; error: string }>
    }>(`/api/academics-management/modules/program-import`, body),

  /**
   * Curriculum CSV export — the inverse of curriculumImport. Returns one
   * record per placement, joined with the surrounding module/option/
   * department/faculty/level/campus context so it can round-trip into
   * the wide spreadsheet without further lookups.
   */
  curriculumExport: (signal?: AbortSignal) =>
    api.get<{
      count: number
      rows: Array<{
        offering_id:    number
        academic_year:  string | null
        mode:           string | null
        mode_order:     number | null
        semesters:      string | null
        module_order:   number | null
        campus_id:      number | null
        module_code:    string
        module_name:    string | null
        module_credits: number | null
        option_code:    string | null
        option_acro:    string | null
        option_name:    string | null
        option_start:   string | null
        option_end:     string | null
        dep_code:       string | null
        dep_acronym:    string | null
        dep_name:       string | null
        fac_code:       string | null
        fac_acronym:    string | null
        fac_name:       string | null
        level_name:     string | null
        campus_name:    string | null
      }>
    }>(`/api/academics-management/modules/curriculum-export`, {}, signal),

  /**
   * Curriculum CSV import — the wide spreadsheet that mixes module catalog
   * info with per-program/mode/semester/campus placement metadata. Backend
   * upserts into `modules` and writes one `module_offerings` row per file
   * line, resolving option_code / campus_name / level on the way.
   */
  curriculumImport: (body: {
    rows: Array<{
      academic_year?:  string | null
      option_code:     string
      level?:          string | null
      mode?:           string | null
      mode_order?:     number | null
      semesters?:      string | null
      module_order?:   number | null
      module_code:     string
      module_name?:    string | null
      module_credits?: number | null
      campus_name?:    string | null
    }>
    action: 'skip' | 'update'
  }) =>
    api.post<{
      modules:   { created: number; updated: number }
      offerings: { created: number; updated: number; skipped: number }
      failed:    Array<{ index: number; error: string; errors?: Record<string, string[]> }>
    }>(`/api/academics-management/modules/curriculum-import`, body),

  /* ── Exam scheduling ───────────────────────────────────────── */

  /**
   * The pool of modules an admin can pick from when scheduling an exam.
   * One row per (module, option, mode) tuple that has at least one
   * teaching block in `module_offerings`. The faculty/option/campus
   * context is already resolved so the dropdown can show rich labels.
   */
  examScheduledModules: (signal?: AbortSignal) =>
    api.get<{
      count: number
      rows: Array<{
        module_id:      number
        option_id:      number | null
        mode:           string | null
        academic_year:  string | null
        year_of_study:  number | null
        semesters:      string | null
        campus_id:      number | null
        module_code:    string
        module_name:    string
        module_credits: number | null
        level:          number | null
        option_name:    string | null
        option_acro:    string | null
        option_code:    string | null
        fac_name:       string | null
        fac_acronym:    string | null
        fac_code:       string | null
        dep_name:       string | null
        dep_acronym:    string | null
        campus_name:    string | null
        earliest_start: string | null
        latest_end:     string | null
      }>
    }>(`/api/academics-management/exams/scheduled-modules`, {}, signal),

  listExams: (
    params: {
      term_id?:       number | string
      academic_year?: string
      option_id?:     number | string
      module_id?:     number | string
      component?:     string
      q?:             string
    } = {},
    signal?: AbortSignal,
  ) =>
    api.get<{
      count: number
      rows: Array<{
        /** null when the row represents a scheduled module that doesn't
         *  yet have an exam_schedules entry — shown when filtering by
         *  program so admins can spot modules pending an exam date. */
        id:              number | null
        module_id:       number
        option_id:       number | null
        term_id:         number | null
        academic_year:   string | null
        component:       string
        exam_date:       string | null
        start_time:      string | null
        end_time:        string | null
        campus_id:       number | null
        instructor_name: string | null
        notes:           string | null
        module_code:     string
        module_name:     string
        module_credits:  number | null
        level:           number | null
        option_name:     string | null
        option_acro:     string | null
        option_code:     string | null
        dep_name:        string | null
        dep_acronym:     string | null
        fac_name:        string | null
        fac_acronym:     string | null
        fac_code:        string | null
        campus_name:     string | null
        term_label:      string | null
        /** Comma-joined teaching modes (Day / Weekend / Holiday) from
         *  module_offerings — populated on program-filtered queries so
         *  the admin can see which modes the module runs in. Null on
         *  program-wide listings. */
        mode_label:      string | null
        /** Number of students currently registered for this exam's
         *  module + term (or any term when the exam has no term). Used
         *  by the exams list to show the cohort size on each row. */
        registered_count: number
      }>
    }>(`/api/academics-management/exams`, params, signal),

  createExam: (body: {
    module_id:        number
    option_id?:       number | null
    term_id?:         number | null
    academic_year?:   string | null
    component?:       string | null
    exam_date:        string
    start_time?:      string | null
    end_time?:        string | null
    campus_id?:       number | null
    instructor_name?: string | null
    notes?:           string | null
  }) => api.post<{ id: number }>(`/api/academics-management/exams`, body),

  updateExam: (
    id: number | string,
    body: Partial<{
      module_id:       number
      option_id:       number | null
      term_id:         number | null
      academic_year:   string | null
      component:       string | null
      exam_date:       string | null
      start_time:      string | null
      end_time:        string | null
      campus_id:       number | null
      instructor_name: string | null
      notes:           string | null
    }>,
  ) => api.put<null>(`/api/academics-management/exams/${id}`, body),

  deleteExam: (id: number | string) =>
    api.delete<null>(`/api/academics-management/exams/${id}`),

  examAttendance: (id: number | string, signal?: AbortSignal) =>
    api.get<{
      header: {
        exam_id:         number
        module_id:       number
        module_code:     string
        module_name:     string
        module_credits:  number | null
        level:           number | null
        component:       string
        exam_date:       string | null
        start_time:      string | null
        end_time:        string | null
        campus_name:     string | null
        option_name:     string | null
        option_acro:     string | null
        fac_name:        string | null
        fac_acronym:     string | null
        dep_name:        string | null
        instructor_name: string | null
        term_label:      string | null
        academic_year:   string | null
        notes:           string | null
      }
      roster: Array<{
        regnumber:       string
        first_name:      string
        last_name:       string
        option_acro:     string | null
        semester:        string | null
        attendance_mode: string | null
        level:           string | null
        intake:          string | null
        gender:          string | null
      }>
      count: number
    }>(`/api/academics-management/exams/${id}/attendance`, {}, signal),

  /**
   * One-shot Excel import. The backend resolves duplicates by `match_key`
   * and either skips or updates them based on `action`.
   */
  bulkImport: (
    entity: AcMgmtEntity,
    body: {
      rows: Record<string, unknown>[]
      action: 'skip' | 'update'
      match_key?: string | null
    },
  ) =>
    api.post<{
      created: number
      updated: number
      skipped: number
      failed: Array<{ index: number; error: string; errors?: Record<string, string[]> }>
    }>(`/api/academics-management/${entity}/bulk-import`, body),
}
