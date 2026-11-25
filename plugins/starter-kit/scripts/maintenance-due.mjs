// Is routine maintenance overdue for a project that has been launched?
//   node maintenance-due.mjs --project <folder> [--days 30]     prints the answer; exit 1 if overdue
//
// A launched app needs regular care: dependency updates, a security re-check, a backup check, a look at the errors.
// "Launched" means RUNBOOK.md exists. The last maintenance is the newest "## YYYY-MM-DD" entry in MAINTENANCE.md; if there
// is none yet, the date in RUNBOOK.md's "Launched: YYYY-MM-DD" line counts as the starting point. Projects that have
// not launched are never overdue.
import { existsSync, readFileSync } from "node:fs";
import { basename, join, resolve } from "node:path";

const DAY = 86_400_000;

export function maintenanceStatus(root, thresholdDays = 30, now = Date.now()) {
  if (!existsSync(join(root, "RUNBOOK.md"))) return { launched: false, overdue: false, days: null, since: null };
  let last = null;
  let since = null;
  const log = existsSync(join(root, "MAINTENANCE.md")) ? readFileSync(join(root, "MAINTENANCE.md"), "utf8") : "";
  const dates = [...log.matchAll(/^##\s+(\d{4}-\d{2}-\d{2})/gm)].map((m) => m[1]).sort();
  if (dates.length) {
    last = dates[dates.length - 1];
    since = "the last maintenance";
  } else {
    const l = /Launched:\s*(\d{4}-\d{2}-\d{2})/i.exec(readFileSync(join(root, "RUNBOOK.md"), "utf8"));
    if (l) {
      last = l[1];
      since = "the launch";
    }
  }
  if (!last) return { launched: true, overdue: true, days: null, since: "never recorded", last: null };
  const days = Math.floor((now - Date.parse(`${last}T00:00:00Z`)) / DAY);
  return { launched: true, overdue: days >= thresholdDays, days, since, last };
}

if (process.argv[1] && basename(process.argv[1]) === "maintenance-due.mjs") {
  const arg = (n, d) => {
    const i = process.argv.indexOf(n);
    return i >= 0 ? process.argv[i + 1] : d;
  };
  const s = maintenanceStatus(resolve(arg("--project", ".")), Number(arg("--days", 30)));
  if (!s.launched) console.log("Not launched yet (no RUNBOOK.md): no maintenance due.");
  else if (s.days === null) console.log("Launched, but no maintenance or launch date is recorded: maintenance is due.");
  else console.log(`${s.days} day(s) since ${s.since} (${s.last}): maintenance is ${s.overdue ? "OVERDUE" : "not due yet"}.`);
  process.exitCode = s.overdue ? 1 : 0;
}
