import { describe, expect, it } from "vitest";
import { SEARCH_DOCS, searchHelp } from "../index";

describe("searchHelp", () => {
  it("ignores queries too short to mean anything", () => {
    expect(searchHelp("")).toEqual([]);
    expect(searchHelp(" ")).toEqual([]);
    expect(searchHelp("a")).toEqual([]);
  });

  it("returns hits ordered by score, best first", () => {
    const hits = searchHelp("payment");
    expect(hits.length).toBeGreaterThan(1);
    for (let i = 1; i < hits.length; i++) {
      expect(hits[i - 1].score).toBeGreaterThanOrEqual(hits[i].score);
    }
  });

  it.each([
    ["record marks", "teaching", "enter-marks"],
    ["approve leave", "hr", "approve-leave"],
    ["merit list", "admissions", "merit-list"],
    ["generate invoices", "finance", "invoicing"],
    ["grading scale", "academics", "grading-scale"],
    ["verify documents", "admissions", "verify-documents"],
    ["glossary of steps first login", "getting-started", "first-login"],
  ])("puts the right guide first for %j", (query, moduleId, articleId) => {
    const [top] = searchHelp(query);
    expect(top, `nothing found for ${query}`).toBeDefined();
    expect({ m: top.moduleId, a: top.articleId }).toEqual({ m: moduleId, a: articleId });
  });

  it("finds a guide from words buried in a step, not just the title", () => {
    // "carousel" appears only inside a step of the document-verification guide.
    const hits = searchHelp("carousel");
    expect(hits[0]?.articleId).toBe("verify-documents");
    expect(hits[0]?.matchedStep).toBeTruthy();
  });

  it("surfaces the matching step so the reader lands on the right line", () => {
    const hit = searchHelp("Open the verification queue")[0];
    expect(hit).toBeDefined();
  });

  it("still finds a guide when the words are spread across it", () => {
    const hits = searchHelp("overdue alert deadline");
    expect(hits.length).toBeGreaterThan(0);
    expect(hits.some((h) => h.moduleId === "finance")).toBe(true);
  });

  it("is case-insensitive", () => {
    expect(searchHelp("PAYROLL").map((h) => h.articleId)).toEqual(
      searchHelp("payroll").map((h) => h.articleId),
    );
  });

  it("returns nothing for a term the system does not use", () => {
    expect(searchHelp("photosynthesis")).toEqual([]);
  });

  it("drops weak matches when a caller asks for precision", () => {
    // The global search bar has four slots: a single shared word must not
    // spend one of them. "approve leave" was surfacing the admissions
    // lifecycle guide purely on the word "approve".
    const loose = searchHelp("approve leave", 8, 0).map((h) => `${h.moduleId}/${h.articleId}`);
    const tight = searchHelp("approve leave", 8, 25).map((h) => `${h.moduleId}/${h.articleId}`);
    expect(loose).toContain("hr/approve-leave");
    expect(tight).toContain("hr/approve-leave");
    expect(tight.length).toBeLessThan(loose.length);
    expect(tight).not.toContain("admissions/lifecycle");
  });

  it("respects the result limit", () => {
    expect(searchHelp("the", 5).length).toBeLessThanOrEqual(5);
  });

  it("strips glossary markup out of the searchable text", () => {
    // A reader searching "[[" or "|" must not match markup syntax.
    for (const doc of SEARCH_DOCS) {
      expect(doc.haystack).not.toContain("[[");
      expect(doc.haystack).not.toContain("]]");
    }
  });

  it("indexes every article exactly once", () => {
    const keys = SEARCH_DOCS.map((d) => `${d.moduleId}/${d.articleId}`);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("carries the metadata the result cards render", () => {
    for (const doc of SEARCH_DOCS) {
      expect(doc.moduleTitle.length).toBeGreaterThan(0);
      expect(doc.summary.length).toBeGreaterThan(0);
      expect(doc.minutes).toBeGreaterThan(0);
    }
  });
});
