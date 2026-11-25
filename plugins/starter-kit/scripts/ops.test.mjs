// Tests for runbook-check.mjs and maintenance-due.mjs. Run: node --test plugins/starter-kit/scripts/ops.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync, rmSync, realpathSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { checkRunbook, SECTIONS } from "./runbook-check.mjs";
import { maintenanceStatus } from "./maintenance-due.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const dir = () => realpathSync(mkdtempSync(join(tmpdir(), "ops-")));
const FILLED = {
  Overview: "Recipe Share runs on Vercel at https://recipes.example.org, with a Postgres database on Neon.",
  "Environments and settings": "Three environments: development, preview and production. Setting names: DATABASE_URL, SESSION_SECRET. Values live in the host's settings.",
  "How to deploy": "Merging to main deploys to preview automatically. To go live, click Promote in the Vercel dashboard.\n",
  "How to roll back": "In Vercel open Deployments, pick the previous one, choose Promote to production.\nRollback last practiced: 2026-11-20",
  "Backups and restore": "Neon keeps daily backups for 7 days. To restore: create a branch from a point in time and point the app at it.\nRestore last tested: 2026-11-19",
  "Monitoring and alerts": "Errors go to Sentry; an uptime check pings the home page every minute and emails the owner on failure.",
  "Common problems": "Site shows an error page: check Sentry first; if a deploy just happened, roll back.",
  "Costs and limits": "About 25 dollars a month at current traffic; alerts at 50 dollars. Free tier limit: 100k requests a day.",
  Accounts: "Vercel, Neon and Sentry accounts, all owned by the owner. No passwords are stored here.",
};
const runbook = (over = {}) => "# Runbook\nLaunched: 2026-11-20\n" + SECTIONS.map((s) => `## ${s}\n${(s in over ? over[s] : FILLED[s]) ?? ""}\n`).join("\n");

test("a complete runbook passes", () => {
  const d = dir();
  try {
    writeFileSync(join(d, "RUNBOOK.md"), runbook());
    assert.deepEqual(checkRunbook(d).problems, []);
  } finally {
    rmSync(d, { recursive: true, force: true });
  }
});

test("a missing runbook, missing sections, empty or placeholder sections are all problems", () => {
  const d = dir();
  try {
    assert.deepEqual(checkRunbook(d), { exists: false, problems: ["RUNBOOK.md does not exist"] });
    writeFileSync(join(d, "RUNBOOK.md"), runbook({ "Common problems": "TODO", "Costs and limits": "<estimate>" }).replace(/## Accounts[\s\S]*$/, ""));
    const p = checkRunbook(d).problems.join("\n");
    assert.match(p, /missing the "Accounts" section/);
    assert.match(p, /"Common problems" section is empty or still a placeholder/);
    assert.match(p, /"Costs and limits" section is empty or still a placeholder/);
  } finally {
    rmSync(d, { recursive: true, force: true });
  }
});

test("the restore test and the rollback practice must be dated: untested backups are only hopes", () => {
  const d = dir();
  try {
    writeFileSync(join(d, "RUNBOOK.md"), runbook({ "Backups and restore": FILLED["Backups and restore"].replace(/Restore last tested:.*/, "Restores should work."), "How to roll back": "Promote the previous deployment in the dashboard when something breaks." }));
    const p = checkRunbook(d).problems.join("\n");
    assert.match(p, /Restore last tested: YYYY-MM-DD/);
    assert.match(p, /Rollback last practiced: YYYY-MM-DD/);
  } finally {
    rmSync(d, { recursive: true, force: true });
  }
});

test("a real secret written into the runbook is caught, without printing it", () => {
  const d = dir();
  try {
    const key = "AKIA" + "IOSFODNN7ZQ4XB2K";
    writeFileSync(join(d, "RUNBOOK.md"), runbook({ Accounts: `Cloud login uses key ${key} for deploys, owned by the owner.` }));
    const out = spawnSync("node", [join(HERE, "runbook-check.mjs"), "--project", d], { encoding: "utf8" });
    assert.equal(out.status, 1);
    assert.match(out.stdout, /looks like a real secret/);
    assert.ok(!out.stdout.includes(key));
  } finally {
    rmSync(d, { recursive: true, force: true });
  }
});

test("maintenance: not launched is never due; launched counts from the launch, then from the last entry", () => {
  const d = dir();
  const now = Date.parse("2026-12-30T12:00:00Z");
  try {
    assert.deepEqual(maintenanceStatus(d, 30, now), { launched: false, overdue: false, days: null, since: null });
    writeFileSync(join(d, "RUNBOOK.md"), "# Runbook\nLaunched: 2026-11-20\n");
    let s = maintenanceStatus(d, 30, now);
    assert.equal(s.overdue, true);
    assert.equal(s.since, "the launch");
    assert.equal(s.days, 40);
    writeFileSync(join(d, "MAINTENANCE.md"), "# Maintenance\n## 2026-12-10\nUpdated packages.\n## 2026-12-20\nChecked backups.\n");
    s = maintenanceStatus(d, 30, now);
    assert.equal(s.overdue, false);
    assert.equal(s.days, 10);
    assert.equal(s.last, "2026-12-20");
    assert.equal(maintenanceStatus(d, 7, now).overdue, true, "the threshold is adjustable");
  } finally {
    rmSync(d, { recursive: true, force: true });
  }
});

test("maintenance: a launched project with no dates at all is due; the command line says so", () => {
  const d = dir();
  try {
    writeFileSync(join(d, "RUNBOOK.md"), "# Runbook\nno dates here\n");
    const out = spawnSync("node", [join(HERE, "maintenance-due.mjs"), "--project", d], { encoding: "utf8" });
    assert.equal(out.status, 1);
    assert.match(out.stdout, /maintenance is due/);
  } finally {
    rmSync(d, { recursive: true, force: true });
  }
});
