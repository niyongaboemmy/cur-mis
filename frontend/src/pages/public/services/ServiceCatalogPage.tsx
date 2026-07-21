import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { FileText, ArrowRight, Search } from "lucide-react";
import { useState } from "react";
import Logo from "@/components/brand/Logo";
import { serviceCatalogService } from "@/services/serviceCatalogService";

export default function ServiceCatalogPage() {
  const [search, setSearch] = useState("");

  const servicesQ = useQuery({
    queryKey: ["services", "public", "catalog"],
    queryFn: ({ signal }) => serviceCatalogService.getPublicList(signal),
  });

  const services = servicesQ.data?.data ?? [];
  const filtered = services.filter(
    (s) =>
      s.name.toLowerCase().includes(search.toLowerCase()) ||
      (s.category ?? "").toLowerCase().includes(search.toLowerCase()),
  );

  return (
    <Shell>
      <div className="max-w-5xl mx-auto space-y-8">
        <div className="text-center space-y-2">
          <h1 className="text-2xl sm:text-3xl font-bold text-ink-900 dark:text-white">
            Request a Service
          </h1>
          <p className="text-[14px] text-ink-500 dark:text-ink-400">
            Browse available services, then log in to submit a request.
          </p>
          <div className="pt-2">
            <Link to="/services/track" className="text-[13px] text-brand hover:underline">
              Already submitted a request? Track its status →
            </Link>
          </div>
        </div>

        <div className="relative max-w-md mx-auto">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-400" />
          <input
            className="input pl-10"
            placeholder="Search services..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        {servicesQ.isLoading && (
          <p className="text-center text-ink-400 py-10">Loading services...</p>
        )}

        {!servicesQ.isLoading && filtered.length === 0 && (
          <p className="text-center text-ink-400 py-10">No services found.</p>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {filtered.map((service) => (
            <Link
              key={service.id}
              to={`/services/${service.slug}`}
              className="card p-5 space-y-3 hover:shadow-md transition-shadow group"
            >
              <div className="w-10 h-10 rounded-xl bg-brand/10 text-brand flex items-center justify-center">
                <FileText className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-semibold text-ink-900 dark:text-white group-hover:text-brand transition-colors">
                  {service.name}
                </h3>
                {service.category && (
                  <p className="text-[11px] uppercase tracking-wide text-ink-400 mt-0.5">{service.category}</p>
                )}
              </div>
              <p className="text-[13px] text-ink-500 dark:text-ink-400 leading-relaxed line-clamp-2">
                {service.short_description}
              </p>
              <div className="flex items-center justify-between pt-1 text-[13px]">
                <span className="font-semibold text-ink-900 dark:text-white">
                  {service.requires_payment ? `${service.fee_amount.toLocaleString()} ${service.fee_currency}` : "Free"}
                </span>
                <span className="inline-flex items-center gap-1 text-brand font-medium">
                  View details <ArrowRight className="w-3.5 h-3.5" />
                </span>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </Shell>
  );
}

export function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-slate-50/50 dark:bg-ink-900">
      <header className="bg-white dark:bg-ink-800 border-b border-ink-100 dark:border-ink-700 py-4 px-4 sm:px-6 sticky top-0 z-50">
        <div className="w-full max-w-7xl mx-auto flex items-center justify-between">
          <Logo />
          <Link to="/login" className="text-[13px] text-ink-600 dark:text-ink-300 hover:text-brand">
            Staff / Student Access
          </Link>
        </div>
      </header>
      <main className="w-full max-w-[min(1280px,100%-2rem)] sm:max-w-[min(1280px,100%-2.5rem)] lg:max-w-6xl xl:max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 md:py-12">
        {children}
      </main>
    </div>
  );
}
