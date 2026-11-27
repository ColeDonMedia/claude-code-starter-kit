// Decides which model, and how much effort, each starter-kit agent gets, from facts the project already records: the roadmap
// item's size and risk tags, how much of the codebase depends on the code involved, how many review rounds have failed, the
// project's rigor, and this computer's plan. It is the ONE place that decides (the MODEL RULE in the repo's CLAUDE.md): agent files
// carry its starting models (a test compares them), and hooks/agent-route.mjs enforces its minimums. It never picks Fable.
// Run: node model-route.mjs --project <dir> --role <agent> [--feature "<text>"] [--attempt <n>] [--builder haiku|sonnet|opus]
//        [--mode plan|range|full|launch|emergency|recheck] [--json]
// recheck: a reviewer looking again after a fix, at its own earlier findings and the changed lines only. That runs on Sonnet
// (the security reviewer keeps its Opus floor), because trial 3 spent most of its Opus tokens on re-checks.
//      node model-route.mjs --set-ceiling sonnet|none     (this computer's plan has no Opus; stored outside every project)
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { dependents, findSymbol, listFiles, loadIndex } from "./code-index.mjs";
import { dataDir, isTrusted } from "./trust-lib.mjs";

const ORDER = ["haiku", "sonnet", "opus", "fable"];
export const rank = (m) => ORDER.indexOf(m);
const atLeast = (m, floor) => (rank(m) >= rank(floor) ? m : floor);

// The lowest model each role may ever run on (before a plan's ceiling). Unknown roles have no minimum.
export const FLOOR = { scout: "haiku", researcher: "haiku", conductor: "sonnet", implementer: "sonnet", reviewer: "sonnet", challenger: "sonnet", "ui-reviewer": "sonnet", investigator: "sonnet", "red-team": "sonnet", "user-tester": "sonnet", "security-reviewer": "opus" };
export const EFFORT = { scout: "low", researcher: "medium" }; // every other role: high
export const RIGORS = ["prototype", "product", "critical"];
export const REACH = 10; // a file with this many dependents makes a change far-reaching
export const SCOUT_FILES = 150; // above this many source files, a scout's pointers beat searching from scratch
// Areas where a mistake costs real money, data or trust (the same list as feature.md step 2).
const RISKY = /\b(sign[- ]?in|sign[- ]?up|log[- ]?in|auth\w*|sessions?|passwords?|permissions?|roles?|admin|payments?|billing|checkout|subscriptions?|stripe|square|paypal|invoices?|refunds?|uploads?|migrations?|database rules?|row[- ]level|secrets?|api keys?|access tokens?|environment (settings|variables)|cors|personal data|privacy|gdpr|children)\b/i;

// The decision itself: a pure function of the facts, so it can be tested case by case.
export function route(f) {
  const role = f.role;
  if (!(role in FLOOR)) throw new Error(`unknown role "${role}"; roles: ${Object.keys(FLOOR).join(", ")}`);
  const rigor = RIGORS.includes(f.rigor) ? f.rigor : "product";
  const size = ["S", "M", "L"].includes(f.size) ? f.size : "M";
  const attempt = Math.max(1, Math.floor(Number(f.attempt)) || 1);
  const reasons = [];
  const when = (cond, text) => (cond ? (reasons.push(text), true) : false);
  const any = (list) => list.some(Boolean); // evaluates every entry, so every reason that applies is listed
  const risk = f.risk ? `risky area${f.riskWhy ? `: ${f.riskWhy}` : ""}` : "";
  let model;
  const recheck = f.mode === "recheck" && ["reviewer", "challenger", "red-team", "ui-reviewer"].includes(role) && rigor !== "critical";
  switch (recheck ? "recheck" : role) {
    case "recheck":
      model = (when(true, "re-check of a fix: only its own earlier findings and the changed lines"), "sonnet");
      break;
    case "scout":
    case "researcher":
      model = "haiku";
      break;
    case "implementer":
      if (rigor === "critical") model = when(true, "critical project") && "opus";
      else {
        const triggers = rigor === "prototype"
          ? [when(size === "L", "large feature"), when(f.risk, risk), when(attempt >= 3, "third attempt after two failed reviews")]
          : [when(size !== "S", f.size ? `${size === "L" ? "large" : "medium"} feature` : "no size tag, so treated as medium"), when(f.risk, risk), when(f.reach, f.reachWhy || "far-reaching change"), when(attempt >= 3, "third attempt after two failed reviews")];
        model = any(triggers) ? "opus" : (when(true, "small, contained feature"), "sonnet");
      }
      break;
    case "reviewer":
      if (rigor === "prototype") model = when(f.risk, risk) ? "opus" : (when(true, "prototype: reviewed on the builder's model"), f.builder && rank(f.builder) >= 0 ? f.builder : "sonnet");
      else model = when(true, rigor === "critical" ? "critical project" : "reviews run on the stronger model") && "opus";
      break;
    case "challenger":
      model = rigor === "critical"
        ? when(true, "critical project") && "opus"
        : any([when(f.mode === "plan", "checking the plan"), when(size === "L" && Boolean(f.size), "large feature"), when(attempt >= 3, "third attempt after two failed reviews")]) ? "opus" : (when(true, f.risk ? "the security reviewer covers the risky area; the challenger checks the evidence" : "checks the evidence"), "sonnet");
      break;
    case "conductor": // it runs the workflow and judges the reports; the builder and reviewers get their own models
      model = any([when(rigor === "critical", "critical project"), when(size === "L" && Boolean(f.size), "large feature"), when(f.risk, risk)]) ? "opus" : (when(true, "runs the workflow; the agents it starts get their own models"), "sonnet");
      break;
    case "investigator":
      model = any([when(rigor === "critical", "critical project"), when(f.mode === "emergency", "live emergency"), when(attempt >= 2, "a first hypothesis failed"), when(f.risk, risk)]) ? "opus" : "sonnet";
      break;
    case "red-team":
      model = rigor === "prototype" ? (when(true, "prototype"), "sonnet") : when(true, "attacks need the stronger model") && "opus";
      break;
    case "user-tester": // follows the plan's own words through the app; judging taste and attacks belong to other agents
      model = rigor === "critical" ? when(true, "critical project") && "opus" : (when(true, "walks the plan's steps as an ordinary user"), "sonnet");
      break;
    case "security-reviewer":
      model = when(true, "security reviews always run on the stronger model") && "opus";
      break;
    default:
      model = "sonnet";
  }
  // Never weaker than the builder whose work it checks, and never below the role's floor.
  if (role === "reviewer" && !recheck && f.builder && rank(f.builder) > rank(model) && rank(f.builder) <= rank("opus")) {
    model = f.builder;
    reasons.push(`never weaker than the builder (${f.builder})`);
  }
  model = atLeast(model, FLOOR[role]);
  if (rank(model) > rank("opus")) model = "opus"; // the kit never picks Fable by itself (D12: Claude's choice, open for the owner)
  // A plan without the stronger model caps everything, and says so when a review drops below its floor.
  if (f.ceiling && rank(f.ceiling) >= 0 && rank(model) > rank(f.ceiling)) {
    const below = rank(FLOOR[role]) > rank(f.ceiling);
    reasons.push(`capped at ${f.ceiling}: this computer's plan has no ${model}${below ? "; say so at the top of the report" : ""}`);
    model = f.ceiling;
  }
  return { role, model, effort: EFFORT[role] ?? "high", reasons };
}

// The starting model of each role: what its agent file says, and what an agent launched without a model runs on.
export const baseline = (role) => route({ role, size: "S" });

// The least a launch may name for this role on this computer (used by hooks/agent-route.mjs). Null for roles the kit doesn't know.
export function minimum(role, ceiling = null) {
  const floor = FLOOR[role];
  if (!floor) return null;
  return ceiling && rank(ceiling) >= 0 && rank(floor) > rank(ceiling) ? ceiling : floor;
}

// Whether a scout (a Haiku agent that finds the right files) is worth its launch: only in a big codebase, or when the project's own
// records point nowhere. In a small project the code index and the context pack already do this for free.
export function scoutDecision(f) {
  if (f.scoutOff) return { use: false, reasons: ["switched off in .claude/kit.json"] };
  if (f.large) return { use: true, reasons: ["CLAUDE.md says Size: large"] };
  if (f.sourceFiles > SCOUT_FILES) return { use: true, reasons: [`${f.sourceFiles} source files`] };
  if (f.packEmpty && f.sourceFiles >= 40) return { use: true, reasons: ["the project's records point at no code for this"] };
  return { use: false, reasons: [`${f.sourceFiles ?? 0} source files: the code index and the context pack are enough`] };
}

// ---- this computer's plan: a ceiling, stored outside every project so no project file can set it ----
const ceilingFile = () => join(dataDir(), "model-ceiling.json");
export function getCeiling() {
  try {
    const c = JSON.parse(readFileSync(ceilingFile(), "utf8")).ceiling;
    return c === "sonnet" ? c : null;
  } catch {
    return null;
  }
}
export function setCeiling(value) {
  if (value === "none") return rmSync(ceilingFile(), { force: true });
  if (value !== "sonnet") throw new Error('the ceiling can only be "sonnet" (this plan has no Opus) or "none"');
  mkdirSync(dataDir(), { recursive: true });
  writeFileSync(ceilingFile(), JSON.stringify({ ceiling: value, set: new Date().toISOString().slice(0, 10) }));
}

// ---- facts from the project's own files ----
const STOP = new Set("the a an and or to of for in on with is are be it its that this user users can add make new page screen feature".split(" "));
const words = (s) => [...new Set((s.toLowerCase().match(/[a-z][a-z0-9]{2,}/g) ?? []).filter((w) => !STOP.has(w)))];
const read = (p) => (existsSync(p) ? readFileSync(p, "utf8").replace(/\r/g, "") : "");

// The roadmap item that best matches the feature's words, with its indented criteria.
export function roadmapItem(root, feature) {
  const kw = words(feature);
  if (!kw.length) return null;
  const lines = read(join(root, "ROADMAP.md")).split("\n");
  let best = -1;
  let score = 0;
  lines.forEach((l, i) => {
    if (!/^[-*] \[[ xX]\] /.test(l)) return;
    const s = words(l).filter((w) => kw.includes(w)).length;
    if (s > score) [best, score] = [i, s];
  });
  if (best < 0 || score < Math.min(2, kw.length)) return null;
  const block = [lines[best]];
  for (let i = best + 1; i < lines.length && /^\s+\S/.test(lines[i]); i++) block.push(lines[i]);
  return { line: lines[best], block: block.join("\n") };
}

export function projectFacts(root, { role = "", feature = "" } = {}) {
  let kit = {};
  try {
    kit = JSON.parse(read(join(root, ".claude", "kit.json")) || "{}");
  } catch {
    /* unreadable: defaults */
  }
  const facts = { ceiling: getCeiling(), notes: [] };
  facts.rigor = RIGORS.includes(kit.rigor) ? kit.rigor : "product";
  // A project file may make the kit more careful, never less: "prototype" lowers review strength, so it needs the owner's approval.
  if (facts.rigor === "prototype" && !isTrusted(root, "rigor:prototype")) {
    facts.rigor = "product";
    facts.notes.push("prototype rigor is not approved on this computer, so reviews stay at product strength");
  }
  facts.large = /^\s*[-*]?\s*Size:\s*large\b/im.test(read(join(root, "CLAUDE.md")));
  facts.scoutOff = kit.scout === false;
  const item = roadmapItem(root, feature);
  facts.size = /\[(S|M|L)\]/.exec(feature)?.[1] ?? /\[(S|M|L)\]/.exec(item?.line ?? "")?.[1] ?? null;
  const area = RISKY.exec(`${feature}\n${item?.line ?? ""}`);
  facts.risk = /\bhigh-risk\b/i.test(`${feature}\n${item?.block ?? ""}`) || Boolean(area);
  facts.riskWhy = area ? area[0].toLowerCase() : facts.risk ? "tagged high-risk" : "";
  // Reach and project size need the code index: only worth loading for the roles that use them.
  if (role === "implementer" || role === "scout") {
    const index = loadIndex(root);
    const hits = new Map();
    if (index) {
      facts.sourceFiles = Object.keys(index.files ?? {}).length;
      for (const w of words(feature).filter((x) => x.length >= 4)) for (const h of findSymbol(index, w, 10)) hits.set(h.file, h);
      const rev = dependents(index);
      const far = [...hits.keys()].map((f) => [f, rev.get(f)?.size ?? 0]).sort((a, b) => b[1] - a[1])[0];
      if (far && far[1] >= REACH) [facts.reach, facts.reachWhy] = [true, `touches ${far[0]}, which ${far[1]} files depend on`];
    } else {
      try {
        facts.sourceFiles = listFiles(root).length;
      } catch {
        facts.sourceFiles = 0;
      }
    }
    const mapLines = read(join(root, "PROJECT.md")).split("\n").filter((l) => /^[-*] /.test(l) && words(l).some((w) => words(feature).includes(w)));
    facts.packEmpty = !item && !hits.size && !mapLines.length;
  }
  return facts;
}

function main(argv) {
  const get = (k) => (argv.includes(k) ? argv[argv.indexOf(k) + 1] : undefined);
  if (argv.includes("--set-ceiling")) {
    setCeiling(get("--set-ceiling"));
    const c = getCeiling();
    console.log(c ? `Ceiling set: on this computer every kit agent runs on ${c} at most. Remove it with --set-ceiling none.` : "Ceiling removed.");
    return;
  }
  const root = resolve(get("--project") ?? ".");
  const role = get("--role");
  const feature = get("--feature") ?? "";
  const facts = { ...projectFacts(root, { role, feature }), role, attempt: get("--attempt"), mode: get("--mode"), builder: get("--builder") };
  const r = route(facts);
  const scout = role === "scout" ? scoutDecision(facts) : null;
  const reasons = [...(scout ? scout.reasons : r.reasons), ...facts.notes];
  if (argv.includes("--json")) return console.log(JSON.stringify({ ...r, ...(scout ? { use: scout.use } : {}), reasons }));
  if (scout && !scout.use) return console.log(`SCOUT SKIP — ${reasons.join("; ")}`);
  console.log(`${scout ? "SCOUT USE " : ""}MODEL ${r.model} EFFORT ${r.effort} — ${reasons.join("; ")}`);
  if (r.model === "opus") {
    console.log(`If the launch fails because this plan has no Opus: launch it on sonnet, tell the owner in one plain sentence that this ${role} runs on a weaker model, and run: node "${fileURLToPath(import.meta.url)}" --set-ceiling sonnet`);
  }
}

if (process.argv[1] && resolve(process.argv[1]).toLowerCase() === resolve(fileURLToPath(import.meta.url)).toLowerCase()) {
  try {
    main(process.argv.slice(2));
  } catch (e) {
    console.error(String(e?.message ?? e));
    process.exitCode = 1;
  }
}
