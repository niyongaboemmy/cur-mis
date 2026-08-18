# CUR-MIS Help Centre — Implementation Plan

**Author:** documentation + frontend
**Date:** 2026-08-17
**Goal:** an in-app, searchable, interactive end-user Help Centre covering every module and every workflow.

---

## 1. Research summary — what good in-app help looks like in 2026

| Source | Take-away applied here |
|---|---|
| [Diátaxis](https://diataxis.fr/) | Split content by *user need*, not by feature: **Walkthrough** (learning), **How-to** (doing), **Reference** (looking up), **Concept** (understanding). Never mix the four inside one page. |
| [Diátaxis — start here](https://diataxis.fr/start-here/) | A how-to answers "how do I…" for someone who already knows the domain; a walkthrough holds a beginner's hand. Article `kind` is a first-class field in our content model. |
| [Userpilot — help centre examples 2026](https://userpilot.com/blog/help-center-examples/) | Search bar first, categorised hub second, FAQs third. Keep the "2-minute fix" separate from the "40-minute course". |
| [UserGuiding — help centre best practices](https://userguiding.com/blog/help-center-software) | Every help centre needs: search, categories, FAQ, glossary, contact route, and troubleshooting. |
| [GrowthDot — self-service help centre design](https://growthdot.com/designs-for-your-help-center/) | Role-based entry points ("I am a student / lecturer / finance officer") beat one flat A-Z list. |

**Design decisions that follow:**

1. **Search is the front door.** Client-side, zero-latency, weighted index over titles → keywords → step text.
2. **Progressive disclosure.** Hub → module → article. Never more than 3 clicks to any step.
3. **Interactive, not a wall of text.** Steps are checkable and remember progress; FAQs are accordions; jargon is a clickable term with an inline definition.
4. **Role-aware but never hidden.** Articles are *tagged* by role/permission so users can filter, but nothing is locked — an admin must be able to read the student guide to support a student.
5. **Deep-linkable.** Every article and every step anchor has a stable URL for pasting into a support reply.

---

## 2. Information architecture

```
/help                        Hub — search, "I am a…" role picker, module grid, popular articles
/help/search?q=…             Full search results page (grouped by module, kind filter)
/help/glossary               A–Z of system keywords, jump-links, search
/help/m/:moduleId            Module index — what the module does, its workflows, article list
/help/m/:moduleId/:articleId Article — breadcrumb, meta, TOC, steps, callouts, FAQ, related
```

**16 modules** (mirrors the real sidebar so the docs map onto what the user sees):

`getting-started` · `admissions` · `applicant-portal` · `students` · `academics` ·
`modules` · `teaching` · `attendance` · `exams` · `graduation` · `finance` ·
`student-portal` · `hr` · `service-requests` · `communication` · `administration`
(+ `gate` folded into administration/operations)

---

## 3. Content model (`src/data/help/types.ts`)

```ts
HelpArticle {
  id, title, kind: 'walkthrough'|'howto'|'reference'|'concept',
  summary, minutes, audience: RoleTag[], permission?: string,
  route?: string,                 // the in-app screen it documents ("Open the screen" button)
  keywords: string[],             // search boost
  blocks: HelpBlock[]             // ordered content
}
HelpBlock =
  | { type:'paragraph', text }              // supports [[term]] glossary markup
  | { type:'steps', title?, steps: {title, detail?, tip?, route?}[] }
  | { type:'callout', tone:'info'|'tip'|'warning'|'success', title?, text }
  | { type:'list', title?, items }
  | { type:'table', head: string[], rows: string[][] }
  | { type:'faq', items: {q,a}[] }
  | { type:'terms', ids: string[] }         // inline glossary block
```

Glossary markup `[[merit list]]` renders as a `KeyTerm` chip → click shows the definition inline and links to `/help/glossary#merit-list`.

---

## 4. Components (`src/components/help/`)

| Component | Interactivity |
|---|---|
| `HelpSearchBar` | debounced, keyboard ↑↓/↵, grouped preview, "see all results" |
| `HelpStepper` | numbered steps, **checkable**, progress bar, state in `localStorage` per article, "Reset" |
| `KeyTerm` | inline chip → popover definition, deep link to glossary |
| `HelpCallout` | tone-coloured note/tip/warning/success |
| `HelpFaq` | accordion, one open at a time, deep-linkable |
| `HelpToc` | sticky right rail, scroll-spy |
| `HelpBreadcrumbs`, `HelpModuleCard`, `HelpArticleCard`, `RolePill`, `HelpBlockRenderer` |

---

## 5. Wiring into the existing app

1. **Routes** — added to `App.tsx` inside `ProtectedRoute` + `MainLayout`, **no permission gate** (help is for everyone).
2. **Sidebar** — `Help & Guides` node appended to `ADMIN_TREE` with no `permissions`, so every role sees it.
3. **Topbar** — a `?` round icon button beside the notification bells → `/help`, plus **contextual help**: it links to the article registered for the current `location.pathname` when one exists.
4. **Global search** — the requirement "if a user searches in normal search, add a link to go to help page":
   - help articles are injected into `GlobalSearch` results under a **Help & Guides** group;
   - a **pinned footer row** — *"Search the Help Centre for '<query>'"* — always appears, even when there are zero results, routing to `/help/search?q=…`.
5. **Route → article map** (`HELP_ROUTE_MAP`) powers both contextual help and "Open the screen" buttons.

---

## 6. Build order

1. `types.ts`, `glossary.ts`
2. 16 module content files
3. `index.ts` — registry, search index, route map, helpers
4. `components/help/*`
5. `pages/help/*`
6. Wiring: `App.tsx`, `MainLayout.tsx`, `GlobalSearch.tsx`
7. `npm run type-check`

---

## 7. Acceptance criteria

- [x] Every sidebar module has at least one module page and its real workflows documented step by step — **16 modules, 87 articles**.
- [x] Search returns results from titles, keywords, and step body text.
- [x] Normal (global) search always offers a route into the Help Centre (pinned footer row, shown even on zero results).
- [x] Steps are checkable and progress survives a reload (`localStorage`, per article × stepper).
- [x] Jargon is explained inline and in a glossary — **78 terms**, `[[term]]` markup resolving aliases and plurals.
- [x] Light + dark mode, mobile + desktop; wide tables scroll in their own box.
- [x] `tsc --noEmit` clean, `eslint` clean, `vite build` succeeds.

## 8. Delivered

| File(s) | Purpose |
|---|---|
| `frontend/src/data/help/types.ts` | Content model |
| `frontend/src/data/help/glossary.ts` | 78 terms + alias resolution |
| `frontend/src/data/help/modules/*.ts` (16) | The guides themselves |
| `frontend/src/data/help/index.ts` | Registry, weighted search index, route→article map |
| `frontend/src/components/help/*` (9) | Stepper, callout, FAQ, glossary chip, cards, search, launcher |
| `frontend/src/pages/help/*` (5) | Hub, module, article, search, glossary |
| `frontend/src/App.tsx` | 5 routes under `/help` |
| `frontend/src/layouts/MainLayout.tsx` | Sidebar node + top-bar `?` launcher + page titles |
| `frontend/src/components/layout/GlobalSearch.tsx` | Help results group + pinned Help Centre row |

---

## 9. Testing

Two layers, because they catch different things.

### Unit / content tests — `npm test` (57 tests, vitest)

| File | Covers |
|---|---|
| `src/data/help/__tests__/content.test.ts` | Structure (unique ids, url-safe ids, no empty blocks, table rows matching their header), **every `[[term]]` resolving**, every `terms`-block id and every glossary cross-reference resolving, **every `route` pointing at a path that actually exists in `App.tsx`**, contextual-help resolution, and that every hub-promoted article and role-journey module exists. |
| `src/data/help/__tests__/search.test.ts` | Ranking order, known query → expected article, matching on step body text, case-insensitivity, the precision floor used by global search, markup stripped from the index. |
| `src/data/help/__tests__/markup.test.ts` | The `[[term]]` / `**bold**` / `` `code` `` tokenizer, including bold wrapping a glossary term, unclosed markers, and plain-text extraction. |

The route test parses `path="…"` literals out of `App.tsx` and accounts for
React Router's relative nesting, so a guide can never ship an "Open the
screen" button that 404s.

### Browser tests — `npm run test:e2e` / `test:e2e:sweep`

`e2e/help-centre.mjs` drives headless Chromium against the running dev server:
19 interaction checks plus an optional sweep that loads **all 87 articles** and
asserts each renders real content with no raw markup. Screenshots land in
`e2e/.shots/`. It seeds an authenticated session into the persisted auth store
(the Help Centre makes no API calls); point `HELP_E2E_AUTH` at a seed file to
use a real token instead.

### What testing actually caught

| # | Found by | Defect | Fix |
|---|---|---|---|
| 1 | content test | The word **“term”** on its own resolved to no glossary entry — the entry registered `academic-term`, `terms` and `semester` but not `term`, so 11 in-text references rendered as dead words. | Added the alias. |
| 2 | search test | Search matched **step titles only**, so a query hitting a step's explanation found the article but could not point at the step. | Index step detail + tip, surface the step title. |
| 3 | **browser run** | `**[[fee structure]]**` — bold wrapping a glossary term — rendered the literal text `[[fee structure]]` on screen, in **13 places**. Invisible to `tsc`, to eslint, and to the data-layer tests. | Tokenizer now recurses into bold; extracted to `src/data/help/markup.ts` and unit-tested. |
| 4 | **screenshot** | The hub hero's `overflow-hidden` clipped the search box's own suggestion panel — half the suggestions were unreachable. | `overflow-hidden` moved onto the decoration layer. |
| 5 | **screenshot** | Role chips templated as “I am a {role}” produced *“I am a Applicant”, “I am a Administrator”, “I am a HR”*. | Chips written out per journey; a test asserts no `a` + vowel. |
| 6 | **screenshot** | `autoFocus` popped the suggestion panel open over the hero on page load. | The panel opens on click/typing, not on focus. |
| 7 | **screenshot** | Global search spent one of its four help slots on a one-shared-word match (“approve leave” → the admissions lifecycle guide). | `searchHelp` gained a `minScore`; global search uses 25. |

One sweep failure turned out **not** to be a defect: an article rendered blank
at sequence position 54. Running the sweep in reverse order failed at position
54 again — a different article — proving it was the single-threaded `php -S`
dev backend stalling, not content. The sweep retries once and reports it.

### Known-good baseline

`tsc --noEmit` clean · `eslint` clean on every file this work touches (8
pre-existing errors remain in `WelcomePage.tsx`, `systemDocumentService.ts`,
two leave components and `vite.config.ts`, all untouched here) · 57 unit tests
green · 19 browser checks green · 87/87 articles render clean · `vite build`
succeeds.
