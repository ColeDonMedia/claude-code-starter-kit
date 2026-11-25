// Scale profile: how many people an app must serve, and what that means for how it is built and tested. A one-person desktop
// app and a SaaS with 15,000 people online at once need opposite things: the first must start fast and stay light; the second
// must keep answering while thousands of requests arrive. Building the wrong one wastes effort (queues nobody needs) or fails
// in production (a design that works for ten people). The plan sets the profile once, in plain answers; this script turns it
// into numbers (requests per second at the busiest time, table sizes after a year, connections) and into what to build, what to
// test and what to skip for that size.
// Stored in .claude/scale.json (plain data, no commands). Run:
//   node scale-profile.mjs --project <dir> --set kind=saas usersTotal=150000 usersPeak=15000 [key=value ...]
//   node scale-profile.mjs --project <dir> [--report] [--json]
//   node scale-profile.mjs --project <dir> --actual usersTotal=4000 usersPeak=600     (after launch: is a re-test due?)
//   node scale-profile.mjs --project <dir> --check                                   (exit 1 when there is no profile)
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const KINDS = ["web", "saas", "api", "desktop", "cli", "mobile", "library", "game", "other"];
const ON_DEVICE = new Set(["desktop", "cli", "mobile", "library"]);
export const DOWNTIME = ["minutes", "hour-costs-money", "never"];

// Defaults are deliberately modest: the plan should replace them with the owner's answers.
export const DEFAULTS = {
  kind: "web",
  usersTotal: 100, // people with an account (or installs) after a year
  usersPeak: 10, // people using it at the same moment at the busiest time
  actionsPerMinute: 4, // server requests each active person causes per minute (page loads, saves, refreshes)
  recordsPerUser: 50, // rows each person creates in the main table over a year
  writeShare: 0.2, // share of requests that change data
  realtime: false, // live updates (chat, dashboards, collaboration) keep a connection open per person
  latencyMs: 150, // assumed time per request, for sizing connections
  headroom: 2, // test at this multiple of the expected peak
  downtime: "minutes", // what an outage costs: "minutes" (annoying), "hour-costs-money", "never"
  p95Ms: 300, // 95 of 100 requests must answer within this, at the target load
};

const NUMERIC = ["usersTotal", "usersPeak", "actionsPerMinute", "recordsPerUser", "writeShare", "latencyMs", "headroom", "p95Ms"];

export function profilePath(root) {
  return join(root, ".claude", "scale.json");
}

export function loadProfile(root) {
  try {
    return { ...DEFAULTS, ...JSON.parse(readFileSync(profilePath(root), "utf8")), _set: true };
  } catch {
    return { ...DEFAULTS, _set: false };
  }
}

export function parsePairs(pairs) {
  const out = {};
  const problems = [];
  for (const p of pairs) {
    const m = /^([A-Za-z]+)=(.*)$/.exec(p);
    if (!m) {
      problems.push(`"${p}" is not key=value`);
      continue;
    }
    const [, k, raw] = m;
    if (NUMERIC.includes(k)) {
      const n = Number(String(raw).replace(/[_,]/g, ""));
      if (!Number.isFinite(n) || n < 0) problems.push(`${k} must be a number, got "${raw}"`);
      else out[k] = n;
    } else if (k === "kind") {
      if (!KINDS.includes(raw)) problems.push(`kind must be one of ${KINDS.join(", ")}`);
      else out.kind = raw;
    } else if (k === "downtime") {
      if (!DOWNTIME.includes(raw)) problems.push(`downtime must be one of ${DOWNTIME.join(", ")}`);
      else out.downtime = raw;
    } else if (k === "realtime") out.realtime = /^(true|yes|1)$/i.test(raw);
    else problems.push(`unknown setting "${k}"`);
  }
  if (out.usersPeak !== undefined && out.usersTotal !== undefined && out.usersPeak > out.usersTotal) problems.push("usersPeak cannot be more than usersTotal");
  return { values: out, problems };
}

export function saveProfile(root, values) {
  const current = existsSync(profilePath(root)) ? JSON.parse(readFileSync(profilePath(root), "utf8")) : {};
  const next = { ...current, ...values, updated: new Date().toISOString().slice(0, 10) };
  mkdirSync(join(root, ".claude"), { recursive: true });
  writeFileSync(profilePath(root), JSON.stringify(next, null, 2) + "\n");
  return next;
}

export function tierOf(p) {
  if (ON_DEVICE.has(p.kind)) return "single-user";
  if (p.usersPeak <= 50) return "small";
  if (p.usersPeak <= 1000) return "medium";
  if (p.usersPeak <= 20000) return "large";
  return "very-large";
}

// The numbers that follow from the answers. Little's law: requests in flight = arrival rate x time each takes.
export function derive(p) {
  const peakRps = (p.usersPeak * p.actionsPerMinute) / 60;
  const targetRps = Math.max(1, Math.ceil(peakRps * p.headroom));
  const inFlight = targetRps * (p.latencyMs / 1000);
  return {
    tier: tierOf(p),
    onDevice: ON_DEVICE.has(p.kind),
    peakRps: Math.round(peakRps * 10) / 10,
    targetRps,
    writesPerSecond: Math.round(targetRps * p.writeShare * 10) / 10,
    inFlight: Math.ceil(inFlight),
    dbPool: Math.max(5, Math.ceil(inFlight * 1.5)),
    openConnections: p.realtime ? p.usersPeak : 0,
    mainTableRows: Math.round(p.usersTotal * p.recordsPerUser),
    usersTableRows: p.usersTotal,
    loadConcurrency: Math.max(1, Math.ceil(inFlight * 2)),
  };
}

const GUIDE = {
  "single-user": {
    build: [
      "start fast: show the window or first output before loading anything heavy; load the rest on demand",
      "stay light when idle: no polling loops, no background work while nothing is happening, release big buffers after use",
      "handle the biggest real input (a long recording, a huge file) by streaming it, not by loading it all into memory",
      "store data locally (files or an embedded database such as SQLite); no server, no accounts unless the plan needs them",
      "keep the download small: no unused libraries or bundled tools",
    ],
    test: [
      "start-up time, memory and processor use while idle and while working, download size (desktop-check.mjs)",
      "the largest realistic input, and a long session (memory must not keep growing)",
    ],
    skip: ["load tests, multi-user isolation, caching layers, queues, extra servers"],
  },
  small: {
    build: [
      "one server and one database are enough; keep the server stateless so a second copy can be added later",
      "an index for every column a query filters, joins or sorts on; every list paged",
      "no queries inside loops (api-check.mjs); slow work (email, files, reports) in a background job",
      "daily backups with one tested restore",
    ],
    test: ["the database at its one-year size (db-rehearse.mjs)", "a local load test at the target rate (load-test.mjs)", "a query-count test for each list endpoint"],
    skip: ["caching layers, queues for everything, read replicas, several regions"],
  },
  medium: {
    build: [
      "everything for small, plus: a database connection pool sized to the numbers below",
      "background jobs for anything slower than a fraction of a second; cache the hottest reads, with a clear expiry",
      "rate limits per user and per IP on sign-in and expensive actions; static files from a CDN",
      "a stateless server, so two or more copies can run behind the host's load balancer",
    ],
    test: [
      "a local load test that ramps to twice the expected peak and finds where it starts to slow down",
      "the database at its one-year size; query counts per request; p95 within budget at the target rate",
    ],
    skip: ["sharding, several regions, a separate service per feature"],
  },
  large: {
    build: [
      "everything for medium, plus: several server copies behind a load balancer, with health checks",
      "cursor-based paging (not page numbers) for big lists; no request that touches more rows than it shows",
      "read replicas or a cache for heavy reads; a queue for writes that can wait; per-user limits so one user cannot slow everyone",
      "live updates through a service built for many open connections, if the app has them",
      "metrics the owner can see: requests per second, p95 time, error rate, queue length, database load",
    ],
    test: [
      "a local load test ramp, a 30-minute soak test (memory and connections must not keep growing), and the database at its one-year size",
      "on the host's staging copy (the owner runs it, or approves it): the same load, because one developer computer cannot stand in for production",
    ],
    skip: ["sharding and several regions until the numbers say so"],
  },
  "very-large": {
    build: [
      "everything for large, plus: a written capacity plan, partitioning of the biggest tables, and queue-based processing for most writes",
      "consider several regions if users are spread out or downtime is unacceptable",
      "this is the size where an experienced engineer should review the architecture before launch: say so to the owner",
    ],
    test: ["everything for large, at the host, before launch and after every big change"],
    skip: ["nothing important: the full process applies"],
  },
};

export function guidance(p) {
  const d = derive(p);
  const g = GUIDE[d.tier];
  const build = [...g.build];
  if (!d.onDevice && p.downtime === "never") build.push("downtime is unacceptable: at least two server copies, zero-downtime deploys, a database with automatic failover, and a practised restore");
  else if (!d.onDevice && p.downtime === "hour-costs-money") build.push("an hour down costs money: health checks with alerts, a practised rollback, and a tested restore");
  return { ...d, build, test: g.test, skip: g.skip };
}

const n = (x) => Number(x).toLocaleString("en-US");

export function report(p) {
  const g = guidance(p);
  const lines = [];
  lines.push(p._set ? `Scale profile: ${p.kind}, ${g.tier.replace("-", " ")}.` : "No scale profile yet: these are DEFAULTS. The plan must set the real numbers (--set).");
  if (g.onDevice) {
    lines.push(`Runs on each person's own ${p.kind === "mobile" ? "phone" : "computer"}: about ${n(p.usersTotal)} people, one at a time each. Fast means: quick start, light when idle, small download.`);
  } else {
    lines.push(
      `About ${n(p.usersTotal)} people, ${n(p.usersPeak)} at the busiest moment, each causing about ${p.actionsPerMinute} requests a minute:`,
      `- about ${n(g.peakRps)} requests a second at peak; test at ${n(g.targetRps)} a second (${p.headroom}x headroom), ${n(g.writesPerSecond)} of them writes`,
      `- about ${n(g.inFlight)} requests in progress at once; a database connection pool of about ${n(g.dbPool)}`,
      `- the main table reaches about ${n(g.mainTableRows)} rows in a year (users: ${n(g.usersTableRows)})${g.openConnections ? `; ${n(g.openConnections)} live connections held open` : ""}`,
      `- 95 of 100 requests must answer within ${p.p95Ms} ms at that load`,
    );
  }
  lines.push("Build:", ...g.build.map((b) => `- ${b}`), "Test:", ...g.test.map((t) => `- ${t}`), "Deliberately skip:", ...g.skip.map((s) => `- ${s}`));
  if (!g.onDevice) lines.push("These numbers are estimates from the plan's answers. A load test on one computer finds weak code (slow queries, leaks, lock-ups); it does not prove what the host can carry.");
  return lines.join("\n");
}

// After launch: compare real numbers with the plan. Re-test when reality passes half of what was planned for.
export function compareActual(p, actual) {
  const notes = [];
  let retest = false;
  for (const k of ["usersTotal", "usersPeak"]) {
    if (actual[k] === undefined) continue;
    const share = p[k] ? actual[k] / p[k] : Infinity;
    if (share >= 1) {
      notes.push(`${k}: ${n(actual[k])} is past the planned ${n(p[k])}: update the profile and re-test at about twice the real number now`);
      retest = true;
    } else if (share >= 0.5) {
      notes.push(`${k}: ${n(actual[k])} is ${Math.round(share * 100)}% of the planned ${n(p[k])}: re-test at the planned size before it is reached`);
      retest = true;
    } else notes.push(`${k}: ${n(actual[k])} is ${Math.round(share * 100)}% of the planned ${n(p[k])}: fine`);
  }
  return { retest, notes, suggested: retest ? Object.fromEntries(["usersTotal", "usersPeak"].filter((k) => actual[k] !== undefined).map((k) => [k, Math.max(p[k], actual[k] * 2)])) : null };
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  const a = process.argv.slice(2);
  const root = resolve(a.includes("--project") ? a[a.indexOf("--project") + 1] : ".");
  const pairsAfter = (flag) => (a.includes(flag) ? a.slice(a.indexOf(flag) + 1).filter((x) => !x.startsWith("--")) : []);
  if (a.includes("--set")) {
    const { values, problems } = parsePairs(pairsAfter("--set"));
    if (problems.length) {
      console.log(problems.map((x) => `- ${x}`).join("\n"));
      process.exit(64);
    }
    saveProfile(root, values);
    console.log(report(loadProfile(root)));
  } else if (a.includes("--actual")) {
    const { values, problems } = parsePairs(pairsAfter("--actual"));
    if (problems.length) {
      console.log(problems.map((x) => `- ${x}`).join("\n"));
      process.exit(64);
    }
    const r = compareActual(loadProfile(root), values);
    console.log(r.notes.map((x) => `- ${x}`).join("\n") + (r.suggested ? `\nSuggested: --set ${Object.entries(r.suggested).map(([k, v]) => `${k}=${v}`).join(" ")}` : ""));
    process.exitCode = r.retest ? 1 : 0;
  } else if (a.includes("--check")) {
    const p = loadProfile(root);
    console.log(p._set ? `Scale profile set: ${p.kind}, ${tierOf(p)}.` : "No scale profile: the plan must set one (node scale-profile.mjs --set ...).");
    process.exitCode = p._set ? 0 : 1;
  } else {
    const p = loadProfile(root);
    console.log(a.includes("--json") ? JSON.stringify({ profile: p, ...guidance(p) }, null, 1) : report(p));
  }
}
