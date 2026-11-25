// Tests for the scout's pointer checker. Run: node --test plugins/starter-kit/scripts/pointer-check.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { checkReport, parseReport } from "./pointer-check.mjs";

const SCRIPT = join(dirname(fileURLToPath(import.meta.url)), "pointer-check.mjs");
function project() {
  const dir = mkdtempSync(join(tmpdir(), "ptr-"));
  const put = (p, s) => {
    mkdirSync(dirname(join(dir, p)), { recursive: true });
    writeFileSync(join(dir, p), s);
  };
  put("src/cart.js", ["// cart", "export function addItem(cart, item) {", "  if (!item.id) throw new Error(\"item needs an id\");", "  cart.items.push(item);", "}", ""].join("\n"));
  put("src/win.js", "line one\r\nconst total = price * (1 + tax);\r\nline three\r\n");
  put("test/cart.test.js", 'test("adding an item puts it in the cart", () => {\n  expect(1).toBe(1);\n});\n');
  put("src/regex.js", "const re = /a+(b|c)*?$/; // [weird] {chars}\n");
  return { dir, done: () => rmSync(dir, { recursive: true, force: true }) };
}

const GOOD = `POINTERS
- src/cart.js:2-4 — where items are added — "export function addItem(cart, item) {"
- src/win.js:2-2 — total with tax, Windows line endings — "const total = price * (1 + tax);"
- src/regex.js:1 — odd characters in the quote — "const re = /a+(b|c)*?$/; // [weird] {chars}"
TESTS
- test/cart.test.js:1-3 — "test(\\"adding an item puts it in the cart\\", () => {"
PATTERNS TO COPY
- src/cart.js:2-5 — the nearest example of a cart action
NOT FOUND
- a discount module: searched "discount", "coupon" in src/
CONFIDENCE: high
`;

test("a correct report passes, whatever the line endings and quote characters", () => {
  const p = project();
  try {
    const r = checkReport(p.dir, GOOD);
    assert.deepEqual(r.bad, []);
    assert.equal(r.ok.length, 5);
    assert.equal(parseReport(GOOD).filter((x) => x.section === "PATTERNS TO COPY").length, 1);
  } finally {
    p.done();
  }
});

test("wrong paths, ranges and quotes are each caught, with the reason", () => {
  const p = project();
  try {
    const bad = `POINTERS
- src/missing.js:1-2 — gone — "anything at all here"
- src/cart.js:40-50 — past the end — "export function addItem(cart, item) {"
- src/cart.js:2-3 — invented quote — "export function removeItem(cart, id) {"
- src/cart.js:2-3 — no quote at all
- ../outside.js:1-1 — escapes — "whatever it says"
- C:/Windows/win.ini:1-1 — absolute — "for 16-bit app support"
- /etc/passwd:1-1 — absolute — "root:x:0:0:root"
- src/cart.js:2 — tiny — "{"
- somewhere in the cart code
TESTS
- test/cart.test.js:1-2
`;
    const r = checkReport(p.dir, bad);
    const why = r.bad.map((b) => b.why);
    assert.equal(r.ok.length, 0);
    assert.ok(why.includes("no such file"));
    assert.ok(why.some((w) => /outside the file \(it has 5\)/.test(w)));
    assert.ok(why.some((w) => /not in lines 2-3/.test(w)));
    assert.equal(why.filter((w) => w === "no quoted line").length, 2);
    assert.equal(why.filter((w) => w === "the path is outside the project").length, 3);
    assert.ok(why.includes("the quoted text is too short to check"));
    assert.ok(why.includes("not in the form path:start-end"));
  } finally {
    p.done();
  }
});

test("a quote may sit up to three lines outside its range, but no further", () => {
  const p = project();
  try {
    assert.deepEqual(checkReport(p.dir, 'POINTERS\n- src/cart.js:5-5 — near — "if (!item.id) throw new Error"\n').bad, []);
    assert.equal(checkReport(p.dir, 'POINTERS\n- src/cart.js:1-1 — near — "cart.items.push(item);"\n').bad.length, 0, "line 4 is three lines after line 1");
    const far = "POINTERS\n- big.txt:1-1 — far — \"line number 9 here\"\n";
    writeFileSync(join(p.dir, "big.txt"), Array.from({ length: 12 }, (_, i) => `line number ${i + 1} here`).join("\n"));
    assert.equal(checkReport(p.dir, far).bad.length, 1);
  } finally {
    p.done();
  }
});

test("more than 40 pointers is itself a problem; an empty report and '- none' are fine", () => {
  const p = project();
  try {
    const many = "POINTERS\n" + Array.from({ length: 41 }, () => '- src/cart.js:2-2 — x — "export function addItem(cart, item) {"').join("\n");
    assert.ok(checkReport(p.dir, many).bad.some((b) => /more than 40/.test(b.why)));
    assert.deepEqual(checkReport(p.dir, "").bad, []);
    assert.deepEqual(checkReport(p.dir, "POINTERS\n- none\nTESTS\n- none\n").bad, []);
  } finally {
    p.done();
  }
});

test("the command line reads a report from standard input and exits 1 when a pointer is wrong", () => {
  const p = project();
  try {
    const ok = spawnSync(process.execPath, [SCRIPT, "--project", p.dir], { input: GOOD, encoding: "utf8" });
    assert.equal(ok.status, 0, ok.stdout);
    assert.match(ok.stdout, /5 good, 0 wrong/);
    const no = spawnSync(process.execPath, [SCRIPT, "--project", p.dir], { input: "POINTERS\n- nope.js:1-1 — x — \"something here\"\n", encoding: "utf8" });
    assert.equal(no.status, 1);
    assert.match(no.stdout, /nope\.js.*no such file/);
  } finally {
    p.done();
  }
});
