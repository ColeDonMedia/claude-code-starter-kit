// Pattern cards: every card has the same parts, cards are matched to a feature by its wording, and planning and the feature
// build hand them to the builder and reviewers. Run: node --test plugins/starter-kit/scripts/cards.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { DIR, TRIGGERS, listCards, matchCards } from "./cards.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const PLUGIN = join(HERE, "..");

test("six cards, each with When, Rules, tests that prove it, and common mistakes", () => {
  assert.deepEqual(listCards(), ["background-jobs", "billing-webhooks", "email", "roles-permissions", "sign-in-sessions", "tenant-isolation"]);
  for (const c of listCards()) {
    const t = readFileSync(join(DIR, `${c}.md`), "utf8");
    assert.match(t, /^# Card: /m, c);
    assert.match(t, /^\*\*When:\*\*/m, c);
    for (const h of ["## Rules", "## Prove it with tests", "## Common mistakes"]) assert.ok(t.includes(h), `${c}: ${h}`);
    assert.ok((t.match(/^- /gm) ?? []).length >= 4, `${c}: at least four tests`);
    assert.ok(t.split(/\s+/).length < 600, `${c} stays short`);
    assert.ok(TRIGGERS[c], `${c} has trigger words`);
  }
});

test("cards are matched to a feature by its wording", () => {
  assert.deepEqual(matchCards("Each organisation sees only its own invoices"), ["tenant-isolation"]);
  assert.deepEqual(matchCards("Clients pay an invoice by card with Stripe; a webhook marks it paid"), ["billing-webhooks"]);
  assert.deepEqual(matchCards("People sign up and reset their password by email").sort(), ["email", "sign-in-sessions"]);
  assert.deepEqual(matchCards("Admins invite members and choose their role"), ["roles-permissions"]);
  assert.deepEqual(matchCards("A nightly job sends overdue reminders").sort(), ["background-jobs"]);
  assert.deepEqual(matchCards("Change the colour of the header"), []);
  const out = spawnSync(process.execPath, [join(HERE, "cards.mjs"), "--match", "multi-tenant SaaS with Stripe subscriptions"], { encoding: "utf8" }).stdout;
  assert.match(out, /CARD tenant-isolation: /);
  assert.match(out, /CARD billing-webhooks: /);
});

test("the multi-tenant card covers the leaks that happen in real frameworks", () => {
  const t = readFileSync(join(DIR, "tenant-isolation.md"), "utf8");
  for (const must of [/queued jobs/i, /cache keys/i, /file storage/i, /withoutGlobalScopes/, /by id AND tenant/, /404/]) assert.match(t, must);
});

test("planning and the feature build use the cards", () => {
  assert.match(readFileSync(join(PLUGIN, "commands", "spec.md"), "utf8"), /cards\.mjs" --match "<the whole idea>"/);
  const flow = readFileSync(join(PLUGIN, "procedures", "feature.md"), "utf8");
  assert.match(flow, /cards\.mjs" --match "<item title, goal and criteria>"/);
  assert.match(flow, /a card rule broken or a card test missing for a case the feature has is BLOCKS/);
});
