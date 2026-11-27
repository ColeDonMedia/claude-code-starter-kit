// The UI checklist and judge: the checklist is complete and points at real rules, the judge sorts BLOCKS from later the way
// the checklist says, uses the plan's numbers and accepted exceptions, and reads only fields the checkpoint writes.
// Run: node --test plugins/starter-kit/scripts/ui.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { ALL, LAUNCH, PARTS, PARTS_FOR_KIND, SWEEP } from "./ui-checklist.mjs";
import { judgeUi, matchPath } from "./ui-check.mjs";
import { loadLibrary } from "./style-library.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const CLI = join(HERE, "ui-check.mjs");
const TEMPLATE = readFileSync(join(HERE, "..", "templates", "ui-checkpoint.js"), "utf8");
const JUDGE = readFileSync(CLI, "utf8");
const emitted = new Set([...JUDGE.matchAll(/add\("([a-z-]+)"/g)].map((m) => m[1]));

test("the checklist: unique ids, every item BLOCKS or later, parts and kinds consistent, related rules exist", () => {
  assert.equal(new Set(ALL.map((i) => i.id)).size, ALL.length, "no duplicate ids");
  assert.ok(ALL.length >= 90, `${ALL.length} items`);
  for (const it of ALL) {
    assert.match(it.sev, /^[BL]$/, it.id);
    assert.ok(it.q.endsWith("?") || it.q.endsWith("."), it.id);
  }
  for (const [k, p] of Object.entries(PARTS)) {
    assert.ok(p.items.length >= 3, k);
    assert.ok(p.items.every((i) => i.id.startsWith(`${k}.`)), k);
  }
  for (const parts of Object.values(PARTS_FOR_KIND)) for (const p of parts) assert.ok(PARTS[p], p);
  const ux = new Set(loadLibrary().ux.map((u) => Number(u.No)));
  for (const it of ALL) for (const n of it.ux ?? []) assert.ok(ux.has(n), `${it.id} cites ux ${n}, which does not exist`);
  assert.ok(SWEEP.length >= 6 && LAUNCH.length >= 6);
  // The owner's own examples are explicit items.
  for (const id of ["screen.back", "dialog.close", "list.find", "list.sort", "screen.dupes", "buttons.wrap"]) assert.ok(ALL.some((i) => i.id === id), id);
});

test("every measured check named in the checklist is one the judge really reports, and the judge reports nothing unlisted", () => {
  const listed = new Set(ALL.flatMap((i) => i.measured ?? []));
  for (const m of listed) assert.ok(emitted.has(m), `checklist names "${m}" but ui-check.mjs never reports it`);
  const internal = new Set(["failed-request", "axe-violation", "one-size", "old-checkpoint", "unmeasured-screen"]);
  for (const e of emitted) assert.ok(listed.has(e) || internal.has(e), `ui-check.mjs reports "${e}", which no checklist item names`);
});

test("the judge reads only fields the checkpoint template writes", () => {
  const body = JUDGE.slice(JUDGE.indexOf("export function judgeUi"), JUDGE.indexOf("const pathOf"));
  const fields = [...new Set([...body.matchAll(/\br\.([a-zA-Z]+)/g)].map((m) => m[1]))].filter((f) => !["data", "size", "state", "test", "path"].includes(f));
  assert.ok(fields.length >= 20, `${fields.length} fields`);
  for (const f of fields) assert.ok(new RegExp(`\\b${f}\\b`).test(TEMPLATE), `the judge reads r.${f}, which the checkpoint never writes`);
  assert.match(TEMPLATE, /^\/\/ ui-checkpoint v\d+/m, "the template carries its version");
});

const base = { size: "phone", state: "loaded", test: "t", data: "normal", path: "/invoices", url: "http://x/invoices", title: "Invoices — Acme", viewport: { width: 375 }, meta: { favicon: true, description: true, shareTitle: true, shareImage: true }, wayBack: { depth: 1, hasParentLink: false, hasBackControl: false }, lists: [], dialogs: [], log: { watched: true, errors: [], console: [], failed: [] }, fontSizes: [16, 24], colourCount: 3 };
const ok = (over = {}) => [{ ...base, ...over }, { ...base, size: "desktop", ...over }, { ...base, data: "stress", ...over }];

test("a clean set passes; no stress run blocks; one size is noted", () => {
  const r = judgeUi(ok());
  assert.deepEqual([r.blocking, r.later], [[], []]);
  const noStress = judgeUi([base, { ...base, size: "desktop" }]);
  assert.ok(noStress.blocking.some((l) => l.includes("[no-stress-run]")));
  assert.ok(judgeUi([base, { ...base, data: "stress" }]).later.some((l) => l.includes("[one-size]")));
});

test("each measured problem lands where the checklist says", () => {
  const r = judgeUi(ok({
    path: "/invoices/42",
    wayBack: { depth: 2, hasParentLink: false, hasBackControl: false },
    wrapped: [{ text: "Save and send", primary: true }, { text: "Other thing", primary: false }],
    truncated: [{ text: "Heading", essential: true }],
    unnamed: ["button"],
    covered: [{ control: "button", by: "div" }],
    offscreen: ['button "Export"'],
    junk: [{ kind: "undefined", sev: "B", text: "Due: undefined" }, { kind: "null", sev: "L", text: "null" }],
    brokenImages: ["/a.png"],
    duplicates: [{ name: "save", count: 2, sameTarget: true }],
    vague: ["OK"],
    dialogs: [{ name: "Confirm", title: false, close: false, tooTall: true, buttons: ["OK"], order: null }],
    log: { watched: true, errors: ["boom"], console: ["warn"], failed: [] },
  }));
  const has = (list, check) => list.some((l) => l.endsWith(`[${check}]`));
  for (const c of ["way-back", "wrapped-label", "truncated-text", "unnamed-control", "covered-control", "offscreen-control", "junk-text", "broken-image", "dialog-no-close", "dialog-too-tall", "page-error"]) assert.ok(has(r.blocking, c), c);
  for (const c of ["wrapped-label", "junk-text", "duplicate-name", "vague-label", "dialog-no-title", "console-error", "dialog-escape"]) assert.ok(has(r.later, c), c);
  assert.ok(r.blocking.some((l) => l.includes("the main button")), "only the main button's wrap blocks");
});

test("lists are judged by the plan's expected numbers, not the handful of test rows", () => {
  const rec = ok({ lists: [{ kind: "table", rows: 3, columns: 4, hasSort: false, leftNumbers: false }], hasSearch: false, hasPaging: false, hasSort: false });
  assert.deepEqual(judgeUi(rec).later.filter((l) => /list-no/.test(l)), [], "3 rows and no plan: nothing to ask for");
  const planned = judgeUi(rec, { screens: [{ path: "/invoices", items: 500 }], exceptions: [], limits: {} });
  assert.ok(planned.blocking.some((l) => l.includes("[list-no-search]") && l.includes("the plan expects about 500")));
  assert.ok(planned.blocking.some((l) => l.includes("[list-no-paging]")));
  assert.ok(planned.later.some((l) => l.includes("[table-no-sort]")));
  const fine = judgeUi(ok({ lists: [{ kind: "table", rows: 3, columns: 4, hasSort: true, leftNumbers: false }], hasSearch: true, hasPaging: true }), { screens: [{ path: "/invoices", items: 500 }], exceptions: [], limits: {} });
  assert.deepEqual([fine.blocking, fine.later], [[], []]);
});

test("accepted exceptions are not raised again, and say who decided", () => {
  const rec = ok({ path: "/settings", lists: [{ kind: "list", rows: 20, columns: 0 }], hasSearch: false });
  assert.ok(judgeUi(rec).later.some((l) => l.includes("[list-no-search]")));
  const r = judgeUi(rec, { screens: [], exceptions: [{ check: "list-no-search", where: "/settings", why: "twenty fixed settings", by: "claude" }], limits: {} });
  assert.deepEqual(r.later, []);
  assert.match(r.accepted[0], /twenty fixed settings \(claude\)/);
});

test("Escape: a popup that stays open blocks; a popup never tried is noted", () => {
  const dlg = [{ name: "Delete?", title: true, close: true, tooTall: false, buttons: ["Keep", "Delete"], order: "cancel-first" }];
  const tried = judgeUi([...ok({ dialogs: dlg }), { ...base, state: "loaded (escape)", url: "http://x/invoices", escape: { before: 1, after: 1 } }]);
  assert.ok(tried.blocking.some((l) => l.includes("[dialog-escape]")));
  const closed = judgeUi([...ok({ dialogs: dlg }), { ...base, escape: { before: 1, after: 0 } }]);
  assert.deepEqual([closed.blocking, closed.later], [[], []]);
});

test("the whole-app sweep compares screens; the launch check looks for the finishing touches", () => {
  const recs = [
    ...ok({ path: "/a", title: "Same", dates: ["2026-11-27"], money: ["$1,234.00"], buttonNames: ["Save"], dialogs: [{ name: "x", title: true, close: true, order: "cancel-first" }] }),
    ...ok({ path: "/b", title: "Same", dates: ["Nov 27, 2026"], money: ["$1,234"], buttonNames: ["Update"], dialogs: [{ name: "y", title: true, close: true, order: "primary-first" }], meta: { favicon: false } }),
    { ...base, escape: { before: 1, after: 0 } },
  ];
  const s = judgeUi(recs, { screens: [{ path: "/c", name: "Reports" }], exceptions: [], limits: {} }, { mode: "sweep" });
  for (const c of ["mixed-dates", "mixed-money", "label-variants", "same-title", "button-order", "unmeasured-screen"]) assert.ok(s.later.some((l) => l.endsWith(`[${c}]`)), c);
  assert.ok(!s.later.some((l) => l.includes("[no-favicon]")), "launch items only at launch");
  assert.ok(judgeUi(recs, undefined, { mode: "launch" }).later.some((l) => l.includes("[no-favicon]")));
  assert.ok(!judgeUi(recs).later.some((l) => l.includes("[mixed-dates]")), "a feature review does not run the sweep");
});

test("an old copy of the checkpoint is noted", () => {
  assert.ok(judgeUi(ok(), undefined, { projectTemplate: "// ui-checkpoint v0\n" }).later.some((l) => l.includes("[old-checkpoint]")));
  assert.deepEqual(judgeUi(ok(), undefined, { projectTemplate: TEMPLATE }).later, []);
});

test("screen paths: parameters, wildcards and trailing slashes", () => {
  assert.ok(matchPath("/invoices/:id", "/invoices/42"));
  assert.ok(!matchPath("/invoices/:id", "/invoices"));
  assert.ok(matchPath("/invoices", "/invoices/"));
  assert.ok(matchPath("/settings*", "/settings/billing"));
  assert.ok(matchPath("*", "/anything"));
  assert.ok(matchPath("/", "/"));
});

test("the command: never measured, blocking, the manual list by parts or by the plan's screen, unknown parts", () => {
  const dir = mkdtempSync(join(tmpdir(), "ui-check-"));
  try {
    const run = (...a) => spawnSync(process.execPath, [CLI, ...a], { encoding: "utf8" });
    assert.equal(run("--project", dir).status, 2);
    const m = run("--manual", "--parts", "dialog");
    assert.equal(m.status, 0);
    assert.match(m.stdout, /dialog\.close/);
    assert.match(m.stdout, /ux 141 Accessibility: Modal Dialog Focus/);
    assert.doesNotMatch(m.stdout, /list\.find/);
    assert.equal(run("--manual", "--parts", "nonsense").status, 64);
    mkdirSync(join(dir, ".claude", "ui-results", "phone"), { recursive: true });
    writeFileSync(join(dir, ".claude", "ui.json"), JSON.stringify({ screens: [{ path: "/invoices", parts: ["list", "dialog"] }] }));
    const byPath = run("--manual", "--path", "/invoices", "--project", dir);
    assert.match(byPath.stdout, /screen\.back/);
    assert.match(byPath.stdout, /list\.find/);
    assert.doesNotMatch(byPath.stdout, /form\.keep/);
    writeFileSync(join(dir, ".claude", "ui-results", "phone", "a.json"), JSON.stringify({ ...base, brokenImages: ["/x.png"] }));
    const j = run("--project", dir);
    assert.equal(j.status, 1);
    assert.match(j.stdout, /BLOCKING/);
    assert.match(j.stdout, /image did not load/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
