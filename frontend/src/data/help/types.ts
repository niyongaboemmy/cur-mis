/**
 * Help Centre content model.
 *
 * Structure follows the Diátaxis split (https://diataxis.fr/) — each article
 * serves exactly ONE user need, declared in `kind`:
 *
 *   walkthrough — "teach me from zero"  (a lesson, start to finish)
 *   howto       — "I need to do X now"  (a task recipe)
 *   reference   — "what does this field mean" (facts, tables, statuses)
 *   concept     — "why does it work this way" (background, explanation)
 *
 * Content is plain data so it can be searched client-side with no network
 * round-trip, and so writers can extend it without touching components.
 */

/** Audience tags — deliberately plain-English, not permission slugs. */
export type RoleTag =
  | "Everyone"
  | "Applicant"
  | "Student"
  | "Lecturer"
  | "Registry"
  | "Admissions"
  | "Finance"
  | "HR"
  | "Exams"
  | "Administrator"
  | "Security"
  | "Public";

export type ArticleKind = "walkthrough" | "howto" | "reference" | "concept";

export type CalloutTone = "info" | "tip" | "warning" | "success";

export type HelpStep = {
  /** Imperative, one action: "Click **Generate invoices**". */
  title: string;
  /** What happens / what to fill in. Supports [[glossary term]] markup. */
  detail?: string;
  /** Optional short aside shown as a muted tip line. */
  tip?: string;
  /** In-app route this step happens on — renders an "Open" shortcut. */
  route?: string;
};

export type HelpBlock =
  | { type: "paragraph"; text: string }
  | { type: "steps"; title?: string; steps: HelpStep[] }
  | { type: "callout"; tone: CalloutTone; title?: string; text: string }
  | { type: "list"; title?: string; ordered?: boolean; items: string[] }
  | { type: "table"; title?: string; head: string[]; rows: string[][] }
  | { type: "faq"; title?: string; items: { q: string; a: string }[] }
  | { type: "terms"; title?: string; ids: string[] };

export type HelpArticle = {
  /** URL-safe, unique within its module. */
  id: string;
  title: string;
  kind: ArticleKind;
  /** One sentence — shown on cards and in search results. */
  summary: string;
  /** Rough reading/doing time in minutes. */
  minutes: number;
  audience: RoleTag[];
  /** Plain-English note about the access needed, e.g. "Needs: Manage finance". */
  access?: string;
  /** The screen this article documents. Powers "Open the screen" + contextual help. */
  route?: string;
  /** Extra search terms users are likely to type. */
  keywords?: string[];
  blocks: HelpBlock[];
};

export type HelpModule = {
  id: string;
  title: string;
  /** lucide-react icon name, resolved in the UI layer. */
  icon: string;
  /** One line for the module card. */
  summary: string;
  /** Longer framing paragraph for the module page. */
  intro: string;
  audience: RoleTag[];
  /** Tailwind accent used for the module card + header, e.g. "sky". */
  accent: AccentName;
  /** Main screens this module lives on — used for contextual help matching. */
  routes?: string[];
  articles: HelpArticle[];
};

export type AccentName =
  | "sky"
  | "violet"
  | "emerald"
  | "amber"
  | "rose"
  | "cyan"
  | "indigo"
  | "teal"
  | "orange"
  | "slate";

export type GlossaryTerm = {
  /** kebab-case anchor, e.g. "merit-list". */
  id: string;
  term: string;
  /** Other spellings that should resolve to this term in [[…]] markup. */
  aliases?: string[];
  /** Two or three sentences, no jargon-inside-jargon. */
  definition: string;
  /** Where the term is used in the system. */
  seenIn?: string;
  /** Related glossary ids. */
  related?: string[];
};

/** A flattened, searchable record. Built once at module load. */
export type SearchDoc = {
  moduleId: string;
  moduleTitle: string;
  accent: AccentName;
  articleId: string;
  title: string;
  kind: ArticleKind;
  summary: string;
  audience: RoleTag[];
  minutes: number;
  route?: string;
  /** Lower-cased haystack: title + summary + keywords + every step title. */
  haystack: string;
  /** Step titles kept separately so search can show the matching step. */
  steps: string[];
  /** Lower-cased title + detail + tip per step, index-aligned with `steps`. */
  stepText: string[];
};
