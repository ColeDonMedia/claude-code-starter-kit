// Every stage has a strict, clearly written scope: each command, agent and workflow opens with a "## Scope" block saying its
// job, when it starts, what it may do, what it must not do, when it is done and what it hands back. Short on purpose: it marks
// the boundaries; the steps below it carry the detail. Run: node --test plugins/starter-kit/scripts/scope.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const PLUGIN = join(dirname(fileURLToPath(import.meta.url)), "..");
const LABELS = ["Job", "Starts when", "May", "Must not", "Done when", "Hands back"];
const files = ["commands", "agents", "workflows"].flatMap((d) => readdirSync(join(PLUGIN, d)).filter((f) => f.endsWith(".md")).map((f) => `${d}/${f}`));

export function scopeBlock(text) {
  const m = text.match(/^## Scope\n((?:- \*\*[^*]+:\*\* .+\n?)+)/m);
  return m ? m[1] : null;
}

test("every command, agent and workflow has a Scope block with all six parts, in order", () => {
  assert.ok(files.length >= 33, `found ${files.length} files`);
  const problems = [];
  for (const f of files) {
    const text = readFileSync(join(PLUGIN, f), "utf8");
    const block = scopeBlock(text);
    if (!block) {
      problems.push(`${f}: no "## Scope" block`);
      continue;
    }
    const labels = [...block.matchAll(/^- \*\*([^*]+):\*\* (.+)$/gm)].map((m) => [m[1], m[2].trim()]);
    if (JSON.stringify(labels.map((l) => l[0])) !== JSON.stringify(LABELS)) problems.push(`${f}: parts are ${labels.map((l) => l[0]).join(", ")}`);
    for (const [l, v] of labels) if (v.split(/\s+/).length < 3) problems.push(`${f}: "${l}" is too vague: ${v}`);
    const words = block.split(/\s+/).filter(Boolean).length;
    if (words > 130) problems.push(`${f}: Scope block is ${words} words (keep it under 130: boundaries, not steps)`);
    const before = text.slice(0, text.indexOf("## Scope"));
    if ((before.match(/^## /gm) ?? []).length > 0) problems.push(`${f}: Scope must come before the first step`);
  }
  assert.deepEqual(problems, []);
});

test("every agent's Must not names the things it may never touch", () => {
  for (const f of files.filter((x) => x.startsWith("agents/"))) {
    const mustNot = scopeBlock(readFileSync(join(PLUGIN, f), "utf8"))?.match(/\*\*Must not:\*\* (.+)/)?.[1] ?? "";
    assert.ok(mustNot.length > 30, `${f}: Must not is too thin`);
  }
});
