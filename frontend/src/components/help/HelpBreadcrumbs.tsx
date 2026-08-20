import { Link } from "react-router-dom";
import { ChevronRight, LifeBuoy } from "lucide-react";

export default function HelpBreadcrumbs({
  trail,
}: {
  trail: { label: string; to?: string }[];
}) {
  return (
    <nav aria-label="Breadcrumb" className="flex items-center gap-1.5 flex-wrap text-[12px]">
      <Link
        to="/help"
        className="inline-flex items-center gap-1.5 text-ink-500 dark:text-ink-400 hover:text-primary-600 dark:hover:text-primary-300 transition-colors"
      >
        <LifeBuoy className="w-3.5 h-3.5" />
        Help Centre
      </Link>
      {trail.map((crumb, i) => (
        <span key={i} className="inline-flex items-center gap-1.5">
          <ChevronRight className="w-3 h-3 text-ink-300" />
          {crumb.to ? (
            <Link
              to={crumb.to}
              className="text-ink-500 dark:text-ink-400 hover:text-primary-600 dark:hover:text-primary-300 transition-colors"
            >
              {crumb.label}
            </Link>
          ) : (
            <span className="text-ink-800 dark:text-ink-100 font-medium">{crumb.label}</span>
          )}
        </span>
      ))}
    </nav>
  );
}
