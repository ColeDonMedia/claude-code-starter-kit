// Speed: the budget judge, the real-browser measuring template, the delivery check and the API check.
// Run: node --test plugins/starter-kit/scripts/speed.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { DEFAULTS, check, judgeResults, loadBudget } from "./speed-check.mjs";
import { checkCss, checkDelivery, checkHtml } from "./delivery-check.mjs";
import { checkApi, scanSource } from "./api-check.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const dir = (files = {}) => {
  const d = mkdtempSync(join(tmpdir(), "speed-"));
  for (const [p, s] of Object.entries(files)) {
    mkdirSync(dirname(join(d, p)), { recursive: true });
    writeFileSync(join(d, p), s);
  }
  return { d, done: () => rmSync(d, { recursive: true, force: true }) };
};

// ---------------- budget judge ----------------
const GOOD = { page: "/", profile: "phone", ttfbMs: 200, fcpMs: 1200, lcpMs: 1900, cls: 0.02, tbtMs: 120, transferKb: 300, requests: 22 };
test("speed budget: a fast page passes, each slow measure is named in plain words with a fix", () => {
  const b = loadBudget("/nonexistent");
  assert.deepEqual(judgeResults({ pages: [GOOD] }, b).problems, []);
  const slow = judgeResults({ pages: [{ ...GOOD, lcpMs: 4200, cls: 0.31, tbtMs: 900, transferKb: 2400, requests: 140, ttfbMs: 2000, fcpMs: 3000 }] }, b).problems;
  assert.equal(slow.length, 7);
  assert.match(slow.find((x) => /main content/.test(x)), /4200 ms, budget 2500 ms/);
  assert.match(slow.find((x) => /jumps around/.test(x)), /0\.31, budget 0\.1/);
  assert.match(slow.find((x) => /busy and ignores taps/.test(x)), /Ship less JavaScript/);
  assert.match(slow.find((x) => /downloads too much/.test(x)), /2400 KB, budget 600 KB/);
});

test("speed budget: a project can set its own limits per page, and loosening one page does not loosen the rest", () => {
  const p = dir({ ".claude/speed.json": JSON.stringify({ defaults: { lcpMs: 2000 }, pages: { "/": {}, "/report": { lcpMs: 5000 } } }) });
  try {
    const b = loadBudget(p.d);
    assert.equal(b.defaults.lcpMs, 2000);
    assert.equal(b.defaults.cls, DEFAULTS.cls);
    const r = judgeResults({ pages: [{ ...GOOD, page: "/", lcpMs: 2400 }, { ...GOOD, page: "/report", lcpMs: 4000 }] }, b);
    assert.equal(r.problems.length, 1);
    assert.match(r.problems[0], /^\/ \(phone\)/);
  } finally {
    p.done();
  }
});

test("speed budget: taps must show something fast and finish fast; unmeasured pages and actions are noted", () => {
  const b = { ...loadBudget("/x"), pages: { "/": {}, "/gone": {} }, actions: [{ name: "save", page: "/", click: "b" }, { name: "delete", page: "/", click: "b" }] };
  const r = judgeResults({ pages: [GOOD], actions: [{ name: "save", feedbackMs: 400, doneMs: 2500 }] }, b);
  assert.equal(r.problems.length, 2);
  assert.match(r.problems[0], /nothing changed on screen for 400 ms/);
  assert.match(r.problems[1], /2500 ms to appear/);
  assert.ok(r.notes.some((n) => /"delete" but it was not measured/.test(n)));
  assert.ok(r.notes.some((n) => /\/gone is in the budget/.test(n)));
  assert.match(judgeResults({ pages: [GOOD], actions: [{ name: "save", error: "locator not found" }] }, loadBudget("/x")).problems[0], /could not be measured/);
});

test("speed budget: no results says so, results from older code are flagged, the CLI exit codes mean what they say", () => {
  const p = dir({});
  try {
    spawnSync("git", ["-C", p.d, "init", "-q"]);
    assert.equal(check(p.d).state, "none");
    const run = () => spawnSync(process.execPath, [join(HERE, "speed-check.mjs"), "--project", p.d], { encoding: "utf8" });
    assert.equal(run().status, 2);
    mkdirSync(join(p.d, ".claude"));
    writeFileSync(join(p.d, ".claude", "speed-results.json"), JSON.stringify({ commit: "0000000", pages: [GOOD] }));
    const ok = run();
    assert.equal(ok.status, 0);
    assert.match(ok.stdout, /within budget/);
    writeFileSync(join(p.d, ".claude", "speed-results.json"), JSON.stringify({ pages: [{ ...GOOD, lcpMs: 9000 }] }));
    assert.equal(run().status, 1);
    assert.equal(spawnSync(process.execPath, [join(HERE, "speed-check.mjs"), "--project", p.d, "--init"], { encoding: "utf8" }).status, 0);
    assert.deepEqual(JSON.parse(readFileSync(join(p.d, ".claude", "speed.json"), "utf8")).pages, { "/": {} });
  } finally {
    p.done();
  }
});

test("the Playwright speed template measures the metrics the judge reads, writes where the judge looks, and is valid JavaScript", () => {
  const f = join(HERE, "..", "templates", "speed.spec.js");
  const src = readFileSync(f, "utf8");
  assert.equal(spawnSync(process.execPath, ["--input-type=module", "--check"], { input: readFileSync(f, "utf8"), encoding: "utf8" }).status, 0, "the template must parse");
  for (const needle of ["largest-contentful-paint", "layout-shift", "longtask", "first-contentful-paint", "emulateNetworkConditions", "setCPUThrottlingRate", ".claude/speed-results.json", ".claude/speed.json", "ttfbMs", "lcpMs", "fcpMs", "tbtMs", "transferKb", "feedbackMs", "doneMs", "requestAnimationFrame"]) assert.ok(src.includes(needle), `the template does not mention ${needle}`);
  // every field the judge reads is produced by the template
  for (const k of ["ttfbMs", "fcpMs", "lcpMs", "cls", "tbtMs", "transferKb", "requests"]) assert.match(src, new RegExp(`\\b${k}\\b`), k);
});

// ---------------- delivery ----------------
const FAST_HTML = `<!doctype html><html><head><meta name="viewport" content="width=device-width"><link rel="stylesheet" href="/a.3f9a2c1b.css"><script type="module" src="/app.3f9a2c1b.js"></script></head><body><img src="a.webp" width="100" height="50" alt="a" loading="lazy"></body></html>`;
test("delivery: render-blocking scripts, a missing viewport, unsized and never-lazy images, and font loading are caught; the fixed page is clean", () => {
  const bad = `<html><head><link rel="stylesheet" href="1.css"><script src="/app.js"></script></head><body>${'<img src="a.png" alt="x">'.repeat(5)}</body></html>`;
  const f = checkHtml("index.html", bad);
  assert.ok(f.some((x) => x.level === "FAIL" && /no viewport/.test(x.msg)));
  assert.ok(f.some((x) => x.level === "FAIL" && /blocks the page from painting \(\/app\.js\)/.test(x.msg)));
  assert.ok(f.some((x) => /5 image\(s\) have no width and height/.test(x.msg)));
  assert.ok(f.some((x) => /none is lazy-loaded/.test(x.msg)));
  assert.deepEqual(checkHtml("index.html", FAST_HTML), []);
  assert.equal(checkHtml("a.html", '<head><meta name="viewport" content="x"><script src="a.js" defer></script><script src="b.js" async></script></head>').length, 0);
  assert.ok(checkCss("a.css", "@font-face { font-family: X; src: url(x.woff2); }").length === 1);
  assert.equal(checkCss("a.css", "@font-face { font-family: X; src: url(x.woff2); font-display: swap; }").length, 0);
});
test("delivery: unfingerprinted files, giant images and missing compression and cache rules are advice, a blocking script fails the check", () => {
  const p = dir({ "index.html": FAST_HTML.replace("/a.3f9a2c1b.css", "/a.css").replace("/app.3f9a2c1b.js", "/app.js"), "a.css": "x{}", "app.js": "1", "hero.png": "x".repeat(400 * 1024) });
  try {
    const f = checkDelivery(p.d).map((x) => x.msg).join("\n");
    assert.match(f, /no fingerprint/);
    assert.match(f, /hero\.png|400 KB PNG and no WebP/);
    assert.match(f, /no sign of text compression/);
    assert.match(f, /no cache rules/);
    const ok = dir({ "index.html": FAST_HTML, "a.3f9a2c1b.css": "x{}", "app.3f9a2c1b.js": "1", "hero.webp": "x".repeat(50 * 1024), "vercel.json": '{"headers":[{"source":"/(.*)","headers":[{"key":"Cache-Control","value":"public, max-age=31536000, immutable"}]}]}', "app.3f9a2c1b.js.br": "z" });
    assert.equal(checkDelivery(ok.d, ok.d).length, 0, JSON.stringify(checkDelivery(ok.d, ok.d)));
    ok.done();
    const cli = spawnSync(process.execPath, [join(HERE, "delivery-check.mjs"), "--dir", p.d], { encoding: "utf8" });
    assert.equal(cli.status, 0, "advice alone does not fail");
    writeFileSync(join(p.d, "index.html"), '<html><head><script src="/x.js"></script></head></html>');
    assert.equal(spawnSync(process.execPath, [join(HERE, "delivery-check.mjs"), "--dir", p.d], { encoding: "utf8" }).status, 1);
  } finally {
    p.done();
  }
});

// ---------------- api ----------------
const kinds = (file, src) => scanSource(file, src).map((x) => `${x.level}:${x.kind}`);
test("api: a query or request inside a loop is found in JavaScript in every loop shape; batching it passes", () => {
  const n1 = [
    "async function f(users) {\n  for (const u of users) {\n    u.orders = await db.order.findMany({ where: { userId: u.id } });\n  }\n}",
    "async function f(users) {\n  await Promise.all(users.map(async (u) => {\n    u.plan = await prisma.plan.findUnique({ where: { id: u.planId } });\n  }));\n}",
    "async function f(ids) {\n  const out = [];\n  ids.forEach(async (id) => { out.push(await Order.findById(id)); });\n}",
    "async function f(ids) {\n  for (let i = 0; i < ids.length; i++) {\n    const r = await fetch(`/api/items/${ids[i]}`);\n  }\n}",
    "async function f(items) {\n  while (items.length) {\n    const x = items.pop();\n    await knex('t').where({ id: x }).first();\n  }\n}",
  ];
  for (const src of n1) assert.ok(kinds("src/a.js", src).includes("HIGH:n+1"), src);
  const safe = [
    "async function f(users) {\n  const orders = await db.order.findMany({ where: { userId: { in: users.map((u) => u.id) } } });\n  for (const u of users) u.orders = orders.filter((o) => o.userId === u.id);\n}",
    "async function f(users) {\n  const rows = await db.query('select 1');\n  const names = users.map((u) => u.name);\n  return rows.map((r) => r.id);\n}",
    "async function f() {\n  for (const x of [1, 2, 3]) {\n    console.log(x);\n  }\n  const r = await db.user.findMany({ take: 20 });\n}",
  ];
  for (const src of safe) assert.deepEqual(kinds("src/a.js", src).filter((k) => k.startsWith("HIGH")), [], src);
});
test("api: loops in Python and Ruby", () => {
  assert.ok(kinds("app/views.py", "def v(req):\n    for u in users:\n        u.orders = Order.objects.filter(user=u)\n").includes("HIGH:n+1"));
  assert.ok(kinds("app/views.py", "def v():\n    return [Order.objects.get(id=i) for i in ids]\n").includes("HIGH:n+1"));
  assert.deepEqual(kinds("app/views.py", "def v():\n    orders = Order.objects.filter(user__in=users)\n    for u in users:\n        u.n = len(orders)\n").filter((k) => k.startsWith("HIGH")), []);
  assert.ok(kinds("app/c.rb", "users.each do |u|\n  u.orders = Order.where(user_id: u.id)\nend\n").includes("HIGH:n+1"));
  assert.deepEqual(kinds("app/c.rb", "orders = Order.where(user_id: ids)\nusers.each do |u|\n  puts u.name\nend\n"), []);
});
test("api: unbounded lists are flagged, bounded ones and a marked exception are not", () => {
  assert.ok(kinds("a.js", "const all = await prisma.user.findMany();").includes("MEDIUM:unbounded"));
  assert.ok(kinds("a.js", "const rows = await db.query('SELECT * FROM events');").includes("MEDIUM:unbounded"));
  assert.ok(kinds("a.py", "def v():\n    return User.objects.all()\n").includes("MEDIUM:unbounded"));
  assert.ok(kinds("a.rb", "@users = User.all\n").includes("MEDIUM:unbounded"));
  assert.deepEqual(kinds("a.js", "const all = await prisma.user.findMany({ take: 20, skip: 0 });"), []);
  assert.deepEqual(kinds("a.js", "const rows = await db.query('SELECT * FROM events WHERE id = $1', [id]);"), []);
  assert.deepEqual(kinds("a.py", "def v():\n    return User.objects.all()[:20]\n"), []);
  assert.deepEqual(kinds("a.js", "// kit: accepted-perf — 12 rows, ever\nconst all = await prisma.country.findMany();"), ["ACCEPTED:unbounded"]);
});
test("api: comments, strings and test files are not mistaken for code, and the CLI fails only on a HIGH finding", () => {
  assert.deepEqual(kinds("a.js", "// for (const u of users) { await db.user.find(u) }\nconst s = 'for (x of y) { db.query() }';\n/* for (;;) { await db.x.find() } */\n"), []);
  const p = dir({
    "src/list.js": "async function f(){ const a = await prisma.user.findMany(); }\n",
    "src/__tests__/a.test.js": "for (const u of us) { await db.user.findOne(u) }\n",
    "migrations/001.js": "for (const u of us) { await db.user.findOne(u) }\n",
  });
  try {
    spawnSync("git", ["-C", p.d, "init", "-q"]);
    const f = checkApi(p.d);
    assert.deepEqual(f.map((x) => x.file), ["src/list.js"]);
    assert.equal(spawnSync(process.execPath, [join(HERE, "api-check.mjs"), "--project", p.d], { encoding: "utf8" }).status, 0, "only MEDIUM: advice");
    writeFileSync(join(p.d, "src/loop.js"), "async function f(us){\n  for (const u of us) {\n    await db.order.findFirst({ where: { u } });\n  }\n}\n");
    assert.equal(spawnSync(process.execPath, [join(HERE, "api-check.mjs"), "--project", p.d], { encoding: "utf8" }).status, 1);
  } finally {
    p.done();
  }
});
test("api: a large file scans in reasonable time and a long odd line cannot hang the scanner", () => {
  const big = "async function f(us){\n  for (const u of us) {\n    const x = 1;\n  }\n}\n".repeat(20000);
  const t = Date.now();
  scanSource("big.js", big);
  scanSource("odd.js", "const a = " + "(".repeat(50000) + ";\n" + "for (".repeat(5000) + "\n");
  assert.ok(Date.now() - t < 8000, `took ${Date.now() - t} ms`);
});
