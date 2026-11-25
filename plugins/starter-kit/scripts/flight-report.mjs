// Reads the flight recorder log and says, in plain words, what the kit actually did in a session and where the
// workflow looks wrong. Run: node flight-report.mjs --project <dir> [--all]   (default: the latest session only)
// Reads only the local log written by hooks/flight-recorder.mjs; runs nothing and sends nothing anywhere.
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { readLog } from "./flight-lib.mjs";

const short = (s) => String(s ?? "").replace(/^starter-kit:/, "");

export function analyze(events) {
  const tries = new Map();
  const unfinished = [];
  const skills = [];
  const agents = {};
  let edits = 0;
  let stops = 0;
  let starts = 0;
  for (const e of events) {
    if (e.ev === "start") starts++;
    else if (e.ev === "stop") stops++;
    else if (e.ev === "try") {
      const key = e.id || `${e.tool}#${tries.size}-${e.t}`;
      tries.set(key, e);
      if (e.tool === "Skill" && e.skill) skills.push(short(e.skill));
      if ((e.tool === "Agent" || e.tool === "Task") && e.agent) agents[short(e.agent)] = (agents[short(e.agent)] ?? 0) + 1;
    } else if (e.ev === "ok") {
      if (e.id && tries.has(e.id)) tries.delete(e.id);
      else {
        // no id to pair on: match the oldest attempt of the same tool
        const k = [...tries.keys()].find((x) => tries.get(x).tool === e.tool);
        if (k) tries.delete(k);
      }
      if (["Edit", "Write", "MultiEdit"].includes(e.tool)) edits++;
    }
  }
  const models = modelUse(events);
  for (const t of tries.values()) unfinished.push(t.tool === "Skill" ? `Skill ${short(t.skill)}` : t.tool === "Bash" ? `Bash (${t.prog || "?"})` : t.tool === "Agent" ? `Agent ${short(t.agent)}` : t.tool);
  const flow = skills.filter((s, i) => s !== skills[i - 1]);
  const notes = [];
  const ran = (n) => skills.includes(n);
  if (edits > 0 && !ran("feature") && !ran("tdd") && !ran("debug")) notes.push(`Code was edited ${edits} time(s) without the feature, tdd or debug workflow running.`);
  if (ran("feature") && !agents.implementer) notes.push("The feature workflow ran but the implementer agent never started.");
  if (ran("feature") && !agents.reviewer) notes.push("The feature workflow ran but the reviewer agent never started.");
  if (ran("feature") && !agents.challenger) notes.push("The feature workflow ran but the challenger agent never started.");
  if (ran("feature") && !ran("accept") && stops > 0 && (flow.filter((s) => s === "feature").length >= 3)) notes.push("Several features were built and no milestone acceptance was run.");
  if (ran("spec") && !agents.researcher) notes.push("The plan was written but no researcher agent ran (no competitor research).");
  if (unfinished.length) notes.push(`${unfinished.length} action(s) started but never finished (blocked by a guard, refused, or failed): ${[...new Set(unfinished)].slice(0, 8).join(", ")}.`);
  return { starts, stops, edits, flow, agents, unfinished, notes, models, events: events.length };
}

// Which models the agents asked for and ran on, the tokens per model, and review rounds per build (reviewer launches after each
// builder launch: follow-up rounds reuse the same builder, so a new builder launch starts a new count). The numbers a trial needs
// to judge the kit's model choices (plan task M-14).
export function modelUse(events) {
  const asked = {};
  const tokens = {};
  const rounds = [];
  const scout = { runs: 0, ok: 0, bad: 0 };
  const misses = [];
  for (const e of events) {
    const isAgent = e.tool === "Agent" || e.tool === "Task";
    if (e.ev === "try" && isAgent && e.agent) {
      const a = short(e.agent);
      asked[a] ??= {};
      asked[a][e.ask || "default"] = (asked[a][e.ask || "default"] ?? 0) + 1;
      if (a === "implementer") rounds.push(0);
      else if (a === "reviewer" && rounds.length) rounds[rounds.length - 1]++;
    }
    if (e.ev === "ok" && isAgent && e.ran && Number(e.tok) > 0) tokens[e.ran] = (tokens[e.ran] ?? 0) + Number(e.tok);
    if (e.ev === "ok" && isAgent && e.miss !== undefined) misses.push(Number(e.miss));
    if (e.ev === "scout") {
      scout.runs++;
      scout.ok += Number(e.ok) || 0;
      scout.bad += Number(e.bad) || 0;
    }
  }
  return { asked, tokens, rounds, scout, misses };
}

// A build is stalled when the same roadmap item has been "next" at the start of `sessions` sessions in a row, or when one
// session keeps relaunching the builder (review rounds that never converge).
export function stallStatus(events, sessions = 3, relaunches = 4) {
  const starts = events.filter((e) => e.ev === "start" && e.sid);
  const bySid = [];
  for (const s of starts) if (!bySid.some((x) => x.sid === s.sid)) bySid.push(s);
  const recent = bySid.slice(-sessions);
  const stuck = recent.length === sessions && recent[0].item && recent.every((s) => s.item === recent[0].item);
  const lastSid = bySid.length ? bySid[bySid.length - 1].sid : null;
  const builds = events.filter((e) => e.sid === lastSid && e.ev === "try" && short(e.agent) === "implementer").length;
  const msgs = [];
  if (stuck) msgs.push(`The same roadmap item has been next for ${sessions} sessions in a row`);
  if (builds >= relaunches) msgs.push(`The builder was launched ${builds} times in the latest session (review rounds are not converging)`);
  return { stalled: msgs.length > 0, msgs };
}

export function report(events, { all = false } = {}) {
  let use = events;
  if (!all) {
    const lastSid = [...events].reverse().find((e) => e.sid)?.sid;
    if (lastSid) use = events.filter((e) => e.sid === lastSid);
  }
  if (!use.length) return "Nothing recorded yet for this project. The recorder writes as the kit's hooks run.";
  const a = analyze(use);
  const lines = [
    `Events: ${a.events}; sessions started: ${a.starts}; turns finished: ${a.stops}; code files changed: ${a.edits}`,
    `Workflows run, in order: ${a.flow.length ? a.flow.join(" -> ") : "none"}`,
    `Agents launched: ${Object.keys(a.agents).length ? Object.entries(a.agents).map(([k, v]) => `${k} x${v}`).join(", ") : "none"}`,
  ];
  const m = a.models;
  const fmt = (o) => Object.entries(o).map(([k, v]) => `${k} ${v}`).join(", ");
  if (Object.keys(m.asked).length) lines.push(`Models asked for: ${Object.entries(m.asked).map(([k, v]) => `${k} (${fmt(v)})`).join("; ")}`);
  if (Object.keys(m.tokens).length) lines.push(`Agent tokens by model: ${Object.entries(m.tokens).map(([k, v]) => `${k} ${v.toLocaleString("en-US")}`).join(", ")}`);
  if (m.rounds.length) lines.push(`Review rounds per build: ${m.rounds.join(", ")}`);
  if (m.scout.runs) lines.push(`Scout: ${m.scout.runs} run(s); pointers checked ${m.scout.ok} good, ${m.scout.bad} wrong`);
  if (m.misses.length) lines.push(`Files builders had to find for themselves: ${m.misses.join(", ")}`);
  const st = stallStatus(events);
  if (st.stalled) a.notes.push(...st.msgs.map((m) => m + "."));
  lines.push(a.notes.length ? "Look at:\n" + a.notes.map((n) => `- ${n}`).join("\n") : "Nothing looks off.");
  return lines.join("\n");
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  const args = process.argv.slice(2);
  const i = args.indexOf("--project");
  const root = resolve(i >= 0 ? args[i + 1] : ".");
  console.log(report(readLog(root), { all: args.includes("--all") }));
}
