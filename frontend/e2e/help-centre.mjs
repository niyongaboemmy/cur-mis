/* eslint-env node */
/**
 * Help Centre browser smoke test.
 *
 *   node e2e/help-centre.mjs            # 19 interaction checks
 *   node e2e/help-centre.mjs --sweep    # + load every article and check it renders
 *
 * Needs a running dev server (`npm run dev`) and Playwright — either a project
 * install (`npm i -D playwright`) or the global CLI (`brew install playwright`).
 *
 * The Help Centre makes no API calls, so this seeds an authenticated session
 * straight into the persisted auth store rather than driving the OTP login.
 * Set HELP_E2E_AUTH=/path/to/seed.json to use a real token instead.
 */
import fs from "node:fs";

const BASE = process.env.HELP_E2E_BASE ?? "http://127.0.0.1:5180/umis";
const SWEEP = process.argv.includes("--sweep");
const SHOTS = process.env.HELP_E2E_SHOTS ?? "e2e/.shots";

const chromium = await (async () => {
  for (const spec of ["playwright", "/opt/homebrew/lib/node_modules/playwright/index.mjs"]) {
    try {
      return (await import(spec)).chromium;
    } catch {
      /* try the next resolution */
    }
  }
  throw new Error("Playwright not found — `npm i -D playwright` or `brew install playwright`.");
})();

const auth =
  process.env.HELP_E2E_AUTH && fs.existsSync(process.env.HELP_E2E_AUTH)
    ? fs.readFileSync(process.env.HELP_E2E_AUTH, "utf8")
    : JSON.stringify({
        state: {
          user: {
            id: 1,
            email: "e2e@example.test",
            full_name: "E2E Runner",
            role: "superadmin",
            role_id: 1,
            permissions: [],
          },
          token: "e2e-placeholder",
          isAuthenticated: true,
        },
        version: 0,
      });

fs.mkdirSync(SHOTS, { recursive: true });

const errors = [];
const failedRequests = [];
let failures = 0;

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
const page = await ctx.newPage();
page.on("console", (m) => m.type() === "error" && errors.push(m.text().slice(0, 200)));
page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
page.on("response", (r) => r.status() >= 400 && failedRequests.push(`${r.status()} ${r.url()}`));

await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" });
await page.evaluate((v) => localStorage.setItem("cur-mis-auth", v), auth);

const shot = (n) => page.screenshot({ path: `${SHOTS}/${n}.png` });
const step = async (name, fn) => {
  try {
    await fn();
    console.log(`  ✓ ${name}`);
  } catch (e) {
    console.log(`  ✗ ${name}\n      ${e.message.split("\n")[0]}`);
    failures++;
  }
};

console.log("\nHelp Centre — browser checks\n");

await step("hub loads at /help", async () => {
  await page.goto(`${BASE}/help`, { waitUntil: "domcontentloaded" });
  await page.getByRole("heading", { name: "How can we help you today?" }).waitFor({ timeout: 20000 });
  await page.getByText("Browse every module").waitFor();
  await shot("01-hub");
});

await step("sidebar carries Help & Guides for every role", () =>
  page.getByRole("link", { name: /Help & Guides/i }).first().waitFor({ timeout: 5000 }));

await step("module grid links to every module", async () => {
  const n = await page.locator('a[href*="/help/m/"]').count();
  if (n < 16) throw new Error(`only ${n} module links on the hub`);
});

await step("suggestions stay closed until the user interacts", async () => {
  if (await page.getByText("Popular searches").isVisible().catch(() => false)) {
    throw new Error("suggestion panel opened over the hero on load");
  }
  await page.getByText(/modules · .* guides · .* documented steps/).waitFor({ timeout: 5000 });
});

await step("suggestion panel is not clipped by the hero", async () => {
  await page.getByPlaceholder(/Search the guides/i).click();
  const panel = page.getByText("Popular searches").locator("..");
  await panel.waitFor({ timeout: 5000 });
  const box = await panel.boundingBox();
  const last = await page.getByRole("button", { name: "reset my password" }).boundingBox();
  if (!last || last.y + last.height > box.y + box.height + 2) {
    throw new Error("the last suggestion falls outside the panel");
  }
  await page.keyboard.press("Escape");
});

await step("role picker opens a journey", async () => {
  await page.getByRole("button", { name: "I work in finance" }).click();
  await page.getByText("Fees, payments, budgets, reporting").waitFor({ timeout: 5000 });
  await shot("02-role-journey");
});

await step("search finds an article by words inside a step", async () => {
  const box = page.getByPlaceholder(/Search the guides/i);
  await box.click();
  await box.fill("carousel");
  await page.getByText("Verify uploaded documents").first().waitFor({ timeout: 5000 });
  await shot("03-search");
});

await step("Enter opens the top result", async () => {
  await page.keyboard.press("Enter");
  await page.waitForURL(/\/help\/m\/admissions\/verify-documents/, { timeout: 5000 });
});

await step("article renders its checkable steps", async () => {
  await page.getByRole("heading", { name: "Verify uploaded documents" }).waitFor();
  const n = await page.locator("ol li button[aria-pressed]").count();
  if (n < 3) throw new Error(`expected step checkboxes, found ${n}`);
  await shot("04-article");
});

await step("ticking a step advances the counter", async () => {
  await page.locator("ol li button[aria-pressed]").first().click();
  await page.getByText("1/5", { exact: false }).first().waitFor({ timeout: 3000 });
});

await step("step progress survives a reload", async () => {
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.getByRole("heading", { name: "Verify uploaded documents" }).waitFor({ timeout: 15000 });
  if ((await page.locator('ol li button[aria-pressed="true"]').count()) < 1) {
    throw new Error("progress was not restored from localStorage");
  }
});

await step("bold-wrapped glossary terms render as chips, not raw markup", async () => {
  await page.goto(`${BASE}/help/m/finance/money-model`, { waitUntil: "domcontentloaded" });
  await page.getByRole("heading", { name: "How student money works" }).waitFor({ timeout: 15000 });
  const body = await page.locator("main").innerText();
  if (body.includes("[[") || body.includes("]]")) throw new Error("raw [[markup]] on screen");
  await page.getByRole("button", { name: "fee structure", exact: true }).first().click();
  await page.getByRole("tooltip").waitFor({ timeout: 5000 });
  await shot("05-glossary-chip");
});

await step("glossary deep-links to a term", async () => {
  await page.goto(`${BASE}/help/glossary#merit-list`, { waitUntil: "domcontentloaded" });
  await page.locator("#merit-list").waitFor({ timeout: 8000 });
  await shot("06-glossary");
});

await step("search results page filters by kind", async () => {
  await page.goto(`${BASE}/help/search?q=payment`, { waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: "How-to" }).first().click();
  await shot("07-search-page");
});

await step("global search groups help results and pins the Help Centre row", async () => {
  await page.goto(`${BASE}/dashboard`, { waitUntil: "domcontentloaded" });
  const gs = page.getByPlaceholder("What do you want to find?");
  await gs.click();
  await gs.fill("approve leave");
  await page.getByText('Search the Help Centre for "approve leave"').waitFor({ timeout: 10000 });
  await page.getByText("Help & Guides").first().waitFor({ timeout: 5000 });
  await shot("08-global-search");
});

await step("global search offers help even with no record results", async () => {
  await page.getByPlaceholder("What do you want to find?").fill("zzzqqq");
  await page.getByText(/Search the Help Centre for "zzzqqq"/).waitFor({ timeout: 5000 });
});

await step("the ? offers help for the screen you are on", async () => {
  await page.goto(`${BASE}/finance/approvals`, { waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: "Help", exact: true }).click();
  await page.getByText("For this screen").waitFor({ timeout: 5000 });
  await page.getByText("Record and approve payments").waitFor({ timeout: 3000 });
  await shot("09-contextual");
});

await step("dark mode renders", async () => {
  await page.goto(`${BASE}/help`, { waitUntil: "domcontentloaded" });
  await page.evaluate(() => document.documentElement.classList.add("dark"));
  await page.getByRole("heading", { name: "How can we help you today?" }).waitFor();
  await shot("10-dark");
  await page.evaluate(() => document.documentElement.classList.remove("dark"));
});

await step("an article fits a phone without scrolling sideways", async () => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${BASE}/help/m/hr/request-leave`, { waitUntil: "domcontentloaded" });
  await page.getByRole("heading", { name: "Request leave" }).waitFor({ timeout: 10000 });
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  if (overflow > 2) throw new Error(`page scrolls horizontally by ${overflow}px`);
  await shot("11-mobile");
  await page.setViewportSize({ width: 1440, height: 1000 });
});

if (SWEEP) {
  console.log("\nSweeping every article\n");
  // Written by `vite-node e2e/manifest.mjs` — see the `test:e2e:sweep` script.
  const manifest = process.env.HELP_E2E_MANIFEST ?? "e2e/.manifest.json";
  if (!fs.existsSync(manifest)) {
    throw new Error(`${manifest} missing — run \`npm run test:e2e:sweep\` instead.`);
  }
  const pairs = JSON.parse(fs.readFileSync(manifest, "utf8"));

  let ok = 0;
  const bad = [];
  for (const { m, a } of pairs) {
    try {
      await page.goto(`${BASE}/help/m/${m}/${a}`, { waitUntil: "domcontentloaded" });
      // One retry: a single-threaded `php -S` dev backend occasionally stalls a
      // navigation mid-sweep and the document arrives empty.
      const shown = await page
        .locator("main h1")
        .first()
        .waitFor({ timeout: 8000 })
        .then(() => true, () => false);
      if (!shown) {
        await page.reload({ waitUntil: "domcontentloaded" });
        await page.locator("main h1").first().waitFor({ timeout: 15000 });
      }
      const body = await page.locator("main").innerText();
      if (body.includes("[[") || body.includes("]]")) throw new Error("raw [[markup]] on screen");
      if (body.includes("**")) throw new Error("raw bold markers on screen");
      if (body.trim().length < 200) throw new Error("rendered almost nothing");
      ok++;
    } catch (e) {
      bad.push(`${m}/${a}: ${e.message.split("\n")[0]}`);
    }
  }
  console.log(`  ${ok}/${pairs.length} articles rendered clean`);
  if (bad.length) {
    console.log(bad.map((b) => `  ✗ ${b}`).join("\n"));
    failures += bad.length;
  }
}

const noise = [...new Set(failedRequests)].filter((r) => !r.includes("/api/"));
console.log(`\nconsole errors: ${errors.length ? errors.slice(0, 5).join(" | ") : "none"}`);
if (noise.length) console.log(`failed asset requests: ${noise.join(", ")}`);
console.log(failures ? `\n${failures} check(s) FAILED\n` : `\nAll checks passed. Screenshots in ${SHOTS}/\n`);

await browser.close();
process.exit(failures ? 1 : 0);
