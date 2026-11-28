// Cost model: what an app will cost to run, at every size, from prices checked on the providers' own pages. Planning researches
// the prices (hosting, database, storage, bandwidth, domain, email, texts, AI and other APIs, payment fees, monitoring, store and
// signing fees); this script does the arithmetic, so no total, upgrade point or break-even is guessed by a model. It costs no tokens.
//
// Input: .claude/costs.json (plain data, no commands), written from the research:
// {
//   "currency": "USD", "checked": "2026-11-27",
//   "usage": { "emails": 4, "sms": 0.2, "storageMb": 30, "egressMb": 80, "payments": 0.3, "revenue": 3 },   // per user, per month
//   "items": [
//     { "name": "Domain (.com)", "category": "domain", "provider": "...", "billing": "yearly", "price": 10.44,
//       "source": "<pricing page>", "quote": "<the exact words on that page>" },
//     { "name": "App server", "category": "hosting", "group": "server", "option": "Provider A",
//       "tiers": [ { "name": "1 GB", "monthly": 6, "limits": { "peakUsers": 40 }, "quote": "..." },
//                  { "name": "2 GB", "monthly": 12, "limits": { "peakUsers": 120 }, "included": { "egressGb": 2000 },
//                    "overage": { "egressGb": 0.01 }, "quote": "..." } ], "source": "..." },
//     { "name": "Email", "category": "email", "metered": { "per": "emails", "free": 3000, "unitPrice": 0.9, "unitSize": 1000 }, ... },
//     { "name": "Card fees", "category": "payments", "percent": 2.9, "of": "revenue",
//       "metered": { "per": "payments", "unitPrice": 0.3 }, ... },
//     { "name": "Apple developer account", "category": "store", "billing": "yearly", "price": 99, ... },
//     { "name": "Logo font licence", "category": "other", "billing": "once", "price": 40, ... }
//   ]
// }
// Amounts at N users: users = N, peakUsers = N x (usersPeak / usersTotal from the scale profile), storageGb = N x storageMb / 1024
// (all data kept so far), egressGb = N x egressMb / 1024 a month, and every other usage key = N x its per-user amount a month.
// Items in the same "group" with different "option"s are alternatives (two hosts, two email services): they are compared at
// every size, and the totals use the one marked "chosen": true, or the cheapest at that size.
//
// Run: node cost-model.mjs --project <dir> [--users 100,1000,10000] [--start <n>] [--json] [--verify]
//   --verify also fetches every cited page (cite-check) and needs each price to be in its own quote.
// Exit 1 when an item has no source, a price is missing from its quote, or (with --verify) a quote is not on its page.
import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { loadProfile } from "./scale-profile.mjs";

export const CATEGORIES = ["domain", "hosting", "database", "storage", "bandwidth", "cdn", "email", "sms", "ai", "api", "payments", "auth", "monitoring", "backups", "store", "signing", "tools", "other"];
const STALE_DAYS = 30;

export function costsPath(root) {
  return join(root, ".claude", "costs.json");
}

// The monthly amounts at N users.
export function amountsAt(n, usage = {}, peakRatio = 0.1) {
  const a = { users: n, peakUsers: Math.max(1, Math.ceil(n * peakRatio)) };
  for (const [k, v] of Object.entries(usage)) if (typeof v === "number") a[k] = n * v;
  a.storageGb = (n * (usage.storageMb ?? 0)) / 1024;
  a.egressGb = (n * (usage.egressMb ?? 0)) / 1024;
  return a;
}

const fits = (tier, amounts, headroom = 1) => Object.entries(tier.limits ?? {}).every(([k, lim]) => (amounts[k] ?? 0) * headroom <= lim);

function overage(tier, amounts) {
  let extra = 0;
  for (const [k, price] of Object.entries(tier.overage ?? {})) {
    const over = (amounts[k] ?? 0) - (tier.included?.[k] ?? 0);
    if (over > 0) extra += over * price;
  }
  return extra;
}

function metered(m, amounts) {
  if (!m) return 0;
  const qty = Math.max(0, (amounts[m.per] ?? 0) - (m.free ?? 0));
  const cost = (qty / (m.unitSize ?? 1)) * m.unitPrice;
  return qty > 0 ? Math.max(cost, m.minimum ?? 0) : 0;
}

// What one item costs a month at these amounts. Yearly prices are spread over 12 months; one-time prices are not monthly.
// headroom > 1 picks the plan that still fits at that multiple of the load (the recommended size); 1 is the bare minimum.
export function itemMonthly(item, amounts, headroom = 1) {
  let cost = 0;
  let tier = null;
  let beyond = false;
  if (item.tiers?.length) {
    const sorted = [...item.tiers].sort((x, y) => x.monthly - y.monthly);
    tier = sorted.find((t) => fits(t, amounts, headroom));
    if (!tier) {
      tier = sorted[sorted.length - 1];
      beyond = true; // no listed plan has room for this load
    }
    cost += tier.monthly + overage(tier, amounts);
  }
  if (item.billing === "monthly") cost += item.price ?? 0;
  if (item.billing === "yearly") cost += (item.price ?? 0) / 12;
  cost += metered(item.metered, amounts);
  if (item.percent) cost += ((amounts[item.of ?? "revenue"] ?? 0) * item.percent) / 100;
  return { cost, tier: tier?.name ?? null, beyond };
}

// Alternatives in one group: the chosen one, or the cheapest at this size.
function pick(options, amounts, headroom) {
  const priced = options.map((it) => ({ it, ...itemMonthly(it, amounts, headroom) }));
  const chosen = priced.find((p) => p.it.chosen);
  // A plan that has run out of room is never "cheapest": prefer the options that still fit.
  const fitting = priced.filter((p) => !p.beyond);
  const pool = fitting.length ? fitting : priced;
  return { use: chosen ?? pool.reduce((a, b) => (b.cost < a.cost ? b : a)), all: priced };
}

export function groups(items) {
  const g = new Map();
  for (const it of items) {
    const key = it.group ?? `item:${it.name}`;
    if (!g.has(key)) g.set(key, []);
    g.get(key).push(it);
  }
  return g;
}

// The whole bill at N users.
export function billAt(model, n, { peakRatio, headroom = 1 } = {}) {
  const amounts = amountsAt(n, model.usage, peakRatio);
  const lines = [];
  for (const [key, opts] of groups(model.items ?? [])) {
    const { use, all } = pick(opts, amounts, headroom);
    lines.push({ group: key, name: use.it.name, option: use.it.option ?? null, category: use.it.category, cost: use.cost, tier: use.tier, beyond: use.beyond, alternatives: all.length > 1 ? all.map((p) => ({ option: p.it.option ?? p.it.name, cost: p.cost, tier: p.tier, beyond: p.beyond })) : null, once: use.it.billing === "once" ? use.it.price : null });
  }
  const monthly = lines.reduce((s, l) => s + l.cost, 0);
  const revenue = amounts.revenue ?? null;
  return { users: n, amounts, lines, monthly, perUser: n ? monthly / n : null, revenue, margin: revenue === null ? null : revenue - monthly };
}

// Paid once, and paid in the first year in total (one-time + yearly + 12 months).
export function firstYear(model, n, opts) {
  const once = (model.items ?? []).filter((i) => i.billing === "once").reduce((s, i) => s + (i.price ?? 0), 0);
  return { once, total: once + billAt(model, n, opts).monthly * 12 };
}

// The user counts at which a plan stops fitting (with headroom), and what it moves to. Usage grows in a straight line with users,
// so each limit gives an exact count: limit / (amount per user x headroom).
export function upgradePoints(model, { peakRatio, headroom = 2, maxUsers = 1e7 } = {}) {
  const per = amountsAt(1, model.usage, peakRatio);
  per.peakUsers = peakRatio; // per user, before rounding up
  const out = [];
  for (const [, opts] of groups(model.items ?? [])) {
    for (const it of opts) {
      if (!it.tiers?.length || (opts.length > 1 && !it.chosen && opts.some((o) => o.chosen))) continue;
      const sorted = [...it.tiers].sort((x, y) => x.monthly - y.monthly);
      for (let i = 0; i < sorted.length; i++) {
        const t = sorted[i];
        const caps = Object.entries(t.limits ?? {}).filter(([k]) => per[k] > 0).map(([k, lim]) => ({ k, n: Math.floor(lim / (per[k] * headroom)) }));
        if (!caps.length) continue;
        const cap = caps.reduce((a, b) => (b.n < a.n ? b : a));
        if (cap.n >= maxUsers) continue;
        const next = sorted.slice(i + 1).find((x) => fits(x, amountsAt(cap.n + 1, model.usage, peakRatio), headroom));
        out.push({ item: it.name, option: it.option ?? null, from: t.name, to: next?.name ?? null, atUsers: cap.n + 1, because: cap.k, extra: next ? next.monthly - t.monthly : null });
      }
    }
  }
  return out.sort((a, b) => a.atUsers - b.atUsers);
}

// The smallest user count where the revenue covers the bill, when the usage says what a user brings in.
export function breakEven(model, { peakRatio, headroom = 1, maxUsers = 1e7 } = {}) {
  if (typeof model.usage?.revenue !== "number" || model.usage.revenue <= 0) return null;
  for (let n = 1; n <= maxUsers; n = Math.max(n + 1, Math.ceil(n * 1.05))) {
    const b = billAt(model, n, { peakRatio, headroom });
    if (b.revenue >= b.monthly) {
      let lo = Math.max(1, Math.floor(n / 1.05));
      while (lo < n && billAt(model, lo, { peakRatio, headroom }).revenue < billAt(model, lo, { peakRatio, headroom }).monthly) lo++;
      return lo;
    }
  }
  return null;
}

const NUM = /\d[\d,]*(?:\.\d+)?/g;
const numbersIn = (s) => (String(s).match(NUM) ?? []).map((x) => Number(x.replace(/,/g, "")));

// Every price must be written in the quote it came from, so the number used is the number on the page.
export function pricesInQuotes(item) {
  const missing = [];
  const need = (value, quote, label) => {
    if (typeof value !== "number" || value === 0) return;
    if (!quote) return missing.push(`${label}: no quote`);
    if (!numbersIn(quote).some((x) => Math.abs(x - value) < 1e-9)) missing.push(`${label}: ${value} is not in its quote`);
  };
  need(item.price, item.quote, "price");
  need(item.percent, item.quote, "percent");
  if (item.metered) need(item.metered.unitPrice, item.metered.quote ?? item.quote, "unit price");
  for (const t of item.tiers ?? []) need(t.monthly, t.quote ?? item.quote, `plan "${t.name}"`);
  return missing;
}

export function problems(model, today = new Date()) {
  const out = [];
  if (!model.items?.length) out.push("no items: every cost the app will have needs a line, even the ones that are free today");
  for (const it of model.items ?? []) {
    const label = `${it.name ?? "(no name)"}`;
    if (!it.name) out.push("an item has no name");
    if (!CATEGORIES.includes(it.category)) out.push(`${label}: category must be one of ${CATEGORIES.join(", ")}`);
    if (!/^https?:\/\//.test(it.source ?? "")) out.push(`${label}: no source page (the provider's own pricing page)`);
    if (it.billing && !["once", "monthly", "yearly"].includes(it.billing)) out.push(`${label}: billing must be once, monthly or yearly`);
    if (it.billing && typeof it.price !== "number") out.push(`${label}: billing "${it.billing}" needs a price`);
    if (!it.billing && !it.tiers?.length && !it.metered && !it.percent && !it.free) out.push(`${label}: no price (a billing and price, plans, a metered price or a percent; or "free": true)`);
    if (it.metered && !Object.hasOwn(model.usage ?? {}, it.metered.per) && !["users", "peakUsers", "storageGb", "egressGb"].includes(it.metered.per)) out.push(`${label}: metered by "${it.metered.per}", which the usage does not say per user`);
    for (const m of pricesInQuotes(it)) out.push(`${label}: ${m}`);
    const checked = it.checked ?? model.checked;
    if (!checked) out.push(`${label}: no date the price was checked`);
  }
  const g = groups(model.items ?? []);
  for (const [key, opts] of g) if (opts.length > 1 && opts.filter((o) => o.chosen).length > 1) out.push(`${key}: more than one option is "chosen"`);
  return out;
}

export function staleItems(model, today = new Date()) {
  return (model.items ?? []).filter((it) => {
    const d = Date.parse(it.checked ?? model.checked ?? "");
    return Number.isFinite(d) && (today - d) / 86400000 > STALE_DAYS;
  }).map((it) => it.name);
}

// The ladder of sizes to show: from the start up to ten times the expected size.
export function ladder(expected, start) {
  const steps = new Set([start, expected]);
  for (let n = 10; n <= Math.max(10, expected * 10); n *= 10) if (n > start) steps.add(n);
  return [...steps].filter((n) => n > 0).sort((a, b) => a - b);
}

const money = (x, cur = "USD") => (x === null || x === undefined ? "-" : `${cur === "USD" ? "$" : `${cur} `}${x < 10 ? x.toFixed(2) : Math.round(x).toLocaleString("en-US")}`);

export function report(model, profile, { users, start } = {}) {
  const cur = model.currency ?? "USD";
  const peakRatio = profile.usersTotal ? profile.usersPeak / profile.usersTotal : 0.1;
  const headroom = profile.headroom ?? 2;
  const expected = profile.usersTotal ?? 100;
  const first = start ?? Math.max(1, Math.min(10, expected));
  const sizes = users ?? ladder(expected, first);
  const L = [];
  const min = billAt(model, first, { peakRatio, headroom: 1 });
  const rec = billAt(model, expected, { peakRatio, headroom });
  L.push(`Running costs, from prices checked ${model.checked ?? "(see each item)"}. Estimates from the providers' own pages, not quotes.`);
  const line = (l) => `  ${l.name}${l.option ? ` (${l.option})` : ""}${l.tier ? `: ${l.tier}` : ""}: ${l.once !== null ? `${money(l.once, cur)} once` : money(l.cost, cur)}${l.beyond ? "  NO LISTED PLAN HAS ROOM: ask the provider for a quote" : ""}`;
  const fees = (b) => b.lines.filter((l) => l.category === "payments").reduce((s, l) => s + l.cost, 0);
  const feeNote = (b) => (fees(b) ? ` (of which ${money(fees(b), cur)} is payment fees, taken from what customers pay)` : "");
  L.push("", `MINIMUM TO BEGIN (${first} users, smallest plans that fit): ${money(min.monthly, cur)} a month${feeNote(min)}`);
  for (const l of min.lines) L.push(line(l));
  L.push("", `RECOMMENDED (${expected} users, ${Math.ceil(expected * peakRatio)} at once, plans with ${headroom}x room): ${money(rec.monthly, cur)} a month${feeNote(rec)}`);
  for (const l of rec.lines) L.push(line(l));
  const fy0 = firstYear(model, first, { peakRatio, headroom: 1 });
  const fy1 = firstYear(model, expected, { peakRatio, headroom });
  L.push("", `TO INVEST: ${money(fy0.once, cur)} paid once at the start. The first year in total, one-time costs included: about ${money(fy0.total, cur)} at the minimum, ${money(fy1.total, cur)} at the recommended size.`);
  L.push("", "AT EACH SIZE (a month, recommended plans):");
  for (const n of sizes) {
    const b = billAt(model, n, { peakRatio, headroom });
    L.push(`  ${String(n.toLocaleString("en-US")).padStart(10)} users: ${money(b.monthly, cur).padStart(9)}  (${money(b.perUser, cur)} a user${b.margin === null ? "" : `, revenue ${money(b.revenue, cur)}, ${b.margin >= 0 ? "profit" : "loss"} ${money(Math.abs(b.margin), cur)}`})`);
    for (const l of b.lines.filter((x) => x.alternatives)) L.push(`             ${l.group}: ${l.alternatives.map((a) => `${a.option} ${money(a.cost, cur)}${a.beyond ? " (no plan has room)" : ""}`).join(", ")}`);
  }
  const ups = upgradePoints(model, { peakRatio, headroom, maxUsers: expected * 10 });
  L.push("", "UPGRADE WHEN:");
  if (!ups.length) L.push("  No plan runs out before ten times the expected size.");
  for (const u of ups) L.push(`  At about ${u.atUsers.toLocaleString("en-US")} users, ${u.item}${u.option ? ` (${u.option})` : ""} outgrows "${u.from}" (${u.because}): ${u.to ? `move to "${u.to}", ${money(u.extra, cur)} more a month` : "beyond the largest plan listed: ask the provider for a quote"}.`);
  const be = breakEven(model, { peakRatio, headroom });
  if (typeof model.usage?.revenue === "number") L.push("", be ? `BREAK-EVEN: at about ${be.toLocaleString("en-US")} ${be === 1 ? "user" : "users"} the revenue covers the bill.` : "BREAK-EVEN: not reached up to 10 million users at these prices: the price per user is too low.");
  const stale = staleItems(model);
  if (stale.length) L.push("", `STALE: prices checked more than ${STALE_DAYS} days ago: ${stale.join(", ")}. Check them again before relying on them.`);
  return L.join("\n");
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  const a = process.argv.slice(2);
  const arg = (k) => (a.includes(k) ? a[a.indexOf(k) + 1] : undefined);
  const root = resolve(arg("--project") ?? ".");
  const file = costsPath(root);
  if (!existsSync(file)) {
    console.log("No .claude/costs.json yet. Planning writes it from the researched prices (see the cost check procedure).");
    process.exit(1);
  }
  let model;
  try {
    model = JSON.parse(readFileSync(file, "utf8"));
  } catch (e) {
    console.log(`.claude/costs.json is not valid JSON: ${e.message}`);
    process.exit(1);
  }
  const bad = problems(model);
  if (a.includes("--verify")) {
    const { checkCitations } = await import("./cite-check.mjs");
    const cites = [];
    for (const it of model.items ?? []) {
      for (const q of [it.quote, it.metered?.quote, ...(it.tiers ?? []).map((t) => t.quote)].filter(Boolean)) cites.push({ claim: it.name, url: it.source, quote: q });
    }
    for (const r of await checkCitations(cites)) {
      if (r.verdict === "NOT FOUND" || r.verdict === "TOO SHORT") bad.push(`${r.claim}: quote ${r.verdict} on ${r.url}`);
      if (r.verdict === "UNREACHABLE") console.log(`UNCHECKED ${r.claim}: ${r.url} ${r.why} (check it by hand, or quote a page that loads without scripts)`);
    }
  }
  const profile = loadProfile(root);
  const users = arg("--users")?.split(",").map((x) => Number(x.replace(/_/g, ""))).filter((x) => x > 0);
  const start = arg("--start") ? Number(arg("--start")) : undefined;
  if (a.includes("--json")) {
    const peakRatio = profile.usersTotal ? profile.usersPeak / profile.usersTotal : 0.1;
    console.log(JSON.stringify({ problems: bad, upgrades: upgradePoints(model, { peakRatio, headroom: profile.headroom }), sizes: (users ?? ladder(profile.usersTotal, start ?? 10)).map((n) => billAt(model, n, { peakRatio, headroom: profile.headroom })) }, null, 2));
  } else {
    if (!profile._set) console.log("NOTE: no scale profile yet; using the kit's small defaults for how many people use it at once.");
    console.log(report(model, profile, { users, start }));
  }
  if (bad.length) {
    console.log("", "PROBLEMS (fix before showing the owner):");
    for (const p of bad) console.log(`  ${p}`);
    process.exitCode = 1;
  }
}
