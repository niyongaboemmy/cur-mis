import { api } from '@/services/api'
import type { PaginatedResponse } from '@/types'

// ── Types ─────────────────────────────────────────────────────────────────────

export type ScanType = 'student_id' | 'receipt' | 'registration'
export type AccessResult = 'granted' | 'denied'

export interface GateVerifyPayload {
  query:      string
  scan_type?: ScanType
  gate?:      string
  log_entry?: boolean
}

export interface GateVerifyResult {
  student: {
    regnumber:     string
    name:          string
    email:         string
    phone:         string | null
    photo_url:     string | null
    status:        string
    program:       string | null
    level:         string | null
    academic_year: string | null
  }
  payment_cleared: boolean
  payment_balance: number
  registered:      boolean
  modules_count:   number
  access_result:   AccessResult
  deny_reason:     string | null
  scan_type:       ScanType
  gate:            string
  log_id:          number | null
  verified_at:     string
}

export interface GateLog {
  id:               number
  student_id:       string | null
  staff_id:         number | null
  scan_type:        ScanType
  barcode:          string | null
  gate:             string
  result:           AccessResult
  reason:           string | null
  notes:            string | null
  verified_by:      number | null
  verified_by_name: string | null
  student_name:     string | null
  student_email:    string | null
  created_at:       string
}

export interface GateTodayStats {
  total:           number
  granted:         number
  denied:          number
  by_student_id:   number
  by_receipt:      number
  by_registration: number
}

export interface GateWeeklyDay {
  day:     string
  granted: number
  denied:  number
  total:   number
}

export interface GateStatsResult {
  today:  GateTodayStats
  weekly: GateWeeklyDay[]
  gates:  { gate: string; checks: number; granted: number; denied: number }[]
}

// ── Service ───────────────────────────────────────────────────────────────────

export const gateService = {
  verify: (payload: GateVerifyPayload, signal?: AbortSignal) =>
    api.post<GateVerifyResult>('/gate/verify', payload, signal),

  studentStatus: (regnumber: string, signal?: AbortSignal) =>
    api.get<{
      student:         { regnumber: string; name: string; program: string | null; level: string | null; photo_url: string | null; status: string }
      payment_cleared: boolean
      payment_balance: number
      registered:      boolean
      academic_year:   string | null
    }>(`/api/gate/student/${encodeURIComponent(regnumber)}`, undefined, signal),

  listLogs: (
    params?: {
      student_id?: string
      result?:     AccessResult
      scan_type?:  ScanType
      gate?:       string
      date_from?:  string
      date_to?:    string
      search?:     string
      page?:       number
      per_page?:   number
    },
    signal?: AbortSignal,
  ) =>
    api.get<PaginatedResponse<GateLog>>(
      '/gate/logs',
      params as Record<string, unknown>,
      signal,
    ),

  recentLogs: (params?: { limit?: number; gate?: string }, signal?: AbortSignal) =>
    api.get<GateLog[]>('/gate/logs/recent', params as Record<string, unknown>, signal),

  getStats: (gate?: string, signal?: AbortSignal) =>
    api.get<GateStatsResult>('/gate/stats', gate ? { gate } : undefined, signal),
}
