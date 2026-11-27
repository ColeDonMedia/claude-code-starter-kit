// Proof that templates/ui-checkpoint.js measures what scripts/ui-check.mjs judges, in a real browser. Run by ui-e2e.test.mjs
// when Playwright is available (KIT_PLAYWRIGHT_DIR); it copies the kit's checkpoint next to this file first.
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test, checkpoint, checkEscape } from "./ui-checkpoint.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const serve = (page, file) =>
  page.route("http://ui.test/**", (route) => {
    const u = new URL(route.request().url());
    if (u.pathname === "/missing.png") return route.fulfill({ status: 404, body: "" });
    return route.fulfill({ contentType: "text/html", body: readFileSync(join(HERE, file), "utf8") });
  });

test("bad invoice page", async ({ page }, testInfo) => {
  await serve(page, "bad.html");
  await page.goto("http://ui.test/invoices/42");
  await page.waitForTimeout(200);
  await checkpoint(page, testInfo, "loaded");
  await page.getByRole("button", { name: "Delete", exact: true }).click();
  await checkpoint(page, testInfo, "confirm delete");
  await checkEscape(page, testInfo, "confirm delete");
});

test("good invoice page", async ({ page }, testInfo) => {
  await serve(page, "good.html");
  await page.goto("http://ui.test/invoices/1042");
  await checkpoint(page, testInfo, "loaded");
  await page.getByRole("button", { name: "Delete invoice" }).click();
  await checkpoint(page, testInfo, "confirm delete");
  await checkEscape(page, testInfo, "confirm delete");
});
