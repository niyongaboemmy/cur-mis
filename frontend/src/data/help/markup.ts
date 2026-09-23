/**
 * The tiny markup help content is allowed to use, as a pure tokenizer.
 *
 *   **bold**            emphasis
 *   `code`              a literal value or field name
 *   [[term]]            a glossary term (see data/help/glossary.ts)
 *   [[term|shown]]      the same, displayed as different words
 *
 * Kept free of React so it can be unit-tested directly, and so the nesting
 * rule below has one definition rather than one per renderer.
 *
 * Bold may CONTAIN a glossary term — `**[[fee structure]]**` is natural to
 * write and was silently rendering as the literal text "[[fee structure]]"
 * until the tokenizer learned to recurse into bold runs.
 */

export type RichToken =
  | { type: "text"; value: string }
  | { type: "code"; value: string }
  | { type: "term"; term: string; label?: string }
  | { type: "bold"; children: RichToken[] };

const PATTERN = /(\[\[[^\]]+\]\]|\*\*[^*]+\*\*|`[^`]+`)/g;

export function tokenize(text: string): RichToken[] {
  const out: RichToken[] = [];

  for (const part of text.split(PATTERN)) {
    if (part === "") continue;

    if (part.startsWith("[[") && part.endsWith("]]")) {
      const [term, label] = part.slice(2, -2).split("|");
      out.push({ type: "term", term, label });
      continue;
    }

    if (part.startsWith("**") && part.endsWith("**") && part.length > 4) {
      // Recurse — the inner run strictly shrinks, so this terminates.
      out.push({ type: "bold", children: tokenize(part.slice(2, -2)) });
      continue;
    }

    if (part.startsWith("`") && part.endsWith("`") && part.length > 2) {
      out.push({ type: "code", value: part.slice(1, -1) });
      continue;
    }

    out.push({ type: "text", value: part });
  }

  return out;
}

/** The words a reader would see, with every marker removed. */
export function toPlainText(text: string): string {
  const render = (tokens: RichToken[]): string =>
    tokens
      .map((t) => {
        switch (t.type) {
          case "text":
          case "code":
            return t.value;
          case "term":
            return t.label ?? t.term;
          case "bold":
            return render(t.children);
        }
      })
      .join("");

  return render(tokenize(text));
}
