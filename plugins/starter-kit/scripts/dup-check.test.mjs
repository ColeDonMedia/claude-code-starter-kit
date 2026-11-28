// One source: copied code is found even when names change, only copies the change added are reported with --base, test files
// are ignored, and the PROJECT.md "One source" list must point at code that exists.
// Run: node --test plugins/starter-kit/scripts/dup-check.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { checkRegistry, findCopies, normalize, readRegistry, run } from "./dup-check.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const CLI = join(HERE, "dup-check.mjs");
const PLUGIN = join(HERE, "..");

// The owner's real case: the same monthly income worked out separately on different pages.
const income = (list, field) => `export function total(${list}) {
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  const paid = ${list}.filter((item) => item.status === "paid" && item.paidAt >= start);
  const refunds = paid.filter((item) => item.refunded).map((item) => item.${field});
  const gross = paid.reduce((sum, item) => sum + item.${field}, 0);
  const net = gross - refunds.reduce((sum, value) => sum + value, 0);
  return Math.round(net * 100) / 100;
}
`;

function repo(files) {
  const dir = mkdtempSync(join(tmpdir(), "kit-dup-"));
  const write = (fs) => {
    for (const [f, t] of Object.entries(fs)) {
      mkdirSync(dirname(join(dir, f)), { recursive: true });
      writeFileSync(join(dir, f), t);
    }
  };
  write(files);
  const git = (...a) => execFileSync("git", ["-C", dir, ...a], { stdio: "pipe" });
  git("init", "-q");
  git("add", "-A");
  git("-c", "user.email=t@t", "-c", "user.name=t", "commit", "-qm", "base");
  return { dir, write, git };
}

test("normalize keeps the shape of a line and drops names, literals and spacing", () => {
  assert.equal(normalize('const total = orders.filter((o) => o.status === "paid");'), normalize("const sum=invoices.filter((i)=>i.state==='open');"));
  assert.notEqual(normalize("const a = b + c;"), normalize("const a = b - c;"));
});

test("a renamed copy of the same calculation on two pages is found", () => {
  const copies = findCopies([
    ["src/dashboard.js", income("orders", "amount")],
    ["src/reports.js", `// reports page\n${income("invoices", "total")}`],
    ["src/other.js", "export const greet = (name) => `hello ${name}`;\n"],
  ]);
  assert.equal(copies.length, 1);
  assert.deepEqual(copies[0].places.map((p) => p.file).sort(), ["src/dashboard.js", "src/reports.js"]);
});

test("short or repetitive code is not reported", () => {
  const fields = "a: row.a,\nb: row.b,\nc: row.c,\nd: row.d,\ne: row.e,\nf: row.f,\ng: row.g,\n";
  assert.equal(findCopies([["x.js", fields], ["y.js", fields]]).length, 0, "lists of fields");
  assert.equal(findCopies([["x.js", "}\n}\n);\n"], ["y.js", "}\n}\n);\n"]]).length, 0);
});

test("with --base only copies the change added are reported; tests are ignored", () => {
  const { dir, write } = repo({
    "src/a.js": income("orders", "amount"),
    "src/b.js": income("orders", "amount"),
    "test/a.test.js": income("orders", "amount"),
  });
  try {
    assert.equal(run(dir, { base: "HEAD" }).copies.length, 0, "an old copy is not this change's fault");
    assert.equal(run(dir).copies.length, 1, "without --base the whole project is checked");
    assert.ok(!run(dir).copies[0].places.some((p) => p.file.startsWith("test/")));
    write({ "src/c.js": income("payments", "value") });
    const r = run(dir, { base: "HEAD" });
    assert.equal(r.copies.length, 1);
    assert.deepEqual(r.copies[0].added.map((p) => p.file), ["src/c.js"]);
    const cli = spawnSync(process.execPath, [CLI, "--project", dir, "--base", "HEAD"], { encoding: "utf8" });
    assert.equal(cli.status, 1);
    assert.match(cli.stdout, /DUPLICATE: .*src\/c\.js/);
    assert.match(cli.stdout, /move it into one function/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("the One source list in PROJECT.md is read and must point at code that exists", () => {
  const { dir } = repo({
    "src/lib/metrics.js": "export function monthlyIncome(rows) { return 1; }\n",
    "PROJECT.md": "# P\n## One source\n- Monthly income: `src/lib/metrics.js::monthlyIncome` — paid invoices this calendar month, refunds subtracted\n- Active customer: src/lib/customers.js::isActive — paid in the last 90 days\n- Tax: src/lib/metrics.js::taxRate — 20%\n## Risks\n- Not an entry: x.js::y\n",
  });
  try {
    const reg = readRegistry(dir);
    assert.deepEqual(reg.map((e) => e.what), ["Monthly income", "Active customer", "Tax"]);
    const p = checkRegistry(dir).problems.filter((x) => x.startsWith("STALE"));
    assert.equal(p.length, 2);
    assert.match(p.join("\n"), /Active customer.*does not exist/);
    assert.match(p.join("\n"), /Tax.*not in that file/);
    const list = spawnSync(process.execPath, [CLI, "--project", dir, "--list"], { encoding: "utf8" }).stdout;
    assert.match(list, /Monthly income: src\/lib\/metrics\.js::monthlyIncome/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("the plan, builder and reviewer use one source for each number and rule", () => {
  const read = (f) => readFileSync(join(PLUGIN, f), "utf8");
  const impl = read("agents/implementer.md");
  assert.match(impl, /Does it already exist\?/);
  assert.match(impl, /Does it do what this feature needs\?/);
  assert.match(impl, /dup-check\.mjs" --project \. --list/);
  assert.match(read("agents/reviewer.md"), /dup-check\.mjs" --project \. --base <MAIN>/);
  const spec = read("commands/spec.md");
  assert.match(spec, /\*\*Numbers and rules\*\*/);
  assert.match(spec, /## One source/);
  assert.match(read("commands/init.md"), /One source:/);
});

test("the owner's case: one number on several pages must come from the one function, with a test", () => {
  const { dir } = repo({
    "src/lib/metrics.js": "export function monthlyIncome(rows) { return rows.reduce((s, r) => s + r.amount, 0); }\n",
    "src/pages/dashboard.js": "import { monthlyIncome } from '../lib/metrics.js';\nexport const view = (rows) => `Monthly income: ${monthlyIncome(rows)}`;\n",
    "src/pages/reports.js": "export const view = (rows) => `Monthly income: ${rows.filter((r) => r.paid).reduce((s, r) => s + r.amount, 0)}`;\n",
    "src/pages/settings.js": "export const view = () => 'Settings';\n",
    "PROJECT.md": "# P\n## One source\n- Monthly income: src/lib/metrics.js::monthlyIncome — paid invoices this month. Shown on: src/pages/dashboard.js, src/pages/reports.js\n",
  });
  try {
    let r = checkRegistry(dir);
    assert.match(r.problems.join("\n"), /NO TEST: "Monthly income"/);
    assert.match(r.problems.join("\n"), /NOT USED: src\/pages\/reports\.js shows "Monthly income"/);
    assert.ok(!r.problems.some((p) => p.includes("dashboard.js")), "the page that calls the function is fine");
    assert.match(r.checks.join("\n"), /CHECK: src\/pages\/reports\.js mentions "Monthly income"/);
    assert.ok(!r.checks.some((c) => c.includes("settings.js")));
    // fixed: the reports page calls the function and a test covers it
    writeFileSync(join(dir, "src/pages/reports.js"), "import { monthlyIncome } from '../lib/metrics.js';\nexport const view = (rows) => `Monthly income: ${monthlyIncome(rows)}`;\n");
    mkdirSync(join(dir, "test"), { recursive: true });
    writeFileSync(join(dir, "test/metrics.test.js"), "import { monthlyIncome } from '../src/lib/metrics.js';\n");
    r = checkRegistry(dir);
    assert.deepEqual(r.problems, []);
    assert.deepEqual(r.checks, []);
    const cli = spawnSync(process.execPath, [CLI, "--project", dir], { encoding: "utf8" });
    assert.equal(cli.status, 0, cli.stdout);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
