import { type ReactNode } from 'react'
import { ChevronUp, ChevronDown, ChevronsUpDown } from 'lucide-react'
import { cn } from '@/utils/helpers'
import { SkeletonTable } from './Skeleton'
import EmptyState from './EmptyState'
import Pagination from './Pagination'

export interface Column<T> {
  key:         keyof T | string
  header:      string
  /** Custom cell renderer. Falls back to string coercion. */
  render?:     (row: T) => ReactNode
  sortable?:   boolean
  className?:  string
  headerClassName?: string
}

interface SortState {
  key:       string
  direction: 'asc' | 'desc'
}

interface DataTableProps<T> {
  columns:      Column<T>[]
  data:         T[]
  keyExtractor: (row: T) => string | number
  isLoading?:   boolean
  /** Total items (pass for server-side pagination) */
  total?:       number
  currentPage?: number
  lastPage?:    number
  perPage?:     number
  onPageChange?: (page: number) => void
  sort?:         SortState
  onSort?:       (key: string, direction: 'asc' | 'desc') => void
  emptyTitle?:   string
  emptyDescription?: string
  emptyAction?:  ReactNode
  className?:    string
}

export default function DataTable<T>({
  columns, data, keyExtractor, isLoading,
  total, currentPage = 1, lastPage = 1, perPage = 15,
  onPageChange, sort, onSort,
  emptyTitle, emptyDescription, emptyAction, className,
}: DataTableProps<T>) {

  const handleSort = (key: string) => {
    if (!onSort) return
    const dir = sort?.key === key && sort.direction === 'asc' ? 'desc' : 'asc'
    onSort(key, dir)
  }

  const SortIcon = ({ colKey }: { colKey: string }) => {
    if (!sort || sort.key !== colKey)
      return <ChevronsUpDown className="h-3.5 w-3.5 text-gray-400 dark:text-ink-500" />
    return sort.direction === 'asc'
      ? <ChevronUp   className="h-3.5 w-3.5 text-primary-600" />
      : <ChevronDown className="h-3.5 w-3.5 text-primary-600" />
  }

  if (isLoading) return <SkeletonTable rows={perPage} cols={columns.length} />

  return (
    <div className={cn('space-y-4', className)}>
      <div className="overflow-x-auto rounded-lg border border-gray-200 dark:border-ink-700">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 dark:bg-ink-900/40 border-b border-gray-200 dark:border-ink-700">
            <tr>
              {columns.map((col) => (
                <th
                  key={String(col.key)}
                  className={cn(
                    'px-4 py-3 text-left text-xs font-semibold text-gray-600 dark:text-ink-400 uppercase tracking-wide whitespace-nowrap',
                    col.sortable && onSort && 'cursor-pointer select-none hover:text-gray-900 dark:hover:text-white',
                    col.headerClassName,
                  )}
                  onClick={col.sortable ? () => handleSort(String(col.key)) : undefined}
                >
                  <span className="inline-flex items-center gap-1">
                    {col.header}
                    {col.sortable && <SortIcon colKey={String(col.key)} />}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 dark:divide-ink-700 bg-white dark:bg-ink-800">
            {data.length === 0 ? (
              <tr>
                <td colSpan={columns.length}>
                  <EmptyState
                    title={emptyTitle}
                    description={emptyDescription}
                    action={emptyAction}
                  />
                </td>
              </tr>
            ) : (
              data.map((row) => (
                <tr key={keyExtractor(row)} className="hover:bg-gray-50 dark:hover:bg-ink-700/40 transition-colors">
                  {columns.map((col) => (
                    <td
                      key={String(col.key)}
                      className={cn('px-4 py-3 text-gray-700 dark:text-ink-300', col.className)}
                    >
                      {col.render
                        ? col.render(row)
                        : String((row as Record<string, unknown>)[String(col.key)] ?? '—')}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {onPageChange && total !== undefined && (
        <Pagination
          currentPage={currentPage}
          lastPage={lastPage}
          total={total}
          perPage={perPage}
          onPageChange={onPageChange}
        />
      )}
    </div>
  )
}
