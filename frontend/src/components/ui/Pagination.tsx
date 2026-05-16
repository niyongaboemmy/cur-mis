import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from 'lucide-react'
import { cn } from '@/utils/helpers'

interface PaginationProps {
  currentPage:  number
  lastPage:     number
  total:        number
  perPage:      number
  onPageChange: (page: number) => void
  className?:   string
}

export default function Pagination({
  currentPage, lastPage, total, perPage, onPageChange, className,
}: PaginationProps) {
  if (lastPage <= 1) return null

  const from = (currentPage - 1) * perPage + 1
  const to   = Math.min(currentPage * perPage, total)

  // Build visible page numbers with ellipsis
  const pages: (number | '...')[] = []
  const delta = 1 // pages on each side of current

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
      className={cn(
        'min-w-[34px] h-[34px] px-2 rounded-md text-sm font-medium flex items-center justify-center transition-colors',
        active
          ? 'bg-primary-600 text-white'
          : 'text-gray-600 hover:bg-gray-100 disabled:opacity-40 disabled:cursor-not-allowed',
      )}
    >
      {label}
    </button>
  )

  return (
    <div className={cn('flex items-center justify-between gap-4 text-sm', className)}>
      <p className="text-gray-500 text-xs">
        Showing <span className="font-medium text-gray-700">{from}–{to}</span> of{' '}
        <span className="font-medium text-gray-700">{total}</span> results
      </p>

      <div className="flex items-center gap-1">
        {btn('first', <ChevronsLeft className="h-4 w-4" />, 1,              currentPage === 1)}
        {btn('prev',  <ChevronLeft  className="h-4 w-4" />, currentPage - 1, currentPage === 1)}

        {pages.map((p, i) =>
          p === '...'
            ? <span key={`ellipsis-${i}`} className="px-1 text-gray-400">…</span>
            : btn(`page-${p}`, p, p as number, false, p === currentPage),
        )}

        {btn('next', <ChevronRight  className="h-4 w-4" />, currentPage + 1, currentPage === lastPage)}
        {btn('last', <ChevronsRight className="h-4 w-4" />, lastPage,         currentPage === lastPage)}
      </div>
    </div>
  )
}
