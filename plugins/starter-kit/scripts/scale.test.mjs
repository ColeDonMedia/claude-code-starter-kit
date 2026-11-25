// Sizing an app to its users: the scale profile and its numbers, the local load test, the desktop/CLI check, and rehearsal
// sizes taken from the profile. Run: node --test plugins/starter-kit/scripts/scale.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import http from "node:http";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { DEFAULTS, compareActual, derive, guidance, loadProfile, parsePairs, report, saveProfile, tierOf } from "./scale-profile.mjs";
import { isLocalUrl, judge, percentile, ramp, runStage } from "./load-test.mjs";
import { judgeDesktop, measure, sizeOf, treeOf } from "./desktop-check.mjs";
import { seedCount } from "./db-rehearse.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const dir = () => {
  const d = mkdtempSync(join(tmpdir(), "scale-"));
  return { d, done: () => rmSync(d, { recursive: true, force: true }) };
};
const P = (o) => ({ ...DEFAULTS, ...o, _set: true });

// ---------------- the profile ----------------
test("the two examples land in opposite tiers with the right numbers", () => {
  const frost = P({ kind: "desktop", usersTotal: 5000, usersPeak: 1 });
  assert.equal(tierOf(frost), "single-user");
  const g = guidance(frost);
  assert.ok(g.build.some((b) => /start fast/.test(b)) && g.skip.some((s) => /load tests/.test(s)));
  const saas = P({ kind: "saas", usersTotal: 150000, usersPeak: 15000, actionsPerMinute: 4, recordsPerUser: 200, writeShare: 0.2, latencyMs: 150, headroom: 2 });
  const d = derive(saas);
  assert.equal(d.tier, "large");
  assert.equal(d.peakRps, 1000); // 15,000 people x 4 a minute / 60
  assert.equal(d.targetRps, 2000);
  assert.equal(d.writesPerSecond, 400);
  assert.equal(d.inFlight, 300); // Little's law: 2000/s x 0.15 s
  assert.equal(d.dbPool, 450);
  assert.equal(d.mainTableRows, 30000000);
  assert.ok(guidance(saas).build.some((b) => /several server copies/.test(b)));
});

test("tiers follow the peak, and what downtime costs adds to what is built", () => {
  assert.equal(tierOf(P({ kind: "web", usersPeak: 50 })), "small");
  assert.equal(tierOf(P({ kind: "web", usersPeak: 51 })), "medium");
  assert.equal(tierOf(P({ kind: "api", usersPeak: 1001 })), "large");
  assert.equal(tierOf(P({ kind: "saas", usersPeak: 20001 })), "very-large");
  for (const k of ["cli", "mobile", "library"]) assert.equal(tierOf(P({ kind: k, usersPeak: 999 })), "single-user");
  assert.ok(guidance(P({ kind: "web", usersPeak: 10, downtime: "never" })).build.some((b) => /two server copies, zero-downtime deploys/.test(b)));
  assert.ok(!guidance(P({ kind: "desktop", downtime: "never" })).build.some((b) => /server copies/.test(b)), "no server advice for an app on the user's computer");
  assert.ok(guidance(P({ kind: "saas", usersPeak: 50000 })).build.some((b) => /experienced engineer should review/.test(b)));
});

test("realtime apps count open connections; the report states numbers and limits in plain words", () => {
  const p = P({ kind: "saas", usersTotal: 20000, usersPeak: 3000, realtime: true });
  assert.equal(derive(p).openConnections, 3000);
  const r = report(p);
  assert.match(r, /3,000 at the busiest moment/);
  assert.match(r, /3,000 live connections held open/);
  assert.match(r, /does not prove what the host can carry/);
  assert.match(report({ ...DEFAULTS, _set: false }), /No scale profile yet: these are DEFAULTS/);
  assert.match(report(P({ kind: "desktop" })), /own computer/);
});

test("settings are validated, saved as plain data, and merged", () => {
  const t = dir();
  try {
    assert.deepEqual(parsePairs(["kind=spaceship"]).problems, [`kind must be one of web, saas, api, desktop, cli, mobile, library, game, other`]);
    assert.ok(parsePairs(["usersPeak=lots"]).problems[0].includes("must be a number"));
    assert.ok(parsePairs(["usersTotal=10", "usersPeak=20"]).problems.some((x) => /cannot be more/.test(x)));
    assert.deepEqual(parsePairs(["usersTotal=150,000", "realtime=yes"]).values, { usersTotal: 150000, realtime: true });
    saveProfile(t.d, { kind: "saas", usersTotal: 1000 });
    saveProfile(t.d, { usersPeak: 100 });
    const p = loadProfile(t.d);
    assert.equal(p._set, true);
    assert.deepEqual([p.kind, p.usersTotal, p.usersPeak], ["saas", 1000, 100]);
    const cli = spawnSync(process.execPath, [join(HERE, "scale-profile.mjs"), "--project", t.d, "--check"], { encoding: "utf8" });
    assert.equal(cli.status, 0);
    const empty = dir();
    assert.equal(spawnSync(process.execPath, [join(HERE, "scale-profile.mjs"), "--project", empty.d, "--check"], { encoding: "utf8" }).status, 1);
    empty.done();
  } finally {
    t.done();
  }
});

test("after launch: real numbers past half the plan call for a re-test, and suggest a new profile", () => {
  const p = P({ usersTotal: 10000, usersPeak: 1000 });
  assert.equal(compareActual(p, { usersTotal: 2000, usersPeak: 200 }).retest, false);
  const half = compareActual(p, { usersPeak: 600 });
  assert.equal(half.retest, true);
  assert.match(half.notes[0], /60% of the planned 1,000/);
  const past = compareActual(p, { usersTotal: 12000, usersPeak: 1500 });
  assert.deepEqual(past.suggested, { usersTotal: 24000, usersPeak: 3000 });
});

// ---------------- rehearsal sizes ----------------
test("rehearsal sizes come from the profile, capped so a rehearsal finishes, with the scale reported", () => {
  const p = P({ usersTotal: 150000, recordsPerUser: 200 });
  assert.deepEqual(seedCount("users", p), { planned: 150000, rows: 150000, scale: 1 });
  const big = seedCount("per-user:200", p);
  assert.equal(big.planned, 30000000);
  assert.equal(big.rows, 2000000);
  assert.equal(big.scale, 15);
  assert.equal(seedCount("main", p).planned, 30000000);
  assert.equal(seedCount("5000", p).rows, 5000);
  assert.match(seedCount("lots", p).error, /not a row count/);
});

// ---------------- load test ----------------
function server(handler) {
  return new Promise((res) => {
    const s = http.createServer(handler);
    s.listen(0, "127.0.0.1", () => res({ url: `http://127.0.0.1:${s.address().port}`, close: () => new Promise((c) => s.close(c)) }));
  });
}
test("load test: only this computer can be a target", () => {
  for (const u of ["http://localhost:3000/x", "http://127.0.0.1:8080", "http://[::1]:3000", "http://app.localhost/x"]) assert.ok(isLocalUrl(u), u);
  for (const u of ["https://example.com", "http://10.0.0.5:3000", "http://192.168.1.20", "ftp://localhost/x", "not a url"]) assert.ok(!isLocalUrl(u), u);
  const r = spawnSync(process.execPath, [join(HERE, "load-test.mjs"), "--url", "https://shop.example.com/"], { encoding: "utf8" });
  assert.equal(r.status, 64);
  assert.match(r.stdout, /Refused: .* is not on this computer/);
});

test("load test: counts, rate, percentiles and errors are measured correctly", async () => {
  let n = 0;
  const s = await server((req, res) => {
    n++;
    if (req.url === "/fail" && n % 2 === 0) {
      res.statusCode = 500;
      return res.end("no");
    }
    setTimeout(() => res.end("ok"), 5);
  });
  try {
    const st = await runStage({ requests: [{ url: `${s.url}/ok` }, { url: `${s.url}/fail` }], concurrency: 4, seconds: 1 });
    assert.ok(st.requests > 20, `only ${st.requests} requests`);
    assert.ok(st.rps > 10);
    assert.ok(st.p50 >= 4 && st.p95 >= st.p50 && st.p99 >= st.p95);
    assert.ok(st.errorRate > 0.1 && st.errorRate < 0.5, `error rate ${st.errorRate}`);
    assert.equal(percentile([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 95), 10);
    assert.equal(percentile([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 50), 5);
  } finally {
    await s.close();
  }
});

test("load test: a healthy app holds a small target; a slow one breaks below it; a ceiling here is reported as not reached", async () => {
  const fast = await server((req, res) => res.end("ok"));
  const slow = await server((req, res) => setTimeout(() => res.end("ok"), 120));
  try {
    const ok = await ramp({ requests: [{ url: fast.url }], stages: [1, 4], seconds: 1, targetRps: 20, p95Ms: 300 });
    assert.equal(ok.verdict, "holds", ok.why);
    const bad = await ramp({ requests: [{ url: slow.url }], stages: [2, 4], seconds: 1, targetRps: 500, p95Ms: 50 });
    assert.equal(bad.verdict, "breaks", bad.why);
    assert.match(bad.why, /p95 reached \d+ ms \(budget 50\)/);
  } finally {
    await fast.close();
    await slow.close();
  }
  const stages = [{ concurrency: 10, rps: 300, p95: 40, errorRate: 0 }, { concurrency: 50, rps: 450, p95: 120, errorRate: 0 }];
  const capped = judge(stages, 2000, 300);
  assert.equal(capped.verdict, "not-reached");
  assert.match(capped.why, /repeat on the host's staging copy/);
});

test("load test CLI: reads the target from the profile and writes its results", async () => {
  const t = dir();
  const s = await server((req, res) => res.end("ok"));
  try {
    saveProfile(t.d, { kind: "web", usersTotal: 100, usersPeak: 10, actionsPerMinute: 6 });
    const r = await new Promise((res) => {
      const p = spawn(process.execPath, [join(HERE, "load-test.mjs"), "--project", t.d, "--url", `${s.url}/`, "--stages", "1,2", "--stage-seconds", "1"]);
      let out = "";
      p.stdout.on("data", (d) => (out += d));
      p.on("close", (code) => res({ code, out }));
    });
    assert.equal(r.code, 0, r.out);
    assert.match(r.out, /target 2 requests a second \(from the scale profile\)/);
    assert.match(r.out, /HOLDS/);
    assert.equal(JSON.parse(readFileSync(join(t.d, ".claude", "load-results.json"), "utf8")).verdict, "holds");
  } finally {
    await s.close();
    t.done();
  }
});

// ---------------- desktop and CLI ----------------
test("desktop check: times start-up, measures the whole process tree, and always stops the app", { timeout: 120000 }, async () => {
  const t = dir();
  try {
    writeFileSync(join(t.d, "app.js"), 'const big = Buffer.alloc(40 * 1024 * 1024, 1);\nsetTimeout(() => console.log("ready"), 300);\nsetInterval(() => big[0]++, 5000);\n');
    const m = await measure({ cmd: "node app.js", cwd: t.d, readyText: "ready", watchSeconds: 6 });
    assert.equal(m.error, null);
    assert.ok(m.readyMs >= 250 && m.readyMs < 20000, `ready in ${m.readyMs} ms`);
    assert.ok(m.samples >= 1, "memory was sampled");
    assert.ok(m.idleMb > 40, `the 40 MB buffer is counted (got ${m.idleMb} MB)`);
    await new Promise((w) => setTimeout(w, 1000));
    const ps = process.platform === "win32"
      ? spawnSync("powershell", ["-NoProfile", "-Command", `(Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -like '*${t.d.replace(/'/g, "''").split(/[\\/]/).pop()}*app.js*' -or ($_.CommandLine -like '*node*app.js*' -and $_.ProcessId -ne $PID) }).Count`], { encoding: "utf8" })
      : spawnSync("pgrep", ["-f", "node app.js"], { encoding: "utf8" });
    assert.ok(process.platform === "win32" ? Number(ps.stdout.trim() || 0) === 0 : ps.status !== 0, "the app was stopped");
  } finally {
    t.done();
  }
});

test("desktop check: a command-line run is timed to its end; an app that never gets ready is reported", { timeout: 120000 }, async () => {
  const t = dir();
  try {
    const cli = await measure({ cmd: 'node -e "setTimeout(()=>{},150)"', cwd: t.d, untilExit: true });
    assert.equal(cli.exitCode, 0);
    assert.ok(cli.readyMs >= 150);
    writeFileSync(join(t.d, "slow.js"), "setInterval(() => {}, 1000);\n");
    const never = await measure({ cmd: "node slow.js", cwd: t.d, readyText: "this never prints", timeoutMs: 2000 });
    assert.match(never.error, /never became ready within 2 s/);
    const crash = await measure({ cmd: 'node -e "process.exit(3)"', cwd: t.d, readyText: "ready" });
    assert.match(crash.error, /stopped before it was ready \(exit 3\)/);
  } finally {
    t.done();
  }
});

test("desktop check: budgets, process trees and download size", () => {
  const b = { startMs: 2000, idleMb: 250, idleCpu: 2, downloadMb: 150 };
  assert.deepEqual(judgeDesktop({ readyMs: 900, idleMb: 120, idleCpu: 0.5 }, b, 50 * 1048576), []);
  const over = judgeDesktop({ readyMs: 4100, idleMb: 600, idleCpu: 9 }, b, 400 * 1048576);
  assert.equal(over.length, 4);
  assert.match(over[0], /4100 ms to be ready/);
  assert.match(over[3], /download is 400 MB/);
  const table = [{ pid: 1, ppid: 0, bytes: 10, cpuSec: 0 }, { pid: 2, ppid: 1, bytes: 20, cpuSec: 0 }, { pid: 3, ppid: 2, bytes: 30, cpuSec: 0 }, { pid: 4, ppid: 9, bytes: 99, cpuSec: 0 }];
  assert.deepEqual(treeOf(table, 1).map((p) => p.pid).sort(), [1, 2, 3]);
  const t = dir();
  try {
    mkdirSync(join(t.d, "app", "res"), { recursive: true });
    writeFileSync(join(t.d, "app", "a.bin"), Buffer.alloc(1000));
    writeFileSync(join(t.d, "app", "res", "b.bin"), Buffer.alloc(500));
    assert.equal(sizeOf(join(t.d, "app")), 1500);
    assert.equal(sizeOf(join(t.d, "missing")), null);
  } finally {
    t.done();
  }
});

test("session start asks for a size when a project with a roadmap has none on record, and stops asking once it is set", () => {
  const t = dir();
  try {
    writeFileSync(join(t.d, "package.json"), "{}");
    writeFileSync(join(t.d, "CLAUDE.md"), "<!-- starter-kit:managed -->\n");
    const note = () => JSON.parse(spawnSync(process.execPath, [join(HERE, "..", "hooks", "session-start.mjs")], { input: JSON.stringify({ cwd: t.d }), encoding: "utf8", env: { ...process.env, CLAUDE_PROJECT_DIR: t.d, CLAUDE_PLUGIN_ROOT: "", STARTER_KIT_FLIGHT_DIR: join(t.d, "nolog") } }).stdout).hookSpecificOutput.additionalContext;
    assert.doesNotMatch(note(), /No scale profile/, "no roadmap yet: the plan will ask");
    writeFileSync(join(t.d, "ROADMAP.md"), "## Milestone 1 — start\nAccepted: pending\n- [ ] Feature one [S] — goal\n");
    assert.match(note(), /No scale profile: ask the owner one question/);
    saveProfile(t.d, { kind: "desktop", usersTotal: 5000, usersPeak: 1 });
    assert.doesNotMatch(note(), /No scale profile/);
  } finally {
    t.done();
  }
});
