// Tests for license-check.mjs and legal-check.mjs. Run: node --test plugins/starter-kit/scripts/legal.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, realpathSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { classify, checkLicenses } from "./license-check.mjs";
import { checkLegal } from "./legal-check.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const tmp = () => realpathSync(mkdtempSync(join(tmpdir(), "legal-")));
const put = (root, rel, content) => {
  const p = join(root, rel);
  mkdirSync(dirname(p), { recursive: true });
  writeFileSync(p, content);
};
const pkg = (root, name, license, deps = {}, version = "1.0.0") => put(root, `node_modules/${name}/package.json`, JSON.stringify({ name, version, license, dependencies: deps }));

test("licenses are sorted into permissive, weak copyleft, restrictive and unknown", () => {
  for (const l of ["MIT", "ISC", "Apache-2.0", "BSD-3-Clause", "0BSD", "Unlicense", "CC0-1.0"]) assert.equal(classify(l), "permissive", l);
  for (const l of ["LGPL-3.0", "MPL-2.0", "EPL-2.0"]) assert.equal(classify(l), "weak", l);
  for (const l of ["GPL-3.0", "AGPL-3.0-only", "GPL-2.0-or-later", "SSPL-1.0", "BUSL-1.1", "CC-BY-NC-4.0", "Elastic-2.0"]) assert.equal(classify(l), "restrictive", l);
  for (const l of ["", undefined, "UNLICENSED", "SEE LICENSE IN LICENSE.txt", "Some Custom Thing 1.0"]) assert.equal(classify(l), "unknown", String(l));
});

test("OR lets you pick the best option; AND applies the worst", () => {
  assert.equal(classify("(MIT OR GPL-3.0)"), "permissive");
  assert.equal(classify("(GPL-3.0 OR AGPL-3.0)"), "restrictive");
  assert.equal(classify("MIT AND GPL-3.0"), "restrictive");
  assert.equal(classify("MIT AND ISC"), "permissive");
  assert.equal(classify("LGPL-3.0"), "weak", "LGPL is not mistaken for GPL");
});

test("only libraries the app ships are checked by default, and nested ones are followed", () => {
  const d = tmp();
  try {
    put(d, "package.json", JSON.stringify({ name: "app", dependencies: { shipped: "1", "@scope/ui": "1" }, devDependencies: { "dev-tool": "1" } }));
    pkg(d, "shipped", "MIT", { deep: "1" });
    pkg(d, "deep", "GPL-3.0");
    pkg(d, "@scope/ui", "(MIT OR Apache-2.0)");
    pkg(d, "dev-tool", "AGPL-3.0");
    pkg(d, "unrelated-extra", "SSPL-1.0");
    const r = checkLicenses(d);
    assert.deepEqual(r.rows.map((x) => x.name).sort(), ["@scope/ui", "deep", "shipped"]);
    assert.deepEqual(r.flagged.map((x) => x.name), ["deep"], "a GPL library pulled in by a shipped one is flagged");
    assert.equal(checkLicenses(d, { includeDev: true }).flagged.length, 2, "--all adds the development tool");
    assert.deepEqual(checkLicenses(d, { allow: ["deep"] }).flagged, [], "a person can accept a named exception");
  } finally {
    rmSync(d, { recursive: true, force: true });
  }
});

test("a library with no license stated is flagged as unknown; the command line exits 1 and prints a notices list on request", () => {
  const d = tmp();
  try {
    put(d, "package.json", JSON.stringify({ dependencies: { mystery: "1", fine: "1" } }));
    pkg(d, "mystery", undefined);
    pkg(d, "fine", "MIT", {}, "2.3.4");
    const run = (...a) => spawnSync("node", [join(HERE, "license-check.mjs"), "--project", d, ...a], { encoding: "utf8" });
    const r = run();
    assert.equal(r.status, 1);
    assert.match(r.stdout, /UNKNOWN: mystery@1\.0\.0 — no license stated/);
    const n = run("--notices");
    assert.equal(n.status, 0);
    assert.match(n.stdout, /\| fine \| 2\.3\.4 \| MIT \|/);
  } finally {
    rmSync(d, { recursive: true, force: true });
  }
});

test("python libraries are read from a virtual environment's metadata", () => {
  const d = tmp();
  try {
    put(d, ".venv/Lib/site-packages/goodlib-1.0.dist-info/METADATA", "Metadata-Version: 2.1\nName: goodlib\nVersion: 1.0\nLicense-Expression: MIT\n\nbody");
    put(d, ".venv/Lib/site-packages/badlib-2.0.dist-info/METADATA", "Metadata-Version: 2.1\nName: badlib\nVersion: 2.0\nClassifier: License :: OSI Approved :: GNU General Public License v3 (GPLv3)\n\nbody");
    const r = checkLicenses(d);
    assert.equal(r.found, true);
    assert.deepEqual(r.flagged.map((x) => x.name), ["badlib"]);
  } finally {
    rmSync(d, { recursive: true, force: true });
  }
});

test("nothing installed means it says so instead of passing", () => {
  const d = tmp();
  try {
    const r = spawnSync("node", [join(HERE, "license-check.mjs"), "--project", d], { encoding: "utf8" });
    assert.equal(r.status, 2);
    assert.match(r.stdout, /No installed libraries found/);
  } finally {
    rmSync(d, { recursive: true, force: true });
  }
});

// ---------- legal-check ----------
const DRAFT = "> DRAFT — written by an AI assistant from how the app actually works. Not legal advice. Have a lawyer review it.\n\n# Privacy policy\nWe collect your email address to create your account and keep it until you delete the account.\n";
const INVENTORY = "# P\n## Data inventory\n- Email address — to sign in — stored in the database — the owner only — deleted when the account is deleted\n## Next\n";

test("legal: complete drafts pass, with a note that no lawyer has reviewed them", () => {
  const d = tmp();
  try {
    put(d, "PROJECT.md", INVENTORY);
    put(d, "legal/PRIVACY_POLICY.md", DRAFT);
    put(d, "legal/TERMS.md", DRAFT.replace("Privacy policy", "Terms"));
    const r = checkLegal(d);
    assert.deepEqual(r.problems, []);
    assert.match(r.notes.join(" "), /no lawyer has reviewed/);
  } finally {
    rmSync(d, { recursive: true, force: true });
  }
});

test("legal: missing documents, a blank data inventory and unfilled placeholders are all problems", () => {
  const d = tmp();
  try {
    put(d, "PROJECT.md", "# P\n## Data inventory\nTODO\n");
    put(d, "legal/PRIVACY_POLICY.md", DRAFT + "Contact us at [Contact email]. Operated by [Company legal name].\n");
    const p = checkLegal(d).problems.join("\n");
    assert.match(p, /no filled-in "Data inventory"/);
    assert.match(p, /legal\/TERMS\.md \(the terms of service\) does not exist/);
    assert.match(p, /PRIVACY_POLICY\.md still has unfilled placeholders: \[Contact email\], \[Company legal name\]/);
  } finally {
    rmSync(d, { recursive: true, force: true });
  }
});

test("legal: a document must be marked as a draft or as reviewed by a person", () => {
  const d = tmp();
  try {
    put(d, "PROJECT.md", INVENTORY);
    put(d, "legal/PRIVACY_POLICY.md", "# Privacy policy\nWe collect your email.\n");
    put(d, "legal/TERMS.md", "Reviewed by: Jane Doe, attorney, 2026-12-01\n# Terms\nBe kind.\n");
    const r = checkLegal(d);
    assert.match(r.problems.join("\n"), /PRIVACY_POLICY\.md must start with the DRAFT banner or say "Reviewed by/);
    assert.ok(!r.problems.some((x) => x.includes("TERMS.md")), "a reviewed document passes");
    put(d, "PROJECT.md", "# P\n## Data inventory\nNo personal data is collected.\n");
    assert.ok(!checkLegal(d).problems.some((x) => /Data inventory/.test(x)), "'no personal data' is a valid inventory");
  } finally {
    rmSync(d, { recursive: true, force: true });
  }
});
