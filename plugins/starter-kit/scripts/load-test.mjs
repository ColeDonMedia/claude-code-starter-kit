// Local load test: many simulated people using a copy of the app running on THIS computer at once, stepping up until it slows
// down or breaks, to see whether it holds the rate the scale profile asks for. It finds weak code (slow queries, missing
// indexes, leaks, lock-ups, crashes under concurrency) before real users do. It refuses any address that is not this computer:
// load against someone else's server is an attack. Written in plain Node: nothing to install.
// One computer is both the crowd and the server here, so a high-traffic app can look slower than it would be on its host: the
// result says so, and the final check for big apps is the host's staging copy.
// Run: node load-test.mjs --url http://localhost:3000/api/items [--url ...] [--scenario requests.json] [--project <dir>]
//        [--target-rps N] [--p95 300] [--stages 1,5,10,25,50] [--stage-seconds 10] [--think-ms 0] [--header "Name: value"]
// Results go to .claude/load-results.json. Exit 0 = holds the target, 1 = breaks or too slow at or below it, 2 = could not reach it here.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import http from "node:http";
import https from "node:https";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { derive, loadProfile } from "./scale-profile.mjs";

const LOCAL = /^(localhost|127(\.\d{1,3}){3}|\[?::1\]?|0\.0\.0\.0|[a-z0-9-]+\.localhost)$/i;

export function isLocalUrl(u) {
  try {
    const url = new URL(u);
    return /^https?:$/.test(url.protocol) && LOCAL.test(url.hostname.replace(/^\[|\]$/g, ""));
  } catch {
    return false;
  }
}

export function percentile(sorted, p) {
  if (!sorted.length) return 0;
  const i = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[i];
}

function once(agentFor, req, timeoutMs) {
  return new Promise((resolveReq) => {
    const url = new URL(req.url);
    const lib = url.protocol === "https:" ? https : http;
    const started = performance.now();
    const body = req.body === undefined ? null : typeof req.body === "string" ? req.body : JSON.stringify(req.body);
    const headers = { ...(req.headers ?? {}) };
    if (body && !Object.keys(headers).some((h) => h.toLowerCase() === "content-type")) headers["content-type"] = "application/json";
    const r = lib.request(url, { method: req.method ?? "GET", headers, agent: agentFor(url.protocol), timeout: timeoutMs }, (res) => {
      res.resume();
      res.on("end", () => resolveReq({ ms: performance.now() - started, status: res.statusCode }));
    });
    r.on("timeout", () => r.destroy(new Error("timeout")));
    r.on("error", (e) => resolveReq({ ms: performance.now() - started, status: 0, error: /timeout/.test(e.message) ? "timeout" : e.code ?? e.message }));
    if (body) r.write(body);
    r.end();
  });
}

// One stage: `concurrency` simulated people, each sending a request, waiting for the answer, pausing `thinkMs`, again.
export async function runStage({ requests, concurrency, seconds, thinkMs = 0, timeoutMs = 10000 }) {
  const agents = { "http:": new http.Agent({ keepAlive: true, maxSockets: concurrency }), "https:": new https.Agent({ keepAlive: true, maxSockets: concurrency }) };
  const agentFor = (p) => agents[p];
  const total = requests.reduce((s, r) => s + (r.weight ?? 1), 0);
  const pick = () => {
    let x = Math.random() * total;
    for (const r of requests) if ((x -= r.weight ?? 1) <= 0) return r;
    return requests[requests.length - 1];
  };
  const times = [];
  const statuses = {};
  let errors = 0;
  let timeouts = 0;
  const started = performance.now();
  const deadline = started + seconds * 1000;
  const worker = async () => {
    while (performance.now() < deadline) {
      const r = await once(agentFor, pick(), timeoutMs);
      times.push(r.ms);
      statuses[r.status || r.error] = (statuses[r.status || r.error] ?? 0) + 1;
      if (r.error === "timeout") timeouts++;
      if (r.status === 0 || r.status >= 500 || r.status === 429) errors++;
      if (thinkMs) await new Promise((w) => setTimeout(w, thinkMs));
    }
  };
  await Promise.all(Array.from({ length: concurrency }, worker));
  for (const a of Object.values(agents)) a.destroy();
  const elapsed = (performance.now() - started) / 1000;
  const sorted = times.sort((x, y) => x - y);
  return {
    concurrency,
    requests: times.length,
    rps: Math.round((times.length / elapsed) * 10) / 10,
    p50: Math.round(percentile(sorted, 50)),
    p95: Math.round(percentile(sorted, 95)),
    p99: Math.round(percentile(sorted, 99)),
    max: Math.round(sorted[sorted.length - 1] ?? 0),
    errorRate: times.length ? Math.round((errors / times.length) * 1000) / 1000 : 1,
    timeouts,
    statuses,
  };
}

// Step up the crowd until the target rate is reached, or it breaks, or the computer runs out of room.
export async function ramp({ requests, stages, seconds, thinkMs, targetRps, p95Ms, timeoutMs }) {
  const results = [];
  for (const c of stages) {
    const s = await runStage({ requests, concurrency: c, seconds, thinkMs, timeoutMs });
    results.push(s);
    const broken = s.errorRate > 0.05 || s.p95 > p95Ms * 5;
    if (broken || s.rps >= targetRps * 1.2) break;
  }
  return judge(results, targetRps, p95Ms);
}

export function judge(stages, targetRps, p95Ms) {
  const healthy = (s) => s.errorRate <= 0.01 && s.p95 <= p95Ms;
  const atTarget = stages.find((s) => s.rps >= targetRps);
  const best = [...stages].filter(healthy).sort((a, b) => b.rps - a.rps)[0] ?? null;
  const firstBad = stages.find((s) => !healthy(s));
  let verdict;
  let why;
  if (atTarget && healthy(atTarget)) {
    verdict = "holds";
    why = `held ${atTarget.rps} requests a second (target ${targetRps}) with ${atTarget.concurrency} at once: p95 ${atTarget.p95} ms (budget ${p95Ms}), errors ${(atTarget.errorRate * 100).toFixed(1)}%`;
  } else if (firstBad && firstBad.rps <= targetRps) {
    verdict = "breaks";
    const what = firstBad.errorRate > 0.01 ? `${(firstBad.errorRate * 100).toFixed(1)}% of requests failed` : `p95 reached ${firstBad.p95} ms (budget ${p95Ms})`;
    why = `at ${firstBad.concurrency} at once (${firstBad.rps} requests a second, below the target of ${targetRps}) ${what}`;
  } else {
    verdict = "not-reached";
    why = `this computer reached ${best?.rps ?? 0} requests a second while healthy, below the target of ${targetRps}. That can be the computer, not the app (one machine is both the crowd and the server): repeat on the host's staging copy`;
  }
  return { verdict, why, targetRps, p95Ms, bestHealthyRps: best?.rps ?? 0, stages };
}

function parseHeaders(list) {
  const h = {};
  for (const x of list) {
    const i = x.indexOf(":");
    if (i > 0) h[x.slice(0, i).trim()] = x.slice(i + 1).trim();
  }
  return h;
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  const a = process.argv.slice(2);
  const all = (f) => a.flatMap((x, i) => (x === f && a[i + 1] !== undefined ? [a[i + 1]] : []));
  const get = (f, d) => (a.includes(f) ? a[a.indexOf(f) + 1] : d);
  const root = resolve(get("--project", "."));
  const profile = loadProfile(root);
  const d = derive(profile);
  const headers = parseHeaders(all("--header"));
  let requests = all("--url").map((url) => ({ method: "GET", url, headers }));
  if (get("--scenario")) requests = JSON.parse(readFileSync(get("--scenario"), "utf8")).map((r) => ({ ...r, headers: { ...headers, ...(r.headers ?? {}) } }));
  if (!requests.length) {
    console.log("Give at least one --url (or a --scenario file) of the app running on this computer.");
    process.exit(64);
  }
  const remote = requests.filter((r) => !isLocalUrl(r.url));
  if (remote.length) {
    console.log(`Refused: ${remote[0].url} is not on this computer. Load tests only ever run against a local copy; for the host, the owner runs it on the staging copy.`);
    process.exit(64);
  }
  const targetRps = Number(get("--target-rps", d.targetRps));
  const p95Ms = Number(get("--p95", profile.p95Ms));
  const stages = String(get("--stages", "1,5,10,25,50,100,200")).split(",").map(Number).filter((x) => x > 0);
  const result = await ramp({ requests, stages, seconds: Number(get("--stage-seconds", 10)), thinkMs: Number(get("--think-ms", 0)), targetRps, p95Ms, timeoutMs: Number(get("--timeout-ms", 10000)) });
  console.log(`Load test against ${requests.length} address(es), target ${targetRps} requests a second (from ${profile._set ? "the scale profile" : "defaults: set a scale profile"}):`);
  for (const s of result.stages) console.log(`  ${String(s.concurrency).padStart(4)} at once: ${String(s.rps).padStart(8)} req/s  p50 ${s.p50} ms  p95 ${s.p95} ms  p99 ${s.p99} ms  errors ${(s.errorRate * 100).toFixed(1)}%${s.timeouts ? `  timeouts ${s.timeouts}` : ""}`);
  console.log(`${result.verdict === "holds" ? "HOLDS" : result.verdict === "breaks" ? "BREAKS" : "NOT REACHED"}: ${result.why}.`);
  mkdirSync(join(root, ".claude"), { recursive: true });
  writeFileSync(join(root, ".claude", "load-results.json"), JSON.stringify({ measuredAt: new Date().toISOString(), ...result }, null, 2));
  process.exitCode = result.verdict === "holds" ? 0 : result.verdict === "breaks" ? 1 : 2;
}
