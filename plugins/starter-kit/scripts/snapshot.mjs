// The way back after a wrong "yes": lists and restores the snapshots the safety guard saves before risky commands, and the
// local database copies. Restoring puts files back as they were; it saves the current state first and deletes nothing.
// Run: node snapshot.mjs --list --project <dir>
//      node snapshot.mjs --restore <id> [--path <file or folder>] --project <dir>
//      node snapshot.mjs --save "<why>" --project <dir>
//      node snapshot.mjs --databases --project <dir>         (lists the database copies in .claude/backups/)
import { existsSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { listSnapshots, repoRoot, restoreSnapshot, saveSnapshot } from "./snapshot-lib.mjs";

if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  const a = process.argv.slice(2);
  const val = (flag) => (a.includes(flag) ? a[a.indexOf(flag) + 1] : undefined);
  const project = resolve(val("--project") ?? ".");
  try {
    if (a.includes("--list")) {
      const s = listSnapshots(project);
      if (!s.length) console.log(repoRoot(project) ? "No snapshots yet." : "Not a git project: there are no snapshots here.");
      for (const x of s) console.log(`${x.id}  (${x.time})  before: ${x.reason}`);
    } else if (val("--restore")) {
      const ref = restoreSnapshot(project, val("--restore"), val("--path") ?? ".");
      console.log(`Restored ${val("--path") ?? "every file"} from ${ref}. The state just before the restore was saved as a snapshot too.`);
    } else if (val("--save")) {
      const s = saveSnapshot(project, val("--save"));
      console.log(s ? `Saved snapshot ${s.id}.` : "Not a git project: nothing saved.");
    } else if (a.includes("--databases")) {
      const base = join(repoRoot(project) ?? project, ".claude", "backups");
      const runs = existsSync(base) ? readdirSync(base).filter((n) => n !== ".gitignore").sort().reverse() : [];
      console.log(runs.length ? runs.map((r) => `${join(base, r)}`).join("\n") : "No database copies yet.");
    } else {
      console.log("Use --list, --restore <id> [--path <p>], --save \"<why>\" or --databases, with --project <dir>.");
      process.exit(1);
    }
  } catch (e) {
    console.log(`Could not do that: ${e.message}`);
    process.exit(1);
  }
}
