import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { HELP_MODULES, SEARCH_DOCS, helpForRoute, helpPath, POPULAR_ARTICLES, ROLE_JOURNEYS, getArticle, getModule } from "../index";
import { GLOSSARY, GLOSSARY_BY_ID, lookupTerm } from "../glossary";
import type { HelpArticle, HelpBlock } from "../types";

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

/** Every string a reader can actually see, per article. */
function visibleStrings(article: HelpArticle): string[] {
  const out: string[] = [article.title, article.summary, article.access ?? ""];
  const walk = (block: HelpBlock) => {
    switch (block.type) {
      case "paragraph":
        out.push(block.text);
        break;
      case "steps":
        out.push(block.title ?? "");
        for (const s of block.steps) out.push(s.title, s.detail ?? "", s.tip ?? "");
        break;
      case "callout":
        out.push(block.title ?? "", block.text);
        break;
      case "list":
        out.push(block.title ?? "", ...block.items);
        break;
      case "table":
        out.push(block.title ?? "", ...block.head, ...block.rows.flat());
        break;
      case "faq":
        out.push(block.title ?? "", ...block.items.flatMap((i) => [i.q, i.a]));
        break;
      case "terms":
        out.push(block.title ?? "");
        break;
    }
  };
  article.blocks.forEach(walk);
  return out.filter(Boolean);
}

/** Every `route` referenced anywhere in the content. */
function allRoutes(): { route: string; where: string }[] {
  const out: { route: string; where: string }[] = [];
  for (const m of HELP_MODULES) {
    for (const r of m.routes ?? []) out.push({ route: r, where: `module ${m.id}` });
    for (const a of m.articles) {
      if (a.route) out.push({ route: a.route, where: `${m.id}/${a.id}` });
      for (const b of a.blocks) {
        if (b.type !== "steps") continue;
        for (const [i, s] of b.steps.entries()) {
          if (s.route) out.push({ route: s.route, where: `${m.id}/${a.id} step ${i + 1}` });
        }
      }
    }
  }
  return out;
}

/**
 * Path literals declared in App.tsx. Nested routes are declared relatively, so
 * a full path is valid when it is a literal outright, or when it splits into a
 * declared parent plus a declared child.
 */
const APP_PATHS: Set<string> = (() => {
  const file = readFileSync(path.resolve(__dirname, "../../../App.tsx"), "utf8");
  const set = new Set<string>();
  for (const m of file.matchAll(/path="([^"]+)"/g)) set.add(m[1]);
  return set;
})();

function routeExists(route: string): boolean {
  const p = route.split("?")[0];
  if (APP_PATHS.has(p)) return true;
  const segs = p.split("/").filter(Boolean);
  for (let i = 1; i < segs.length; i++) {
    const parent = "/" + segs.slice(0, i).join("/");
    const child = segs.slice(i).join("/");
    if (APP_PATHS.has(parent) && APP_PATHS.has(child)) return true;
  }
  return false;
}

const TERM_MARKUP = /\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g;

/* ------------------------------------------------------------------ */
/*  Structure                                                          */
/* ------------------------------------------------------------------ */

describe("help content structure", () => {
  it("ships every module with at least one article", () => {
    expect(HELP_MODULES.length).toBeGreaterThanOrEqual(16);
    for (const m of HELP_MODULES) {
      expect(m.articles.length, `module ${m.id} has no articles`).toBeGreaterThan(0);
    }
  });

  it("has unique module ids", () => {
    const ids = HELP_MODULES.map((m) => m.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("has unique article ids within each module", () => {
    for (const m of HELP_MODULES) {
      const ids = m.articles.map((a) => a.id);
      expect(new Set(ids).size, `duplicate article id in ${m.id}`).toBe(ids.length);
    }
  });

  it("uses url-safe ids", () => {
    for (const m of HELP_MODULES) {
      expect(m.id).toMatch(/^[a-z0-9-]+$/);
      for (const a of m.articles) expect(a.id, `${m.id}/${a.id}`).toMatch(/^[a-z0-9-]+$/);
    }
  });

  it("gives every article a summary, an audience, a duration and content", () => {
    for (const m of HELP_MODULES) {
      for (const a of m.articles) {
        const where = `${m.id}/${a.id}`;
        expect(a.title.length, where).toBeGreaterThan(3);
        expect(a.summary.length, where).toBeGreaterThan(10);
        expect(a.minutes, where).toBeGreaterThan(0);
        expect(a.audience.length, where).toBeGreaterThan(0);
        expect(a.blocks.length, where).toBeGreaterThan(0);
      }
    }
  });

  it("never ships an empty steps, list, table or faq block", () => {
    for (const m of HELP_MODULES) {
      for (const a of m.articles) {
        for (const b of a.blocks) {
          const where = `${m.id}/${a.id} (${b.type})`;
          if (b.type === "steps") expect(b.steps.length, where).toBeGreaterThan(0);
          if (b.type === "list") expect(b.items.length, where).toBeGreaterThan(0);
          if (b.type === "faq") expect(b.items.length, where).toBeGreaterThan(0);
          if (b.type === "terms") expect(b.ids.length, where).toBeGreaterThan(0);
          if (b.type === "table") {
            expect(b.rows.length, where).toBeGreaterThan(0);
            for (const row of b.rows) {
              expect(row.length, `${where} — row width must match the header`).toBe(b.head.length);
            }
          }
        }
      }
    }
  });

  it("documents a meaningful number of steps", () => {
    const steps = SEARCH_DOCS.reduce((n, d) => n + d.steps.length, 0);
    expect(steps).toBeGreaterThan(300);
  });
});

/* ------------------------------------------------------------------ */
/*  Glossary markup — the easiest thing to get wrong by hand           */
/* ------------------------------------------------------------------ */

describe("glossary", () => {
  it("has unique ids", () => {
    const ids = GLOSSARY.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("resolves every [[term]] used anywhere in the content", () => {
    const unresolved: string[] = [];
    for (const m of HELP_MODULES) {
      for (const a of m.articles) {
        for (const text of visibleStrings(a)) {
          for (const match of text.matchAll(TERM_MARKUP)) {
            if (!lookupTerm(match[1])) unresolved.push(`${m.id}/${a.id}: [[${match[1]}]]`);
          }
        }
      }
    }
    expect(unresolved).toEqual([]);
  });

  it("resolves every id referenced by a terms block", () => {
    const missing: string[] = [];
    for (const m of HELP_MODULES) {
      for (const a of m.articles) {
        for (const b of a.blocks) {
          if (b.type !== "terms") continue;
          for (const id of b.ids) if (!GLOSSARY_BY_ID[id]) missing.push(`${m.id}/${a.id}: ${id}`);
        }
      }
    }
    expect(missing).toEqual([]);
  });

  it("resolves every related-term cross reference", () => {
    const broken: string[] = [];
    for (const t of GLOSSARY) {
      for (const r of t.related ?? []) if (!GLOSSARY_BY_ID[r]) broken.push(`${t.id} → ${r}`);
    }
    expect(broken).toEqual([]);
  });

  it("looks a term up by name, id, alias, plural and casing", () => {
    expect(lookupTerm("merit list")?.id).toBe("merit-list");
    expect(lookupTerm("Merit List")?.id).toBe("merit-list");
    expect(lookupTerm("merit-list")?.id).toBe("merit-list");
    expect(lookupTerm("shortlist")?.id).toBe("merit-list");
    expect(lookupTerm("permissions")?.id).toBe("permission");
    expect(lookupTerm("Faculty")?.id).toBe("school");
  });

  it("returns nothing for an unknown term, so RichText can fall back to plain words", () => {
    expect(lookupTerm("quidditch")).toBeUndefined();
  });

  it("defines every term without leaving it empty", () => {
    for (const t of GLOSSARY) {
      expect(t.definition.length, t.id).toBeGreaterThan(40);
      expect(t.term.length, t.id).toBeGreaterThan(1);
    }
  });
});

/* ------------------------------------------------------------------ */
/*  Routes — a dead "Open the screen" link is worse than no link       */
/* ------------------------------------------------------------------ */

describe("routes referenced by the guides", () => {
  it("finds route literals in App.tsx to check against", () => {
    expect(APP_PATHS.size).toBeGreaterThan(50);
  });

  it("points every route at a real screen", () => {
    const dead = allRoutes()
      .filter(({ route }) => !routeExists(route))
      .map(({ route, where }) => `${where} → ${route}`);
    expect(dead).toEqual([]);
  });

  it("always writes routes as absolute paths", () => {
    for (const { route, where } of allRoutes()) {
      expect(route.startsWith("/"), `${where} → ${route}`).toBe(true);
    }
  });
});

/* ------------------------------------------------------------------ */
/*  Contextual help                                                    */
/* ------------------------------------------------------------------ */

describe("helpForRoute", () => {
  it("prefers the most specific article for a screen", () => {
    const hit = helpForRoute("/finance/approvals");
    expect(hit?.moduleId).toBe("finance");
    expect(hit?.articleId).toBe("payments");
  });

  it("falls back to a module's first article for a screen with no article of its own", () => {
    const hit = helpForRoute("/finance/sponsors");
    expect(hit?.moduleId).toBe("finance");
  });

  it("matches a child path by prefix", () => {
    expect(helpForRoute("/students/4821")?.moduleId).toBe("students");
    expect(helpForRoute("/admin/admissions/applications/12")?.moduleId).toBe("admissions");
  });

  it("does not let the root route swallow every unknown path", () => {
    expect(helpForRoute("/nothing-like-this")).toBeUndefined();
  });

  it("answers for the screens each role lives on", () => {
    for (const p of ["/my-finance", "/hr/leave/approvals", "/teacher/courses", "/gate", "/logs", "/modules/marks"]) {
      expect(helpForRoute(p), `no contextual help for ${p}`).toBeDefined();
    }
  });
});

/* ------------------------------------------------------------------ */
/*  Navigation helpers                                                 */
/* ------------------------------------------------------------------ */

describe("navigation", () => {
  it("builds help paths that match the declared routes", () => {
    expect(helpPath("finance")).toBe("/help/m/finance");
    expect(helpPath("finance", "payments")).toBe("/help/m/finance/payments");
  });

  it("resolves every article promoted on the hub", () => {
    for (const p of POPULAR_ARTICLES) {
      expect(getArticle(p.moduleId, p.articleId), `${p.moduleId}/${p.articleId}`).toBeDefined();
    }
  });

  it("labels every role journey grammatically", () => {
    for (const j of ROLE_JOURNEYS) {
      expect(j.chip.length, j.role).toBeGreaterThan(4);
      // "I am a Applicant" / "I am a HR" — the reason chips are written out
      // instead of templated from the role name.
      expect(j.chip, j.role).not.toMatch(/\ba [aeiouAEIOU]/);
      expect(j.chip, j.role).not.toMatch(/\ba HR\b/);
    }
  });

  it("resolves every module referenced by a role journey", () => {
    for (const j of ROLE_JOURNEYS) {
      for (const id of j.moduleIds) {
        expect(getModule(id), `${j.role} → ${id}`).toBeDefined();
      }
    }
  });

  it("returns undefined rather than throwing for unknown ids", () => {
    expect(getModule("nope")).toBeUndefined();
    expect(getArticle("finance", "nope")).toBeUndefined();
    expect(getArticle(undefined, undefined)).toBeUndefined();
  });
});
