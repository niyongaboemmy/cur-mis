import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  ArrowRight,
  BookMarked,
  Compass,
  LifeBuoy,
  Sparkles,
} from "lucide-react";
import {
  HELP_MODULES,
  HELP_STATS,
  KIND_META,
  POPULAR_ARTICLES,
  ROLE_JOURNEYS,
  getArticle,
  getModule,
  helpPath,
} from "@/data/help";
import type { ArticleKind } from "@/data/help/types";
import HelpSearchBar from "@/components/help/HelpSearchBar";
import { ArticleCard, ModuleCard } from "@/components/help/HelpCards";
import { ACCENT, icon } from "@/components/help/helpUi";
import { useAuthStore } from "@/store/authStore";

/** Map a system role slug onto the closest "I am a…" journey. */
const ROLE_HINT: Record<string, string> = {
  student: "Student",
  applicant: "Applicant",
  lecturer: "Lecturer",
  HOD: "Lecturer",
  hr_manager: "HR",
  finance_officer: "Finance",
  registrar: "Registry",
  admin: "Administrator",
  superadmin: "Administrator",
};

export default function HelpCenterPage() {
  const { user } = useAuthStore();
  const suggested = ROLE_HINT[user?.role ?? ""] ?? null;
  const [journey, setJourney] = useState<string | null>(suggested);

  const activeJourney = useMemo(
    () => ROLE_JOURNEYS.find((j) => j.role === journey),
    [journey],
  );

  const popular = POPULAR_ARTICLES.flatMap((p) => {
    const found = getArticle(p.moduleId, p.articleId);
    return found ? [found] : [];
  });

  return (
    <div className="max-w-6xl mx-auto pb-16">
      {/* ── Hero ─────────────────────────────────────────────────── */}
      {/* `overflow-hidden` belongs to the decoration, NOT the section — putting
          it on the section clipped the search box's own results panel. */}
      <section className="relative mt-6 rounded-3xl bg-gradient-primary text-white px-6 sm:px-10 py-10 sm:py-12">
        <div className="absolute inset-0 rounded-3xl overflow-hidden pointer-events-none">
          <div className="absolute -right-16 -top-16 w-64 h-64 rounded-full bg-white/5" />
          <div className="absolute -right-4 top-24 w-40 h-40 rounded-full bg-gold-500/10" />
        </div>

        <div className="relative max-w-2xl">
          <span className="inline-flex items-center gap-2 px-2.5 py-1 rounded-full bg-white/15 text-[11.5px] font-medium mb-4">
            <LifeBuoy className="w-3.5 h-3.5" />
            Help Centre
          </span>
          <h1 className="text-2xl sm:text-3xl font-semibold leading-tight">
            How can we help you today?
          </h1>
          <p className="mt-2.5 text-[14px] text-white/80 leading-relaxed">
            Step-by-step guides for every module of CUR-MIS — written for the
            person doing the job, not the person who built it.
          </p>

          <div className="mt-6">
            <HelpSearchBar autoFocus />
          </div>

          <p className="mt-4 text-[12px] text-white/70">
            {HELP_STATS.modules} modules · {HELP_STATS.articles} guides ·{" "}
            {HELP_STATS.steps} documented steps
          </p>
        </div>
      </section>

      {/* ── Role picker ──────────────────────────────────────────── */}
      <section className="mt-10">
        <header className="flex items-center gap-2 mb-1">
          <Compass className="w-4 h-4 text-primary-500" />
          <h2 className="text-[15px] font-semibold text-ink-900 dark:text-white">
            Start with your job
          </h2>
        </header>
        <p className="text-[13px] text-ink-500 dark:text-ink-400 mb-4">
          Pick the description closest to what you do and we will put the right
          modules in front of you.
          {suggested && (
            <span className="ml-1">
              Based on your account, we think you are a{" "}
              <span className="font-medium text-ink-700 dark:text-ink-200">
                {suggested}
              </span>
              .
            </span>
          )}
        </p>

        <div className="flex flex-wrap gap-2">
          {ROLE_JOURNEYS.map((j) => {
            const Icon = icon(j.icon);
            const isActive = journey === j.role;
            return (
              <button
                key={j.role}
                type="button"
                onClick={() => setJourney(isActive ? null : j.role)}
                aria-pressed={isActive}
                className={`inline-flex items-center gap-2 px-3.5 py-2 rounded-xl border text-[13px] font-medium transition-all ${
                  isActive
                    ? "border-primary-300 bg-primary-50 text-primary-700 dark:border-primary-500/40 dark:bg-primary-500/15 dark:text-primary-200"
                    : "border-ink-100 dark:border-ink-700 bg-white dark:bg-ink-800 text-ink-600 dark:text-ink-300 hover:border-primary-200 dark:hover:border-primary-500/30"
                }`}
              >
                <Icon className="w-4 h-4" />
                {j.chip}
              </button>
            );
          })}
        </div>

        {activeJourney && (
          <div className="mt-5 rounded-2xl border border-primary-100 dark:border-primary-500/20 bg-primary-50/40 dark:bg-primary-500/5 p-5 animate-fade-up">
            <p className="text-[13px] text-ink-600 dark:text-ink-300 mb-4">
              <span className="font-semibold text-ink-900 dark:text-white">
                {activeJourney.role}:
              </span>{" "}
              {activeJourney.blurb}. These are the modules you will live in.
            </p>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {activeJourney.moduleIds
                .map((id) => getModule(id))
                .filter(Boolean)
                .map((m) => {
                  const mod = m!;
                  const Icon = icon(mod.icon);
                  const accent = ACCENT[mod.accent];
                  return (
                    <Link
                      key={mod.id}
                      to={helpPath(mod.id)}
                      className="group flex items-center gap-3 rounded-xl border border-ink-100 dark:border-ink-700 bg-white dark:bg-ink-800 px-3.5 py-3 hover:border-primary-300 dark:hover:border-primary-500/40 transition-colors"
                    >
                      <span className={`w-8 h-8 rounded-lg grid place-items-center shrink-0 ${accent.chip}`}>
                        <Icon className="w-4 h-4" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-[13px] font-medium text-ink-900 dark:text-white truncate">
                          {mod.title}
                        </span>
                        <span className="block text-[11.5px] text-ink-400 truncate">
                          {mod.articles.length} guides
                        </span>
                      </span>
                      <ArrowRight className="w-4 h-4 text-ink-300 group-hover:text-primary-500 group-hover:translate-x-0.5 transition-all" />
                    </Link>
                  );
                })}
            </div>
          </div>
        )}
      </section>

      {/* ── Popular ──────────────────────────────────────────────── */}
      <section className="mt-10">
        <header className="flex items-center gap-2 mb-4">
          <Sparkles className="w-4 h-4 text-gold-500" />
          <h2 className="text-[15px] font-semibold text-ink-900 dark:text-white">
            Most-read guides
          </h2>
        </header>
        <div className="grid gap-3 sm:grid-cols-2">
          {popular.map(({ article, module }) => (
            <ArticleCard
              key={`${module.id}-${article.id}`}
              moduleId={module.id}
              article={article}
              moduleTitle={module.title}
            />
          ))}
        </div>
      </section>

      {/* ── All modules ──────────────────────────────────────────── */}
      <section className="mt-10">
        <header className="mb-1">
          <h2 className="text-[15px] font-semibold text-ink-900 dark:text-white">
            Browse every module
          </h2>
        </header>
        <p className="text-[13px] text-ink-500 dark:text-ink-400 mb-4">
          Each module mirrors a section of the sidebar, so what you read here is
          laid out the way the system is.
        </p>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {HELP_MODULES.map((m) => (
            <ModuleCard key={m.id} module={m} />
          ))}
        </div>
      </section>

      {/* ── Kinds + glossary ─────────────────────────────────────── */}
      <section className="mt-10 grid gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2 rounded-2xl border border-ink-100 dark:border-ink-700 bg-white dark:bg-ink-800 p-5">
          <h2 className="text-[14px] font-semibold text-ink-900 dark:text-white mb-1">
            Four kinds of guide
          </h2>
          <p className="text-[12.5px] text-ink-500 dark:text-ink-400 mb-4">
            Every article answers exactly one kind of question, so you are never
            handed a lesson when you wanted a two-minute fix.
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            {(Object.keys(KIND_META) as ArticleKind[]).map((k) => {
              const Icon = icon(KIND_META[k].icon);
              return (
                <div
                  key={k}
                  className="flex items-start gap-3 rounded-xl bg-ink-50/70 dark:bg-ink-700/30 p-3.5"
                >
                  <Icon className="w-4 h-4 mt-0.5 text-primary-500 shrink-0" />
                  <div>
                    <p className="text-[12.5px] font-semibold text-ink-900 dark:text-white">
                      {KIND_META[k].label}
                    </p>
                    <p className="text-[12px] text-ink-500 dark:text-ink-400">
                      {KIND_META[k].blurb}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <Link
          to="/help/glossary"
          className="group rounded-2xl border border-ink-100 dark:border-ink-700 bg-white dark:bg-ink-800 p-5 flex flex-col hover:border-primary-300 dark:hover:border-primary-500/40 transition-colors"
        >
          <span className="w-10 h-10 rounded-xl grid place-items-center mb-3.5 bg-primary-50 text-primary-700 dark:bg-primary-500/15 dark:text-primary-300">
            <BookMarked className="w-[18px] h-[18px]" />
          </span>
          <h2 className="text-[14px] font-semibold text-ink-900 dark:text-white">
            Glossary
          </h2>
          <p className="mt-1.5 text-[12.5px] leading-relaxed text-ink-500 dark:text-ink-400 flex-1">
            Every word the system uses on screen, explained without using
            another word you would also have to look up.
          </p>
          <span className="mt-3.5 inline-flex items-center gap-1 text-[12.5px] font-medium text-primary-600 dark:text-primary-300">
            Open the glossary
            <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" />
          </span>
        </Link>
      </section>
    </div>
  );
}
