// Records that the pre-ship scan (/starter-kit:full-scan) passed for the current commit, so the push gate lets that exact commit
// through. Until 2.25.0 Claude wrote the marker itself (`git rev-parse HEAD > .claude/last-full-scan`); now the guards refuse any
// other way of writing it, and this script re-checks what a script can prove before it writes:
//   - every change is committed (the scan covers HEAD, nothing else)
//   - the project's own checks (kit.json "verify") pass at this commit: the stop hook's result is reused when it is for exactly
//     this state of the code, otherwise they run here. Checks the owner has not approved are not run, and the marker is refused.
//   - no finished milestone is still waiting for the owner's acceptance (ROADMAP.md)
// What it cannot prove, it does not claim: the security review's APPROVE and the other judged steps stay the scan's job.
//   node ship-mark.mjs --project <folder>
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { isTrusted } from "./trust-lib.mjs";
import { checkRoadmap } from "./roadmap-check.mjs";

const args = process.argv.slice(2);
const pi = args.indexOf("--project");
const root = resolve(pi >= 0 && args[pi + 1] ? args[pi + 1] : process.cwd());
const git = (...a) => spawnSync("git", a, { cwd: root, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
const refuse = (why) => {
  console.log(`NOT RECORDED: ${why}`);
  process.exit(1);
};

const head = git("rev-parse", "HEAD");
if (head.status !== 0) refuse("this folder is not a git repository with a commit, so there is nothing to record.");
const sha = head.stdout.trim();
if ((git("status", "--porcelain", "--untracked-files=no").stdout ?? "").trim()) {
  refuse("there are uncommitted changes. Commit them (the scan covers the committed code only), then run the scan again.");
}

let cfg = {};
try {
  const p = join(root, ".claude", "kit.json");
  if (existsSync(p)) cfg = JSON.parse(readFileSync(p, "utf8"));
} catch {
  refuse(".claude/kit.json is not valid JSON.");
}
const commands = Array.isArray(cfg.verify) ? cfg.verify.filter((c) => typeof c === "string" && c.trim()) : [];
const unapproved = commands.filter((c) => !isTrusted(root, `verify:${c}`));
if (unapproved.length) {
  refuse(`these checks are not approved to run on this computer, so they can't be confirmed: ${unapproved.join(", ")}. Ask the owner to approve them (the trust script), then run this again.`);
}

// The same fingerprint the stop hook (verify-gate.mjs) saves: this commit plus anything uncommitted.
const fingerprint = createHash("sha256").update(head.stdout).update(git("status", "--porcelain").stdout ?? "").update(git("diff", "HEAD").stdout ?? "").digest("hex");
let last = {};
try {
  last = JSON.parse(readFileSync(join(root, ".claude", "last-verified"), "utf8"));
} catch {
  /* never verified */
}
if (commands.length && !(last.fingerprint === fingerprint && last.ok === true)) {
  for (const cmd of commands) {
    const r = spawnSync(cmd, { cwd: root, shell: true, encoding: "utf8", timeout: 900000, maxBuffer: 64 * 1024 * 1024 });
    const out = `${r.stdout ?? ""}${r.stderr ?? ""}`;
    if (r.error) refuse(`the check "${cmd}" did not finish (${r.error.code ?? r.error.message}).`);
    if (/is not recognized as an internal or external command|: command not found|^\S*sh: \d+: .+: not found$|executable file not found/im.test(out)) {
      refuse(`the check "${cmd}" could not run (its tool is not installed here).`);
    }
    if (r.status !== 0) refuse(`the check "${cmd}" fails:\n${out.trimEnd().split("\n").slice(-20).join("\n")}`);
  }
}

const road = checkRoadmap(root);
if (road.unaccepted?.length) {
  refuse(`a finished milestone is waiting for the owner's acceptance (${road.unaccepted.map((m) => `Milestone ${m.n}`).join(", ")}). Run /starter-kit:accept first.`);
}

mkdirSync(join(root, ".claude"), { recursive: true });
writeFileSync(join(root, ".claude", "last-full-scan"), `${sha}\n`);
console.log(`RECORDED: commit ${sha.slice(0, 7)} passed the pre-ship scan; the push gate will let this exact commit through.`);
