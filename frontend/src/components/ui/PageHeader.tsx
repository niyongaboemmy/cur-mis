import { type ReactNode } from 'react'
import { ChevronRight, Home } from 'lucide-react'
import { Link } from 'react-router-dom'
import { cn } from '@/utils/helpers'

interface BreadcrumbItem {
  label: string
  href?: string
}

interface PageHeaderProps {
  title:        string
  description?: string
  breadcrumbs?: BreadcrumbItem[]
  actions?:     ReactNode
  className?:   string
}

export default function PageHeader({ title, description, breadcrumbs, actions, className }: PageHeaderProps) {
  return (
    <div className={cn('mb-6', className)}>
      {/* Breadcrumbs */}
      {breadcrumbs && breadcrumbs.length > 0 && (
        <nav className="flex items-center gap-1 text-sm text-gray-500 mb-2" aria-label="Breadcrumb">
          <Link to="/" className="hover:text-gray-700 transition-colors">
            <Home className="h-3.5 w-3.5" />
          </Link>
          {breadcrumbs.map((crumb, i) => (
            <span key={i} className="flex items-center gap-1">
              <ChevronRight className="h-3.5 w-3.5 text-gray-400" />
              {crumb.href && i < breadcrumbs.length - 1 ? (
                <Link to={crumb.href} className="hover:text-gray-700 transition-colors">
                  {crumb.label}
                </Link>
              ) : (
                <span className={i === breadcrumbs.length - 1 ? 'text-gray-900 font-medium' : ''}>
                  {crumb.label}
                </span>
              )}
            </span>
          ))}
        </nav>
      )}

      {/* Title row */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{title}</h1>
          {description && <p className="mt-1 text-sm text-gray-500">{description}</p>}
        </div>
        {actions && <div className="flex items-center gap-2 flex-shrink-0">{actions}</div>}
      </div>
    </div>
  )
}
