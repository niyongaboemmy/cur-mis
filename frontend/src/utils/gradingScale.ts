import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { gradingScaleService, type GradingScaleRow } from '@/services/gradingScaleService'

/**
 * The registry's configured grading scale, for anything that has to turn a
 * percentage into a letter on the client.
 *
 * Mirrors `App\Helpers\GradingScale` on the server — including the ladder
 * lookup. The bands as configured leave gaps (A is 80–100, B+ is 70–79), so a
 * strict `min <= pct <= max` match grades 79.50 as nothing; walking from the
 * highest minimum down and taking the first band whose minimum is met is how a
 * grading scale is actually read, and it never depends on one band's `max`
 * lining up exactly with the next band's `min`.
 */

/** Used only until the scale loads, or if it is empty — the scheme that was
 *  hardcoded here before, so nothing degrades to "no grade at all". */
const FALLBACK: GradingScaleRow[] = [
  { id: -1, grade: 'A', min_marks: 80, max_marks: 100,   grade_point: 4, description: 'Very Good' },
  { id: -2, grade: 'B', min_marks: 70, max_marks: 79.99, grade_point: 3, description: 'Good' },
  { id: -3, grade: 'C', min_marks: 60, max_marks: 69.99, grade_point: 2, description: 'Satisfaction' },
  { id: -4, grade: 'D', min_marks: 50, max_marks: 59.99, grade_point: 1, description: 'Pass' },
  { id: -5, grade: 'E', min_marks: 0,  max_marks: 49.99, grade_point: 0, description: 'Fail' },
]

export interface GradingScale {
  bands:      GradingScaleRow[]
  /** Letter grade for a percentage, or null when there is none. */
  gradeFor:   (pct: number | null | undefined) => string | null
  /** The band's description — 'Distinction', 'Credit', … */
  labelFor:   (pct: number | null | undefined) => string | null
  bandFor:    (pct: number | null | undefined) => GradingScaleRow | null
  /** True once the server's bands are in hand (false while the fallback is in use). */
  loaded:     boolean
}

export function buildGradingScale(rows: GradingScaleRow[] | null | undefined): Omit<GradingScale, 'loaded'> {
  const bands = [...(rows?.length ? rows : FALLBACK)]
    .sort((a, b) => Number(b.min_marks) - Number(a.min_marks))

  const bandFor = (pct: number | null | undefined): GradingScaleRow | null => {
    if (pct === null || pct === undefined || !Number.isFinite(pct)) return null
    for (const b of bands) if (pct >= Number(b.min_marks)) return b
    // Below every configured minimum — the lowest band is still the answer.
    return bands[bands.length - 1] ?? null
  }

  return {
    bands,
    bandFor,
    gradeFor: (pct) => bandFor(pct)?.grade ?? null,
    labelFor: (pct) => bandFor(pct)?.description ?? null,
  }
}

/** Fetches the scale once and shares it across the app via the query cache. */
export function useGradingScale(): GradingScale {
  const q = useQuery({
    queryKey: ['grading-scales'],
    queryFn:  () => gradingScaleService.list(),
    staleTime: 5 * 60 * 1000,
  })
  const rows = q.data?.data

  return useMemo(
    () => ({ ...buildGradingScale(rows), loaded: !!rows?.length }),
    [rows]
  )
}
