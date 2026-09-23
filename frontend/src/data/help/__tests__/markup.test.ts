import { describe, expect, it } from "vitest";
import { tokenize, toPlainText } from "../markup";

describe("help markup tokenizer", () => {
  it("returns plain text untouched", () => {
    expect(tokenize("just words")).toEqual([{ type: "text", value: "just words" }]);
  });

  it("recognises a glossary term", () => {
    expect(tokenize("see the [[merit list]] first")).toEqual([
      { type: "text", value: "see the " },
      { type: "term", term: "merit list", label: undefined },
      { type: "text", value: " first" },
    ]);
  });

  it("recognises a relabelled glossary term", () => {
    expect(tokenize("[[module registration|registered]] students")).toEqual([
      { type: "term", term: "module registration", label: "registered" },
      { type: "text", value: " students" },
    ]);
  });

  it("recognises bold and code", () => {
    expect(tokenize("click **Save** then check `status`")).toEqual([
      { type: "text", value: "click " },
      { type: "bold", children: [{ type: "text", value: "Save" }] },
      { type: "text", value: " then check " },
      { type: "code", value: "status" },
    ]);
  });

  // The bug the browser run caught: bold wrapping a term rendered the raw
  // "[[fee structure]]" on screen, in 13 places across the guides.
  it("resolves a glossary term nested inside bold", () => {
    expect(tokenize("A **[[fee structure]]** says what it costs")).toEqual([
      { type: "text", value: "A " },
      {
        type: "bold",
        children: [{ type: "term", term: "fee structure", label: undefined }],
      },
      { type: "text", value: " says what it costs" },
    ]);
  });

  it("resolves a relabelled term nested inside bold", () => {
    const [token] = tokenize("**[[credit|credits]]**");
    expect(token).toEqual({
      type: "bold",
      children: [{ type: "term", term: "credit", label: "credits" }],
    });
  });

  it("handles several markers in one string", () => {
    const kinds = tokenize("**A** and [[invoice]] and `x` and plain").map((t) => t.type);
    expect(kinds).toEqual(["bold", "text", "term", "text", "code", "text"]);
  });

  it("leaves an unclosed marker alone rather than eating the rest of the line", () => {
    expect(tokenize("**not closed")).toEqual([{ type: "text", value: "**not closed" }]);
    expect(tokenize("[[not closed")).toEqual([{ type: "text", value: "[[not closed" }]);
  });

  it("never loops on empty markers", () => {
    expect(() => tokenize("**** `` ")).not.toThrow();
  });

  it("strips every marker for plain-text use", () => {
    expect(toPlainText("A **[[fee structure]]** with `code` and [[credit|credits]]"))
      .toBe("A fee structure with code and credits");
  });

  it("round-trips text with no markup", () => {
    expect(toPlainText("nothing to strip")).toBe("nothing to strip");
  });
});
