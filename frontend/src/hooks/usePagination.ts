import { useState, useCallback } from 'react'

interface PaginationState {
  page:    number
  perPage: number
  sortKey: string
  sortDir: 'asc' | 'desc'
}

interface UsePaginationReturn extends PaginationState {
  setPage:    (page: number) => void
  setPerPage: (n: number) => void
  setSort:    (key: string, dir: 'asc' | 'desc') => void
  reset:      () => void
  /** Build a query-params object for passing to api.get() */
  toParams:   () => Record<string, unknown>
}

/**
 * Manages server-side pagination, sorting state in one place.
 *
 * const pagination = usePagination({ sortKey: 'created_at', sortDir: 'desc' })
 * const { data }   = useQuery(['users', pagination.toParams()], () =>
 *   api.get('/users', pagination.toParams()),
 * )
 */
export function usePagination(defaults: Partial<PaginationState> = {}): UsePaginationReturn {
  const [state, setState] = useState<PaginationState>({
    page:    1,
    perPage: 15,
    sortKey: 'id',
    sortDir: 'asc',
    ...defaults,
  })

  const setPage    = useCallback((page: number)                   => setState((s) => ({ ...s, page })), [])
  const setPerPage = useCallback((perPage: number)                => setState((s) => ({ ...s, perPage, page: 1 })), [])
  const setSort    = useCallback((sortKey: string, sortDir: 'asc' | 'desc') =>
    setState((s) => ({ ...s, sortKey, sortDir, page: 1 })), [])
  const reset      = useCallback(() => setState({ page: 1, perPage: 15, sortKey: 'id', sortDir: 'asc', ...defaults }), [defaults])

  const toParams = useCallback(() => ({
    page:     state.page,
    per_page: state.perPage,
    sort:     state.sortKey,
    dir:      state.sortDir,
  }), [state])

  return { ...state, setPage, setPerPage, setSort, reset, toParams }
}
