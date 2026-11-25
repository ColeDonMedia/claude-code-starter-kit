// Is RUNBOOK.md a real operations manual, or a placeholder?
//   node runbook-check.mjs --project <folder>      prints problems; exit 1 if there are any
//
// Before a hosted app goes live somebody must know how to deploy it, undo a bad deploy, restore it from backup, see when it
// breaks, and what it costs. RUNBOOK.md holds that. This checks the required sections exist and are filled in (not
// "TODO" or a template placeholder), that the two things people skip are dated (the last restore test and the last rollback
// practice), and that no secret value was written into it.
import { existsSync, readFileSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import { scanText } from "./secret-scan.mjs";

export const SECTIONS = ["Overview", "Environments and settings", "How to deploy", "How to roll back", "Backups and restore", "Monitoring and alerts", "Common problems", "Costs and limits", "Accounts"];

export function checkRunbook(root) {
  const file = join(root, "RUNBOOK.md");
  if (!existsSync(file)) return { exists: false, problems: ["RUNBOOK.md does not exist"] };
  const text = readFileSync(file, "utf8");
  const problems = [];
  const bodyOf = (name) => {
    const m = new RegExp(`^##\\s+${name}\\s*$`, "im").exec(text);
    if (!m) return null;
    const rest = text.slice(m.index + m[0].length).split(/\r?\n/);
    const out = [];
    for (const l of rest) {
      if (/^##\s/.test(l) || /^#\s/.test(l)) break;
      out.push(l);
    }
    return out.join("\n").trim();
  };
  for (const s of SECTIONS) {
    const b = bodyOf(s);
    if (b === null) problems.push(`missing the "${s}" section`);
    else if (b.replace(/<!--[\s\S]*?-->/g, "").trim().length < 20 || /^\s*(TODO|TBD|<[^>]+>)\s*$/im.test(b) || /^\s*<[^>]*>\s*$/m.test(b.split("\n")[0] ?? "")) problems.push(`the "${s}" section is empty or still a placeholder`);
  }
  const backups = bodyOf("Backups and restore") ?? "";
  if (!/Restore last tested:\s*\d{4}-\d{2}-\d{2}/i.test(backups)) problems.push('"Backups and restore" must say "Restore last tested: YYYY-MM-DD": a backup nobody has restored is only a hope');
  const rollback = bodyOf("How to roll back") ?? "";
  if (!/Rollback last practiced:\s*\d{4}-\d{2}-\d{2}/i.test(rollback)) problems.push('"How to roll back" must say "Rollback last practiced: YYYY-MM-DD"');
  const leaks = scanText("RUNBOOK.md", text);
  for (const f of leaks) problems.push(`line ${f.line} looks like a real secret (${f.rule}); the runbook may name settings but must never contain their values`);
  return { exists: true, problems };
}

if (process.argv[1] && basename(process.argv[1]) === "runbook-check.mjs") {
  const i = process.argv.indexOf("--project");
  const root = resolve(i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : process.cwd());
  const r = checkRunbook(root);
  if (!r.problems.length) console.log("RUNBOOK.md is complete: every section is filled in and the restore test and rollback practice are dated.");
  else console.log(`RUNBOOK.md is not ready for a launch:\n- ${r.problems.join("\n- ")}`);
  process.exitCode = r.problems.length ? 1 : 0;
}
