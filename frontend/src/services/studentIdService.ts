import { api, apiClient } from '@/services/api'

export interface StudentIdCard {
  id:          number
  student_id:  number
  issue_date:  string
  expiry_date: string
  barcode:     string
  is_active:   number | boolean
  created_at:  string
}

export interface StudentIdHistory {
  active:  StudentIdCard | null
  history: StudentIdCard[]
}

/** One row of the ID-card workspace roster. */
export interface StudentIdRosterRow {
  student_id:    number
  regnumber:     string
  fname:         string | null
  lname:         string | null
  photo:         string | null
  campus:        string | null
  student_state: string | null
  option_name:   string | null
  card_id:       number | null
  issue_date:    string | null
  expiry_date:   string | null
  barcode:       string | null
  card_state:    'none' | 'active' | 'expired' | 'revoked'
}

/** A print size the card renderer supports. */
export interface CardSize {
  key:       string
  label:     string
  width_mm:  number
  height_mm: number
  default:   boolean
}

export interface StudentIdRosterFilters {
  page?:      number
  per_page?:  number
  keyword?:   string
  state?:     string
  campus?:    string
  option_id?: number
}

/** Save a blob to disk under `name`. */
function saveBlob(blob: Blob, name: string) {
  const url = window.URL.createObjectURL(blob)
  const a   = document.createElement('a')
  a.href = url; a.download = name
  document.body.appendChild(a); a.click(); a.remove()
  window.URL.revokeObjectURL(url)
}

/**
 * Hand a PDF blob to the browser's print dialog.
 *
 * Rendered through an off-screen iframe rather than window.open() because a
 * popup blocker silently swallows the latter — the user clicks Print and
 * nothing happens, with no error to react to. The object URL is revoked on a
 * timer, not straight after print(): the dialog reads the document lazily, and
 * revoking immediately leaves the preview blank.
 */
function printBlob(blob: Blob) {
  const url   = window.URL.createObjectURL(blob)
  const frame = document.createElement('iframe')
  frame.setAttribute('aria-hidden', 'true')
  frame.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;'
  frame.src = url
  frame.onload = () => {
    try {
      frame.contentWindow?.focus()
      frame.contentWindow?.print()
    } catch {
      // Cross-origin or a browser that refuses to print an iframe — fall back
      // to a tab the user can print from by hand.
      window.open(url, '_blank')
    }
  }
  document.body.appendChild(frame)
  window.setTimeout(() => { frame.remove(); window.URL.revokeObjectURL(url) }, 60_000)
}

/**
 * Re-throw an axios error whose body is a Blob with the server's JSON message
 * pulled out onto `response.data`.
 *
 * With `responseType: 'blob'` an error response is delivered as a Blob too, so
 * `e.response.data.message` is undefined and every failure reaches the caller
 * as a generic toast — losing messages that tell the user what to do next,
 * like "None of the selected students hold an active ID card."
 */
async function rethrowBlobError(e: any): Promise<never> {
  const body = e?.response?.data
  if (body instanceof Blob && body.type.includes('json')) {
    try {
      e.response.data = JSON.parse(await body.text())
    } catch {
      /* Not the JSON envelope after all — leave the original error alone. */
    }
  }
  throw e
}

/** Normalise an axios blob response and read the server's filename. */
function asPdf(res: { data: unknown; headers: Record<string, unknown> }, fallback: string) {
  const blob = res.data instanceof Blob
    ? res.data
    : new Blob([res.data as BlobPart], { type: 'application/pdf' })
  const cd   = (res.headers['content-disposition'] as string | undefined) ?? ''
  const m    = /filename="?([^";]+)"?/i.exec(cd)
  return { blob, name: m?.[1] ?? fallback }
}

export const studentIdService = {
  /** Students plus their current card state — powers the ID-card workspace. */
  roster: (filters: StudentIdRosterFilters = {}, signal?: AbortSignal) =>
    api.get<{
      data: StudentIdRosterRow[]
      pagination: { current_page: number; per_page: number; total: number; last_page: number }
    }>('/student-ids', filters as Record<string, unknown>, signal),

  /** Issue cards for a selection. Partial failures come back in `failed`. */
  batchIssue: (studentIds: number[], validityYears = 4) =>
    api.post<{
      issued: { student_id: number; card_id: number; barcode: string }[]
      failed: { student_id: number; reason: string }[]
    }>('/student-ids/batch-issue', { student_ids: studentIds, validity_years: validityYears }),

  history: (studentId: number | string) =>
    api.get<StudentIdHistory>(`/api/student-ids/by-student/${studentId}`),

  issue: (studentId: number | string, validityYears = 4) =>
    api.post<StudentIdCard>('/student-ids/issue', { student_id: studentId, validity_years: validityYears }),

  revoke: (cardId: number) =>
    api.delete<void>(`/api/student-ids/${cardId}`),

  /** Fetch the printable card HTML for an in-app preview.
   *  Pass `photoValue` (student.photo from the DB row) so the backend can embed
   *  the photo even when the student.photo column is null in the DB. */
  preview: (studentId: number | string, photoValue?: string | null) => {
    const params: Record<string, unknown> = { preview: 1 }
    if (photoValue) params.photo = photoValue
    return api.get<{ html: string }>(`/api/student-ids/by-student/${studentId}/card`, params)
  },

  /** The print sizes the renderer supports — served so the UI cannot offer
   *  a size the backend would quietly reject. */
  cardSizes: (signal?: AbortSignal) =>
    api.get<{ sizes: CardSize[] }>('/api/student-ids/card-sizes', {}, signal),

  /** One PDF holding every selected student's active card.
   *  `size` is a key from cardSizes(); omitted prints at the default. */
  batchCards: async (studentIds: number[], size?: string) => {
    const res = await apiClient.post(
      '/student-ids/batch-print',
      { student_ids: studentIds, ...(size ? { size } : {}) },
      { responseType: 'blob' },
    ).catch(rethrowBlobError)
    return asPdf(res, `id-cards-${studentIds.length}.pdf`)
  },

  /** Save every selected student's card to disk as one PDF. */
  batchDownload: async (studentIds: number[], size?: string) => {
    const { blob, name } = await studentIdService.batchCards(studentIds, size)
    saveBlob(blob, name)
  },

  /** Send every selected student's card straight to the print dialog. */
  batchPrint: async (studentIds: number[], size?: string) => {
    const { blob } = await studentIdService.batchCards(studentIds, size)
    printBlob(blob)
  },

  /** One student's active card as a PDF blob (carries the auth header). */
  card: async (studentId: number | string, size?: string) => {
    const res = await apiClient.get(`/api/student-ids/by-student/${studentId}/card`, {
      responseType: 'blob',
      ...(size ? { params: { size } } : {}),
    }).catch(rethrowBlobError)
    return asPdf(res, `id-card-${studentId}.pdf`)
  },

  /** Save one student's card to disk. */
  download: async (studentId: number | string, size?: string) => {
    const { blob, name } = await studentIdService.card(studentId, size)
    saveBlob(blob, name)
  },

  /** Send one student's card straight to the print dialog. */
  print: async (studentId: number | string, size?: string) => {
    const { blob } = await studentIdService.card(studentId, size)
    printBlob(blob)
  },
}
