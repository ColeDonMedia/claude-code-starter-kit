// Roadmap truth check: is every ticked box backed by real work?
//   node roadmap-check.mjs --project <folder>     prints problems; exit 1 if there are any
//
// ROADMAP.md format the kit writes:
//   - [x] Sign in — people can create an account and sign in (merged a1b2c3d)
//     - [x] A visitor can sign up with email and password → test: test/auth.test.js::signs up a visitor
//     - [x] The login page looks right on a phone → manual: opened it at 375px width, screenshot checked
//   - [ ] Save recipes — logged-in users can save a recipe
//
// A ticked feature must name a merge commit that exists and is part of the current history, must have at least one
// acceptance criterion, every criterion must be ticked, and each one must point to a test file that exists and
// (when a test name is given) really contains that name, or say how it was checked by hand ("manual:").
// This stops "done" from being a claim: the notes have to match git and the files.
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { basename, join, resolve } from "node:path";

export function checkRoadmap(root) {
  const file = join(root, "ROADMAP.md");
  if (!existsSync(file)) return { items: 0, ticked: 0, problems: [] };
  const lines = readFileSync(file, "utf8").split(/\r?\n/);
  const git = (...a) => spawnSync("git", a, { cwd: root, encoding: "utf8" });
  const problems = [];
  let items = 0;
  let ticked = 0;
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
      const cn = c.text.replace(/\s*(→|->)\s*(test|manual):.*$/i, "").slice(0, 70);
      if (!c.done) {
        problems.push(`"${name}" is ticked but the criterion "${cn}" is not`);
        continue;
      }
      const t = /(?:→|->)\s*test:\s*(.+?)\s*$/i.exec(c.text);
      const man = /(?:→|->)\s*manual:\s*(.{8,})$/i.exec(c.text);
      if (t) {
        const [rel, ...rest] = t[1].split("::");
        const p = resolve(root, rel.trim());
        if (!p.startsWith(resolve(root)) || !existsSync(p)) problems.push(`"${name}": criterion "${cn}" points to test file ${rel.trim()}, which does not exist`);
        else if (rest.length) {
          const testName = rest.join("::").trim().replace(/^["'`]|["'`]$/g, "");
          if (testName && !readFileSync(p, "utf8").includes(testName)) problems.push(`"${name}": ${basename(rel.trim())} has no test named "${testName.slice(0, 50)}"`);
        }
      } else if (!man) problems.push(`"${name}": criterion "${cn}" has no "→ test: <file>::<name>" or "→ manual: <how it was checked>"`);
    }
  };
  for (const line of lines) {
    const top = /^[-*] \[( |x|X)\] (.+)$/.exec(line);
    const sub = /^\s+[-*] \[( |x|X)\] (.+)$/.exec(line);
    if (top) {
      finish();
      items++;
      current = { title: top[2].trim(), done: top[1] !== " ", criteria: [] };
    } else if (sub && current) current.criteria.push({ done: sub[1] !== " ", text: sub[2].trim() });
  }
  finish();
  return { items, ticked, problems };
}

if (process.argv[1] && basename(process.argv[1]) === "roadmap-check.mjs") {
  const i = process.argv.indexOf("--project");
  const root = resolve(i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : process.cwd());
  const r = checkRoadmap(root);
  if (!r.items) console.log("No ROADMAP.md items to check.");
  else if (!r.problems.length) console.log(`Roadmap OK: ${r.ticked} of ${r.items} items done, each backed by a merge and tests.`);
  else console.log(`Roadmap has ${r.problems.length} unproven claim(s):\n- ${r.problems.join("\n- ")}`);
  process.exitCode = r.problems.length ? 1 : 0;
}
