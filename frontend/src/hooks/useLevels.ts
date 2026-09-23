import { useQuery } from '@tanstack/react-query'
import { useMemo } from 'react'
import { portalService } from '@/services/admissionService'

export interface LevelOption {
  id:   number
  name: string
}

/**
 * The `levels` catalogue, id → name.
 *
 * Several columns store a `levels.id` behind a name that reads like a number:
 * `student.current_level`, `modules.level`, `student_applications.level_id`,
 * `module_offerings.level_id`. Screens that showed those values raw printed
 * "Level 3" when the catalogue calls that level "Year 2".
 *
 * Endpoints now ship a `*_name` beside every level id, so prefer that when the
 * payload carries one. This hook is the fallback for the screens that only
 * have an id in hand (client-side groupings, filter chips, CSV columns built
 * from ids), and the source for level pickers.
 *
 * `/api/portal/levels` is public, so this works on the gate, verify and apply
 * screens as well as inside the authenticated app.
 */
export function useLevels() {
  const query = useQuery({
    queryKey: ['levels', 'catalogue'],
    queryFn:  async ({ signal }) => {
      const res = await portalService.getLevels(signal)
      return (res.data ?? []) as LevelOption[]
    },
    staleTime: 1000 * 60 * 30, // the catalogue is a handful of rows that change yearly at most
  })

  const levels = useMemo(() => query.data ?? [], [query.data])

  const levelMap = useMemo(() => {
    const m = new Map<number, string>()
    levels.forEach((l) => m.set(Number(l.id), l.name))
    return m
  }, [levels])

  /**
   * Resolve one stored level value to its display name. Non-numeric values are
   * already labels and pass through; an unknown id degrades to "Level 7"
   * rather than a bare number so it still reads as a level.
   */
  const levelName = useMemo(
    () => (value: number | string | null | undefined, fallback = '—'): string => {
      if (value === null || value === undefined || value === '') return fallback
      const raw = String(value).trim()
      if (raw === '') return fallback
      if (!/^\d+$/.test(raw)) return raw
      return levelMap.get(Number(raw)) ?? `Level ${raw}`
    },
    [levelMap],
  )

  return { levels, levelMap, levelName, isLoading: query.isLoading, isError: query.isError }
}
