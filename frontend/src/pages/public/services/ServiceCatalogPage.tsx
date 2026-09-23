import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { FileText, ArrowRight, Search, LifeBuoy } from "lucide-react";
import { useMemo, useState } from "react";
import Logo from "@/components/brand/Logo";
import { serviceCatalogService } from "@/services/serviceCatalogService";

export default function ServiceCatalogPage() {
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("All");

  const servicesQ = useQuery({
    queryKey: ["services", "public", "catalog"],
    queryFn: ({ signal }) => serviceCatalogService.getPublicList(signal),
  });

  const services = servicesQ.data?.data ?? [];

  const categories = useMemo(() => {
    const set = new Set<string>();
    services.forEach((s) => s.category && set.add(s.category));
    return ["All", ...Array.from(set).sort()];
  }, [services]);

  const filtered = services.filter(
    (s) =>
      (category === "All" || s.category === category) &&
      (s.name.toLowerCase().includes(search.toLowerCase()) ||
        (s.category ?? "").toLowerCase().includes(search.toLowerCase())),
  );

  return (
    <Shell>
      <div className="max-w-5xl mx-auto space-y-8">
        <div className="text-center space-y-2">
          <h1 className="text-2xl sm:text-3xl font-bold text-ink-900 dark:text-white tracking-tight">
            Request a Service
          </h1>
          <p className="text-[14px] text-ink-500 dark:text-ink-400">
            Browse available services, then log in to submit a request.
          </p>
          <div className="pt-2">
            <Link to="/services/track" className="text-[13px] text-brand hover:underline font-medium">
              Already submitted a request? Track its status →
            </Link>
          </div>
        </div>

        <div className="space-y-4">
          <div className="relative max-w-md mx-auto">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-400" />
            <input
              className="input pl-10"
              placeholder="Search services..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          {categories.length > 1 && (
            <div className="flex flex-wrap items-center justify-center gap-2">
              {categories.map((c) => (
                <button
                  key={c}
                  onClick={() => setCategory(c)}
                  className={`px-3.5 py-1.5 rounded-full text-[12.5px] font-semibold transition-colors ${
                    category === c
                      ? "bg-brand text-white"
                      : "bg-white dark:bg-ink-800 text-ink-500 dark:text-ink-400 border border-ink-100 dark:border-ink-700 hover:border-brand/40 hover:text-brand"
                  }`}
                >
                  {c}
                </button>
              ))}
            </div>
          )}
        </div>

        {servicesQ.isLoading && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="card p-5 space-y-3 animate-pulse">
                <div className="w-10 h-10 rounded-xl bg-ink-100 dark:bg-ink-700" />
                <div className="h-4 w-2/3 rounded bg-ink-100 dark:bg-ink-700" />
                <div className="h-3 w-full rounded bg-ink-100 dark:bg-ink-700" />
                <div className="h-3 w-4/5 rounded bg-ink-100 dark:bg-ink-700" />
                <div className="h-4 w-1/3 rounded bg-ink-100 dark:bg-ink-700 mt-2" />
              </div>
            ))}
          </div>
        )}

        {!servicesQ.isLoading && filtered.length === 0 && (
          <div className="text-center py-16 space-y-2">
            <FileText className="w-10 h-10 text-ink-300 mx-auto" />
            <p className="text-ink-400 text-[14px]">No services match your search.</p>
          </div>
        )}

        {!servicesQ.isLoading && filtered.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {filtered.map((service) => (
              <Link
                key={service.id}
                to={`/services/${service.slug}`}
                className="card p-5 space-y-3 hover:shadow-lg hover:-translate-y-0.5 transition-all duration-200 group"
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
                    View details <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" />
                  </span>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </Shell>
  );
}

export function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex flex-col bg-slate-50/50 dark:bg-ink-900">
      <header className="bg-white/90 dark:bg-ink-800/90 backdrop-blur-sm border-b border-ink-100 dark:border-ink-700 py-4 px-4 sm:px-6 sticky top-0 z-50">
        <div className="w-full max-w-7xl mx-auto flex items-center justify-between">
          <Logo />
          <Link
            to="/login"
            className="text-[13px] text-ink-600 dark:text-ink-300 hover:text-brand font-medium transition-colors"
          >
            Staff / Student Access
          </Link>
        </div>
      </header>
      <main className="flex-1 w-full max-w-[min(1280px,100%-2rem)] sm:max-w-[min(1280px,100%-2.5rem)] lg:max-w-6xl xl:max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 md:py-12">
        {children}
      </main>
      <footer className="border-t border-ink-100 dark:border-ink-800 py-5 px-4 sm:px-6">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-2 text-[12px] text-ink-400">
          <span>© {new Date().getFullYear()} Catholic University of Rwanda — CUR-MIS</span>
          <span className="inline-flex items-center gap-1.5">
            <LifeBuoy className="w-3.5 h-3.5" /> Need help? Contact the registrar's office.
          </span>
        </div>
      </footer>
    </div>
  );
}
