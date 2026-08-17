import { Fragment } from "react";
import KeyTerm from "./KeyTerm";
import { tokenize, toPlainText, type RichToken } from "@/data/help/markup";

/**
 * Renders the help markup. The parsing rules — including that bold may wrap a
 * glossary term — live in `richText.ts` so they can be tested without a DOM.
 */
export default function RichText({ text }: { text: string }): JSX.Element {
  return <>{render(tokenize(text))}</>;
}

function render(tokens: RichToken[]): JSX.Element[] {
  return tokens.map((token, i) => {
    switch (token.type) {
      case "term":
        return <KeyTerm key={i} term={token.term} label={token.label} />;

      case "bold":
        return (
          <strong key={i} className="font-semibold text-ink-900 dark:text-white">
            {render(token.children)}
          </strong>
        );

      case "code":
        return (
          <code
            key={i}
            className="px-1.5 py-0.5 rounded bg-ink-100 dark:bg-ink-700 font-mono text-[12.5px]"
          >
            {token.value}
          </code>
        );

      default:
        return <Fragment key={i}>{token.value}</Fragment>;
    }
  });
}

/** Same rules, but returning plain text — used for titles and aria labels. */
export const stripMarkup = toPlainText;
