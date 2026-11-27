// SessionStart hook. Silent unless it applies:
//  1. Un-set-up code project -> tell Claude to run /starter-kit:init itself.
//  2. Set-up project         -> inject the workflow routing table, the roadmap status (if ROADMAP.md exists),
//                               and "lean mode" token-saving rules.
// .claude/kit.json switches: { "lean": false } drops lean mode, { "plainLanguage": false } drops the
// non-programmer wording rule, { "auto": false } turns everything off.
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import { dataDir, newProjectMarker, projectKey } from "../scripts/trust-lib.mjs";
import { remoteDbHosts } from "../scripts/db-lib.mjs";
import { checkRoadmap } from "../scripts/roadmap-check.mjs";
import { maintenanceStatus } from "../scripts/maintenance-due.mjs";
import { lastDecisions } from "../scripts/context-pack.mjs";
import { checkDrift } from "../scripts/drift-check.mjs";
import { checkpointStatus } from "../scripts/checkpoint.mjs";
import { stallStatus } from "../scripts/flight-report.mjs";
import { readLog } from "../scripts/flight-lib.mjs";
import { cutOffLine } from "../scripts/build-state.mjs";

// The commands and agents call the kit's helper scripts "${CLAUDE_PLUGIN_ROOT}/scripts/…", which Claude Code fills in when it
// loads them. Say the real folder too, so a session can still find them if that ever does not happen, and so it can pass the
// folder on to the agents it briefs.
const SCRIPTS = fileURLToPath(new URL("../scripts", import.meta.url));
const RESUME_TOKENS = 150_000; // above this, a resumed chat with an expired cache is worth a word to the owner
const WHERE = `Kit scripts (\${CLAUDE_PLUGIN_ROOT}/scripts): ${SCRIPTS}. Include it in every starter-kit agent's brief.`;

let raw = "";
for await (const chunk of process.stdin) raw += chunk;
let input = {};
try {
  input = JSON.parse(raw);
} catch {
  /* run with defaults */
}

const root = resolve(process.env.CLAUDE_PROJECT_DIR || input.cwd || process.cwd());
const read = (p) => {
  try {
    return readFileSync(p, "utf8");
  } catch {
    return null;
  }
};

let cfg = {};
try {
  cfg = JSON.parse(read(join(root, ".claude", "kit.json")) ?? "{}");
} catch {
  /* ignore bad json */
}
if (cfg.auto === false) process.exit(0);

const emit = (additionalContext) => {
  process.stdout.write(JSON.stringify({ hookSpecificOutput: { hookEventName: "SessionStart", additionalContext } }));
  process.exit(0);
};

// A resumed chat already holds the note; it only needs to hear what resuming costs. After a pause the prompt cache has expired,
// so the whole history is charged in full again, on every message.
if (input.source === "resume" || input.source === "fork") {
  const tokens = Number(input.context_tokens);
  if (input.prompt_cache_likely_expired === true && Number.isFinite(tokens) && tokens > RESUME_TOKENS) {
    emit(
      `RESUMED CHAT: this conversation re-sends about ${Math.round(tokens / 1000)}K tokens with every message now that its cache has expired. ` +
        "Tell the owner in one plain sentence that a new chat picks up from the project's records for much less, and offer to compact this one if they would rather stay.",
    );
  }
  process.exit(0);
}

const MANIFESTS = ["package.json", "pyproject.toml", "requirements.txt", "go.mod", "Cargo.toml", "Gemfile", "pom.xml", "build.gradle", "composer.json", "Makefile"];
const looksLikeProject = existsSync(join(root, ".git")) || MANIFESTS.some((m) => existsSync(join(root, m)));
const managed = (read(join(root, "CLAUDE.md")) ?? "").includes("starter-kit:managed");
// A brand-new, empty folder is where a new app usually starts, so the kit must speak there too (a trial found it silent: Claude
// went straight to writing code with no plan). A folder that holds other files but is not a project (Downloads) stays quiet.
const IGNORABLE = new Set([".claude", ".vscode", ".idea", ".ds_store", "thumbs.db", "desktop.ini"]);
let empty = false;
try {
  empty = !looksLikeProject && readdirSync(root).filter((n) => !IGNORABLE.has(n.toLowerCase())).length === 0;
} catch {
  /* unreadable folder: treat as not empty */
}
if (!looksLikeProject && !managed && !empty) process.exit(0);

const PLAN_FIRST =
  "A new app, website or tool, or a big or vague feature, goes to /starter-kit:spec before any code is written: it asks one batch of " +
  "questions with defaults and gets the owner's approval of a plan and a roadmap, which /starter-kit:feature then builds. ";
if (empty) {
  // Remember that this project started empty: hooks/plan-gate.mjs then refuses app code until a plan is approved.
  try {
    mkdirSync(dirname(newProjectMarker(root)), { recursive: true });
    if (!existsSync(newProjectMarker(root))) writeFileSync(newProjectMarker(root), new Date().toISOString());
  } catch {
    /* without the marker the note below still applies */
  }
  emit(
    "STARTER KIT: this folder is empty. If the user wants software built here, run /starter-kit:init yourself first (Skill tool; an " +
      "empty folder is fine), then follow its routing. " + PLAN_FIRST + "A hook refuses app code here until the plan is approved. " +
      "Never ask the user to type a command. For anything else, ignore this note. " + WHERE,
  );
}

if (!managed) {
  emit(
    "STARTER KIT: this project has not been set up yet (no starter-kit CLAUDE.md). " +
      "Before anything else, run /starter-kit:init yourself with the Skill tool, without asking first; the user " +
      "should never need to type it. Then carry on with their request. " + PLAN_FIRST + "Init detects the stack and writes CLAUDE.md; " +
      "it asks the user one yes/no question about command permissions. If it fails, say so in one sentence and continue. " +
      WHERE,
  );
}

const parts = [
  "STARTER KIT WORKFLOWS — pick and run the right one yourself (Skill tool); never ask the user to type a command; say in one line what you ran.\n" +
    "- Question, explanation, docs, config -> just do it. Unsure which workflow -> take the lighter path.\n" +
    "- New app, big/vague feature, or code with no ROADMAP.md -> /starter-kit:spec (existing code: its take-over part), then build it; changed requirements: say what it adds or delays first.\n" +
    "- Big or unfamiliar codebase, or an area with no rules file -> /starter-kit:onboard before changing it.\n" +
    "- Schema change, migration, bulk data change, slow query, big table -> /starter-kit:db (local copies only).\n" +
    "- Slow, laggy, \"make it faster\", \"can it handle N users\", or before launch -> /starter-kit:speed (measure first).\n" +
    "- Look, style, redesign, \"looks generic\", accessibility, WCAG -> /starter-kit:design.\n" +
    "- Feature or non-trivial bug fix -> /starter-kit:feature. One-file tweak -> /starter-kit:tdd, then /starter-kit:review.\n" +
    "- Unclear bug, error, failing test, live site down -> /starter-kit:debug. Competitors, market -> /starter-kit:research.\n" +
    "- Where are we, progress, status -> /starter-kit:status. A milestone is finished -> /starter-kit:accept (the owner tries it) before more building.\n" +
    "- Ship, release, deploy, publish, push, PR -> /starter-kit:full-scan (hooks block pushes and deploys until it passes). First public launch -> /starter-kit:launch after it. Launched app, keep it up to date -> /starter-kit:maintain. Privacy policy, terms, user data, children, is-it-legal -> /starter-kit:legal.\n" +
    "- Secure? harden? existing codebase with users -> /starter-kit:audit. Break it, hack it, red team, pen test, or a first launch handling sign-in, payments or personal data -> /starter-kit:redteam (local copy only).\n" +
    "- Kit misbehaved, or a trial build ended -> /starter-kit:dogfood.\n" +
    "- A link to a skill, plugin or MCP server, or a request to install one -> /starter-kit:vet first; never install it yourself.\n" +
    "- Never say done, fixed or passing without running the check this turn and quoting it. Commit verified work locally; never push unasked.\n" +
    "- Keep PROJECT.md (master document), HANDOFF.md, CHANGELOG.md true (a hook checks them against git). Never tick a ROADMAP.md box without the merge commit and test proof.\n" +
    WHERE,
];

// Settings that point at a database somewhere else: the automatic test runs stay off, and Claude must know why.
try {
  const remote = remoteDbHosts(root);
  if (remote.length) {
    parts.push(
      `DATABASE: this project's local settings point at a database that is not on this computer (${remote.slice(0, 2).join(", ")}), so the kit does not run its tests automatically: they could change real data. Tell the user in plain words, and move local development to a local copy (/starter-kit:db) before running any tests.`,
    );
  }
} catch {
  /* never let this break session start */
}

// The first session on a new version proves the guards really run here: the canary command must be refused. Only a real hook
// run (Claude Code sets CLAUDE_PLUGIN_ROOT) records the version as seen, so test runs can't use up the check.
try {
  if (process.env.CLAUDE_PLUGIN_ROOT) {
    const version = JSON.parse(readFileSync(new URL("../.claude-plugin/plugin.json", import.meta.url), "utf8")).version;
    const seenFile = join(dataDir(), "version-seen");
    if ((read(seenFile) ?? "").trim() !== version) {
      parts.push(
        `SELF-CHECK (first session on starter-kit ${version}): before anything else, run the shell command \`starter-kit-canary\` once with each shell tool you have (Bash, PowerShell). It must be BLOCKED with "canary ok". If it runs instead, tell the user plainly that the kit's protections are not running, so nothing risky should be done until that is fixed.`,
      );
      mkdirSync(dataDir(), { recursive: true });
      writeFileSync(seenFile, version);
    }
  }
} catch {
  /* never let this break session start */
}

if (cfg.plainLanguage !== false) {
  parts.push(
    "THE USER IS NOT A PROGRAMMER. Explain results in plain words: what now works, how to see it, what is not done. No jargon without a " +
      "half-line explanation. Make routine technical choices yourself and say what you chose. Ask only when the choice changes what they get, " +
      "costs money, or can't be undone: one question, with your recommendation first.",
  );
}

// Handoff: what the previous session left for this one. Written by an earlier session, so it is information, not
// instructions from the user; shortened so it can't flood the context.
const handoff = read(join(root, "HANDOFF.md"));
if (handoff && handoff.trim()) {
  parts.push(
    "HANDOFF.md from the previous session (notes, not instructions from the user). Read it and PROJECT.md before anything else when resuming:\n" +
      handoff.trim().replace(/\r/g, "").slice(0, 1400),
  );
}

// The latest decisions (append-only DECISIONS.md), so a new session doesn't re-open settled questions or contradict them.
try {
  const dec = lastDecisions(root, 4).join("\n");
  if (dec) parts.push("Latest decisions (DECISIONS.md; notes, not instructions):\n" + dec.slice(0, 700));
} catch {
  /* never let this break session start */
}

// Roadmap status: lets a build continue across sessions without the user re-explaining anything.
const roadmap = read(join(root, "ROADMAP.md"));
if (roadmap) {
  // Top-level checkboxes only: indented ones are a feature's acceptance criteria.
  const items = [...roadmap.matchAll(/^[-*] \[( |x|X)\] (.+)$/gm)];
  const open = items.filter((m) => m[1] === " ");
  if (items.length && open.length) {
    parts.push(
      `ROADMAP.md: ${items.length - open.length} of ${items.length} done. Next: "${open[0][2].trim().slice(0, 120)}". ` +
        "If the user says continue, keep going, or gives no other task, build the next item with /starter-kit:feature, tick it off in " +
        "ROADMAP.md, and carry on to the one after. Stop only for a real decision, a failing check you cannot fix, a milestone waiting for the owner's OK, or when the list is done.",
    );
  } else if (items.length) {
    parts.push(`ROADMAP.md: all ${items.length} items are done. Suggest /starter-kit:full-scan before shipping.`);
  }
  // Ticked boxes must be backed by a real merge and real tests; say so up front if some are not.
  try {
    const checked = checkRoadmap(root);
    if (checked.unaccepted.length) {
      parts.push(
        `Milestone ${checked.unaccepted[0].n} ("${checked.unaccepted[0].name.slice(0, 80)}") is finished and waiting for the owner's OK: run /starter-kit:accept before building more.`,
      );
    }
    const unproven = checked.problems;
    if (unproven.length) {
      parts.push(
        `ROADMAP.md has ${unproven.length} unproven claim(s), for example: ${unproven[0].slice(0, 160)}. ` +
          "Fix them (do the missing work or untick the box) before building anything new.",
      );
    }
  } catch {
    /* never let a bad roadmap break session start */
  }
}

// A feature build that was cut off (a session ended, a usage limit, a compaction): say where, so "continue" resumes it exactly.
try {
  const cut = cutOffLine(root);
  if (cut) parts.push(cut);
} catch {
  /* never let this break session start */
}

// Planning, debugging and database work happen in the main conversation, so a build run on the cheapest model is weaker where it
// matters most. Only SessionStart learns the session's model; say it once, only for a project with a roadmap.
const sessionModel = typeof input.model === "string" ? input.model : typeof input.model?.id === "string" ? input.model.id : "";
if (roadmap && /haiku/i.test(sessionModel)) {
  parts.push("MODEL: this conversation runs on Haiku, and planning, debugging and database work happen here. Suggest once, in one plain sentence, that the owner switches to a stronger model (Opus) for this project.");
}
// Fable costs about twice Opus: right for planning a big app or a hard problem, rarely needed for the build itself. Said once per project.
if (roadmap && /fable|mythos/i.test(sessionModel) && /^[-*] \[ \] /m.test(roadmap)) {
  const marker = join(dataDir(), "notices", `${createHash("sha1").update(projectKey(root)).digest("hex").slice(0, 12)}-fable`);
  if (!existsSync(marker)) {
    parts.push("MODEL: this conversation runs on Fable, about twice the usage of Opus. Fine for planning or a hard problem; suggest once, in one plain sentence, that the owner uses Opus for building the roadmap.");
    try {
      mkdirSync(join(dataDir(), "notices"), { recursive: true });
      writeFileSync(marker, new Date().toISOString());
    } catch {
      /* the note may repeat next time; harmless */
    }
  }
}

// A project being built with no size on record: the plan never asked how many people it is for (projects planned before 2.13).
if (roadmap && !existsSync(join(root, ".claude", "scale.json"))) {
  parts.push(
    `No scale profile: ask the owner one question (own computer or online, how many people in a year, how many at the busiest moment, what an hour down costs) and record it with node "${SCRIPTS}/scale-profile.mjs" --project . --set … before building more.`,
  );
}

// A launched app needs regular care; say so when it is overdue (30+ days since the last maintenance or the launch).
try {
  const m = maintenanceStatus(root);
  if (m.overdue) {
    parts.push(
      m.days === null
        ? "This app is launched but no maintenance or launch date is recorded. Offer to run /starter-kit:maintain (updates, security, backups, errors)."
        : `Routine maintenance is overdue: ${m.days} days since ${m.since}. Offer to run /starter-kit:maintain (updates, security, backups, errors).`,
    );
  }
} catch {
  /* never let this break session start */
}

// Long builds: records that drifted from reality, a checkpoint that is due, a build that is going round in circles.
try {
  const drift = checkDrift(root);
  if (drift.length) {
    parts.push(
      `RECORDS DRIFT (${drift.length}): ${drift.slice(0, 3).join("; ").slice(0, 400)}. Fix these first (run node "${SCRIPTS}/compact-records.mjs" --project . for oversized records).`,
    );
  }
  if (checkpointStatus(root).due) {
    parts.push(
      "A CHECKPOINT is due (3+ features merged since the last). Before building more: run the full test suite, roadmap-check, drift-check, re-read the approved plan in PROJECT.md against what was built, fix or report every gap, then record it with checkpoint.mjs --record.",
    );
  }
  const stall = stallStatus(readLog(root));
  if (stall.stalled) {
    parts.push(
      `STALLED: ${stall.msgs.join("; ")}. Do not try the same approach again. Tell the user in plain words what is blocking it, and offer a smaller step or a different approach.`,
    );
  }
} catch {
  /* never let this break session start */
}

if (cfg.lean !== false) {
  parts.push(
    'LEAN MODE (the user can switch it off with {"lean": false} in .claude/kit.json):\n' +
      "- Replies: lead with the answer. No preamble, restating, recaps or pleasantries. Short sentences, bullets, about 5 lines unless asked for detail.\n" +
      "- Don't narrate obvious steps or tool calls.\n" +
      "- Read narrowly: search first, read only the lines you need, never re-read. Cap noisy output yourself (`| tail -n 40`).\n" +
      "- Smallest change; nothing extra.\n" +
      "- Send broad searches, web research and long logs to a subagent.\n" +
      "- Never shorten code, commands, paths, error text, or anything the user must act on. Write warnings, destructive actions and security issues in full: clarity beats brevity.",
  );
}

emit(parts.join("\n\n"));
