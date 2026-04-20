import { cn } from '@/utils/helpers'

interface SkeletonProps {
  className?: string
}

/** Single skeleton block — add className to control size */
export function Skeleton({ className }: SkeletonProps) {
  return (
    <div className={cn('animate-pulse rounded bg-gray-200', className)} />
  )
}

/** Skeleton for a typical text row (label + value) */
export function SkeletonRow() {
  return (
    <div className="flex items-center gap-3 py-3">
      <Skeleton className="h-8 w-8 rounded-full flex-shrink-0" />
      <div className="flex-1 space-y-2">
        <Skeleton className="h-3 w-1/3" />
        <Skeleton className="h-3 w-1/2" />
      </div>
    </div>
  )
}

/** Skeleton for a data table */
export function SkeletonTable({ rows = 5, cols = 4 }: { rows?: number; cols?: number }) {
  return (
    <div className="overflow-hidden rounded-lg border border-gray-200">
      {/* Header */}
      <div className="flex gap-4 bg-gray-50 px-4 py-3 border-b border-gray-200">
        {Array.from({ length: cols }).map((_, i) => (
          <Skeleton key={i} className="h-3 flex-1" />
        ))}
      </div>
      {/* Rows */}
      {Array.from({ length: rows }).map((_, r) => (
        <div key={r} className="flex gap-4 px-4 py-3 border-b border-gray-100 last:border-0">
          {Array.from({ length: cols }).map((_, c) => (
            <Skeleton key={c} className={cn('h-3 flex-1', c === 0 ? 'w-1/4' : '')} />
          ))}
        </div>
      ))}
    </div>
  )
}

/** Skeleton for a stat/metric card */
export function SkeletonCard() {
  return (
    <div className="card space-y-3">
      <Skeleton className="h-3 w-1/3" />
      <Skeleton className="h-8 w-1/2" />
      <Skeleton className="h-3 w-2/3" />
    </div>
  )
}
