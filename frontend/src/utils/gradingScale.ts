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
 *
 * Letters are printed without a +/- modifier: CUR awards A/B/C/D/E, and any
 * finer split in `grading_scales` (a "B+" band beside a "B") is a grade-point
 * distinction, not a grade the institution issues. `normalizeGrade` drops the
 * suffix everywhere a letter is shown, and `displayBands` folds the sub-bands
 * into one range per letter for the key printed beside a transcript — the same
 * two operations `App\Helpers\GradingScale` performs on the server.
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

/** 'B+' → 'B', 'C−' → 'C'. Unicode minus and en-dash count too — the scale is
 *  edited through a web form and both get pasted into it. */
export function normalizeGrade(grade: string | null | undefined): string | null {
  if (grade === null || grade === undefined) return null
  const g = String(grade).trim().replace(/[+\-\u2212\u2013]+$/u, '').trim()
  return g === '' ? null : g
}

export interface GradingScale {
  bands:      GradingScaleRow[]
  /** One entry per whole letter, sub-bands folded together — for a grading key. */
  displayBands: GradingScaleRow[]
  /** Letter grade for a percentage, or null when there is none. Never suffixed. */
  gradeFor:   (pct: number | null | undefined) => string | null
  /** The band's description — 'Distinction', 'Credit', … */
  labelFor:   (pct: number | null | undefined) => string | null
  bandFor:    (pct: number | null | undefined) => GradingScaleRow | null
  /** True once the server's bands are in hand (false while the fallback is in use). */
  loaded:     boolean
}

/**
 * Fold the scale to one band per whole letter: B spans from the lowest B
 * minimum to the highest B+ maximum. The description kept is the unsuffixed
 * band's ('Good' over 'Good Plus'); with only suffixed bands, the highest wins.
 */
function foldBands(bands: GradingScaleRow[]): GradingScaleRow[] {
  const merged = new Map<string, { row: GradingScaleRow; exact: boolean }>()

  for (const b of bands) {                       // already highest-first
    const letter = normalizeGrade(b.grade)
    if (!letter) continue
    const raw   = String(b.grade).trim()
    const exact = raw === letter
    const hit   = merged.get(letter)

    if (!hit) {
      merged.set(letter, { row: { ...b, grade: letter }, exact })
      continue
    }
    hit.row.min_marks = Math.min(Number(hit.row.min_marks), Number(b.min_marks))
    hit.row.max_marks = Math.max(Number(hit.row.max_marks), Number(b.max_marks))
    if (!hit.exact && exact) {
      hit.row.description = b.description
      hit.row.grade_point = b.grade_point
      hit.exact = true
    }
  }

  return [...merged.values()]
    .map((m) => m.row)
    .sort((a, b) => Number(b.min_marks) - Number(a.min_marks))
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

  const displayBands = foldBands(bands)
  // The word beside a mark has to be the word the printed key gives for that
  // letter, so descriptions are read off the folded band — a 77% cannot be
  // 'Good Plus' on screen while the key calls B 'Good'.
  const labelFor = (pct: number | null | undefined): string | null => {
    const letter = normalizeGrade(bandFor(pct)?.grade)
    return displayBands.find((b) => b.grade === letter)?.description ?? null
  }

  return {
    bands,
    displayBands,
    bandFor,
    gradeFor: (pct) => normalizeGrade(bandFor(pct)?.grade),
    labelFor,
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
