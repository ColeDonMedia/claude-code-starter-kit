// Approve a project's own commands to run automatically on this computer.
//   node trust.mjs --project <folder>       approve what the folder's .claude/kit.json lists (and the test runner)
//   node trust.mjs --project <folder> --list  show what is approved
//
// Claude runs this only AFTER the user says yes, and Claude Code shows the user a permission prompt with the exact
// commands first (the safety guard sees to that), so approval is the user's, not the model's.
import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { entriesOf, listTrusted, trustEntries } from "./trust-lib.mjs";

const args = process.argv.slice(2);
const i = args.indexOf("--project");
const project = resolve(i >= 0 && args[i + 1] ? args[i + 1] : process.cwd());

if (args.includes("--list")) {
  const list = listTrusted(project);
  console.log(list.length ? `Approved for ${project}:\n- ${list.join("\n- ")}` : `Nothing approved for ${project}.`);
  process.exit(0);
}

let cfg = {};
const p = join(project, ".claude", "kit.json");
try {
  if (existsSync(p)) cfg = JSON.parse(readFileSync(p, "utf8"));
} catch {
  console.error("kit.json is not valid JSON; nothing approved.");
  process.exit(1);
}
const entries = entriesOf(cfg);
trustEntries(project, entries);
console.log(`Approved for ${project}:\n- ${entries.join("\n- ")}`);
