import { toPlainText } from "./markup";
import type {
  ArticleKind,
  HelpArticle,
  HelpModule,
  RoleTag,
  SearchDoc,
} from "./types";

import { gettingStarted } from "./modules/getting-started";
import { admissions } from "./modules/admissions";
import { applicantPortal } from "./modules/applicant-portal";
import { students } from "./modules/students";
import { academics } from "./modules/academics";
import { modulesCourses } from "./modules/modules-courses";
import { teaching } from "./modules/teaching";
import { attendance } from "./modules/attendance";
import { exams } from "./modules/exams";
import { graduation } from "./modules/graduation";
import { finance } from "./modules/finance";
import { studentPortal } from "./modules/student-portal";
import { hr } from "./modules/hr";
import { serviceRequests } from "./modules/service-requests";
import { communication } from "./modules/communication";
import { administration } from "./modules/administration";

export * from "./types";
export { GLOSSARY, GLOSSARY_BY_ID, lookupTerm } from "./glossary";
export { tokenize, toPlainText, type RichToken } from "./markup";

/** Order matters — this is the order of the module grid on the hub. */
export const HELP_MODULES: HelpModule[] = [
  gettingStarted,
  applicantPortal,
  admissions,
  students,
  academics,
  modulesCourses,
  teaching,
  attendance,
  exams,
  graduation,
  finance,
  studentPortal,
  hr,
  serviceRequests,
  communication,
  administration,
];

export const KIND_META: Record<
  ArticleKind,
  { label: string; blurb: string; icon: string }
> = {
  walkthrough: {
    label: "Walkthrough",
    blurb: "Learn it from zero, start to finish",
    icon: "GraduationCap",
  },
  howto: {
    label: "How-to",
    blurb: "Do one specific task, now",
    icon: "ListChecks",
  },
  reference: {
    label: "Reference",
    blurb: "Look up a fact, a field or a status",
    icon: "Table2",
  },
  concept: {
    label: "Concept",
    blurb: "Understand why it works this way",
    icon: "Lightbulb",
  },
};

/** Every audience tag actually used, in a sensible presentation order. */
export const ROLE_TAGS: RoleTag[] = [
  "Everyone",
  "Student",
  "Applicant",
  "Lecturer",
  "Registry",
  "Admissions",
  "Exams",
  "Finance",
  "HR",
  "Administrator",
  "Security",
  "Public",
];

/* ------------------------------------------------------------------ */
/*  Lookups                                                            */
/* ------------------------------------------------------------------ */

export function getModule(moduleId?: string): HelpModule | undefined {
  return HELP_MODULES.find((m) => m.id === moduleId);
}

export function getArticle(
  moduleId?: string,
  articleId?: string,
): { module: HelpModule; article: HelpArticle } | undefined {
  const module = getModule(moduleId);
  const article = module?.articles.find((a) => a.id === articleId);
  return module && article ? { module, article } : undefined;
}

/** Previous/next within a module, for end-of-article navigation. */
export function siblingArticles(moduleId: string, articleId: string) {
  const module = getModule(moduleId);
  if (!module) return { prev: undefined, next: undefined };
  const i = module.articles.findIndex((a) => a.id === articleId);
  return {
    prev: i > 0 ? module.articles[i - 1] : undefined,
    next: i >= 0 && i < module.articles.length - 1 ? module.articles[i + 1] : undefined,
  };
}

/* ------------------------------------------------------------------ */
/*  Search index                                                       */
/* ------------------------------------------------------------------ */

/** Strip every marker so search matches the words a reader actually sees. */
const plain = toPlainText;

function articleText(article: HelpArticle): {
  steps: string[];
  stepText: string[];
  body: string;
} {
  const steps: string[] = [];
  const stepText: string[] = [];
  const body: string[] = [article.title, article.summary, ...(article.keywords ?? [])];

  for (const block of article.blocks) {
    switch (block.type) {
      case "paragraph":
        body.push(block.text);
        break;
      case "steps":
        for (const s of block.steps) {
          steps.push(plain(s.title));
          // A step is searchable by everything it says, not just its heading —
          // readers search for the noun in the explanation ("carousel"), not
          // the imperative in the title.
          stepText.push(
            plain([s.title, s.detail ?? "", s.tip ?? ""].join(" ")).toLowerCase(),
          );
          body.push(s.title, s.detail ?? "", s.tip ?? "");
        }
        break;
      case "callout":
        body.push(block.title ?? "", block.text);
        break;
      case "list":
        body.push(block.title ?? "", ...block.items);
        break;
      case "table":
        body.push(block.title ?? "", ...block.head, ...block.rows.flat());
        break;
      case "faq":
        for (const f of block.items) body.push(f.q, f.a);
        break;
      case "terms":
        body.push(...block.ids);
        break;
    }
  }
  return { steps, stepText, body: plain(body.join(" ")).toLowerCase() };
}

export const SEARCH_DOCS: SearchDoc[] = HELP_MODULES.flatMap((m) =>
  m.articles.map((a) => {
    const { steps, stepText, body } = articleText(a);
    return {
      moduleId: m.id,
      moduleTitle: m.title,
      accent: m.accent,
      articleId: a.id,
      title: a.title,
      kind: a.kind,
      summary: a.summary,
      audience: a.audience,
      minutes: a.minutes,
      route: a.route,
      haystack: `${m.title} ${body}`.toLowerCase(),
      steps,
      stepText,
    };
  }),
);

export type SearchHit = SearchDoc & {
  score: number;
  /** The step whose text matched, when the match was in a step. */
  matchedStep?: string;
};

/**
 * Weighted substring search. Deliberately not fuzzy: users searching a help
 * centre type words they have just read on screen, and a fuzzy matcher mostly
 * adds wrong answers with confident scores.
 */
export function searchHelp(
  rawQuery: string,
  limit = 40,
  /**
   * Drop weak matches. The Help Centre's own results page wants recall, but a
   * caller with four slots — the global search bar — wants precision: a loose
   * word-overlap hit there reads as a wrong answer, not a generous one.
   */
  minScore = 0,
): SearchHit[] {
  const q = rawQuery.trim().toLowerCase();
  if (q.length < 2) return [];
  const words = q.split(/\s+/).filter(Boolean);

  const hits: SearchHit[] = [];

  for (const doc of SEARCH_DOCS) {
    let score = 0;
    const title = doc.title.toLowerCase();
    const summary = doc.summary.toLowerCase();

    if (title === q) score += 200;
    if (title.includes(q)) score += 100;
    if (summary.includes(q)) score += 40;
    if (doc.moduleTitle.toLowerCase().includes(q)) score += 25;

    // Prefer a title hit (the reader recognises the step they need), but fall
    // back to the step's explanatory text so the result still points somewhere.
    let matchedStep: string | undefined;
    for (const [i, step] of doc.steps.entries()) {
      if (step.toLowerCase().includes(q)) {
        score += 30;
        matchedStep = step;
        break;
      }
      if (matchedStep === undefined && doc.stepText[i]?.includes(q)) {
        score += 18;
        matchedStep = step;
      }
    }

    // Every word present somewhere is worth something, so multi-word
    // queries ("approve leave") still find an article titled differently.
    let wordHits = 0;
    for (const w of words) {
      if (title.includes(w)) score += 12;
      if (doc.haystack.includes(w)) {
        score += 4;
        wordHits += 1;
      }
    }
    if (wordHits === words.length) score += 15;

    if (doc.haystack.includes(q)) score += 10;

    if (score > minScore) hits.push({ ...doc, score, matchedStep });
  }

  return hits.sort((a, b) => b.score - a.score || a.title.localeCompare(b.title)).slice(0, limit);
}

/* ------------------------------------------------------------------ */
/*  Contextual help — "explain the screen I am on"                     */
/* ------------------------------------------------------------------ */

type RouteTarget = { moduleId: string; articleId: string; title: string };

/**
 * route → best article, built from every `route` declared on an article and
 * on a module. Longest path wins, so `/finance/approvals` beats `/finance`.
 */
const ROUTE_TARGETS: [string, RouteTarget][] = (() => {
  const entries: [string, RouteTarget][] = [];
  for (const m of HELP_MODULES) {
    for (const a of m.articles) {
      if (!a.route) continue;
      const path = a.route.split("?")[0];
      entries.push([path, { moduleId: m.id, articleId: a.id, title: a.title }]);
    }
    // Module-level fallback: the module's first article answers "what is this screen".
    for (const r of m.routes ?? []) {
      const path = r.split("?")[0];
      const first = m.articles[0];
      if (first) entries.push([path, { moduleId: m.id, articleId: first.id, title: first.title }]);
    }
  }
  // Longest (most specific) first, and keep the first target registered for
  // a path — article routes are pushed before module fallbacks.
  const seen = new Set<string>();
  return entries
    .filter(([p]) => (seen.has(p) ? false : (seen.add(p), true)))
    .sort((a, b) => b[0].length - a[0].length);
})();

/** The help article that best explains the given app route, if any. */
export function helpForRoute(pathname: string): RouteTarget | undefined {
  for (const [path, target] of ROUTE_TARGETS) {
    if (pathname === path) return target;
  }
  for (const [path, target] of ROUTE_TARGETS) {
    if (path !== "/" && pathname.startsWith(path + "/")) return target;
  }
  return undefined;
}

export function helpPath(moduleId: string, articleId?: string): string {
  return articleId ? `/help/m/${moduleId}/${articleId}` : `/help/m/${moduleId}`;
}

/** Articles surfaced on the hub as "start here". */
export const POPULAR_ARTICLES: { moduleId: string; articleId: string }[] = [
  { moduleId: "getting-started", articleId: "first-login" },
  { moduleId: "administration", articleId: "troubleshooting" },
  { moduleId: "student-portal", articleId: "my-finance" },
  { moduleId: "modules", articleId: "term-setup" },
  { moduleId: "finance", articleId: "payments" },
  { moduleId: "hr", articleId: "request-leave" },
  { moduleId: "teaching", articleId: "enter-marks" },
  { moduleId: "service-requests", articleId: "how-it-works" },
];

/** Role → the modules that role most often needs, for the "I am a…" picker. */
export const ROLE_JOURNEYS: {
  role: RoleTag;
  /** How the picker button reads. Written out rather than templated, because
   *  "I am a Applicant" / "I am a HR" is what templating produces. */
  chip: string;
  icon: string;
  blurb: string;
  moduleIds: string[];
}[] = [
  {
    role: "Student",
    chip: "I am a student",
    icon: "GraduationCap",
    blurb: "Register, study, pay, graduate",
    moduleIds: ["getting-started", "student-portal", "modules", "exams", "service-requests", "attendance"],
  },
  {
    role: "Applicant",
    chip: "I am applying to CUR",
    icon: "UserPlus",
    blurb: "Apply and track your application",
    moduleIds: ["applicant-portal", "getting-started"],
  },
  {
    role: "Lecturer",
    chip: "I teach",
    icon: "Presentation",
    blurb: "Teach, take registers, record marks",
    moduleIds: ["teaching", "attendance", "modules", "exams", "communication"],
  },
  {
    role: "Registry",
    chip: "I work in the registry",
    icon: "Layers",
    blurb: "Structure, records, results, graduation",
    moduleIds: ["students", "academics", "modules", "exams", "graduation", "service-requests"],
  },
  {
    role: "Admissions",
    chip: "I work in admissions",
    icon: "Files",
    blurb: "Applications through to enrolment",
    moduleIds: ["admissions", "students", "applicant-portal"],
  },
  {
    role: "Finance",
    chip: "I work in finance",
    icon: "CreditCard",
    blurb: "Fees, payments, budgets, reporting",
    moduleIds: ["finance", "students", "service-requests"],
  },
  {
    role: "HR",
    chip: "I work in HR",
    icon: "Briefcase",
    blurb: "Staff, payroll, leave, appraisals",
    moduleIds: ["hr", "administration"],
  },
  {
    role: "Administrator",
    chip: "I administer the system",
    icon: "ShieldCheck",
    blurb: "Users, access, logs, configuration",
    moduleIds: ["administration", "academics", "service-requests", "communication"],
  },
];

export const HELP_STATS = {
  modules: HELP_MODULES.length,
  articles: SEARCH_DOCS.length,
  steps: SEARCH_DOCS.reduce((n, d) => n + d.steps.length, 0),
};
