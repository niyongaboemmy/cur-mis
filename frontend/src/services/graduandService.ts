import { api, apiClient } from '@/services/api'
import { useAuthStore } from '@/store/authStore'
import type { ApiResponse } from '@/types'
// The roster reports the same classification the transcript does — one shape,
// defined beside the marks it is computed from.
import type { HonoursClassification } from '@/services/marksService'

export type { HonoursClassification }

/** The graduation lifecycle. `waiting` is where a student who has finished
 *  their curriculum sits until someone actions them — the roster renders a
 *  student with no `graduands` row that way too, so the two are one state. */
export type GraduandStatus  = 'waiting' | 'pending' | 'approved' | 'graduated'
export type DegreeClass     = 'First Class' | 'Upper Second' | 'Lower Second' | 'Pass' | 'Distinction'

export interface EligibilityRow {
  id:                  number
  regnumber:           string
  fname:               string
  lname:               string
  current_level:       string | null
  std_option:          string | null
  fac_name:            string | null
  dep_name:            string | null
  option_acronym:      string | null
  option_title:        string | null
  eligible:            boolean
  weighted_avg:        number | null
  total_credits:       number
  total_credit_points: number
  degree_class:        DegreeClass | null
  passed:              number
  failed:              number
  modules:             number
}

export interface EligibilityListResponse {
  data:      EligibilityRow[]
  total:     number
  page:      number
  per_page:  number
  last_page: number
}

export interface GraduandRow {
  id:               number
  student_id:       number
  academic_year_id: number | null
  graduation_date:  string | null
  degree_class:     DegreeClass | null
  cgpa:             number | null
  total_credits:    number | null
  ceremony_number:  string | null
  status:           GraduandStatus
  approved_by:      number | null
  approved_at:      string | null
  created_at:       string
  regnumber:        string
  fname:            string
  lname:            string
  year_label:       string | null
  approved_by_name: string | null
}

export interface GraduandListResponse {
  data:      GraduandRow[]
  total:     number
  page:      number
  per_page:  number
  last_page: number
}

/* ── Curriculum completion audit ──────────────────────────────────────────── */

export type CompletionFilter = 'all' | 'complete' | 'incomplete' | 'with_failures'
export type CompletionSort   = 'name' | 'started' | 'missing' | 'completion'
export type ModuleAuditStatus = 'passed' | 'failed' | 'exempted' | 'pending' | 'missing'

/** Where the derived start date came from — shown so staff can judge it. */
export type StartSource = 'registration_date' | 'regnumber' | 'unknown'

export interface CompletionRow {
  id:               number
  regnumber:        string | null
  fname:            string | null
  lname:            string | null
  current_level:    string | null
  std_option:       string | null
  student_state:    string | null
  acc_year:         string | null
  campus:           string | null
  programme_level:  string | null
  graduation_status:string | null
  started_on:       string | null
  start_source:     StartSource | null
  intake_year:      number | null
  option_name:      string | null
  option_title:     string | null
  option_acronym:   string | null
  dep_name:         string | null
  /** Curriculum modules for the student's program. */
  expected:         number
  /** Of those, how many have a mark (or exemption) recorded. */
  recorded:         number
  passed:           number
  failed:           number
  exempted:         number
  pending:          number
  missing:          number
  /** pending + missing — everything still standing between them and a full record. */
  outstanding:      number
  complete:         boolean
  percent_complete: number | null
  /** The program maps to implausibly many modules; treat counts with suspicion. */
  curriculum_suspect: boolean
}

export interface CompletionSummary {
  cohort:        number
  complete:      number
  incomplete:    number
  with_failures: number
  no_curriculum: number
  no_marks:      number
}

export interface CompletionProgram {
  id:       number
  name:     string | null
  acro:     string | null
  students: number
}

export interface CompletionListResponse {
  data:           CompletionRow[]
  total:          number
  page:           number
  per_page:       number
  last_page:      number
  summary:        CompletionSummary
  /** Programs represented in the cohort, for the filter dropdown. */
  programs:       CompletionProgram[]
  started_before: string
  completion:     CompletionFilter
  sort:           CompletionSort
  /** When the `graduation_audit` snapshot these figures come from was last
   *  rebuilt. Null if it has never been computed. */
  computed_at:    string | null
}

export interface AuditModule {
  module_id:        number
  module_code:      string
  module_name:      string
  module_credits:   number
  module_order:     number | null
  status:           ModuleAuditStatus
  /** How many mark rows exist for this module — >1 means resits/repeat sittings. */
  attempts:         number
  percentage:       number | null
  grade:            string | null
  decision:         string | null
  mark_status:      string | null
  term_label:       string | null
  year_label:       string | null
  /** When the mark was last edited — replaces the term column in the audit UI,
   *  where every legacy row carries the same 'Legacy (imported marks)' label. */
  updated_at:       string | null
  exemption_reason: string | null
}

export interface AuditLevelGroup {
  level_id:   number | null
  level_name: string
  modules:    AuditModule[]
}

export interface CompletionDetailResponse {
  student: {
    id:                number
    regnumber:         string | null
    fname:             string | null
    lname:             string | null
    current_level:     string | null
    student_state:     string | null
    acc_year:          string | null
    campus:            string | null
    programme_level:   string | null
    graduation_status: string | null
    graduation_date:   string | null
    degree_class:      string | null
    started_on:        string | null
    start_source:      StartSource | null
    intake_year:       number | null
  }
  program: {
    id:                 number
    name:               string | null
    title:              string | null
    code:               string | null
    acro:               string | null
    department_id:      number | null
    curriculum_suspect: boolean
  } | null
  totals: {
    expected:         number
    recorded:         number
    passed:           number
    failed:           number
    exempted:         number
    pending:          number
    missing:          number
    extra:            number
    credits_expected: number
    credits_recorded: number
  }
  groups: AuditLevelGroup[]
  extra_modules: Array<{
    module_id:      number
    module_code:    string
    module_name:    string
    module_credits: number
    status:         ModuleAuditStatus
    attempts:       number
    percentage:     number | null
    grade:          string | null
    term_label:     string | null
    year_label:     string | null
    updated_at:     string | null
  }>
}

/* ── Graduation roster ────────────────────────────────────────────────────── */

/** Where a ready student sits in the graduation lifecycle. Never null — a
 *  student with no stored record comes back as `waiting`. */
export type RosterStatus = GraduandStatus

export interface ReadyRow extends CompletionRow {
  credits_expected: number
  credits_earned:   number
  /** Credit-weighted average of the best attempt at each graded module. */
  weighted_avg:     number | null
  /** Existing `graduands` record, if the student has been added to the list. */
  graduand_id:      number | null
  graduand_status:  RosterStatus
  degree_class:     DegreeClass | null
  graduation_date:  string | null
  ceremony_number:  string | null
  /**
   * The class the regulations award, and the default when adding the student
   * to the list. Comes from the final-level modules (see `classification`);
   * falls back to the class `weighted_avg` implies when there are none to
   * assess.
   */
  suggested_class:  DegreeClass | null
  /** How `suggested_class` was reached — thresholds met, floor, caveats. */
  classification?:  HonoursClassification | null
}

export interface ReadySummary {
  ready:     number
  waiting:   number
  pending:   number
  approved:  number
  graduated: number
}

/** Filter option lists, derived from the ready pool so every entry returns rows. */
export interface RosterDepartment { id: number; name: string | null; students: number }
export interface RosterProgram    { id: number; name: string | null; acro: string | null; department_id: number | null; students: number }
export interface RosterIntakeYear { year: number; students: number }

export interface ReadyListResponse {
  data:         ReadyRow[]
  total:        number
  page:         number
  per_page:     number
  last_page:    number
  summary:      ReadySummary
  departments:  RosterDepartment[]
  programs:     RosterProgram[]
  intake_years: RosterIntakeYear[]
  computed_at:  string | null
}

export interface ReadyListParams {
  started_before?:  string
  std_option?:      string | number
  /** `departements.dep_id`, resolved through the program rather than the
   *  legacy free-text `student.department`. */
  department?:      string | number
  /** Academic year the student registered in, from the regnumber. */
  intake_year?:     number
  current_level?:   number
  student_state?:   string
  graduand_status?: GraduandStatus | ''
  search?:          string
  /** 1 (default) excludes students still carrying a failed module. */
  clean?:           '0' | '1'
  sort?:            'name' | 'started' | 'gpa' | 'program'
  page?:            number
  per_page?:        number
}

/** Why an environment shows zeros: snapshot state, the counts it is computed
 *  from, and which of the migrations it depends on have actually been run. */
export interface CompletionDiagnostics {
  snapshot: {
    exists:           boolean
    rows_total?:      number
    with_started_on?: number
    with_program?:    number
    with_curriculum?: number
    with_any_mark?:   number
    complete?:        number
    computed_at?:     string | null
    by_state?:        Array<{ state: string | null; n: number }>
  }
  sources:    Record<string, number>
  legacy:     Record<string, number | null>
  migrations: Record<string, string>
}

export interface RebuildBatch {
  processed:   number
  last_id:     number
  done:        boolean
  students:    number
  complete:    number
  seconds:     number
  computed_at: string | null
}

export interface CompletionListParams {
  started_before: string
  completion?:    CompletionFilter
  std_option?:    string | number
  current_level?: number
  student_state?: string
  search?:        string
  sort?:          CompletionSort
  page?:          number
  per_page?:      number
}

/** The cohort aggregate is a single pass over every mark in the cohort. A wide
 *  cut-off date can push it past the 15s default, so this one call gets its own
 *  budget rather than failing halfway through an audit. */
const AUDIT_TIMEOUT = 180_000

export const graduandService = {
  eligibilityList: (
    params: { academic_year_id?: number; std_option?: string | number; current_level?: number; page?: number; per_page?: number } = {},
    signal?: AbortSignal,
  ) =>
    api.get<EligibilityListResponse>('/api/graduands/eligibility', params as Record<string, unknown>, signal),

  list: (
    params: { status?: GraduandStatus; academic_year_id?: number; page?: number; per_page?: number } = {},
    signal?: AbortSignal,
  ) =>
    api.get<GraduandListResponse>('/api/graduands', params as Record<string, unknown>, signal),

  add: (payload: { student_id: number; academic_year_id?: number; degree_class?: DegreeClass }) =>
    api.post<{ id: number }>('/api/graduands', payload),

  approve: (id: number) =>
    api.put<null>(`/api/graduands/${id}/approve`, {}),

  graduate: (id: number, payload: { graduation_date?: string; ceremony_number?: string }) =>
    api.put<null>(`/api/graduands/${id}/graduate`, payload),

  defer: (id: number) =>
    api.put<null>(`/api/graduands/${id}/defer`, {}),

  delete: (id: number) =>
    api.delete<null>(`/api/graduands/${id}`),

  /** Cohort audit: who started on or before a date, and what's outstanding. */
  completionList: (params: CompletionListParams, signal?: AbortSignal) =>
    apiClient
      .get<ApiResponse<CompletionListResponse>>('/api/graduands/completion', {
        params, signal, timeout: AUDIT_TIMEOUT,
      })
      .then((r) => r.data),

  /** Per-student drill-down: every curriculum module, completed or not. */
  completionDetail: (studentId: number, signal?: AbortSignal) =>
    api.get<CompletionDetailResponse>(`/api/graduands/completion/${studentId}`, {}, signal),

  /** Students who have a mark for every module their program requires — the
   *  pool the graduation list is built from, with any lifecycle record. */
  readyList: (params: ReadyListParams = {}, signal?: AbortSignal) =>
    api.get<ReadyListResponse>('/api/graduands/ready', params as Record<string, unknown>, signal),

  /** Move a selection of finished students to a status in one request. Creates
   *  the `graduands` record where none exists, so a waiting student can go
   *  straight to approved without a separate "add" step. */
  bulkStatus: (payload: {
    student_ids:      number[]
    status:           GraduandStatus
    degree_class?:    DegreeClass
    graduation_date?: string
    ceremony_number?: string
  }) =>
    api.post<{ updated: number; skipped: number; status: GraduandStatus }>(
      '/api/graduands/bulk-status', payload,
    ),

  /** Why this environment shows zeros — read-only counts, safe on production. */
  completionDiagnostics: (signal?: AbortSignal) =>
    api.get<CompletionDiagnostics>('/api/graduands/completion/diagnostics', {}, signal),

  /** Recompute one batch of the `graduation_audit` snapshot.
   *
   *  Batched rather than one call: a shared host that caps requests at 30s
   *  would roll the whole rebuild back and leave the table empty. Walk
   *  `last_id` from the response until `done` is true. */
  rebuildCompletion: (afterId = 0, limit = 2000) =>
    apiClient
      .post<ApiResponse<RebuildBatch>>(
        '/api/graduands/completion/rebuild',
        { after_id: afterId, limit },
        { timeout: AUDIT_TIMEOUT },
      )
      .then((r) => r.data),

  /** Download URL for the whole filtered cohort as CSV — every row, not just
   *  the visible page. Token goes in the query string so it can be a plain
   *  link, matching how the student curriculum export is served. */
  completionExportUrl: (params: CompletionListParams) => {
    const token = useAuthStore.getState().token
    const base  = import.meta.env.VITE_API_URL ?? ''
    const qs    = new URLSearchParams({ token: token ?? '' })
    Object.entries(params).forEach(([k, v]) => {
      if (v !== undefined && v !== null && v !== '') qs.append(k, String(v))
    })
    return `${base}/graduands/completion/export?${qs.toString()}`
  },
}
