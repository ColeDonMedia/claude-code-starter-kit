// Checkpoints for long builds: after every few merged features, stop and re-verify the whole thing (full test suite, every
// roadmap proof, the drift check, and the original plan against what was really built) before building more. Small
// misreadings compound over many sessions; a checkpoint catches them while they are still cheap.
// Run: node checkpoint.mjs --project <dir>            says whether one is due (exit 1 when due)
//      node checkpoint.mjs --project <dir> --record   writes the marker after a checkpoint has been done
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const MARK = /<!-- checkpoint: (\d+) done(?:, ([0-9-]+))? -->/g;

export function ticked(text) {
  return [...text.matchAll(/^[-*] \[[xX]\] /gm)].length;
}

export function checkpointStatus(root, every = 3) {
  const p = join(root, "ROADMAP.md");
  if (!existsSync(p)) return { due: false, done: 0, since: 0 };
  const text = readFileSync(p, "utf8");
  const done = ticked(text);
  const marks = [...text.matchAll(MARK)];
  const last = marks.length ? Number(marks[marks.length - 1][1]) : 0;
  return { due: done - last >= every, done, since: done - last, lastDate: marks.length ? marks[marks.length - 1][2] : null };
}

export function recordCheckpoint(root, today = new Date().toISOString().slice(0, 10)) {
  const p = join(root, "ROADMAP.md");
  const text = readFileSync(p, "utf8");
  writeFileSync(p, text.replace(/\n*$/, "\n") + `\n<!-- checkpoint: ${ticked(text)} done, ${today} -->\n`);
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  const a = process.argv.slice(2);
  const root = resolve(a.includes("--project") ? a[a.indexOf("--project") + 1] : ".");
  if (a.includes("--record")) {
    recordCheckpoint(root);
    console.log("Checkpoint recorded in ROADMAP.md.");
  } else {
    const s = checkpointStatus(root);
    console.log(s.due ? `A checkpoint is due: ${s.since} feature(s) merged since the last one.` : `No checkpoint due (${s.since} since the last).`);
    process.exit(s.due ? 1 : 0);
  }
}
