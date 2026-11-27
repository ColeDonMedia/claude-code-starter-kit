// Roadmap truth check: is every ticked box backed by real work?
//   node roadmap-check.mjs --project <folder>     prints problems; exit 1 if there are any
//
// ROADMAP.md format the kit writes:
//   - [x] Sign in — people can create an account and sign in (merged a1b2c3d)
//     - [x] A visitor can sign up with email and password → test: test/auth.test.js::signs up a visitor
//     - [x] The login page looks right on a phone → manual: opened it at 375px width, screenshot checked
//     - [x] The Docker image builds and passes its smoke test → ci: .github/workflows/checks.yml::docker
//   "ci:" is for what this computer cannot prove (Docker absent, another operating system): the job must exist in that workflow
//   file. It counts as done for the build, and the launch waits until that job has passed on GitHub.
//   - [ ] Save recipes — logged-in users can save a recipe
//
// A ticked feature must name a merge commit that exists and is part of the current history, must have at least one
// acceptance criterion, every criterion must be ticked, and each one must point to a test file that exists and
// (when a test name is given) really contains that name, or say how it was checked by hand ("manual:").
// This stops "done" from being a claim: the notes have to match git and the files.
import { spawnSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { basename, join, resolve } from "node:path";

export function checkRoadmap(root) {
  const file = join(root, "ROADMAP.md");
  if (!existsSync(file)) return { items: 0, ticked: 0, problems: [], milestones: [], unaccepted: [] };
  const lines = readFileSync(file, "utf8").split(/\r?\n/);
  const git = (...a) => spawnSync("git", a, { cwd: root, encoding: "utf8" });
  const problems = [];
  let items = 0;
  let ticked = 0;
  const ci = [];
  let current = null; // { title, done, criteria: [] }
  const finish = () => {
    if (!current || !current.done) return;
    ticked++;
    const name = current.title.replace(/\s*\(merged [0-9a-f]+\)\s*$/i, "").slice(0, 60);
    const m = /\(merged ([0-9a-f]{7,40})\)/i.exec(current.title);
    if (!m) problems.push(`"${name}" is ticked but has no "(merged <commit>)" proof`);
    else if (git("cat-file", "-e", `${m[1]}^{commit}`).status !== 0) problems.push(`"${name}" names merge commit ${m[1]}, which does not exist`);
    else if (git("merge-base", "--is-ancestor", m[1], "HEAD").status !== 0) problems.push(`"${name}" names commit ${m[1]}, which is not part of the current history`);
    if (!current.criteria.length) problems.push(`"${name}" is ticked but lists no acceptance criteria`);
    for (const c of current.criteria) {
      const cn = c.text.replace(/\s*(→|->)\s*(test|manual|ci):.*$/i, "").slice(0, 70);
      if (!c.done) {
        problems.push(`"${name}" is ticked but the criterion "${cn}" is not`);
        continue;
      }
      const t = /(?:→|->)\s*test:\s*(.+?)\s*$/i.exec(c.text);
      const man = /(?:→|->)\s*manual:\s*(.{8,})$/i.exec(c.text);
      const job = /(?:→|->)\s*ci:\s*(.+?)::\s*([\w.-]+)\s*$/i.exec(c.text);
      if (job) {
        const rel = job[1].trim();
        const p = resolve(root, rel);
        const text = p.startsWith(resolve(root)) && existsSync(p) ? readFileSync(p, "utf8") : null;
        const jobLine = new RegExp(`^\\s{2}${job[2].replace(/\./g, "\\.")}:\\s*$`, "m");
        if (!/^\.github[\\/]workflows[\\/][^\\/]+\.ya?ml$/i.test(rel)) problems.push(`"${name}": criterion "${cn}" says ci: but ${rel} is not a GitHub workflow file`);
        else if (text === null) problems.push(`"${name}": criterion "${cn}" points to workflow ${rel}, which does not exist`);
        else if (!jobLine.test(text)) problems.push(`"${name}": ${basename(rel)} has no job named "${job[2]}"`);
        else ci.push({ feature: name, criterion: cn, file: rel, job: job[2] });
      } else if (t) {
        const [rel, ...rest] = t[1].split("::");
        const p = resolve(root, rel.trim());
        if (!p.startsWith(resolve(root)) || !existsSync(p)) problems.push(`"${name}": criterion "${cn}" points to test file ${rel.trim()}, which does not exist`);
        else if (rest.length) {
          const testName = rest.join("::").trim().replace(/^["'`]|["'`]$/g, "");
          if (testName && !readFileSync(p, "utf8").includes(testName)) problems.push(`"${name}": ${basename(rel.trim())} has no test named "${testName.slice(0, 50)}"`);
        }
      } else if (!man) problems.push(`"${name}": criterion "${cn}" has no "→ test: <file>::<name>", "→ manual: <how it was checked>" or "→ ci: <workflow>::<job>"`);
    }
  };
  // Milestones group a few features and end with the owner's own acceptance, in their words:
  //   ## Milestone 1 — People can sign in and save recipes
  //   Accepted: pending            (or)   Accepted: yes (2026-11-24) — owner said: "looks good, ship it"
  const milestones = [];
  let ms = null;
  for (const line of lines) {
    const mh = /^##\s+Milestone\s+(\d+)\s*[—–-]\s*(.+)$/i.exec(line);
    if (mh) {
      finish();
      current = null;
      ms = { n: Number(mh[1]), name: mh[2].trim(), features: [], accepted: null };
      milestones.push(ms);
      continue;
    }
    const acc = ms && /^Accepted:\s*(.+)$/i.exec(line.trim());
    if (acc) {
      const v = acc[1].trim();
      if (/^pending/i.test(v)) ms.accepted = "pending";
      else ms.accepted = /^yes\s*\(\d{4}-\d{2}-\d{2}\)\s*[—–-]\s*owner said:\s*["“].{3,}["”]/i.test(v) ? "yes" : "malformed";
      continue;
    }
    const top = /^[-*] \[( |x|X)\] (.+)$/.exec(line);
    const sub = /^\s+[-*] \[( |x|X)\] (.+)$/.exec(line);
    if (top) {
      finish();
      items++;
      current = { title: top[2].trim(), done: top[1] !== " ", criteria: [] };
      if (ms) ms.features.push(current);
    } else if (sub && current) current.criteria.push({ done: sub[1] !== " ", text: sub[2].trim() });
  }
  finish();
  const unaccepted = [];
  for (const m of milestones) {
    const allDone = m.features.length > 0 && m.features.every((f) => f.done);
    if (m.accepted === "yes" && !allDone) problems.push(`Milestone ${m.n} is marked accepted but not all of its features are done`);
    if (m.accepted === "malformed") problems.push(`Milestone ${m.n}: the "Accepted:" line must be "Accepted: pending" or 'Accepted: yes (YYYY-MM-DD) — owner said: "<their own words>"'`);
    if (allDone && m.accepted !== "yes") unaccepted.push({ n: m.n, name: m.name });
  }
  // A milestone whose only open criteria wait for a GitHub job, written as prose ("NOT VERIFIED ... CI job docker"), would wait
  // silently forever (trial 3): say how to write them as `→ ci:` so the feature can be ticked and the milestone accepted.
  const CI_WORDS = /\b(ci|github|workflow|actions?)\b/i;
  const UNPROVABLE = /not verified|no docker|can'?t be (tested|checked|proven) here|after (the first )?(push|upload)|only on github/i;
  const jobs = [];
  const wf = join(root, ".github", "workflows");
  if (existsSync(wf)) {
    for (const f of readdirSync(wf).filter((x) => /\.ya?ml$/i.test(x)).sort()) {
      const text = readFileSync(join(wf, f), "utf8");
      const block = /^jobs:\s*$([\s\S]*)/m.exec(text)?.[1] ?? "";
      for (const j of block.matchAll(/^ {2}([\w.-]+):\s*$/gm)) jobs.push(`.github/workflows/${f}::${j[1]}`);
    }
  }
  const waitingOnCi = [];
  for (const m of milestones) {
    if (m.accepted === "yes") continue;
    const open = m.features.filter((f) => !f.done);
    if (!open.length) continue;
    const pending = open.flatMap((f) => f.criteria.filter((c) => !c.done).map((c) => ({ feature: f.title.replace(/\s*\[[SML]\].*$/, "").slice(0, 60), text: c.text })));
    const onlyCi = open.every((f) => f.criteria.some((c) => !c.done) && /merged/i.test(f.title)) && pending.length && pending.every((c) => CI_WORDS.test(c.text) && UNPROVABLE.test(c.text));
    if (onlyCi) waitingOnCi.push({ milestone: m.n, name: m.name, criteria: pending, jobs });
  }
  return { items, ticked, problems, ci, waitingOnCi, milestones: milestones.map((m) => ({ n: m.n, name: m.name, features: m.features.length, done: m.features.filter((f) => f.done).length, accepted: m.accepted === "yes" })), unaccepted };
}

if (process.argv[1] && basename(process.argv[1]) === "roadmap-check.mjs") {
  const i = process.argv.indexOf("--project");
  const root = resolve(i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : process.cwd());
  const r = checkRoadmap(root);
  for (const w of r.waitingOnCi ?? []) {
    console.log(
      `Milestone ${w.milestone} waits only on criteria that only GitHub can prove (${w.criteria.map((c) => `"${c.text.slice(0, 50)}"`).join(", ")}). ` +
        `Write each as "- [x] <criterion> → ci: <workflow file>::<job>"${w.jobs.length ? ` (jobs here: ${w.jobs.map((j) => `→ ci: ${j}`).join(", ")})` : " (no GitHub workflow yet: add the job first)"}, ` +
        `tick the feature with "(merged <commit>)", and the milestone can be accepted now; the launch waits for those jobs to pass on GitHub.`,
    );
  }
  if (process.argv.includes("--acceptance")) {
    // Is any finished milestone still waiting for the owner's sign-off? Used before a launch.
    if (r.unaccepted.length) {
      console.log(`Waiting for the owner's acceptance: ${r.unaccepted.map((m) => `Milestone ${m.n} (${m.name})`).join("; ")}`);
      process.exitCode = 1;
    } else console.log("No finished milestone is waiting for the owner's acceptance.");
    process.exit(process.exitCode ?? 0);
  }
  if (!r.items) console.log("No ROADMAP.md items to check.");
  else if (!r.problems.length) console.log(`Roadmap OK: ${r.ticked} of ${r.items} items done, each backed by a merge and tests.`);
  else console.log(`Roadmap has ${r.problems.length} unproven claim(s):\n- ${r.problems.join("\n- ")}`);
  if (r.ci.length) console.log(`Proven only on GitHub after a push (the launch waits for these jobs to pass): ${[...new Set(r.ci.map((c) => `${c.file}::${c.job}`))].join(", ")}`);
  process.exitCode = r.problems.length ? 1 : 0;
}
