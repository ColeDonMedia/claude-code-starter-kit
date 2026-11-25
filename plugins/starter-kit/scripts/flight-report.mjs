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
  return { starts, stops, edits, flow, agents, unfinished, notes, events: events.length };
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
  lines.push(a.notes.length ? "Look at:\n" + a.notes.map((n) => `- ${n}`).join("\n") : "Nothing looks off.");
  return lines.join("\n");
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  const args = process.argv.slice(2);
  const i = args.indexOf("--project");
  const root = resolve(i >= 0 ? args[i + 1] : ".");
  console.log(report(readLog(root), { all: args.includes("--all") }));
}
