import { useState, useEffect } from 'react'

/**
 * Debounce a value — useful for search inputs that trigger API queries.
 *
 * const query     = useDebounce(searchInput, 400)
 * const { data }  = useQuery(['search', query], ...)
 */
export function useDebounce<T>(value: T, delay = 400): T {
  const [debounced, setDebounced] = useState<T>(value)

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay)
    return () => clearTimeout(timer)
  }, [value, delay])

  return debounced
}
