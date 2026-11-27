// The security checks for this project: the kit's own (always, nothing to install) plus extra free tools already on this computer.
//   node sec-tools.mjs --project <dir> [--url http://localhost:3000] [--json]
// The first line is always the kit's own checks (sec-builtin.mjs). Extra tools are used only when they happen to be installed: a
// missing one is never shown or suggested (nothing to set up). It runs nothing but `<tool> --version` and installs nothing.
// Kinds of line:
//   RUN     a check on the project's files, run by the pre-ship scan and the audit
//   LIVE    the kit's own checks against the RUNNING LOCAL copy of the app (red team, launch readiness); never a live site
//   ONE OF  two installed tools do the same job: the first is used
// Only four kinds of extra tool are kept, each finding what the built-in checks cannot (2.18.0 listed sixteen; the rest repeated
// the built-in checks, needed Docker or an account, or had never been run here):
//   zizmor             deeper GitHub Actions analysis (template injection through every context, cache poisoning, and more)
//   hadolint           Dockerfile best practice, and the shell inside RUN steps (through ShellCheck)
//   trivy              infrastructure files (Kubernetes, Terraform, Helm) and known flaws inside container images
//   opengrep, semgrep  risky patterns in the project's own code, from a large rule set (open-source engines, code never uploaded)
// Flags differ between tool versions: if one is refused, run the tool with --help and use its own offline option.
import { spawnSync } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const BUILTIN = join(dirname(fileURLToPath(import.meta.url)), "sec-builtin.mjs");

const CODE_EXT = /\.(m?[jt]sx?|cjs|py|go|rb|php|java|kt|cs|rs|swift|scala|vue|svelte)$/i;
const SKIP = new Set(["node_modules", ".git", ".venv", "venv", "dist", "build", "target", "vendor", ".next", ".claude"]);
const DOCKERFILE = /(^|\/)(Dockerfile|Containerfile)(\.[\w-]+)?$/i;
const WORKFLOW = /^\.github\/workflows\/[^/]+\.ya?ml$/i;
const INFRA = /(^|\/)(Dockerfile|Containerfile|(docker-)?compose\.ya?ml)$|\.tf$|(^|\/)(k8s|kubernetes|helm|charts)\//i;

function walk(root, limit = 4000) {
  const files = [];
  const queue = [root];
  while (queue.length && files.length < limit) {
    const dir = queue.shift();
    let entries = [];
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const e of entries) {
      if (e.isDirectory()) {
        if (!SKIP.has(e.name)) queue.push(join(dir, e.name));
      } else files.push(join(dir, e.name).slice(root.length + 1).replace(/\\/g, "/"));
    }
  }
  return files;
}

export function installed(tool) {
  // On Windows the tools are often .cmd shims, which need a shell; the name is one of our own constants, never project text.
  const r = process.platform === "win32"
    ? spawnSync(`${tool} --version`, { encoding: "utf8", timeout: 15000, shell: true, windowsHide: true })
    : spawnSync(tool, ["--version"], { encoding: "utf8", timeout: 15000 });
  return r.status === 0 ? (r.stdout || r.stderr).trim().split("\n")[0].slice(0, 60) : null;
}

const has = (re) => (f) => f.some((p) => re.test(p));
const q = (p) => `"${p}"`;

// kind: run | live | use. group: tools that do the same job (only the first installed one is used). probe: the program to look for.
export const TOOLS = [
  { tool: "zizmor", kind: "run", what: "security holes in the GitHub Actions workflows", get: "https://docs.zizmor.sh/installation/",
    applies: has(WORKFLOW), cmd: () => "zizmor --offline .github/workflows" },
  { tool: "hadolint", kind: "run", what: "mistakes in the Dockerfile(s)", get: "https://github.com/hadolint/hadolint/releases (one program)",
    applies: has(DOCKERFILE), cmd: (f) => `hadolint ${f.filter((p) => DOCKERFILE.test(p)).slice(0, 10).map(q).join(" ")}` },
  { tool: "trivy", kind: "run", what: "known flaws and unsafe settings in Docker, Compose, Kubernetes and Terraform files", get: "https://trivy.dev/latest/getting-started/installation/ (first run downloads its database)",
    applies: has(INFRA), cmd: () => "trivy fs --scanners vuln,misconfig --skip-version-check ." },
  { tool: "opengrep", kind: "run", group: "code", what: "risky code patterns in the project's own code (open-source Semgrep fork, same rules)", get: "https://github.com/opengrep/opengrep (LGPL-2.1, one program)",
    applies: has(CODE_EXT), cmd: () => "opengrep scan --config p/default --error ." },
  { tool: "semgrep", kind: "run", group: "code", what: "risky code patterns in the project's own code", get: "pip install semgrep (the free command-line tool needs no account)",
    applies: has(CODE_EXT), cmd: () => "semgrep scan --metrics=off --config p/default --error ." },
];

export function plan(root, { url = "http://localhost:3000", probe = installed } = {}) {
  const files = walk(root);
  const rows = TOOLS.filter((t) => t.applies(files)).map((t) => {
    const version = probe(t.tool);
    return { tool: t.label ?? t.tool, kind: t.kind, group: t.group ?? null, what: t.what, installed: Boolean(version), version, command: t.cmd ? t.cmd(files, url) : null, fix: t.fix ?? null, get: t.get };
  });
  // Only one tool per job: the first installed one in the group, or the first listed when none is.
  const chosen = new Map();
  for (const r of rows) if (r.group && !chosen.has(r.group) && r.installed) chosen.set(r.group, r.tool);
  for (const r of rows) if (r.group && !chosen.has(r.group)) chosen.set(r.group, r.tool);
  return rows.map((r) => ({ ...r, spare: Boolean(r.group && chosen.get(r.group) !== r.tool) }));
}

export function render(rows, { url } = {}) {
  const lines = [`${url ? "LIVE" : "RUN"} built-in: node "${BUILTIN}" --project .${url ? ` --url ${url}` : ""}    (the kit's own checks: dependencies against OSV.dev, CI workflows, Dockerfiles, Compose${url ? ", the running local copy" : ""}; nothing to install)`];
  for (const r of rows) {
    if (!r.installed) continue; // nothing to set up: a tool that isn't here is simply not used
    if (r.spare) lines.push(`ONE OF ${r.tool}: does the same job as ${rows.find((x) => x.group === r.group && !x.spare).tool} (also installed, not needed)`);
    else lines.push(`RUN ${r.tool}: ${r.command}    (${r.what})${r.fix ? `; to fix: ${r.fix}` : ""}`);
  }
  if (lines.length > 1) lines.push("Extra tools are used because they are already on this computer. A command that fails because of a flag: run the tool with --help and use its own offline option.");
  lines.push("Never install a tool and never suggest installing one: the kit needs nothing set up.");
  return lines.join("\n");
}

if (process.argv[1] && basename(process.argv[1]) === "sec-tools.mjs") {
  const arg = (k) => {
    const i = process.argv.indexOf(k);
    return i >= 0 ? process.argv[i + 1] : undefined;
  };
  const root = resolve(arg("--project") || process.cwd());
  if (!existsSync(root)) {
    console.error("Folder not found.");
    process.exit(1);
  }
  const url = arg("--url") || "http://localhost:3000";
  if (!/^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?(\/|$)/.test(url)) {
    console.error("--url must be this computer's running copy (localhost or 127.0.0.1): live checks never touch a real site.");
    process.exit(1);
  }
  const rows = plan(root, { url });
  console.log(process.argv.includes("--json") ? JSON.stringify(rows, null, 2) : render(rows, { url: arg("--url") }));
}
