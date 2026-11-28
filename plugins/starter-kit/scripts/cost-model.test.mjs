// Cost model: the running-cost arithmetic (minimum, recommended, every size, upgrade points, break-even) and the checks that
// every price came from a quoted pricing page. No network. Run: node --test plugins/starter-kit/scripts/cost-model.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { amountsAt, billAt, breakEven, firstYear, itemMonthly, ladder, pricesInQuotes, problems, staleItems, upgradePoints } from "./cost-model.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const SRC = "https://host.example/pricing";

const MODEL = {
  currency: "USD",
  checked: "2026-11-01",
  usage: { emails: 4, sms: 0.5, storageMb: 50, egressMb: 100, payments: 1, revenue: 10 },
  items: [
    { name: "Domain", category: "domain", billing: "yearly", price: 12, source: SRC, quote: "A .com costs $12 a year" },
    { name: "Server", category: "hosting", group: "server", option: "Host A", source: SRC,
      tiers: [
        { name: "small", monthly: 6, limits: { peakUsers: 20 }, quote: "Small droplet $6 a month" },
        { name: "medium", monthly: 24, limits: { peakUsers: 100 }, quote: "Medium droplet $24 a month" },
        { name: "large", monthly: 96, limits: { peakUsers: 500 }, quote: "Large droplet $96 a month" },
      ] },
    { name: "Server", category: "hosting", group: "server", option: "Host B", source: SRC,
      tiers: [{ name: "pro", monthly: 20, limits: { peakUsers: 1000 }, included: { egressGb: 100 }, overage: { egressGb: 0.15 }, quote: "Pro is $20 a month per seat" }] },
    { name: "Email", category: "email", source: SRC, metered: { per: "emails", free: 3000, unitPrice: 0.9, unitSize: 1000 }, quote: "$0.90 per 1,000 emails after the free 3,000" },
    { name: "Texts", category: "sms", source: SRC, metered: { per: "sms", unitPrice: 0.0083 }, quote: "Outbound SMS $0.0083 per message" },
    { name: "Card fees", category: "payments", source: SRC, percent: 2.9, of: "revenue", metered: { per: "payments", unitPrice: 0.3 }, quote: "2.9% + 30¢ per successful charge, $0.3 each" },
    { name: "Store account", category: "store", billing: "once", price: 25, source: SRC, quote: "a one-time $25 registration fee" },
  ],
};
const OPTS = { peakRatio: 0.1 };

test("amounts grow with users; peak and storage are worked out", () => {
  const a = amountsAt(1000, MODEL.usage, 0.1);
  assert.equal(a.peakUsers, 100);
  assert.equal(a.emails, 4000);
  assert.equal(Math.round(a.storageGb * 1024), 50000);
  assert.equal(amountsAt(3, MODEL.usage, 0.1).peakUsers, 1, "at least one person at once");
});

test("a plan is the cheapest that fits, with headroom for the recommended size", () => {
  const server = MODEL.items[1];
  assert.equal(itemMonthly(server, amountsAt(150, {}, 0.1)).tier, "small", "15 at once fits small");
  assert.equal(itemMonthly(server, amountsAt(150, {}, 0.1), 2).tier, "medium", "with 2x room it needs medium");
  const huge = itemMonthly(server, amountsAt(100000, {}, 0.1), 2);
  assert.equal(huge.tier, "large");
  assert.equal(huge.beyond, true, "beyond the largest plan is flagged, not hidden");
});

test("metered prices respect the free amount and the unit size; percent fees use revenue", () => {
  const email = MODEL.items[3];
  assert.equal(itemMonthly(email, amountsAt(500, MODEL.usage)).cost, 0, "2,000 emails are inside the free 3,000");
  assert.equal(itemMonthly(email, amountsAt(1000, MODEL.usage)).cost.toFixed(2), "0.90", "1,000 over the free amount");
  const fees = MODEL.items[5];
  assert.equal(itemMonthly(fees, amountsAt(100, MODEL.usage)).cost.toFixed(2), "59.00", "2.9% of $1,000 plus 100 x $0.30");
  assert.equal(itemMonthly(MODEL.items[0], {}).cost, 1, "a yearly price is spread over 12 months");
});

test("overage is charged above what a plan includes", () => {
  const b = MODEL.items[2];
  const at = amountsAt(2048, { egressMb: 100 }, 0.1); // 200 GB
  assert.equal(itemMonthly(b, at).cost.toFixed(2), "35.00", "$20 + 100 GB over x $0.15");
});

test("alternatives are compared and the cheapest is used unless one is chosen", () => {
  const small = billAt(MODEL, 100, OPTS).lines.find((l) => l.group === "server");
  assert.equal(small.option, "Host A");
  assert.equal(small.alternatives.length, 2);
  const big = billAt(MODEL, 3000, { ...OPTS, headroom: 2 }).lines.find((l) => l.group === "server");
  assert.equal(big.option, "Host B", "at 300 at once Host A needs large, Host B is cheaper");
  const two = { usage: {}, items: [
    { name: "S", category: "hosting", group: "server", option: "Host A", tiers: [{ name: "tiny", monthly: 5, limits: { peakUsers: 10 } }] },
    { name: "S", category: "hosting", group: "server", option: "Host B", tiers: [{ name: "big", monthly: 50, limits: { peakUsers: 1000 } }] },
  ] };
  const outgrown = billAt(two, 200, OPTS).lines[0];
  assert.equal(outgrown.option, "Host B", "Host A is cheaper on paper but has no plan with room: never picked as cheapest");
  assert.equal(outgrown.alternatives.find((a) => a.option === "Host A").beyond, true);
  const chosen = { ...MODEL, items: MODEL.items.map((i) => (i.option === "Host A" ? { ...i, chosen: true } : i)) };
  assert.equal(billAt(chosen, 3000, { ...OPTS, headroom: 2 }).lines.find((l) => l.group === "server").option, "Host A");
});

test("upgrade points are exact user counts with the next plan and its extra cost", () => {
  const chosen = { ...MODEL, items: MODEL.items.map((i) => (i.option === "Host A" ? { ...i, chosen: true } : i)) };
  const ups = upgradePoints(chosen, { peakRatio: 0.1, headroom: 2 });
  assert.deepEqual(ups.map((u) => [u.atUsers, u.from, u.to, u.extra]), [[101, "small", "medium", 18], [501, "medium", "large", 72], [2501, "large", null, null]]);
});

test("first year adds one-time costs to twelve months", () => {
  const fy = firstYear(MODEL, 10, OPTS);
  assert.equal(fy.once, 25);
  assert.equal(fy.total, 25 + billAt(MODEL, 10, OPTS).monthly * 12);
});

test("break-even is the first user count where revenue covers the bill", () => {
  const n = breakEven(MODEL, OPTS);
  assert.ok(n > 0);
  const at = billAt(MODEL, n, OPTS);
  const before = billAt(MODEL, n - 1, OPTS);
  assert.ok(at.revenue >= at.monthly && before.revenue < before.monthly);
  assert.equal(breakEven({ ...MODEL, usage: { ...MODEL.usage, revenue: undefined } }, OPTS), null);
});

test("every price must be written in its own quote", () => {
  assert.deepEqual(pricesInQuotes(MODEL.items[1]), []);
  const wrong = { ...MODEL.items[1], tiers: [{ name: "small", monthly: 5, quote: "Small droplet $6 a month" }] };
  assert.match(pricesInQuotes(wrong)[0], /5 is not in its quote/);
  assert.match(pricesInQuotes({ price: 12 })[0], /no quote/);
  assert.deepEqual(pricesInQuotes(MODEL.items[3]), [], "$0.90 matches 0.9");
  assert.deepEqual(pricesInQuotes({ price: 1200, quote: "$1,200 a year" }), [], "thousands separators");
});

test("problems: no source, no price, unknown usage, two chosen, no date", () => {
  assert.deepEqual(problems(MODEL), []);
  const bad = {
    usage: {},
    items: [
      { name: "A", category: "hosting", billing: "monthly", price: 5, quote: "$5 a month" },
      { name: "B", category: "email", source: SRC },
      { name: "C", category: "sms", source: SRC, metered: { per: "texts", unitPrice: 0.01 }, quote: "$0.01 each" },
      { name: "D", category: "nope", source: SRC, free: true },
      { name: "E", category: "hosting", group: "g", option: "1", chosen: true, source: SRC, free: true },
      { name: "E", category: "hosting", group: "g", option: "2", chosen: true, source: SRC, free: true },
    ],
  };
  const p = problems(bad).join("\n");
  assert.match(p, /A: no source page/);
  assert.match(p, /B: no price/);
  assert.match(p, /C: metered by "texts"/);
  assert.match(p, /D: category must be/);
  assert.match(p, /g: more than one option is "chosen"/);
  assert.match(p, /no date the price was checked/);
  assert.match(problems({ items: [] })[0], /no items/);
});

test("prices older than 30 days are named as stale", () => {
  assert.deepEqual(staleItems(MODEL, new Date("2026-11-20")), []);
  assert.equal(staleItems(MODEL, new Date("2027-01-15")).length, MODEL.items.length);
});

test("the size ladder runs from the start to ten times the expected size", () => {
  assert.deepEqual(ladder(2000, 10), [10, 100, 1000, 2000, 10000]);
  assert.deepEqual(ladder(5, 5), [5, 10]);
});

test("the command prints the report and fails on problems", () => {
  const dir = mkdtempSync(join(tmpdir(), "cost-"));
  try {
    mkdirSync(join(dir, ".claude"));
    writeFileSync(join(dir, ".claude", "scale.json"), JSON.stringify({ usersTotal: 1000, usersPeak: 100 }));
    writeFileSync(join(dir, ".claude", "costs.json"), JSON.stringify(MODEL));
    const run = () => spawnSync(process.execPath, [join(HERE, "cost-model.mjs"), "--project", dir], { encoding: "utf8" });
    let r = run();
    assert.equal(r.status, 0, r.stdout + r.stderr);
    for (const s of ["MINIMUM TO BEGIN", "RECOMMENDED (1000 users, 100 at once", "TO INVEST: $25 paid once", "Store account: $25 once", "payment fees", "UPGRADE WHEN", "BREAK-EVEN", "server: Host A"]) assert.ok(r.stdout.includes(s), s);
    writeFileSync(join(dir, ".claude", "costs.json"), JSON.stringify({ ...MODEL, items: [{ ...MODEL.items[0], source: "" }] }));
    r = run();
    assert.equal(r.status, 1);
    assert.match(r.stdout, /PROBLEMS[\s\S]*no source page/);
    rmSync(join(dir, ".claude", "costs.json"));
    assert.equal(run().status, 1);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("planning, launch and maintenance use the cost check, and it never prices from memory", async () => {
  const { readFileSync } = await import("node:fs");
  const PLUGIN = join(HERE, "..");
  const read = (...p) => readFileSync(join(PLUGIN, ...p), "utf8");
  assert.match(read("commands", "spec.md"), /procedures\/spec-costs\.md/);
  assert.match(read("commands", "spec.md"), /\*\*Running costs\*\*/);
  assert.match(read("commands", "launch.md"), /procedures\/spec-costs\.md[\s\S]{0,400}cost-model\.mjs" --project \. --verify/);
  assert.match(read("commands", "maintain.md"), /costs\.json[\s\S]{0,200}cost-model\.mjs/);
  const proc = read("procedures", "spec-costs.md");
  for (const s of ["cost-model.mjs\" --project . --verify", "cite-check.mjs", "renewal price", "egress", "Free credits", "Not covered", "never the running cost", "Must not:** give a price from memory, do the arithmetic itself"]) assert.ok(proc.includes(s), s);
});
