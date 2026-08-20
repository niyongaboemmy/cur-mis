import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from 'lucide-react'
import { cn } from '@/utils/helpers'

interface PaginationProps {
  currentPage:  number
  lastPage:     number
  total:        number
  perPage:      number
  onPageChange: (page: number) => void
  className?:   string
  /**
   * Page-size choices. Supply this together with `onPerPageChange` to show the
   * "per page" selector; omit both and the control is hidden, so the existing
   * fixed-size callers keep their current layout untouched.
   */
  perPageOptions?:  number[]
  onPerPageChange?: (perPage: number) => void
}

export const DEFAULT_PER_PAGE_OPTIONS = [50, 100, 150, 200, 500]

export default function Pagination({
  currentPage, lastPage, total, perPage, onPageChange, className,
  perPageOptions, onPerPageChange,
}: PaginationProps) {
  const showPerPage = !!onPerPageChange && !!perPageOptions?.length

  // With a size selector the bar must survive a single-page result — otherwise
  // picking 500 collapses everything to one page and hides the control that
  // would let you go back to 50.
  if (lastPage <= 1 && !showPerPage) return null

  const from = total === 0 ? 0 : (currentPage - 1) * perPage + 1
  const to   = Math.min(currentPage * perPage, total)

  /* Visible page numbers with ellipsis — 1 … 4 5 6 … 10.
   * `delta` neighbours each side of the current page, always anchored by the
   * first and last page so those are one click away from anywhere. */
  const pages: (number | '...')[] = []
  const delta = 1

  const rangeStart = Math.max(2, currentPage - delta)
  const rangeEnd   = Math.min(lastPage - 1, currentPage + delta)

  pages.push(1)
  if (rangeStart > 2) pages.push('...')
  for (let i = rangeStart; i <= rangeEnd; i++) pages.push(i)
  if (rangeEnd < lastPage - 1) pages.push('...')
  if (lastPage > 1) pages.push(lastPage)

  const btn = (keyStr: string, label: React.ReactNode, page: number, disabled?: boolean, active?: boolean) => (
    <button
      key={keyStr}
      onClick={() => !disabled && onPageChange(page)}
      disabled={disabled}
      aria-current={active ? 'page' : undefined}
      aria-label={typeof label === 'number' ? `Page ${label}` : undefined}
      className={cn(
        'min-w-[34px] h-[34px] px-2 rounded-md text-sm font-medium flex items-center justify-center transition-colors',
        active
          ? 'bg-primary-600 text-white'
          : 'text-gray-600 hover:bg-gray-100 disabled:opacity-40 disabled:cursor-not-allowed ' +
            'dark:text-ink-300 dark:hover:bg-ink-700/60',
      )}
    >
      {label}
    </button>
  )

  return (
    <div className={cn('flex items-center justify-between gap-4 text-sm flex-wrap', className)}>
      <div className="flex items-center gap-3 flex-wrap">
        <p className="text-gray-500 dark:text-ink-400 text-xs">
          Showing{' '}
          <span className="font-medium text-gray-700 dark:text-ink-200">{from}–{to}</span> of{' '}
          <span className="font-medium text-gray-700 dark:text-ink-200">{total}</span> results
        </p>

        {showPerPage && (
          <label className="flex items-center gap-1.5 text-xs text-gray-500 dark:text-ink-400">
            Show
            <select
              className="input input-sm py-1 w-[74px]"
              value={perPage}
              onChange={(e) => onPerPageChange!(Number(e.target.value))}
              aria-label="Results per page"
            >
              {perPageOptions!.map((n) => (
                <option key={n} value={n}>{n}</option>
              ))}
            </select>
            per page
          </label>
        )}
      </div>

      {lastPage > 1 && (
        <div className="flex items-center gap-1">
          {btn('first', <ChevronsLeft className="h-4 w-4" />, 1,              currentPage === 1)}
          {btn('prev',  <ChevronLeft  className="h-4 w-4" />, currentPage - 1, currentPage === 1)}

          {pages.map((p, i) =>
            p === '...'
              ? <span key={`ellipsis-${i}`} className="px-1 text-gray-400 dark:text-ink-500">…</span>
              : btn(`page-${p}`, p, p as number, false, p === currentPage),
          )}

          {btn('next', <ChevronRight  className="h-4 w-4" />, currentPage + 1, currentPage === lastPage)}
          {btn('last', <ChevronsRight className="h-4 w-4" />, lastPage,         currentPage === lastPage)}
        </div>
      )}
    </div>
  )
}
