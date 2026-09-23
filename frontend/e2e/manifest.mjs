/* eslint-env node */
/**
 * Writes the module/article list the --sweep run walks. Run through vite-node
 * so the TypeScript content modules and the `@/` alias resolve.
 */
import { writeFileSync } from "node:fs";
import { HELP_MODULES } from "../src/data/help/index";

const pairs = HELP_MODULES.flatMap((m) => m.articles.map((a) => ({ m: m.id, a: a.id })));
writeFileSync("e2e/.manifest.json", JSON.stringify(pairs));
console.log(`wrote e2e/.manifest.json — ${pairs.length} articles`);
